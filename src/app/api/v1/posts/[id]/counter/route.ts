import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { checkDbRateLimit, createPost, getPost, isStoreError, recordInteraction } from '@/lib/db/store';
import { assertSameOrigin, getOrCreateSessionUser } from '@/lib/session';
import { runGate0Moderation } from '@/lib/moderation/gate0';
import { getClientIp, rateLimiter } from '@/lib/rateLimit';
import { InteractionKind } from '@/lib/types';
import { slugify } from '@/lib/utils';
import { log } from '@/lib/log';
import {
  badOrigin,
  badRequest,
  failure,
  notFound,
  optionalText,
  rateLimited,
  readJsonBody,
  requiredText,
} from '@/lib/http';

export const dynamic = 'force-dynamic';

const INITIAL_BOOST_CENTS = [0, 10, 100, 1000] as const;

function kindForBoost(amountCents: number): InteractionKind {
  if (amountCents >= 1000) return 'power';
  if (amountCents >= 100) return 'super';
  return 'boost';
}

/**
 * POST /api/v1/posts/[id]/counter
 *
 * Publishes a rebuttal linked to a live parent post. `counter_of` is set from
 * the URL, never from the body, so a counter can only ever point at the post
 * the caller actually addressed. Counters share the author's hourly post
 * budget — otherwise they would be an unmetered way to create posts.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) return badOrigin();

  const { id } = await params;

  const ip = getClientIp(request);
  const ipLimit = rateLimiter.check(`post_${ip}`, 20, 60000);
  if (!ipLimit.success) {
    return rateLimited('Posting rate limit exceeded. Please wait a moment.', ipLimit.resetInMs);
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const title = requiredText(body.title, { field: 'title', max: 200 });
  if (!title.ok) return title.response;

  const content = optionalText(body.content, { field: 'content', max: 2000, multiline: true });
  if (!content.ok) return content.response;

  const authorDisplay = optionalText(body.author_display, { field: 'author_display', max: 50 });
  if (!authorDisplay.ok) return authorDisplay.response;

  const boostRaw = body.initial_boost_cents ?? 0;
  if (
    typeof boostRaw !== 'number' ||
    !Number.isSafeInteger(boostRaw) ||
    !(INITIAL_BOOST_CENTS as readonly number[]).includes(boostRaw)
  ) {
    return badRequest(
      `initial_boost_cents must be one of: ${INITIAL_BOOST_CENTS.join(', ')}.`,
      'INVALID_FIELD',
      { field: 'initial_boost_cents', allowed: INITIAL_BOOST_CENTS }
    );
  }

  const moderation = runGate0Moderation(title.value, content.value);
  if (!moderation.passed) {
    return NextResponse.json(
      {
        error: 'Counter-opinion failed automated moderation check',
        code: 'MODERATION_BLOCKED',
        flags: moderation.flags,
        reason: moderation.reason,
      },
      { status: 422 }
    );
  }

  try {
    const parentPost = await getPost(id);
    if (!parentPost || parentPost.status !== 'live') {
      return notFound('Original opinion not found.', 'POST_NOT_FOUND');
    }

    const user = await getOrCreateSessionUser();

    const userLimit = await checkDbRateLimit(`posts:u:${user.id}`, 5, 3600);
    if (!userLimit.allowed) {
      return rateLimited('You have reached the hourly limit for new posts.', userLimit.resetInMs);
    }

    const display = authorDisplay.value || user.alias || 'Anonymous';
    const baseSlug = slugify(title.value).slice(0, 60) || 'counter';

    const counterPost = await createPost({
      slug: `${baseSlug}-${randomBytes(4).toString('hex')}`,
      author_id: user.id,
      category_id: parentPost.category_id || 'global',
      kind: 'opinion',
      title: title.value,
      body: content.value,
      media_url: null,
      is_ad: false,
      demand_target: null,
      demand_target_user_id: null,
      counter_of: parentPost.id,
      source_url: null,
      source_platform: null,
      author_display: display,
      status: 'live',
      score_base: 0,
      total_raised_cents: 0,
      backers_count: 0,
      like_units: 0,
      streak_days: 0,
    });

    let boostError: Record<string, unknown> | null = null;
    if (boostRaw > 0) {
      try {
        await recordInteraction({
          postId: counterPost.id,
          userId: user.id,
          kind: kindForBoost(boostRaw),
          units: 1,
          amountCents: boostRaw,
          payerDisplay: display,
        });
      } catch (boostErr) {
        if (isStoreError(boostErr)) {
          boostError = { error: boostErr.message, code: boostErr.code, ...boostErr.details };
        } else {
          log('error', 'posts.counter_boost.failed', {
            user_id: user.id,
            post_id: counterPost.id,
            amount_cents: boostRaw,
            error: boostErr instanceof Error ? boostErr.message : 'unknown',
          });
          boostError = {
            error: 'The opening boost could not be settled. Your counter-opinion was published.',
            code: 'BOOST_FAILED',
          };
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        post: counterPost,
        parent_post: parentPost,
        ...(boostError ? { boost_error: boostError } : {}),
        message: 'Counter-opinion successfully paired with original post.',
      },
      { status: 201 }
    );
  } catch (err) {
    return failure('posts.counter.failed', err, { parent_ref: id });
  }
}

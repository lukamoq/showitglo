import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { checkDbRateLimit, createPost, getCategory, getRankedBoard, isStoreError, recordInteraction } from '@/lib/db/store';
import { assertSameOrigin, getOrCreateSessionUser } from '@/lib/session';
import { runGate0Moderation } from '@/lib/moderation/gate0';
import { getClientIp, rateLimiter } from '@/lib/rateLimit';
import { InteractionKind, PostKind } from '@/lib/types';
import { slugify } from '@/lib/utils';
import { log } from '@/lib/log';
import {
  badOrigin,
  badRequest,
  enumField,
  failure,
  optionalHttpUrl,
  optionalText,
  rateLimited,
  readJsonBody,
  readPagination,
  requiredText,
} from '@/lib/http';

export const dynamic = 'force-dynamic';

const POST_KINDS = ['opinion', 'demand'] as const;

/** Opening bids the client may pick from. The amount is never free-form. */
const INITIAL_BOOST_CENTS = [0, 10, 100, 1000] as const;

const MAX_TITLE = 200;
const MAX_CONTENT = 2000;
const MAX_AUTHOR_DISPLAY = 50;
const MAX_DEMAND_TARGET = 80;

/** Best-effort provenance label for a linked source; never security-relevant. */
function detectPlatform(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('twitter.com') || host.includes('x.com')) return 'x';
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
    if (host.includes('reddit.com')) return 'reddit';
    if (host.includes('tiktok.com')) return 'tiktok';
    if (host.includes('substack.com') || host.includes('medium.com')) return 'article';
    return host.replace('www.', '');
  } catch {
    return 'link';
  }
}

function buildSlug(title: string): string {
  const base = slugify(title).slice(0, 60) || 'opinion';
  return `${base}-${randomBytes(4).toString('hex')}`;
}

function kindForBoost(amountCents: number): InteractionKind {
  if (amountCents >= 1000) return 'power';
  if (amountCents >= 100) return 'super';
  return 'boost';
}

/**
 * GET /api/v1/posts
 *
 * Live posts only, highest ranked first. Removed and pending posts are not
 * addressable here — the board is the public record, and a rejected post
 * being silently readable is how moderation decisions get undone.
 */
export async function GET(request: NextRequest) {
  const page = readPagination(new URL(request.url), { defaultLimit: 50, maxLimit: 100 });
  if (!page.ok) return page.response;

  try {
    const posts = await getRankedBoard('global', { limit: page.limit, offset: page.offset });
    return NextResponse.json({
      posts,
      pagination: { limit: page.limit, offset: page.offset, returned: posts.length },
    });
  } catch (err) {
    return failure('posts.list.failed', err);
  }
}

/**
 * POST /api/v1/posts
 *
 * Creates an opinion or a demand as the session user. Two rate limits apply
 * on purpose: a per-IP burst guard that is cheap but per-instance, and a
 * per-user hourly ceiling in Postgres that every instance shares — the second
 * is the one that actually holds, because a per-process map is bypassed by
 * hitting a different serverless instance.
 */
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return badOrigin();

  const ip = getClientIp(request);
  const ipLimit = rateLimiter.check(`post_${ip}`, 20, 60000);
  if (!ipLimit.success) {
    return rateLimited('Posting rate limit exceeded. Please wait a moment.', ipLimit.resetInMs);
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  // --- validation ---------------------------------------------------------

  const title = requiredText(body.title, { field: 'title', max: MAX_TITLE });
  if (!title.ok) return title.response;

  const content = optionalText(body.content, { field: 'content', max: MAX_CONTENT, multiline: true });
  if (!content.ok) return content.response;

  const authorDisplay = optionalText(body.author_display, {
    field: 'author_display',
    max: MAX_AUTHOR_DISPLAY,
  });
  if (!authorDisplay.ok) return authorDisplay.response;

  const kind = enumField<(typeof POST_KINDS)[number]>(body.kind, {
    field: 'kind',
    allowed: POST_KINDS,
    fallback: 'opinion',
  });
  if (!kind.ok) return kind.response;

  const demandTarget = optionalText(body.demand_target, {
    field: 'demand_target',
    max: MAX_DEMAND_TARGET,
  });
  if (!demandTarget.ok) return demandTarget.response;

  if (kind.value === 'demand' && !demandTarget.value) {
    return badRequest('demand_target is required when kind is "demand".', 'INVALID_FIELD', {
      field: 'demand_target',
    });
  }
  if (kind.value !== 'demand' && demandTarget.value) {
    return badRequest('demand_target is only valid when kind is "demand".', 'INVALID_FIELD', {
      field: 'demand_target',
    });
  }

  const sourceUrl = optionalHttpUrl(body.source_url, 'source_url');
  if (!sourceUrl.ok) return sourceUrl.response;

  const categoryId = optionalText(body.category_id, { field: 'category_id', max: 64 });
  if (!categoryId.ok) return categoryId.response;

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
        error: 'Content failed automated moderation check',
        code: 'MODERATION_BLOCKED',
        flags: moderation.flags,
        reason: moderation.reason,
      },
      { status: 422 }
    );
  }

  // --- create -------------------------------------------------------------

  try {
    const user = await getOrCreateSessionUser();

    const userLimit = await checkDbRateLimit(`posts:u:${user.id}`, 5, 3600);
    if (!userLimit.allowed) {
      return rateLimited('You have reached the hourly limit for new posts.', userLimit.resetInMs);
    }

    const category = await getCategory(categoryId.value || 'global');
    if (!category) {
      return badRequest('Unknown category.', 'INVALID_CATEGORY', { field: 'category_id' });
    }

    const display = authorDisplay.value || user.alias || 'Anonymous';

    const post = await createPost({
      slug: buildSlug(title.value),
      author_id: user.id,
      category_id: category.id,
      kind: kind.value as PostKind,
      title: title.value,
      body: content.value,
      media_url: null,
      is_ad: false,
      demand_target: demandTarget.value,
      demand_target_user_id: null,
      counter_of: null,
      source_url: sourceUrl.value,
      source_platform: sourceUrl.value ? detectPlatform(sourceUrl.value) : null,
      author_display: display,
      status: 'live',
      score_base: 0,
      total_raised_cents: 0,
      backers_count: 0,
      like_units: 0,
      tap_units: 0,
      streak_days: 0,
    });

    if (boostRaw === 0) {
      return NextResponse.json({ post }, { status: 201 });
    }

    // The post already exists. An opening bid that cannot settle is reported
    // alongside it rather than failing the whole request — losing the writing
    // because the wallet is short is the worst possible outcome here.
    try {
      const settlement = await recordInteraction({
        postId: post.id,
        userId: user.id,
        kind: kindForBoost(boostRaw),
        units: 1,
        amountCents: boostRaw,
        payerDisplay: display,
      });

      return NextResponse.json(
        {
          post: { ...post, score_base: post.score_base + settlement.interaction.stored_delta },
          boost: {
            amount_cents: boostRaw,
            new_balance_cents: settlement.wallet.balance_cents,
            new_rank: settlement.newRank,
          },
        },
        { status: 201 }
      );
    } catch (boostErr) {
      if (isStoreError(boostErr)) {
        return NextResponse.json(
          { post, boost_error: { error: boostErr.message, code: boostErr.code, ...boostErr.details } },
          { status: 201 }
        );
      }

      log('error', 'posts.initial_boost.failed', {
        user_id: user.id,
        post_id: post.id,
        amount_cents: boostRaw,
        error: boostErr instanceof Error ? boostErr.message : 'unknown',
      });
      return NextResponse.json(
        {
          post,
          boost_error: {
            error: 'The opening boost could not be settled. Your post was published.',
            code: 'BOOST_FAILED',
          },
        },
        { status: 201 }
      );
    }
  } catch (err) {
    return failure('posts.create.failed', err);
  }
}

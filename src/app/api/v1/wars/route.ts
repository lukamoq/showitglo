import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { checkDbRateLimit, createWarPair, getCategory, isStoreError, recordInteraction } from '@/lib/db/store';
import { assertSameOrigin, getOrCreateSessionUser } from '@/lib/session';
import { runGate0Moderation } from '@/lib/moderation/gate0';
import { getClientIp, rateLimiter } from '@/lib/rateLimit';
import { InteractionKind, Post } from '@/lib/types';
import { slugify } from '@/lib/utils';
import { log } from '@/lib/log';
import {
  badOrigin,
  badRequest,
  failure,
  optionalText,
  rateLimited,
  readJsonBody,
  requiredText,
} from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Opening bids the client may pick from, per side. Never free-form. */
const INITIAL_BOOST_CENTS = [0, 10, 100, 1000] as const;

const MAX_TITLE = 200;
const MAX_CONTENT = 2000;
const MAX_AUTHOR_DISPLAY = 50;

/** A war spends two of the author's five hourly posts, because it is two posts. */
const POSTS_PER_HOUR = 5;
const POSTS_PER_WAR = 2;

type SideKey = 'a' | 'b';

interface ParsedSide {
  title: string;
  content: string | null;
  boostCents: number;
}

function kindForBoost(amountCents: number): InteractionKind {
  if (amountCents >= 1000) return 'power';
  if (amountCents >= 100) return 'super';
  return 'boost';
}

function buildSlug(title: string, side: SideKey): string {
  const base = slugify(title).slice(0, 56) || `war-side-${side}`;
  return `${base}-${randomBytes(4).toString('hex')}`;
}

/**
 * Reads one side of the war out of the body. Field names are namespaced by
 * side so a validation error names the box the author has to go back and fix,
 * rather than "title".
 */
function parseSide(raw: unknown, side: SideKey): { ok: true; value: ParsedSide } | { ok: false; response: NextResponse } {
  const field = `side_${side}`;

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      response: badRequest(`${field} must be an object with a title.`, 'INVALID_FIELD', { field }),
    };
  }

  const body = raw as Record<string, unknown>;

  const title = requiredText(body.title, { field: `${field}.title`, max: MAX_TITLE });
  if (!title.ok) return { ok: false, response: title.response };

  const content = optionalText(body.content, {
    field: `${field}.content`,
    max: MAX_CONTENT,
    multiline: true,
  });
  if (!content.ok) return { ok: false, response: content.response };

  const boostRaw = body.initial_boost_cents ?? 0;
  if (
    typeof boostRaw !== 'number' ||
    !Number.isSafeInteger(boostRaw) ||
    !(INITIAL_BOOST_CENTS as readonly number[]).includes(boostRaw)
  ) {
    return {
      ok: false,
      response: badRequest(
        `${field}.initial_boost_cents must be one of: ${INITIAL_BOOST_CENTS.join(', ')}.`,
        'INVALID_FIELD',
        { field: `${field}.initial_boost_cents`, allowed: INITIAL_BOOST_CENTS }
      ),
    };
  }

  return { ok: true, value: { title: title.value, content: content.value, boostCents: boostRaw } };
}

/**
 * POST /api/v1/wars
 *
 * Publishes two rival stances in one act — a war. Both sides are written in a
 * single transaction, and side B is linked to side A with `counter_of`, which
 * is the same edge a rebuttal creates. So a declared war and an organic
 * argument are the same object on the board, and the fights ledger needs to
 * understand only one shape.
 *
 * The opening backings are settled after the pair exists and are deliberately
 * non-fatal: an empty wallet must never be able to destroy writing that is
 * already published.
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

  const sideA = parseSide(body.side_a, 'a');
  if (!sideA.ok) return sideA.response;

  const sideB = parseSide(body.side_b, 'b');
  if (!sideB.ok) return sideB.response;

  if (sideA.value.title.toLowerCase() === sideB.value.title.toLowerCase()) {
    return badRequest('The two sides of a war must say different things.', 'IDENTICAL_SIDES', {
      field: 'side_b.title',
    });
  }

  const authorDisplay = optionalText(body.author_display, {
    field: 'author_display',
    max: MAX_AUTHOR_DISPLAY,
  });
  if (!authorDisplay.ok) return authorDisplay.response;

  const categoryId = optionalText(body.category_id, { field: 'category_id', max: 64 });
  if (!categoryId.ok) return categoryId.response;

  // Both sides are screened before either is written — publishing side A and
  // then rejecting side B would leave the author holding half an argument.
  for (const [side, value] of [
    ['a', sideA.value],
    ['b', sideB.value],
  ] as const) {
    const moderation = runGate0Moderation(value.title, value.content);
    if (!moderation.passed) {
      return NextResponse.json(
        {
          error: `Side ${side.toUpperCase()} failed automated moderation check`,
          code: 'MODERATION_BLOCKED',
          side,
          flags: moderation.flags,
          reason: moderation.reason,
        },
        { status: 422 }
      );
    }
  }

  // --- create -------------------------------------------------------------

  try {
    const user = await getOrCreateSessionUser();

    // Two posts, two slots. The budget is checked one slot at a time because
    // that is the only way the shared counter can charge for both.
    for (let i = 0; i < POSTS_PER_WAR; i++) {
      const verdict = await checkDbRateLimit(`posts:u:${user.id}`, POSTS_PER_HOUR, 3600);
      if (!verdict.allowed) {
        return rateLimited(
          'A war counts as two posts, and that would pass your hourly limit.',
          verdict.resetInMs
        );
      }
    }

    const category = await getCategory(categoryId.value || 'global');
    if (!category) {
      return badRequest('Unknown category.', 'INVALID_CATEGORY', { field: 'category_id' });
    }

    const display = authorDisplay.value || user.alias || 'Anonymous';

    const base = {
      author_id: user.id,
      category_id: category.id,
      kind: 'opinion' as const,
      media_url: null,
      is_ad: false,
      demand_target: null,
      demand_target_user_id: null,
      source_url: null,
      source_platform: null,
      author_display: display,
      status: 'live' as const,
      score_base: 0,
      total_raised_cents: 0,
      backers_count: 0,
      like_units: 0,
      streak_days: 0,
    };

    const pair = await createWarPair(
      {
        ...base,
        slug: buildSlug(sideA.value.title, 'a'),
        title: sideA.value.title,
        body: sideA.value.content,
        counter_of: null,
      },
      {
        ...base,
        slug: buildSlug(sideB.value.title, 'b'),
        title: sideB.value.title,
        body: sideB.value.content,
      }
    );

    const sides: Array<{ key: SideKey; post: Post; boostCents: number }> = [
      { key: 'a', post: pair.post_a, boostCents: sideA.value.boostCents },
      { key: 'b', post: pair.post_b, boostCents: sideB.value.boostCents },
    ];

    const boostErrors: Record<string, unknown> = {};
    let scoreA = pair.post_a.score_base;
    let scoreB = pair.post_b.score_base;

    // Sequential, not parallel: both debits lock the same wallet row, so
    // running them together would have the two halves of one war contend
    // with each other for it.
    for (const { key, post, boostCents } of sides) {
      if (boostCents === 0) continue;

      try {
        const settlement = await recordInteraction({
          postId: post.id,
          userId: user.id,
          kind: kindForBoost(boostCents),
          units: 1,
          amountCents: boostCents,
          payerDisplay: display,
        });

        if (key === 'a') scoreA += settlement.interaction.stored_delta;
        else scoreB += settlement.interaction.stored_delta;
      } catch (boostErr) {
        if (isStoreError(boostErr)) {
          boostErrors[key] = { error: boostErr.message, code: boostErr.code, ...boostErr.details };
        } else {
          log('error', 'wars.initial_boost.failed', {
            user_id: user.id,
            post_id: post.id,
            side: key,
            amount_cents: boostCents,
            error: boostErr instanceof Error ? boostErr.message : 'unknown',
          });
          boostErrors[key] = {
            error: 'The opening backing could not be settled. Both sides of your war are live.',
            code: 'BOOST_FAILED',
          };
        }
      }
    }

    return NextResponse.json(
      {
        war: {
          id: `fight_${pair.post_b.id}_${pair.post_a.id}`,
          post_a: { ...pair.post_a, score_base: scoreA },
          post_b: { ...pair.post_b, score_base: scoreB },
        },
        ...(Object.keys(boostErrors).length > 0 ? { boost_errors: boostErrors } : {}),
      },
      { status: 201 }
    );
  } catch (err) {
    return failure('wars.create.failed', err);
  }
}

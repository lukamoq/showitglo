import { NextRequest, NextResponse } from 'next/server';

import { recordTaps } from '@/lib/db/store';
import { assertSameOrigin, getOrCreateSessionUser } from '@/lib/session';
import { TAPS_PER_PENNY, TAP_RANK_CENTS_PER_POST_PER_DAY } from '@/lib/pricing';
import { getClientIp, rateLimiter } from '@/lib/rateLimit';
import { badOrigin, failure, integerField, rateLimited, readJsonBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * The most rank one call may ask for, whatever the body claims.
 *
 * A client batches TAPS_PER_PENNY taps into one request, so an honest call is
 * always worth exactly one rank-cent. The ceiling exists for the dishonest
 * one: without it a single request could claim a thousand.
 */
const MAX_RANK_CENTS_PER_CALL = 1;

/**
 * POST /api/v1/posts/[id]/tap
 *
 * Earns rank without paying. Ten taps move a post exactly as one paid penny
 * would; no wallet is debited and the post's money total does not move.
 *
 * Because nothing is charged, the usual protection — a balance that runs out —
 * does not exist here, and every limit has to be explicit:
 *
 *   * the same-origin check keeps this off other people's pages,
 *   * an IP rate limit bounds how fast one machine can tap,
 *   * a 24h per-wallet, per-post cap in `recordTaps` bounds the total,
 *   * and the grant is whatever the cap has left, not what the body asked for.
 *
 * The client's tap count is a claim, not an authority. It cannot be otherwise
 * — taps happen in a browser — which is why the cap, and not the arithmetic,
 * is what actually holds.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) return badOrigin();

  const { id } = await params;

  /* Sized for a human hand: ten taps make a rank-cent, and the per-post daily
     cap is reached in a hundred. A burst above this is a script. */
  const ip = getClientIp(request);
  const limit = rateLimiter.check(`tap_${ip}`, 40, 60_000);
  if (!limit.success) {
    return rateLimited('You are tapping faster than we can count. Give it a moment.', limit.resetInMs);
  }

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const rankCents = integerField(parsed.body.rank_cents, {
    field: 'rank_cents',
    min: 1,
    max: MAX_RANK_CENTS_PER_CALL,
    fallback: 1,
  });
  if (!rankCents.ok) return rankCents.response;

  try {
    const user = await getOrCreateSessionUser();

    const result = await recordTaps({
      postId: id,
      userId: user.id,
      rankCents: rankCents.value,
      capRankCents24h: TAP_RANK_CENTS_PER_POST_PER_DAY,
    });

    return NextResponse.json({
      success: true,
      taps_per_penny: TAPS_PER_PENNY,
      rank_cents: result.rank_cents,
      tap_units: result.tap_units,
      remaining_rank_cents: result.remaining_rank_cents,
      old_rank: result.oldRank,
      new_rank: result.newRank,
    });
  } catch (err) {
    return failure('post.tap.failed', err, { post_ref: id });
  }
}

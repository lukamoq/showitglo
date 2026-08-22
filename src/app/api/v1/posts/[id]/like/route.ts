import { NextRequest, NextResponse } from 'next/server';

import { recordInteraction } from '@/lib/db/store';
import { assertSameOrigin, getOrCreateSessionUser } from '@/lib/session';
import { LIKE_MAX_UNITS, LIKE_MIN_UNITS, LIKE_UNIT_CENTS } from '@/lib/pricing';
import {
  badOrigin,
  enumField,
  failure,
  integerField,
  optionalText,
  readIdempotencyKey,
  readJsonBody,
} from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Blueprint §4/§6: a wallet may spend at most this many like-units per post per day. */
const LIKE_UNITS_PER_POST_PER_DAY = 100;

const VISIBILITIES = ['alias', 'anonymous'] as const;

/**
 * POST /api/v1/posts/[id]/like
 *
 * Penny likes. The client picks how many units; it never picks the price —
 * that is `units * LIKE_UNIT_CENTS`, computed here. A `user_id` in the body is
 * ignored: the wallet debited is always the session's.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) return badOrigin();

  const { id } = await params;

  const idempotency = readIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const units = integerField(body.units, {
    field: 'units',
    min: LIKE_MIN_UNITS,
    max: LIKE_MAX_UNITS,
    fallback: 1,
  });
  if (!units.ok) return units.response;

  const visibility = enumField<(typeof VISIBILITIES)[number]>(body.visibility, {
    field: 'visibility',
    allowed: VISIBILITIES,
    fallback: 'alias',
  });
  if (!visibility.ok) return visibility.response;

  const payerDisplay = optionalText(body.payer_display, { field: 'payer_display', max: 50 });
  if (!payerDisplay.ok) return payerDisplay.response;

  try {
    const user = await getOrCreateSessionUser();
    const amountCents = units.value * LIKE_UNIT_CENTS;

    const result = await recordInteraction({
      postId: id,
      userId: user.id,
      kind: 'like',
      units: units.value,
      amountCents,
      visibility: visibility.value,
      payerDisplay: payerDisplay.value || user.alias || 'Anonymous Backer',
      idempotencyKey: idempotency.key,
      unitCap24h: LIKE_UNITS_PER_POST_PER_DAY,
    });

    // On a replay, report what the ORIGINAL request bought — not what this one
    // asked for. Echoing the request would tell a client that reused a key with
    // different units that it just paid for units it did not get.
    return NextResponse.json({
      success: true,
      units: result.interaction.units,
      amount_cents: result.interaction.amount_cents,
      new_balance_cents: result.wallet.balance_cents,
      old_rank: result.oldRank,
      new_rank: result.newRank,
      replayed: result.replayed,
    });
  } catch (err) {
    return failure('post.like.failed', err, { post_ref: id });
  }
}

import { NextRequest, NextResponse } from 'next/server';

import { getQuote, recordInteraction } from '@/lib/db/store';
import { assertSameOrigin, getOrCreateSessionUser } from '@/lib/session';
import {
  badOrigin,
  badRequest,
  enumField,
  failure,
  notFound,
  optionalText,
  readIdempotencyKey,
  readJsonBody,
} from '@/lib/http';

export const dynamic = 'force-dynamic';

const VISIBILITIES = ['alias', 'anonymous'] as const;

/**
 * POST /api/v1/power-boosts
 *
 * Settles a power boost against a quote issued earlier by `POST /quotes`.
 *
 * The amount comes from the stored quote and nothing else — there is no
 * `amount_cents` input to tamper with, and `getQuote` returns null once the
 * five-minute window closes, so a stale price cannot be replayed after the
 * board has moved underneath it.
 */
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return badOrigin();

  const idempotency = readIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const quoteId = optionalText(body.quote_id, { field: 'quote_id', max: 200 });
  if (!quoteId.ok) return quoteId.response;
  if (!quoteId.value) return badRequest('quote_id is required.', 'INVALID_FIELD', { field: 'quote_id' });

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

    const quote = await getQuote(quoteId.value);
    if (!quote) return notFound('Quote not found or expired. Please fetch a fresh price.', 'QUOTE_EXPIRED');

    const result = await recordInteraction({
      postId: quote.post_id,
      userId: user.id,
      kind: 'power',
      units: 1,
      amountCents: quote.amount_cents,
      visibility: visibility.value,
      quoteId: quote.quote_id,
      targetRank: quote.target_rank,
      payerDisplay: payerDisplay.value || user.alias || 'Anonymous Backer',
      idempotencyKey: idempotency.key,
    });

    return NextResponse.json({
      success: true,
      interaction: result.interaction,
      old_rank: result.oldRank,
      new_rank: result.newRank,
      new_balance_cents: result.wallet.balance_cents,
      displaced_count: result.displacedPosts.length,
      replayed: result.replayed,
    });
  } catch (err) {
    return failure('power_boost.failed', err);
  }
}

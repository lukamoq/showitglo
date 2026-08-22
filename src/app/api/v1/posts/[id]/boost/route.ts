import { NextRequest, NextResponse } from 'next/server';

import { recordInteraction } from '@/lib/db/store';
import { assertSameOrigin, getOrCreateSessionUser } from '@/lib/session';
import { BOOST_CENTS, SUPER_CENTS } from '@/lib/pricing';
import {
  badOrigin,
  enumField,
  failure,
  optionalText,
  readIdempotencyKey,
  readJsonBody,
} from '@/lib/http';

export const dynamic = 'force-dynamic';

/** The client names a product; the server owns the price. */
const BOOST_PRICES = { boost: BOOST_CENTS, super: SUPER_CENTS } as const;

const BOOST_KINDS = ['boost', 'super'] as const;
const VISIBILITIES = ['alias', 'anonymous'] as const;

/**
 * POST /api/v1/posts/[id]/boost
 *
 * Fixed-price boosts. Any `amount_cents` in the body is ignored outright:
 * the only inputs that move money here are the product name and the session
 * cookie.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) return badOrigin();

  const { id } = await params;

  const idempotency = readIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const kind = enumField<(typeof BOOST_KINDS)[number]>(body.kind, {
    field: 'kind',
    allowed: BOOST_KINDS,
    fallback: 'boost',
  });
  if (!kind.ok) return kind.response;

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
    const amountCents = BOOST_PRICES[kind.value];

    const result = await recordInteraction({
      postId: id,
      userId: user.id,
      kind: kind.value,
      units: 1,
      amountCents,
      visibility: visibility.value,
      payerDisplay: payerDisplay.value || user.alias || 'Anonymous Backer',
      idempotencyKey: idempotency.key,
    });

    // On a replay these come from the stored interaction, not from this
    // request: a client that reused a key after switching from boost to super
    // must be told it still holds a boost, not handed back its own wish.
    return NextResponse.json({
      success: true,
      kind: result.interaction.kind,
      amount_cents: result.interaction.amount_cents,
      new_balance_cents: result.wallet.balance_cents,
      old_rank: result.oldRank,
      new_rank: result.newRank,
      displaced_count: result.displacedPosts.length,
      replayed: result.replayed,
    });
  } catch (err) {
    return failure('post.boost.failed', err, { post_ref: id });
  }
}

import { NextRequest, NextResponse } from 'next/server';

import {
  addDebateOpinion,
  addFreeVote,
  checkDbRateLimit,
  getDebateBySlug,
  recordInteraction,
} from '@/lib/db/store';
import { assertSameOrigin, getOrCreateSessionUser } from '@/lib/session';
import { DEBATE_BACK_ALLOWED, DebateBackTier, isDebateBackTier } from '@/lib/pricing';
import {
  badOrigin,
  badRequest,
  enumField,
  failure,
  notFound,
  optionalText,
  rateLimited,
  readIdempotencyKey,
  readJsonBody,
} from '@/lib/http';

export const dynamic = 'force-dynamic';

const MAX_OPINION = 500;
const VISIBILITIES = ['alias', 'anonymous'] as const;
const FREE_KIND = 'free_opinion';

/**
 * POST /api/v1/debates/[slug]/back
 *
 * Backs one side of a war, free or paid.
 *
 * `amount_cents` in the request body is read but never honoured: a paid
 * backing costs exactly `DEBATE_BACK_ALLOWED[kind]`. That is the whole point
 * of the conviction tiers — the client picks a chip, not a number.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (!assertSameOrigin(request)) return badOrigin();

  const { slug } = await params;

  const idempotency = readIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const sideKey = optionalText(body.side_key, { field: 'side_key', max: 64 });
  if (!sideKey.ok) return sideKey.response;
  if (!sideKey.value) return badRequest('side_key is required.', 'INVALID_FIELD', { field: 'side_key' });

  const opinionText = optionalText(body.opinion_text, {
    field: 'opinion_text',
    max: MAX_OPINION,
    multiline: true,
  });
  if (!opinionText.ok) return opinionText.response;

  const payerDisplay = optionalText(body.payer_display, { field: 'payer_display', max: 50 });
  if (!payerDisplay.ok) return payerDisplay.response;

  const visibility = enumField<(typeof VISIBILITIES)[number]>(body.visibility, {
    field: 'visibility',
    allowed: VISIBILITIES,
    fallback: 'alias',
  });
  if (!visibility.ok) return visibility.response;

  // Free unless the caller names a real conviction tier.
  const rawKind = body.kind;
  const isFree =
    rawKind === undefined || rawKind === null || rawKind === FREE_KIND || rawKind === '';

  let tier: DebateBackTier | null = null;
  if (!isFree) {
    if (!isDebateBackTier(rawKind)) {
      return badRequest(
        `kind must be "${FREE_KIND}" or one of: ${Object.keys(DEBATE_BACK_ALLOWED).join(', ')}.`,
        'INVALID_FIELD',
        { field: 'kind', allowed: [FREE_KIND, ...Object.keys(DEBATE_BACK_ALLOWED)] }
      );
    }
    tier = rawKind;
  }

  try {
    const debate = await getDebateBySlug(slug);
    if (!debate) return notFound('Debate not found.', 'DEBATE_NOT_FOUND');

    const side = debate.sides.find((s) => s.side_key === sideKey.value);
    if (!side) return notFound('Side not found in this debate.', 'SIDE_NOT_FOUND');

    const user = await getOrCreateSessionUser();

    // --- free vote / free opinion ----------------------------------------
    if (!tier) {
      const limit = await checkDbRateLimit(`dback:u:${user.id}`, 30, 3600);
      if (!limit.allowed) {
        return rateLimited('You have reached the hourly limit for free backings.', limit.resetInMs);
      }

      const authorName =
        visibility.value === 'anonymous'
          ? 'Anonymous'
          : payerDisplay.value || user.alias || 'Community Member';

      if (opinionText.value) {
        await addDebateOpinion({
          debateId: debate.id,
          sideKey: side.side_key,
          authorName,
          text: opinionText.value,
          isPaid: false,
          amountCents: 0,
        });
      } else {
        await addFreeVote(debate.id, side.side_key);
      }

      return NextResponse.json({
        success: true,
        side_key: side.side_key,
        amount_cents: 0,
        free_vote: true,
        replayed: false,
        opinion_recorded: Boolean(opinionText.value),
        debate: await getDebateBySlug(slug),
      });
    }

    // --- paid conviction backing -----------------------------------------
    const amountCents = DEBATE_BACK_ALLOWED[tier];
    const authorName =
      visibility.value === 'anonymous'
        ? 'Anonymous'
        : payerDisplay.value || user.alias || 'Community Member';

    const result = await recordInteraction({
      postId: side.post.id,
      userId: user.id,
      kind: tier === 'mega' ? 'power' : tier,
      units: 1,
      amountCents,
      visibility: visibility.value,
      payerDisplay: authorName,
      idempotencyKey: idempotency.key,
    });

    // A replay must not publish the opinion a second time — and the client has
    // to be told, or it clears the composer believing the text was posted.
    const opinionRecorded = Boolean(opinionText.value) && !result.replayed;
    if (opinionRecorded) {
      await addDebateOpinion({
        debateId: debate.id,
        sideKey: side.side_key,
        authorName,
        text: opinionText.value as string,
        isPaid: true,
        amountCents,
      });
    }

    // On a replay, describe the backing that actually exists: the side is the
    // one the stored interaction paid for, which need not be the side named in
    // a request that reused someone's key.
    const settledSide =
      debate.sides.find((s) => s.post.id === result.interaction.post_id)?.side_key ?? side.side_key;

    return NextResponse.json({
      success: true,
      side_key: result.replayed ? settledSide : side.side_key,
      amount_cents: result.interaction.amount_cents,
      new_balance_cents: result.wallet.balance_cents,
      new_rank: result.newRank,
      replayed: result.replayed,
      opinion_recorded: opinionRecorded,
      debate: await getDebateBySlug(slug),
    });
  } catch (err) {
    return failure('debate.back.failed', err, { slug });
  }
}

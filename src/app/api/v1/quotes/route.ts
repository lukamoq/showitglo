import { NextRequest, NextResponse } from 'next/server';

import { createQuote, getCategory, getPost, getQuote } from '@/lib/db/store';
import { assertSameOrigin, getOrCreateSessionUser } from '@/lib/session';
import {
  badOrigin,
  badRequest,
  failure,
  integerField,
  notFound,
  optionalText,
  readJsonBody,
} from '@/lib/http';

export const dynamic = 'force-dynamic';

const MIN_TARGET_RANK = 1;
const MAX_TARGET_RANK = 1000;
const MIN_QUOTE_CENTS = 1000; // $10 — the floor for a power boost
const MAX_QUOTE_CENTS = 50000; // $500

/**
 * GET /api/v1/quotes?quote_id=...
 *
 * Re-reads a live quote. Expired quotes are indistinguishable from unknown
 * ones by design: the price they carried is no longer honoured, so surfacing
 * the old figure would only invite a client to spend against it.
 */
export async function GET(request: NextRequest) {
  const quoteId = new URL(request.url).searchParams.get('quote_id');
  if (!quoteId) return badRequest('quote_id is required.', 'INVALID_FIELD', { field: 'quote_id' });

  try {
    const quote = await getQuote(quoteId);
    if (!quote) return notFound('Quote not found or expired.', 'QUOTE_NOT_FOUND');
    return NextResponse.json({ quote });
  } catch (err) {
    return failure('quotes.read.failed', err);
  }
}

/**
 * POST /api/v1/quotes
 *
 * Prices a power boost. Exactly one of `target_rank` (buy a position) or
 * `amount_cents` (spend a budget) is accepted — supplying both is ambiguous
 * about which one the caller expects to be honoured, so it is a 400 rather
 * than a silent precedence rule.
 *
 * The returned amount is what `POST /power-boosts` will charge; the client
 * never gets to name its own price.
 */
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return badOrigin();

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const postId = optionalText(body.post_id, { field: 'post_id', max: 200 });
  if (!postId.ok) return postId.response;
  if (!postId.value) return badRequest('post_id is required.', 'INVALID_FIELD', { field: 'post_id' });

  const categoryId = optionalText(body.category_id, { field: 'category_id', max: 64 });
  if (!categoryId.ok) return categoryId.response;

  const hasTargetRank = body.target_rank !== undefined && body.target_rank !== null;
  const hasAmount = body.amount_cents !== undefined && body.amount_cents !== null;

  if (hasTargetRank === hasAmount) {
    return badRequest(
      'Provide exactly one of target_rank or amount_cents.',
      'INVALID_QUOTE_REQUEST'
    );
  }

  let targetRank: number | null = null;
  let amountCents: number | null = null;

  if (hasTargetRank) {
    const parsedRank = integerField(body.target_rank, {
      field: 'target_rank',
      min: MIN_TARGET_RANK,
      max: MAX_TARGET_RANK,
    });
    if (!parsedRank.ok) return parsedRank.response;
    targetRank = parsedRank.value;
  } else {
    const parsedAmount = integerField(body.amount_cents, {
      field: 'amount_cents',
      min: MIN_QUOTE_CENTS,
      max: MAX_QUOTE_CENTS,
    });
    if (!parsedAmount.ok) return parsedAmount.response;
    amountCents = parsedAmount.value;
  }

  try {
    // A quote is cheap but not free, and it is bound to a session so the
    // pricing surface is not an open oracle for unauthenticated callers.
    await getOrCreateSessionUser();

    const category = await getCategory(categoryId.value || 'global');
    if (!category) return badRequest('Unknown category.', 'INVALID_CATEGORY', { field: 'category_id' });

    const post = await getPost(postId.value);
    if (!post || post.status !== 'live') return notFound('Post not found.', 'POST_NOT_FOUND');

    const quote = await createQuote(post.id, targetRank, amountCents, category.id);
    return NextResponse.json({ quote });
  } catch (err) {
    return failure('quotes.create.failed', err);
  }
}

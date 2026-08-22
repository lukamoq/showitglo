import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { assertSameOrigin, getOrCreateSessionUser } from '@/lib/session';
import {
  checkDbRateLimit,
  confirmWalletIntent,
  getRealEmailForUser,
  getWallet,
  isStoreError,
  releaseWalletIntent,
  reserveWalletHeadroom,
} from '@/lib/db/store';
import { TOPUP_MAX_CENTS, TOPUP_MIN_CENTS, WALLET_MAX_CENTS, isValidTopupAmount } from '@/lib/pricing';
import { maskEmail } from '@/lib/email';
import { failure, optionalEmailField } from '@/lib/http';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/wallet/create-intent
 *
 * Creates a real Stripe PaymentIntent for a wallet top-up. There is no
 * simulator fallback: without Stripe keys the endpoint reports 503 rather than
 * handing the client a fake client_secret it could mistake for a real one.
 *
 * This is where BOTH money limits are enforced — per-transaction bounds and
 * the wallet ceiling — because after the customer's card is charged it is far
 * too late to refuse the funds. The ceiling counts intents already in flight,
 * not just the settled balance: unsettled intents are money the webhook will be
 * obliged to credit, so ignoring them makes the ceiling advisory at best.
 */
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin request rejected.', code: 'BAD_ORIGIN' }, { status: 403 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!stripeSecretKey || !publishableKey) {
    return NextResponse.json(
      { error: 'Payments are not configured on this deployment.', code: 'PAYMENTS_NOT_CONFIGURED' },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const amountCents = (body as { amount_cents?: unknown })?.amount_cents;
  if (!isValidTopupAmount(amountCents)) {
    return NextResponse.json(
      {
        error: `Top-up must be a whole number of cents between ${TOPUP_MIN_CENTS} and ${TOPUP_MAX_CENTS}.`,
        code: 'INVALID_AMOUNT',
        min_cents: TOPUP_MIN_CENTS,
        max_cents: TOPUP_MAX_CENTS,
      },
      { status: 400 }
    );
  }

  // Optional, and only ever a fallback — see the resolution below.
  const requestedReceiptEmail = optionalEmailField(
    (body as { receipt_email?: unknown })?.receipt_email,
    'receipt_email'
  );
  if (!requestedReceiptEmail.ok) return requestedReceiptEmail.response;

  try {
    const user = await getOrCreateSessionUser();

    const limit = await checkDbRateLimit(`intent:${user.id}`, 10, 60);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many top-up attempts. Try again in a minute.', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.resetInMs / 1000)) } }
      );
    }

    const wallet = await getWallet(user.id);
    if (wallet.status !== 'active') {
      return NextResponse.json(
        { error: 'This wallet is frozen and cannot be topped up.', code: 'WALLET_FROZEN' },
        { status: 403 }
      );
    }

    // Throws a StoreError with code WALLET_LIMIT (400) when balance + in-flight
    // intents + this amount would breach the ceiling. On success it has already
    // reserved this amount, so a concurrent second attempt sees it.
    const headroom = await reserveWalletHeadroom({
      userId: user.id,
      amountCents,
      maxBalanceCents: WALLET_MAX_CENTS,
    });

    // Receipts: Stripe emails one on success when the intent carries an
    // address. The CONFIRMED, linked address wins — a body field is
    // attacker-controlled, and letting it override a linked address would turn
    // "top up my wallet" into "mail my payment history to an address I chose".
    // The body value is honoured only when this wallet has no linked address at
    // all, which is the anonymous visitor asking for a receipt one time.
    const linkedEmail = await getRealEmailForUser(user.id);
    const receiptEmail = linkedEmail ?? requestedReceiptEmail.value;

    let paymentIntent: Stripe.PaymentIntent;
    try {
      const stripe = new Stripe(stripeSecretKey);
      paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        ...(receiptEmail ? { receipt_email: receiptEmail } : {}),
        metadata: { user_id: user.id, purpose: 'wallet_topup', app: 'showitglo' },
      });
    } catch (err) {
      // No intent exists, so nothing can ever settle against this reservation.
      await releaseWalletIntent(headroom.reservationId);
      throw err;
    }

    await confirmWalletIntent(headroom.reservationId, paymentIntent.id);

    log('info', 'payment.intent.created', {
      user_id: user.id,
      amount_cents: amountCents,
      pending_topup_cents: headroom.pendingCents,
      payment_intent_id: paymentIntent.id,
      receipt_to: receiptEmail ? maskEmail(receiptEmail) : null,
      receipt_source: linkedEmail ? 'linked' : requestedReceiptEmail.value ? 'request' : 'none',
      outcome: 'ok',
    });

    return NextResponse.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      publishable_key: publishableKey,
      amount_cents: amountCents,
      receipt_email_masked: receiptEmail ? maskEmail(receiptEmail) : null,
    });
  } catch (err) {
    // A domain refusal (WALLET_LIMIT, WALLET_FROZEN) is the caller's answer and
    // keeps its own status; anything else is Stripe or us failing.
    if (isStoreError(err)) return failure('payment.intent.rejected', err);

    log('error', 'payment.intent.failed', {
      amount_cents: typeof amountCents === 'number' ? amountCents : null,
      error: err instanceof Error ? err.message : 'unknown',
      outcome: 'error',
    });
    return NextResponse.json(
      { error: 'Could not start the payment. Please try again.', code: 'PAYMENT_INTENT_FAILED' },
      { status: 502 }
    );
  }
}

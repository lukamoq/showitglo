import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { assertSameOrigin, getOrCreateSessionUser } from '@/lib/session';
import { creditWalletFromPayment, getWallet } from '@/lib/db/store';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/wallet/topup
 *
 * Confirms a top-up after the client-side payment succeeds. This endpoint used
 * to mint free credit from a request body; it now grants nothing on its own.
 *
 * The only thing the client supplies is a PaymentIntent id. We re-fetch that
 * intent from Stripe and credit only if Stripe itself says it succeeded, the
 * currency is right, and its metadata names the *session* user — so a stolen
 * or guessed intent id belonging to someone else is worthless.
 *
 * The Stripe webhook credits the same payment independently; both paths funnel
 * through creditWalletFromPayment, whose unique index on the intent id makes
 * whichever arrives second a no-op.
 */
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin request rejected.', code: 'BAD_ORIGIN' }, { status: 403 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
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

  const paymentIntentId = (body as { payment_intent_id?: unknown })?.payment_intent_id;
  if (typeof paymentIntentId !== 'string' || !/^pi_[A-Za-z0-9_]{4,255}$/.test(paymentIntentId)) {
    return NextResponse.json(
      { error: 'payment_intent_id is required.', code: 'INVALID_PAYMENT_INTENT' },
      { status: 400 }
    );
  }

  const user = await getOrCreateSessionUser();

  let intent: Stripe.PaymentIntent;
  try {
    const stripe = new Stripe(stripeSecretKey);
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    log('warn', 'wallet.topup.lookup_failed', {
      user_id: user.id,
      payment_intent_id: paymentIntentId,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json({ error: 'Payment not found.', code: 'PAYMENT_NOT_FOUND' }, { status: 404 });
  }

  if (intent.metadata?.user_id !== user.id) {
    log('warn', 'wallet.topup.owner_mismatch', {
      user_id: user.id,
      payment_intent_id: paymentIntentId,
      outcome: 'rejected',
    });
    return NextResponse.json({ error: 'Payment not found.', code: 'PAYMENT_NOT_FOUND' }, { status: 404 });
  }

  if (intent.status !== 'succeeded') {
    return NextResponse.json(
      { error: 'This payment has not completed yet.', code: 'PAYMENT_NOT_SUCCEEDED', payment_status: intent.status },
      { status: 409 }
    );
  }

  if (intent.currency !== 'usd') {
    return NextResponse.json({ error: 'Unsupported currency.', code: 'INVALID_CURRENCY' }, { status: 400 });
  }

  const amountCents = intent.amount_received || intent.amount;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: 'Invalid payment amount.', code: 'INVALID_AMOUNT' }, { status: 400 });
  }

  try {
    const result = await creditWalletFromPayment({
      userId: user.id,
      amountCents,
      paymentIntentId: intent.id,
      currency: intent.currency,
    });

    log('info', 'wallet.topup.confirmed', {
      user_id: user.id,
      payment_intent_id: intent.id,
      amount_cents: amountCents,
      outcome: result.credited ? 'credited' : 'duplicate',
    });

    return NextResponse.json({
      success: true,
      credited: result.credited,
      wallet: result.wallet,
      amount_cents: amountCents,
    });
  } catch (err) {
    log('error', 'wallet.topup.failed', {
      user_id: user.id,
      payment_intent_id: intent.id,
      amount_cents: amountCents,
      error: err instanceof Error ? err.message : 'unknown',
      outcome: 'error',
    });
    // The webhook is the safety net: it will credit this payment on retry.
    const wallet = await getWallet(user.id).catch(() => null);
    return NextResponse.json(
      { error: 'We could not apply this payment yet. It will be credited shortly.', code: 'CREDIT_DEFERRED', wallet },
      { status: 500 }
    );
  }
}

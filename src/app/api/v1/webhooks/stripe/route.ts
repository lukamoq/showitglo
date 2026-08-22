import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { applyRefund, creditWalletFromPayment, getUser, hasStripeEvent, markStripeEvent } from '@/lib/db/store';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/webhooks/stripe
 *
 * The authoritative money-in path.
 *
 * Signature verification is unconditional — there is no development bypass,
 * because an unsigned webhook is an anonymous "give me money" endpoint.
 *
 * Dedup ordering matters as much as dedup itself: the `stripe_events` marker is
 * written only AFTER the handler has committed. Writing it first (and deleting
 * it again in a catch block) loses the event whenever the instance dies between
 * the two — the process that would have run the compensating DELETE is the one
 * that just disappeared, and Stripe's redelivery then sees a marker for work
 * that never happened. Marking afterwards degrades the other way instead: a
 * crash after the commit but before the marker replays the handler, and every
 * handler here is idempotent (the payments unique index for credits, the
 * cumulative ledger reversal for refunds and disputes).
 *
 * Status contract with Stripe:
 *   200 — handled, duplicate, or deliberately ignored (stop retrying)
 *   400 — bad or missing signature (never retryable)
 *   500 — our own failure (please retry)
 */
export async function POST(request: NextRequest) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey || !webhookSecret) {
    log('error', 'webhook.not_configured', {});
    return NextResponse.json(
      { error: 'Webhooks are not configured on this deployment.', code: 'WEBHOOK_NOT_CONFIGURED' },
      { status: 503 }
    );
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header.', code: 'BAD_SIGNATURE' }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecretKey);

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    log('warn', 'webhook.signature_invalid', { error: err instanceof Error ? err.message : 'unknown' });
    return NextResponse.json({ error: 'Invalid webhook signature.', code: 'BAD_SIGNATURE' }, { status: 400 });
  }

  try {
    if (await hasStripeEvent(event.id)) {
      log('info', 'webhook.duplicate', { event_id: event.id, event_type: event.type });
      return NextResponse.json({ received: true, duplicate: true });
    }

    const response = await dispatch(event);

    // Only now is the event "seen". A failure above threw, so no marker exists
    // and Stripe's retry re-runs the handler.
    await markStripeEvent(event.id, event.type);
    return response;
  } catch (err) {
    // Our failure, not Stripe's — return 500 so the event is redelivered.
    log('error', 'webhook.handler_failed', {
      event_id: event.id,
      event_type: event.type,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json({ error: 'Webhook processing failed.', code: 'WEBHOOK_FAILED' }, { status: 500 });
  }
}

async function dispatch(event: Stripe.Event): Promise<NextResponse> {
  switch (event.type) {
    case 'payment_intent.succeeded':
      return handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent, event.id);
    case 'charge.refunded':
      return handleChargeRefunded(event.data.object as Stripe.Charge, event.id);
    case 'charge.dispute.created':
      return handleDisputeCreated(event.data.object as Stripe.Dispute, event.id);
    default:
      log('info', 'webhook.ignored', { event_id: event.id, event_type: event.type });
      return NextResponse.json({ received: true, ignored: true, event_type: event.type });
  }
}

async function handlePaymentSucceeded(intent: Stripe.PaymentIntent, eventId: string) {
  const userId = intent.metadata?.user_id;
  const amountCents = intent.amount_received || intent.amount;

  if (!userId) {
    log('warn', 'webhook.payment.no_user_metadata', { event_id: eventId, payment_intent_id: intent.id });
    return NextResponse.json({ received: true, ignored: true, reason: 'missing_user_metadata' });
  }

  if (intent.metadata?.purpose !== 'wallet_topup') {
    log('info', 'webhook.payment.not_a_topup', { event_id: eventId, payment_intent_id: intent.id });
    return NextResponse.json({ received: true, ignored: true, reason: 'not_a_topup' });
  }

  // An intent whose metadata names a user we do not have is not an error we
  // can fix by retrying — acknowledge it and move on.
  const user = await getUser(userId);
  if (!user || user.deleted_at) {
    log('warn', 'webhook.payment.unknown_user', {
      event_id: eventId,
      payment_intent_id: intent.id,
      user_id: userId,
      amount_cents: amountCents,
    });
    return NextResponse.json({ received: true, ignored: true, reason: 'unknown_user' });
  }

  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    log('warn', 'webhook.payment.invalid_amount', { event_id: eventId, payment_intent_id: intent.id });
    return NextResponse.json({ received: true, ignored: true, reason: 'invalid_amount' });
  }

  const result = await creditWalletFromPayment({
    userId,
    amountCents,
    paymentIntentId: intent.id,
    currency: intent.currency,
  });

  log('info', 'webhook.payment.handled', {
    event_id: eventId,
    payment_intent_id: intent.id,
    user_id: userId,
    amount_cents: amountCents,
    outcome: result.credited ? 'credited' : 'already_credited',
  });

  return NextResponse.json({ received: true, credited: result.credited });
}

/**
 * `charge.refunded` carries the CUMULATIVE refunded total for the charge, not
 * the size of the latest refund. It is passed through as such, and a missing or
 * zero total means zero: falling back to `charge.amount` would turn an
 * unreadable event into a full reversal of a payment that may have been
 * refunded by a fraction of that.
 */
async function handleChargeRefunded(charge: Stripe.Charge, eventId: string) {
  const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;

  if (!paymentIntentId) {
    log('warn', 'webhook.refund.no_intent', { event_id: eventId, charge_id: charge.id });
    return NextResponse.json({ received: true, ignored: true, reason: 'no_payment_intent' });
  }

  const cumulativeRefundedCents = charge.amount_refunded ?? 0;

  const result = await applyRefund({
    paymentIntentId,
    cumulativeRefundedCents,
    dispute: false,
  });

  log('info', 'webhook.refund.handled', {
    event_id: eventId,
    payment_intent_id: paymentIntentId,
    cumulative_refunded_cents: cumulativeRefundedCents,
    debited_cents: result.debitedCents,
    reversed_total_cents: result.reversedTotalCents,
    outcome: result.applied ? 'applied' : (result.reason ?? 'no_change'),
  });

  return NextResponse.json({
    received: true,
    applied: result.applied,
    debited_cents: result.debitedCents,
    reversed_total_cents: result.reversedTotalCents,
    reason: result.reason,
  });
}

/** A chargeback reverses the whole payment, whatever the dispute row says. */
async function handleDisputeCreated(dispute: Stripe.Dispute, eventId: string) {
  const paymentIntentId =
    typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id;

  if (!paymentIntentId) {
    log('warn', 'webhook.dispute.no_intent', { event_id: eventId, dispute_id: dispute.id });
    return NextResponse.json({ received: true, ignored: true, reason: 'no_payment_intent' });
  }

  const result = await applyRefund({ paymentIntentId, dispute: true });

  log('info', 'webhook.dispute.handled', {
    event_id: eventId,
    payment_intent_id: paymentIntentId,
    dispute_amount_cents: dispute.amount,
    debited_cents: result.debitedCents,
    reversed_total_cents: result.reversedTotalCents,
    outcome: result.applied ? 'applied' : (result.reason ?? 'no_change'),
  });

  return NextResponse.json({
    received: true,
    applied: result.applied,
    debited_cents: result.debitedCents,
    reversed_total_cents: result.reversedTotalCents,
    reason: result.reason,
  });
}

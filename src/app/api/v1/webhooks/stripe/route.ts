import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db/db';

export async function POST(request: NextRequest) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const stripe = stripeSecretKey
    ? new Stripe(stripeSecretKey, { apiVersion: '2025-02-24.acacia' as any })
    : null;

  try {
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');

    let event: Stripe.Event;

    if (webhookSecret && signature && stripe) {
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch (err: any) {
        console.error('⚠️ Stripe Webhook signature verification failed:', err.message);
        return NextResponse.json({ error: `Invalid webhook signature: ${err.message}` }, { status: 400 });
      }
    } else {
      if (process.env.NODE_ENV === 'production' && webhookSecret) {
        return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
      }
      // Staging / Local testing fallback
      try {
        event = JSON.parse(rawBody);
      } catch (err) {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
      }
    }

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const userId = paymentIntent.metadata?.user_id || 'usr_marc';
      const amountCents = paymentIntent.amount;

      if (amountCents && amountCents >= 100) {
        db.topupWallet(userId, amountCents, paymentIntent.id);
        console.log(`✓ Webhook: Wallet topped up for ${userId} with $${(amountCents / 100).toFixed(2)} (${paymentIntent.id})`);
      }
    }

    return NextResponse.json({ received: true, event_type: event.type });
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    return NextResponse.json({ error: err.message || 'Webhook processing failed' }, { status: 500 });
  }
}

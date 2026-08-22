import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount_cents, user_id = 'usr_marc' } = body;

    if (!amount_cents || amount_cents < 500) {
      return NextResponse.json(
        { error: 'Minimum top-up amount is $5.00 (500 cents)' },
        { status: 400 }
      );
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (stripeSecretKey && !stripeSecretKey.includes('sk_test_placeholder')) {
      const stripe = new Stripe(stripeSecretKey, {
        apiVersion: '2026-02-01' as any,
      });

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Number(amount_cents),
        currency: 'usd',
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          user_id,
          purpose: 'wallet_topup',
          app: 'showitglo',
        },
      });

      return NextResponse.json({
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        mode: 'live_stripe',
      });
    }

    // Development / Demo fallback if Stripe keys are not yet configured in .env
    return NextResponse.json({
      client_secret: `pi_simulated_${Date.now()}_secret_${Math.random().toString(36).substring(2, 10)}`,
      payment_intent_id: `pi_simulated_${Date.now()}`,
      mode: 'simulator',
      note: 'Provide real STRIPE_SECRET_KEY in production to create live Stripe payment intents.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

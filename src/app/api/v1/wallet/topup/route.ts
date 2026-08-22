import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import '@/lib/db/seed';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount_cents, user_id = 'usr_marc', payment_method = 'apple_pay' } = body;

    if (!amount_cents || amount_cents < 100) {
      return NextResponse.json(
        { error: 'Minimum wallet top-up is $1.00 (100 cents)' },
        { status: 400 }
      );
    }

    const paymentIntentId = `pi_${payment_method}_${Date.now()}`;
    const { wallet, payment } = db.topupWallet(user_id, Number(amount_cents), paymentIntentId);

    return NextResponse.json({
      success: true,
      wallet,
      payment,
      payment_method,
      message: `Successfully funded $${(amount_cents / 100).toFixed(2)} via ${payment_method === 'apple_pay' ? 'Apple Pay' : payment_method === 'link' ? 'Stripe Link' : 'Card'}.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import '@/lib/db/seed';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { units = 1, user_id = 'usr_marc', payer_display } = body;

    const validatedUnits = Math.min(100, Math.max(1, Number(units)));
    const amountCents = validatedUnits; // $0.01 per like unit

    const result = db.recordInteraction({
      postId: id,
      userId: user_id,
      kind: 'like',
      units: validatedUnits,
      amountCents: amountCents,
      payerDisplay: payer_display || 'Marc (ShipFast)',
    });

    return NextResponse.json({
      success: true,
      units: validatedUnits,
      amount_cents: amountCents,
      new_balance_cents: result.wallet.balance_cents,
      old_rank: result.oldRank,
      new_rank: result.newRank,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

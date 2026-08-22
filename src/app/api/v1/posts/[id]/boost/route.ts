import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { InteractionKind } from '@/lib/types';
import '@/lib/db/seed';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { kind = 'boost', user_id = 'usr_marc', payer_display } = body;

    let amountCents = 10; // default $0.10 boost
    if (kind === 'super') {
      amountCents = 100; // $1.00 super boost
    }

    const result = db.recordInteraction({
      postId: id,
      userId: user_id,
      kind: kind as InteractionKind,
      units: amountCents,
      amountCents: amountCents,
      payerDisplay: payer_display || 'Marc (ShipFast)',
    });

    return NextResponse.json({
      success: true,
      kind,
      amount_cents: amountCents,
      new_balance_cents: result.wallet.balance_cents,
      old_rank: result.oldRank,
      new_rank: result.newRank,
      displaced_count: result.displacedPosts.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

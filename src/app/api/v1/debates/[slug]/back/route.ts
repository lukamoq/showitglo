import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { InteractionKind } from '@/lib/types';
import '@/lib/db/seed';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const debate = db.getDebateBySlug(slug);

    if (!debate) {
      return NextResponse.json({ error: 'Debate not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      side_key,
      kind = 'boost',
      units = 10,
      amount_cents = 0,
      visibility = 'alias',
      user_id = 'usr_marc',
      payer_display,
      opinion_text,
    } = body;

    const side = debate.sides.find((s) => s.side_key === side_key);
    if (!side) {
      return NextResponse.json({ error: 'Side not found in this debate' }, { status: 404 });
    }

    const finalAmountCents = Number(amount_cents);

    // Free Opinion / Free Vote mode ($0 cost)
    if (kind === 'free_opinion' || finalAmountCents === 0) {
      if (opinion_text && opinion_text.trim().length > 0) {
        db.addDebateOpinion({
          debateId: debate.id,
          sideKey: side_key,
          authorName: payer_display || 'Community Member',
          text: opinion_text.trim(),
          isPaid: false,
          amountCents: 0,
        });
      } else {
        db.addFreeVote(debate.id, side_key);
      }

      return NextResponse.json({
        success: true,
        side_key,
        amount_cents: 0,
        free_vote: true,
        debate: db.getDebateBySlug(slug),
      });
    }

    // Paid Conviction Backing mode
    const result = db.recordInteraction({
      postId: side.post.id,
      userId: user_id,
      kind: kind as InteractionKind,
      units: Number(units) || 1,
      amountCents: finalAmountCents,
      visibility,
      payerDisplay: payer_display || 'Marc (ShipFast)',
    });

    if (opinion_text && opinion_text.trim().length > 0) {
      db.addDebateOpinion({
        debateId: debate.id,
        sideKey: side_key,
        authorName: payer_display || 'Marc (ShipFast)',
        text: opinion_text.trim(),
        isPaid: true,
        amountCents: finalAmountCents,
      });
    }

    return NextResponse.json({
      success: true,
      side_key,
      amount_cents: finalAmountCents,
      new_balance_cents: result.wallet.balance_cents,
      new_rank: result.newRank,
      debate: db.getDebateBySlug(slug),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

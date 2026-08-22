import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import '@/lib/db/seed';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { quote_id, user_id = 'usr_marc', payer_display } = body;

    if (!quote_id) {
      return NextResponse.json({ error: 'quote_id is required' }, { status: 400 });
    }

    const quote = db.getQuote(quote_id);
    if (!quote) {
      return NextResponse.json({ error: 'Quote not found or expired' }, { status: 404 });
    }

    if (new Date(quote.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Quote expired. Please fetch a fresh price.' }, { status: 410 });
    }

    const wallet = db.getWallet(user_id);
    if (wallet.balance_cents < quote.amount_cents) {
      const shortfallCents = quote.amount_cents - wallet.balance_cents;
      return NextResponse.json({
        error: 'insufficient_wallet_balance',
        message: `Wallet balance is $${(wallet.balance_cents / 100).toFixed(2)}. You need $${(shortfallCents / 100).toFixed(2)} more to execute this power boost.`,
        current_balance_cents: wallet.balance_cents,
        required_cents: quote.amount_cents,
        shortfall_cents: shortfallCents,
      }, { status: 402 });
    }

    const result = db.recordInteraction({
      postId: quote.post_id,
      userId: user_id,
      kind: 'power',
      units: quote.amount_cents,
      amountCents: quote.amount_cents,
      quoteId: quote.quote_id,
      targetRank: quote.target_rank,
      payerDisplay: payer_display || 'Marc (ShipFast)',
    });

    return NextResponse.json({
      success: true,
      interaction: result.interaction,
      old_rank: result.oldRank,
      new_rank: result.newRank,
      new_balance_cents: result.wallet.balance_cents,
      displaced_count: result.displacedPosts.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

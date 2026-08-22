import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { InteractionKind } from '@/lib/types';
import { rateLimiter, getClientIp } from '@/lib/rateLimit';
import '@/lib/db/seed';

export async function POST(request: NextRequest) {
  // Rate limit: 60 boosts per minute per IP
  const ip = getClientIp(request);
  const rateLimitResult = rateLimiter.check(`boost_${ip}`, 60, 60000);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait a moment before boosting again.', retry_after_ms: rateLimitResult.resetInMs },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const {
      post_id,
      amount_cents,
      kind = 'boost',
      quote_id,
      target_rank,
      payer_id = 'usr_marc',
      payer_display,
    } = body;

    if (!post_id) {
      return NextResponse.json({ error: 'post_id is required' }, { status: 400 });
    }

    const post = db.getPost(post_id);
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (post.status === 'removed_tos' || post.status === 'removed_legal') {
      return NextResponse.json({ error: 'Cannot boost a removed post' }, { status: 400 });
    }

    const finalAmountCents = Number(amount_cents) || 10;
    const finalKind: InteractionKind =
      finalAmountCents >= 1000 ? 'power' : finalAmountCents >= 100 ? 'super' : 'boost';

    const wallet = db.getWallet(payer_id);

    // If insufficient balance in production, require top-up
    if (wallet.balance_cents < finalAmountCents) {
      if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_DEMO_CREDITS) {
        return NextResponse.json(
          {
            error: `Insufficient wallet balance ($${(wallet.balance_cents / 100).toFixed(2)} available, $${(finalAmountCents / 100).toFixed(2)} required). Please top up.`,
            code: 'INSUFFICIENT_WALLET_BALANCE',
            required_cents: finalAmountCents,
            balance_cents: wallet.balance_cents,
          },
          { status: 402 }
        );
      } else {
        // Development / Demo auto-topup for immediate testing
        db.topupWallet(payer_id, Math.max(500, finalAmountCents - wallet.balance_cents + 1000));
      }
    }

    // Execute atomic interaction in DB engine
    const settlement = db.recordInteraction({
      postId: post_id,
      userId: payer_id,
      kind: finalKind,
      units: finalAmountCents,
      amountCents: finalAmountCents,
      quoteId: quote_id || null,
      targetRank: target_rank ? Number(target_rank) : null,
      payerDisplay: payer_display || 'Anonymous Backer',
    });

    return NextResponse.json({
      success: true,
      interaction: settlement.interaction,
      boost: settlement.interaction, // backwards compatibility
      old_rank: settlement.oldRank,
      new_rank: settlement.newRank,
      new_balance_cents: settlement.wallet.balance_cents,
      displaced_count: settlement.displacedPosts.length,
      displaced_posts: settlement.displacedPosts.map((p) => ({
        id: p.id,
        title: p.title,
        old_rank: p.rank,
        new_rank: p.rank + 1,
      })),
    });
  } catch (err: any) {
    console.error('Error settling boost:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

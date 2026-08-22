import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { calculateDecayedScore } from '@/lib/engine/decay';
import '@/lib/db/seed';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const post = db.getPost(id);

  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }

  const category = db.getCategory(post.category_id || 'global');
  const rankedBoard = db.getRankedBoard(post.category_id || 'global');
  const currentRank = rankedBoard.findIndex((p) => p.id === post.id) + 1;
  const displayScore = calculateDecayedScore(
    post.score_base,
    Date.now(),
    category?.score_epoch || new Date().toISOString(),
    category?.half_life_hours || 168
  );

  const interactions = db.getPostInteractions(post.id);

  // Group unique crowd backers
  const backerMap: Map<string, { name: string; totalCents: number; boostCount: number }> = new Map();
  for (const b of interactions) {
    const name = b.payer_display || 'Anonymous Backer';
    const existing = backerMap.get(name) || { name, totalCents: 0, boostCount: 0 };
    existing.totalCents += b.amount_cents;
    existing.boostCount += 1;
    backerMap.set(name, existing);
  }
  const topBackers = Array.from(backerMap.values()).sort((a, b) => b.totalCents - a.totalCents);

  return NextResponse.json({
    post: {
      ...post,
      rank: currentRank > 0 ? currentRank : null,
      display_score: Number(displayScore.toFixed(2)),
    },
    category,
    boosts: interactions,
    top_backers: topBackers,
    metrics: {
      total_raised_cents: post.total_raised_cents,
      backers_count: post.backers_count,
      like_units: post.like_units,
      streak_days: post.streak_days,
    },
  });
}

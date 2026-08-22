import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { calculateDecayedScore } from '@/lib/engine/decay';
import '@/lib/db/seed';

export async function GET(request: NextRequest) {
  // Default user ID for demo/session: Marc (ShipFast)
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id') || 'usr_marc';

  const user = db.getUser(userId);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const userPosts = db.getUserPosts(userId);
  const userInteractions = db.getUserInteractions(userId);
  const notifications = db.getUserNotifications(userId);
  const rankedBoard = db.getRankedBoard('global');

  // Compute live ranks and display scores for user's posts
  const postsWithRank = userPosts.map((post) => {
    const boardIndex = rankedBoard.findIndex((p) => p.id === post.id);
    const rank = boardIndex >= 0 ? boardIndex + 1 : null;
    const cat = db.getCategory(post.category_id || 'global');
    const displayScore = calculateDecayedScore(
      post.score_base,
      Date.now(),
      cat?.score_epoch || new Date().toISOString(),
      cat?.half_life_hours || 168
    );

    return {
      ...post,
      rank,
      display_score: Number(displayScore.toFixed(2)),
    };
  });

  // Calculate total spent
  const totalSpentCents = userInteractions.reduce((acc, b) => acc + b.amount_cents, 0);

  // Filter unread outbid notifications that have 1-tap reclaim quotes
  const reclaimAlerts = notifications
    .filter((n) => n.kind === 'outbid' && !n.read_at && n.payload.reclaim_quote_id)
    .slice(0, 5);

  return NextResponse.json({
    user,
    posts: postsWithRank,
    boosts: userInteractions,
    notifications,
    reclaim_alerts: reclaimAlerts,
    metrics: {
      total_posts: userPosts.length,
      total_boosts: userInteractions.length,
      total_spent_cents: totalSpentCents,
      active_top_rank: postsWithRank.find((p) => p.rank !== null)?.rank || null,
    },
  });
}

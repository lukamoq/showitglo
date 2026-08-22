import { NextResponse } from 'next/server';

import {
  getRankedPostsByIds,
  getUser,
  getUserInteractions,
  getUserNotifications,
  getUserPosts,
  getWallet,
} from '@/lib/db/store';
import { getOrCreateSessionUser } from '@/lib/session';
import { authRequired, failure } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me/dashboard
 *
 * Everything the signed-in visitor owns, and nothing else. The user id comes
 * from the session cookie; the previous handler read it from `?user_id=`,
 * which made every other account's posts, spend history and notifications
 * readable by changing one query parameter.
 *
 * Identity is created on demand rather than demanded up front. This product has
 * no signup, so a first-time visitor legitimately has no cookie yet, and racing
 * them to a 401 turns "your dashboard is empty" into "you are not allowed in".
 */
export async function GET() {
  try {
    const session = await getOrCreateSessionUser();

    const [user, posts, interactions, notifications, wallet] = await Promise.all([
      getUser(session.id),
      getUserPosts(session.id),
      getUserInteractions(session.id, 100),
      getUserNotifications(session.id, 50),
      getWallet(session.id),
    ]);

    // The row is created before this point, so a miss means it was erased
    // between the two — genuinely no session any more.
    if (!user || user.deleted_at) return authRequired();

    // Live rank for the user's own posts, batched — never a full board scan.
    const rankedById = new Map(
      (await getRankedPostsByIds(posts.map((p) => p.id))).map((p) => [p.id, p])
    );

    const postsWithRank = posts.map((post) => {
      const ranked = rankedById.get(post.id);
      return {
        ...post,
        rank: ranked ? ranked.rank : null,
        display_score: ranked ? ranked.display_score : 0,
      };
    });

    const totalSpentCents = interactions.reduce((acc, i) => acc + i.amount_cents, 0);

    const reclaimAlerts = notifications
      .filter((n) => n.kind === 'outbid' && !n.read_at && n.payload.reclaim_quote_id)
      .slice(0, 5);

    return NextResponse.json({
      user,
      wallet,
      posts: postsWithRank,
      boosts: interactions,
      notifications,
      reclaim_alerts: reclaimAlerts,
      metrics: {
        total_posts: posts.length,
        total_boosts: interactions.length,
        total_spent_cents: totalSpentCents,
        active_top_rank:
          postsWithRank.reduce<number | null>(
            (best, p) => (p.rank !== null && (best === null || p.rank < best) ? p.rank : best),
            null
          ),
      },
    });
  } catch (err) {
    return failure('me.dashboard.failed', err);
  }
}

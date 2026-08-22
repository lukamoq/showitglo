import { NextResponse } from 'next/server';

import { getBoardStats, getPresenceCount } from '@/lib/db/store';
import { failure } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/live/stats
 *
 * The honest live numbers: concurrent visitors counted from real heartbeats in
 * the last 90 seconds, and board totals that are SQL aggregates.
 *
 * The old response carried a `total_views_all_time` counter that reset with
 * every process and only ever counted one instance's traffic. It is gone
 * rather than approximated — a number nobody can reproduce is not a metric.
 */
export async function GET() {
  try {
    const [liveVisitors, stats] = await Promise.all([getPresenceCount(), getBoardStats('global')]);

    return NextResponse.json({
      live_visitors_now: liveVisitors,
      board: {
        live_posts: stats.live_posts,
        total_raised_cents: stats.total_raised_cents,
        distinct_backers: stats.distinct_backers,
        total_interactions: stats.total_interactions,
        top_display_score: stats.top_display_score,
      },
      status: 'online',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return failure('presence.stats.failed', err);
  }
}

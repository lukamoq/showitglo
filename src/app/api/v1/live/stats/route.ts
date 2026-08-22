import { NextResponse } from 'next/server';

import { getBoardStats, getPresenceCount, getVisitorTotals } from '@/lib/db/store';
import { failure } from '@/lib/http';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/live/stats
 *
 * The honest live numbers: concurrent visitors counted from real heartbeats in
 * the last 90 seconds, cumulative visitors counted from the durable half of
 * the same heartbeat, and board totals that are SQL aggregates.
 *
 * `visitors_total` / `visitors_today` are distinct presence keys, not page
 * views — the deliberate successor to the old `total_views_all_time`, which
 * reset with every process and only ever counted one instance's traffic. A
 * number nobody can reproduce is not a metric; these two are one `COUNT` over
 * a table that survives deploys.
 */
export async function GET() {
  try {
    const [liveVisitors, visitors, stats] = await Promise.all([
      getPresenceCount(),
      // Cumulative counts are additive, not load-bearing: if the visitors
      // table is unreachable the live number still ships on its own — logged
      // rather than swallowed, so "unavailable" is diagnosable from the
      // server logs instead of only visible as a missing number in the UI.
      getVisitorTotals().catch((err) => {
        log('warn', 'visitors.totals.failed', { error: String(err) });
        return null;
      }),
      getBoardStats('global'),
    ]);

    return NextResponse.json({
      live_visitors_now: liveVisitors,
      visitors_total: visitors?.total ?? null,
      visitors_today: visitors?.today ?? null,
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

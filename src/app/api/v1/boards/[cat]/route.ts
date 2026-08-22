import { NextRequest, NextResponse } from 'next/server';

import { getBoardStats, getCategory, getFights, getRankedBoard } from '@/lib/db/store';
import { failure, notFound, readPagination } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/boards/[cat]
 *
 * The public leaderboard. Every metric below is a SQL aggregate over live
 * rows — an empty board reports zeros rather than a plausible-looking floor.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ cat: string }> }) {
  const { cat } = await params;
  const categoryId = cat || 'global';

  const page = readPagination(new URL(request.url), { defaultLimit: 50, maxLimit: 100 });
  if (!page.ok) return page.response;

  try {
    const category = await getCategory(categoryId);
    if (!category) return notFound('Category not found.', 'CATEGORY_NOT_FOUND');

    const [board, fights, stats] = await Promise.all([
      getRankedBoard(categoryId, { limit: page.limit, offset: page.offset }),
      getFights(),
      getBoardStats(categoryId),
    ]);

    return NextResponse.json({
      category: {
        id: category.id,
        name: category.name,
        half_life_hours: category.half_life_hours,
        increment_strategy: category.increment_strategy,
        increment_config: category.increment_config,
        min_power_cents: category.min_power_cents,
        score_epoch: category.score_epoch,
      },
      board,
      fights,
      metrics: {
        total_ranked_posts: stats.live_posts,
        top_price_to_beat: stats.top_display_score,
        gross_market_volume: stats.total_raised_cents / 100,
        total_boosts: stats.total_interactions,
        distinct_payers: stats.distinct_backers,
      },
      pagination: { limit: page.limit, offset: page.offset, returned: board.length },
      server_time: new Date().toISOString(),
    });
  } catch (err) {
    return failure('board.read.failed', err, { category_id: categoryId });
  }
}

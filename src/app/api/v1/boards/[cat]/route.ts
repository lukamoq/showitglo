import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import '@/lib/db/seed';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cat: string }> }
) {
  const { cat } = await params;
  const categoryId = cat || 'global';

  const category = db.getCategory(categoryId);
  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }

  const rankedBoard = db.getRankedBoard(categoryId);
  const fights = db.getFights();
  const adminStats = db.getAdminStats();

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
    board: rankedBoard,
    fights,
    metrics: {
      total_ranked_posts: rankedBoard.length,
      top_price_to_beat: rankedBoard.length > 0 ? rankedBoard[0].display_score : 0,
      gross_market_volume: adminStats.recognized_spend_dollars,
      total_boosts: adminStats.total_interactions,
      distinct_payers: adminStats.distinct_backers,
    },
    server_time: new Date().toISOString(),
  });
}

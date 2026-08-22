import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { verifyAdminAuth, createUnauthorizedResponse } from '@/lib/auth';
import '@/lib/db/seed';

export async function POST(request: NextRequest) {
  if (!verifyAdminAuth(request)) {
    return createUnauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { category_id = 'global', strategy, config, half_life_hours } = body;

    if (!strategy) {
      return NextResponse.json({ error: 'strategy is required' }, { status: 400 });
    }

    db.updateCategoryStrategy(category_id, strategy, config || {}, half_life_hours);

    return NextResponse.json({
      success: true,
      category: db.getCategory(category_id),
      message: `Strategy updated to ${strategy} with half-life ${half_life_hours || 168}h`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

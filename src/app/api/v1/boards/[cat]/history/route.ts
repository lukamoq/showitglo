import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import '@/lib/db/seed';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cat: string }> }
) {
  const { cat } = await params;
  const categoryId = cat || 'global';
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get('date');

  if (!dateStr) {
    // Return list of all available historical snapshot dates
    const allSnapshots = db.getAllSnapshots().filter((s) => s.category_id === categoryId);
    return NextResponse.json({
      category_id: categoryId,
      available_dates: allSnapshots.map((s) => s.snapshot_date).sort().reverse(),
    });
  }

  const snapshot = db.getHistoricalSnapshot(dateStr, categoryId);
  if (!snapshot) {
    return NextResponse.json(
      { error: `No historical snapshot recorded for date: ${dateStr}` },
      { status: 404 }
    );
  }

  return NextResponse.json({
    category_id: categoryId,
    snapshot_date: snapshot.snapshot_date,
    rankings: snapshot.rankings,
  });
}

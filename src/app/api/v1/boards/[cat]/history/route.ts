import { NextRequest, NextResponse } from 'next/server';

import { getCategory, getHistoricalSnapshot, getSnapshotDates } from '@/lib/db/store';
import { badRequest, failure, isCalendarDate, notFound } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/boards/[cat]/history
 *
 * With no `?date`, the calendar of dates that have a snapshot. With one, that
 * day's frozen rankings. The date is validated before it reaches SQL: `date`
 * is a typed cast in the query, and a malformed value would otherwise surface
 * as a 500 rather than the 400 it is.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ cat: string }> }) {
  const { cat } = await params;
  const categoryId = cat || 'global';
  const dateStr = new URL(request.url).searchParams.get('date');

  try {
    const category = await getCategory(categoryId);
    if (!category) return notFound('Category not found.', 'CATEGORY_NOT_FOUND');

    if (!dateStr) {
      const availableDates = await getSnapshotDates(categoryId, 365);
      return NextResponse.json({ category_id: categoryId, available_dates: availableDates });
    }

    if (!isCalendarDate(dateStr)) {
      return badRequest('date must be a calendar date in YYYY-MM-DD format.', 'INVALID_DATE');
    }

    const snapshot = await getHistoricalSnapshot(dateStr, categoryId);
    if (!snapshot) {
      return notFound(`No historical snapshot recorded for date: ${dateStr}`, 'SNAPSHOT_NOT_FOUND');
    }

    return NextResponse.json({
      category_id: categoryId,
      snapshot_date: snapshot.snapshot_date,
      rankings: snapshot.rankings,
    });
  } catch (err) {
    return failure('board.history.failed', err, { category_id: categoryId });
  }
}

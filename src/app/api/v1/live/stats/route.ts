import { NextResponse } from 'next/server';
import { presenceTracker } from '@/lib/presence/presenceTracker';

export const dynamic = 'force-dynamic';

export async function GET() {
  const presence = presenceTracker.getPresence();
  return NextResponse.json({
    live_visitors_now: presence.activeVisitors,
    total_views_all_time: presence.totalViews,
    status: 'online',
    timestamp: new Date().toISOString(),
  });
}

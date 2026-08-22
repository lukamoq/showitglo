import { NextRequest, NextResponse } from 'next/server';
import { presenceTracker } from '@/lib/presence/presenceTracker';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const sessionId = body?.session_id || request.headers.get('x-session-id') || undefined;
    const presence = presenceTracker.recordHeartbeat(sessionId);

    return NextResponse.json({
      live_visitors_now: presence.activeVisitors,
      total_views: presence.totalViews,
      status: 'active',
    });
  } catch (err: any) {
    const presence = presenceTracker.getPresence();
    return NextResponse.json({
      live_visitors_now: presence.activeVisitors,
      total_views: presence.totalViews,
      status: 'active',
    });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import '@/lib/db/seed';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id') || 'usr_marc';
  const notifications = db.getUserNotifications(userId);
  return NextResponse.json({ notifications });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { notification_id } = body;
  if (notification_id) {
    db.markNotificationRead(notification_id);
  }
  return NextResponse.json({ success: true });
}

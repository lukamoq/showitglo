import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import '@/lib/db/seed';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id') || 'usr_marc';

  const keys = db.getApiKeys(userId);
  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id = 'usr_marc', tier = 'growth' } = body;

    const apiKey = db.createApiKey(user_id, tier);
    return NextResponse.json({
      success: true,
      api_key: apiKey,
      message: `Insights API Key created with tier: ${tier.toUpperCase()}`,
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

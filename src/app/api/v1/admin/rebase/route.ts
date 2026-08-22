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
    const { category_id = 'global' } = body;

    db.rebaseBoard(category_id);

    return NextResponse.json({
      success: true,
      message: `Board ${category_id} epoch successfully rebased to current timestamp.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

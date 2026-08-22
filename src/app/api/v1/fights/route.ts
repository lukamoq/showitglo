import { NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import '@/lib/db/seed';

export async function GET() {
  const fights = db.getFights();
  return NextResponse.json({ fights });
}

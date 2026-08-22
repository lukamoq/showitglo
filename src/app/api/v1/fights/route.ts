import { NextResponse } from 'next/server';

import { getFights } from '@/lib/db/store';
import { failure } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const fights = await getFights();
    return NextResponse.json({ fights });
  } catch (err) {
    return failure('fights.list.failed', err);
  }
}

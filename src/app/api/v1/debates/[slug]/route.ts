import { NextRequest, NextResponse } from 'next/server';

import { getDebateBySlug } from '@/lib/db/store';
import { failure, notFound } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const debate = await getDebateBySlug(slug);
    if (!debate) return notFound('Debate not found.', 'DEBATE_NOT_FOUND');
    return NextResponse.json({ debate });
  } catch (err) {
    return failure('debate.read.failed', err, { slug });
  }
}

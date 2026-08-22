import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import '@/lib/db/seed';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { post_id, target_rank, amount_cents, category_id = 'global' } = body;

    if (!post_id) {
      return NextResponse.json({ error: 'post_id is required' }, { status: 400 });
    }

    const post = db.getPost(post_id);
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const quote = db.createQuote(
      post_id,
      target_rank ? Number(target_rank) : null,
      amount_cents ? Number(amount_cents) : null,
      category_id
    );

    return NextResponse.json({ quote });
  } catch (err: any) {
    console.error('Error calculating quote:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

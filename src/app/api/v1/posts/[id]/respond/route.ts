import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import '@/lib/db/seed';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const post = db.getPost(id);

    if (!post) {
      return NextResponse.json({ error: 'Demand post not found' }, { status: 404 });
    }

    const body = await request.json();
    const { title, response_body, author_user_id = 'usr_mcd', author_display = "McDonald's Corporate" } = body;

    if (!title || !response_body) {
      return NextResponse.json({ error: 'Title and response_body are required' }, { status: 400 });
    }

    const response = db.createBrandResponse({
      postId: post.id,
      authorUserId: author_user_id,
      authorDisplay: author_display,
      title: title.trim(),
      body: response_body.trim(),
    });

    return NextResponse.json({
      success: true,
      brand_response: response,
      message: 'Official brand response successfully published on public record.',
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

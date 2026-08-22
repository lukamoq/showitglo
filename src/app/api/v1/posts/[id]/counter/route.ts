import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { Post } from '@/lib/types';
import { slugify } from '@/lib/utils';
import { runGate0Moderation } from '@/lib/moderation/gate0';
import '@/lib/db/seed';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parentPost = db.getPost(id);

    if (!parentPost) {
      return NextResponse.json({ error: 'Original opinion not found' }, { status: 404 });
    }

    const body = await request.json();
    const { title, content, author_display = 'anonymous', user_id = 'usr_marc', initial_boost_cents } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Rebuttal statement is required' }, { status: 400 });
    }

    const modResult = runGate0Moderation(title, content);
    if (!modResult.passed) {
      return NextResponse.json(
        { error: 'Counter-opinion failed moderation check', flags: modResult.flags, reason: modResult.reason },
        { status: 422 }
      );
    }

    const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const baseSlug = slugify(title);
    const uniqueSlug = `${baseSlug}-${postId.substring(5, 10)}`;

    const counterPost: Post = {
      id: postId,
      slug: uniqueSlug,
      author_id: user_id,
      category_id: parentPost.category_id || 'global',
      kind: 'opinion',
      title: title.trim(),
      body: content ? content.trim() : null,
      is_ad: false,
      counter_of: parentPost.id, // Linked Rebuttal!
      author_display,
      status: 'live',
      score_base: 0,
      total_raised_cents: 0,
      backers_count: 0,
      like_units: 0,
      streak_days: 0,
      created_at: new Date().toISOString(),
    };

    db.createPost(counterPost);

    // If initial boost specified, record interaction from wallet
    if (initial_boost_cents && initial_boost_cents >= 10) {
      const wallet = db.getWallet(user_id);
      if (wallet.balance_cents >= initial_boost_cents) {
        db.recordInteraction({
          postId: counterPost.id,
          userId: user_id,
          kind: 'power',
          units: initial_boost_cents,
          amountCents: initial_boost_cents,
          payerDisplay: author_display,
        });
      }
    }

    return NextResponse.json({
      success: true,
      post: counterPost,
      parent_post: parentPost,
      message: 'Counter-opinion successfully paired with original post!',
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

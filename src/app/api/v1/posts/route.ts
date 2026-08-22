import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { Post, PostKind } from '@/lib/types';
import { slugify } from '@/lib/utils';
import { runGate0Moderation } from '@/lib/moderation/gate0';
import '@/lib/db/seed';

function detectPlatform(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('twitter.com') || host.includes('x.com')) return 'x';
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'youtube';
    if (host.includes('reddit.com')) return 'reddit';
    if (host.includes('tiktok.com')) return 'tiktok';
    if (host.includes('substack.com') || host.includes('medium.com')) return 'article';
    return host.replace('www.', '');
  } catch {
    return 'link';
  }
}

export async function GET() {
  const posts = db.getAllPosts().filter((p) => p.status === 'live');
  return NextResponse.json({ posts });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, content, author_display, category_id, initial_boost_cents, kind = 'opinion', demand_target, source_url } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (title.length > 200) {
      return NextResponse.json({ error: 'Title must be under 200 characters' }, { status: 400 });
    }

    // Gate 0 automated safety check
    const modResult = runGate0Moderation(title, content);
    if (!modResult.passed) {
      return NextResponse.json(
        {
          error: 'Content failed automated moderation check',
          flags: modResult.flags,
          reason: modResult.reason,
        },
        { status: 422 }
      );
    }

    const postId = `post_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const baseSlug = slugify(title);
    const uniqueSlug = `${baseSlug}-${postId.substring(5, 10)}`;

    const platform = source_url ? detectPlatform(source_url) : null;

    const newPost: Post = {
      id: postId,
      slug: uniqueSlug,
      author_id: 'usr_marc', // Default active session user for demo
      category_id: category_id || 'global',
      kind: (kind as PostKind) || 'opinion',
      demand_target: demand_target ? demand_target.trim() : null,
      source_url: source_url ? source_url.trim() : null,
      source_platform: platform,
      title: title.trim(),
      body: content ? content.trim() : null,
      is_ad: false,
      counter_of: null,
      author_display: author_display || 'Marc (ShipFast)',
      status: 'live',
      score_base: 0,
      total_raised_cents: 0,
      backers_count: 0,
      like_units: 0,
      streak_days: 0,
      created_at: new Date().toISOString(),
    };

    db.createPost(newPost);

    // If an initial boost is attached, immediately settle it
    if (initial_boost_cents && initial_boost_cents >= 10) {
      const wallet = db.getWallet(newPost.author_id);
      if (wallet.balance_cents < initial_boost_cents) {
        db.topupWallet(newPost.author_id, Math.max(500, initial_boost_cents));
      }

      db.recordInteraction({
        postId: newPost.id,
        userId: newPost.author_id,
        kind: initial_boost_cents >= 1000 ? 'power' : initial_boost_cents >= 100 ? 'super' : 'boost',
        units: initial_boost_cents,
        amountCents: initial_boost_cents,
        payerDisplay: newPost.author_display,
      });
    }

    return NextResponse.json({ post: newPost }, { status: 201 });
  } catch (err: any) {
    console.error('Error creating post:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import { slugify } from '@/lib/utils';
import { Post, Debate, DebateSide } from '@/lib/types';
import '@/lib/db/seed';

export async function GET() {
  const debates = db.getDebates();
  return NextResponse.json({ debates });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, sides, author_display = 'Community Creator', category_id = 'global' } = body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    if (!sides || !Array.isArray(sides) || sides.length < 2) {
      return NextResponse.json({ error: 'At least 2 sides/factions are required to create a war.' }, { status: 400 });
    }

    if (sides.length > 6) {
      return NextResponse.json({ error: 'Maximum 6 sides allowed per war.' }, { status: 400 });
    }

    const debateId = `deb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const slug = `${slugify(question).substring(0, 50)}-${debateId.substring(4, 8)}`;

    const createdSides: DebateSide[] = [];

    // Create underlying posts for each side
    for (let i = 0; i < sides.length; i++) {
      const sideItem = sides[i];
      const sideKey = slugify(sideItem.label || `side-${i + 1}`);
      const postId = `post_${debateId}_${sideKey}`;

      const post: Post = {
        id: postId,
        slug: `${slug}-${sideKey}`,
        author_id: 'usr_marc',
        category_id,
        kind: 'opinion',
        title: `⚔️ ${sideItem.label}: ${question}`,
        body: sideItem.description || `Community thesis for ${sideItem.label}`,
        is_ad: false,
        counter_of: null,
        author_display,
        status: 'live',
        score_base: 1000 + (sides.length - i) * 100,
        total_raised_cents: 0,
        backers_count: 0,
        like_units: 0,
        streak_days: 0,
        created_at: new Date().toISOString(),
      };

      db.createPost(post);

      createdSides.push({
        debate_id: debateId,
        side_key: sideKey,
        label: sideItem.label,
        post_id: postId,
      });
    }

    const newDebate: Debate = {
      id: debateId,
      slug,
      question: question.trim(),
      status: 'live',
      curated: true,
      is_political: false,
      category_id,
      sponsor_user_id: null,
      sponsor_label: `Created by ${author_display}`,
      created_at: new Date().toISOString(),
    };

    db.createDebate(newDebate, createdSides);

    const fullDebate = db.getDebateBySlug(slug);
    return NextResponse.json({ debate: fullDebate }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

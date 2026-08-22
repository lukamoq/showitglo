import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/db';
import '@/lib/db/seed';

export async function GET() {
  const reports = db.getReports();
  const allPosts = db.getAllPosts();
  const actions = db.getModerationActions();

  return NextResponse.json({
    reports,
    pending_posts: allPosts.filter((p) => p.status === 'pending_review'),
    recent_actions: actions,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { post_id, action, reason, actor_id = 'usr_admin' } = body;

    if (!post_id || !action) {
      return NextResponse.json({ error: 'post_id and action are required' }, { status: 400 });
    }

    db.moderatePost(post_id, action, reason || 'Admin review action', actor_id);

    return NextResponse.json({
      success: true,
      post: db.getPost(post_id),
      message: `Post ${action} applied successfully`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

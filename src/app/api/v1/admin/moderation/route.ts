import { NextRequest, NextResponse } from 'next/server';

import {
  getModerationActions,
  getOpenReports,
  getOpenReportsCount,
  getPost,
  getPostsByStatus,
  getReports,
  moderatePost,
} from '@/lib/db/store';
import { guardAdmin } from '@/lib/auth';
import { assertSameOrigin, getSessionUser } from '@/lib/session';
import {
  badOrigin,
  badRequest,
  enumField,
  failure,
  notFound,
  optionalText,
  readJsonBody,
  requiredText,
} from '@/lib/http';

export const dynamic = 'force-dynamic';

const ACTIONS = ['approve', 'reject', 'remove', 'restore'] as const;

/** Actions that put something on the public record need a stated reason. */
const REASON_REQUIRED: ReadonlySet<string> = new Set(['reject', 'remove']);

export async function GET(request: NextRequest) {
  const denied = guardAdmin(request);
  if (denied) return denied;

  try {
    const [reports, openReports, openReportsCount, pendingPosts, actions] = await Promise.all([
      getReports(100),
      getOpenReports(100),
      getOpenReportsCount(),
      getPostsByStatus('pending_review', 100),
      getModerationActions(100),
    ]);

    // `pending_posts` is the escalated queue: everything sitting in
    // pending_review, whether it got there through Gate 0 at creation or
    // through three distinct reporters after publication. `open_reports` is
    // the work list — reports nobody has resolved yet, including those on
    // posts that have not reached the escalation threshold.
    return NextResponse.json({
      reports,
      open_reports: openReports,
      open_reports_count: openReportsCount,
      pending_posts: pendingPosts,
      escalated_count: pendingPosts.length,
      recent_actions: actions,
    });
  } catch (err) {
    return failure('admin.moderation.read.failed', err);
  }
}

/**
 * POST /api/v1/admin/moderation
 *
 * Applies a moderation decision. `actor_id` used to come from the body and
 * defaulted to a hardcoded string — it now comes from the operator's own
 * session, so the audit row names whoever actually made the call.
 */
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return badOrigin();

  const denied = guardAdmin(request);
  if (denied) return denied;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const postRef = optionalText(body.post_id, { field: 'post_id', max: 200 });
  if (!postRef.ok) return postRef.response;
  if (!postRef.value) return badRequest('post_id is required.', 'INVALID_FIELD', { field: 'post_id' });

  const action = enumField<(typeof ACTIONS)[number]>(body.action, { field: 'action', allowed: ACTIONS });
  if (!action.ok) return action.response;

  let reason = 'Admin review action';
  if (REASON_REQUIRED.has(action.value)) {
    const parsedReason = requiredText(body.reason, { field: 'reason', max: 500, multiline: true });
    if (!parsedReason.ok) return parsedReason.response;
    reason = parsedReason.value;
  } else {
    const parsedReason = optionalText(body.reason, { field: 'reason', max: 500, multiline: true });
    if (!parsedReason.ok) return parsedReason.response;
    reason = parsedReason.value || reason;
  }

  try {
    const post = await getPost(postRef.value);
    if (!post) return notFound('Post not found.', 'POST_NOT_FOUND');

    const session = await getSessionUser();
    const updated = await moderatePost(post.id, action.value, reason, session?.id ?? null);

    return NextResponse.json({
      success: true,
      post: updated,
      message: `Post ${action.value} applied successfully`,
    });
  } catch (err) {
    return failure('admin.moderation.apply.failed', err);
  }
}

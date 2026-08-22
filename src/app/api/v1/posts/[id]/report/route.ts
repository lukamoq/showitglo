import { NextRequest, NextResponse } from 'next/server';

import { REPORT_REASONS, ReportReason, checkDbRateLimit, reportPost } from '@/lib/db/store';
import { badOrigin, enumField, failure, optionalText, rateLimited, readJsonBody } from '@/lib/http';
import { assertSameOrigin, getOrCreateSessionUser } from '@/lib/session';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

const MAX_DETAIL = 500;

/**
 * POST /api/v1/posts/[id]/report
 *
 * Community moderation signal. Three DISTINCT reporters pull a live post off
 * the board into `pending_review`, where a human decides. Three is low on
 * purpose — a wrongly hidden post is restored in one click and costs its
 * author some rank; a genuinely illegal one staying up costs a lot more.
 *
 * Two properties matter more than the happy path:
 *
 *   * A repeat report by the same session is a 200 with `duplicate: true` and
 *     changes nothing. The unique index makes that true in the database, not
 *     just here, so one person cannot manufacture the threshold alone.
 *   * The response never reveals how many others have reported. Returning a
 *     count would let a competitor watch a rival's post approach removal, and
 *     tell a brigade exactly how many more clicks they need.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!assertSameOrigin(request)) return badOrigin();

  const { id } = await params;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const reason = enumField<ReportReason>(parsed.body.reason, {
    field: 'reason',
    allowed: REPORT_REASONS,
  });
  if (!reason.ok) return reason.response;

  const detail = optionalText(parsed.body.detail, {
    field: 'detail',
    max: MAX_DETAIL,
    multiline: true,
  });
  if (!detail.ok) return detail.response;

  try {
    const user = await getOrCreateSessionUser();

    // Five a day, shared across instances. Filing reports is free, so without
    // this one session could paper the board with them.
    const limit = await checkDbRateLimit(`report:u:${user.id}`, 5, 86400);
    if (!limit.allowed) {
      return rateLimited('You have filed the maximum number of reports for today.', limit.resetInMs);
    }

    const outcome = await reportPost({
      postId: id,
      reporterId: user.id,
      reason: reason.value,
      detail: detail.value,
    });

    if (outcome.escalated) {
      log('warn', 'moderation.auto_escalated', {
        post_ref: id,
        distinct_reporters: outcome.distinctReporters,
      });
    }

    return NextResponse.json({
      success: true,
      duplicate: outcome.duplicate,
      escalated: outcome.escalated,
    });
  } catch (err) {
    return failure('post.report.failed', err, { post_ref: id });
  }
}

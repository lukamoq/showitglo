import { NextRequest, NextResponse } from 'next/server';

import { getUserNotifications, markNotificationRead } from '@/lib/db/store';
import { assertSameOrigin, getSessionUser } from '@/lib/session';
import {
  authRequired,
  badOrigin,
  badRequest,
  failure,
  optionalText,
  readJsonBody,
  readPagination,
} from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const page = readPagination(new URL(request.url), { defaultLimit: 50, maxLimit: 100 });
  if (!page.ok) return page.response;

  try {
    const session = await getSessionUser();
    if (!session) return authRequired();

    const notifications = await getUserNotifications(session.id, page.limit);
    return NextResponse.json({ notifications });
  } catch (err) {
    return failure('me.notifications.read.failed', err);
  }
}

/**
 * POST /api/v1/me/notifications
 *
 * Marks one notification read. Ownership is enforced in the UPDATE's WHERE
 * clause, so a guessed id belonging to someone else simply changes nothing.
 *
 * The response is the same whether the row was updated, already read, or
 * never existed: the operation is idempotent (a double-click must not fail),
 * and a distinguishable 404 would turn this into an oracle for which
 * notification ids are real.
 */
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return badOrigin();

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const notificationId = optionalText(parsed.body.notification_id, {
    field: 'notification_id',
    max: 200,
  });
  if (!notificationId.ok) return notificationId.response;
  if (!notificationId.value) {
    return badRequest('notification_id is required.', 'INVALID_FIELD', { field: 'notification_id' });
  }

  try {
    const session = await getSessionUser();
    if (!session) return authRequired();

    await markNotificationRead(notificationId.value, session.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return failure('me.notifications.mark.failed', err);
  }
}

export { POST as PATCH };

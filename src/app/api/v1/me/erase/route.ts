import { NextRequest, NextResponse } from 'next/server';

import { eraseUser } from '@/lib/db/store';
import { assertSameOrigin, SESSION_COOKIE, getSessionUser } from '@/lib/session';
import { isProduction } from '@/lib/env';
import { authRequired, badOrigin, badRequest, failure } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/me/erase
 *
 * GDPR Article 17 erasure, for the session's own account only.
 *
 * The previous handler took `user_id` from the request body, which meant a
 * single unauthenticated POST could tombstone any account on the platform.
 * The account erased here is whichever one the signed cookie attests to, and
 * `{ confirm: true }` is required so the destructive path cannot be reached
 * by an empty POST.
 */
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return badOrigin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body.');
  }

  const confirm = (body as { confirm?: unknown })?.confirm;
  if (confirm !== true) {
    return badRequest(
      'Erasure requires an explicit { "confirm": true } acknowledgement.',
      'CONFIRMATION_REQUIRED'
    );
  }

  try {
    const session = await getSessionUser();
    if (!session) return authRequired();

    const result = await eraseUser(session.id);

    const response = NextResponse.json({
      success: true,
      erased: result.erased,
      message:
        'GDPR Right to Erasure processed. Personal data anonymised and authored posts tombstoned.',
    });

    // The cookie still names a now-tombstoned user; clearing it here means the
    // next request starts a fresh identity rather than a dead one.
    response.cookies.set(SESSION_COOKIE, '', {
      httpOnly: true,
      secure: isProduction(),
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (err) {
    return failure('me.erase.failed', err);
  }
}

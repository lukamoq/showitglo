import { NextRequest, NextResponse } from 'next/server';

import { consumeAuthToken, getUser, logAudit } from '@/lib/db/store';
import { linkBase } from '@/lib/email';
import { buildSessionCookie } from '@/lib/session';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/auth/magic?token=…
 *
 * The end of wallet recovery: this is the ONE place in the product where a
 * session cookie is issued for a user that the caller did not already prove
 * they were. Everything that makes it safe is in the token.
 *
 *   * It is consumed atomically, so a link that reaches two devices signs in
 *     exactly one of them.
 *   * Only sha256 of it was ever stored, so it cannot be recovered from a
 *     database dump.
 *   * It lives 30 minutes and it was mailed to an address that was itself
 *     confirmed by a click, so possession of it is possession of the mailbox
 *     the wallet was secured with.
 *
 * The cookie is written onto the redirect response rather than through
 * `cookies().set()` so the Set-Cookie header travels with the 302 the browser
 * actually follows, with no dependence on request-scope mutation ordering.
 */
export async function GET(request: NextRequest) {
  const base = linkBase(request);
  const back = (state: string) => NextResponse.redirect(new URL(`/dashboard?recovered=${state}`, base), 302);

  const token = new URL(request.url).searchParams.get('token');
  if (!token) return back('invalid');

  try {
    const consumed = await consumeAuthToken(token, 'recover');
    if (!consumed) {
      log('info', 'auth.magic.rejected', {});
      return back('invalid');
    }

    // The wallet could have been erased between the mail and the click. A
    // cookie for a tombstoned user resolves to nobody, so refuse rather than
    // hand out a session that silently mints a fresh anonymous identity.
    const user = await getUser(consumed.user_id);
    if (!user || user.deleted_at) {
      log('info', 'auth.magic.user_gone', { user_id: consumed.user_id });
      return back('invalid');
    }

    await logAudit({
      actor_id: user.id,
      actor_type: 'user',
      action: 'wallet_recovered',
      entity_type: 'user',
      entity_id: user.id,
      detail: {},
      ip_hash: null,
    });

    const response = back('1');
    const cookie = buildSessionCookie(user.id);
    response.cookies.set(cookie.name, cookie.value, cookie.options);

    log('info', 'auth.magic.recovered', { user_id: user.id });
    return response;
  } catch (err) {
    log('error', 'auth.magic.failed', { error: err instanceof Error ? err.message : 'unknown' });
    return back('invalid');
  }
}

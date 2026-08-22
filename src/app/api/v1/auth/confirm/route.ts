import { NextRequest, NextResponse } from 'next/server';

import { consumeAuthToken, linkUserEmail, logAudit } from '@/lib/db/store';
import { linkBase, maskEmail } from '@/lib/email';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/auth/confirm?token=…
 *
 * The click at the end of "link my email". The token is consumed atomically —
 * validated and burned in one UPDATE — so a link that is followed twice (a
 * mail client prefetching it, a double tap, a forwarded message) links the
 * address exactly once.
 *
 * Every outcome is a 302 back to the dashboard with a state in the query
 * string rather than JSON: this URL is opened by a human in a browser from
 * their inbox, and a raw JSON body is a dead end for them.
 */
export async function GET(request: NextRequest) {
  const base = linkBase(request);
  const back = (state: string) => NextResponse.redirect(new URL(`/dashboard?linked=${state}`, base), 302);

  const token = new URL(request.url).searchParams.get('token');
  if (!token) return back('invalid');

  try {
    const consumed = await consumeAuthToken(token, 'link_email');
    if (!consumed || !consumed.email) {
      // Unknown, expired or already-used. All three are the same answer on
      // purpose — distinguishing them tells whoever holds a stale link which
      // kind of stale it is, and none of the three is actionable anyway.
      log('info', 'auth.confirm.rejected', {});
      return back('invalid');
    }

    const outcome = await linkUserEmail(consumed.user_id, consumed.email);

    if (outcome === 'conflict') {
      // The address was claimed by another wallet between issuing this token
      // and clicking it. users.email is UNIQUE, so the database refused it and
      // nothing changed; recovery is the route that gets them into that wallet.
      log('info', 'auth.confirm.conflict', { user_id: consumed.user_id, email: maskEmail(consumed.email) });
      return back('conflict');
    }

    if (outcome === 'user_gone') {
      log('info', 'auth.confirm.user_gone', { user_id: consumed.user_id });
      return back('invalid');
    }

    await logAudit({
      actor_id: consumed.user_id,
      actor_type: 'user',
      action: 'email_linked',
      entity_type: 'user',
      entity_id: consumed.user_id,
      detail: { email_masked: maskEmail(consumed.email) },
      ip_hash: null,
    });

    log('info', 'auth.confirm.linked', { user_id: consumed.user_id, email: maskEmail(consumed.email) });
    return back('1');
  } catch (err) {
    log('error', 'auth.confirm.failed', { error: err instanceof Error ? err.message : 'unknown' });
    return back('invalid');
  }
}

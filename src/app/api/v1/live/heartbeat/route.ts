import { createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getPresenceCount, heartbeat } from '@/lib/db/store';
import { getSessionSecret } from '@/lib/env';
import { assertSameOrigin, getSessionUser, presenceKeyFor } from '@/lib/session';
import { getClientIp, rateLimiter } from '@/lib/rateLimit';
import { badOrigin, failure, rateLimited } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Presence key for a visitor with no session cookie yet.
 *
 * HMAC'd under SESSION_SECRET, not plain-hashed: the IPv4+user-agent keyspace
 * is small enough to brute-force from a table dump, so an unkeyed hash would
 * be pseudonymous in name only. With the secret in the mix, a leaked
 * presence table reveals nothing.
 */
function anonymousPresenceKey(request: NextRequest): string {
  const ip = getClientIp(request);
  const agent = request.headers.get('user-agent') || 'unknown';
  return createHmac('sha256', getSessionSecret())
    .update(`presence:${ip}:${agent}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * POST /api/v1/live/heartbeat
 *
 * Records that someone is here, right now.
 *
 * Presence lives in Postgres rather than a per-process map: on a platform that
 * runs many instances, an in-memory counter reports only the slice of visitors
 * that happened to land on the same instance, which is why the previous
 * implementation could never show a true number.
 *
 * The `session_id` a client sends is ignored for keying — a client-chosen id
 * is trivially spoofable into inflating the count.
 */
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return badOrigin();

  const ip = getClientIp(request);
  const limit = rateLimiter.check(`hb_${ip}`, 12, 60000);
  if (!limit.success) {
    return rateLimited('Heartbeat rate limit exceeded.', limit.resetInMs);
  }

  try {
    const session = await getSessionUser();
    const key = session ? presenceKeyFor(session.id) : anonymousPresenceKey(request);

    await heartbeat(key);
    const liveVisitors = await getPresenceCount();

    return NextResponse.json({ live_visitors_now: liveVisitors, status: 'active' });
  } catch (err) {
    return failure('presence.heartbeat.failed', err);
  }
}

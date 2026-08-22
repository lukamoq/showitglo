import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

import { getAppUrl, getSessionSecret, isProduction } from './env';
import { createAnonymousUser, getUser } from './db/store';

/**
 * Anonymous session identity.
 *
 * The product has no signup. Every visitor gets a server-issued user row bound
 * to a signed, HttpOnly cookie. Identity comes from that cookie and nowhere
 * else — a `user_id` in a request body is attacker-controlled and is always
 * ignored.
 *
 * Cookie format: `v1.<uuid>.<base64url(HMAC-SHA256("v1." + uuid, SESSION_SECRET))>`
 */

export const SESSION_COOKIE = 'sig_uid';

const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60; // 400 days — the browser cap
const VERSION = 'v1';

export interface SessionUser {
  id: string;
  alias: string | null;
  role: 'user' | 'moderator' | 'admin';
  status: string;
}

function sign(payload: string): string {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

function mintCookieValue(userId: string): string {
  const payload = `${VERSION}.${userId}`;
  return `${payload}.${sign(payload)}`;
}

/** Verifies the HMAC in constant time and returns the user id it attests to. */
function parseCookieValue(raw: string | undefined): string | null {
  if (!raw) return null;

  const parts = raw.split('.');
  if (parts.length !== 3) return null;

  const [version, userId, signature] = parts;
  if (version !== VERSION || !userId || !signature) return null;

  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = Buffer.from(sign(`${version}.${userId}`), 'utf8');
    provided = Buffer.from(signature, 'utf8');
  } catch {
    return null;
  }

  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  return userId;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

/**
 * Reads the session cookie and loads the user.
 * Returns null when the cookie is absent, forged, or points at a deleted user.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const userId = parseCookieValue(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

  const user = await getUser(userId);
  if (!user || user.deleted_at) return null;

  return { id: user.id, alias: user.alias, role: user.role, status: user.status };
}

/**
 * Returns the current session user, lazily creating one on first contact.
 *
 * Setting a cookie is only legal in a route handler or server action; in a
 * server component the write is a no-op and the caller simply gets a
 * transient user. Callers that need a persisted identity (every mutation)
 * run inside route handlers.
 */
export async function getOrCreateSessionUser(): Promise<SessionUser> {
  const existing = await getSessionUser();
  if (existing) return existing;

  const user = await createAnonymousUser();
  const store = await cookies();
  try {
    store.set(SESSION_COOKIE, mintCookieValue(user.id), cookieOptions());
  } catch {
    // Read-only cookie context (server component render). The user row exists;
    // the browser just will not retain it until a mutating request runs.
  }

  return { id: user.id, alias: user.alias, role: user.role, status: user.status };
}

/** Clears the session cookie (used after erasure). */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  try {
    store.set(SESSION_COOKIE, '', { ...cookieOptions(), maxAge: 0 });
  } catch {
    /* read-only context */
  }
}

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * CSRF defence for mutations.
 *
 * A browser always sends `Origin` on cross-site POSTs, so requiring it to match
 * our own host blocks form-based CSRF. A missing Origin means a non-browser
 * client (curl, server-to-server, native app), which cannot be tricked by a
 * third-party page — those are allowed through.
 */
export function assertSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  const originHost = hostOf(origin);
  if (!originHost) return false;

  const requestHost = (request.headers.get('host') || '').toLowerCase();
  if (requestHost && originHost === requestHost) return true;

  const configuredHost = hostOf(getAppUrl());
  if (configuredHost && originHost === configuredHost) return true;

  return false;
}

/** Fresh session cookie value — for routes that rotate or re-issue identity. */
export function buildSessionCookie(userId: string): { name: string; value: string; options: ReturnType<typeof cookieOptions> } {
  return { name: SESSION_COOKIE, value: mintCookieValue(userId), options: cookieOptions() };
}

/**
 * Stable, non-identifying key for presence counting. Derived from the session
 * id so one visitor counts once, hashed so the presence table never stores
 * anything that links back to a user row.
 */
export function presenceKeyFor(userId: string): string {
  return createHmac('sha256', getSessionSecret()).update(`presence:${userId}`).digest('hex').slice(0, 32);
}

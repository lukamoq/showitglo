import { createHash, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

/**
 * Admin authentication.
 *
 * FAIL CLOSED: with no ADMIN_SECRET_KEY configured there is no way to
 * authenticate, so every request is rejected — including in development.
 * The previous behaviour (unset key ⇒ allow everything) turned every admin
 * endpoint into an open one the moment the variable was forgotten.
 */

const MIN_SECRET_LENGTH = 16;

export function isAdminConfigured(): boolean {
  const secret = process.env.ADMIN_SECRET_KEY;
  return typeof secret === 'string' && secret.trim().length >= MIN_SECRET_LENGTH;
}

/**
 * Constant-time comparison over sha256 digests. Hashing first means both
 * buffers are always 32 bytes, so the comparison cannot leak the secret's
 * length the way a raw timingSafeEqual on differing lengths would.
 */
function secretsMatch(candidate: string, expected: string): boolean {
  const a = createHash('sha256').update(candidate, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

function extractPresentedKey(request: Request): string | null {
  const headerKey = request.headers.get('x-admin-key');
  if (headerKey && headerKey.trim().length > 0) return headerKey.trim();

  const authHeader = request.headers.get('authorization');
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token.length > 0) return token;
  }

  return null;
}

export function verifyAdminAuth(request: Request): boolean {
  const configured = process.env.ADMIN_SECRET_KEY;
  if (!configured || configured.trim().length < MIN_SECRET_LENGTH) return false;

  const presented = extractPresentedKey(request);
  if (!presented) return false;

  return secretsMatch(presented, configured.trim());
}

export function createUnauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Unauthorized: invalid or missing admin credentials.', code: 'ADMIN_AUTH_REQUIRED' },
    { status: 401 }
  );
}

export function createAdminNotConfiguredResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Admin access is not configured on this deployment.', code: 'ADMIN_NOT_CONFIGURED' },
    { status: 503 }
  );
}

/**
 * One-call guard for admin routes: returns the response to send, or null when
 * the caller is authenticated and the handler should continue.
 */
export function guardAdmin(request: Request): NextResponse | null {
  if (!isAdminConfigured()) return createAdminNotConfiguredResponse();
  if (!verifyAdminAuth(request)) return createUnauthorizedResponse();
  return null;
}

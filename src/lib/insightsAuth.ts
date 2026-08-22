/**
 * Authentication for the paid Insights API.
 *
 * Two ways in: a customer's `sig_live_...` bearer token, or the operator's
 * admin key. Anonymous access is not one of them — these endpoints are the
 * product, and they were previously world-readable.
 */

import { NextResponse } from 'next/server';

import { checkDbRateLimit, verifyApiKey } from './db/store';
import type { ApiKeyMetadata } from './db/store';
import { isAdminConfigured, verifyAdminAuth } from './auth';
import { jsonError, rateLimited } from './http';

export type InsightsCaller =
  | { kind: 'api_key'; key: ApiKeyMetadata }
  | { kind: 'admin' };

export type InsightsAuthResult =
  | { ok: true; caller: InsightsCaller }
  | { ok: false; response: NextResponse };

const BEARER = /^Bearer\s+/i;

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header || !BEARER.test(header)) return null;
  const token = header.replace(BEARER, '').trim();
  return token.length > 0 ? token : null;
}

/**
 * Verifies the caller and charges their per-minute quota.
 *
 * The rate limit is keyed on the API key id in Postgres rather than in
 * process memory: a per-instance counter is not a quota when the platform
 * runs many instances, it is a suggestion.
 */
export async function authenticateInsights(request: Request): Promise<InsightsAuthResult> {
  const token = bearerToken(request);

  // The admin key also arrives as a bearer token, so try it first and fall
  // through to customer keys — this keeps operator access working without
  // minting a customer key for ourselves.
  if (isAdminConfigured() && verifyAdminAuth(request)) {
    return { ok: true, caller: { kind: 'admin' } };
  }

  if (!token) {
    return {
      ok: false,
      response: jsonError(
        'A valid Insights API key is required. Send it as: Authorization: Bearer sig_live_...',
        'API_KEY_REQUIRED',
        401
      ),
    };
  }

  const key = await verifyApiKey(token);
  if (!key) {
    return {
      ok: false,
      response: jsonError('Invalid or revoked Insights API key.', 'API_KEY_INVALID', 401),
    };
  }

  const limit = await checkDbRateLimit(`insights:k:${key.id}`, key.rate_limit_per_min, 60);
  if (!limit.allowed) {
    return {
      ok: false,
      response: rateLimited(
        `Rate limit of ${key.rate_limit_per_min} requests per minute exceeded for this key.`,
        limit.resetInMs
      ),
    };
  }

  return { ok: true, caller: { kind: 'api_key', key } };
}

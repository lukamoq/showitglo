import { NextRequest, NextResponse } from 'next/server';

import { checkDbRateLimit, createApiKey, getApiKeys, revokeApiKey } from '@/lib/db/store';
import { assertSameOrigin, getOrCreateSessionUser } from '@/lib/session';
import { badOrigin, badRequest, failure, notFound, optionalText, rateLimited, readJsonBody } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/insights/keys
 *
 * The session's own keys, as metadata only. Neither the token nor its hash is
 * ever returned — a key is shown exactly once, at creation, and after that
 * only its prefix exists outside the customer's own records.
 *
 * Uses getOrCreate, not getSession: a first-time visitor has no cookie yet, and
 * answering their first page load with 401 makes the developer surface look
 * broken to everyone who has not already spent money. An empty list is the
 * truthful answer for a brand-new identity.
 */
export async function GET() {
  try {
    const user = await getOrCreateSessionUser();
    const keys = await getApiKeys(user.id);
    return NextResponse.json({ keys });
  } catch (err) {
    return failure('insights.keys.list.failed', err);
  }
}

/**
 * POST /api/v1/insights/keys
 *
 * Issues a self-serve key. The tier is forced to `starter` regardless of what
 * the client asks for: tier determines the rate limit a paying customer has
 * bought, and there is no billing path yet that could justify granting a
 * higher one on request.
 */
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return badOrigin();

  try {
    const user = await getOrCreateSessionUser();

    const limit = await checkDbRateLimit(`keys:u:${user.id}`, 3, 86400);
    if (!limit.allowed) {
      return rateLimited('You have reached the daily limit for new API keys.', limit.resetInMs);
    }

    const apiKey = await createApiKey(user.id, 'starter');

    return NextResponse.json(
      {
        success: true,
        api_key: apiKey,
        warning:
          'This token is shown once and is not recoverable. Store it now — we keep only its hash.',
        message: 'Insights API key created with tier: STARTER',
      },
      { status: 201 }
    );
  } catch (err) {
    return failure('insights.keys.create.failed', err);
  }
}

/**
 * DELETE /api/v1/insights/keys
 *
 * Revokes one of the session's own keys, by id, from the body.
 *
 * A key that cannot be turned off is a permanent liability the moment it leaks
 * — until now the only way to stop one was to delete the row and lose the
 * record that it ever existed. Revocation is a tombstone: the key stays
 * visible in the customer's list, marked dead, and `verifyApiKey` refuses it.
 *
 * A key id belonging to someone else returns the same 404 as one that does not
 * exist, so this cannot be used to probe for other people's key ids.
 */
export async function DELETE(request: NextRequest) {
  if (!assertSameOrigin(request)) return badOrigin();

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const keyId = optionalText(parsed.body.key_id, { field: 'key_id', max: 100 });
  if (!keyId.ok) return keyId.response;
  if (!keyId.value) return badRequest('key_id is required.', 'INVALID_FIELD', { field: 'key_id' });

  try {
    const user = await getOrCreateSessionUser();

    const revoked = await revokeApiKey(user.id, keyId.value);
    if (!revoked) return notFound('No active key with that id belongs to this account.', 'KEY_NOT_FOUND');

    return NextResponse.json({ success: true, key_id: keyId.value, revoked: true });
  } catch (err) {
    return failure('insights.keys.revoke.failed', err, { key_id: keyId.value });
  }
}

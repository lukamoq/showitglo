import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

import { checkDbRateLimit, createAuthToken, findUserByRealEmail } from '@/lib/db/store';
import { emailAvailable, emailNotConfigured, linkBase, maskEmail, sendRecoveryLink } from '@/lib/email';
import { badOrigin, emailField, failure, rateLimited, readJsonBody } from '@/lib/http';
import { getClientIp } from '@/lib/rateLimit';
import { assertSameOrigin } from '@/lib/session';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/** The one answer this endpoint gives, whether or not the address is known. */
const NEUTRAL = {
  success: true,
  message: 'If that email secures a wallet, a recovery link is on its way.',
};

/**
 * POST /api/v1/auth/recover
 *
 * Sends a magic link to the address a wallet was secured with. Deliberately
 * takes NO session: the whole point is that the caller has lost theirs, so
 * requiring a valid cookie would make the feature useless exactly when it is
 * needed.
 *
 * Because it is unauthenticated it is also the most attackable surface added
 * in this phase, and it is built around two facts:
 *
 *   * The response never varies. A known address and an unknown one get the
 *     same 200 and the same sentence, so the endpoint cannot be used to test
 *     whether a person has an account here.
 *   * Placeholder addresses (`…@anon.showitglo.local`) can never match, so
 *     knowing a user's uuid — which appears in no public surface, but is not
 *     a secret either — is not a path into their wallet.
 *
 * The per-address limit is keyed on sha256(email) so the rate-limit table,
 * which is not otherwise sensitive, never accumulates a list of the addresses
 * people typed in.
 */
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return badOrigin();

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const email = emailField(parsed.body.email);
  if (!email.ok) return email.response;

  // Answered before the address is looked up — see emailAvailable().
  if (!emailAvailable()) return failure('auth.recover.unavailable', emailNotConfigured());

  try {
    const ip = getClientIp(request);
    const emailKey = createHash('sha256').update(email.value, 'utf8').digest('hex').slice(0, 32);
    // Hash the IP like the email — raw addresses must not persist in rate buckets.
    const ipKey = createHash('sha256').update(ip, 'utf8').digest('hex').slice(0, 32);

    const [perIp, perEmail] = await Promise.all([
      checkDbRateLimit(`recover:ip:${ipKey}`, 5, 3600),
      checkDbRateLimit(`recover:e:${emailKey}`, 3, 3600),
    ]);
    if (!perIp.allowed || !perEmail.allowed) {
      return rateLimited(
        'Too many recovery attempts. Try again later.',
        Math.max(perIp.resetInMs, perEmail.resetInMs)
      );
    }

    const user = await findUserByRealEmail(email.value);
    if (!user) {
      log('info', 'auth.recover.unknown', { email: maskEmail(email.value) });
      return NextResponse.json(NEUTRAL);
    }

    const token = await createAuthToken({ userId: user.id, purpose: 'recover', email: email.value });
    const link = `${linkBase(request)}/api/v1/auth/magic?token=${encodeURIComponent(token.token)}`;

    try {
      await sendRecoveryLink(email.value, link);
      log('info', 'auth.recover.sent', { user_id: user.id, email: maskEmail(email.value) });
    } catch (sendErr) {
      // A provider outage is logged for us and stays invisible to the caller.
      // Surfacing it here would answer 502 for an address that exists and 200
      // for one that does not — the enumeration difference this endpoint is
      // built to not have. The link expires unused; retrying is free.
      log('error', 'auth.recover.send_failed', {
        user_id: user.id,
        error: sendErr instanceof Error ? sendErr.message : 'unknown',
      });
    }

    return NextResponse.json(NEUTRAL);
  } catch (err) {
    return failure('auth.recover.failed', err);
  }
}

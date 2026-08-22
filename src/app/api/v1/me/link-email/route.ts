import { NextRequest, NextResponse } from 'next/server';

import {
  checkDbRateLimit,
  createAuthToken,
  findUserByRealEmail,
  getRealEmailForUser,
} from '@/lib/db/store';
import {
  emailAvailable,
  emailNotConfigured,
  linkBase,
  maskEmail,
  sendAlreadyLinkedNotice,
  sendLinkConfirmation,
} from '@/lib/email';
import { badOrigin, emailField, failure, rateLimited, readJsonBody } from '@/lib/http';
import { getClientIp } from '@/lib/rateLimit';
import { assertSameOrigin, getOrCreateSessionUser } from '@/lib/session';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/** The single answer this endpoint gives, whatever it actually did. */
const NEUTRAL = { success: true, message: 'Check your inbox to confirm.' };

/**
 * POST /api/v1/me/link-email
 *
 * Attaches an OPTIONAL email to the anonymous session. The arena stays
 * anonymous-first: the address is used for wallet recovery and payment
 * receipts and for nothing else, and nothing about the account changes until
 * the confirmation link in the mail is clicked.
 *
 * The response is the SAME sentence in every branch — new address, address
 * already held by someone else, address already on this session. It has to be:
 * a distinguishable answer turns this endpoint into a free oracle for "does
 * this person have a ShowItGlo wallet", which is precisely the fact an
 * anonymous product exists to withhold. The two rate limits (per user, per IP)
 * close the same door from the other side by bounding how fast the oracle
 * could be probed even if a difference ever leaked through timing.
 */
export async function POST(request: NextRequest) {
  if (!assertSameOrigin(request)) return badOrigin();

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const email = emailField(parsed.body.email);
  if (!email.ok) return email.response;

  // Refused before any token is minted: a confirmation token nobody can be
  // sent is a live credential with no purpose.
  if (!emailAvailable()) return failure('auth.link_email.unavailable', emailNotConfigured());

  try {
    const user = await getOrCreateSessionUser();
    const ip = getClientIp(request);

    const [perUser, perIp] = await Promise.all([
      checkDbRateLimit(`linkmail:u:${user.id}`, 3, 3600),
      checkDbRateLimit(`linkmail:ip:${ip}`, 10, 3600),
    ]);
    if (!perUser.allowed || !perIp.allowed) {
      return rateLimited(
        'Too many confirmation emails requested. Try again later.',
        Math.max(perUser.resetInMs, perIp.resetInMs)
      );
    }

    const holder = await findUserByRealEmail(email.value);

    // Someone else already secures a wallet with this address. Mint NO token —
    // a confirmation link here would let a stranger's click move an address
    // away from the wallet it protects. The owner is told instead, at the
    // address that is already theirs, so the notice can only ever reach them.
    if (holder && holder.id !== user.id) {
      await sendAlreadyLinkedNotice(email.value);
      log('info', 'auth.link_email.already_taken', { user_id: user.id, email: maskEmail(email.value) });
      return NextResponse.json(NEUTRAL);
    }

    const current = await getRealEmailForUser(user.id);
    const token = await createAuthToken({ userId: user.id, purpose: 'link_email', email: email.value });
    const link = `${linkBase(request)}/api/v1/auth/confirm?token=${encodeURIComponent(token.token)}`;

    await sendLinkConfirmation(email.value, link);

    log('info', 'auth.link_email.requested', {
      user_id: user.id,
      email: maskEmail(email.value),
      relink: current !== null,
    });

    return NextResponse.json(NEUTRAL);
  } catch (err) {
    // EMAIL_NOT_CONFIGURED (503) and EMAIL_SEND_FAILED (502) are StoreErrors and
    // reach the client with their own code, because "we cannot send mail on this
    // deployment" is honest information the UI must be able to show. Neither
    // says anything about whether the address exists.
    return failure('auth.link_email.failed', err);
  }
}

import { NextResponse } from 'next/server';

import { getOrCreateSessionUser } from '@/lib/session';
import { getRealEmailForUser, getWallet, getWalletLedger } from '@/lib/db/store';
import { maskEmail } from '@/lib/email';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/wallet
 *
 * Also the session bootstrap endpoint: the first call mints the anonymous user
 * and sets the signed cookie, so the client never has to know or send an id.
 *
 * The linked address is reported as a boolean plus a mask (a***@d***.com),
 * never in full. The UI's only questions are "do I need to ask for a receipt
 * address" and "which address should I show them" — and a full address in a
 * JSON body is one XSS or one shared screenshot away from being the exact PII
 * an anonymous product promised not to expose.
 */
export async function GET() {
  try {
    const user = await getOrCreateSessionUser();
    const [wallet, ledger, linkedEmail] = await Promise.all([
      getWallet(user.id),
      getWalletLedger(user.id, 100),
      getRealEmailForUser(user.id),
    ]);

    return NextResponse.json({
      wallet,
      ledger,
      has_receipt_email: linkedEmail !== null,
      receipt_email_masked: linkedEmail ? maskEmail(linkedEmail) : null,
    });
  } catch (err) {
    log('error', 'wallet.read.failed', { error: err instanceof Error ? err.message : 'unknown' });
    return NextResponse.json(
      { error: 'Could not load your wallet right now.', code: 'WALLET_UNAVAILABLE' },
      { status: 503 }
    );
  }
}

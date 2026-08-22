/**
 * Transactional email — wallet recovery links only.
 *
 * ShowItGlo is anonymous-first. The only mail this module ever sends is the
 * mail a visitor explicitly asked for by typing their address into the
 * "secure your wallet" card, and it exists for exactly two purposes: getting a
 * lost wallet back, and letting Stripe send a payment receipt. There is no
 * marketing list, no digest, no re-engagement mail.
 *
 * Three rules the rest of the codebase depends on:
 *
 *   1. NOTHING IS LOGGED THAT COULD BE REPLAYED. A magic link is a bearer
 *      credential for a wallet with real money in it. Tokens never reach the
 *      logger, and addresses are masked (a***@d***.com) before they do.
 *   2. NO KEY MEANS NO PRETENDING. With RESEND_API_KEY unset the send throws
 *      a 503 EMAIL_NOT_CONFIGURED that routes surface honestly, rather than
 *      returning success for a message that was never queued.
 *   3. THE TEST HOOK CANNOT RUN IN PRODUCTION. `getEmailDebugFile()` returns
 *      null whenever NODE_ENV === 'production', so the file that captures
 *      every outgoing link can only ever exist on a developer's machine.
 *
 * Plain `fetch` against the Resend REST API — no SDK, no new dependency.
 */

import { appendFile } from 'fs/promises';

import { StoreError } from './db/store';
import { getAppUrl, getEmailDebugFile, getNotificationsFromAddress, getResendApiKey } from './env';
import { log } from './log';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10000;

export const MAX_EMAIL_LENGTH = 254;

/**
 * RFC-lite address validation.
 *
 * Deliberately not a full RFC 5322 parser: the only question that matters
 * here is "could this plausibly be delivered", and the authoritative answer
 * arrives when the confirmation link is clicked. Everything this rejects
 * (spaces, control characters, missing dot in the domain, two @s) is
 * undeliverable in practice, and a stricter regex mostly rejects valid
 * addresses belonging to real people.
 */
const EMAIL_RE = /^[^\s@,;:<>"'\\[\]()]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

export function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_EMAIL_LENGTH) return false;
  return EMAIL_RE.test(trimmed);
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** `alice@example.com` → `a***@e***.com`. Safe to log; useless to a scraper. */
export function maskEmail(value: string | null | undefined): string {
  if (!value) return 'unknown';
  const at = value.lastIndexOf('@');
  if (at <= 0) return '***';

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const domainHead = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';

  return `${local[0]}***@${domainHead[0] ?? '*'}***${tld}`;
}

/** The synthetic addresses on anonymous and tombstoned users. Never mailable. */
export const PLACEHOLDER_EMAIL_DOMAIN = '@anon.showitglo.local';

export function isPlaceholderEmail(value: string | null | undefined): boolean {
  return !value || value.toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN);
}

export type EmailPurpose = 'link_email' | 'already_linked' | 'recover';

export function emailNotConfigured(): StoreError {
  return new StoreError(
    'EMAIL_NOT_CONFIGURED',
    'Email is not enabled on this deployment yet.',
    503
  );
}

/**
 * Whether this deployment can send at all.
 *
 * Routes check this BEFORE looking an address up, not after. If the 503 were
 * raised at send time, `/auth/recover` would answer 503 for an address that
 * exists and 200 for one that does not — turning a missing API key into the
 * account-enumeration oracle the whole endpoint is shaped to avoid.
 */
export function emailAvailable(): boolean {
  return getEmailDebugFile() !== null || getResendApiKey() !== null;
}

// ==========================================================================
// Templates
// ==========================================================================

/**
 * A plain table layout with inline styles, because that is the only thing
 * every mail client renders the same way. Dark surface + gold accent to match
 * the arena, with a light-friendly fallback background on the outer table.
 */
function renderShell(heading: string, bodyHtml: string, footerNote: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#0B0D14;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0D14;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#11141F;border:1px solid rgba(255,255,255,0.10);border-radius:14px;">
      <tr><td style="padding:28px 28px 8px 28px;font-family:Helvetica,Arial,sans-serif;">
        <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#F0A824;font-weight:700;">ShowItGlo</div>
        <h1 style="margin:10px 0 0 0;font-size:20px;line-height:1.3;color:#F6F7FA;font-weight:700;">${heading}</h1>
      </td></tr>
      <tr><td style="padding:12px 28px 28px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#C6CCD8;">
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:0 28px 26px 28px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#7E8797;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;">
        ${footerNote}<br />
        Your address is used only for wallet recovery and payment receipts — nothing else.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function renderButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="background:#F0A824;border-radius:10px;">
  <a href="${href}" style="display:inline-block;padding:12px 22px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#0B0D14;text-decoration:none;">${label}</a>
</td></tr></table>
<p style="margin:0;font-size:12px;color:#7E8797;word-break:break-all;">Or paste this link into your browser:<br />${href}</p>`;
}

interface Message {
  subject: string;
  html: string;
  text: string;
}

function confirmMessage(link: string): Message {
  return {
    subject: 'Confirm your ShowItGlo wallet email',
    html: renderShell(
      'Confirm this address to secure your wallet',
      `<p style="margin:0;">Someone — we hope you — asked to attach this address to a ShowItGlo wallet. Confirming it means you can get the balance back if you lose your browser session, and that Stripe can send you a receipt when you add funds.</p>
       ${renderButton(link, 'Confirm and secure my wallet')}
       <p style="margin:18px 0 0 0;font-size:13px;color:#9AA3B2;">The link works once and expires in 30 minutes.</p>`,
      'If you did not ask for this, ignore this email — nothing was linked and no wallet was changed.'
    ),
    text: `Confirm this address to secure your ShowItGlo wallet.\n\n${link}\n\nThe link works once and expires in 30 minutes. If you did not ask for this, ignore this email — nothing was linked.\n\nYour address is used only for wallet recovery and payment receipts.`,
  };
}

function alreadyLinkedMessage(): Message {
  return {
    subject: 'This address already secures a ShowItGlo wallet',
    html: renderShell(
      'This address already secures a wallet',
      `<p style="margin:0;">Someone asked to attach this address to a ShowItGlo wallet, but it already secures one. We did not link anything, and no existing wallet was changed.</p>
       <p style="margin:16px 0 0 0;">If that wallet is yours and you have lost the session, use <strong style="color:#F6F7FA;">Recover wallet</strong> in the site footer to have a sign-in link sent here.</p>`,
      'If this was not you, no action is needed — nothing was linked.'
    ),
    text: `Someone asked to attach this address to a ShowItGlo wallet, but it already secures one. Nothing was linked and no wallet was changed.\n\nIf that wallet is yours and you have lost the session, use "Recover wallet" in the site footer to have a sign-in link sent here.`,
  };
}

function recoverMessage(link: string): Message {
  return {
    subject: 'Your ShowItGlo wallet recovery link',
    html: renderShell(
      'Get back into your wallet',
      `<p style="margin:0;">Use the link below to restore the session that owns this wallet — your balance, your ranked stances, your ledger.</p>
       ${renderButton(link, 'Restore my wallet session')}
       <p style="margin:18px 0 0 0;font-size:13px;color:#9AA3B2;">The link works once and expires in 30 minutes. Anyone who opens it gets into the wallet, so do not forward it.</p>`,
      'If you did not ask to recover a wallet, ignore this email — the link expires on its own and nothing has changed.'
    ),
    text: `Use this link to restore the ShowItGlo session that owns your wallet:\n\n${link}\n\nThe link works once and expires in 30 minutes. Anyone who opens it gets into the wallet, so do not forward it. If you did not ask for this, ignore this email.`,
  };
}

// ==========================================================================
// Delivery
// ==========================================================================

/**
 * Absolute base for the links in outgoing mail.
 *
 * NEXT_PUBLIC_APP_URL is authoritative when configured. The request origin is
 * the fallback so local development and the integration suite (which run on an
 * ephemeral port) produce links that actually resolve. It is never used to
 * decide *who* anything belongs to — only where to point a URL.
 */
export function linkBase(request?: Request): string {
  const configured = getAppUrl();
  if (configured) return configured;
  if (request) {
    try {
      return new URL(request.url).origin;
    } catch {
      /* fall through */
    }
  }
  return 'http://localhost:3000';
}

async function deliver(to: string, purpose: EmailPurpose, message: Message, link: string | null): Promise<void> {
  // Test hook. Development only (see getEmailDebugFile) — the integration
  // suite reads the captured links out of this file to drive the end-to-end
  // link/confirm/recover flow without a mail provider.
  const debugFile = getEmailDebugFile();
  if (debugFile) {
    await appendFile(debugFile, `${purpose} ${link ?? '-'}\n`, 'utf8');
    log('info', 'email.captured', { purpose, to: maskEmail(to) });
    return;
  }

  const apiKey = getResendApiKey();
  if (!apiKey) throw emailNotConfigured();

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: getNotificationsFromAddress(),
        to: [to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (err) {
    log('error', 'email.send.failed', {
      purpose,
      to: maskEmail(to),
      error: err instanceof Error ? err.message : 'unknown',
    });
    throw new StoreError('EMAIL_SEND_FAILED', 'Could not send the email. Please try again.', 502);
  }

  if (!res.ok) {
    // The body can echo the address back; only the status is safe to keep.
    log('error', 'email.send.rejected', { purpose, to: maskEmail(to), status: res.status });
    throw new StoreError('EMAIL_SEND_FAILED', 'Could not send the email. Please try again.', 502);
  }

  log('info', 'email.sent', { purpose, to: maskEmail(to) });
}

export function sendLinkConfirmation(to: string, link: string): Promise<void> {
  return deliver(to, 'link_email', confirmMessage(link), link);
}

export function sendAlreadyLinkedNotice(to: string): Promise<void> {
  return deliver(to, 'already_linked', alreadyLinkedMessage(), null);
}

export function sendRecoveryLink(to: string, link: string): Promise<void> {
  return deliver(to, 'recover', recoverMessage(link), link);
}

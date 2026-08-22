/**
 * Environment contract.
 *
 * validateEnv() warns by default and refuses to boot ONLY when
 * STRICT_ENV_CHECK=true is set (it IS set in the Vercel production
 * environment — deploys there fail fast on a missing secret). Independent of
 * that flag, getSessionSecret() always hard-fails in production rather than
 * signing cookies with the repo-committed dev constant.
 *
 * `next build` must succeed with no secrets present at all.
 */

export const DEV_SESSION_SECRET = 'dev-insecure-session-secret-do-not-use';

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function present(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

interface EnvRule {
  key: string;
  requirement: string;
  valid: (value: string | undefined) => boolean;
}

const RULES: EnvRule[] = [
  {
    key: 'DATABASE_URL',
    requirement: 'a Postgres connection string',
    valid: (v) => present(v) && /^postgres(ql)?:\/\//.test(v.trim()),
  },
  {
    key: 'SESSION_SECRET',
    requirement: 'at least 32 characters of random entropy',
    valid: (v) => present(v) && v.trim().length >= 32 && v.trim() !== DEV_SESSION_SECRET,
  },
  {
    key: 'STRIPE_SECRET_KEY',
    requirement: 'a Stripe secret key (sk_...) or restricted key (rk_...)',
    valid: (v) => present(v) && (v.trim().startsWith('sk_') || v.trim().startsWith('rk_')),
  },
  {
    key: 'STRIPE_WEBHOOK_SECRET',
    requirement: 'a Stripe webhook signing secret (whsec_...)',
    valid: (v) => present(v) && v.trim().startsWith('whsec_'),
  },
  {
    key: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    requirement: 'a Stripe publishable key (pk_...)',
    valid: (v) => present(v) && v.trim().startsWith('pk_'),
  },
  {
    key: 'ADMIN_SECRET_KEY',
    requirement: 'at least 16 characters',
    valid: (v) => present(v) && v.trim().length >= 16,
  },
  {
    key: 'NEXT_PUBLIC_APP_URL',
    requirement: 'an https:// URL for the deployed app',
    valid: (v) => present(v) && isHttpsUrl(v.trim()),
  },
];

export interface EnvProblem {
  key: string;
  requirement: string;
}

/** Returns every env rule the current process fails. */
export function collectEnvProblems(): EnvProblem[] {
  return RULES.filter((rule) => !rule.valid(process.env[rule.key])).map((rule) => ({
    key: rule.key,
    requirement: rule.requirement,
  }));
}

/**
 * Throws a single aggregated error in production listing every missing or
 * malformed variable. Warns (never throws) in development.
 */
/**
 * Optional variables worth mentioning once at boot in development.
 *
 * Deliberately NOT part of RULES: adding them there would make a deploy fail
 * under STRICT_ENV_CHECK for a feature that is designed to self-disable, and
 * turning "wallet recovery is off" into "the site will not start" is a far
 * worse outage than the one it would be warning about.
 */
function warnOptional(): void {
  if (isProduction()) return;

  if (!present(process.env.RESEND_API_KEY)) {
    console.warn(
      '[env] RESEND_API_KEY unset — optional email link and magic-link wallet recovery are disabled ' +
        '(those two endpoints answer 503 EMAIL_NOT_CONFIGURED). Stripe receipts are unaffected.'
    );
  } else if (!present(process.env.NOTIFICATIONS_FROM_EMAIL)) {
    console.warn(
      `[env] NOTIFICATIONS_FROM_EMAIL unset — sending from "${DEFAULT_NOTIFICATIONS_FROM}", ` +
        "Resend's shared sandbox sender. Set a verified domain before relying on delivery."
    );
  }
}

export function validateEnv(): void {
  warnOptional();

  const problems = collectEnvProblems();
  if (problems.length === 0) return;

  if (process.env.STRICT_ENV_CHECK !== 'true') {
    for (const problem of problems) {
      console.warn(`[env] ${problem.key} is missing or invalid — expected ${problem.requirement}. Using graceful fallback.`);
    }
    return;
  }

  const lines = problems.map((p) => `  - ${p.key}: expected ${p.requirement}`);
  throw new Error(
    `Refusing to start: ${problems.length} required environment variable(s) are missing or invalid.\n${lines.join('\n')}`
  );
}

/**
 * The HMAC key for session cookies. Production callers are guaranteed a real
 * secret because validateEnv() aborts boot otherwise; dev gets a fixed,
 * obviously-insecure constant so cookies survive a server restart.
 */
export function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (present(configured) && configured.trim().length >= 32) return configured.trim();

  // NON-NEGOTIABLE in production, independent of STRICT_ENV_CHECK: the dev
  // fallback constant is committed to this repository. Signing session cookies
  // with it in production would let anyone forge any user's identity and drain
  // their wallet. Failing this one request is strictly safer.
  if (isProduction()) {
    throw new Error('SESSION_SECRET is not configured (must be >= 32 characters).');
  }

  if (!warnedSessionSecret) {
    warnedSessionSecret = true;
    console.warn('[env] SESSION_SECRET unset — using the development fallback.');
  }
  return DEV_SESSION_SECRET;
}

let warnedSessionSecret = false;

/** Minimum distinct backers before an insights aggregate may be published. */
export function getInsightsKMin(): number {
  const raw = Number(process.env.INSIGHTS_K_MIN);
  if (!Number.isFinite(raw) || raw < 1) return 100;
  return Math.floor(raw);
}

export function getAppUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!present(raw)) return null;
  return raw.trim().replace(/\/+$/, '');
}

export function isStripeConfigured(): boolean {
  return present(process.env.STRIPE_SECRET_KEY);
}

export function isStripePublishableConfigured(): boolean {
  return present(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

/** True only when the full payment path can work end to end. */
export function isPaymentsReady(): boolean {
  return isStripeConfigured() && isStripePublishableConfigured() && isStripeWebhookConfigured();
}

export function isStripeWebhookConfigured(): boolean {
  return present(process.env.STRIPE_WEBHOOK_SECRET);
}

export function isDatabaseConfigured(): boolean {
  return present(process.env.DATABASE_URL);
}

// --------------------------------------------------------------------------
// Transactional email (OPTIONAL — the feature self-disables without it)
//
// RESEND_API_KEY is deliberately absent from RULES: wallet recovery and
// payment receipts are additions to an anonymous-first product, not
// preconditions for it. With no key the app keeps working and the two
// surfaces that need mail answer 503 EMAIL_NOT_CONFIGURED instead of
// pretending a message was sent.
// --------------------------------------------------------------------------

export const DEFAULT_NOTIFICATIONS_FROM = 'ShowItGlo <onboarding@resend.dev>';

export function getResendApiKey(): string | null {
  const raw = process.env.RESEND_API_KEY;
  return present(raw) ? raw.trim() : null;
}

export function isEmailConfigured(): boolean {
  return getResendApiKey() !== null;
}

export function getNotificationsFromAddress(): string {
  const raw = process.env.NOTIFICATIONS_FROM_EMAIL;
  return present(raw) ? raw.trim() : DEFAULT_NOTIFICATIONS_FROM;
}

/**
 * Path the test harness collects outgoing links in, INSTEAD of calling Resend.
 * Refused in production: a file that captures every magic link is a credential
 * store, and it must not be possible to switch one on with an env var on a
 * live deployment.
 */
export function getEmailDebugFile(): string | null {
  if (isProduction()) return null;
  const raw = process.env.EMAIL_DEBUG_FILE;
  return present(raw) ? raw.trim() : null;
}

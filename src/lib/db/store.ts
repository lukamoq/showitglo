/**
 * ShowItGlo persistence layer.
 *
 * The async, Postgres-backed replacement for the in-memory AttentionMarketDB.
 * Method names and return shapes mirror the in-memory AttentionMarketDB this
 * replaced (now Promises), so route migration was mechanical. That module has
 * since been deleted — this is the only persistence layer.
 *
 * Rules this module enforces:
 *   * Every money mutation happens inside ONE transaction with the wallet and
 *     post rows locked FOR UPDATE, in that order (wallet → post) everywhere,
 *     so concurrent spends can never deadlock or double-debit.
 *   * Nothing correctness-critical lives in process memory. The event bus is
 *     used only for best-effort SSE fanout on the local instance.
 *   * Aggregates come from SQL, never from loading tables into JS.
 */

import { randomUUID, createHash, randomBytes } from 'crypto';
import type { PoolClient, QueryResultRow } from 'pg';

import {
  ApiKey,
  AuditLog,
  BoardSnapshot,
  BrandResponse,
  Category,
  Debate,
  DebateSide,
  DebateView,
  InsightDemandAggregate,
  Interaction,
  InteractionKind,
  ModerationAction,
  Notification,
  Payment,
  Post,
  PostBacker,
  PostStatus,
  Quote,
  RankedPostView,
  Report,
  FightPair,
  User,
  Wallet,
  WalletLedgerEntry,
} from '../types';
import {
  calculateDecayedScore,
  calculateStoredDelta,
  dollarsNeededForScore,
} from '../engine/decay';
import { getRequiredScoreToDisplace } from '../engine/strategies';
import { eventBus } from '../engine/eventBus';
import { getInsightsKMin } from '../env';
import { log } from '../log';
import { queryPg, withTransaction } from './pg';

// ==========================================================================
// Errors
// ==========================================================================

/** Domain error carrying the HTTP status and machine code a route should emit. */
export class StoreError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, status = 400, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isStoreError(err: unknown): err is StoreError {
  return err instanceof StoreError;
}

/** Internal sentinel: unwinds a transaction when an idempotency key replays. */
class IdempotentReplay extends Error {
  constructor(readonly key: string) {
    super('idempotent_replay');
  }
}

// ==========================================================================
// Row helpers
// ==========================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return iso(value);
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function shortId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
}

/**
 * The only representation of a bearer credential this database ever holds.
 * Used for B2B API keys and for the single-use auth tokens behind wallet
 * recovery: a leaked table row must not be replayable against the app.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Runs on a transaction client when given, otherwise on the pool. */
async function run<T extends QueryResultRow = QueryResultRow>(
  client: PoolClient | null,
  text: string,
  params: unknown[] = []
) {
  if (client) return client.query<T>(text, params as never);
  return queryPg<T>(text, params);
}

// --- mappers ---------------------------------------------------------------

function mapUser(row: QueryResultRow): User {
  return {
    id: row.id,
    email: row.email,
    email_verified_at: isoOrNull(row.email_verified_at),
    alias: row.alias ?? null,
    is_profile_public: !!row.is_profile_public,
    brand_verified_at: isoOrNull(row.brand_verified_at),
    stripe_customer_id: row.stripe_customer_id ?? null,
    role: row.role,
    status: row.status,
    notif_prefs: row.notif_prefs ?? { inapp: true, email: true, push: true, outbid_digest: true },
    created_at: iso(row.created_at),
    deleted_at: isoOrNull(row.deleted_at),
  };
}

function mapWallet(row: QueryResultRow): Wallet {
  return {
    user_id: row.user_id,
    balance_cents: num(row.balance_cents),
    daily_cap_cents: num(row.daily_cap_cents),
    status: row.status,
    lifetime_topup_cents: num(row.lifetime_topup_cents),
    lifetime_spend_cents: num(row.lifetime_spend_cents),
    updated_at: iso(row.updated_at),
  };
}

function mapLedger(row: QueryResultRow): WalletLedgerEntry {
  return {
    id: num(row.id),
    user_id: row.user_id,
    delta_cents: num(row.delta_cents),
    kind: row.kind,
    ref_type: row.ref_type,
    ref_id: row.ref_id ?? null,
    balance_after_cents: num(row.balance_after_cents),
    created_at: iso(row.created_at),
  };
}

function mapCategory(row: QueryResultRow): Category {
  return {
    id: row.id,
    name: row.name,
    is_live: !!row.is_live,
    half_life_hours: num(row.half_life_hours, 168),
    increment_strategy: row.increment_strategy,
    increment_config: row.increment_config ?? {},
    score_epoch: iso(row.score_epoch),
    min_power_cents: num(row.min_power_cents, 1000),
  };
}

function mapPost(row: QueryResultRow): Post {
  return {
    id: row.id,
    slug: row.slug,
    author_id: row.author_id,
    category_id: row.category_id,
    kind: row.kind,
    title: row.title,
    body: row.body ?? null,
    media_url: row.media_url ?? null,
    is_ad: !!row.is_ad,
    demand_target: row.demand_target ?? null,
    demand_target_user_id: row.demand_target_user_id ?? null,
    counter_of: row.counter_of ?? null,
    source_url: row.source_url ?? null,
    source_platform: row.source_platform ?? null,
    author_display: row.author_display,
    status: row.status,
    score_base: num(row.score_base),
    total_raised_cents: num(row.total_raised_cents),
    backers_count: num(row.backers_count),
    like_units: num(row.like_units),
    streak_days: num(row.streak_days),
    created_at: iso(row.created_at),
    removed_at: isoOrNull(row.removed_at),
    removed_reason: row.removed_reason ?? null,
  };
}

function mapInteraction(row: QueryResultRow): Interaction {
  return {
    id: row.id,
    post_id: row.post_id,
    user_id: row.user_id,
    category_id: row.category_id,
    kind: row.kind,
    units: num(row.units, 1),
    amount_cents: num(row.amount_cents),
    stored_delta: num(row.stored_delta),
    visibility: row.visibility,
    quote_id: row.quote_id ?? null,
    target_rank: row.target_rank ?? null,
    achieved_rank: row.achieved_rank ?? null,
    payer_display: row.payer_display ?? undefined,
    created_at: iso(row.created_at),
  };
}

function mapBacker(row: QueryResultRow): PostBacker {
  return {
    post_id: row.post_id,
    user_id: row.user_id,
    total_cents: num(row.total_cents),
    visibility: row.visibility,
    first_backed_at: iso(row.first_backed_at),
    user_display: row.user_display ?? undefined,
  };
}

function mapPayment(row: QueryResultRow): Payment {
  return {
    id: row.id,
    user_id: row.user_id,
    stripe_payment_intent_id: row.stripe_payment_intent_id,
    amount_cents: num(row.amount_cents),
    currency: row.currency,
    status: row.status,
    failure_code: row.failure_code ?? null,
    card_fingerprint: row.card_fingerprint ?? null,
    risk_score: row.risk_score ?? null,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function mapQuote(row: QueryResultRow): Quote {
  return {
    quote_id: row.quote_id,
    post_id: row.post_id,
    category_id: row.category_id,
    target_rank: row.target_rank ?? null,
    amount_cents: num(row.amount_cents),
    estimated_achieved_rank: num(row.estimated_achieved_rank),
    holder_score: num(row.holder_score),
    my_current_score: num(row.my_current_score),
    needed_score_delta: num(row.needed_score_delta),
    expires_at: iso(row.expires_at),
    created_at: iso(row.created_at),
  };
}

function mapNotification(row: QueryResultRow): Notification {
  return {
    id: row.id,
    user_id: row.user_id,
    kind: row.kind,
    payload: row.payload ?? { message: '' },
    channels: row.channels ?? ['inapp'],
    read_at: isoOrNull(row.read_at),
    created_at: iso(row.created_at),
  };
}

function mapBrandResponse(row: QueryResultRow): BrandResponse {
  return {
    id: row.id,
    post_id: row.post_id,
    author_user_id: row.author_user_id,
    author_display: row.author_display,
    title: row.title,
    body: row.body,
    created_at: iso(row.created_at),
  };
}

function mapAuditLog(row: QueryResultRow): AuditLog {
  return {
    id: num(row.id),
    actor_id: row.actor_id ?? null,
    actor_type: row.actor_type,
    action: row.action,
    entity_type: row.entity_type ?? null,
    entity_id: row.entity_id ?? null,
    detail: row.detail ?? {},
    ip_hash: row.ip_hash ?? null,
    created_at: iso(row.created_at),
  };
}

// ==========================================================================
// Users
// ==========================================================================

export async function getUser(id: string): Promise<User | null> {
  if (!isUuid(id)) return null;
  const res = await queryPg('SELECT * FROM users WHERE id = $1', [id]);
  return res.rows[0] ? mapUser(res.rows[0]) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const res = await queryPg(
    'SELECT * FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL LIMIT 1',
    [email.trim()]
  );
  return res.rows[0] ? mapUser(res.rows[0]) : null;
}

/**
 * Creates the anonymous user row backing a fresh session cookie.
 * `email` is a synthetic placeholder — the product collects no real address.
 */
export async function createAnonymousUser(alias: string | null = null): Promise<User> {
  const id = randomUUID();
  const email = `anon_${id}@anon.showitglo.local`;
  const res = await queryPg(
    `INSERT INTO users (id, email, alias, role, status)
     VALUES ($1, $2, $3, 'user', 'active')
     RETURNING *`,
    [id, email, alias]
  );
  await ensureWallet(id);
  return mapUser(res.rows[0]);
}

export async function upsertUser(user: User): Promise<User> {
  const id = isUuid(user.id) ? user.id : randomUUID();
  const res = await queryPg(
    `INSERT INTO users (id, email, email_verified_at, alias, is_profile_public, brand_verified_at,
                        stripe_customer_id, role, status, notif_prefs, created_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11::timestamptz, NOW()), $12)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       email_verified_at = EXCLUDED.email_verified_at,
       alias = EXCLUDED.alias,
       is_profile_public = EXCLUDED.is_profile_public,
       brand_verified_at = EXCLUDED.brand_verified_at,
       stripe_customer_id = EXCLUDED.stripe_customer_id,
       role = EXCLUDED.role,
       status = EXCLUDED.status,
       notif_prefs = EXCLUDED.notif_prefs,
       deleted_at = EXCLUDED.deleted_at
     RETURNING *`,
    [
      id,
      user.email,
      user.email_verified_at,
      user.alias,
      user.is_profile_public,
      user.brand_verified_at ?? null,
      user.stripe_customer_id,
      user.role,
      user.status,
      JSON.stringify(user.notif_prefs ?? { inapp: true, email: true, push: true, outbid_digest: true }),
      user.created_at ?? null,
      user.deleted_at,
    ]
  );
  await ensureWallet(id);
  return mapUser(res.rows[0]);
}

// ==========================================================================
// Optional email link & single-use auth tokens
//
// Every user row carries a synthetic `anon_<uuid>@anon.showitglo.local`
// address to satisfy NOT NULL UNIQUE. A REAL address only ever appears after
// the visitor typed it in and clicked a confirmation link. The placeholder
// suffix is therefore the line between "this person can be emailed" and "this
// is a database artefact", and recovery must never cross it: without the
// filter below, anyone could recover a wallet by guessing a user's uuid.
// ==========================================================================

const PLACEHOLDER_EMAIL_SUFFIX = '@anon.showitglo.local';
const AUTH_TOKEN_TTL_MINUTES = 30;

export type AuthTokenPurpose = 'link_email' | 'recover';

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !email || email.toLowerCase().endsWith(PLACEHOLDER_EMAIL_SUFFIX);
}

/** The user's real address, or null when they never linked one. */
export async function getRealEmailForUser(userId: string): Promise<string | null> {
  if (!isUuid(userId)) return null;
  const res = await queryPg(
    `SELECT email FROM users
      WHERE id = $1 AND deleted_at IS NULL AND email NOT LIKE '%' || $2
      LIMIT 1`,
    [userId, PLACEHOLDER_EMAIL_SUFFIX]
  );
  const email = res.rows[0]?.email as string | undefined;
  return email && !isPlaceholderEmail(email) ? email : null;
}

/**
 * The live user holding this REAL address, if any.
 * Placeholder and tombstone addresses can never match, so a recovery request
 * for `anon_<uuid>@anon.showitglo.local` finds nothing by construction.
 */
export async function findUserByRealEmail(email: string): Promise<User | null> {
  const trimmed = email.trim();
  if (!trimmed || isPlaceholderEmail(trimmed)) return null;

  const res = await queryPg(
    `SELECT * FROM users
      WHERE lower(email) = lower($1)
        AND deleted_at IS NULL
        AND email NOT LIKE '%' || $2
      LIMIT 1`,
    [trimmed, PLACEHOLDER_EMAIL_SUFFIX]
  );
  return res.rows[0] ? mapUser(res.rows[0]) : null;
}

export interface IssuedAuthToken {
  /** The plaintext token. Returned ONCE, goes into a link, never stored. */
  token: string;
  expiresAt: string;
}

/**
 * Mints a single-use token. 32 random bytes is well past guessing range, and
 * only sha256(token) is persisted — a dump of `auth_tokens` cannot be replayed
 * as a wallet login.
 */
export async function createAuthToken(params: {
  userId: string;
  purpose: AuthTokenPurpose;
  email?: string | null;
}): Promise<IssuedAuthToken> {
  if (!isUuid(params.userId)) throw new StoreError('USER_NOT_FOUND', 'Unknown user.', 404);

  const token = randomBytes(32).toString('base64url');
  const res = await queryPg(
    `INSERT INTO auth_tokens (token_hash, user_id, purpose, email, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + make_interval(mins => $5))
     RETURNING expires_at`,
    [hashToken(token), params.userId, params.purpose, params.email ?? null, AUTH_TOKEN_TTL_MINUTES]
  );

  // Opportunistic GC. Consumed and expired tokens are dead weight, and an
  // unbounded table of credentials-shaped rows is a liability of its own.
  if (Math.random() < 0.05) {
    await queryPg(
      `DELETE FROM auth_tokens WHERE expires_at < NOW() - INTERVAL '7 days' OR used_at < NOW() - INTERVAL '7 days'`
    ).catch(() => {});
  }

  return { token, expiresAt: iso(res.rows[0].expires_at) };
}

export interface ConsumedAuthToken {
  user_id: string;
  purpose: AuthTokenPurpose;
  email: string | null;
}

/**
 * Validates and burns a token in ONE statement.
 *
 * The `used_at IS NULL` predicate and the `SET used_at = NOW()` are the same
 * write, so two concurrent clicks on the same link produce exactly one winner:
 * the second UPDATE matches no row. A check-then-set version of this is a race
 * that hands out two sessions for one token.
 */
export async function consumeAuthToken(
  token: string,
  purpose: AuthTokenPurpose
): Promise<ConsumedAuthToken | null> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 256) return null;

  const res = await queryPg(
    `UPDATE auth_tokens
        SET used_at = NOW()
      WHERE token_hash = $1
        AND purpose = $2
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING user_id, purpose, email`,
    [hashToken(token), purpose]
  );

  const row = res.rows[0];
  if (!row) return null;
  return { user_id: row.user_id, purpose: row.purpose, email: row.email ?? null };
}

export type LinkEmailOutcome = 'linked' | 'conflict' | 'user_gone';

/**
 * Attaches a confirmed address to a user.
 *
 * `users.email` is UNIQUE, so the collision is resolved by the database rather
 * than by a SELECT-then-UPDATE that another request can slip between. A
 * duplicate is reported as `conflict` and NOT as an error: which address is
 * already taken is exactly the fact an enumeration attack wants, so the caller
 * turns this into the same neutral answer as every other outcome.
 */
export async function linkUserEmail(userId: string, email: string): Promise<LinkEmailOutcome> {
  if (!isUuid(userId)) return 'user_gone';

  try {
    const res = await queryPg(
      `UPDATE users
          SET email = $2, email_verified_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id`,
      [userId, email.trim()]
    );
    return (res.rowCount ?? 0) > 0 ? 'linked' : 'user_gone';
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return 'conflict';
    throw err;
  }
}

// ==========================================================================
// Wallets & ledger
// ==========================================================================

export async function ensureWallet(userId: string, client: PoolClient | null = null): Promise<void> {
  await run(client, 'INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
}

export async function getWallet(userId: string): Promise<Wallet> {
  if (!isUuid(userId)) throw new StoreError('USER_NOT_FOUND', 'Unknown user.', 404);
  await ensureWallet(userId);
  const res = await queryPg('SELECT * FROM wallets WHERE user_id = $1', [userId]);
  if (!res.rows[0]) throw new StoreError('USER_NOT_FOUND', 'Unknown user.', 404);
  return mapWallet(res.rows[0]);
}

export async function getWalletLedger(userId: string, limit = 100): Promise<WalletLedgerEntry[]> {
  if (!isUuid(userId)) return [];
  const res = await queryPg(
    'SELECT * FROM wallet_ledger WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2',
    [userId, Math.min(Math.max(1, limit), 500)]
  );
  return res.rows.map(mapLedger);
}

/** Total spent in the trailing 24h — the daily-cap denominator. */
async function spentLast24h(client: PoolClient, userId: string): Promise<number> {
  const res = await client.query(
    `SELECT COALESCE(SUM(-delta_cents), 0) AS spent
       FROM wallet_ledger
      WHERE user_id = $1 AND kind = 'spend' AND created_at > NOW() - INTERVAL '24 hours'`,
    [userId]
  );
  return num(res.rows[0]?.spent);
}

// --------------------------------------------------------------------------
// In-flight top-up intents (the other half of the wallet ceiling)
// --------------------------------------------------------------------------

/** How long an unsettled PaymentIntent still counts against the ceiling. */
const PENDING_INTENT_WINDOW_SECONDS = 3600; // 1 hour
/** When an abandoned reservation row is swept. */
const INTENT_GC_SECONDS = 86400; // 24 hours

export interface WalletHeadroom {
  balanceCents: number;
  pendingCents: number;
  /** Opaque id of the reservation row created for this attempt. */
  reservationId: string;
}

/**
 * Unsettled top-ups for one user ($1), inside the pending window ($2 seconds).
 * `NOT EXISTS` against payments is belt-and-braces: the row is normally deleted
 * by `creditWalletFromPayment` the moment the credit lands.
 */
const PENDING_INTENT_SUM_SQL = `
  SELECT COALESCE(SUM(wi.amount_cents), 0) AS pending
    FROM wallet_intents wi
   WHERE wi.user_id = $1
     AND wi.created_at > NOW() - make_interval(secs => $2)
     AND NOT EXISTS (
       SELECT 1 FROM payments p WHERE p.stripe_payment_intent_id = wi.payment_intent_id
     )`;

/**
 * Reserves headroom for a top-up, or refuses it.
 *
 * The ceiling has to count money that is *in flight*, not just money already
 * banked. A PaymentIntent the customer has not paid yet is still a promise the
 * webhook will be forced to honour — `creditWalletFromPayment` has no ceiling
 * by design, because refusing a captured payment loses it. So ten concurrent
 * $50 intents opened against a $480 balance all pass a balance-only check and
 * all get credited, landing the wallet at $980.
 *
 * The check and the reservation happen under the wallet's row lock in one
 * transaction, so two simultaneous attempts serialize instead of both reading
 * the same stale total. The row is written with a provisional id before Stripe
 * is called (there is no real id yet) and promoted by `confirmWalletIntent`
 * once Stripe answers; a crash in between leaves a row that stops counting
 * after an hour and is swept after a day.
 */
export async function reserveWalletHeadroom(params: {
  userId: string;
  amountCents: number;
  maxBalanceCents: number;
}): Promise<WalletHeadroom> {
  const { userId, amountCents, maxBalanceCents } = params;

  if (!isUuid(userId)) throw new StoreError('USER_NOT_FOUND', 'Unknown user.', 404);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new StoreError('INVALID_AMOUNT', 'Amount must be a positive integer number of cents.', 400);
  }

  return withTransaction(async (client) => {
    await ensureWallet(userId, client);
    const walletRes = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    const wallet = mapWallet(walletRes.rows[0]);

    const pendingRes = await client.query(PENDING_INTENT_SUM_SQL, [userId, PENDING_INTENT_WINDOW_SECONDS]);
    const pendingCents = num(pendingRes.rows[0]?.pending);

    if (wallet.balance_cents + pendingCents + amountCents > maxBalanceCents) {
      const headroom = Math.max(0, maxBalanceCents - wallet.balance_cents - pendingCents);
      throw new StoreError(
        'WALLET_LIMIT',
        pendingCents > 0
          ? `Wallet balance may not exceed $${(maxBalanceCents / 100).toFixed(2)}, and you have $${(pendingCents / 100).toFixed(2)} of top-ups still in progress. Finish or abandon those before adding more.`
          : `Wallet balance may not exceed $${(maxBalanceCents / 100).toFixed(2)}.`,
        400,
        {
          current_balance_cents: wallet.balance_cents,
          pending_topup_cents: pendingCents,
          max_balance_cents: maxBalanceCents,
          max_topup_cents: headroom,
        }
      );
    }

    const reservationId = `prov_${randomUUID()}`;
    await client.query(
      'INSERT INTO wallet_intents (payment_intent_id, user_id, amount_cents) VALUES ($1, $2, $3)',
      [reservationId, userId, amountCents]
    );

    return { balanceCents: wallet.balance_cents, pendingCents, reservationId };
  });
}

/** Promotes a reservation to the real PaymentIntent id once Stripe answers. */
export async function confirmWalletIntent(reservationId: string, paymentIntentId: string): Promise<void> {
  await queryPg(
    `UPDATE wallet_intents SET payment_intent_id = $2 WHERE payment_intent_id = $1`,
    [reservationId, paymentIntentId]
  );

  // Opportunistic sweep — abandoned reservations should not outlive a day.
  if (Math.random() < 0.05) {
    await queryPg(
      `DELETE FROM wallet_intents WHERE created_at < NOW() - make_interval(secs => $1)`,
      [INTENT_GC_SECONDS]
    ).catch(() => {});
  }
}

/** Drops a reservation whose PaymentIntent never came into existence. */
export async function releaseWalletIntent(reservationId: string): Promise<void> {
  await queryPg('DELETE FROM wallet_intents WHERE payment_intent_id = $1', [reservationId]).catch(() => {});
}

export interface CreditResult {
  credited: boolean;
  wallet: Wallet;
  payment: Payment | null;
  reason?: 'duplicate';
}

/**
 * Credits a wallet for a settled Stripe payment.
 *
 * Idempotency is anchored on `payments.stripe_payment_intent_id`: the INSERT
 * either wins (and we credit) or hits the unique index (and we do nothing).
 * A replayed webhook therefore cannot double-credit.
 *
 * Deliberately has NO minimum and NO wallet ceiling — the customer's money is
 * already captured at Stripe, so refusing the credit here would simply lose
 * it. Both limits are enforced before the charge, at intent creation.
 *
 * The in-flight reservation for this intent is released in the same
 * transaction: once the money is banked it is counted by the balance, and
 * leaving the reservation behind would charge the customer's ceiling twice.
 */
export async function creditWalletFromPayment(params: {
  userId: string;
  amountCents: number;
  paymentIntentId: string;
  currency?: string;
}): Promise<CreditResult> {
  const { userId, paymentIntentId, amountCents } = params;
  const currency = (params.currency || 'usd').toLowerCase();

  if (!isUuid(userId)) throw new StoreError('USER_NOT_FOUND', 'Unknown user.', 404);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new StoreError('INVALID_AMOUNT', 'Credit amount must be a positive integer number of cents.', 400);
  }

  return withTransaction(async (client) => {
    await ensureWallet(userId, client);

    const inserted = await client.query(
      `INSERT INTO payments (id, user_id, stripe_payment_intent_id, amount_cents, currency, status)
       VALUES ($1, $2, $3, $4, $5, 'succeeded')
       ON CONFLICT (stripe_payment_intent_id) DO NOTHING
       RETURNING *`,
      [shortId('pay'), userId, paymentIntentId, amountCents, currency]
    );

    // The intent has settled either way — its reservation has done its job.
    await client.query('DELETE FROM wallet_intents WHERE payment_intent_id = $1', [paymentIntentId]);

    if (inserted.rowCount === 0) {
      const existing = await client.query(
        'SELECT * FROM payments WHERE stripe_payment_intent_id = $1',
        [paymentIntentId]
      );
      const walletRow = await client.query('SELECT * FROM wallets WHERE user_id = $1', [userId]);
      log('info', 'wallet.credit.duplicate', { user_id: userId, payment_intent_id: paymentIntentId });
      return {
        credited: false,
        reason: 'duplicate' as const,
        wallet: mapWallet(walletRow.rows[0]),
        payment: existing.rows[0] ? mapPayment(existing.rows[0]) : null,
      };
    }

    const payment = mapPayment(inserted.rows[0]);

    await client.query('SELECT 1 FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    const updated = await client.query(
      `UPDATE wallets
          SET balance_cents = balance_cents + $2,
              lifetime_topup_cents = lifetime_topup_cents + $2,
              updated_at = NOW()
        WHERE user_id = $1
        RETURNING *`,
      [userId, amountCents]
    );
    const wallet = mapWallet(updated.rows[0]);

    await client.query(
      `INSERT INTO wallet_ledger (user_id, delta_cents, kind, ref_type, ref_id, balance_after_cents)
       VALUES ($1, $2, 'topup', 'payment', $3, $4)`,
      [userId, amountCents, payment.id, wallet.balance_cents]
    );

    await insertAudit(client, {
      actor_id: userId,
      actor_type: 'stripe',
      action: 'wallet_topup',
      entity_type: 'wallet',
      entity_id: userId,
      detail: { amount_cents: amountCents, balance_after_cents: wallet.balance_cents, payment_intent_id: paymentIntentId },
      ip_hash: null,
    });

    log('info', 'wallet.credit.applied', {
      user_id: userId,
      amount_cents: amountCents,
      payment_intent_id: paymentIntentId,
      balance_after_cents: wallet.balance_cents,
    });

    return { credited: true, wallet, payment };
  });
}

export interface RefundResult {
  applied: boolean;
  reason?: 'payment_not_found' | 'already_applied';
  /** Cents taken off the wallet by THIS call. */
  debitedCents: number;
  /** Cents that should have been reversed in total for this payment. */
  targetTotalCents: number;
  /** Cents reversed in total for this payment, including this call. */
  reversedTotalCents: number;
  wallet: Wallet | null;
}

/**
 * Reverses a payment after a refund or a chargeback — cumulatively.
 *
 * Stripe reports refunds as a running TOTAL (`charge.amount_refunded`), not as
 * a delta, and it delivers every event at least once. Reversing "the amount in
 * this event" therefore over-debits on a partial-then-remainder refund, and a
 * replay of a single event debits twice. The invariant enforced here instead:
 *
 *     total reversal debits for a payment  ≤  payment.amount_cents
 *
 * is derived from the ledger itself. `alreadyReversed` is summed from the
 * `refund` / `dispute_reversal` rows already written against this payment, and
 * only the shortfall is debited. That makes every ordering converge to the same
 * place: replays are no-ops, partial-then-remainder debits the remainder once,
 * and a dispute after a refund only claws back what the refund left behind.
 *
 * The wallet floor is hard (a CHECK constraint, and money already spent cannot
 * be taken back), so the debit is additionally clamped to the balance.
 */
export async function applyRefund(params: {
  paymentIntentId: string;
  /**
   * Stripe's CUMULATIVE `charge.amount_refunded`. Missing or non-positive is
   * treated as zero — NEVER as "the whole charge", which is how a
   * `charge.refunded` event with no usable total turns into a full reversal of
   * a payment that was only partly refunded.
   */
  cumulativeRefundedCents?: number;
  /** A chargeback reverses the payment in full and freezes the wallet. */
  dispute?: boolean;
}): Promise<RefundResult> {
  const { paymentIntentId } = params;
  const dispute = !!params.dispute;
  const cumulativeRefunded = Number.isSafeInteger(params.cumulativeRefundedCents)
    ? Math.max(0, params.cumulativeRefundedCents as number)
    : 0;

  return withTransaction(async (client) => {
    const found = await client.query(
      'SELECT * FROM payments WHERE stripe_payment_intent_id = $1 FOR UPDATE',
      [paymentIntentId]
    );
    if (!found.rows[0]) {
      log('warn', 'wallet.refund.unknown_payment', { payment_intent_id: paymentIntentId });
      return {
        applied: false,
        reason: 'payment_not_found' as const,
        debitedCents: 0,
        targetTotalCents: 0,
        reversedTotalCents: 0,
        wallet: null,
      };
    }

    const payment = mapPayment(found.rows[0]);

    // What the ledger says we have already taken back for this payment. This,
    // not the payment status, is the idempotency anchor.
    const reversedRes = await client.query(
      `SELECT COALESCE(SUM(-delta_cents), 0) AS reversed
         FROM wallet_ledger
        WHERE ref_type = 'payment' AND ref_id = $1 AND kind IN ('refund', 'dispute_reversal')`,
      [payment.id]
    );
    const alreadyReversed = num(reversedRes.rows[0]?.reversed);

    const targetTotal = dispute
      ? payment.amount_cents
      : Math.min(cumulativeRefunded, payment.amount_cents);
    const outstanding = Math.max(0, targetTotal - alreadyReversed);

    await ensureWallet(payment.user_id, client);
    const locked = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [payment.user_id]);
    const current = mapWallet(locked.rows[0]);

    const debit = Math.min(outstanding, Math.max(0, current.balance_cents));

    // A dispute is terminal: a later `charge.refunded` must not relabel the
    // payment as a plain refund. And an event carrying no refunded total is not
    // evidence of a refund at all, so it must not change the status either.
    let nextStatus = payment.status;
    if (dispute || payment.status === 'disputed') nextStatus = 'disputed';
    else if (targetTotal > 0) nextStatus = 'refunded';
    const statusChanged = payment.status !== nextStatus;
    const willFreeze = dispute && current.status !== 'frozen';

    if (statusChanged) {
      await client.query('UPDATE payments SET status = $2, updated_at = NOW() WHERE id = $1', [
        payment.id,
        nextStatus,
      ]);
    }

    let wallet = current;
    if (debit > 0 || willFreeze) {
      const updated = await client.query(
        `UPDATE wallets
            SET balance_cents = balance_cents - $2,
                status = CASE WHEN $3 THEN 'frozen' ELSE status END,
                updated_at = NOW()
          WHERE user_id = $1
          RETURNING *`,
        [payment.user_id, debit, dispute]
      );
      wallet = mapWallet(updated.rows[0]);
    }

    if (debit > 0) {
      await client.query(
        `INSERT INTO wallet_ledger (user_id, delta_cents, kind, ref_type, ref_id, balance_after_cents)
         VALUES ($1, $2, $3, 'payment', $4, $5)`,
        [payment.user_id, -debit, dispute ? 'dispute_reversal' : 'refund', payment.id, wallet.balance_cents]
      );
    }

    const reversedTotal = alreadyReversed + debit;

    // Nothing moved and nothing changed — a pure replay. Say so and write no
    // audit noise for it.
    if (debit === 0 && !statusChanged && !willFreeze) {
      return {
        applied: false,
        reason: 'already_applied' as const,
        debitedCents: 0,
        targetTotalCents: targetTotal,
        reversedTotalCents: reversedTotal,
        wallet,
      };
    }

    await insertAudit(client, {
      actor_id: payment.user_id,
      actor_type: 'stripe',
      action: dispute ? 'wallet_dispute_reversal' : 'wallet_refund',
      entity_type: 'payment',
      entity_id: payment.id,
      detail: {
        payment_intent_id: paymentIntentId,
        payment_amount_cents: payment.amount_cents,
        cumulative_refunded_cents: dispute ? null : cumulativeRefunded,
        target_total_cents: targetTotal,
        already_reversed_cents: alreadyReversed,
        debited_cents: debit,
        reversed_total_cents: reversedTotal,
        unrecovered_cents: Math.max(0, targetTotal - reversedTotal),
        balance_after_cents: wallet.balance_cents,
        wallet_frozen: dispute,
      },
      ip_hash: null,
    });

    log('info', dispute ? 'wallet.dispute.applied' : 'wallet.refund.applied', {
      user_id: payment.user_id,
      payment_intent_id: paymentIntentId,
      target_total_cents: targetTotal,
      already_reversed_cents: alreadyReversed,
      debited_cents: debit,
    });

    return {
      applied: debit > 0,
      debitedCents: debit,
      targetTotalCents: targetTotal,
      reversedTotalCents: reversedTotal,
      wallet,
    };
  });
}

// ==========================================================================
// Stripe webhook dedup
// ==========================================================================

/**
 * True when this event id has already been fully processed.
 *
 * The marker is written AFTER the handler succeeds (see `markStripeEvent`), so
 * its presence means "done", not "started". Pre-inserting it would lose the
 * event outright if the instance died mid-handler: the redelivery would see the
 * marker and short-circuit as a duplicate.
 */
export async function hasStripeEvent(eventId: string): Promise<boolean> {
  const res = await queryPg('SELECT 1 FROM stripe_events WHERE id = $1', [eventId]);
  return (res.rowCount ?? 0) > 0;
}

/** Records a completed event. Safe to call twice — the second call is a no-op. */
export async function markStripeEvent(eventId: string, eventType: string): Promise<void> {
  await queryPg(
    'INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
    [eventId, eventType]
  );
}

// ==========================================================================
// Categories
// ==========================================================================

export async function getCategory(id: string): Promise<Category | null> {
  const res = await queryPg('SELECT * FROM categories WHERE id = $1', [id]);
  return res.rows[0] ? mapCategory(res.rows[0]) : null;
}

export async function getAllCategories(): Promise<Category[]> {
  const res = await queryPg('SELECT * FROM categories ORDER BY id');
  return res.rows.map(mapCategory);
}

export async function updateCategoryStrategy(
  id: string,
  strategy: Category['increment_strategy'],
  config: Category['increment_config'],
  halfLifeHours?: number
): Promise<Category> {
  const res = await queryPg(
    `UPDATE categories
        SET increment_strategy = $2,
            increment_config = $3,
            half_life_hours = COALESCE($4, half_life_hours)
      WHERE id = $1
      RETURNING *`,
    [id, strategy, JSON.stringify(config ?? {}), halfLifeHours ?? null]
  );
  if (!res.rows[0]) throw new StoreError('CATEGORY_NOT_FOUND', 'Category not found.', 404);

  await logAudit({
    actor_id: null,
    actor_type: 'admin',
    action: 'update_strategy',
    entity_type: 'category',
    entity_id: id,
    detail: { strategy, config, halfLifeHours },
    ip_hash: null,
  });

  return mapCategory(res.rows[0]);
}

/** `global` is the union board: it ranks every live post regardless of category. */
function categoryFilter(categoryId: string): string | null {
  return categoryId === 'global' ? null : categoryId;
}

// ==========================================================================
// Posts
// ==========================================================================

export async function getPost(idOrSlug: string): Promise<Post | null> {
  if (!idOrSlug) return null;
  const res = isUuid(idOrSlug)
    ? await queryPg('SELECT * FROM posts WHERE id = $1', [idOrSlug])
    : await queryPg('SELECT * FROM posts WHERE slug = $1', [idOrSlug]);
  return res.rows[0] ? mapPost(res.rows[0]) : null;
}

export async function getAllPosts(limit = 500): Promise<Post[]> {
  const res = await queryPg('SELECT * FROM posts ORDER BY created_at DESC LIMIT $1', [
    Math.min(Math.max(1, limit), 2000),
  ]);
  return res.rows.map(mapPost);
}

export async function getUserPosts(userId: string): Promise<Post[]> {
  if (!isUuid(userId)) return [];
  const res = await queryPg(
    'SELECT * FROM posts WHERE author_id = $1 AND removed_at IS NULL ORDER BY created_at DESC',
    [userId]
  );
  return res.rows.map(mapPost);
}

/** Posts in one moderation state — the admin queue, without a full-table scan. */
export async function getPostsByStatus(status: PostStatus, limit = 100): Promise<Post[]> {
  const res = await queryPg(
    'SELECT * FROM posts WHERE status = $1 ORDER BY created_at DESC LIMIT $2',
    [status, Math.min(Math.max(1, limit), 500)]
  );
  return res.rows.map(mapPost);
}

/**
 * Inserts a post. The caller supplies the display fields; ids are normalised
 * here because `posts.id` is a UUID column and older call sites minted their
 * own `post_<timestamp>` strings.
 */
export type NewPost = Omit<Post, 'id' | 'created_at'> & { id?: string; created_at?: string };

const POST_INSERT_SQL = `INSERT INTO posts (id, slug, author_id, category_id, kind, demand_target, demand_target_user_id,
                        counter_of, title, body, media_url, is_ad, author_display, status, score_base,
                        total_raised_cents, backers_count, like_units, streak_days, source_url,
                        source_platform, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
             COALESCE($22::timestamptz, NOW()))
     RETURNING *`;

/**
 * One insert, usable on the pool or inside an open transaction. `createPost`
 * and `createWarPair` must write identical rows — a second copy of this column
 * list is how the two paths drift apart.
 */
async function insertPost(client: PoolClient | null, post: NewPost): Promise<Post> {
  const id = isUuid(post.id) ? post.id : randomUUID();
  const res = await run(client, POST_INSERT_SQL, [
    id,
    post.slug,
    post.author_id,
    post.category_id || 'global',
    post.kind || 'opinion',
    post.demand_target ?? null,
    isUuid(post.demand_target_user_id) ? post.demand_target_user_id : null,
    isUuid(post.counter_of) ? post.counter_of : null,
    post.title,
    post.body ?? null,
    post.media_url ?? null,
    !!post.is_ad,
    post.author_display,
    post.status || 'pending_review',
    num(post.score_base),
    num(post.total_raised_cents),
    num(post.backers_count),
    num(post.like_units),
    num(post.streak_days),
    post.source_url ?? null,
    post.source_platform ?? null,
    post.created_at ?? null,
  ]);

  return mapPost(res.rows[0]);
}

function creationAction(post: Post): string {
  if (post.kind === 'demand') return 'create_demand';
  return post.counter_of ? 'create_counter_opinion' : 'create_opinion';
}

export async function createPost(post: NewPost): Promise<Post> {
  const created = await insertPost(null, post);

  await logAudit({
    actor_id: created.author_id,
    actor_type: 'user',
    action: creationAction(created),
    entity_type: 'post',
    entity_id: created.id,
    detail: { title: created.title, slug: created.slug, kind: created.kind, demand_target: created.demand_target },
    ip_hash: null,
  });

  eventBus.publish('board:global', { type: 'new_post', post_id: created.id });
  return created;
}

export interface WarPair {
  post_a: Post;
  post_b: Post;
}

/**
 * Publishes two rival stances as a single indivisible act.
 *
 * Both rows go in one transaction because half a war is not a smaller war —
 * it is an accidental solo post the author never chose to make. Side B carries
 * `counter_of = A.id`, the same link a rebuttal uses, so the pair enters the
 * fights ledger without a second, parallel notion of "paired" existing
 * anywhere in the schema.
 */
export async function createWarPair(sideA: NewPost, sideB: Omit<NewPost, 'counter_of'>): Promise<WarPair> {
  const pair = await withTransaction(async (client) => {
    const postA = await insertPost(client, { ...sideA, counter_of: null });
    const postB = await insertPost(client, { ...sideB, counter_of: postA.id });

    for (const [side, post, opponent] of [
      ['a', postA, postB],
      ['b', postB, postA],
    ] as const) {
      await insertAudit(client, {
        actor_id: post.author_id,
        actor_type: 'user',
        action: 'create_war_side',
        entity_type: 'post',
        entity_id: post.id,
        detail: { title: post.title, slug: post.slug, war_side: side, opponent_id: opponent.id },
        ip_hash: null,
      });
    }

    return { post_a: postA, post_b: postB };
  });

  // Published after COMMIT: a subscriber that refetches the board on this event
  // would otherwise race an uncommitted pair and render a war with one side.
  eventBus.publish('board:global', { type: 'new_post', post_id: pair.post_a.id });
  eventBus.publish('board:global', { type: 'new_post', post_id: pair.post_b.id });

  return pair;
}

// ==========================================================================
// Ranked board
// ==========================================================================

export interface BoardOptions {
  limit?: number;
  offset?: number;
}

/**
 * The live leaderboard.
 *
 * Ordering uses the invariant `score_base` directly — decay is a strictly
 * monotone transform applied identically to every post, so sorting by the
 * stored basis and sorting by the decayed display score give the same order.
 * `display_score` is then computed in TS for presentation only.
 */
export async function getRankedBoard(categoryId = 'global', opts: BoardOptions = {}): Promise<RankedPostView[]> {
  const cat = await getCategory(categoryId);
  if (!cat) return [];

  const limit = Math.min(Math.max(1, opts.limit ?? 200), 1000);
  const offset = Math.max(0, opts.offset ?? 0);
  const filter = categoryFilter(categoryId);

  const res = await queryPg(
    `SELECT * FROM posts
      WHERE status = 'live' AND ($1::text IS NULL OR category_id = $1)
      ORDER BY score_base DESC, created_at ASC
      LIMIT $2 OFFSET $3`,
    [filter, limit, offset]
  );

  const posts = res.rows.map(mapPost);
  if (posts.length === 0) return [];

  const now = Date.now();
  const ids = posts.map((p) => p.id);

  const [priorRanks, brandResponses, counterParents] = await Promise.all([
    fetchPriorRanks(ids),
    fetchBrandResponses(ids),
    fetchRankedByIds(
      posts.map((p) => p.counter_of).filter((v): v is string => isUuid(v)),
      filter,
      cat
    ),
  ]);

  return posts.map((post, index) => {
    const rank = offset + index + 1;
    const priorRank = priorRanks.get(post.id);
    return {
      ...post,
      rank,
      display_score: round2(calculateDecayedScore(post.score_base, now, cat.score_epoch, cat.half_life_hours)),
      rank_24h_delta: priorRank ? priorRank - rank : 0,
      counter_post: post.counter_of ? (counterParents.get(post.counter_of) ?? null) : null,
      brand_response: brandResponses.get(post.id) ?? null,
    };
  });
}

/** Latest rank recorded for each post at least 24h ago — one query, no N+1. */
async function fetchPriorRanks(postIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (postIds.length === 0) return out;
  const res = await queryPg(
    `SELECT DISTINCT ON (post_id) post_id, new_rank
       FROM rank_events
      WHERE post_id = ANY($1::uuid[]) AND occurred_at <= NOW() - INTERVAL '24 hours'
      ORDER BY post_id, occurred_at DESC`,
    [postIds]
  );
  for (const row of res.rows) {
    if (row.new_rank !== null) out.set(row.post_id, num(row.new_rank));
  }
  return out;
}

async function fetchBrandResponses(postIds: string[]): Promise<Map<string, BrandResponse>> {
  const out = new Map<string, BrandResponse>();
  if (postIds.length === 0) return out;
  const res = await queryPg(
    `SELECT DISTINCT ON (post_id) *
       FROM brand_responses
      WHERE post_id = ANY($1::uuid[])
      ORDER BY post_id, created_at DESC`,
    [postIds]
  );
  for (const row of res.rows) out.set(row.post_id, mapBrandResponse(row));
  return out;
}

/**
 * Loads specific posts already carrying their live rank, computed as
 * `1 + (number of live posts scoring higher)`. Batched so attaching parent
 * posts to a page of counter-opinions stays a single round trip.
 */
async function fetchRankedByIds(
  postIds: string[],
  filter: string | null,
  cat: Category
): Promise<Map<string, RankedPostView>> {
  const out = new Map<string, RankedPostView>();
  const unique = Array.from(new Set(postIds));
  if (unique.length === 0) return out;

  const res = await queryPg(
    `SELECT p.*, (
        SELECT 1 + COUNT(*) FROM posts q
         WHERE q.status = 'live'
           AND ($2::text IS NULL OR q.category_id = $2)
           AND q.score_base > p.score_base
     ) AS computed_rank
       FROM posts p
      WHERE p.id = ANY($1::uuid[]) AND p.status = 'live'`,
    [unique, filter]
  );

  const now = Date.now();
  for (const row of res.rows) {
    const post = mapPost(row);
    out.set(post.id, {
      ...post,
      rank: num(row.computed_rank, 1),
      display_score: round2(calculateDecayedScore(post.score_base, now, cat.score_epoch, cat.half_life_hours)),
      rank_24h_delta: 0,
    });
  }
  return out;
}

/**
 * Live ranked views for an explicit set of post ids, in the order given.
 * Ids that are not live are simply absent from the result.
 */
export async function getRankedPostsByIds(
  postIds: string[],
  categoryId = 'global'
): Promise<RankedPostView[]> {
  const ids = postIds.filter((id): id is string => isUuid(id));
  if (ids.length === 0) return [];

  const cat = await getCategory(categoryId);
  if (!cat) return [];

  const ranked = await fetchRankedByIds(ids, categoryFilter(categoryId), cat);
  return ids.map((id) => ranked.get(id)).filter((v): v is RankedPostView => !!v);
}

/**
 * One live post with its live rank, 24h rank delta, brand response and the
 * parent it counters. Returns null for an unknown, pending or removed post —
 * public detail pages must not surface anything that is not live.
 */
export async function getRankedPost(idOrSlug: string): Promise<RankedPostView | null> {
  const post = await getPost(idOrSlug);
  if (!post || post.status !== 'live') return null;

  const categoryId = post.category_id || 'global';
  const cat = await getCategory(categoryId);
  if (!cat) return null;

  const filter = categoryFilter(categoryId);
  const parentIds = isUuid(post.counter_of) ? [post.counter_of] : [];

  const [ranked, priorRanks, brandResponses, parents] = await Promise.all([
    fetchRankedByIds([post.id], filter, cat),
    fetchPriorRanks([post.id]),
    fetchBrandResponses([post.id]),
    fetchRankedByIds(parentIds, filter, cat),
  ]);

  const view = ranked.get(post.id);
  if (!view) return null;

  const priorRank = priorRanks.get(post.id);
  return {
    ...view,
    rank_24h_delta: priorRank ? priorRank - view.rank : 0,
    counter_post: post.counter_of ? (parents.get(post.counter_of) ?? null) : null,
    brand_response: brandResponses.get(post.id) ?? null,
  };
}

/** Live posts written as a rebuttal to `postId`, highest scoring first. */
export async function getCounterPosts(postId: string, limit = 20): Promise<RankedPostView[]> {
  if (!isUuid(postId)) return [];
  const res = await queryPg(
    `SELECT id FROM posts
      WHERE counter_of = $1 AND status = 'live'
      ORDER BY score_base DESC, created_at ASC
      LIMIT $2`,
    [postId, Math.min(Math.max(1, limit), 100)]
  );
  return getRankedPostsByIds(res.rows.map((r) => r.id as string));
}

export interface BoardStats {
  live_posts: number;
  total_raised_cents: number;
  distinct_backers: number;
  total_interactions: number;
  top_display_score: number;
}

/**
 * Honest headline numbers for a board. Every figure is a SQL aggregate over
 * real rows — nothing is floored, padded or invented when the board is empty.
 */
export async function getBoardStats(categoryId = 'global'): Promise<BoardStats> {
  const cat = await getCategory(categoryId);
  const filter = categoryFilter(categoryId);

  const [totals, backers, interactions] = await Promise.all([
    queryPg(
      `SELECT COUNT(*) AS live_posts,
              COALESCE(SUM(total_raised_cents), 0) AS raised_cents,
              COALESCE(MAX(score_base), 0) AS top_score_base
         FROM posts
        WHERE status = 'live' AND ($1::text IS NULL OR category_id = $1)`,
      [filter]
    ),
    queryPg(
      `SELECT COUNT(DISTINCT pb.user_id) AS n
         FROM post_backers pb
         JOIN posts p ON p.id = pb.post_id
        WHERE p.status = 'live' AND ($1::text IS NULL OR p.category_id = $1)`,
      [filter]
    ),
    queryPg(
      `SELECT COUNT(*) AS n FROM interactions WHERE ($1::text IS NULL OR category_id = $1)`,
      [filter]
    ),
  ]);

  const topScoreBase = num(totals.rows[0]?.top_score_base);
  return {
    live_posts: num(totals.rows[0]?.live_posts),
    total_raised_cents: num(totals.rows[0]?.raised_cents),
    distinct_backers: num(backers.rows[0]?.n),
    total_interactions: num(interactions.rows[0]?.n),
    top_display_score: cat
      ? round2(calculateDecayedScore(topScoreBase, Date.now(), cat.score_epoch, cat.half_life_hours))
      : 0,
  };
}

// ==========================================================================
// Quotes
// ==========================================================================

const QUOTE_TTL_MS = 5 * 60 * 1000;

export async function createQuote(
  postId: string,
  targetRank: number | null,
  amountCents: number | null,
  categoryId = 'global'
): Promise<Quote> {
  const cat = await getCategory(categoryId);
  if (!cat) throw new StoreError('CATEGORY_NOT_FOUND', 'Category not found.', 404);

  const post = await getPost(postId);
  if (!post) throw new StoreError('POST_NOT_FOUND', 'Post not found.', 404);

  const filter = categoryFilter(categoryId);
  const now = Date.now();
  const myCurrentScore = calculateDecayedScore(post.score_base, now, cat.score_epoch, cat.half_life_hours);

  let finalAmountCents = cat.min_power_cents;
  let estimatedRank = 1;
  let holderScore = 0;
  let neededDelta = 0;

  if (targetRank && targetRank > 0) {
    const holder = await queryPg(
      `SELECT score_base FROM posts
        WHERE status = 'live' AND ($1::text IS NULL OR category_id = $1)
        ORDER BY score_base DESC, created_at ASC
        LIMIT 1 OFFSET $2`,
      [filter, targetRank - 1]
    );

    if (holder.rows[0]) {
      holderScore = round2(
        calculateDecayedScore(num(holder.rows[0].score_base), now, cat.score_epoch, cat.half_life_hours)
      );
      const requiredScore = getRequiredScoreToDisplace(cat.increment_strategy, holderScore, cat.increment_config);
      const dollarsNeeded = dollarsNeededForScore(requiredScore, myCurrentScore);
      finalAmountCents = Math.max(cat.min_power_cents, Math.round(dollarsNeeded * 100));
      estimatedRank = targetRank;
      neededDelta = requiredScore - myCurrentScore;
    } else {
      const total = await queryPg(
        `SELECT COUNT(*) AS n FROM posts WHERE status = 'live' AND ($1::text IS NULL OR category_id = $1)`,
        [filter]
      );
      finalAmountCents = cat.min_power_cents;
      estimatedRank = num(total.rows[0]?.n) + 1;
    }
  } else if (amountCents && amountCents >= cat.min_power_cents) {
    finalAmountCents = Math.trunc(amountCents);
    const prospectiveStored =
      post.score_base + calculateStoredDelta(finalAmountCents, now, cat.score_epoch, cat.half_life_hours);
    const ahead = await queryPg(
      `SELECT COUNT(*) AS n FROM posts
        WHERE status = 'live' AND ($1::text IS NULL OR category_id = $1)
          AND id <> $2 AND score_base >= $3`,
      [filter, post.id, prospectiveStored]
    );
    estimatedRank = num(ahead.rows[0]?.n) + 1;
  }

  const quote: Quote = {
    quote_id: shortId('quote'),
    post_id: post.id,
    category_id: cat.id,
    target_rank: targetRank ?? null,
    amount_cents: finalAmountCents,
    estimated_achieved_rank: estimatedRank,
    holder_score: holderScore,
    my_current_score: myCurrentScore,
    needed_score_delta: Math.max(0, neededDelta),
    expires_at: new Date(now + QUOTE_TTL_MS).toISOString(),
    created_at: new Date(now).toISOString(),
  };

  await persistQuote(null, quote);
  return quote;
}

async function persistQuote(client: PoolClient | null, quote: Quote): Promise<void> {
  await run(
    client,
    `INSERT INTO quotes (quote_id, post_id, category_id, target_rank, amount_cents, estimated_achieved_rank,
                         holder_score, my_current_score, needed_score_delta, expires_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (quote_id) DO NOTHING`,
    [
      quote.quote_id,
      quote.post_id,
      quote.category_id,
      quote.target_rank,
      quote.amount_cents,
      quote.estimated_achieved_rank,
      quote.holder_score,
      quote.my_current_score,
      quote.needed_score_delta,
      quote.expires_at,
      quote.created_at,
    ]
  );
}

/** Returns null for an unknown OR expired quote — expiry is not the caller's job. */
export async function getQuote(quoteId: string): Promise<Quote | null> {
  const res = await queryPg('SELECT * FROM quotes WHERE quote_id = $1 AND expires_at > NOW()', [quoteId]);
  return res.rows[0] ? mapQuote(res.rows[0]) : null;
}

// ==========================================================================
// Paid interactions — the money path
// ==========================================================================

export interface RecordInteractionParams {
  postId: string;
  userId: string;
  kind: InteractionKind;
  units?: number;
  amountCents: number;
  visibility?: 'alias' | 'anonymous';
  quoteId?: string | null;
  targetRank?: number | null;
  payerDisplay?: string;
  idempotencyKey?: string | null;
  /**
   * Optional rolling-24h ceiling on the total `units` this user may spend on
   * this post for this kind. Checked under the post lock so two concurrent
   * requests cannot both slip past the limit. Used by the like endpoint to
   * cap penny-likes at 100 units per post per day (Blueprint §4/§6).
   */
  unitCap24h?: number | null;
}

export interface RecordInteractionResult {
  interaction: Interaction;
  wallet: Wallet;
  oldRank: number;
  newRank: number;
  displacedPosts: RankedPostView[];
  replayed: boolean;
}

const MAX_DISPLACED_NOTIFICATIONS = 10;

/**
 * Debits a wallet and moves a post up the board — atomically.
 *
 * Everything below happens in one transaction, taking row locks in a fixed
 * order (wallet, then post) so two concurrent spends serialize instead of
 * interleaving. That is what makes the double-spend impossible: the second
 * transaction blocks on the wallet lock until the first commits, then re-reads
 * the already-debited balance and fails the funds check.
 */
export async function recordInteraction(params: RecordInteractionParams): Promise<RecordInteractionResult> {
  const amountCents = params.amountCents;
  const visibility = params.visibility === 'anonymous' ? 'anonymous' : 'alias';
  const idempotencyKey = params.idempotencyKey ? String(params.idempotencyKey).slice(0, 200) : null;
  const payerDisplay = visibility === 'anonymous' ? 'Anonymous' : params.payerDisplay || 'Anonymous Backer';

  if (!isUuid(params.userId)) throw new StoreError('USER_NOT_FOUND', 'Unknown user.', 404);

  // Strict, not lenient: a float, NaN or negative amount is a caller bug, and
  // silently rounding it would charge someone an amount nobody asked for.
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new StoreError('INVALID_AMOUNT', 'Amount must be a positive integer number of cents.', 400);
  }
  if (params.units !== undefined && (!Number.isSafeInteger(params.units) || params.units <= 0)) {
    throw new StoreError('INVALID_UNITS', 'Units must be a positive integer.', 400);
  }
  const units = params.units ?? 1;

  // Resolve slug → uuid before the transaction; the row is locked by id inside.
  const target = await getPost(params.postId);
  if (!target) throw new StoreError('POST_NOT_FOUND', 'Post not found.', 404);

  // Cheap pre-check: a known replay never needs to take locks at all.
  if (idempotencyKey) {
    const replay = await loadReplay(idempotencyKey, params.userId);
    if (replay) return replay;
  }

  try {
    const result = await withTransaction(async (client) => {
      // 1. Wallet: create-if-missing, then lock.
      await ensureWallet(params.userId, client);
      const walletRes = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [params.userId]);
      const wallet = mapWallet(walletRes.rows[0]);

      if (wallet.status !== 'active') {
        throw new StoreError('WALLET_FROZEN', 'This wallet is frozen and cannot spend.', 403);
      }
      if (wallet.balance_cents < amountCents) {
        throw new StoreError('INSUFFICIENT_FUNDS', 'insufficient_wallet_balance', 402, {
          current_balance_cents: wallet.balance_cents,
          required_cents: amountCents,
          shortfall_cents: amountCents - wallet.balance_cents,
        });
      }

      // 2. Daily cap over the trailing 24h of spend ledger entries.
      const spent24h = await spentLast24h(client, params.userId);
      if (spent24h + amountCents > wallet.daily_cap_cents) {
        throw new StoreError('DAILY_CAP_EXCEEDED', 'Daily spend cap reached.', 402, {
          spent_24h_cents: spent24h,
          daily_cap_cents: wallet.daily_cap_cents,
          required_cents: amountCents,
          remaining_cents: Math.max(0, wallet.daily_cap_cents - spent24h),
        });
      }

      // 3. Post: lock and re-validate under the lock.
      const postRes = await client.query('SELECT * FROM posts WHERE id = $1 FOR UPDATE', [target.id]);
      if (!postRes.rows[0]) throw new StoreError('POST_NOT_FOUND', 'Post not found.', 404);
      const post = mapPost(postRes.rows[0]);
      if (post.status !== 'live' && post.status !== 'pending_review') {
        throw new StoreError('POST_NOT_LIVE', 'This post is not accepting backing.', 409);
      }

      // 3b. Rolling 24h unit ceiling for this (user, post, kind). Inside the
      //     transaction and after the post lock, so it cannot be raced.
      if (params.unitCap24h != null) {
        const usedRes = await client.query(
          `SELECT COALESCE(SUM(units), 0) AS used
             FROM interactions
            WHERE user_id = $1 AND post_id = $2 AND kind = $3
              AND created_at > NOW() - INTERVAL '24 hours'`,
          [params.userId, post.id, params.kind]
        );
        const used = num(usedRes.rows[0]?.used);
        if (used + units > params.unitCap24h) {
          throw new StoreError(
            'LIKE_CAP_REACHED',
            'You have already used your 24-hour like allowance on this post. Boost it instead to push it higher.',
            400,
            {
              used_units_24h: used,
              cap_units_24h: params.unitCap24h,
              remaining_units: Math.max(0, params.unitCap24h - used),
            }
          );
        }
      }

      const catRes = await client.query('SELECT * FROM categories WHERE id = $1', [post.category_id || 'global']);
      if (!catRes.rows[0]) throw new StoreError('CATEGORY_NOT_FOUND', 'Category not found.', 404);
      const cat = mapCategory(catRes.rows[0]);
      const filter = categoryFilter(cat.id);

      const now = new Date();
      const storedDelta = calculateStoredDelta(amountCents, now, cat.score_epoch, cat.half_life_hours);
      const oldScore = post.score_base;
      const newScore = oldScore + storedDelta;

      // 4. Ranks before and after, both derived from the same locked snapshot.
      const oldRank = await rankForScore(client, filter, post.id, oldScore);
      const newRank = await rankForScore(client, filter, post.id, newScore);

      // 5. Interaction row first — the unique index on idempotency_key is what
      //    makes a concurrent duplicate lose here rather than after debiting.
      const interactionId = shortId('int');
      const inserted = await client.query(
        `INSERT INTO interactions (id, post_id, user_id, category_id, kind, units, amount_cents, stored_delta,
                                   visibility, quote_id, target_rank, achieved_rank, payer_display,
                                   idempotency_key, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
         RETURNING *`,
        [
          interactionId,
          post.id,
          params.userId,
          cat.id,
          params.kind,
          units,
          amountCents,
          storedDelta,
          visibility,
          params.quoteId ?? null,
          params.targetRank ?? null,
          newRank,
          payerDisplay,
          idempotencyKey,
          now.toISOString(),
        ]
      );

      if (inserted.rowCount === 0) {
        // Someone else committed this exact key while we held the locks.
        throw new IdempotentReplay(idempotencyKey as string);
      }
      const interaction = mapInteraction(inserted.rows[0]);

      // 6. Debit + ledger.
      const walletAfterRes = await client.query(
        `UPDATE wallets
            SET balance_cents = balance_cents - $2,
                lifetime_spend_cents = lifetime_spend_cents + $2,
                updated_at = NOW()
          WHERE user_id = $1
          RETURNING *`,
        [params.userId, amountCents]
      );
      const walletAfter = mapWallet(walletAfterRes.rows[0]);

      await client.query(
        `INSERT INTO wallet_ledger (user_id, delta_cents, kind, ref_type, ref_id, balance_after_cents, created_at)
         VALUES ($1, $2, 'spend', 'interaction', $3, $4, $5)`,
        [params.userId, -amountCents, interaction.id, walletAfter.balance_cents, now.toISOString()]
      );

      // 7. Backer roster, then the post itself (score/raised/likes/backers).
      await client.query(
        `INSERT INTO post_backers (post_id, user_id, total_cents, visibility, user_display, first_backed_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (post_id, user_id) DO UPDATE SET
           total_cents = post_backers.total_cents + EXCLUDED.total_cents,
           visibility = CASE WHEN EXCLUDED.visibility = 'anonymous' THEN 'anonymous' ELSE post_backers.visibility END,
           user_display = CASE WHEN EXCLUDED.visibility = 'anonymous' THEN 'Anonymous' ELSE post_backers.user_display END`,
        [post.id, params.userId, amountCents, visibility, payerDisplay, now.toISOString()]
      );

      const postAfterRes = await client.query(
        `UPDATE posts
            SET score_base = score_base + $2,
                total_raised_cents = total_raised_cents + $3,
                like_units = like_units + $4,
                backers_count = (SELECT COUNT(*) FROM post_backers WHERE post_id = $1),
                status = CASE WHEN status = 'pending_review' THEN 'live' ELSE status END
          WHERE id = $1
          RETURNING *`,
        [post.id, storedDelta, amountCents, params.kind === 'like' ? units : 0]
      );
      const postAfter = mapPost(postAfterRes.rows[0]);

      // 8. Rank event + outbid notifications for the posts we just passed.
      await client.query(
        `INSERT INTO rank_events (category_id, post_id, old_rank, new_rank, cause_interaction_id, occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [cat.id, post.id, oldRank, newRank, interaction.id, now.toISOString()]
      );

      const displacedPosts = await notifyDisplaced(client, {
        cat,
        filter,
        moverId: post.id,
        moverTitle: postAfter.title,
        moverUserId: params.userId,
        oldScore,
        newScore,
        newRank,
        now,
      });

      return {
        interaction,
        wallet: walletAfter,
        oldRank,
        newRank,
        displacedPosts,
        replayed: false,
        _event: {
          categoryId: cat.id,
          postId: post.id,
          postTitle: postAfter.title,
          displayScore: round2(
            calculateDecayedScore(postAfter.score_base, now, cat.score_epoch, cat.half_life_hours)
          ),
          backersCount: postAfter.backers_count,
          timestamp: now.toISOString(),
        },
      };
    });

    const { _event, ...publicResult } = result;

    // Best-effort SSE fanout on this instance only. Never load-bearing.
    eventBus.publish(`board:${_event.categoryId}`, {
      type: 'rank_change',
      post_id: _event.postId,
      post_title: _event.postTitle,
      old_rank: publicResult.oldRank,
      new_rank: publicResult.newRank,
      kind: params.kind,
      amount_cents: amountCents,
      display_score: _event.displayScore,
      backers_count: _event.backersCount,
      displaced_count: publicResult.displacedPosts.length,
      timestamp: _event.timestamp,
    });

    log('info', 'interaction.recorded', {
      user_id: params.userId,
      post_id: _event.postId,
      kind: params.kind,
      amount_cents: amountCents,
      old_rank: publicResult.oldRank,
      new_rank: publicResult.newRank,
      outcome: 'ok',
    });

    return publicResult;
  } catch (err) {
    if (err instanceof IdempotentReplay) {
      const replay = await loadReplay(err.key, params.userId);
      if (replay) return replay;
      throw new StoreError('IDEMPOTENCY_CONFLICT', 'This idempotency key belongs to another request.', 409);
    }
    if (err instanceof StoreError) {
      log('warn', 'interaction.rejected', {
        user_id: params.userId,
        post_id: target.id,
        kind: params.kind,
        amount_cents: amountCents,
        outcome: err.code,
      });
    }
    throw err;
  }
}

/** `1 + (live posts in this board scoring strictly higher)`, self excluded. */
async function rankForScore(
  client: PoolClient,
  filter: string | null,
  postId: string,
  score: number
): Promise<number> {
  const res = await client.query(
    `SELECT COUNT(*) AS n FROM posts
      WHERE status = 'live' AND ($1::text IS NULL OR category_id = $1)
        AND id <> $2 AND score_base > $3`,
    [filter, postId, score]
  );
  return num(res.rows[0]?.n) + 1;
}

/** Rebuilds the result of an already-committed interaction for a replayed key. */
async function loadReplay(idempotencyKey: string, userId: string): Promise<RecordInteractionResult | null> {
  const res = await queryPg('SELECT * FROM interactions WHERE idempotency_key = $1', [idempotencyKey]);
  if (!res.rows[0]) return null;

  const interaction = mapInteraction(res.rows[0]);
  if (interaction.user_id !== userId) {
    throw new StoreError('IDEMPOTENCY_CONFLICT', 'This idempotency key belongs to another user.', 409);
  }

  const wallet = await getWallet(userId);
  log('info', 'interaction.replayed', {
    user_id: userId,
    post_id: interaction.post_id,
    amount_cents: interaction.amount_cents,
    outcome: 'replayed',
  });

  return {
    interaction,
    wallet,
    oldRank: interaction.achieved_rank ?? 0,
    newRank: interaction.achieved_rank ?? 0,
    displacedPosts: [],
    replayed: true,
  };
}

/**
 * Finds the posts this boost just overtook (their score sits strictly between
 * the mover's old and new score), writes each author a reclaim quote and an
 * outbid notification. Bounded to 10 so one large power boost cannot fan out
 * into an unbounded write storm.
 */
async function notifyDisplaced(
  client: PoolClient,
  ctx: {
    cat: Category;
    filter: string | null;
    moverId: string;
    moverTitle: string;
    moverUserId: string;
    oldScore: number;
    newScore: number;
    newRank: number;
    now: Date;
  }
): Promise<RankedPostView[]> {
  const res = await client.query(
    `SELECT * FROM posts
      WHERE status = 'live' AND ($1::text IS NULL OR category_id = $1)
        AND id <> $2 AND score_base > $3 AND score_base < $4
      ORDER BY score_base DESC
      LIMIT $5`,
    [ctx.filter, ctx.moverId, ctx.oldScore, ctx.newScore, MAX_DISPLACED_NOTIFICATIONS]
  );

  const displaced: RankedPostView[] = [];
  const moverDisplayScore = calculateDecayedScore(
    ctx.newScore,
    ctx.now,
    ctx.cat.score_epoch,
    ctx.cat.half_life_hours
  );

  for (let i = 0; i < res.rows.length; i++) {
    const post = mapPost(res.rows[i]);
    // Displaced posts occupied consecutive ranks starting where the mover landed.
    const oldRank = ctx.newRank + i;
    const displayScore = calculateDecayedScore(
      post.score_base,
      ctx.now,
      ctx.cat.score_epoch,
      ctx.cat.half_life_hours
    );

    displaced.push({
      ...post,
      rank: oldRank,
      display_score: round2(displayScore),
      rank_24h_delta: 0,
    });

    if (post.author_id === ctx.moverUserId) continue;

    // A real reclaim price: what it now costs to get back past the mover.
    const requiredScore = getRequiredScoreToDisplace(
      ctx.cat.increment_strategy,
      round2(moverDisplayScore),
      ctx.cat.increment_config
    );
    const dollarsNeeded = dollarsNeededForScore(requiredScore, displayScore);
    const reclaimAmountCents = Math.max(ctx.cat.min_power_cents, Math.round(dollarsNeeded * 100));

    const quote: Quote = {
      quote_id: shortId('quote'),
      post_id: post.id,
      category_id: ctx.cat.id,
      target_rank: oldRank,
      amount_cents: reclaimAmountCents,
      estimated_achieved_rank: oldRank,
      holder_score: round2(moverDisplayScore),
      my_current_score: displayScore,
      needed_score_delta: Math.max(0, requiredScore - displayScore),
      expires_at: new Date(ctx.now.getTime() + QUOTE_TTL_MS).toISOString(),
      created_at: ctx.now.toISOString(),
    };
    await persistQuote(client, quote);

    await client.query(
      `INSERT INTO notifications (id, user_id, kind, payload, channels, created_at)
       VALUES ($1, $2, 'outbid', $3::jsonb, $4::text[], $5)`,
      [
        shortId('notif'),
        post.author_id,
        JSON.stringify({
          post_id: post.id,
          post_title: post.title,
          old_rank: oldRank,
          new_rank: oldRank + 1,
          displaced_by_name: ctx.moverTitle,
          reclaim_quote_id: quote.quote_id,
          reclaim_amount_cents: quote.amount_cents,
          message: `Your opinion "${post.title}" was outbid from #${oldRank} to #${oldRank + 1} by "${ctx.moverTitle}". Reclaim #${oldRank} with 1 tap for $${(quote.amount_cents / 100).toFixed(2)}!`,
        }),
        ['inapp', 'email', 'push'],
        ctx.now.toISOString(),
      ]
    );
  }

  return displaced;
}

// ==========================================================================
// Interactions & backers — read paths
// ==========================================================================

export async function getPostInteractions(postId: string, limit = 100): Promise<Interaction[]> {
  if (!isUuid(postId)) return [];
  const res = await queryPg(
    'SELECT * FROM interactions WHERE post_id = $1 ORDER BY created_at DESC LIMIT $2',
    [postId, Math.min(Math.max(1, limit), 500)]
  );
  return res.rows.map(mapInteraction);
}

export async function getUserInteractions(userId: string, limit = 100): Promise<Interaction[]> {
  if (!isUuid(userId)) return [];
  const res = await queryPg(
    'SELECT * FROM interactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, Math.min(Math.max(1, limit), 500)]
  );
  return res.rows.map(mapInteraction);
}

export async function getPostBackers(postId: string, limit = 100): Promise<PostBacker[]> {
  if (!isUuid(postId)) return [];
  const res = await queryPg(
    'SELECT * FROM post_backers WHERE post_id = $1 ORDER BY total_cents DESC LIMIT $2',
    [postId, Math.min(Math.max(1, limit), 500)]
  );
  return res.rows.map(mapBacker);
}

// ==========================================================================
// Brand responses
// ==========================================================================

export async function createBrandResponse(params: {
  postId: string;
  authorUserId: string;
  authorDisplay: string;
  title: string;
  body: string;
}): Promise<BrandResponse> {
  const post = await getPost(params.postId);
  if (!post) throw new StoreError('POST_NOT_FOUND', 'Target post not found.', 404);

  const res = await queryPg(
    `INSERT INTO brand_responses (id, post_id, author_user_id, author_display, title, body)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [shortId('resp'), post.id, params.authorUserId, params.authorDisplay, params.title, params.body]
  );
  const response = mapBrandResponse(res.rows[0]);

  await logAudit({
    actor_id: params.authorUserId,
    actor_type: 'user',
    action: 'brand_response_published',
    entity_type: 'post',
    entity_id: post.id,
    detail: { brand: params.authorDisplay, title: params.title },
    ip_hash: null,
  });

  eventBus.publish('board:global', { type: 'brand_response', post_id: post.id, response });
  return response;
}

export async function getBrandResponse(postId: string): Promise<BrandResponse | null> {
  if (!isUuid(postId)) return null;
  const res = await queryPg(
    'SELECT * FROM brand_responses WHERE post_id = $1 ORDER BY created_at DESC LIMIT 1',
    [postId]
  );
  return res.rows[0] ? mapBrandResponse(res.rows[0]) : null;
}

// ==========================================================================
// API keys — token is shown once, only its sha256 is stored
// ==========================================================================

export type ApiKeyMetadata = Omit<ApiKey, 'key_token'> & { revoked_at?: string | null };

function rateLimitForTier(tier: ApiKey['tier']): number {
  if (tier === 'enterprise') return 1200;
  if (tier === 'growth') return 300;
  return 60;
}

export async function createApiKey(userId: string, tier: ApiKey['tier'] = 'starter'): Promise<ApiKey> {
  if (!isUuid(userId)) throw new StoreError('USER_NOT_FOUND', 'Unknown user.', 404);

  const secret = randomBytes(16).toString('hex'); // 32 hex chars
  const token = `sig_live_${secret}`;
  const prefix = token.slice(0, 16);

  const res = await queryPg(
    `INSERT INTO api_keys (id, user_id, key_prefix, key_hash, tier, rate_limit_per_min)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [shortId('key'), userId, prefix, hashToken(token), tier, rateLimitForTier(tier)]
  );

  const row = res.rows[0];
  return {
    id: row.id,
    user_id: row.user_id,
    key_prefix: row.key_prefix,
    key_token: token, // returned exactly once; never stored
    tier: row.tier,
    rate_limit_per_min: num(row.rate_limit_per_min),
    created_at: iso(row.created_at),
    last_used_at: isoOrNull(row.last_used_at),
  };
}

/**
 * Resolves a bearer token to its key, or null.
 *
 * Two rejections that a hash lookup alone does not make:
 *   * a REVOKED key — a leaked token has to be killable, and without this the
 *     only remedy would be deleting the row and losing the audit trail;
 *   * a key belonging to a DELETED user — erasure has to end API access to
 *     that account's data, not just hide the account.
 *
 * Both are checked in the UPDATE's WHERE clause, so a rejected key does not
 * even get its `last_used_at` touched.
 */
export async function verifyApiKey(token: string): Promise<ApiKeyMetadata | null> {
  if (!token || typeof token !== 'string') return null;
  const res = await queryPg(
    `UPDATE api_keys k
        SET last_used_at = NOW()
       FROM users u
      WHERE k.key_hash = $1
        AND k.revoked_at IS NULL
        AND u.id = k.user_id
        AND u.deleted_at IS NULL
      RETURNING k.*`,
    [hashToken(token.trim())]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    key_prefix: row.key_prefix,
    tier: row.tier,
    rate_limit_per_min: num(row.rate_limit_per_min),
    created_at: iso(row.created_at),
    last_used_at: isoOrNull(row.last_used_at),
    revoked_at: isoOrNull(row.revoked_at),
  };
}

export async function getApiKeys(userId: string): Promise<ApiKeyMetadata[]> {
  if (!isUuid(userId)) return [];
  const res = await queryPg(
    `SELECT id, user_id, key_prefix, tier, rate_limit_per_min, created_at, last_used_at, revoked_at
       FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return res.rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    key_prefix: row.key_prefix,
    tier: row.tier,
    rate_limit_per_min: num(row.rate_limit_per_min),
    created_at: iso(row.created_at),
    last_used_at: isoOrNull(row.last_used_at),
    revoked_at: isoOrNull(row.revoked_at),
  }));
}

/**
 * Revokes one of the caller's own keys. Ownership is part of the WHERE clause,
 * so a key id belonging to someone else is indistinguishable from one that does
 * not exist — false either way, and nothing revoked. Already-revoked keys stay
 * at their original revocation time.
 */
export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  if (!isUuid(userId) || !keyId) return false;
  const res = await queryPg(
    `UPDATE api_keys SET revoked_at = NOW()
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
      RETURNING id`,
    [keyId, userId]
  );
  const revoked = (res.rowCount ?? 0) > 0;
  if (revoked) log('info', 'apikey.revoked', { user_id: userId, key_id: keyId });
  return revoked;
}

// ==========================================================================
// Insights (k-anonymised)
// ==========================================================================

/**
 * Aggregate demand pressure per brand.
 *
 * Groups with fewer than INSIGHTS_K_MIN distinct backers are SUPPRESSED
 * entirely — not padded, not floored. Counts are the real counts.
 */
export async function getInsightsDemands(): Promise<InsightDemandAggregate[]> {
  const kMin = getInsightsKMin();

  // Money and backers are aggregated separately: joining post_backers before
  // SUM(total_raised_cents) would multiply each post's total by its backer count.
  const res = await queryPg(
    `WITH demand_posts AS (
        SELECT id, demand_target, total_raised_cents
          FROM posts
         WHERE status = 'live' AND demand_target IS NOT NULL
     ),
     money AS (
        SELECT demand_target,
               COUNT(*) AS demands_count,
               COALESCE(SUM(total_raised_cents), 0) AS total_money
          FROM demand_posts
         GROUP BY demand_target
     ),
     backers AS (
        SELECT dp.demand_target, COUNT(DISTINCT pb.user_id) AS distinct_backers
          FROM demand_posts dp
          LEFT JOIN post_backers pb ON pb.post_id = dp.id
         GROUP BY dp.demand_target
     )
     SELECT m.demand_target AS target,
            m.demands_count,
            m.total_money,
            COALESCE(b.distinct_backers, 0) AS distinct_backers
       FROM money m
       LEFT JOIN backers b ON b.demand_target = m.demand_target
      WHERE COALESCE(b.distinct_backers, 0) >= $1
      ORDER BY m.total_money DESC`,
    [kMin]
  );

  if (res.rows.length === 0) return [];

  const targets = res.rows.map((r) => r.target as string);
  const tops = await queryPg(
    `SELECT DISTINCT ON (p.demand_target) p.demand_target AS target, p.id, p.title,
            (SELECT COUNT(*) FROM brand_responses br WHERE br.post_id = p.id) AS responses
       FROM posts p
      WHERE p.status = 'live' AND p.demand_target = ANY($1::text[])
      ORDER BY p.demand_target, p.total_raised_cents DESC`,
    [targets]
  );

  const topByTarget = new Map<string, { title: string; responded: boolean }>();
  for (const row of tops.rows) {
    topByTarget.set(row.target, { title: row.title, responded: num(row.responses) > 0 });
  }

  return res.rows.map((row) => {
    const top = topByTarget.get(row.target);
    return {
      target_brand: row.target,
      total_demands_count: num(row.demands_count),
      total_money_cents: num(row.total_money),
      total_backers: num(row.distinct_backers),
      top_demand_title: top?.title ?? '',
      status: top?.responded ? ('responded' as const) : ('active_unanswered' as const),
      k_anonymity_verified: true,
    };
  });
}

export interface InsightDebateFaction {
  faction: string;
  side_key: string;
  percentage: number;
  total_cents: number;
  backers_count: number;
  free_votes_count: number;
  community_opinions_count: number;
}

export interface InsightDebateAggregate {
  debate_id: string;
  slug: string;
  question: string;
  total_money_raised_cents: number;
  total_distinct_backers: number;
  total_free_votes: number;
  faction_breakdown: InsightDebateFaction[];
  k_anonymity_verified: boolean;
}

/**
 * Aggregate war sentiment for the Insights API.
 *
 * Held to the same standard as the demand aggregates: a war whose DISTINCT
 * backer count is below INSIGHTS_K_MIN is not published at all. The count is
 * distinct users across every side, not the sum of per-side backer counts —
 * summing would double-count anyone who backed two factions and would
 * therefore overstate the crowd that the anonymity floor is meant to protect.
 *
 * `k_anonymity_verified` is only ever true here because rows that fail the
 * check never reach the caller; nothing is padded to make the floor.
 */
export async function getInsightsDebates(): Promise<InsightDebateAggregate[]> {
  const kMin = getInsightsKMin();

  const eligible = await queryPg(
    `SELECT d.id, d.slug, d.question, COUNT(DISTINCT pb.user_id) AS distinct_backers
       FROM debates d
       JOIN debate_sides ds ON ds.debate_id = d.id
       LEFT JOIN post_backers pb ON pb.post_id = ds.post_id
      WHERE d.status = 'live'
      GROUP BY d.id, d.slug, d.question
     HAVING COUNT(DISTINCT pb.user_id) >= $1
      ORDER BY COUNT(DISTINCT pb.user_id) DESC
      LIMIT 200`,
    [kMin]
  );

  if (eligible.rows.length === 0) return [];

  const debateIds = eligible.rows.map((r) => r.id as string);

  const [sidesRes, votesRes, opinionsRes] = await Promise.all([
    queryPg(
      `SELECT ds.debate_id, ds.side_key, ds.label,
              COALESCE(p.total_raised_cents, 0) AS total_cents,
              COALESCE(p.backers_count, 0) AS backers_count
         FROM debate_sides ds
         LEFT JOIN posts p ON p.id = ds.post_id
        WHERE ds.debate_id = ANY($1::text[])
        ORDER BY ds.debate_id, ds.side_key`,
      [debateIds]
    ),
    queryPg('SELECT debate_id, side_key, votes FROM debate_free_votes WHERE debate_id = ANY($1::text[])', [
      debateIds,
    ]),
    queryPg(
      `SELECT debate_id, side_key, COUNT(*) AS n
         FROM debate_opinions
        WHERE debate_id = ANY($1::text[])
        GROUP BY debate_id, side_key`,
      [debateIds]
    ),
  ]);

  const votesByKey = new Map<string, number>();
  for (const row of votesRes.rows) votesByKey.set(`${row.debate_id}:${row.side_key}`, num(row.votes));

  const opinionsByKey = new Map<string, number>();
  for (const row of opinionsRes.rows) opinionsByKey.set(`${row.debate_id}:${row.side_key}`, num(row.n));

  return eligible.rows.map((debate) => {
    const sides = sidesRes.rows.filter((s) => s.debate_id === debate.id);
    const totalMoney = sides.reduce((acc, s) => acc + num(s.total_cents), 0);

    let totalFreeVotes = 0;
    const factions: InsightDebateFaction[] = sides.map((side) => {
      const key = `${side.debate_id}:${side.side_key}`;
      const freeVotes = votesByKey.get(key) ?? 0;
      totalFreeVotes += freeVotes;
      return {
        faction: side.label,
        side_key: side.side_key,
        percentage: totalMoney > 0 ? Math.round((num(side.total_cents) / totalMoney) * 100) : 0,
        total_cents: num(side.total_cents),
        backers_count: num(side.backers_count),
        free_votes_count: freeVotes,
        community_opinions_count: opinionsByKey.get(key) ?? 0,
      };
    });

    return {
      debate_id: debate.id,
      slug: debate.slug,
      question: debate.question,
      total_money_raised_cents: totalMoney,
      total_distinct_backers: num(debate.distinct_backers),
      total_free_votes: totalFreeVotes,
      faction_breakdown: factions,
      k_anonymity_verified: true,
    };
  });
}

// ==========================================================================
// Debates
// ==========================================================================

const FACTION_COLORS = ['#f59e0b', '#06b6d4', '#a855f7', '#10b981', '#f43f5e', '#3b82f6'];

export async function createDebate(debate: Debate, sides: DebateSide[]): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO debates (id, slug, question, status, curated, is_political, category_id,
                            sponsor_user_id, sponsor_label, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($10::timestamptz, NOW()))
       ON CONFLICT (id) DO UPDATE SET
         slug = EXCLUDED.slug,
         question = EXCLUDED.question,
         status = EXCLUDED.status,
         curated = EXCLUDED.curated,
         is_political = EXCLUDED.is_political,
         category_id = EXCLUDED.category_id,
         sponsor_user_id = EXCLUDED.sponsor_user_id,
         sponsor_label = EXCLUDED.sponsor_label`,
      [
        debate.id,
        debate.slug,
        debate.question,
        debate.status,
        debate.curated,
        debate.is_political,
        debate.category_id || 'global',
        isUuid(debate.sponsor_user_id) ? debate.sponsor_user_id : null,
        debate.sponsor_label ?? null,
        debate.created_at ?? null,
      ]
    );

    for (const side of sides) {
      await client.query(
        `INSERT INTO debate_sides (debate_id, side_key, label, post_id)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (debate_id, side_key) DO UPDATE SET label = EXCLUDED.label, post_id = EXCLUDED.post_id`,
        [debate.id, side.side_key, side.label, side.post_id]
      );
    }
  });
}

export async function addFreeVote(debateId: string, sideKey: string): Promise<number> {
  const res = await queryPg(
    `INSERT INTO debate_free_votes (debate_id, side_key, votes)
     VALUES ($1, $2, 1)
     ON CONFLICT (debate_id, side_key) DO UPDATE SET votes = debate_free_votes.votes + 1
     RETURNING votes`,
    [debateId, sideKey]
  );
  return num(res.rows[0]?.votes);
}

export interface DebateOpinion {
  id: string;
  debate_id: string;
  side_key: string;
  author_name: string;
  text: string;
  is_paid: boolean;
  amount_cents: number;
  created_at: string;
}

const MAX_OPINION_LENGTH = 500;

/**
 * Records an opinion on one side of a debate.
 *
 * A FREE opinion also counts as that side's free vote — posting an argument is
 * how you vote when you are not paying. A PAID opinion must not: the money
 * already moved the side's post up the board through `recordInteraction`, and
 * adding a free vote on top counted the same backing twice, inflating the free
 * tally by exactly the number of people who paid.
 */
export async function addDebateOpinion(params: {
  debateId: string;
  sideKey: string;
  authorName: string;
  text: string;
  isPaid?: boolean;
  amountCents?: number;
}): Promise<DebateOpinion> {
  const text = String(params.text ?? '').trim();
  if (text.length === 0) {
    throw new StoreError('INVALID_OPINION', 'Opinion text is required.', 400);
  }
  if (text.length > MAX_OPINION_LENGTH) {
    throw new StoreError('INVALID_OPINION', `Opinion must be ${MAX_OPINION_LENGTH} characters or fewer.`, 400);
  }

  const isPaid = !!params.isPaid;

  const res = await queryPg(
    `INSERT INTO debate_opinions (id, debate_id, side_key, author_name, text, is_paid, amount_cents)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      shortId('op'),
      params.debateId,
      params.sideKey,
      (params.authorName || 'Community Contributor').slice(0, 80),
      text,
      isPaid,
      Math.max(0, Math.trunc(params.amountCents ?? 0)),
    ]
  );

  if (!isPaid) await addFreeVote(params.debateId, params.sideKey);

  const row = res.rows[0];
  return {
    id: row.id,
    debate_id: row.debate_id,
    side_key: row.side_key,
    author_name: row.author_name,
    text: row.text,
    is_paid: !!row.is_paid,
    amount_cents: num(row.amount_cents),
    created_at: iso(row.created_at),
  };
}

async function buildDebateViews(debates: Debate[]): Promise<DebateView[]> {
  if (debates.length === 0) return [];

  const debateIds = debates.map((d) => d.id);
  const cat = (await getCategory('global')) ?? {
    id: 'global',
    name: 'Global Arena',
    is_live: true,
    half_life_hours: 168,
    increment_strategy: 'percent' as const,
    increment_config: { pct: 0.1, floor_cents: 50 },
    score_epoch: new Date().toISOString(),
    min_power_cents: 1000,
  };

  const sidesRes = await queryPg(
    'SELECT * FROM debate_sides WHERE debate_id = ANY($1::text[]) ORDER BY debate_id, side_key',
    [debateIds]
  );
  const sides = sidesRes.rows;
  const postIds = Array.from(new Set(sides.map((s) => s.post_id as string)));

  const [rankedPosts, backersRes, votesRes, opinionsRes] = await Promise.all([
    fetchRankedByIds(postIds, null, cat),
    postIds.length
      ? queryPg(
          'SELECT * FROM post_backers WHERE post_id = ANY($1::uuid[]) ORDER BY post_id, total_cents DESC',
          [postIds]
        )
      : Promise.resolve({ rows: [] as QueryResultRow[] }),
    queryPg('SELECT * FROM debate_free_votes WHERE debate_id = ANY($1::text[])', [debateIds]),
    queryPg(
      'SELECT * FROM debate_opinions WHERE debate_id = ANY($1::text[]) ORDER BY created_at DESC',
      [debateIds]
    ),
  ]);

  const backersByPost = new Map<string, PostBacker[]>();
  for (const row of backersRes.rows) {
    const list = backersByPost.get(row.post_id) ?? [];
    list.push(mapBacker(row));
    backersByPost.set(row.post_id, list);
  }

  const votesByKey = new Map<string, number>();
  for (const row of votesRes.rows) {
    votesByKey.set(`${row.debate_id}:${row.side_key}`, num(row.votes));
  }

  const opinionsByKey = new Map<string, DebateOpinion[]>();
  for (const row of opinionsRes.rows) {
    const key = `${row.debate_id}:${row.side_key}`;
    const list = opinionsByKey.get(key) ?? [];
    list.push({
      id: row.id,
      debate_id: row.debate_id,
      side_key: row.side_key,
      author_name: row.author_name,
      text: row.text,
      is_paid: !!row.is_paid,
      amount_cents: num(row.amount_cents),
      created_at: iso(row.created_at),
    });
    opinionsByKey.set(key, list);
  }

  // Any side post that is not live still needs a placeholder view.
  const missingIds = postIds.filter((id) => !rankedPosts.has(id));
  if (missingIds.length > 0) {
    const missingRes = await queryPg('SELECT * FROM posts WHERE id = ANY($1::uuid[])', [missingIds]);
    for (const row of missingRes.rows) {
      const post = mapPost(row);
      rankedPosts.set(post.id, { ...post, rank: 999, display_score: 0, rank_24h_delta: 0 });
    }
  }

  return debates.map((debate) => {
    const debateSides = sides.filter((s) => s.debate_id === debate.id);
    let totalMoney = 0;
    let totalBackers = 0;
    let totalFreeVotes = 0;

    const sideViews = debateSides.map((side, idx) => {
      const post = rankedPosts.get(side.post_id);
      const roster = (backersByPost.get(side.post_id) ?? [])
        .filter((b) => b.visibility !== 'anonymous')
        .slice(0, 10)
        .map((b) => ({
          name: b.user_display || 'Verified Backer',
          total_cents: b.total_cents,
          first_backed_at: b.first_backed_at,
        }));

      const key = `${debate.id}:${side.side_key}`;
      const freeVotes = votesByKey.get(key) ?? 0;
      const opinions = (opinionsByKey.get(key) ?? []).slice(0, 20);

      totalMoney += post?.total_raised_cents ?? 0;
      totalBackers += post?.backers_count ?? 0;
      totalFreeVotes += freeVotes;

      return {
        side_key: side.side_key as string,
        label: side.label as string,
        description: post?.body || undefined,
        post: post as RankedPostView,
        total_cents: post?.total_raised_cents ?? 0,
        backers_count: post?.backers_count ?? 0,
        free_votes_count: freeVotes,
        percentage: 0,
        color: FACTION_COLORS[idx % FACTION_COLORS.length],
        roster,
        opinions: opinions.map((o) => ({
          id: o.id,
          author_name: o.author_name,
          text: o.text,
          is_paid: o.is_paid,
          amount_cents: o.amount_cents,
          created_at: o.created_at,
        })),
      };
    });

    // Normalise to exactly 100% with the remainder going to the last side.
    if (totalMoney > 0) {
      let sumPct = 0;
      sideViews.forEach((sv, idx) => {
        if (idx === sideViews.length - 1) {
          sv.percentage = Math.max(1, 100 - sumPct);
        } else {
          sv.percentage = Math.max(1, Math.round((sv.total_cents / totalMoney) * 100));
          sumPct += sv.percentage;
        }
      });
    } else if (sideViews.length > 0) {
      const equalPct = Math.floor(100 / sideViews.length);
      sideViews.forEach((sv) => (sv.percentage = equalPct));
    }

    return {
      ...debate,
      sides: sideViews,
      total_money_cents: totalMoney,
      total_backers: totalBackers,
      total_free_votes: totalFreeVotes,
    };
  });
}

function mapDebate(row: QueryResultRow): Debate {
  return {
    id: row.id,
    slug: row.slug,
    question: row.question,
    status: row.status,
    curated: !!row.curated,
    is_political: !!row.is_political,
    category_id: row.category_id,
    sponsor_user_id: row.sponsor_user_id ?? null,
    sponsor_label: row.sponsor_label ?? null,
    created_at: iso(row.created_at),
  };
}

export async function getDebates(): Promise<DebateView[]> {
  const res = await queryPg('SELECT * FROM debates ORDER BY created_at DESC LIMIT 100');
  return buildDebateViews(res.rows.map(mapDebate));
}

export async function getDebateBySlug(slug: string): Promise<DebateView | null> {
  const res = await queryPg('SELECT * FROM debates WHERE slug = $1 OR id = $1 LIMIT 1', [slug]);
  if (!res.rows[0]) return null;
  const views = await buildDebateViews([mapDebate(res.rows[0])]);
  return views[0] ?? null;
}

// ==========================================================================
// Fights (head-to-head)
// ==========================================================================

/**
 * `lead_changes_24h` is measured, not invented: we replay the rank_events of
 * both posts over the last 24h and count how many times the sign of
 * (rankA − rankB) flipped. No events ⇒ 0.
 */
export async function getFights(): Promise<FightPair[]> {
  const cat = await getCategory('global');
  if (!cat) return [];

  const board = await getRankedBoard('global', { limit: 50 });

  // Declared pairs come from the table, not from the visible page of the
  // board. A war posted a minute ago starts at score zero — pairing only what
  // already sits in the top 50 would keep it out of the fights ledger until
  // somebody paid to lift it, which is exactly backwards for a brand new
  // fight nobody has backed yet.
  const linked = await queryPg(
    `SELECT child.id AS child_id, parent.id AS parent_id
       FROM posts child
       JOIN posts parent ON parent.id = child.counter_of
      WHERE child.status = 'live' AND parent.status = 'live'
      ORDER BY (child.score_base + parent.score_base) DESC, child.created_at DESC
      LIMIT 24`
  );

  const byId = new Map(board.map((p) => [p.id, p]));
  const offBoard = linked.rows
    .flatMap((row) => [row.parent_id as string, row.child_id as string])
    .filter((id) => !byId.has(id));

  // One batched lookup for the pair members that are not on the visible page.
  const ranked = await fetchRankedByIds(offBoard, categoryFilter('global'), cat);
  const viewOf = (id: string): RankedPostView | null => byId.get(id) ?? ranked.get(id) ?? null;

  const pairs: Array<{ id: string; a: RankedPostView; b: RankedPostView }> = [];
  const used = new Set<string>();

  for (const row of linked.rows) {
    const parent = viewOf(row.parent_id as string);
    const child = viewOf(row.child_id as string);
    if (!parent || !child) continue;
    pairs.push({ id: `fight_${child.id}_${parent.id}`, a: parent, b: child });
    used.add(child.id);
    used.add(parent.id);
  }

  for (let i = 0; i < Math.max(0, Math.min(board.length - 1, 6)); i += 2) {
    const p1 = board[i];
    const p2 = board[i + 1];
    if (!p1 || !p2) continue;
    if (used.has(p1.id) || used.has(p2.id)) continue;
    pairs.push({ id: `war_${p1.id}_${p2.id}`, a: p1, b: p2 });
    used.add(p1.id);
    used.add(p2.id);
  }

  if (pairs.length === 0) return [];

  const involved = Array.from(new Set(pairs.flatMap((p) => [p.a.id, p.b.id])));
  const eventsRes = await queryPg(
    `SELECT post_id, new_rank, occurred_at
       FROM rank_events
      WHERE post_id = ANY($1::uuid[]) AND occurred_at > NOW() - INTERVAL '24 hours'
      ORDER BY occurred_at ASC
      LIMIT 2000`,
    [involved]
  );

  const updatedAt = new Date().toISOString();
  return pairs.map((pair) => ({
    id: pair.id,
    post_a: pair.a,
    post_b: pair.b,
    total_money_cents: pair.a.total_raised_cents + pair.b.total_raised_cents,
    total_backers: pair.a.backers_count + pair.b.backers_count,
    lead_changes_24h: countLeadChanges(eventsRes.rows, pair.a.id, pair.b.id),
    updated_at: updatedAt,
  }));
}

function countLeadChanges(rows: QueryResultRow[], aId: string, bId: string): number {
  let rankA: number | null = null;
  let rankB: number | null = null;
  let lastLeader: 'a' | 'b' | null = null;
  let changes = 0;

  for (const row of rows) {
    if (row.post_id !== aId && row.post_id !== bId) continue;
    if (row.new_rank === null) continue;
    if (row.post_id === aId) rankA = num(row.new_rank);
    else rankB = num(row.new_rank);
    if (rankA === null || rankB === null || rankA === rankB) continue;

    const leader = rankA < rankB ? 'a' : 'b';
    if (lastLeader !== null && leader !== lastLeader) changes++;
    lastLeader = leader;
  }

  return changes;
}

// ==========================================================================
// Snapshots & rebase
// ==========================================================================

export async function saveDailySnapshot(dateStr: string, categoryId = 'global'): Promise<BoardSnapshot> {
  const board = await getRankedBoard(categoryId, { limit: 1000 });
  const rankings = board.map((p) => ({
    rank: p.rank,
    post_id: p.id,
    title: p.title,
    author_display: p.author_display,
    score_display: p.display_score,
    total_raised_cents: p.total_raised_cents,
    backers_count: p.backers_count,
  }));

  await queryPg(
    `INSERT INTO board_snapshots (category_id, snapshot_date, rankings)
     VALUES ($1, $2::date, $3::jsonb)
     ON CONFLICT (category_id, snapshot_date) DO UPDATE SET rankings = EXCLUDED.rankings`,
    [categoryId, dateStr, JSON.stringify(rankings)]
  );

  return { category_id: categoryId, snapshot_date: dateStr, rankings };
}

function mapSnapshot(row: QueryResultRow): BoardSnapshot {
  const date = row.snapshot_date instanceof Date
    ? row.snapshot_date.toISOString().slice(0, 10)
    : String(row.snapshot_date).slice(0, 10);
  return { category_id: row.category_id, snapshot_date: date, rankings: row.rankings ?? [] };
}

export async function getHistoricalSnapshot(
  dateStr: string,
  categoryId = 'global'
): Promise<BoardSnapshot | null> {
  const res = await queryPg(
    'SELECT * FROM board_snapshots WHERE category_id = $1 AND snapshot_date = $2::date',
    [categoryId, dateStr]
  );
  return res.rows[0] ? mapSnapshot(res.rows[0]) : null;
}

/**
 * Just the dates a board has snapshots for. Deliberately does not select the
 * `rankings` JSONB — the history index only needs the calendar.
 */
export async function getSnapshotDates(categoryId = 'global', limit = 365): Promise<string[]> {
  const res = await queryPg(
    `SELECT snapshot_date FROM board_snapshots
      WHERE category_id = $1
      ORDER BY snapshot_date DESC
      LIMIT $2`,
    [categoryId, Math.min(Math.max(1, limit), 1000)]
  );
  return res.rows.map((row) =>
    row.snapshot_date instanceof Date
      ? row.snapshot_date.toISOString().slice(0, 10)
      : String(row.snapshot_date).slice(0, 10)
  );
}

export async function getAllSnapshots(limit = 90): Promise<BoardSnapshot[]> {
  const res = await queryPg('SELECT * FROM board_snapshots ORDER BY snapshot_date DESC LIMIT $1', [
    Math.min(Math.max(1, limit), 400),
  ]);
  return res.rows.map(mapSnapshot);
}

/**
 * Advances the category epoch and rescales every stored score by the same
 * factor. Relative ordering is invariant; this exists purely to stop
 * score_base from growing without bound as the epoch recedes.
 */
export async function rebaseBoard(categoryId = 'global'): Promise<{ oldEpoch: string; newEpoch: string; factor: number }> {
  return withTransaction(async (client) => {
    const catRes = await client.query('SELECT * FROM categories WHERE id = $1 FOR UPDATE', [categoryId]);
    if (!catRes.rows[0]) throw new StoreError('CATEGORY_NOT_FOUND', 'Category not found.', 404);
    const cat = mapCategory(catRes.rows[0]);

    const now = new Date();
    const halfLifeMs = cat.half_life_hours * 3600 * 1000;
    const factor = Math.pow(2, -(now.getTime() - new Date(cat.score_epoch).getTime()) / halfLifeMs);
    const filter = categoryFilter(categoryId);

    await client.query(
      `UPDATE posts SET score_base = score_base * $2 WHERE ($1::text IS NULL OR category_id = $1)`,
      [filter, factor]
    );
    await client.query('UPDATE categories SET score_epoch = $2 WHERE id = $1', [categoryId, now.toISOString()]);

    await insertAudit(client, {
      actor_id: null,
      actor_type: 'system',
      action: 'board_rebased',
      entity_type: 'category',
      entity_id: categoryId,
      detail: { old_epoch: cat.score_epoch, new_epoch: now.toISOString(), factor },
      ip_hash: null,
    });

    return { oldEpoch: cat.score_epoch, newEpoch: now.toISOString(), factor };
  });
}

// ==========================================================================
// Notifications
// ==========================================================================

export async function getUserNotifications(userId: string, limit = 50): Promise<Notification[]> {
  if (!isUuid(userId)) return [];
  const res = await queryPg(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, Math.min(Math.max(1, limit), 200)]
  );
  return res.rows.map(mapNotification);
}

/** Ownership is part of the WHERE clause — a user can only read their own. */
export async function markNotificationRead(id: string, userId: string): Promise<boolean> {
  if (!isUuid(userId)) return false;
  const res = await queryPg(
    'UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 AND read_at IS NULL RETURNING id',
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

// ==========================================================================
// Reports & moderation
// ==========================================================================

export async function addReport(report: Omit<Report, 'id' | 'created_at'> & { id?: string }): Promise<Report> {
  const res = await queryPg(
    `INSERT INTO reports (id, post_id, reporter_id, reason, detail, status)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      report.id ?? shortId('rep'),
      report.post_id,
      isUuid(report.reporter_id) ? report.reporter_id : null,
      report.reason,
      report.detail ?? null,
      report.status ?? 'open',
    ]
  );
  const row = res.rows[0];
  return {
    id: row.id,
    post_id: row.post_id,
    reporter_id: row.reporter_id ?? null,
    reason: row.reason,
    detail: row.detail ?? null,
    status: row.status,
    created_at: iso(row.created_at),
  };
}

/** Distinct reporters needed before a live post is pulled for human review. */
export const REPORT_ESCALATION_THRESHOLD = 3;

export const REPORT_REASONS = [
  'illegal',
  'harassment',
  'spam',
  'scam',
  'private_person',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export interface ReportOutcome {
  /** True when this reporter had already reported this post. Nothing changed. */
  duplicate: boolean;
  /** True when THIS report crossed the threshold and moved the post. */
  escalated: boolean;
  /** Distinct reporters on the post after this call. */
  distinctReporters: number;
}

/**
 * Files a report and, at the threshold, pulls the post off the board.
 *
 * One transaction, and the post row is locked before the count is read, so
 * three simultaneous third reports cannot each believe they were the one that
 * escalated (which would file three moderation actions and three
 * notifications for one event).
 *
 * The duplicate path is deliberately indistinguishable from a first report in
 * the response the route builds: telling a reporter "you already reported
 * this" is harmless, but telling them *how many others did* would turn the
 * endpoint into a probe for how close a rival's post is to being pulled.
 */
export async function reportPost(params: {
  postId: string;
  reporterId: string;
  reason: ReportReason;
  detail?: string | null;
}): Promise<ReportOutcome> {
  if (!isUuid(params.reporterId)) throw new StoreError('USER_NOT_FOUND', 'Unknown user.', 404);

  const post = await getPost(params.postId);
  if (!post) throw new StoreError('POST_NOT_FOUND', 'Post not found.', 404);
  if (post.status !== 'live' && post.status !== 'pending_review') {
    throw new StoreError('POST_NOT_REPORTABLE', 'This post is no longer on the public record.', 404);
  }

  return withTransaction(async (client) => {
    const locked = await client.query('SELECT id, status, author_id, title FROM posts WHERE id = $1 FOR UPDATE', [
      post.id,
    ]);
    const row = locked.rows[0];
    if (!row) throw new StoreError('POST_NOT_FOUND', 'Post not found.', 404);
    if (row.status !== 'live' && row.status !== 'pending_review') {
      throw new StoreError('POST_NOT_REPORTABLE', 'This post is no longer on the public record.', 404);
    }

    const inserted = await client.query(
      `INSERT INTO reports (id, post_id, reporter_id, reason, detail, status)
       VALUES ($1, $2, $3, $4, $5, 'open')
       ON CONFLICT (post_id, reporter_id) WHERE reporter_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [shortId('rep'), post.id, params.reporterId, params.reason, params.detail ?? null]
    );

    const counted = await client.query(
      'SELECT COUNT(DISTINCT reporter_id) AS n FROM reports WHERE post_id = $1 AND reporter_id IS NOT NULL',
      [post.id]
    );
    const distinctReporters = num(counted.rows[0]?.n);

    if ((inserted.rowCount ?? 0) === 0) {
      return { duplicate: true, escalated: false, distinctReporters };
    }

    const shouldEscalate = row.status === 'live' && distinctReporters >= REPORT_ESCALATION_THRESHOLD;
    if (!shouldEscalate) {
      return { duplicate: false, escalated: false, distinctReporters };
    }

    await client.query(`UPDATE posts SET status = 'pending_review' WHERE id = $1`, [post.id]);

    await client.query(
      `INSERT INTO moderation_actions (id, actor_id, post_id, target_user_id, action, reason, automated)
       VALUES ($1, NULL, $2, $3, 'warn', $4, true)`,
      [
        shortId('mod'),
        post.id,
        row.author_id,
        `Auto-escalated: ${distinctReporters} distinct reporters`,
      ]
    );

    await insertAudit(client, {
      actor_id: null,
      actor_type: 'system',
      action: 'auto_escalated_reports',
      entity_type: 'post',
      entity_id: post.id,
      detail: { distinct_reporters: distinctReporters, threshold: REPORT_ESCALATION_THRESHOLD },
      ip_hash: null,
    });

    // The author is told their post left the board. Saying only that it is
    // under review — not who reported it or why — keeps the reporters
    // anonymous, which is the only thing that makes reporting safe to use.
    if (isUuid(row.author_id)) {
      await client.query(
        `INSERT INTO notifications (id, user_id, kind, payload, channels)
         VALUES ($1, $2, 'post_under_review', $3::jsonb, ARRAY['inapp']::text[])`,
        [
          shortId('notif'),
          row.author_id,
          JSON.stringify({
            post_id: post.id,
            post_title: row.title,
            message: 'This stance is hidden from the board while a moderator reviews reports about it.',
          }),
        ]
      );
    }

    return { duplicate: false, escalated: true, distinctReporters };
  });
}

export async function getReports(limit = 100): Promise<Report[]> {
  const res = await queryPg('SELECT * FROM reports ORDER BY created_at DESC LIMIT $1', [
    Math.min(Math.max(1, limit), 500),
  ]);
  return res.rows.map((row) => ({
    id: row.id,
    post_id: row.post_id,
    reporter_id: row.reporter_id ?? null,
    reason: row.reason,
    detail: row.detail ?? null,
    status: row.status,
    created_at: iso(row.created_at),
  }));
}

/** The queue a moderator actually works: unresolved reports, oldest context first. */
export async function getOpenReports(limit = 100): Promise<Report[]> {
  const res = await queryPg(
    `SELECT * FROM reports WHERE status IN ('open', 'reviewing') ORDER BY created_at DESC LIMIT $1`,
    [Math.min(Math.max(1, limit), 500)]
  );
  return res.rows.map((row) => ({
    id: row.id,
    post_id: row.post_id,
    reporter_id: row.reporter_id ?? null,
    reason: row.reason,
    detail: row.detail ?? null,
    status: row.status,
    created_at: iso(row.created_at),
  }));
}

/** Open-report count as a SQL aggregate, not a filtered page of rows. */
export async function getOpenReportsCount(): Promise<number> {
  const res = await queryPg(`SELECT COUNT(*) AS n FROM reports WHERE status = 'open'`);
  return num(res.rows[0]?.n);
}

export async function moderatePost(
  postId: string,
  action: 'approve' | 'reject' | 'remove' | 'restore',
  reason: string,
  actorId: string | null = null
): Promise<Post> {
  const post = await getPost(postId);
  if (!post) throw new StoreError('POST_NOT_FOUND', 'Post not found.', 404);

  const status =
    action === 'approve' || action === 'restore' ? 'live' : action === 'reject' ? 'rejected' : 'removed_tos';
  const clearing = action === 'approve' || action === 'restore';

  return withTransaction(async (client) => {
    const res = await client.query(
      `UPDATE posts
          SET status = $2,
              removed_at = CASE WHEN $3 THEN NULL ELSE NOW() END,
              removed_reason = CASE WHEN $3 THEN NULL ELSE $4 END
        WHERE id = $1
        RETURNING *`,
      [post.id, status, clearing, reason]
    );

    await client.query(
      `INSERT INTO moderation_actions (id, actor_id, post_id, target_user_id, action, reason, automated)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [shortId('mod'), isUuid(actorId) ? actorId : null, post.id, post.author_id, action, reason, actorId === null]
    );

    await insertAudit(client, {
      actor_id: isUuid(actorId) ? actorId : null,
      actor_type: actorId ? 'admin' : 'system',
      action: `moderate_${action}`,
      entity_type: 'post',
      entity_id: post.id,
      detail: { reason },
      ip_hash: null,
    });

    return mapPost(res.rows[0]);
  });
}

export async function getModerationActions(limit = 100): Promise<ModerationAction[]> {
  const res = await queryPg('SELECT * FROM moderation_actions ORDER BY created_at DESC LIMIT $1', [
    Math.min(Math.max(1, limit), 500),
  ]);
  return res.rows.map((row) => ({
    id: row.id,
    actor_id: row.actor_id ?? null,
    post_id: row.post_id ?? null,
    target_user_id: row.target_user_id ?? null,
    action: row.action,
    reason: row.reason,
    automated: !!row.automated,
    created_at: iso(row.created_at),
  }));
}

// ==========================================================================
// Audit log
// ==========================================================================

async function insertAudit(
  client: PoolClient | null,
  entry: Omit<AuditLog, 'id' | 'created_at'>
): Promise<void> {
  await run(
    client,
    `INSERT INTO audit_logs (actor_id, actor_type, action, entity_type, entity_id, detail, ip_hash)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
    [
      isUuid(entry.actor_id) ? entry.actor_id : null,
      entry.actor_type,
      entry.action,
      entry.entity_type,
      entry.entity_id,
      JSON.stringify(entry.detail ?? {}),
      entry.ip_hash,
    ]
  );
}

export async function logAudit(entry: Omit<AuditLog, 'id' | 'created_at'>): Promise<void> {
  await insertAudit(null, entry);
}

export async function getAuditLogs(limit = 100): Promise<AuditLog[]> {
  const res = await queryPg('SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT $1', [
    Math.min(Math.max(1, limit), 500),
  ]);
  return res.rows.map(mapAuditLog);
}

// ==========================================================================
// Admin analytics
// ==========================================================================

export interface AdminStats {
  total_topup_dollars: number;
  recognized_spend_dollars: number;
  unspent_float_dollars: number;
  stripe_fees_dollars: number;
  net_profit_dollars: number;
  total_interactions: number;
  total_likes_units: number;
  distinct_backers: number;
  total_posts: number;
  top_post_price: number;
  top_post_title: string;
}

/** Pure SQL aggregates — never loads tables into JS. */
export async function getAdminStats(): Promise<AdminStats> {
  const [payments, wallets, posts, interactions, backers, top] = await Promise.all([
    queryPg(
      `SELECT COALESCE(SUM(amount_cents) FILTER (WHERE status = 'succeeded'), 0) AS topup_cents,
              COUNT(*) FILTER (WHERE status = 'succeeded') AS topup_count
         FROM payments`
    ),
    queryPg(
      `SELECT COALESCE(SUM(balance_cents), 0) AS float_cents,
              COALESCE(SUM(lifetime_spend_cents), 0) AS spend_cents
         FROM wallets`
    ),
    queryPg(`SELECT COUNT(*) AS n, COALESCE(SUM(like_units), 0) AS likes FROM posts`),
    queryPg(`SELECT COUNT(*) AS n FROM interactions`),
    queryPg(`SELECT COUNT(DISTINCT user_id) AS n FROM post_backers`),
    queryPg(`SELECT title, score_base, category_id FROM posts WHERE status = 'live' ORDER BY score_base DESC LIMIT 1`),
  ]);

  const totalTopupCents = num(payments.rows[0]?.topup_cents);
  const topupCount = num(payments.rows[0]?.topup_count);
  const recognizedSpendCents = num(wallets.rows[0]?.spend_cents);
  const floatCents = num(wallets.rows[0]?.float_cents);

  // Stripe standard card pricing: 2.9% + 30¢ per successful charge.
  const stripeFeesCents = Math.round(totalTopupCents * 0.029 + topupCount * 30);

  let topPostPrice = 0;
  let topPostTitle = 'None';
  if (top.rows[0]) {
    topPostTitle = top.rows[0].title;
    const cat = await getCategory(top.rows[0].category_id || 'global');
    if (cat) {
      topPostPrice = round2(
        calculateDecayedScore(num(top.rows[0].score_base), Date.now(), cat.score_epoch, cat.half_life_hours)
      );
    }
  }

  return {
    total_topup_dollars: totalTopupCents / 100,
    recognized_spend_dollars: recognizedSpendCents / 100,
    unspent_float_dollars: floatCents / 100,
    stripe_fees_dollars: stripeFeesCents / 100,
    net_profit_dollars: (recognizedSpendCents - stripeFeesCents) / 100,
    total_interactions: num(interactions.rows[0]?.n),
    total_likes_units: num(posts.rows[0]?.likes),
    distinct_backers: num(backers.rows[0]?.n),
    total_posts: num(posts.rows[0]?.n),
    top_post_price: topPostPrice,
    top_post_title: topPostTitle,
  };
}

// ==========================================================================
// Sitemap
// ==========================================================================

export interface SitemapEntry {
  slug: string;
  updated_at: string;
}

/**
 * Slugs and timestamps for the public sitemap. Two narrow projections rather
 * than `getRankedBoard` + `getDebates`, which would build full view objects
 * (backer rosters, opinions, rank deltas) that a sitemap never reads.
 */
export async function getSitemapEntries(
  limit = 1000
): Promise<{ posts: SitemapEntry[]; debates: SitemapEntry[] }> {
  const capped = Math.min(Math.max(1, limit), 5000);

  const [posts, debates] = await Promise.all([
    queryPg(
      `SELECT slug, created_at FROM posts
        WHERE status = 'live' AND slug IS NOT NULL
        ORDER BY score_base DESC, created_at DESC
        LIMIT $1`,
      [capped]
    ),
    queryPg(
      `SELECT COALESCE(slug, id) AS slug, created_at FROM debates
        WHERE status = 'live'
        ORDER BY created_at DESC
        LIMIT $1`,
      [Math.min(capped, 1000)]
    ),
  ]);

  const toEntry = (row: QueryResultRow): SitemapEntry => ({
    slug: row.slug,
    updated_at: iso(row.created_at),
  });

  return { posts: posts.rows.map(toEntry), debates: debates.rows.map(toEntry) };
}

// ==========================================================================
// GDPR erasure
// ==========================================================================

/**
 * Tombstones a user and everything that identifies them.
 *
 * Financial rows (payments, wallet_ledger, interactions) are retained because
 * they are books of record; only the human-readable display fields on them are
 * anonymised.
 */
export async function eraseUser(userId: string): Promise<{ erased: boolean }> {
  if (!isUuid(userId)) return { erased: false };

  return withTransaction(async (client) => {
    const userRes = await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!userRes.rows[0]) return { erased: false };

    await client.query(
      `UPDATE users
          SET deleted_at = NOW(),
              alias = '[Deleted User]',
              email = $2,
              stripe_customer_id = NULL,
              is_profile_public = false
        WHERE id = $1`,
      [userId, `deleted_${userId}@anon.showitglo.local`]
    );

    await client.query(
      `UPDATE posts
          SET status = 'removed_legal',
              removed_at = NOW(),
              removed_reason = 'Removed via GDPR erasure request',
              author_display = '[Anonymous]'
        WHERE author_id = $1`,
      [userId]
    );

    await client.query(
      `UPDATE post_backers SET user_display = 'Anonymous', visibility = 'anonymous' WHERE user_id = $1`,
      [userId]
    );
    await client.query(`UPDATE interactions SET payer_display = 'Anonymous' WHERE user_id = $1`, [userId]);

    // An erased account must not keep a live credential pointing at its data.
    const revoked = await client.query(
      `UPDATE api_keys SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id`,
      [userId]
    );

    // auth_tokens carries the user's real email in plaintext; the opportunistic
    // GC would let it linger for days. Erasure removes it now, in this txn.
    await client.query('DELETE FROM auth_tokens WHERE user_id = $1', [userId]);

    await insertAudit(client, {
      actor_id: userId,
      actor_type: 'user',
      action: 'gdpr_erasure',
      entity_type: 'user',
      entity_id: userId,
      detail: { reason: 'User requested account erasure', api_keys_revoked: revoked.rowCount ?? 0 },
      ip_hash: null,
    });

    log('info', 'user.erased', { user_id: userId, api_keys_revoked: revoked.rowCount ?? 0 });
    return { erased: true };
  });
}

// ==========================================================================
// Presence
// ==========================================================================

const PRESENCE_WINDOW_SECONDS = 90;
const PRESENCE_GC_SECONDS = 600;

/**
 * Create the `visitors` table on demand.
 *
 * scripts/schema.sql is the source of truth and creates this table too, but
 * the schema is applied by hand (`npm run db:init`) while deploys are
 * automatic — so a deploy can land hours before the migration does, and the
 * visitor count silently reads as "unavailable" the whole time. That is
 * exactly what happened on the first rollout.
 *
 * A single table with no foreign keys and no backfill is cheap enough to
 * create lazily, so the feature turns itself on the first time it is used
 * instead of waiting for an operator. The DDL below must stay identical to
 * the one in schema.sql.
 */
let visitorsTableReady: Promise<void> | null = null;

function ensureVisitorsTable(): Promise<void> {
  if (!visitorsTableReady) {
    visitorsTableReady = (async () => {
      await queryPg(
        `CREATE TABLE IF NOT EXISTS visitors (
           visitor_key         TEXT PRIMARY KEY,
           first_seen          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
           last_seen           TIMESTAMPTZ NOT NULL DEFAULT NOW()
         )`
      );
      await queryPg(`CREATE INDEX IF NOT EXISTS idx_visitors_last_seen ON visitors(last_seen)`);
      log('info', 'visitors.table.created');
    })().catch((err) => {
      // Two instances racing `CREATE TABLE IF NOT EXISTS` is a duplicate-object
      // error on one of them, not a failure: the table exists either way.
      const code = (err as { code?: string }).code;
      if (code === '23505' || code === '42P07') return;

      // Anything else (no CREATE privilege, for instance) must not be cached
      // as a permanent verdict — a later call gets to try again.
      visitorsTableReady = null;
      throw err;
    });
  }
  return visitorsTableReady;
}

/**
 * Run a visitors query, creating the table once if it turns out to be missing.
 * Every other error propagates untouched.
 */
async function withVisitorsTable<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if ((err as { code?: string }).code !== '42P01') throw err;
    await ensureVisitorsTable();
    return run();
  }
}

export async function heartbeat(sessionKey: string): Promise<void> {
  if (!sessionKey) return;
  const key = sessionKey.slice(0, 128);

  await queryPg(
    `INSERT INTO presence_heartbeats (session_key, last_seen)
     VALUES ($1, NOW())
     ON CONFLICT (session_key) DO UPDATE SET last_seen = NOW()`,
    [key]
  );

  // The durable half of the same beat. presence_heartbeats is GC'd, so it
  // could never answer "how many people have been here"; this row survives.
  await withVisitorsTable(() =>
    queryPg(
      `INSERT INTO visitors (visitor_key, first_seen, last_seen)
       VALUES ($1, NOW(), NOW())
       ON CONFLICT (visitor_key) DO UPDATE SET last_seen = NOW()`,
      [key]
    )
  ).catch((err) => {
    // Presence above is already recorded; the cumulative half is additive and
    // must never take the live count down with it. Logged rather than
    // swallowed — a count stuck at "unavailable" should say why.
    log('warn', 'visitors.upsert.failed', { error: String(err) });
  });

  // Opportunistic GC on ~1% of heartbeats — cheap enough to never need a cron.
  if (Math.random() < 0.01) {
    await queryPg(
      `DELETE FROM presence_heartbeats WHERE last_seen < NOW() - make_interval(secs => $1)`,
      [PRESENCE_GC_SECONDS]
    ).catch(() => {});
  }
}

export async function getPresenceCount(): Promise<number> {
  const res = await queryPg(
    `SELECT COUNT(*) AS n FROM presence_heartbeats WHERE last_seen > NOW() - make_interval(secs => $1)`,
    [PRESENCE_WINDOW_SECONDS]
  );
  return num(res.rows[0]?.n);
}

export interface VisitorTotals {
  /** Distinct visitors ever recorded. */
  total: number;
  /** Distinct visitors seen since midnight UTC. */
  today: number;
}

/**
 * Cached because `/api/v1/live/stats` is polled every 12 seconds by every open
 * tab, while these two counts move slowly. A ten-second memo collapses a
 * roomful of pollers into roughly one aggregate per instance per window.
 */
let visitorTotalsCache: { at: number; value: VisitorTotals } | null = null;
const VISITOR_TOTALS_TTL_MS = 10_000;

export async function getVisitorTotals(): Promise<VisitorTotals> {
  const now = Date.now();
  if (visitorTotalsCache && now - visitorTotalsCache.at < VISITOR_TOTALS_TTL_MS) {
    return visitorTotalsCache.value;
  }

  const res = await withVisitorsTable(() =>
    queryPg(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (
                WHERE last_seen >= date_trunc('day', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
              ) AS today
         FROM visitors`
    )
  );

  const value: VisitorTotals = {
    total: num(res.rows[0]?.total),
    today: num(res.rows[0]?.today),
  };
  visitorTotalsCache = { at: now, value };
  return value;
}

// ==========================================================================
// Cross-instance rate limiting
// ==========================================================================

export interface RateLimitVerdict {
  allowed: boolean;
  count: number;
  limit: number;
  resetInMs: number;
}

/**
 * Fixed-window counter shared by every instance.
 *
 * The in-memory limiter in src/lib/rateLimit.ts stays useful for cheap reads,
 * but anything that costs money or creates rows must be counted here, because
 * a per-instance map is trivially bypassed by hitting a different instance.
 * Fails OPEN: a limiter outage must not take payments down with it.
 */
export async function checkDbRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitVerdict> {
  const window = Math.max(1, Math.floor(windowSeconds));
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStartSec = Math.floor(nowSec / window) * window;
  const resetInMs = (windowStartSec + window) * 1000 - Date.now();

  try {
    const res = await queryPg(
      `INSERT INTO rate_limit_counters (bucket, window_start, count)
       VALUES ($1, to_timestamp($2), 1)
       ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limit_counters.count + 1
       RETURNING count`,
      [bucket.slice(0, 200), windowStartSec]
    );
    const count = num(res.rows[0]?.count, 1);

    // 25 hours, not 1: the longest window in use is a DAY (3 API keys per
    // 86400s), and its window_start is up to 24 hours in the past for the whole
    // of its life. Sweeping at 1 hour deleted live daily buckets, which reset
    // the counter and turned "3 keys a day" into "3 keys an hour, forever".
    if (Math.random() < 0.02) {
      await queryPg(
        `DELETE FROM rate_limit_counters WHERE window_start < NOW() - INTERVAL '25 hours'`
      ).catch(() => {});
    }

    return { allowed: count <= limit, count, limit, resetInMs };
  } catch (err) {
    log('warn', 'ratelimit.unavailable', { bucket, error: err instanceof Error ? err.message : 'unknown' });
    return { allowed: true, count: 0, limit, resetInMs };
  }
}

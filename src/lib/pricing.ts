/**
 * Pricing canon — the single source of truth for every amount the server
 * will accept. Clients pick a *product*, never an amount; the server prices
 * it. Any route that derives a charge must do it from these constants.
 */

// Type-only: `pricing.ts` must stay free of runtime imports so the canon can be
// loaded directly by `npm run test:math` without a transpile step.
import type { InteractionKind } from './types';

/** One "like" unit. Likes are sold in batches of 1..100 units. */
export const LIKE_UNIT_CENTS = 1;
export const LIKE_MIN_UNITS = 1;
export const LIKE_MAX_UNITS = 100;

/**
 * Unpaid taps needed to earn the rank of one penny.
 *
 * A tap moves score exactly as 1¢ does, once TAPS_PER_PENNY of them land —
 * but no wallet is debited and no money is added to the post. The constant
 * lives here because the server grants the rank and must not take the
 * client's word for how many taps it took.
 */
export const TAPS_PER_PENNY = 10;

/** Rank-cents a wallet may earn per post per day without paying. */
export const TAP_RANK_CENTS_PER_POST_PER_DAY = 10;

export const BOOST_CENTS = 10;
export const SUPER_CENTS = 100;

/** Wallet top-up bounds, per transaction. */
export const TOPUP_MIN_CENTS = 100; // $1.00
export const TOPUP_MAX_CENTS = 5000; // $50.00

/** Target wallet ceiling. Enforced at PaymentIntent creation only — never
 *  at credit time, because refusing a credit would lose money already paid. */
export const WALLET_MAX_CENTS = 50000; // $500.00

/** Conviction chips usable to back a side of a debate. */
export const DEBATE_BACK_ALLOWED = { boost: 10, super: 100, mega: 1000 } as const;

export type DebateBackTier = keyof typeof DEBATE_BACK_ALLOWED;

export function isDebateBackTier(value: unknown): value is DebateBackTier {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(DEBATE_BACK_ALLOWED, value);
}

/** True for a safe, whole, positive cent amount. Rejects NaN/Infinity/floats. */
export function isValidCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isValidTopupAmount(value: unknown): value is number {
  return isValidCents(value) && value >= TOPUP_MIN_CENTS && value <= TOPUP_MAX_CENTS;
}

/**
 * Server-side price for a fixed-price interaction. `power` is excluded on
 * purpose: its amount comes from a signed, persisted quote, not from a table.
 * `tap` is excluded because it has no price at all — it buys rank with
 * repetition, and asking this function for its cost is a caller bug.
 */
export function priceForKind(kind: Exclude<InteractionKind, 'power' | 'tap'>, units = 1): number {
  switch (kind) {
    case 'like': {
      const clamped = Math.min(LIKE_MAX_UNITS, Math.max(LIKE_MIN_UNITS, Math.floor(units)));
      return clamped * LIKE_UNIT_CENTS;
    }
    case 'boost':
      return BOOST_CENTS;
    case 'super':
      return SUPER_CENTS;
  }
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

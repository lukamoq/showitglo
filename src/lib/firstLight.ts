/**
 * First Light — the free stage, and the honest price of keeping it.
 *
 * A money-weighted board has one structural problem for a newcomer: a post
 * with nothing paid into it sorts last, so a first-time author publishes into
 * a place nobody looks and never comes back. First Light is the answer, and it
 * is deliberately *not* free credit — no endpoint in this codebase may mint
 * spendable balance, and that property is worth more than a conversion point.
 *
 * Instead every new post gets a fixed window of free, time-ordered visibility
 * on its own rail. The window is real: it is stamped at insert time, it is
 * enforced by the query that builds the rail, and when it ends the post keeps
 * only the rank its money bought. Nothing here manufactures urgency — the
 * countdown describes something that actually happens.
 *
 * The second half is the price ladder: the exact number of cents that would
 * put a post above a given rank *at this instant*. It is arithmetic over the
 * same decay engine the board itself ranks with, not a suggested-price table,
 * and it is a live figure rather than a promise — anyone else spending moves
 * it. Everything user-facing that quotes a rung must also show when it was
 * computed. See `docs/` and the "First Light" section of /terms.
 *
 * This module is pure: no database, no clock of its own. That keeps it
 * testable by `npm run test:math`, which runs against this file directly.
 */

import { LIKE_MAX_UNITS, LIKE_MIN_UNITS, LIKE_UNIT_CENTS, SUPER_CENTS } from './pricing';

/** How long a new post is carried on the First Light rail, for free. */
export const FIRST_LIGHT_MINUTES = 60;

/** Rail size. Small on purpose — a rail nobody can read is not a stage. */
export const FIRST_LIGHT_RAIL_LIMIT = 12;

// --------------------------------------------------------------------------
// The window
// --------------------------------------------------------------------------

/** Seconds left in a post's free window; 0 once it has closed or was never set. */
export function firstLightSecondsRemaining(
  until: string | Date | null | undefined,
  now: number = Date.now()
): number {
  if (!until) return 0;
  const end = until instanceof Date ? until.getTime() : new Date(until).getTime();
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - now) / 1000));
}

export function isFirstLightActive(
  until: string | Date | null | undefined,
  now: number = Date.now()
): boolean {
  return firstLightSecondsRemaining(until, now) > 0;
}

/** "57 min", "4 min", "40 sec" — a countdown that never pretends to precision. */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'closed';
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

// --------------------------------------------------------------------------
// The ladder
// --------------------------------------------------------------------------

/**
 * The cheapest whole number of cents that puts `myScoreDollars` strictly above
 * `targetScoreDollars`.
 *
 * Fresh money spent now contributes its face value to the decayed display
 * score — `calculateDecayedScore(calculateStoredDelta(A, now, …), now, …)` is
 * `A/100` — so the gap in dollars converts to cents one-for-one, and no
 * knowledge of the epoch or half-life is needed here.
 *
 * `floor(gap) + 1` rather than `ceil(gap)`: an exactly equal score does not
 * displace anyone (ties break on `created_at ASC`, and a newcomer is always
 * the younger row), so the answer has to clear the gap, not meet it. The
 * result is the *true* minimum — never the increment strategy's recommended
 * margin, which is a larger number and would overstate what is actually
 * required.
 */
export function centsToOvertake(targetScoreDollars: number, myScoreDollars: number): number {
  const gapCents = (targetScoreDollars - myScoreDollars) * 100;
  if (!Number.isFinite(gapCents) || gapCents < 0) return 0;
  return Math.floor(gapCents) + 1;
}

export type LadderProduct =
  | { kind: 'like'; units: number; cents: number }
  | { kind: 'super'; units: 1; cents: number }
  | { kind: 'power'; units: 1; cents: number };

/**
 * The single purchase that covers `cents`, or null when no one product does.
 *
 * The pricing canon sells exactly three shapes below a quote: like units at
 * 1¢ (1–100, so any amount up to $1.00 exactly), a $1.00 super boost, and a
 * power boost priced by a server-issued quote at or above the category floor.
 * Between $1.01 and that floor there is genuinely no single product, and this
 * returns null rather than inventing one — the caller shows the largest step
 * that *is* available and says what it reaches.
 */
export function productForCents(cents: number, minPowerCents: number): LadderProduct | null {
  if (!Number.isSafeInteger(cents) || cents < LIKE_MIN_UNITS * LIKE_UNIT_CENTS) return null;

  const maxLikeCents = LIKE_MAX_UNITS * LIKE_UNIT_CENTS;
  if (cents <= maxLikeCents) {
    return { kind: 'like', units: Math.ceil(cents / LIKE_UNIT_CENTS), cents };
  }
  if (cents >= minPowerCents) {
    return { kind: 'power', units: 1, cents };
  }
  return null;
}

/** The $1.00 super boost, as a product — the fallback step in the dead zone. */
export function superProduct(): LadderProduct {
  return { kind: 'super', units: 1, cents: SUPER_CENTS };
}

export interface LadderRung {
  /** Board position this rung is priced to clear. */
  target_rank: number;
  /** Short human label — "one place up", "top 10", "the lead". */
  label: string;
  /** Fresh cents required, at `computed_at`, to pass that position. */
  cents: number;
  /** Rank this spend actually lands, counted against the live board. */
  achieved_rank: number;
  /** The one purchase that covers it, or null when none does. */
  product: LadderProduct | null;
}

export interface PriceLadder {
  post_id: string;
  slug: string;
  current_rank: number;
  display_score: number;
  board_size: number;
  rungs: LadderRung[];
  /** The cheapest rung buyable in a single action, if there is one. */
  recommended: LadderRung | null;
  first_light: {
    active: boolean;
    until: string | null;
    seconds_remaining: number;
  };
  /**
   * Every figure above is true as of this instant and no longer. Anyone else
   * spending on any post changes it, which is why the client re-reads rather
   * than caching a rung and charging against it later.
   */
  computed_at: string;
}

/** Drops rungs that cost nothing, and rungs a cheaper rung already reaches. */
export function dedupeRungs(rungs: LadderRung[]): LadderRung[] {
  const out: LadderRung[] = [];
  for (const rung of rungs.filter((r) => r.cents > 0).sort((a, b) => a.cents - b.cents)) {
    const cheaperAlreadyGetsThere = out.some((kept) => kept.achieved_rank <= rung.achieved_rank);
    if (!cheaperAlreadyGetsThere) out.push(rung);
  }
  return out;
}

/**
 * The rung to put on the primary button: the cheapest one a single tap can
 * settle from the wallet. Power boosts are excluded even though they are a
 * product — they are priced by a server-issued quote and belong in the boost
 * drawer, not behind a one-tap button that has already named a price.
 */
export function pickRecommended(rungs: LadderRung[]): LadderRung | null {
  return rungs.find((r) => r.product?.kind === 'like' || r.product?.kind === 'super') ?? null;
}

/**
 * Invariant-Basis Exponential Decay Market Engine
 *
 * Mathematical Core:
 * Score of a boost of amount A at time t with half-life H:
 * S(t_now) = A * 2^(- (t_now - t) / H)
 *          = [A * 2^((t - T_0) / H)] * 2^(- (t_now - T_0) / H)
 *
 * By storing stored_delta = A * 2^((t - T_0) / H), the relative ordering
 * of all posts is mathematically invariant to t_now.
 */

export interface DecayParams {
  halfLifeHours: number;
  epochDate: Date | string | number;
}

/**
 * Converts a date or timestamp to milliseconds.
 */
function toMs(date: Date | string | number): number {
  return typeof date === 'number' ? date : new Date(date).getTime();
}

/**
 * Calculates the invariant stored_delta for a boost.
 * @param amountCents Amount boosted in cents (e.g. 500 = $5.00)
 * @param boostTime Timestamp of the boost
 * @param epochDate Board epoch anchor T_0
 * @param halfLifeHours Half-life of the board in hours (default 168 = 7 days)
 */
export function calculateStoredDelta(
  amountCents: number,
  boostTime: Date | string | number,
  epochDate: Date | string | number,
  halfLifeHours: number = 168
): number {
  const t = toMs(boostTime);
  const t0 = toMs(epochDate);
  const halfLifeMs = halfLifeHours * 3600 * 1000;

  const exponent = (t - t0) / halfLifeMs;
  return amountCents * Math.pow(2, exponent);
}

/**
 * Computes the real-time decayed display score in DOLLARS (or cents) for a post.
 * @param storedScore Invariant base score stored in database
 * @param currentTime Current evaluation timestamp (now)
 * @param epochDate Board epoch anchor T_0
 * @param halfLifeHours Half-life in hours
 * @returns Decayed score in dollars (float e.g. 42.50)
 */
export function calculateDecayedScore(
  storedScore: number,
  currentTime: Date | string | number = Date.now(),
  epochDate: Date | string | number,
  halfLifeHours: number = 168
): number {
  if (storedScore <= 0) return 0;

  const tNow = toMs(currentTime);
  const t0 = toMs(epochDate);
  const halfLifeMs = halfLifeHours * 3600 * 1000;

  const decayFactor = Math.pow(2, -(tNow - t0) / halfLifeMs);
  const scoreInCents = storedScore * decayFactor;

  // Convert cents to dollars with 2 decimal precision
  return Math.max(0, scoreInCents / 100);
}

/**
 * Converts a desired score in DOLLARS at current time t_now back to required fresh dollars.
 * 1 fresh dollar at t = now equals 1 dollar of decayed score.
 */
export function dollarsNeededForScore(
  targetDecayedScoreDollars: number,
  currentDecayedScoreDollars: number
): number {
  const needed = Math.max(0, targetDecayedScoreDollars - currentDecayedScoreDollars);
  return Math.ceil(needed * 100) / 100;
}

/**
 * Rebase: multiplies all stored scores when advancing epoch T0 -> T1.
 */
export function rebaseStoredScore(
  storedScore: number,
  oldEpochDate: Date | string | number,
  newEpochDate: Date | string | number,
  halfLifeHours: number = 168
): number {
  const t0 = toMs(oldEpochDate);
  const t1 = toMs(newEpochDate);
  const halfLifeMs = halfLifeHours * 3600 * 1000;

  const factor = Math.pow(2, -(t1 - t0) / halfLifeMs);
  return storedScore * factor;
}

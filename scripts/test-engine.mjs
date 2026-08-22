/**
 * ShowItGlo Engine Test Suite
 * Mathematical Invariant Basis, Strategy Rules, and Displacement Logic Verification
 */

import assert from 'assert';

function calculateStoredDelta(amountCents, boostTime, epochDate, halfLifeHours = 168) {
  const t = new Date(boostTime).getTime();
  const t0 = new Date(epochDate).getTime();
  const halfLifeMs = halfLifeHours * 3600 * 1000;
  const exponent = (t - t0) / halfLifeMs;
  return amountCents * Math.pow(2, exponent);
}

function calculateDecayedScore(storedScore, currentTime, epochDate, halfLifeHours = 168) {
  const tNow = new Date(currentTime).getTime();
  const t0 = new Date(epochDate).getTime();
  const halfLifeMs = halfLifeHours * 3600 * 1000;
  const decayFactor = Math.pow(2, -(tNow - t0) / halfLifeMs);
  return (storedScore * decayFactor) / 100;
}

function rebaseStoredScore(storedScore, oldEpochDate, newEpochDate, halfLifeHours = 168) {
  const t0 = new Date(oldEpochDate).getTime();
  const t1 = new Date(newEpochDate).getTime();
  const halfLifeMs = halfLifeHours * 3600 * 1000;
  const factor = Math.pow(2, -(t1 - t0) / halfLifeMs);
  return storedScore * factor;
}

console.log('🧪 Running ShowItGlo Mathematical Engine Tests...\n');

// TEST 1: Invariant-basis Ordering Test
console.log('Test 1: Invariant-basis score ordering across multiple future timestamps...');
const T0 = new Date('2026-08-01T00:00:00Z').toISOString();
const halfLifeHours = 168; // 7 days

// Post A boosted $100 on Day 1
const tA = new Date('2026-08-01T12:00:00Z').toISOString();
const deltaA = calculateStoredDelta(10000, tA, T0, halfLifeHours);

// Post B boosted $60 on Day 5 (newer, so $60 fresh might be higher or lower depending on decay)
const tB = new Date('2026-08-05T12:00:00Z').toISOString();
const deltaB = calculateStoredDelta(6000, tB, T0, halfLifeHours);

// Test across Day 7, Day 14, Day 30, Day 365
const evaluationTimes = [
  '2026-08-07T00:00:00Z',
  '2026-08-14T00:00:00Z',
  '2026-09-01T00:00:00Z',
  '2027-08-01T00:00:00Z',
];

const storedOrder = deltaA > deltaB;

for (const evalTime of evaluationTimes) {
  const scoreA = calculateDecayedScore(deltaA, evalTime, T0, halfLifeHours);
  const scoreB = calculateDecayedScore(deltaB, evalTime, T0, halfLifeHours);
  const decayedOrder = scoreA > scoreB;

  assert.strictEqual(
    storedOrder,
    decayedOrder,
    `Ordering mismatch at ${evalTime}! Stored: ${storedOrder}, Decayed: ${decayedOrder}`
  );
  console.log(`  ✓ Evaluated at ${evalTime}: Post A ($${scoreA.toFixed(2)}) vs Post B ($${scoreB.toFixed(2)}) -> Ordering preserved`);
}

// TEST 2: Exact 7-Day Half Life Decay
console.log('\nTest 2: Exact 7-day half life decay (Score must equal 50% after exactly 1 half-life)...');
const boostTime = '2026-08-01T00:00:00Z';
const exactOneHalfLifeLater = '2026-08-08T00:00:00Z';
const delta100 = calculateStoredDelta(10000, boostTime, T0, halfLifeHours);

const initialScore = calculateDecayedScore(delta100, boostTime, T0, halfLifeHours);
const halfScore = calculateDecayedScore(delta100, exactOneHalfLifeLater, T0, halfLifeHours);

assert.strictEqual(Math.round(initialScore), 100, 'Initial score should be $100');
assert.strictEqual(Math.round(halfScore), 50, 'Score after 7 days should be $50');
console.log(`  ✓ Initial: $${initialScore.toFixed(2)} -> 7 days later: $${halfScore.toFixed(2)} (Exact 50.00% decay)`);

// TEST 3: Strategy Math
console.log('\nTest 3: Increment Strategy Calculations...');
const percentStrategy = (s, pct = 0.10, floor = 0.50) => Number((s + Math.max(s * pct, floor)).toFixed(2));
const fixedStrategy = (s, inc = 0.10) => Number((s + inc).toFixed(2));
const expoStrategy = (s, mult = 2.0) => Number((s * mult).toFixed(2));

assert.strictEqual(percentStrategy(100.0), 110.0, '10% of $100 should be $110');
assert.strictEqual(percentStrategy(2.0), 2.50, '10% of $2.00 is $0.20 which is below $0.50 floor -> should be $2.50');
assert.strictEqual(fixedStrategy(100.0), 100.10, 'Fixed +$0.10 on $100 should be $100.10');
assert.strictEqual(expoStrategy(100.0), 200.0, 'Expo x2 on $100 should be $200.00');
console.log('  ✓ Percent, Fixed, and Exponential strategies validated.');

// TEST 4: Epoch Rebase Invariance
console.log('\nTest 4: Epoch Rebase Invariance...');
const T1 = new Date('2026-08-15T00:00:00Z').toISOString();
const rebasedDelta = rebaseStoredScore(deltaA, T0, T1, halfLifeHours);

const scoreBeforeRebase = calculateDecayedScore(deltaA, '2026-08-20T00:00:00Z', T0, halfLifeHours);
const scoreAfterRebase = calculateDecayedScore(rebasedDelta, '2026-08-20T00:00:00Z', T1, halfLifeHours);

assert.strictEqual(
  scoreBeforeRebase.toFixed(6),
  scoreAfterRebase.toFixed(6),
  'Decayed score before and after rebase must be mathematically identical!'
);
console.log(`  ✓ Score with old epoch: $${scoreBeforeRebase.toFixed(4)} == Score with new epoch: $${scoreAfterRebase.toFixed(4)}`);

console.log('\n🎉 ALL MATHEMATICAL TESTS PASSED SUCCESSFULLY!\n');

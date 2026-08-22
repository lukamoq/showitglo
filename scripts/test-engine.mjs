#!/usr/bin/env node

/**
 * ShowItGlo — scoring engine tests.
 *
 * These run against the SHIPPED source in `src/lib/engine`, not a copy of the
 * formulas. Node's built-in TypeScript type stripping imports `decay.ts`
 * directly; `strategies.ts` is loaded through a two-line shim only because its
 * single import is a bare-specifier *type* import that ESM cannot resolve, and
 * the shim fails loudly if that file ever grows a real dependency.
 *
 * The property under test throughout is the invariant basis: a boost is stored
 * as `A * 2^((t - T0) / H)` so that the *ordering* of posts never depends on
 * when the board is evaluated. Get that wrong and the leaderboard silently
 * reshuffles itself between two page loads.
 *
 * Usage: node scripts/test-engine.mjs   (npm run test:math)
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Importing a .ts file from a package without "type": "module" is legal but
// noisy; the warning says nothing a reader of this file needs to know.
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'MODULE_TYPELESS_PACKAGE_JSON' || warning.code === 'MODULE_TYPELESS_PACKAGE_JSON') return;
  console.warn(warning);
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const LIB_DIR = join(REPO_ROOT, 'src', 'lib');
const ENGINE_DIR = join(LIB_DIR, 'engine');

// Importing .ts directly needs Node's unflagged type stripping (22.18+ / 23.6+).
// Fail with a sentence rather than ERR_UNKNOWN_FILE_EXTENSION.
{
  const [major, minor] = process.versions.node.split('.').map(Number);
  const supported = major >= 24 || (major === 23 && minor >= 6) || (major === 22 && minor >= 18);
  if (!supported) {
    console.error(
      `\nThis suite imports src/lib/engine/*.ts directly, which needs Node 22.18+ or 23.6+ ` +
        `(TypeScript type stripping). You are on ${process.versions.node}.\n`
    );
    process.exit(1);
  }
}

let passed = 0;
let failed = 0;
let scratch = null;

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`  \x1b[31m✗ ${name}\x1b[0m`);
    console.log(`     ${err.message}`);
  }
}

/**
 * strategies.ts uses `import type`, which Node's TypeScript stripper erases
 * natively — the module loads directly, same as decay.ts. If it ever gains a
 * runtime (non-type) import of ../types, this direct import will fail loudly
 * with a resolution error and this loader needs a real transpile step.
 */
async function loadStrategies() {
  return import(pathToFileURL(join(ENGINE_DIR, 'strategies.ts')).href);
}

/**
 * firstLight.ts imports the pricing canon at runtime, and Node's ESM resolver
 * will not add a `.ts` extension for it. The shim below copies the shipped file
 * verbatim and rewrites *only* that one specifier to the real, absolute path of
 * `src/lib/pricing.ts` — so both the ladder logic and the prices under test are
 * the shipped ones, not a transcription. Any other unresolvable import in that
 * file will still fail loudly here, which is the point.
 */
async function loadFirstLight() {
  const source = readFileSync(join(LIB_DIR, 'firstLight.ts'), 'utf8');
  const pricingUrl = pathToFileURL(join(LIB_DIR, 'pricing.ts')).href;
  const rewritten = source.replace(/from '\.\/pricing'/g, `from '${pricingUrl}'`);
  if (rewritten === source) {
    throw new Error("expected src/lib/firstLight.ts to import './pricing'; the shim is stale");
  }

  scratch = scratch ?? mkdtempSync(join(tmpdir(), 'showitglo-engine-'));
  const shimPath = join(scratch, 'firstLight.ts');
  writeFileSync(shimPath, rewritten);
  return import(pathToFileURL(shimPath).href);
}

console.log('\n\x1b[1mShowItGlo — scoring engine tests\x1b[0m');
console.log('  source: src/lib/engine/{decay,strategies}.ts, src/lib/firstLight.ts\n');

const decay = await import(pathToFileURL(join(ENGINE_DIR, 'decay.ts')).href);
const { calculateStoredDelta, calculateDecayedScore, rebaseStoredScore, dollarsNeededForScore } = decay;

const { getRequiredScoreToDisplace } = await loadStrategies();
const {
  centsToOvertake,
  dedupeRungs,
  firstLightSecondsRemaining,
  formatCountdown,
  isFirstLightActive,
  pickRecommended,
  productForCents,
  FIRST_LIGHT_MINUTES,
} = await loadFirstLight();

const T0 = '2026-08-01T00:00:00Z';
const HALF_LIFE = 168; // 7 days

// --------------------------------------------------------------------------
console.log('1. Invariant-basis ordering');

// $100 early vs $60 later: whichever ranks higher must rank higher forever.
const deltaA = calculateStoredDelta(10000, '2026-08-01T12:00:00Z', T0, HALF_LIFE);
const deltaB = calculateStoredDelta(6000, '2026-08-05T12:00:00Z', T0, HALF_LIFE);
const storedOrder = deltaA > deltaB;

for (const at of ['2026-08-07T00:00:00Z', '2026-08-14T00:00:00Z', '2026-09-01T00:00:00Z', '2027-08-01T00:00:00Z']) {
  check(`ordering is stable when evaluated at ${at}`, () => {
    const scoreA = calculateDecayedScore(deltaA, at, T0, HALF_LIFE);
    const scoreB = calculateDecayedScore(deltaB, at, T0, HALF_LIFE);
    assert.equal(scoreA > scoreB, storedOrder, `ordering flipped at ${at} (A=${scoreA}, B=${scoreB})`);
  });
}

check('a later, larger boost still outranks an earlier, smaller one', () => {
  const early = calculateStoredDelta(100, '2026-08-01T00:00:00Z', T0, HALF_LIFE);
  const late = calculateStoredDelta(1000, '2026-08-20T00:00:00Z', T0, HALF_LIFE);
  assert.ok(late > early, 'a $10 boost must outrank a $1 boost placed 19 days earlier');
});

// --------------------------------------------------------------------------
console.log('\n2. Half-life decay');

check('a score halves after exactly one half-life', () => {
  const delta = calculateStoredDelta(10000, T0, T0, HALF_LIFE);
  const initial = calculateDecayedScore(delta, T0, T0, HALF_LIFE);
  const later = calculateDecayedScore(delta, '2026-08-08T00:00:00Z', T0, HALF_LIFE);
  assert.equal(Math.round(initial), 100, `$100 boost should read $100 immediately, read $${initial}`);
  assert.equal(Math.round(later), 50, `should read $50 after 7 days, read $${later}`);
});

check('a score quarters after two half-lives', () => {
  const delta = calculateStoredDelta(10000, T0, T0, HALF_LIFE);
  const later = calculateDecayedScore(delta, '2026-08-15T00:00:00Z', T0, HALF_LIFE);
  assert.equal(Math.round(later), 25, `should read $25 after 14 days, read $${later}`);
});

check('a zero or negative stored score decays to exactly zero', () => {
  assert.equal(calculateDecayedScore(0, '2026-08-08T00:00:00Z', T0, HALF_LIFE), 0);
  assert.equal(calculateDecayedScore(-5, '2026-08-08T00:00:00Z', T0, HALF_LIFE), 0);
});

// --------------------------------------------------------------------------
console.log('\n3. Displacement strategies');

check('percent adds 10% above the holder', () => {
  assert.equal(getRequiredScoreToDisplace('percent', 100.0), 110.0);
});

check('percent respects the $0.50 floor on small scores', () => {
  // 10% of $2.00 is $0.20, below the floor, so the jump is $0.50.
  assert.equal(getRequiredScoreToDisplace('percent', 2.0), 2.5);
});

check('percent honours an overridden config', () => {
  assert.equal(getRequiredScoreToDisplace('percent', 100.0, { pct: 0.25, floor_cents: 50 }), 125.0);
});

check('fixed adds a flat $0.10', () => {
  assert.equal(getRequiredScoreToDisplace('fixed', 100.0), 100.1);
});

check('expo doubles the holder score', () => {
  assert.equal(getRequiredScoreToDisplace('expo', 100.0), 200.0);
});

check('an unknown strategy falls back to percent rather than throwing', () => {
  assert.equal(getRequiredScoreToDisplace('nonsense', 100.0), 110.0);
});

// --------------------------------------------------------------------------
console.log('\n4. Reclaim pricing');

check('dollars needed is the gap, rounded up to the cent', () => {
  assert.equal(dollarsNeededForScore(110.0, 100.0), 10.0);
  assert.equal(dollarsNeededForScore(100.005, 100.0), 0.01);
});

check('a post already above the target needs nothing', () => {
  assert.equal(dollarsNeededForScore(100.0, 150.0), 0);
});

// --------------------------------------------------------------------------
console.log('\n5. Epoch rebase invariance');

check('rebasing the epoch does not change any displayed score', () => {
  const T1 = '2026-08-15T00:00:00Z';
  const rebased = rebaseStoredScore(deltaA, T0, T1, HALF_LIFE);
  const before = calculateDecayedScore(deltaA, '2026-08-20T00:00:00Z', T0, HALF_LIFE);
  const after = calculateDecayedScore(rebased, '2026-08-20T00:00:00Z', T1, HALF_LIFE);
  assert.equal(before.toFixed(6), after.toFixed(6), `rebase changed the score: ${before} vs ${after}`);
});

check('rebasing preserves relative ordering', () => {
  const T1 = '2026-08-15T00:00:00Z';
  const rebasedA = rebaseStoredScore(deltaA, T0, T1, HALF_LIFE);
  const rebasedB = rebaseStoredScore(deltaB, T0, T1, HALF_LIFE);
  assert.equal(rebasedA > rebasedB, storedOrder, 'rebase reordered the board');
});

// --------------------------------------------------------------------------
console.log('\n6. First Light window');

check('a window in the future reports the seconds left', () => {
  const now = Date.parse('2026-08-01T00:00:00Z');
  const until = '2026-08-01T00:45:30Z';
  assert.equal(firstLightSecondsRemaining(until, now), 45 * 60 + 30);
  assert.equal(isFirstLightActive(until, now), true);
});

check('an expired or missing window is zero, never negative', () => {
  const now = Date.parse('2026-08-01T02:00:00Z');
  assert.equal(firstLightSecondsRemaining('2026-08-01T00:00:00Z', now), 0);
  assert.equal(firstLightSecondsRemaining(null, now), 0);
  assert.equal(firstLightSecondsRemaining(undefined, now), 0);
  assert.equal(firstLightSecondsRemaining('not a date', now), 0);
  assert.equal(isFirstLightActive(null, now), false);
});

check('the window is a whole number of minutes and long enough to act on', () => {
  assert.ok(Number.isInteger(FIRST_LIGHT_MINUTES), 'window must be whole minutes');
  assert.ok(FIRST_LIGHT_MINUTES >= 5, 'a window too short to read is not a free stage');
});

check('the countdown never rounds up into a promise it cannot keep', () => {
  assert.equal(formatCountdown(0), 'closed');
  assert.equal(formatCountdown(-10), 'closed');
  assert.equal(formatCountdown(40), '40 sec');
  assert.equal(formatCountdown(119), '1 min');
  assert.equal(formatCountdown(3600), '1 h 0 min');
});

// --------------------------------------------------------------------------
console.log('\n7. Price ladder');

check('overtaking costs one cent more than the gap, never merely the gap', () => {
  // A tie does not displace: the board breaks ties on created_at ASC, and the
  // post doing the buying is always the younger row.
  assert.equal(centsToOvertake(10.0, 0), 1001);
  assert.equal(centsToOvertake(0.5, 0), 51);
  assert.equal(centsToOvertake(1.0, 0.6), 41);
});

check('a post already ahead of the target needs nothing', () => {
  assert.equal(centsToOvertake(1.0, 9.99), 0);
  assert.equal(centsToOvertake(0.01, 0.02), 0);
});

check('a dead heat still costs a cent — level does not displace', () => {
  assert.equal(centsToOvertake(5.0, 5.0), 1);
  assert.equal(centsToOvertake(0, 0), 1);
});

check('the ladder price is the true minimum, below the strategy margin', () => {
  // The percent strategy recommends clearing a $10.00 holder by $1.00. What is
  // actually *required* is a cent. Quoting the recommendation as the price
  // would overstate the cost of every rung on the board.
  const recommended = getRequiredScoreToDisplace('percent', 10.0);
  const trueMinimum = centsToOvertake(10.0, 0) / 100;
  assert.equal(recommended, 11.0);
  assert.ok(trueMinimum < recommended, `true minimum ${trueMinimum} should be under ${recommended}`);
  assert.equal(trueMinimum, 10.01);
});

check('every amount up to a dollar maps to an exact like-unit purchase', () => {
  for (const cents of [1, 37, 50, 99, 100]) {
    const product = productForCents(cents, 1000);
    assert.equal(product?.kind, 'like', `${cents}c should be buyable as likes`);
    assert.equal(product.cents, cents, `${cents}c must not be rounded to ${product.cents}c`);
    assert.equal(product.units * 1, cents, 'like units are one cent each');
  }
});

check('amounts with no single product say so instead of inventing one', () => {
  assert.equal(productForCents(101, 1000), null);
  assert.equal(productForCents(999, 1000), null);
  assert.equal(productForCents(0, 1000), null);
  assert.equal(productForCents(1.5, 1000), null);
  assert.equal(productForCents(1000, 1000)?.kind, 'power');
});

check('a cheaper rung that reaches further hides the dearer one', () => {
  const rungs = dedupeRungs([
    { target_rank: 1, label: 'the lead', cents: 900, achieved_rank: 1, product: null },
    { target_rank: 10, label: 'top 10', cents: 50, achieved_rank: 4, product: { kind: 'like', units: 50, cents: 50 } },
    { target_rank: 40, label: 'one place up', cents: 60, achieved_rank: 9, product: null },
  ]);
  // 50c already lands #4, so the 60c rung that only reaches #9 is noise.
  assert.deepEqual(rungs.map((r) => r.cents), [50, 900]);
});

check('free rungs are dropped — a rung that costs nothing sells nothing', () => {
  const rungs = dedupeRungs([
    { target_rank: 5, label: 'top 10', cents: 0, achieved_rank: 5, product: null },
    { target_rank: 1, label: 'the lead', cents: 25, achieved_rank: 1, product: { kind: 'like', units: 25, cents: 25 } },
  ]);
  assert.equal(rungs.length, 1);
  assert.equal(rungs[0].cents, 25);
});

check('the recommended rung is one a single tap can settle', () => {
  const power = { kind: 'power', units: 1, cents: 2000 };
  const like = { kind: 'like', units: 40, cents: 40 };
  assert.equal(
    pickRecommended([
      { target_rank: 1, label: 'the lead', cents: 2000, achieved_rank: 1, product: power },
      { target_rank: 10, label: 'top 10', cents: 40, achieved_rank: 8, product: like },
    ])?.cents,
    40
  );
  // A quoted power boost is a product, but not a one-tap one.
  assert.equal(
    pickRecommended([{ target_rank: 1, label: 'the lead', cents: 2000, achieved_rank: 1, product: power }]),
    null
  );
  assert.equal(pickRecommended([]), null);
});

// --------------------------------------------------------------------------

if (scratch) rmSync(scratch, { recursive: true, force: true });

console.log(`\n${'═'.repeat(68)}`);
if (failed === 0) {
  console.log(`\x1b[32m✓ ${passed}/${passed} engine checks passed\x1b[0m`);
  console.log(`${'═'.repeat(68)}\n`);
  process.exit(0);
}
console.log(`\x1b[31m✗ ${failed} of ${passed + failed} engine checks FAILED\x1b[0m`);
console.log(`${'═'.repeat(68)}\n`);
process.exit(1);

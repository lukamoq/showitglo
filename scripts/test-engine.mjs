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
const ENGINE_DIR = join(REPO_ROOT, 'src', 'lib', 'engine');

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

console.log('\n\x1b[1mShowItGlo — scoring engine tests\x1b[0m');
console.log('  source: src/lib/engine/{decay,strategies}.ts\n');

const decay = await import(pathToFileURL(join(ENGINE_DIR, 'decay.ts')).href);
const { calculateStoredDelta, calculateDecayedScore, rebaseStoredScore, dollarsNeededForScore } = decay;

const { getRequiredScoreToDisplace } = await loadStrategies();

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

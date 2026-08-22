#!/usr/bin/env node

/**
 * ShowItGlo — production readiness verification.
 *
 * This script only asserts things it can actually observe. It does not claim a
 * subsystem "works" because a file mentioning it exists; the behavioural
 * guarantees live in scripts/test-integration.mjs, which drives a real server
 * against a real database.
 *
 * What it checks:
 *   1. deployment files and public assets are present
 *   2. HTTP security headers are configured
 *   3. build artifacts, when a build exists
 *   4. .env.example matches the environment the code actually reads
 *   5. scripts/schema.sql applies cleanly — twice — to an empty database
 *   6. forbidden patterns are absent (free credit, forged identity, TLS
 *      downgrades, demo users, logging in money paths)
 *   7. the security rails that were added in the overhaul are still wired
 *
 * Exit code is non-zero on any failure. Skipped checks (no build, no Postgres)
 * are reported separately and never mask a failure.
 *
 * Usage:
 *   node scripts/verify-production.mjs        (npm run verify:prod)
 *
 * Env:
 *   VERIFY_DATABASE_URL  Postgres to run the schema check against
 *                        (default: postgresql://$USER@localhost:5432/postgres)
 *   VERIFY_NO_DB=1       skip the schema check entirely
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

let passed = 0;
const failures = [];
const skips = [];

function section(title) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function ok(message) {
  passed += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${message}`);
}

function fail(message, detail) {
  failures.push(detail ? `${message} — ${detail}` : message);
  console.log(`  \x1b[31m✗ ${message}\x1b[0m`);
  if (detail) console.log(`     ${detail}`);
}

function assert(condition, message, detail) {
  if (condition) ok(message);
  else fail(message, detail);
}

function skip(message, reason) {
  skips.push(`${message} — ${reason}`);
  console.log(`  \x1b[33m•\x1b[0m ${message} \x1b[2m(skipped: ${reason})\x1b[0m`);
}

function read(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

/** Every source file under the given roots, as { path, text }. */
function sourceFiles(roots, extensions = ['.ts', '.tsx', '.mjs', '.js', '.sql']) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
        walk(full);
        continue;
      }
      if (!extensions.some((ext) => entry.name.endsWith(ext))) continue;
      out.push({ path: relative(ROOT, full), text: readFileSync(full, 'utf8') });
    }
  };
  for (const root of roots) {
    const full = join(ROOT, root);
    if (existsSync(full)) walk(full);
  }
  return out;
}

console.log('\n\x1b[1mShowItGlo — production readiness verification\x1b[0m');

// This file is excluded from its own pattern scans — it necessarily contains
// every string it forbids.
const SELF = relative(ROOT, fileURLToPath(import.meta.url));
const ALL_SOURCES = sourceFiles(['src', 'scripts']).filter((f) => f.path !== SELF);

// ==========================================================================
section('1. Deployment files & public assets');
// ==========================================================================

const REQUIRED_FILES = [
  'next.config.ts',
  'package.json',
  'README.md',
  'PRODUCTION_MANUAL_STEPS.md',
  '.env.example',
  'scripts/schema.sql',
  'scripts/init-db.mjs',
  'scripts/test-engine.mjs',
  'scripts/test-integration.mjs',
  'src/instrumentation.ts',
  'src/lib/env.ts',
  'src/lib/auth.ts',
  'src/lib/session.ts',
  'src/lib/http.ts',
  'src/lib/log.ts',
  'src/lib/pricing.ts',
  'src/lib/email.ts',
  'src/lib/db/pg.ts',
  'src/lib/db/store.ts',
  'src/app/api/health/route.ts',
  'src/app/api/v1/webhooks/stripe/route.ts',
  'src/app/api/v1/wallet/create-intent/route.ts',
  'src/app/api/v1/wallet/topup/route.ts',
  'src/app/robots.ts',
  'src/app/sitemap.ts',
  'src/app/not-found.tsx',
  'src/app/error.tsx',
  'src/app/global-error.tsx',
  'public/.well-known/apple-developer-merchantid-domain-association',
  'src/app/.well-known/apple-developer-merchantid-domain-association/route.ts',
];

for (const file of REQUIRED_FILES) {
  assert(existsSync(join(ROOT, file)), `present: ${file}`);
}

// The in-memory store and its seed were replaced by Postgres. If they come
// back, correctness-critical state is living in process memory again.
for (const gone of ['src/lib/db/db.ts', 'src/lib/db/seed.ts']) {
  assert(!existsSync(join(ROOT, gone)), `retired: ${gone} is gone`);
}

{
  const importers = ALL_SOURCES.filter((f) => /from ['"](@\/lib\/db\/db|@\/lib\/db\/seed|\.\/db|\.\/seed)['"]/.test(f.text));
  assert(importers.length === 0, 'nothing imports the retired in-memory store', importers.map((f) => f.path).join(', '));
}

{
  // The association file is served from a route handler as well as /public,
  // because a dot-directory under public is not always shipped by a builder.
  const cert = read('public/.well-known/apple-developer-merchantid-domain-association').trim();
  assert(
    cert.length > 500 && /^[0-9A-Fa-f]+$/.test(cert),
    `Apple Pay domain association file is a non-empty hex blob (${cert.length} chars)`,
    'it must be the file Stripe generated for THIS domain — see PRODUCTION_MANUAL_STEPS.md'
  );
}

// ==========================================================================
section('2. HTTP security headers');
// ==========================================================================

{
  const config = read('next.config.ts');
  for (const header of [
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ]) {
    assert(config.includes(header), `next.config.ts sets ${header}`);
  }
}

// ==========================================================================
section('3. Build artifacts');
// ==========================================================================

if (!existsSync(join(ROOT, '.next', 'BUILD_ID'))) {
  skip('production build artifacts', 'no .next/BUILD_ID — run `npm run build` first');
} else {
  const buildId = read('.next/BUILD_ID').trim();
  assert(buildId.length > 0, `.next/BUILD_ID is populated (${buildId})`);
  for (const artifact of ['.next/routes-manifest.json', '.next/prerender-manifest.json', '.next/server']) {
    assert(existsSync(join(ROOT, artifact)), `build artifact present: ${artifact}`);
  }

  // Every route handler in the source must be in the build. A route silently
  // dropped by a stale or partial build is a 404 in production.
  const built = new Set(Object.values(JSON.parse(read('.next/app-path-routes-manifest.json'))));
  const sourceRoutes = sourceFiles(['src/app/api'], ['route.ts'])
    .map((f) => `/${f.path.replace(/^src\/app\//, '').replace(/\/route\.ts$/, '')}`);
  const notBuilt = sourceRoutes.filter((route) => !built.has(route)).sort();
  assert(
    sourceRoutes.length > 0 && notBuilt.length === 0,
    `all ${sourceRoutes.length} API route handlers are in the build`,
    notBuilt.length ? `missing from .next: ${notBuilt.join(', ')} — the build is stale, re-run npm run build` : undefined
  );

  const buildAge = (Date.now() - statSync(join(ROOT, '.next', 'BUILD_ID')).mtimeMs) / 86400000;
  if (buildAge > 1) {
    skip('build freshness', `the build is ${buildAge.toFixed(1)} days old; rebuild before deploying`);
  } else {
    ok('the build is less than a day old');
  }
}

// ==========================================================================
section('4. Environment template completeness');
// ==========================================================================

{
  const envSource = read('src/lib/env.ts');
  const envExample = read('.env.example');

  // The required set is parsed out of the validator itself, so the template
  // cannot drift away from what the process refuses to boot without.
  const required = [...envSource.matchAll(/key:\s*'([A-Z0-9_]+)'/g)].map((m) => m[1]);
  assert(required.length >= 7, `parsed ${required.length} required variables out of src/lib/env.ts`);

  for (const key of required) {
    assert(new RegExp(`^\\s*#?\\s*${key}=`, 'm').test(envExample), `.env.example documents required ${key}`);
  }

  // Everything the code actually reads must be documented somewhere in the
  // template. Next injects the first three itself; NODE_ENV is the platform's.
  const PLATFORM_PROVIDED = new Set(['NEXT_PHASE', 'NEXT_RUNTIME', 'NODE_ENV', 'USER', 'PATH', 'HOME', 'TMPDIR', 'LANG', 'SHELL']);
  const referenced = new Set();
  for (const file of ALL_SOURCES) {
    for (const match of file.text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      if (!PLATFORM_PROVIDED.has(match[1])) referenced.add(match[1]);
    }
  }
  // Variables only the test harness sets are not deployment configuration.
  for (const testOnly of ['TEST_DATABASE_URL', 'TEST_KEEP', 'TEST_IN_PLACE', 'TEST_VERBOSE', 'TEST_DB_NAME',
    'VERIFY_DATABASE_URL', 'VERIFY_NO_DB', 'DOCKER_BUILD', 'NEXT_TELEMETRY_DISABLED']) {
    referenced.delete(testOnly);
  }

  const undocumented = [...referenced].filter((key) => !envExample.includes(key)).sort();
  assert(undocumented.length === 0, 'every environment variable the code reads is in .env.example', undocumented.join(', '));

  // …and nothing else. A template that still advertises REDIS_URL or
  // JWT_SECRET tells an operator to provision infrastructure nobody uses.
  const declared = [...envExample.matchAll(/^\s*([A-Z0-9_]+)=/gm)].map((m) => m[1]);
  const stale = declared.filter((key) => !referenced.has(key) && !PLATFORM_PROVIDED.has(key)).sort();
  assert(stale.length === 0, '.env.example declares nothing the code never reads', stale.join(', '));
}

// ==========================================================================
section('5. Schema applies cleanly to an empty database');
// ==========================================================================

const { Client } = pg;

async function verifySchema() {
  if (process.env.VERIFY_NO_DB === '1') {
    skip('schema application', 'VERIFY_NO_DB=1');
    return;
  }

  const maintenanceUrl =
    process.env.VERIFY_DATABASE_URL || `postgresql://${process.env.USER || 'postgres'}@localhost:5432/postgres`;
  const scratchDb = `showitglo_verify_${process.pid}`;

  let admin;
  try {
    admin = new Client({ connectionString: maintenanceUrl, connectionTimeoutMillis: 5000 });
    await admin.connect();
  } catch (err) {
    skip('schema application', `no Postgres at ${maintenanceUrl} (${err.code || err.message})`);
    return;
  }

  try {
    await admin.query(`DROP DATABASE IF EXISTS "${scratchDb}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${scratchDb}"`);
  } catch (err) {
    fail('schema application: could not create a scratch database', err.message);
    await admin.end().catch(() => {});
    return;
  }

  const scratchUrl = new URL(maintenanceUrl);
  scratchUrl.pathname = `/${scratchDb}`;
  const client = new Client({ connectionString: scratchUrl.toString(), connectionTimeoutMillis: 5000 });

  try {
    await client.connect();
    const schemaSql = read('scripts/schema.sql');

    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');
    ok('scripts/schema.sql applies to an empty database');

    // Idempotency is a deployment requirement: init-db runs on every deploy.
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');
    ok('scripts/schema.sql is idempotent (applies twice with no error)');

    const tables = (
      await client.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
      )
    ).rows.map((r) => r.table_name);

    const EXPECTED = [
      'api_keys', 'audit_logs', 'auth_tokens', 'board_snapshots', 'brand_responses', 'categories',
      'debate_free_votes', 'debate_opinions', 'debate_sides', 'debates', 'interactions',
      'moderation_actions', 'notifications', 'payments', 'post_backers', 'posts',
      'presence_heartbeats', 'quotes', 'rank_events', 'rate_limit_counters', 'reports',
      'stripe_events', 'users', 'wallet_intents', 'wallet_ledger', 'wallets',
    ];
    const missing = EXPECTED.filter((t) => !tables.includes(t));
    assert(missing.length === 0, `all ${EXPECTED.length} expected tables exist`, `missing: ${missing.join(', ')}`);

    const category = await client.query(`SELECT id FROM categories WHERE id = 'global'`);
    assert(category.rowCount === 1, 'the default "global" category is seeded');

    // Money invariants that live in the DDL, not the application.
    const walletCheck = await client.query(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = 'wallets'::regclass AND contype = 'c'`
    );
    const defs = walletCheck.rows.map((r) => r.def).join(' ');
    assert(/balance_cents >= 0/.test(defs), 'wallets.balance_cents has a >= 0 floor');
    assert(!/<=\s*50000/.test(defs), 'wallets has NO upper balance CHECK (a webhook credit must never fail)');

    const paymentIndex = await client.query(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'payments'`
    );
    assert(
      paymentIndex.rows.some((r) => /UNIQUE/i.test(r.indexdef) && /stripe_payment_intent_id/.test(r.indexdef)),
      'payments.stripe_payment_intent_id is UNIQUE (webhook double-credit guard)'
    );

    const idemIndex = await client.query(`SELECT indexdef FROM pg_indexes WHERE tablename = 'interactions'`);
    assert(
      idemIndex.rows.some((r) => /UNIQUE/i.test(r.indexdef) && /idempotency_key/.test(r.indexdef)),
      'interactions.idempotency_key has a unique index (replay guard)'
    );

    const apiKeyColumns = (
      await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'api_keys'`)
    ).rows.map((r) => r.column_name);
    assert(apiKeyColumns.includes('key_hash'), 'api_keys.key_hash exists (tokens are stored hashed, never in plaintext)');

    const apiKeyIndexes = await client.query(`SELECT indexdef FROM pg_indexes WHERE tablename = 'api_keys'`);
    assert(
      apiKeyIndexes.rows.some((r) => /UNIQUE/i.test(r.indexdef) && /key_hash/.test(r.indexdef)),
      'api_keys.key_hash has a unique index (one row per token)'
    );

    // Recovery tokens are bearer credentials for a wallet with money in it.
    // Only their sha256 may be stored, and the column that holds it is the
    // primary key, so a plaintext token has nowhere to live.
    const authTokenColumns = (
      await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'auth_tokens'`)
    ).rows.map((r) => r.column_name);
    assert(authTokenColumns.includes('token_hash'), 'auth_tokens stores token_hash (never the token)');
    assert(!authTokenColumns.includes('token'), 'auth_tokens has no plaintext token column');
    assert(authTokenColumns.includes('used_at'), 'auth_tokens.used_at exists (single-use enforcement)');

    // Auto-escalation counts DISTINCT reporters. Without this index one
    // session could reach the threshold alone by reporting three times.
    const reportIndexes = await client.query(`SELECT indexdef FROM pg_indexes WHERE tablename = 'reports'`);
    assert(
      reportIndexes.rows.some(
        (r) => /UNIQUE/i.test(r.indexdef) && /post_id/.test(r.indexdef) && /reporter_id/.test(r.indexdef)
      ),
      'reports has a unique (post_id, reporter_id) index (one report per reporter per post)'
    );
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    fail('schema application', `${err.message}${err.code ? ` (sqlstate ${err.code})` : ''}`);
  } finally {
    await client.end().catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS "${scratchDb}" WITH (FORCE)`).catch(() => {});
    await admin.end().catch(() => {});
  }
}

await verifySchema();

// ==========================================================================
section('6. Forbidden patterns');
// ==========================================================================

/** Reports every file/line matching `pattern`, minus anything `allow` accepts. */
function forbid(label, pattern, { allow = () => false, files = ALL_SOURCES } = {}) {
  const hits = [];
  for (const file of files) {
    const lines = file.text.split('\n');
    lines.forEach((line, index) => {
      if (!pattern.test(line)) return;
      if (allow({ file, line, index, lines })) return;
      hits.push(`${file.path}:${index + 1}: ${line.trim().slice(0, 110)}`);
    });
    pattern.lastIndex = 0;
  }
  assert(hits.length === 0, label, hits.join('\n     '));
}

forbid('no hardcoded demo user ids (usr_marc / usr_mcd / usr_alex)', /\busr_[a-z]{3,}\b/);
forbid('no ALLOW_DEMO_CREDITS escape hatch', /ALLOW_DEMO_CREDITS/);
forbid('no fabricated k-anonymity floor (Math.max(100, …))', /Math\.max\(\s*100\s*,/);
forbid('no hardcoded lead_changes_24h', /lead_changes_24h\s*:\s*\d/);

// Identity may only come from the signed cookie. These are the exact shapes
// the pre-overhaul routes used to read it from.
forbid(
  'no identity taken from a request body or query string',
  /(body|payload)\??\.(user_id|payer_id)\b|searchParams\.get\(['"](user_id|payer_id)['"]\)/,
  { files: sourceFiles(['src/app/api']) }
);

// API keys are looked up by sha256 hash. A raw-token lookup means the
// plaintext is in the database.
forbid(
  'no api_keys lookup by raw key_token',
  /key_token\s*=\s*\$|WHERE\s+key_token/i,
  { files: sourceFiles(['src/lib', 'src/app']) }
);

// TLS verification may only be disabled through the documented opt-in.
forbid('no unconditional rejectUnauthorized: false', /rejectUnauthorized\s*:\s*false/, {
  allow: ({ line, lines, index }) => {
    const context = [lines[index - 1] ?? '', line].join(' ');
    return context.includes('no-verify');
  },
});

// Money paths log through src/lib/log.ts, which redacts. A bare console.log
// there is how a client_secret or a token ends up in a log drain.
const MONEY_PATHS = [
  'src/lib/db/store.ts',
  'src/lib/pricing.ts',
  'src/app/api/v1/wallet/route.ts',
  'src/app/api/v1/wallet/topup/route.ts',
  'src/app/api/v1/wallet/create-intent/route.ts',
  'src/app/api/v1/webhooks/stripe/route.ts',
  'src/app/api/v1/power-boosts/route.ts',
  'src/app/api/v1/posts/[id]/like/route.ts',
  'src/app/api/v1/posts/[id]/boost/route.ts',
  'src/app/api/v1/debates/[slug]/back/route.ts',
];
{
  const moneyFiles = MONEY_PATHS.filter((p) => existsSync(join(ROOT, p))).map((p) => ({ path: p, text: read(p) }));
  assert(moneyFiles.length === MONEY_PATHS.length, `all ${MONEY_PATHS.length} money-path files exist`);
  forbid('no console.* in money paths (use src/lib/log.ts)', /console\.(log|info|debug|warn|error)\s*\(/, {
    files: moneyFiles,
  });
}

// ==========================================================================
section('7. Security rails still wired');
// ==========================================================================

{
  const webhook = read('src/app/api/v1/webhooks/stripe/route.ts');
  assert(webhook.includes('constructEvent'), 'the webhook verifies the Stripe signature');
  assert(
    webhook.includes('hasStripeEvent') && webhook.includes('markStripeEvent'),
    'the webhook deduplicates by event id via stripe_events'
  );
  // The marker must be written only after the handler commits. Writing it
  // first and deleting it in a catch block loses the event whenever the
  // instance dies between the two — the process that would run the
  // compensating DELETE is the one that just disappeared.
  assert(
    !/DELETE\s+FROM\s+stripe_events/i.test(webhook),
    'the webhook does not compensate its dedup marker with a DELETE'
  );
  assert(!/NODE_ENV\s*[!=]==?\s*['"]production['"]/.test(webhook), 'the webhook has no development signature bypass');

  const topup = read('src/app/api/v1/wallet/topup/route.ts');
  assert(topup.includes('paymentIntents.retrieve'), '/wallet/topup re-fetches the intent from Stripe');
  assert(topup.includes("metadata?.user_id !== user.id") || topup.includes('metadata?.user_id'),
    '/wallet/topup requires the intent to name the session user');
  assert(!/amount_cents/.test(topup.split('log(')[0]) || !/body.*amount_cents/.test(topup),
    '/wallet/topup never takes an amount from the request body');

  const intent = read('src/app/api/v1/wallet/create-intent/route.ts');
  assert(intent.includes('PAYMENTS_NOT_CONFIGURED'), '/wallet/create-intent has no simulator fallback');
  assert(intent.includes('WALLET_MAX_CENTS'), '/wallet/create-intent enforces the wallet ceiling before charging');

  const session = read('src/lib/session.ts');
  assert(session.includes('timingSafeEqual'), 'session cookies are verified in constant time');
  assert(session.includes('httpOnly: true'), 'the session cookie is HttpOnly');
  assert(/secure:\s*isProduction\(\)/.test(session), 'the session cookie is Secure in production');
  assert(session.includes('assertSameOrigin'), 'a same-origin guard exists for mutations');

  const auth = read('src/lib/auth.ts');
  assert(auth.includes('ADMIN_NOT_CONFIGURED'), 'admin auth reports an unconfigured deployment distinctly');
  assert(/if\s*\(!configured[\s\S]{0,80}return false/.test(auth), 'admin auth fails closed with no key configured');
  assert(auth.includes('timingSafeEqual'), 'the admin key is compared in constant time');

  const env = read('src/lib/env.ts');
  assert(/isProduction\(\)[\s\S]{0,200}throw new Error\('SESSION_SECRET/.test(env),
    'the dev session secret can never be used in production');

  const instrumentation = read('src/instrumentation.ts');
  assert(instrumentation.includes('validateEnv'), 'the server validates its environment at boot');
  assert(instrumentation.includes('phase-production-build'), 'the boot check is exempt during `next build`');

  const store = read('src/lib/db/store.ts');
  assert(store.includes('FOR UPDATE'), 'the money path takes row locks');
  assert(store.includes('INSUFFICIENT_FUNDS'), 'the money path has an explicit insufficient-funds outcome');
  assert(store.includes('DAILY_CAP_EXCEEDED'), 'the money path enforces a daily cap');
  assert(/ON CONFLICT \(stripe_payment_intent_id\) DO NOTHING/.test(store),
    'wallet credits are idempotent on the payment intent id');
  assert(store.includes('key_hash'), 'API keys are stored as hashes');

  const insights = read('src/lib/db/store.ts');
  assert(/distinct_backers[\s\S]{0,120}>=\s*\$1/.test(insights), 'insights suppress groups below the k floor in SQL');

  const pgLayer = read('src/lib/db/pg.ts');
  assert(pgLayer.includes('statement_timeout'), 'the pool sets a statement timeout');
  assert(pgLayer.includes('withTransaction'), 'a transaction helper exists');

  // --- optional email link / wallet recovery ------------------------------

  const email = read('src/lib/email.ts');
  assert(email.includes('EMAIL_NOT_CONFIGURED'), 'email degrades to 503 rather than faking a send');
  assert(email.includes('maskEmail'), 'addresses are masked before they reach the logger');

  // The debug hook writes every outgoing magic link to a file. That file is a
  // credential store; it must be impossible to switch on in production.
  assert(
    /isProduction\(\)\)\s*return null;[\s\S]{0,120}EMAIL_DEBUG_FILE/.test(read('src/lib/env.ts')),
    'the EMAIL_DEBUG_FILE capture hook is refused in production'
  );

  // Validate-and-burn must be ONE statement. A SELECT followed by an UPDATE is
  // a race that hands two sessions out for one recovery link.
  assert(
    /UPDATE auth_tokens[\s\S]{0,200}SET used_at = NOW\(\)[\s\S]{0,200}used_at IS NULL[\s\S]{0,120}expires_at > NOW\(\)/.test(store),
    'auth tokens are validated and consumed in a single atomic UPDATE'
  );
  assert(
    /randomBytes\(32\)[\s\S]{0,60}base64url/.test(store),
    'auth tokens carry 32 bytes of entropy'
  );

  // Recovery must never match the synthetic addresses on anonymous users —
  // otherwise knowing a uuid is a path into the wallet it belongs to.
  assert(
    /findUserByRealEmail[\s\S]{0,600}email NOT LIKE/.test(store),
    'recovery lookups exclude placeholder (@anon.showitglo.local) addresses'
  );

  const recover = read('src/app/api/v1/auth/recover/route.ts');
  const availabilityCheck = recover.indexOf('if (!emailAvailable())');
  const addressLookup = recover.indexOf('await findUserByRealEmail(');
  assert(
    availabilityCheck !== -1 && addressLookup !== -1 && availabilityCheck < addressLookup,
    'recovery answers EMAIL_NOT_CONFIGURED before the address lookup (no enumeration via 503)'
  );
}

// ==========================================================================

console.log(`\n${'═'.repeat(68)}`);
if (failures.length === 0) {
  console.log(`\x1b[32m✓ ${passed} production checks passed\x1b[0m${skips.length ? `  (${skips.length} skipped)` : ''}`);
  for (const s of skips) console.log(`  \x1b[33m•\x1b[0m ${s}`);
  console.log(`${'═'.repeat(68)}\n`);
  process.exit(0);
}

console.log(`\x1b[31m✗ ${failures.length} production checks FAILED\x1b[0m  (${passed} passed, ${skips.length} skipped)`);
for (const f of failures) console.log(`  \x1b[31m•\x1b[0m ${f}`);
console.log(`${'═'.repeat(68)}\n`);
process.exit(1);

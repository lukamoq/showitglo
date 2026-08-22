#!/usr/bin/env node

/**
 * ShowItGlo — money-path regression suite.
 *
 * Everything a bug here would cost real money: forged identities, free credit,
 * double spends, replayed webhooks, unauthenticated admin routes. Each of the
 * assertions below corresponds to a hole that existed in this codebase before
 * the production overhaul, so a failure is a regression, not a style question.
 *
 * What it does, in order:
 *   1. drops and recreates a dedicated `showitglo_test` database and applies
 *      scripts/schema.sql to it (so the suite is re-runnable from any state);
 *   2. copies the repo into a scratch directory and boots `next dev` there on
 *      a free port, so a concurrent `next build` in the working tree cannot
 *      pull .next out from under the server mid-run;
 *   3. runs two server phases against that one database:
 *        A — no Stripe keys, ADMIN_SECRET_KEY set   (payments-off + authz)
 *        B — Stripe keys set, ADMIN_SECRET_KEY unset (webhooks + fail-closed)
 *   4. kills the servers, drops the database, removes the scratch copy.
 *
 * No test framework on purpose: plain node, plain fetch, one assert helper.
 *
 * Usage:
 *   node scripts/test-integration.mjs
 *   npm run test:integration
 *
 * Env overrides:
 *   TEST_DATABASE_URL   default postgresql://$USER@localhost:5432/showitglo_test
 *   TEST_KEEP=1         keep the database, scratch copy and server logs
 *   TEST_IN_PLACE=1     run `next dev` from the repo instead of a scratch copy
 *   TEST_VERBOSE=1      stream the dev server's output
 */

import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// --------------------------------------------------------------------------
// Fixed test configuration
// --------------------------------------------------------------------------

const SESSION_SECRET = 'integration-test-session-secret-0123456789abcdef';
const ADMIN_KEY = 'test-admin-secret-key';
const WEBHOOK_SECRET = 'whsec_testsecret';
const STRIPE_SECRET = 'sk_test_integration_suite_dummy_key';
const INSIGHTS_K_MIN = 100;

/**
 * Where phase A's server writes the links it would have emailed.
 *
 * src/lib/email.ts honours EMAIL_DEBUG_FILE only when NODE_ENV is not
 * production, which is what makes this safe to exist: the file is a list of
 * live magic links, and on a real deployment there is no switch that creates
 * one. Phase B deliberately leaves the variable unset so the same endpoints
 * can be checked in their EMAIL_NOT_CONFIGURED state.
 */
const EMAIL_DEBUG_FILE = join(tmpdir(), `showitglo-itest-emails-${process.pid}.log`);

const DEFAULT_DB_URL = `postgresql://${process.env.USER || 'postgres'}@localhost:5432/showitglo_test`;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || DEFAULT_DB_URL;
const KEEP = process.env.TEST_KEEP === '1';
const IN_PLACE = process.env.TEST_IN_PLACE === '1';
const VERBOSE = process.env.TEST_VERBOSE === '1';

const REQUEST_TIMEOUT_MS = 60000;
const BOOT_TIMEOUT_MS = 180000;

// --------------------------------------------------------------------------
// Output
// --------------------------------------------------------------------------

let testNumber = 0;
let passed = 0;
const failures = [];

function step(message) {
  console.log(`\x1b[36m▸\x1b[0m ${message}`);
}

function section(title) {
  console.log(`\n\x1b[1m── ${title} ${'─'.repeat(Math.max(0, 62 - title.length))}\x1b[0m`);
}

class AssertionError extends Error {}

/** The only assertion primitive. Throws so the runner can attribute it. */
function check(condition, message) {
  if (!condition) throw new AssertionError(message);
}

function checkEqual(actual, expected, label) {
  check(
    actual === expected,
    `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

async function test(name, fn) {
  testNumber += 1;
  const label = String(testNumber).padStart(2, ' ');
  try {
    await fn();
    passed += 1;
    console.log(`  ${label} \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failures.push({ number: testNumber, name, error: err });
    console.log(`  ${label} \x1b[31m✗ ${name}\x1b[0m`);
    console.log(`       ${err instanceof AssertionError ? err.message : (err && err.stack) || err}`);
  }
}

// --------------------------------------------------------------------------
// Database lifecycle
// --------------------------------------------------------------------------

const { Client } = pg;

function splitDatabaseUrl(url) {
  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';
  return { database, maintenanceUrl: maintenance.toString() };
}

async function withClient(connectionString, fn) {
  const client = new Client({ connectionString, ssl: undefined, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function recreateTestDatabase() {
  const { database, maintenanceUrl } = splitDatabaseUrl(TEST_DATABASE_URL);
  await withClient(maintenanceUrl, async (client) => {
    // WITH (FORCE) so a leftover connection from an aborted run cannot wedge
    // the suite — this is the "re-runnable from any state" requirement.
    await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${database}"`);
  });
  return database;
}

async function applySchema() {
  const schemaSql = readFileSync(join(REPO_ROOT, 'scripts', 'schema.sql'), 'utf8');
  await withClient(TEST_DATABASE_URL, async (client) => {
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');

    const cat = await client.query(`SELECT id FROM categories WHERE id = 'global'`);
    if (cat.rowCount !== 1) throw new Error('schema.sql did not seed the default "global" category');
  });
}

async function dropTestDatabase() {
  const { database, maintenanceUrl } = splitDatabaseUrl(TEST_DATABASE_URL);
  await withClient(maintenanceUrl, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  }).catch(() => {});
}

/** Long-lived client used by the tests for direct SQL inspection and seeding. */
let sql = null;

async function q(text, params) {
  return sql.query(text, params);
}

/**
 * Puts money in a wallet the way a settled Stripe webhook would: a credited
 * balance plus the matching append-only ledger row. Done in SQL on purpose —
 * the whole point of the suite is that no HTTP endpoint can mint credit, so
 * the spend tests cannot use one to fund themselves.
 */
async function fundWallet(userId, cents, ref = 'sim_webhook') {
  await q(
    `INSERT INTO wallets (user_id, balance_cents, lifetime_topup_cents)
     VALUES ($1, $2, $2)
     ON CONFLICT (user_id) DO UPDATE
       SET balance_cents = wallets.balance_cents + EXCLUDED.balance_cents,
           lifetime_topup_cents = wallets.lifetime_topup_cents + EXCLUDED.balance_cents`,
    [userId, cents]
  );
  const after = await q('SELECT balance_cents FROM wallets WHERE user_id = $1', [userId]);
  await q(
    `INSERT INTO wallet_ledger (user_id, delta_cents, kind, ref_type, ref_id, balance_after_cents)
     VALUES ($1, $2, 'topup', 'payment', $3, $4)`,
    [userId, cents, ref, Number(after.rows[0].balance_cents)]
  );
}

async function walletBalance(userId) {
  const res = await q('SELECT balance_cents FROM wallets WHERE user_id = $1', [userId]);
  return res.rows[0] ? Number(res.rows[0].balance_cents) : null;
}

async function ledgerSum(userId) {
  const res = await q('SELECT COALESCE(SUM(delta_cents), 0) AS total FROM wallet_ledger WHERE user_id = $1', [userId]);
  return Number(res.rows[0].total);
}

// --------------------------------------------------------------------------
// Isolated application copy
// --------------------------------------------------------------------------

const EXCLUDED_DIRS = new Set(['node_modules', '.next', '.git', '.vercel']);
const EXCLUDED_FILES = new Set(['.env', '.env.local', 'tsconfig.tsbuildinfo']);

let scratchDir = null;

/**
 * Copies the source tree (not node_modules, not .next) into a scratch dir and
 * symlinks node_modules back. The server then owns its own .next, so someone
 * running `npm run build` in the working tree mid-suite cannot delete the
 * manifests out from under it.
 */
function prepareAppDir() {
  if (IN_PLACE) return REPO_ROOT;

  scratchDir = mkdtempSync(join(tmpdir(), 'showitglo-itest-'));
  const appDir = join(scratchDir, 'app');
  mkdirSync(appDir);

  cpSync(REPO_ROOT, appDir, {
    recursive: true,
    dereference: false,
    filter: (src) => {
      const rel = src.slice(REPO_ROOT.length + 1);
      if (!rel) return true;
      const [head] = rel.split(sep);
      if (EXCLUDED_DIRS.has(head)) return false;
      if (EXCLUDED_FILES.has(rel)) return false;
      return true;
    },
  });

  symlinkSync(join(REPO_ROOT, 'node_modules'), join(appDir, 'node_modules'), 'dir');
  return appDir;
}

// --------------------------------------------------------------------------
// Dev server lifecycle
// --------------------------------------------------------------------------

function freePort() {
  return new Promise((res, rej) => {
    const server = createServer();
    server.unref();
    server.on('error', rej);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => res(port));
    });
  });
}

function serverEnv(extra) {
  const base = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    LANG: process.env.LANG,
    SHELL: process.env.SHELL,
    USER: process.env.USER,
    // Test environment. Deliberately built from scratch rather than inherited
    // so a developer's .env.local (which points at the *production* Neon
    // database) can never leak into a suite that truncates tables.
    DATABASE_URL: TEST_DATABASE_URL,
    DATABASE_SSL: 'disable',
    SESSION_SECRET,
    INSIGHTS_K_MIN: String(INSIGHTS_K_MIN),
    LOG_LEVEL: 'warn',
    NEXT_TELEMETRY_DISABLED: '1',
  };
  return { ...base, ...extra };
}

const servers = [];

async function startServer(label, appDir, extraEnv) {
  const port = await freePort();
  const nextBin = join(REPO_ROOT, 'node_modules', '.bin', 'next');
  if (!existsSync(nextBin)) throw new Error(`next binary not found at ${nextBin} — run npm install`);

  const logPath = scratchDir ? join(scratchDir, `server-${label}.log`) : join(tmpdir(), `showitglo-${label}.log`);
  let output = '';

  const child = spawn(nextBin, ['dev', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: appDir,
    env: serverEnv(extraEnv),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const record = { label, port, child, logPath, exited: false, get output() { return output; } };
  servers.push(record);

  const capture = (chunk) => {
    output += chunk.toString();
    if (VERBOSE) process.stdout.write(chunk);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('exit', (code) => {
    record.exited = true;
    record.exitCode = code;
    try {
      writeFileSync(logPath, output);
    } catch {
      /* best effort */
    }
  });

  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  const startedAt = Date.now();

  while (Date.now() < deadline) {
    if (record.exited) {
      throw new Error(`dev server "${label}" exited (code ${record.exitCode}) before becoming ready:\n${output.slice(-2000)}`);
    }
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(20000) });
      const json = await res.json();
      if (json?.services?.database?.schema === 'ready') {
        record.base = base;
        step(`server "${label}" ready on :${port} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
        return record;
      }
    } catch {
      /* not up yet */
    }
    await sleep(300);
  }

  throw new Error(`dev server "${label}" never became ready:\n${output.slice(-2000)}`);
}

async function stopServer(record) {
  if (!record || record.exited) return;
  record.child.kill('SIGTERM');
  for (let i = 0; i < 50 && !record.exited; i++) await sleep(100);
  if (!record.exited) record.child.kill('SIGKILL');
  try {
    writeFileSync(record.logPath, record.output);
  } catch {
    /* best effort */
  }
}

async function stopAllServers() {
  for (const record of servers) await stopServer(record);
}

// --------------------------------------------------------------------------
// HTTP client with a cookie jar
// --------------------------------------------------------------------------

let BASE = '';

function newSession(label) {
  return { label, cookie: null, userId: null };
}

/**
 * Every request without an explicit x-forwarded-for would look like the same
 * client to the per-IP limiters, and the suite would rate-limit itself:
 * `recover:ip:*` allows 5 an hour and there are more than five recovery
 * assertions below. A distinct synthetic IP per call keeps the per-IP buckets
 * from colliding while leaving the per-user and per-address ones — the limits
 * that actually protect the endpoints — under test.
 */
let ipCounter = 0;

function freshIp() {
  ipCounter += 1;
  return `198.51.100.${ipCounter % 250}`;
}

async function api(session, path, options = {}) {
  const { method = 'GET', body, headers = {}, cookieOverride, redirect } = options;
  const h = { accept: 'application/json', 'x-forwarded-for': freshIp(), ...headers };

  if (body !== undefined && !Object.keys(h).some((k) => k.toLowerCase() === 'content-type')) {
    h['content-type'] = 'application/json';
  }

  const cookie = cookieOverride !== undefined ? cookieOverride : session?.cookie;
  if (cookie) h.cookie = `sig_uid=${cookie}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    redirect,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  if (session && cookieOverride === undefined) {
    for (const raw of setCookies) {
      const match = /^sig_uid=([^;]*)/.exec(raw);
      if (match) session.cookie = match[1] || null;
    }
  }

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON response */
  }

  return {
    status: res.status,
    json,
    text,
    setCookies,
    location: res.headers.get('location'),
    contentType: res.headers.get('content-type') || '',
  };
}

/** Follows a link the app "emailed", without leaving the cookie jar behind. */
function pathOf(link) {
  const url = new URL(link);
  return `${url.pathname}${url.search}`;
}

// --------------------------------------------------------------------------
// Captured outgoing email (EMAIL_DEBUG_FILE)
// --------------------------------------------------------------------------

function resetEmailLog() {
  writeFileSync(EMAIL_DEBUG_FILE, '');
}

/** Every captured line, as `{ purpose, link }`. `link` is '-' for link-free mail. */
function emailLines() {
  let raw = '';
  try {
    raw = readFileSync(EMAIL_DEBUG_FILE, 'utf8');
  } catch {
    return [];
  }
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const space = line.indexOf(' ');
      return { purpose: line.slice(0, space), link: line.slice(space + 1) };
    });
}

function lastEmail(purpose) {
  const matches = emailLines().filter((entry) => !purpose || entry.purpose === purpose);
  return matches.length ? matches[matches.length - 1] : null;
}

/** Boots a session identity and remembers its user id. */
async function bootstrap(session) {
  const res = await api(session, '/api/v1/wallet');
  if (res.status !== 200) throw new Error(`could not bootstrap session ${session.label}: ${res.status} ${res.text}`);
  session.userId = res.json.wallet.user_id;
  return res.json.wallet;
}

async function createPost(session, body) {
  const res = await api(session, '/api/v1/posts', { method: 'POST', body });
  if (res.status !== 201) throw new Error(`could not create post: ${res.status} ${res.text}`);
  return res.json.post;
}

/**
 * A post authored by a brand-new session.
 *
 * Post creation is capped at 5 per user per hour, so a fixture author reused
 * across a whole section eventually gets rate-limited and the tests fail for a
 * reason that has nothing to do with what they assert.
 */
async function postFromNewAuthor(label, body) {
  const session = newSession(label);
  await bootstrap(session);
  return createPost(session, body);
}

// --------------------------------------------------------------------------
// Stripe webhook signing (what Stripe's own SDK verifies against)
// --------------------------------------------------------------------------

function stripeSignatureHeader(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

function paymentSucceededEvent({ eventId, paymentIntentId, userId, amountCents, purpose = 'wallet_topup' }) {
  return {
    id: eventId,
    object: 'event',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: paymentIntentId,
        object: 'payment_intent',
        amount: amountCents,
        amount_received: amountCents,
        currency: 'usd',
        status: 'succeeded',
        metadata: { user_id: userId, purpose, app: 'showitglo' },
      },
    },
  };
}

// ==========================================================================
// PHASE A — no Stripe keys, admin key configured
// ==========================================================================

const ctx = {};

async function phaseA() {
  section('Session identity');

  const alice = newSession('alice');

  await test('GET /api/v1/wallet mints an identity and sets a signed sig_uid cookie', async () => {
    const res = await api(alice, '/api/v1/wallet');
    checkEqual(res.status, 200, 'status');
    check(res.json?.wallet, 'response has a wallet');
    checkEqual(res.json.wallet.balance_cents, 0, 'new wallet balance');
    const cookie = res.setCookies.find((c) => c.startsWith('sig_uid='));
    check(!!cookie, 'a sig_uid cookie was set');
    check(/HttpOnly/i.test(cookie), 'cookie is HttpOnly');
    check(/SameSite=lax/i.test(cookie), 'cookie is SameSite=Lax');
    const value = /^sig_uid=([^;]*)/.exec(cookie)[1];
    check(/^v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]+$/.test(value), `cookie shape is v1.<uuid>.<sig>, got ${value}`);
    alice.userId = res.json.wallet.user_id;
  });

  await test('the same cookie resolves to the same wallet', async () => {
    const res = await api(alice, '/api/v1/wallet');
    checkEqual(res.status, 200, 'status');
    checkEqual(res.json.wallet.user_id, alice.userId, 'user_id is stable across requests');
  });

  await test('a tampered cookie signature yields a NEW identity, never the victim\'s', async () => {
    const forged = `v1.${alice.userId}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    const attacker = newSession('forger');
    const res = await api(attacker, '/api/v1/wallet', { cookieOverride: forged });
    checkEqual(res.status, 200, 'status');
    check(res.json.wallet.user_id !== alice.userId, 'forged signature did not resolve to the victim');
    checkEqual(res.json.wallet.balance_cents, 0, 'forged session got a fresh empty wallet');
    const reissued = res.setCookies.find((c) => c.startsWith('sig_uid='));
    check(!!reissued, 'a fresh signed cookie was issued');
  });

  await test('a well-formed cookie for an unknown user yields a new identity', async () => {
    const unknown = randomUUID();
    const forged = `v1.${unknown}.notarealsignature`;
    const res = await api(null, '/api/v1/wallet', { cookieOverride: forged });
    checkEqual(res.status, 200, 'status');
    check(res.json.wallet.user_id !== unknown, 'server did not adopt the claimed user id');
  });

  // ------------------------------------------------------------------------
  section('Identity forgery — user_id in the body is inert');

  await fundWallet(alice.userId, 500);
  const attacker = newSession('attacker');
  await bootstrap(attacker);

  ctx.post = await createPost(alice, { title: 'Integration target post', content: 'Body for the money-path suite.' });

  await test('POST like with another user\'s user_id in the body debits nobody', async () => {
    const before = await walletBalance(alice.userId);
    const res = await api(attacker, `/api/v1/posts/${ctx.post.id}/like`, {
      method: 'POST',
      body: { units: 5, user_id: alice.userId, payer_id: alice.userId },
    });
    checkEqual(res.status, 402, 'attacker with an empty wallet is refused');
    checkEqual(res.json.code, 'INSUFFICIENT_FUNDS', 'error code');
    checkEqual(await walletBalance(alice.userId), before, 'victim wallet untouched');
    checkEqual(await walletBalance(attacker.userId), 0, 'attacker wallet untouched');
  });

  await test('a cross-site Origin header is rejected before any spend', async () => {
    const before = await walletBalance(alice.userId);
    const res = await api(alice, `/api/v1/posts/${ctx.post.id}/like`, {
      method: 'POST',
      body: { units: 1 },
      headers: { origin: 'https://evil.example' },
    });
    checkEqual(res.status, 403, 'status');
    checkEqual(res.json.code, 'BAD_ORIGIN', 'error code');
    checkEqual(await walletBalance(alice.userId), before, 'balance unchanged');
  });

  // ------------------------------------------------------------------------
  section('No free money (Stripe not configured)');

  await test('POST /wallet/topup with no body mints nothing — 503', async () => {
    const before = await walletBalance(attacker.userId);
    const res = await api(attacker, '/api/v1/wallet/topup', { method: 'POST', body: {} });
    checkEqual(res.status, 503, 'status');
    checkEqual(res.json.code, 'PAYMENTS_NOT_CONFIGURED', 'error code');
    checkEqual(await walletBalance(attacker.userId), before, 'balance unchanged');
  });

  await test('POST /wallet/topup with amount_cents (the old mint) credits nothing', async () => {
    const res = await api(attacker, '/api/v1/wallet/topup', {
      method: 'POST',
      body: { amount_cents: 50000, user_id: attacker.userId },
    });
    check(res.status >= 400, `expected a 4xx/5xx, got ${res.status}`);
    checkEqual(await walletBalance(attacker.userId), 0, 'wallet still 0');
  });

  await test('POST /wallet/topup with a fabricated payment_intent_id credits nothing', async () => {
    const res = await api(attacker, '/api/v1/wallet/topup', {
      method: 'POST',
      body: { payment_intent_id: 'pi_3FakeIntentForTesting0001' },
    });
    check(res.status >= 400, `expected a 4xx/5xx, got ${res.status}`);
    checkEqual(await walletBalance(attacker.userId), 0, 'wallet still 0');
  });

  await test('POST /wallet/create-intent has no simulator fallback — 503', async () => {
    const res = await api(attacker, '/api/v1/wallet/create-intent', { method: 'POST', body: { amount_cents: 500 } });
    checkEqual(res.status, 503, 'status');
    checkEqual(res.json.code, 'PAYMENTS_NOT_CONFIGURED', 'error code');
    check(!res.json.client_secret, 'no client_secret handed out');
  });

  // ------------------------------------------------------------------------
  section('Spend guards');

  await test('a like with a zero balance returns the documented 402 envelope', async () => {
    const res = await api(attacker, `/api/v1/posts/${ctx.post.id}/like`, { method: 'POST', body: { units: 1 } });
    checkEqual(res.status, 402, 'status');
    checkEqual(res.json.error, 'insufficient_wallet_balance', 'error');
    checkEqual(res.json.code, 'INSUFFICIENT_FUNDS', 'code');
    checkEqual(res.json.current_balance_cents, 0, 'current_balance_cents');
    checkEqual(res.json.required_cents, 1, 'required_cents');
    checkEqual(res.json.shortfall_cents, 1, 'shortfall_cents');
  });

  for (const [label, units] of [
    ['0', 0],
    ['-5', -5],
    ['1.5', 1.5],
    ['101', 101],
    ["'abc'", 'abc'],
    ['null-ish string', '10'],
  ]) {
    await test(`like units=${label} is rejected with 400`, async () => {
      const before = await walletBalance(alice.userId);
      const res = await api(alice, `/api/v1/posts/${ctx.post.id}/like`, { method: 'POST', body: { units } });
      checkEqual(res.status, 400, 'status');
      checkEqual(res.json.code, 'INVALID_FIELD', 'code');
      checkEqual(await walletBalance(alice.userId), before, 'no money moved');
    });
  }

  await test('boost kind "power" via /boost is rejected — power is quote-only', async () => {
    const before = await walletBalance(alice.userId);
    const res = await api(alice, `/api/v1/posts/${ctx.post.id}/boost`, {
      method: 'POST',
      body: { kind: 'power', amount_cents: 100000 },
    });
    checkEqual(res.status, 400, 'status');
    checkEqual(res.json.code, 'INVALID_FIELD', 'code');
    checkEqual(await walletBalance(alice.userId), before, 'no money moved');
  });

  await test('/posts/[id]/boost ignores amount_cents in the body and charges the product price', async () => {
    const before = await walletBalance(alice.userId);
    const res = await api(alice, `/api/v1/posts/${ctx.post.id}/boost`, {
      method: 'POST',
      body: { kind: 'boost', amount_cents: 999999 },
    });
    checkEqual(res.status, 200, 'status');
    checkEqual(res.json.amount_cents, 10, 'server-priced at BOOST_CENTS');
    checkEqual(await walletBalance(alice.userId), before - 10, 'exactly 10 cents debited');
  });

  await test('a "super" boost costs exactly SUPER_CENTS', async () => {
    const before = await walletBalance(alice.userId);
    const res = await api(alice, `/api/v1/posts/${ctx.post.id}/boost`, {
      method: 'POST',
      body: { kind: 'super', amount_cents: 1 },
    });
    checkEqual(res.status, 200, 'status');
    checkEqual(res.json.amount_cents, 100, 'server-priced at SUPER_CENTS');
    checkEqual(await walletBalance(alice.userId), before - 100, 'exactly 100 cents debited');
  });

  await test('the retired /api/v1/boosts superset route is gone', async () => {
    const before = await walletBalance(alice.userId);
    const res = await api(alice, '/api/v1/boosts', {
      method: 'POST',
      body: { post_id: ctx.post.id, kind: 'like', units: 100, amount_cents: 999999 },
    });
    checkEqual(res.status, 404, 'status (it bypassed the per-post 24h like cap)');
    checkEqual(await walletBalance(alice.userId), before, 'no money moved');
  });

  // --- debates ------------------------------------------------------------

  ctx.sideA = await createPost(alice, { title: 'War side alpha', content: 'Alpha stance.' });
  ctx.sideB = await createPost(alice, { title: 'War side beta', content: 'Beta stance.' });
  ctx.debateSlug = 'integration-war';
  await q(
    `INSERT INTO debates (id, slug, question, status, curated, is_political, category_id)
     VALUES ('dbt_integration', $1, 'Which side is right?', 'live', true, false, 'global')`,
    [ctx.debateSlug]
  );
  await q(
    `INSERT INTO debate_sides (debate_id, side_key, label, post_id)
     VALUES ('dbt_integration', 'alpha', 'Alpha', $1), ('dbt_integration', 'beta', 'Beta', $2)`,
    [ctx.sideA.id, ctx.sideB.id]
  );

  await test('debate backing ignores amount_cents=999999 and charges the conviction tier', async () => {
    const before = await walletBalance(alice.userId);
    const res = await api(alice, `/api/v1/debates/${ctx.debateSlug}/back`, {
      method: 'POST',
      body: { side_key: 'alpha', kind: 'boost', amount_cents: 999999 },
    });
    checkEqual(res.status, 200, 'status');
    checkEqual(res.json.amount_cents, 10, 'charged the boost tier, not the body amount');
    checkEqual(await walletBalance(alice.userId), before - 10, 'exactly 10 cents debited');
  });

  await test('debate backing with amount_cents=-500 never credits the wallet', async () => {
    const before = await walletBalance(alice.userId);
    const res = await api(alice, `/api/v1/debates/${ctx.debateSlug}/back`, {
      method: 'POST',
      body: { side_key: 'beta', kind: 'boost', amount_cents: -500 },
    });
    checkEqual(res.status, 200, 'status');
    checkEqual(res.json.amount_cents, 10, 'still server-priced');
    const after = await walletBalance(alice.userId);
    check(after < before, `balance must decrease, went ${before} → ${after}`);
    checkEqual(after, before - 10, 'exactly 10 cents debited');
  });

  await test('a free debate backing with a huge amount_cents costs and credits nothing', async () => {
    const before = await walletBalance(alice.userId);
    const res = await api(alice, `/api/v1/debates/${ctx.debateSlug}/back`, {
      method: 'POST',
      body: { side_key: 'alpha', amount_cents: 999999 },
    });
    checkEqual(res.status, 200, 'status');
    checkEqual(res.json.amount_cents, 0, 'free vote costs nothing');
    checkEqual(await walletBalance(alice.userId), before, 'balance unchanged');
  });

  await test('an unknown conviction tier is rejected', async () => {
    const before = await walletBalance(alice.userId);
    const res = await api(alice, `/api/v1/debates/${ctx.debateSlug}/back`, {
      method: 'POST',
      body: { side_key: 'alpha', kind: 'platinum' },
    });
    checkEqual(res.status, 400, 'status');
    checkEqual(await walletBalance(alice.userId), before, 'no money moved');
  });

  // ------------------------------------------------------------------------
  section('Daily spend cap');

  await test('a wallet at its daily cap is refused with DAILY_CAP_EXCEEDED', async () => {
    const capped = newSession('capped');
    await bootstrap(capped);
    await fundWallet(capped.userId, 1000);
    await q('UPDATE wallets SET daily_cap_cents = 50 WHERE user_id = $1', [capped.userId]);

    const first = await api(capped, `/api/v1/posts/${ctx.post.id}/like`, { method: 'POST', body: { units: 50 } });
    checkEqual(first.status, 200, 'first spend of exactly the cap succeeds');
    checkEqual(await walletBalance(capped.userId), 950, 'balance after first spend');

    const second = await api(capped, `/api/v1/posts/${ctx.post.id}/like`, { method: 'POST', body: { units: 1 } });
    checkEqual(second.status, 402, 'second spend status');
    checkEqual(second.json.code, 'DAILY_CAP_EXCEEDED', 'error code');
    checkEqual(second.json.daily_cap_cents, 50, 'reported cap');
    checkEqual(await walletBalance(capped.userId), 950, 'balance unchanged by the refused spend');
  });

  // ------------------------------------------------------------------------
  section('Concurrency — no double spend');

  await test('10 parallel 100-cent likes against a 100-cent wallet settle exactly once', async () => {
    const racer = newSession('racer');
    await bootstrap(racer);
    await fundWallet(racer.userId, 100);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        api(racer, `/api/v1/posts/${ctx.post.id}/like`, { method: 'POST', body: { units: 100 } })
      )
    );

    const ok = results.filter((r) => r.status === 200);
    const refused = results.filter((r) => r.status !== 200);
    checkEqual(ok.length, 1, `exactly one settlement (statuses: ${results.map((r) => r.status).join(',')})`);
    check(
      refused.every((r) => r.status === 402 || r.status === 400),
      `every loser is a clean 402/400, got ${refused.map((r) => r.status).join(',')}`
    );

    const balance = await walletBalance(racer.userId);
    checkEqual(balance, 0, 'wallet ends at zero');
    check(balance >= 0, 'wallet never went negative');
    checkEqual(await ledgerSum(racer.userId), 0, 'ledger sums to the balance');

    const spends = await q(
      `SELECT COUNT(*) AS n FROM wallet_ledger WHERE user_id = $1 AND kind = 'spend'`,
      [racer.userId]
    );
    checkEqual(Number(spends.rows[0].n), 1, 'exactly one spend ledger row');

    const interactions = await q('SELECT COUNT(*) AS n FROM interactions WHERE user_id = $1', [racer.userId]);
    checkEqual(Number(interactions.rows[0].n), 1, 'exactly one interaction row');
  });

  // ------------------------------------------------------------------------
  section('Idempotency');

  await test('the same Idempotency-Key debits once and replays the second time', async () => {
    const idem = newSession('idem');
    await bootstrap(idem);
    await fundWallet(idem.userId, 100);
    const key = `itest-${randomUUID()}`;

    const first = await api(idem, `/api/v1/posts/${ctx.post.id}/like`, {
      method: 'POST',
      body: { units: 10 },
      headers: { 'idempotency-key': key },
    });
    checkEqual(first.status, 200, 'first status');
    checkEqual(first.json.replayed, false, 'first call is not a replay');
    checkEqual(await walletBalance(idem.userId), 90, 'balance after the first call');

    const second = await api(idem, `/api/v1/posts/${ctx.post.id}/like`, {
      method: 'POST',
      body: { units: 10 },
      headers: { 'idempotency-key': key },
    });
    checkEqual(second.status, 200, 'second status');
    checkEqual(second.json.replayed, true, 'second call is reported as a replay');
    checkEqual(await walletBalance(idem.userId), 90, 'balance unchanged by the replay');

    const rows = await q(`SELECT COUNT(*) AS n FROM interactions WHERE idempotency_key = $1`, [key]);
    checkEqual(Number(rows.rows[0].n), 1, 'exactly one interaction row for the key');
  });

  await test('another session cannot reuse someone else\'s Idempotency-Key', async () => {
    const owner = newSession('idem-owner');
    const thief = newSession('idem-thief');
    await bootstrap(owner);
    await bootstrap(thief);
    await fundWallet(owner.userId, 50);
    await fundWallet(thief.userId, 50);
    const key = `itest-shared-${randomUUID()}`;

    const first = await api(owner, `/api/v1/posts/${ctx.post.id}/like`, {
      method: 'POST',
      body: { units: 5 },
      headers: { 'idempotency-key': key },
    });
    checkEqual(first.status, 200, 'owner settles');

    const second = await api(thief, `/api/v1/posts/${ctx.post.id}/like`, {
      method: 'POST',
      body: { units: 5 },
      headers: { 'idempotency-key': key },
    });
    checkEqual(second.status, 409, 'reuse by another user is a conflict');
    checkEqual(await walletBalance(thief.userId), 50, 'thief wallet untouched');
  });

  // ------------------------------------------------------------------------
  section('Like cap (100 units / post / 24h)');

  await test('the 24h like allowance per post is enforced', async () => {
    const heavy = newSession('heavy-liker');
    await bootstrap(heavy);
    await fundWallet(heavy.userId, 1000);

    const first = await api(heavy, `/api/v1/posts/${ctx.post.id}/like`, { method: 'POST', body: { units: 100 } });
    checkEqual(first.status, 200, 'the full allowance settles');

    const second = await api(heavy, `/api/v1/posts/${ctx.post.id}/like`, { method: 'POST', body: { units: 1 } });
    checkEqual(second.status, 400, 'the next unit is refused');
    checkEqual(second.json.code, 'LIKE_CAP_REACHED', 'error code');
    checkEqual(await walletBalance(heavy.userId), 900, 'only the allowed 100 cents were spent');
  });

  // ------------------------------------------------------------------------
  section('Webhook — unconfigured deployment');

  await test('the webhook refuses to run without a signing secret — 503', async () => {
    const body = JSON.stringify(paymentSucceededEvent({
      eventId: 'evt_unconfigured',
      paymentIntentId: 'pi_unconfigured',
      userId: attacker.userId,
      amountCents: 5000,
    }));
    const res = await api(null, '/api/v1/webhooks/stripe', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    });
    checkEqual(res.status, 503, 'status');
    checkEqual(res.json.code, 'WEBHOOK_NOT_CONFIGURED', 'error code');
    checkEqual(await walletBalance(attacker.userId), 0, 'no credit applied');
  });

  // ------------------------------------------------------------------------
  section('Authorization');

  await test('GET /admin/overview without a key is 401', async () => {
    const res = await api(null, '/api/v1/admin/overview');
    checkEqual(res.status, 401, 'status');
    checkEqual(res.json.code, 'ADMIN_AUTH_REQUIRED', 'error code');
  });

  await test('GET /admin/overview with the wrong key is 401', async () => {
    const res = await api(null, '/api/v1/admin/overview', { headers: { 'x-admin-key': 'not-the-admin-key-at-all' } });
    checkEqual(res.status, 401, 'status');
  });

  await test('GET /admin/overview with the right key is 200', async () => {
    const res = await api(null, '/api/v1/admin/overview', { headers: { 'x-admin-key': ADMIN_KEY } });
    checkEqual(res.status, 200, 'status');
    check(res.json?.stats, 'payload carries operator stats');
  });

  await test('the admin key is also accepted as a bearer token', async () => {
    const res = await api(null, '/api/v1/admin/overview', { headers: { authorization: `Bearer ${ADMIN_KEY}` } });
    checkEqual(res.status, 200, 'status');
  });

  await test('POST /posts/[id]/respond without the admin key is 401', async () => {
    const res = await api(alice, `/api/v1/posts/${ctx.post.id}/respond`, {
      method: 'POST',
      body: {
        title: 'Official response',
        response_body: 'We hear you.',
        author_display: 'Some Corporation',
      },
    });
    checkEqual(res.status, 401, 'status');
    const rows = await q('SELECT COUNT(*) AS n FROM brand_responses WHERE post_id = $1', [ctx.post.id]);
    checkEqual(Number(rows.rows[0].n), 0, 'no brand response was published');
  });

  await test('GET /insights/demands without a bearer token is 401', async () => {
    const res = await api(null, '/api/v1/insights/demands');
    checkEqual(res.status, 401, 'status');
    checkEqual(res.json.code, 'API_KEY_REQUIRED', 'error code');
  });

  await test('GET /insights/debates without a bearer token is 401', async () => {
    const res = await api(null, '/api/v1/insights/debates');
    checkEqual(res.status, 401, 'status');
  });

  await test('GET /insights/demands with an invalid bearer token is 401', async () => {
    const res = await api(null, '/api/v1/insights/demands', {
      headers: { authorization: 'Bearer sig_live_deadbeefdeadbeefdeadbeefdeadbeef' },
    });
    checkEqual(res.status, 401, 'status');
    checkEqual(res.json.code, 'API_KEY_INVALID', 'error code');
  });

  // ------------------------------------------------------------------------
  section('GDPR erasure');

  await test('POST /me/erase without { confirm: true } is 400', async () => {
    const doomed = newSession('doomed');
    await bootstrap(doomed);
    ctx.doomed = doomed;

    const res = await api(doomed, '/api/v1/me/erase', { method: 'POST', body: {} });
    checkEqual(res.status, 400, 'status');
    checkEqual(res.json.code, 'CONFIRMATION_REQUIRED', 'error code');

    const rows = await q('SELECT deleted_at FROM users WHERE id = $1', [doomed.userId]);
    checkEqual(rows.rows[0].deleted_at, null, 'user is still alive');
  });

  await test('POST /me/erase with confirm erases the session\'s own user and clears the cookie', async () => {
    const doomed = ctx.doomed;
    const erasedId = doomed.userId;

    const res = await api(doomed, '/api/v1/me/erase', { method: 'POST', body: { confirm: true } });
    checkEqual(res.status, 200, 'status');
    checkEqual(res.json.erased, true, 'erased flag');

    const cleared = res.setCookies.find((c) => c.startsWith('sig_uid='));
    check(!!cleared, 'a sig_uid cookie directive was returned');
    check(/Max-Age=0/i.test(cleared), 'the cookie is expired immediately');

    const rows = await q('SELECT deleted_at, alias, email FROM users WHERE id = $1', [erasedId]);
    check(rows.rows[0].deleted_at !== null, 'deleted_at is set');
    checkEqual(rows.rows[0].alias, '[Deleted User]', 'alias tombstoned');
    check(String(rows.rows[0].email).startsWith('deleted_'), 'email tombstoned');

    // Alice is untouched: erasure is scoped to the caller's own session.
    const alive = await q('SELECT deleted_at FROM users WHERE id = $1', [alice.userId]);
    checkEqual(alive.rows[0].deleted_at, null, 'another user was not erased');

    const next = await api(doomed, '/api/v1/wallet');
    checkEqual(next.status, 200, 'the next request works');
    check(next.json.wallet.user_id !== erasedId, 'a fresh identity was issued after erasure');
  });

  // ------------------------------------------------------------------------
  section('Content validation & storage');

  const author = newSession('author');
  await bootstrap(author);

  await test('a 300-character title is rejected with 400', async () => {
    const res = await api(author, '/api/v1/posts', { method: 'POST', body: { title: 'x'.repeat(300) } });
    checkEqual(res.status, 400, 'status');
    checkEqual(res.json.code, 'INVALID_FIELD', 'error code');
    checkEqual(res.json.field, 'title', 'offending field');
  });

  await test('a valid post is created (201) and readable back', async () => {
    const title = `Integration content post ${randomUUID().slice(0, 8)}`;
    const res = await api(author, '/api/v1/posts', {
      method: 'POST',
      body: { title, content: 'Persisted by the integration suite.' },
    });
    checkEqual(res.status, 201, 'status');
    check(res.json.post?.id, 'a post id was returned');

    const read = await api(null, `/api/v1/posts/${res.json.post.id}`);
    checkEqual(read.status, 200, 'read status');
    checkEqual(read.json.post.title, title, 'title round-trips');

    const rows = await q('SELECT title, status FROM posts WHERE id = $1', [res.json.post.id]);
    checkEqual(rows.rows[0].title, title, 'title persisted in Postgres');
    checkEqual(rows.rows[0].status, 'live', 'post is live');
  });

  await test('a <script> title is stored verbatim and returned as JSON, not HTML', async () => {
    const title = "<script>alert('xss')</script>";
    const res = await api(author, '/api/v1/posts', { method: 'POST', body: { title } });
    checkEqual(res.status, 201, 'status');
    check(res.contentType.includes('application/json'), `content-type is JSON, got "${res.contentType}"`);
    checkEqual(res.json.post.title, title, 'stored verbatim (escaping is the renderer\'s job)');

    const read = await api(null, `/api/v1/posts/${res.json.post.id}`);
    check(read.contentType.includes('application/json'), `read content-type is JSON, got "${read.contentType}"`);
    checkEqual(read.json.post.title, title, 'round-trips unchanged');
  });

  await test('a title containing control characters is rejected', async () => {
    const res = await api(author, '/api/v1/posts', { method: 'POST', body: { title: 'bad\u0007title here' } });
    checkEqual(res.status, 400, 'status');
    checkEqual(res.json.code, 'INVALID_FIELD', 'error code');
  });

  // ------------------------------------------------------------------------
  section('Reports & 3-reporter auto-escalation');

  await test('a second report from the SAME session changes nothing', async () => {
    const target = await postFromNewAuthor('dup-author', {
      title: `Duplicate report target ${randomUUID().slice(0, 8)}`,
    });
    const reporter = newSession('dup-reporter');
    await bootstrap(reporter);

    const first = await api(reporter, `/api/v1/posts/${target.id}/report`, {
      method: 'POST',
      body: { reason: 'spam' },
    });
    checkEqual(first.status, 200, 'first report status');
    checkEqual(first.json.duplicate, false, 'first report is not a duplicate');

    const second = await api(reporter, `/api/v1/posts/${target.id}/report`, {
      method: 'POST',
      body: { reason: 'harassment', detail: 'trying again' },
    });
    checkEqual(second.status, 200, 'second report status');
    checkEqual(second.json.duplicate, true, 'second report is reported as a duplicate');
    checkEqual(second.json.escalated, false, 'a duplicate can never escalate');

    const rows = await q('SELECT COUNT(*) AS n FROM reports WHERE post_id = $1', [target.id]);
    checkEqual(Number(rows.rows[0].n), 1, 'exactly one report row exists');

    const post = await q('SELECT status FROM posts WHERE id = $1', [target.id]);
    checkEqual(post.rows[0].status, 'live', 'one reporter cannot pull a post alone');
  });

  await test('an unknown report reason is rejected before anything is written', async () => {
    const target = await postFromNewAuthor('bad-reason-author', {
      title: `Bad reason target ${randomUUID().slice(0, 8)}`,
    });
    const reporter = newSession('bad-reason');
    await bootstrap(reporter);

    const res = await api(reporter, `/api/v1/posts/${target.id}/report`, {
      method: 'POST',
      body: { reason: 'i-just-disagree' },
    });
    checkEqual(res.status, 400, 'status');
    checkEqual(res.json.code, 'INVALID_FIELD', 'error code');

    const rows = await q('SELECT COUNT(*) AS n FROM reports WHERE post_id = $1', [target.id]);
    checkEqual(Number(rows.rows[0].n), 0, 'nothing was written');
  });

  await test('a detail longer than 500 characters is rejected', async () => {
    const target = await postFromNewAuthor('long-detail-author', {
      title: `Long detail target ${randomUUID().slice(0, 8)}`,
    });
    const reporter = newSession('long-detail');
    await bootstrap(reporter);

    const res = await api(reporter, `/api/v1/posts/${target.id}/report`, {
      method: 'POST',
      body: { reason: 'other', detail: 'x'.repeat(501) },
    });
    checkEqual(res.status, 400, 'status');
    checkEqual(res.json.field, 'detail', 'offending field');
  });

  await test('3 distinct reporters escalate the post and take it off the board', async () => {
    const escalated = await postFromNewAuthor('escalation-author', {
      title: `Escalation target ${randomUUID().slice(0, 8)}`,
      content: 'This body must not be readable once the post is under review.',
    });
    ctx.escalatedPostId = escalated.id;

    const board = await api(null, '/api/v1/posts?limit=100');
    check(
      board.json.posts.some((p) => p.id === escalated.id),
      'the post is on the board before any report'
    );

    const responses = [];
    for (const label of ['reporter-1', 'reporter-2', 'reporter-3']) {
      const reporter = newSession(label);
      await bootstrap(reporter);
      responses.push(
        await api(reporter, `/api/v1/posts/${escalated.id}/report`, {
          method: 'POST',
          body: { reason: 'illegal', detail: `filed by ${label}` },
        })
      );
    }

    checkEqual(responses[0].json.escalated, false, 'one reporter does not escalate');
    checkEqual(responses[1].json.escalated, false, 'two reporters do not escalate');
    checkEqual(responses[2].json.escalated, true, 'the third distinct reporter escalates');

    const post = await q('SELECT status FROM posts WHERE id = $1', [escalated.id]);
    checkEqual(post.rows[0].status, 'pending_review', 'the post moved to pending_review');

    const after = await api(null, '/api/v1/posts?limit=100');
    check(
      !after.json.posts.some((p) => p.id === escalated.id),
      'the escalated post is gone from the public board'
    );

    const audit = await q(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'auto_escalated_reports' AND entity_id = $1`, [
      escalated.id,
    ]);
    checkEqual(Number(audit.rows[0].n), 1, 'exactly one escalation audit row');

    const notif = await q(`SELECT COUNT(*) AS n FROM notifications WHERE kind = 'post_under_review' AND payload->>'post_id' = $1`, [
      escalated.id,
    ]);
    checkEqual(Number(notif.rows[0].n), 1, 'the author was notified exactly once');
  });

  await test('an escalated post reads as "under review", not as a 404, and hides its body', async () => {
    const res = await api(null, `/api/v1/posts/${ctx.escalatedPostId}`);
    checkEqual(res.status, 200, 'status');
    checkEqual(res.json.under_review, true, 'flagged as under review');
    checkEqual(res.json.post.status, 'pending_review', 'status is reported honestly');
    check(res.json.post.title.startsWith('Escalation target'), 'the title the link promised is still shown');
    checkEqual(res.json.post.body, null, 'the body is withheld while under review');
    checkEqual(res.json.boosts.length, 0, 'the ledger is withheld');
    checkEqual(res.json.top_backers.length, 0, 'the backer roster is withheld');
  });

  await test('a 4th reporter on an already-escalated post does not re-escalate', async () => {
    const reporter = newSession('reporter-4');
    await bootstrap(reporter);

    const res = await api(reporter, `/api/v1/posts/${ctx.escalatedPostId}/report`, {
      method: 'POST',
      body: { reason: 'scam' },
    });
    checkEqual(res.status, 200, 'a post under review still accepts reports');
    checkEqual(res.json.escalated, false, 'escalation is not repeated');

    const audit = await q(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'auto_escalated_reports' AND entity_id = $1`, [
      ctx.escalatedPostId,
    ]);
    checkEqual(Number(audit.rows[0].n), 1, 'still exactly one escalation audit row');
  });

  await test('the escalated post is visible in the admin moderation queue', async () => {
    const res = await api(null, '/api/v1/admin/moderation', { headers: { 'x-admin-key': ADMIN_KEY } });
    checkEqual(res.status, 200, 'status');
    check(
      res.json.pending_posts.some((p) => p.id === ctx.escalatedPostId),
      'the escalated post is in the pending_review queue'
    );
    check(res.json.open_reports.length >= 4, 'open reports are listed for a moderator to work');
    check(res.json.open_reports_count >= 4, 'the open-report count is reported');
  });

  await test('an admin restore puts the post back on the board', async () => {
    const res = await api(null, '/api/v1/admin/moderation', {
      method: 'POST',
      headers: { 'x-admin-key': ADMIN_KEY },
      body: { post_id: ctx.escalatedPostId, action: 'restore' },
    });
    checkEqual(res.status, 200, 'status');
    checkEqual(res.json.post.status, 'live', 'the post is live again');

    const board = await api(null, '/api/v1/posts?limit=100');
    check(
      board.json.posts.some((p) => p.id === ctx.escalatedPostId),
      'the restored post is back on the public board'
    );

    const read = await api(null, `/api/v1/posts/${ctx.escalatedPostId}`);
    checkEqual(read.status, 200, 'read status');
    check(!read.json.under_review, 'no longer flagged as under review');
    check(read.json.post.body !== null, 'the body is readable again');
  });

  await test('reporting a post that was removed outright is a 404, not a silent success', async () => {
    const doomed = await postFromNewAuthor('removed-author', {
      title: `Removed target ${randomUUID().slice(0, 8)}`,
    });
    await api(null, '/api/v1/admin/moderation', {
      method: 'POST',
      headers: { 'x-admin-key': ADMIN_KEY },
      body: { post_id: doomed.id, action: 'remove', reason: 'Integration suite removal' },
    });

    const reporter = newSession('removed-reporter');
    await bootstrap(reporter);
    const res = await api(reporter, `/api/v1/posts/${doomed.id}/report`, {
      method: 'POST',
      body: { reason: 'spam' },
    });
    checkEqual(res.status, 404, 'status');
  });

  // ------------------------------------------------------------------------
  section('Optional email link & magic-link wallet recovery');

  await test('an invalid email address is rejected with 400', async () => {
    const session = newSession('bad-email');
    await bootstrap(session);
    for (const bad of ['not-an-email', 'a@b', 'a b@example.com', `${'x'.repeat(250)}@example.com`, 42]) {
      const res = await api(session, '/api/v1/me/link-email', { method: 'POST', body: { email: bad } });
      checkEqual(res.status, 400, `status for ${JSON.stringify(bad)}`);
      checkEqual(res.json.code, 'INVALID_EMAIL', 'error code');
    }
  });

  await test('a cross-site Origin cannot request a link or a recovery email', async () => {
    const session = newSession('csrf-email');
    await bootstrap(session);

    const link = await api(session, '/api/v1/me/link-email', {
      method: 'POST',
      body: { email: 'attacker@evil.example' },
      headers: { origin: 'https://evil.example' },
    });
    checkEqual(link.status, 403, 'link-email status');
    checkEqual(link.json.code, 'BAD_ORIGIN', 'link-email code');

    const recover = await api(null, '/api/v1/auth/recover', {
      method: 'POST',
      body: { email: 'attacker@evil.example' },
      headers: { origin: 'https://evil.example' },
    });
    checkEqual(recover.status, 403, 'recover status');
  });

  await test('link → confirm attaches the address and is announced neutrally', async () => {
    resetEmailLog();

    const owner = newSession('wallet-owner');
    await bootstrap(owner);
    await fundWallet(owner.userId, 1234);

    ctx.recoveryUserId = owner.userId;
    ctx.recoveryEmail = `owner-${randomUUID().slice(0, 8)}@example.com`;

    const res = await api(owner, '/api/v1/me/link-email', {
      method: 'POST',
      body: { email: ctx.recoveryEmail },
    });
    checkEqual(res.status, 200, 'status');
    checkEqual(res.json.success, true, 'success');
    checkEqual(res.json.message, 'Check your inbox to confirm.', 'the neutral message');

    // Nothing is linked yet — that is the whole point of a confirmation step.
    const before = await q('SELECT email FROM users WHERE id = $1', [owner.userId]);
    check(before.rows[0].email.endsWith('@anon.showitglo.local'), 'no address is attached before the click');

    const captured = lastEmail('link_email');
    check(captured, 'a confirmation link was captured');

    const confirm = await api(null, pathOf(captured.link), { redirect: 'manual' });
    checkEqual(confirm.status, 302, 'the confirm link redirects');
    check(confirm.location.includes('/dashboard?linked=1'), `redirect target: ${confirm.location}`);

    const after = await q('SELECT email, email_verified_at FROM users WHERE id = $1', [owner.userId]);
    checkEqual(after.rows[0].email, ctx.recoveryEmail, 'the address is attached');
    check(after.rows[0].email_verified_at !== null, 'the address is marked verified');
  });

  await test('the confirmation token is single-use', async () => {
    resetEmailLog();

    const session = newSession('reuse-confirm');
    await bootstrap(session);
    const email = `reuse-${randomUUID().slice(0, 8)}@example.com`;

    await api(session, '/api/v1/me/link-email', { method: 'POST', body: { email } });
    const captured = lastEmail('link_email');
    check(captured, 'a link was captured');

    const first = await api(null, pathOf(captured.link), { redirect: 'manual' });
    check(first.location.includes('linked=1'), 'the first click links the address');

    const second = await api(null, pathOf(captured.link), { redirect: 'manual' });
    checkEqual(second.status, 302, 'the second click still redirects');
    check(second.location.includes('linked=invalid'), `a replayed token is refused: ${second.location}`);

    const used = await q(
      `SELECT COUNT(*) AS n FROM auth_tokens WHERE user_id = $1 AND purpose = 'link_email' AND used_at IS NOT NULL`,
      [session.userId]
    );
    checkEqual(Number(used.rows[0].n), 1, 'the token is burned exactly once');
  });

  await test('an expired token is refused', async () => {
    resetEmailLog();

    const session = newSession('expired-token');
    await bootstrap(session);
    const email = `expired-${randomUUID().slice(0, 8)}@example.com`;

    await api(session, '/api/v1/me/link-email', { method: 'POST', body: { email } });
    const captured = lastEmail('link_email');
    check(captured, 'a link was captured');

    await q(
      `UPDATE auth_tokens SET expires_at = NOW() - INTERVAL '1 hour' WHERE user_id = $1 AND used_at IS NULL`,
      [session.userId]
    );

    const res = await api(null, pathOf(captured.link), { redirect: 'manual' });
    check(res.location.includes('linked=invalid'), `an expired token is refused: ${res.location}`);

    const user = await q('SELECT email FROM users WHERE id = $1', [session.userId]);
    check(user.rows[0].email.endsWith('@anon.showitglo.local'), 'nothing was linked');
  });

  await test('an address already securing another wallet mints NO token and leaks nothing', async () => {
    resetEmailLog();

    const interloper = newSession('interloper');
    await bootstrap(interloper);

    const res = await api(interloper, '/api/v1/me/link-email', {
      method: 'POST',
      body: { email: ctx.recoveryEmail },
    });
    checkEqual(res.status, 200, 'status is the same 200 as a fresh address');
    checkEqual(res.json.message, 'Check your inbox to confirm.', 'the message is byte-identical');

    const captured = lastEmail();
    checkEqual(captured.purpose, 'already_linked', 'the owner got the "already secured" notice instead');
    checkEqual(captured.link, '-', 'no confirmation link was generated');

    const minted = await q(
      `SELECT COUNT(*) AS n FROM auth_tokens WHERE user_id = $1 AND purpose = 'link_email'`,
      [interloper.userId]
    );
    checkEqual(Number(minted.rows[0].n), 0, 'no token exists that could move the address');

    const owner = await q('SELECT id FROM users WHERE lower(email) = lower($1)', [ctx.recoveryEmail]);
    checkEqual(owner.rows[0].id, ctx.recoveryUserId, 'the address still belongs to the original wallet');
  });

  await test('two tokens racing for the same address: the loser gets a conflict, not a 500', async () => {
    resetEmailLog();

    // Both tokens are minted while the address is still free, so the duplicate
    // is caught by the UNIQUE constraint on users.email rather than by the
    // pre-check — the only path that exercises the 23505 branch, and the one a
    // real race would take.
    const contested = `contested-${randomUUID().slice(0, 8)}@example.com`;

    const first = newSession('race-first');
    await bootstrap(first);
    await api(first, '/api/v1/me/link-email', { method: 'POST', body: { email: contested } });
    const firstLink = lastEmail('link_email').link;

    const second = newSession('race-second');
    await bootstrap(second);
    await api(second, '/api/v1/me/link-email', { method: 'POST', body: { email: contested } });
    const secondLink = lastEmail('link_email').link;
    check(firstLink !== secondLink, 'two distinct tokens were minted for the same free address');

    const winner = await api(null, pathOf(secondLink), { redirect: 'manual' });
    check(winner.location.includes('linked=1'), 'the first click through wins the address');

    const loser = await api(null, pathOf(firstLink), { redirect: 'manual' });
    checkEqual(loser.status, 302, 'the loser still gets a redirect, not a crash');
    check(loser.location.includes('linked=conflict'), `the loser is told it is taken: ${loser.location}`);

    const holder = await q('SELECT id FROM users WHERE lower(email) = lower($1)', [contested]);
    checkEqual(holder.rowCount, 1, 'exactly one wallet holds the address');
    checkEqual(holder.rows[0].id, second.userId, 'and it is the one that clicked first');

    const stillAnon = await q('SELECT email FROM users WHERE id = $1', [first.userId]);
    check(stillAnon.rows[0].email.endsWith('@anon.showitglo.local'), 'the loser keeps its anonymous address');
  });

  await test('recovery with an UNKNOWN address is indistinguishable from a known one', async () => {
    resetEmailLog();

    const unknown = await api(null, '/api/v1/auth/recover', {
      method: 'POST',
      body: { email: `nobody-${randomUUID().slice(0, 8)}@example.com` },
    });
    checkEqual(unknown.status, 200, 'status');
    checkEqual(
      unknown.json.message,
      'If that email secures a wallet, a recovery link is on its way.',
      'the generic message'
    );
    checkEqual(emailLines().length, 0, 'no email was sent for an address nobody holds');

    const known = await api(null, '/api/v1/auth/recover', {
      method: 'POST',
      body: { email: ctx.recoveryEmail },
    });
    checkEqual(known.status, unknown.status, 'a known address returns the same status');
    checkEqual(known.json.message, unknown.json.message, 'a known address returns the same message');
    checkEqual(known.json.success, unknown.json.success, 'a known address returns the same body shape');

    ctx.recoveryLink = lastEmail('recover')?.link ?? null;
    check(ctx.recoveryLink, 'a recovery link was captured for the known address');
  });

  await test('a placeholder anonymous address can never be recovered', async () => {
    resetEmailLog();

    const ghost = newSession('ghost');
    await bootstrap(ghost);

    const res = await api(null, '/api/v1/auth/recover', {
      method: 'POST',
      body: { email: `anon_${ghost.userId}@anon.showitglo.local` },
    });
    checkEqual(res.status, 200, 'status');
    checkEqual(emailLines().length, 0, 'knowing a user id is not a way into their wallet');
  });

  await test('the magic link restores the ORIGINAL wallet, balance and all', async () => {
    const stranger = newSession('stranger');
    await bootstrap(stranger);
    check(stranger.userId !== ctx.recoveryUserId, 'the recovering browser starts as somebody else');

    const before = await api(stranger, '/api/v1/wallet');
    checkEqual(before.json.wallet.balance_cents, 0, 'the fresh session has an empty wallet');

    const res = await api(stranger, pathOf(ctx.recoveryLink), { redirect: 'manual' });
    checkEqual(res.status, 302, 'the magic link redirects');
    check(res.location.includes('/dashboard?recovered=1'), `redirect target: ${res.location}`);
    check(
      res.setCookies.some((c) => c.startsWith('sig_uid=')),
      'a session cookie was issued'
    );

    // api() folded the Set-Cookie into the jar, so this is the recovered session.
    const after = await api(stranger, '/api/v1/wallet');
    checkEqual(after.json.wallet.user_id, ctx.recoveryUserId, 'the session now controls the original wallet');
    checkEqual(after.json.wallet.balance_cents, 1234, 'with its balance intact');
    checkEqual(after.json.has_receipt_email, true, 'the linked address is reported as present');
    check(/^.\*\*\*@.\*\*\*\./.test(after.json.receipt_email_masked), `masked, got ${after.json.receipt_email_masked}`);
    check(!after.text.includes(ctx.recoveryEmail), 'the raw address is never sent to the browser');

    const audit = await q(
      `SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'wallet_recovered' AND entity_id = $1`,
      [ctx.recoveryUserId]
    );
    checkEqual(Number(audit.rows[0].n), 1, 'the recovery is on the audit record');
  });

  await test('a recovery link cannot be replayed on a second browser', async () => {
    const second = newSession('replay-browser');
    await bootstrap(second);
    const ownId = second.userId;

    const res = await api(second, pathOf(ctx.recoveryLink), { redirect: 'manual' });
    check(res.location.includes('recovered=invalid'), `a replayed magic link is refused: ${res.location}`);

    const wallet = await api(second, '/api/v1/wallet');
    checkEqual(wallet.json.wallet.user_id, ownId, 'the replaying browser keeps its own identity');
  });

  await test('a forged or truncated token buys nothing', async () => {
    for (const token of ['', 'x', 'a'.repeat(43), randomUUID(), 'x'.repeat(300)]) {
      const res = await api(null, `/api/v1/auth/magic?token=${encodeURIComponent(token)}`, { redirect: 'manual' });
      checkEqual(res.status, 302, `status for a ${token.length}-char token`);
      check(res.location.includes('recovered=invalid'), 'refused');
      check(
        !res.setCookies.some((c) => /^sig_uid=v1\./.test(c)),
        'no session cookie is issued for a forged token'
      );
    }
  });

  await test('a link_email token cannot be spent at the magic endpoint', async () => {
    resetEmailLog();

    const crosser = newSession('purpose-crosser');
    await bootstrap(crosser);
    await api(crosser, '/api/v1/me/link-email', {
      method: 'POST',
      body: { email: `crosser-${randomUUID().slice(0, 8)}@example.com` },
    });

    const captured = lastEmail('link_email');
    const token = new URL(captured.link).searchParams.get('token');

    const res = await api(null, `/api/v1/auth/magic?token=${encodeURIComponent(token)}`, { redirect: 'manual' });
    check(res.location.includes('recovered=invalid'), 'purposes are not interchangeable');

    const unused = await q(
      `SELECT COUNT(*) AS n FROM auth_tokens WHERE user_id = $1 AND used_at IS NULL`,
      [crosser.userId]
    );
    checkEqual(Number(unused.rows[0].n), 1, 'the rejected attempt did not burn the token either');
  });

  await test('auth_tokens never stores a token in a form that can be replayed', async () => {
    const columns = await q(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'auth_tokens'`
    );
    const names = columns.rows.map((r) => r.column_name);
    check(names.includes('token_hash'), 'token_hash exists');
    check(!names.includes('token'), 'no plaintext token column exists');

    const rows = await q(`SELECT token_hash FROM auth_tokens LIMIT 20`);
    check(rows.rowCount > 0, 'there are tokens to inspect');
    for (const row of rows.rows) {
      check(/^[0-9a-f]{64}$/.test(row.token_hash), `token_hash is a sha256 hex digest, got "${row.token_hash}"`);
    }
  });

  // ------------------------------------------------------------------------
  section('Insights k-anonymity');

  await test('demand groups below the k floor are suppressed entirely', async () => {
    const demander = newSession('demander');
    await bootstrap(demander);
    await fundWallet(demander.userId, 500);

    const demand = await createPost(demander, {
      title: 'Bring back the integration test flavour',
      content: 'A demand with far fewer than k backers.',
      kind: 'demand',
      demand_target: 'IntegrationTestBrand',
    });

    // Three distinct paying backers — an order of magnitude below k = 100.
    for (const label of ['backer-1', 'backer-2', 'backer-3']) {
      const backer = newSession(label);
      await bootstrap(backer);
      await fundWallet(backer.userId, 200);
      const res = await api(backer, `/api/v1/posts/${demand.id}/boost`, { method: 'POST', body: { kind: 'boost' } });
      checkEqual(res.status, 200, `${label} backed the demand`);
    }

    const backerCount = await q('SELECT COUNT(*) AS n FROM post_backers WHERE post_id = $1', [demand.id]);
    check(Number(backerCount.rows[0].n) < INSIGHTS_K_MIN, 'the fixture really is below the k floor');

    const res = await api(null, '/api/v1/insights/demands', { headers: { authorization: `Bearer ${ADMIN_KEY}` } });
    checkEqual(res.status, 200, 'status');
    checkEqual(res.json.k_anonymity_floor, INSIGHTS_K_MIN, 'the advertised floor is the applied floor');
    check(Array.isArray(res.json.data), 'data is an array');
    check(
      !res.json.data.some((row) => row.target_brand === 'IntegrationTestBrand'),
      'the sub-k group is absent from the response'
    );
    checkEqual(res.json.data.length, 0, 'nothing at all is published below the floor');
  });

  // Carried into phase B.
  ctx.aliceId = alice.userId;
  ctx.attackerId = attacker.userId;
}

// ==========================================================================
// PHASE B — Stripe keys configured, ADMIN_SECRET_KEY unset
// ==========================================================================

async function phaseB() {
  section('Webhook signature verification');

  const payee = newSession('payee');
  await bootstrap(payee);

  const eventId = `evt_itest_${randomUUID().replace(/-/g, '')}`;
  const intentId = `pi_itest_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const event = paymentSucceededEvent({
    eventId,
    paymentIntentId: intentId,
    userId: payee.userId,
    amountCents: 2500,
  });
  const payload = JSON.stringify(event);

  await test('a webhook with no stripe-signature header is 400', async () => {
    const res = await api(null, '/api/v1/webhooks/stripe', {
      method: 'POST',
      body: payload,
      headers: { 'content-type': 'application/json' },
    });
    checkEqual(res.status, 400, 'status');
    checkEqual(res.json.code, 'BAD_SIGNATURE', 'error code');
    checkEqual(await walletBalance(payee.userId), 0, 'no credit applied');
  });

  await test('a forged JSON body with a junk signature is rejected', async () => {
    const res = await api(null, '/api/v1/webhooks/stripe', {
      method: 'POST',
      body: payload,
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
    });
    checkEqual(res.status, 400, 'status');
    checkEqual(res.json.code, 'BAD_SIGNATURE', 'error code');
    checkEqual(await walletBalance(payee.userId), 0, 'no credit applied');
  });

  await test('a signature computed with the wrong secret is rejected', async () => {
    const res = await api(null, '/api/v1/webhooks/stripe', {
      method: 'POST',
      body: payload,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': stripeSignatureHeader(payload, 'whsec_the_wrong_secret'),
      },
    });
    checkEqual(res.status, 400, 'status');
    checkEqual(await walletBalance(payee.userId), 0, 'no credit applied');
  });

  await test('a stale timestamp outside Stripe\'s tolerance is rejected', async () => {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const res = await api(null, '/api/v1/webhooks/stripe', {
      method: 'POST',
      body: payload,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': stripeSignatureHeader(payload, WEBHOOK_SECRET, stale),
      },
    });
    checkEqual(res.status, 400, 'status');
    checkEqual(await walletBalance(payee.userId), 0, 'no credit applied');
  });

  await test('a correctly signed payment_intent.succeeded credits the wallet once', async () => {
    const res = await api(null, '/api/v1/webhooks/stripe', {
      method: 'POST',
      body: payload,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': stripeSignatureHeader(payload, WEBHOOK_SECRET),
      },
    });
    checkEqual(res.status, 200, 'status');
    checkEqual(res.json.credited, true, 'credited flag');
    checkEqual(await walletBalance(payee.userId), 2500, 'wallet credited');

    const ledger = await q(
      `SELECT COUNT(*) AS n FROM wallet_ledger WHERE user_id = $1 AND kind = 'topup'`,
      [payee.userId]
    );
    checkEqual(Number(ledger.rows[0].n), 1, 'exactly one topup ledger row');
  });

  await test('the same event id replayed does not credit again', async () => {
    const res = await api(null, '/api/v1/webhooks/stripe', {
      method: 'POST',
      body: payload,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': stripeSignatureHeader(payload, WEBHOOK_SECRET),
      },
    });
    checkEqual(res.status, 200, 'status');
    checkEqual(res.json.duplicate, true, 'reported as a duplicate');
    checkEqual(await walletBalance(payee.userId), 2500, 'balance unchanged');

    const events = await q('SELECT COUNT(*) AS n FROM stripe_events WHERE id = $1', [eventId]);
    checkEqual(Number(events.rows[0].n), 1, 'one dedup row for the event');
  });

  await test('a NEW event id for the SAME payment intent still does not double-credit', async () => {
    const resent = paymentSucceededEvent({
      eventId: `${eventId}_again`,
      paymentIntentId: intentId,
      userId: payee.userId,
      amountCents: 2500,
    });
    const body = JSON.stringify(resent);
    const res = await api(null, '/api/v1/webhooks/stripe', {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': stripeSignatureHeader(body, WEBHOOK_SECRET),
      },
    });
    checkEqual(res.status, 200, 'status');
    checkEqual(res.json.credited, false, 'the payment intent was already settled');
    checkEqual(await walletBalance(payee.userId), 2500, 'balance unchanged');

    const payments = await q('SELECT COUNT(*) AS n FROM payments WHERE stripe_payment_intent_id = $1', [intentId]);
    checkEqual(Number(payments.rows[0].n), 1, 'one payment row for the intent');
  });

  await test('a signed event naming an unknown user is acknowledged, not credited', async () => {
    const ghost = paymentSucceededEvent({
      eventId: `evt_ghost_${randomUUID().replace(/-/g, '')}`,
      paymentIntentId: `pi_ghost_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      userId: randomUUID(),
      amountCents: 5000,
    });
    const body = JSON.stringify(ghost);
    const res = await api(null, '/api/v1/webhooks/stripe', {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': stripeSignatureHeader(body, WEBHOOK_SECRET),
      },
    });
    checkEqual(res.status, 200, 'status (200 so Stripe stops retrying)');
    checkEqual(res.json.ignored, true, 'ignored flag');
    checkEqual(res.json.reason, 'unknown_user', 'reason');
  });

  await test('a signed event that is not a wallet top-up is ignored', async () => {
    const other = paymentSucceededEvent({
      eventId: `evt_other_${randomUUID().replace(/-/g, '')}`,
      paymentIntentId: `pi_other_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      userId: payee.userId,
      amountCents: 9900,
      purpose: 'merch_order',
    });
    const body = JSON.stringify(other);
    const res = await api(null, '/api/v1/webhooks/stripe', {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'stripe-signature': stripeSignatureHeader(body, WEBHOOK_SECRET),
      },
    });
    checkEqual(res.status, 200, 'status');
    checkEqual(res.json.ignored, true, 'ignored flag');
    checkEqual(await walletBalance(payee.userId), 2500, 'balance unchanged');
  });

  // ------------------------------------------------------------------------
  section('Top-up confirmation with Stripe configured');

  await test('a fabricated payment_intent_id is refused and credits nothing', async () => {
    const before = await walletBalance(payee.userId);
    const res = await api(payee, '/api/v1/wallet/topup', {
      method: 'POST',
      body: { payment_intent_id: 'pi_3FabricatedIntentNotOurs01' },
    });
    check(res.status >= 400 && res.status < 500, `expected a 4xx, got ${res.status}`);
    checkEqual(await walletBalance(payee.userId), before, 'balance unchanged');
  });

  await test('a malformed payment_intent_id is rejected before Stripe is contacted', async () => {
    const res = await api(payee, '/api/v1/wallet/topup', {
      method: 'POST',
      body: { payment_intent_id: '../../etc/passwd' },
    });
    checkEqual(res.status, 400, 'status');
    checkEqual(res.json.code, 'INVALID_PAYMENT_INTENT', 'error code');
  });

  // ------------------------------------------------------------------------
  section('Email not configured — honest degradation');

  await test('linking an email answers 503 EMAIL_NOT_CONFIGURED, never a fake success', async () => {
    const session = newSession('no-email-link');
    await bootstrap(session);

    const res = await api(session, '/api/v1/me/link-email', {
      method: 'POST',
      body: { email: 'someone@example.com' },
    });
    checkEqual(res.status, 503, 'status');
    checkEqual(res.json.code, 'EMAIL_NOT_CONFIGURED', 'error code');
    check(!res.json.success, 'no success flag that a UI could mistake for a queued email');

    const tokens = await q(`SELECT COUNT(*) AS n FROM auth_tokens WHERE user_id = $1`, [session.userId]);
    checkEqual(Number(tokens.rows[0].n), 0, 'no token was minted that nobody could ever be sent');
  });

  await test('recovery answers 503 IDENTICALLY for a known and an unknown address', async () => {
    // The 503 must be a property of the deployment, not of the address. If it
    // were raised at send time it would be 503 for an address that exists and
    // 200 for one that does not — an account-enumeration oracle handed out by
    // a missing API key.
    const known = await api(null, '/api/v1/auth/recover', {
      method: 'POST',
      body: { email: ctx.recoveryEmail },
    });
    const unknown = await api(null, '/api/v1/auth/recover', {
      method: 'POST',
      body: { email: `nobody-${randomUUID().slice(0, 8)}@example.com` },
    });

    checkEqual(known.status, 503, 'known-address status');
    checkEqual(known.json.code, 'EMAIL_NOT_CONFIGURED', 'known-address code');
    checkEqual(unknown.status, known.status, 'the unknown address gets the same status');
    checkEqual(unknown.json.code, known.json.code, 'the unknown address gets the same code');
    checkEqual(unknown.text, known.text, 'the two responses are byte-identical');
  });

  await test('an invalid address is still rejected before the 503', async () => {
    const res = await api(null, '/api/v1/auth/recover', { method: 'POST', body: { email: 'nope' } });
    checkEqual(res.status, 400, 'status');
    checkEqual(res.json.code, 'INVALID_EMAIL', 'error code');
  });

  // ------------------------------------------------------------------------
  section('Payment receipts (receipt_email)');

  await test('a malformed receipt_email is rejected before Stripe is contacted', async () => {
    const session = newSession('bad-receipt');
    await bootstrap(session);

    const res = await api(session, '/api/v1/wallet/create-intent', {
      method: 'POST',
      body: { amount_cents: 500, receipt_email: 'not an address' },
    });
    checkEqual(res.status, 400, 'status');
    checkEqual(res.json.code, 'INVALID_EMAIL', 'error code');
    checkEqual(res.json.field, 'receipt_email', 'offending field');

    const reserved = await q(`SELECT COUNT(*) AS n FROM wallet_intents WHERE user_id = $1`, [session.userId]);
    checkEqual(Number(reserved.rows[0].n), 0, 'no headroom was reserved for a rejected request');
  });

  await test('a valid receipt_email passes validation and reaches Stripe', async () => {
    const session = newSession('good-receipt');
    await bootstrap(session);

    const res = await api(session, '/api/v1/wallet/create-intent', {
      method: 'POST',
      body: { amount_cents: 500, receipt_email: 'receipts@example.com' },
    });
    // The suite's Stripe key is a dummy, so the call fails AT Stripe — which is
    // the proof that validation let it through rather than short-circuiting.
    checkEqual(res.status, 502, 'status');
    checkEqual(res.json.code, 'PAYMENT_INTENT_FAILED', 'error code');
  });

  await test('the amount is still validated with a receipt address present', async () => {
    const session = newSession('receipt-amount');
    await bootstrap(session);

    for (const amount of [0, -100, 99, 5001, 12.5]) {
      const res = await api(session, '/api/v1/wallet/create-intent', {
        method: 'POST',
        body: { amount_cents: amount, receipt_email: 'receipts@example.com' },
      });
      checkEqual(res.status, 400, `status for amount ${amount}`);
      checkEqual(res.json.code, 'INVALID_AMOUNT', 'error code');
    }
  });

  await test('a wallet with no linked address reports has_receipt_email: false', async () => {
    const session = newSession('no-linked-email');
    await bootstrap(session);

    const res = await api(session, '/api/v1/wallet');
    checkEqual(res.status, 200, 'status');
    checkEqual(res.json.has_receipt_email, false, 'no address linked');
    checkEqual(res.json.receipt_email_masked, null, 'nothing to mask');
  });

  // ------------------------------------------------------------------------
  section('Admin fail-closed (ADMIN_SECRET_KEY unset)');

  await test('admin routes answer 503 ADMIN_NOT_CONFIGURED, never 200', async () => {
    const res = await api(null, '/api/v1/admin/overview');
    checkEqual(res.status, 503, 'status');
    checkEqual(res.json.code, 'ADMIN_NOT_CONFIGURED', 'error code');
  });

  await test('presenting the phase-A admin key does not open the door', async () => {
    const res = await api(null, '/api/v1/admin/overview', { headers: { 'x-admin-key': ADMIN_KEY } });
    checkEqual(res.status, 503, 'status');
    checkEqual(res.json.code, 'ADMIN_NOT_CONFIGURED', 'error code');
  });

  await test('POST /posts/[id]/respond is closed when admin is unconfigured', async () => {
    const res = await api(payee, `/api/v1/posts/${ctx.post.id}/respond`, {
      method: 'POST',
      body: { title: 'Official response', response_body: 'Hello.', author_display: 'A Brand' },
    });
    checkEqual(res.status, 503, 'status');
    const rows = await q('SELECT COUNT(*) AS n FROM brand_responses WHERE post_id = $1', [ctx.post.id]);
    checkEqual(Number(rows.rows[0].n), 0, 'still no brand response');
  });

  await test('insights remain closed with no admin key and no API key', async () => {
    const res = await api(null, '/api/v1/insights/demands', { headers: { authorization: `Bearer ${ADMIN_KEY}` } });
    checkEqual(res.status, 401, 'status');
  });

  // ------------------------------------------------------------------------
  section('Ledger integrity');

  await test('every wallet balance equals the sum of its ledger', async () => {
    const res = await q(
      `SELECT w.user_id, w.balance_cents, COALESCE(SUM(l.delta_cents), 0) AS ledger_total
         FROM wallets w
         LEFT JOIN wallet_ledger l ON l.user_id = w.user_id
        GROUP BY w.user_id, w.balance_cents
       HAVING w.balance_cents <> COALESCE(SUM(l.delta_cents), 0)`
    );
    checkEqual(res.rowCount, 0, `wallets out of step with their ledger: ${JSON.stringify(res.rows)}`);
  });

  await test('no wallet holds a negative balance', async () => {
    const res = await q('SELECT user_id, balance_cents FROM wallets WHERE balance_cents < 0');
    checkEqual(res.rowCount, 0, `negative balances: ${JSON.stringify(res.rows)}`);
  });

  await test('every spend has a matching interaction of the same amount', async () => {
    const res = await q(
      `SELECT l.ref_id, l.delta_cents, i.amount_cents
         FROM wallet_ledger l
         LEFT JOIN interactions i ON i.id = l.ref_id
        WHERE l.kind = 'spend' AND (i.id IS NULL OR i.amount_cents <> -l.delta_cents)`
    );
    checkEqual(res.rowCount, 0, `orphaned or mismatched spends: ${JSON.stringify(res.rows)}`);
  });
}

// ==========================================================================
// Runner
// ==========================================================================

async function main() {
  console.log('\n\x1b[1mShowItGlo — money-path integration suite\x1b[0m');
  console.log(`  database : ${TEST_DATABASE_URL}`);

  step('recreating the test database');
  await recreateTestDatabase();
  step('applying scripts/schema.sql');
  await applySchema();

  const appDir = prepareAppDir();
  step(IN_PLACE ? 'running in place (TEST_IN_PLACE=1)' : `isolated app copy → ${appDir}`);

  sql = new Client({ connectionString: TEST_DATABASE_URL });
  await sql.connect();

  resetEmailLog();

  const serverA = await startServer('A', appDir, {
    ADMIN_SECRET_KEY: ADMIN_KEY,
    EMAIL_DEBUG_FILE,
  });
  BASE = serverA.base;
  await phaseA();
  await stopServer(serverA);

  // No EMAIL_DEBUG_FILE and no RESEND_API_KEY: phase B is the deployment where
  // email was never configured, which is the state production is in today.
  const serverB = await startServer('B', appDir, {
    STRIPE_SECRET_KEY: STRIPE_SECRET,
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_integration_suite_dummy_key',
  });
  BASE = serverB.base;
  await phaseB();
  await stopServer(serverB);
}

async function cleanup() {
  await stopAllServers();
  if (sql) await sql.end().catch(() => {});

  // The capture file is a list of live magic links. It goes even with
  // TEST_KEEP=1 — nothing about a kept database needs it.
  rmSync(EMAIL_DEBUG_FILE, { force: true });

  if (KEEP) {
    console.log(`\n  TEST_KEEP=1 — database "${splitDatabaseUrl(TEST_DATABASE_URL).database}" and ${scratchDir ?? 'the repo'} were left in place.`);
    return;
  }

  await dropTestDatabase();
  if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
}

let exitCode = 0;

try {
  await main();
} catch (err) {
  console.error(`\n\x1b[31mSuite aborted:\x1b[0m ${(err && err.stack) || err}`);
  exitCode = 1;
} finally {
  await cleanup();
}

console.log(`\n${'═'.repeat(68)}`);
if (failures.length === 0 && exitCode === 0) {
  console.log(`\x1b[32m✓ ${passed}/${testNumber} integration checks passed\x1b[0m`);
} else if (failures.length === 0) {
  console.log(`\x1b[31m✗ suite ABORTED after ${passed} passing check(s) — see the error above\x1b[0m`);
} else {
  console.log(`\x1b[31m✗ ${failures.length} of ${testNumber} integration checks FAILED\x1b[0m  (${passed} passed)`);
  for (const failure of failures) {
    console.log(`   ${failure.number}. ${failure.name}`);
    console.log(`      ${failure.error instanceof AssertionError ? failure.error.message : failure.error}`);
  }
  exitCode = 1;
}
console.log(`${'═'.repeat(68)}\n`);

process.exit(exitCode);

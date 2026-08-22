#!/usr/bin/env node

/**
 * ShowItGlo — PostgreSQL schema initializer / migrator.
 *
 * Applies scripts/schema.sql exactly once at a time across all callers by
 * holding a session-level advisory lock (id 727272) for the duration. The
 * schema itself is idempotent, so running this repeatedly is a no-op.
 *
 * Usage:
 *   DATABASE_URL="postgresql://user@host:5432/db" node scripts/init-db.mjs
 *   npm run db:init            (reads .env.local / .env)
 *
 * Env:
 *   DATABASE_URL   required
 *   DATABASE_SSL   verify | no-verify | disable   (default: verify for
 *                  remote hosts, disable for localhost)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const ADVISORY_LOCK_ID = 727272;

function loadDotEnv() {
  const envPaths = [resolve(__dirname, '../.env.local'), resolve(__dirname, '../.env')];
  for (const envPath of envPaths) {
    if (!existsSync(envPath)) continue;
    try {
      const content = readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [k, ...v] = trimmed.split('=');
        const key = k.trim();
        const val = v.join('=').trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    } catch (err) {
      console.warn(`⚠️  Could not read ${envPath}: ${err.message}`);
    }
  }
}

function describeTarget(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.host || 'unknown-host';
    const database = parsed.pathname.replace(/^\//, '') || 'unknown-db';
    return `${host}/${database}`;
  } catch {
    return 'unparsable DATABASE_URL';
  }
}

function isLocalHost(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
  } catch {
    return false;
  }
}

function resolveSsl(url) {
  const mode = (process.env.DATABASE_SSL || '').toLowerCase();
  if (mode === 'disable') return undefined;
  if (mode === 'no-verify') return { rejectUnauthorized: false };
  if (mode === 'verify') return true;
  return isLocalHost(url) ? undefined : true;
}

loadDotEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('\n❌ DATABASE_URL is not set.\n');
  console.error('Set it in .env.local, or pass it inline:\n');
  console.error('  DATABASE_URL="postgresql://user@localhost:5432/showitglo_dev" node scripts/init-db.mjs\n');
  process.exit(1);
}

const schemaPath = resolve(__dirname, 'schema.sql');
if (!existsSync(schemaPath)) {
  console.error(`\n❌ Schema file not found at ${schemaPath}\n`);
  process.exit(1);
}

console.log('\n🐘 ShowItGlo — applying PostgreSQL schema');
console.log(`   target: ${describeTarget(databaseUrl)}`);

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: resolveSsl(databaseUrl),
  connectionTimeoutMillis: 10000,
  // DDL on a large table can take a while; do not let statement_timeout kill it.
  statement_timeout: 120000,
  max: 1,
});

const EXPECTED_TABLES = [
  'api_keys',
  'audit_logs',
  'board_snapshots',
  'brand_responses',
  'categories',
  'debate_free_votes',
  'debate_opinions',
  'debate_sides',
  'debates',
  'interactions',
  'moderation_actions',
  'notifications',
  'payments',
  'post_backers',
  'posts',
  'presence_heartbeats',
  'quotes',
  'rank_events',
  'rate_limit_counters',
  'reports',
  'stripe_events',
  'users',
  'wallet_intents',
  'wallet_ledger',
  'wallets',
];

function explainFailure(err) {
  const code = err && err.code;
  if (code === 'ECONNREFUSED') {
    return 'Postgres refused the connection. Is the server running and is the host/port correct?';
  }
  if (code === '3D000') {
    return 'The database named in DATABASE_URL does not exist. Create it first (e.g. `createdb showitglo_dev`).';
  }
  if (code === '28P01' || code === '28000') {
    return 'Authentication failed. Check the user/password in DATABASE_URL.';
  }
  if (code === '42501') {
    return 'Permission denied. The role in DATABASE_URL needs CREATE privileges on the database.';
  }
  if (code === '55P03' || code === '57014') {
    return 'Timed out waiting on a lock. Another migration may be running; retry shortly.';
  }
  return null;
}

async function runMigration() {
  let client;
  let lockHeld = false;

  try {
    client = await pool.connect();
  } catch (err) {
    console.error(`\n❌ Could not connect to Postgres: ${err.message}`);
    const hint = explainFailure(err);
    if (hint) console.error(`   ${hint}`);
    console.error('');
    await pool.end().catch(() => {});
    process.exit(1);
  }

  try {
    console.log('   connected ✓');

    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);
    lockHeld = true;
    console.log(`   advisory lock ${ADVISORY_LOCK_ID} acquired ✓`);

    const schemaSql = readFileSync(schemaPath, 'utf8');

    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');
    console.log('   schema applied ✓');

    const res = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name`
    );
    const tables = res.rows.map((r) => r.table_name);
    const missing = EXPECTED_TABLES.filter((t) => !tables.includes(t));

    if (missing.length > 0) {
      throw new Error(`Schema applied but expected tables are missing: ${missing.join(', ')}`);
    }

    const cat = await client.query(`SELECT id FROM categories WHERE id = 'global'`);
    if (cat.rowCount !== 1) {
      throw new Error('Default "global" category is missing after migration.');
    }

    console.log(`   ${tables.length} tables verified ✓`);
    console.log(`   default category "global" ✓`);
    console.log('\n✅ Database schema is up to date.\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`\n❌ Schema migration failed: ${err.message}`);
    if (err.code) console.error(`   sqlstate: ${err.code}`);
    if (err.position) console.error(`   position: ${err.position}`);
    if (err.detail) console.error(`   detail: ${err.detail}`);
    const hint = explainFailure(err);
    if (hint) console.error(`   ${hint}`);
    console.error('');
    process.exitCode = 1;
  } finally {
    if (lockHeld) {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]).catch(() => {});
    }
    client.release();
    await pool.end().catch(() => {});
  }
}

runMigration();

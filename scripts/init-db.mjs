#!/usr/bin/env node

/**
 * ShowItGlo — Automated PostgreSQL Schema Migration & Initialization Script
 * Usage:
 *   DATABASE_URL="postgresql://..." node scripts/init-db.mjs
 *   or: npm run db:init
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env or .env.local if present
const envPaths = [
  resolve(__dirname, '../.env.local'),
  resolve(__dirname, '../.env'),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [k, ...v] = trimmed.split('=');
          const key = k.trim();
          const val = v.join('=').trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch {}
  }
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('\n❌ Error: DATABASE_URL environment variable is not defined.');
  console.error('Please configure DATABASE_URL in your .env.local or pass it directly:\n');
  console.error('  DATABASE_URL="postgresql://user:pass@host/showitglo" npm run db:init\n');
  process.exit(1);
}

console.log('\n🐘 ShowItGlo — Initializing PostgreSQL Database...');
console.log(`📡 Target Host: ${new URL(databaseUrl.replace(/^postgresql:\/\//, 'http://')).host}`);

const isProduction = process.env.NODE_ENV === 'production' && !databaseUrl.includes('localhost');

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: isProduction ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 10000,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('✓ Connected to PostgreSQL server.');

    const schemaPath = resolve(__dirname, 'schema.sql');
    if (!existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }

    const schemaSql = readFileSync(schemaPath, 'utf8');

    console.log('⏳ Executing schema DDL migrations (tables, indexes, constraints)...');
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('COMMIT');
    console.log('✓ DDL schema applied successfully.');

    // Verify critical tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    const tables = res.rows.map((r) => r.table_name);
    console.log(`✓ Verified ${tables.length} tables in database:`);
    console.log(`  ${tables.join(', ')}`);

    // Ensure default category exists
    await client.query(`
      INSERT INTO categories (id, name, is_live, half_life_hours, increment_strategy, increment_config, score_epoch, min_power_cents)
      VALUES ('global', 'Global Arena', true, 168, 'percent', '{"pct": 0.10, "floor_cents": 50}', NOW() - INTERVAL '14 days', 1000)
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log('✓ Default "global" category verified.');

    console.log('\n🎉 DATABASE INITIALIZATION COMPLETE! Your PostgreSQL database is 100% ready.\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Database initialization failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();

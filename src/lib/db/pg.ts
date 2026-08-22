import { Pool, PoolClient, QueryResult, QueryResultRow, types as pgTypes } from 'pg';

/**
 * node-postgres hands back BIGINT (oid 20) and NUMERIC (oid 1700) as strings
 * to protect precision beyond 2^53. Every such column in this schema is a
 * cent amount or a row count, all far inside Number.MAX_SAFE_INTEGER, and the
 * application types them as `number` — so parse them once, globally, instead
 * of sprinkling Number() over every row mapper.
 */
pgTypes.setTypeParser(pgTypes.builtins.INT8, (value: string) => Number(value));
pgTypes.setTypeParser(pgTypes.builtins.NUMERIC, (value: string) => Number(value));

/**
 * Postgres access layer.
 *
 * The pool is cached on globalThis because serverless instances are recycled
 * across invocations — a fresh Pool per request would exhaust connections.
 * `max` stays deliberately small in production: Vercel runs many instances,
 * so the ceiling that matters is instances × max, and the deployment target
 * is a pooled (PgBouncer-style) Neon URL.
 */

const globalForPg = globalThis as unknown as { pgPool?: Pool };

/** Serialization / deadlock SQLSTATEs that are safe to retry once. */
const RETRYABLE_SQLSTATES = new Set(['40001', '40P01']);

function isLocalConnection(connectionString: string): boolean {
  try {
    const host = new URL(connectionString).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
  } catch {
    return connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  }
}

/**
 * DATABASE_SSL: verify | no-verify | disable.
 * Default is full verification in production unless the host is local.
 */
function resolveSsl(connectionString: string): boolean | { rejectUnauthorized: boolean } | undefined {
  const mode = (process.env.DATABASE_SSL || '').toLowerCase();
  if (mode === 'disable') return undefined;
  if (mode === 'no-verify') return { rejectUnauthorized: false };
  if (mode === 'verify') return true;

  if (isLocalConnection(connectionString)) return undefined;
  return process.env.NODE_ENV === 'production' ? true : undefined;
}

function resolvePoolMax(connectionString: string): number {
  const configured = Number(process.env.DB_POOL_MAX);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return isLocalConnection(connectionString) ? 10 : 5;
}

export function getPgPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  if (!globalForPg.pgPool) {
    globalForPg.pgPool = new Pool({
      connectionString,
      ssl: resolveSsl(connectionString),
      max: resolvePoolMax(connectionString),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      // Server-side ceiling: a runaway query cannot pin a connection forever.
      statement_timeout: 15000,
      // Client-side ceiling: covers the case where the server never answers.
      query_timeout: 15000,
    });

    // An idle client erroring out (network blip, server restart) must not
    // crash the process — pg removes it from the pool automatically.
    globalForPg.pgPool.on('error', (err) => {
      console.error('[pg] idle client error:', err.message);
    });
  }

  return globalForPg.pgPool;
}

/** Throws if DATABASE_URL is unset — every store path requires a database. */
export function requirePgPool(): Pool {
  const pool = getPgPool();
  if (!pool) {
    throw new Error('DATABASE_URL is not configured — the database is required.');
  }
  return pool;
}

export async function queryPg<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const pool = requirePgPool();
  const start = Date.now();
  const res = await pool.query<T>(text, params as never);
  if (process.env.DEBUG_SQL) {
    console.log('[pg] query', { text, durationMs: Date.now() - start, rows: res.rowCount });
  }
  return res;
}

function sqlState(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/**
 * Runs `fn` inside a single BEGIN/COMMIT on one dedicated connection.
 *
 * Rolls back and releases on any throw. A serialization failure or deadlock
 * is retried exactly once — beyond that the caller sees the error, because a
 * repeatedly-conflicting money transaction is a bug, not a blip.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = requirePgPool();

  const attempt = async (): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };

  try {
    return await attempt();
  } catch (err) {
    const state = sqlState(err);
    if (state && RETRYABLE_SQLSTATES.has(state)) {
      if (process.env.DEBUG_SQL) console.warn(`[pg] retrying transaction after ${state}`);
      return attempt();
    }
    throw err;
  }
}

export interface PgHealth {
  status: 'connected' | 'unconfigured' | 'error';
  latencyMs?: number;
  schema?: 'ready' | 'missing';
  error?: string;
}

/**
 * Connectivity + schema probe. `SELECT 1 FROM users LIMIT 0` returns no rows
 * but still fails loudly (42P01) when the table has never been created, which
 * is exactly the "deployed but never migrated" case we want to surface.
 */
export async function checkPgHealth(): Promise<PgHealth> {
  if (!process.env.DATABASE_URL) return { status: 'unconfigured' };

  const start = Date.now();
  try {
    await queryPg('SELECT 1 AS ok');
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : 'unknown database error' };
  }

  try {
    await queryPg('SELECT 1 FROM users LIMIT 0');
    return { status: 'connected', latencyMs: Date.now() - start, schema: 'ready' };
  } catch (err) {
    if (sqlState(err) === '42P01') {
      return { status: 'connected', latencyMs: Date.now() - start, schema: 'missing' };
    }
    return { status: 'error', error: err instanceof Error ? err.message : 'unknown schema error' };
  }
}

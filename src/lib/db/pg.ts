import { Pool } from 'pg';

const globalForPg = globalThis as unknown as { pgPool?: Pool };

export function getPgPool(): Pool | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!globalForPg.pgPool) {
    const isProduction = process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL.includes('localhost');

    globalForPg.pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isProduction ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.DB_POOL_MAX || (isProduction ? 20 : 5)),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    globalForPg.pgPool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client:', err.message);
    });
  }

  return globalForPg.pgPool;
}

export async function checkPgHealth(): Promise<{ status: 'connected' | 'unconfigured' | 'error'; latencyMs?: number; error?: string }> {
  if (!process.env.DATABASE_URL) {
    return { status: 'unconfigured' };
  }

  try {
    const start = Date.now();
    await queryPg('SELECT 1 as health_check');
    return {
      status: 'connected',
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      status: 'error',
      error: err.message,
    };
  }
}

export async function queryPg(text: string, params?: any[]) {
  const p = getPgPool();
  if (!p) {
    throw new Error('DATABASE_URL is not configured.');
  }
  const start = Date.now();
  const res = await p.query(text, params);
  const duration = Date.now() - start;
  if (process.env.DEBUG_SQL) {
    console.log('Executed query', { text, duration, rows: res.rowCount });
  }
  return res;
}

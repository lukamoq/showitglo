import { NextResponse } from 'next/server';
import { checkPgHealth } from '@/lib/db/pg';
import { db } from '@/lib/db/db';
import { presenceTracker } from '@/lib/presence/presenceTracker';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = Date.now();
  const pgHealth = await checkPgHealth();
  const presence = presenceTracker.getPresence();
  const rankedCount = db.getRankedBoard('global').length;

  const status = pgHealth.status === 'error' ? 'degraded' : 'healthy';

  const healthData = {
    status,
    timestamp: new Date().toISOString(),
    uptime_seconds: process.uptime ? Math.floor(process.uptime()) : 0,
    environment: process.env.NODE_ENV || 'development',
    version: '0.1.0',
    services: {
      api: { status: 'healthy', latency_ms: Date.now() - startTime },
      database: pgHealth,
      presence: { status: 'healthy', live_visitors: presence.activeVisitors },
      market_engine: { status: 'healthy', active_stances: rankedCount },
    },
    memory: process.memoryUsage ? {
      heap_used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    } : undefined,
  };

  return NextResponse.json(healthData, {
    status: status === 'healthy' ? 200 : 503,
  });
}

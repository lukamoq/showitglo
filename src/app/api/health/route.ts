import { NextResponse } from 'next/server';

import { checkPgHealth } from '@/lib/db/pg';
import { getPresenceCount } from '@/lib/db/store';
import {
  isPaymentsReady,
  isProduction,
  isStripeConfigured,
  isStripePublishableConfigured,
  isStripeWebhookConfigured,
} from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * Reports connectivity, whether the schema has actually been migrated, and
 * which integrations are wired — never any key material.
 *
 * A database error, or a missing schema in production, is a 503: the app
 * cannot serve money operations, so load balancers should take it out of
 * rotation rather than route traffic into failures.
 */
export async function GET() {
  const startTime = Date.now();
  const database = await checkPgHealth();

  let livePresence: number | null = null;
  if (database.status === 'connected' && database.schema === 'ready') {
    livePresence = await getPresenceCount().catch(() => null);
  }

  const degraded =
    database.status === 'error' ||
    (isProduction() && (database.status === 'unconfigured' || database.schema === 'missing'));

  const payload = {
    status: degraded ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
    uptime_seconds: typeof process.uptime === 'function' ? Math.floor(process.uptime()) : 0,
    environment: process.env.NODE_ENV || 'development',
    version: '0.1.0',
    services: {
      api: { status: 'healthy', latency_ms: Date.now() - startTime },
      database: {
        status: database.status,
        latency_ms: database.latencyMs ?? null,
        schema: database.schema ?? 'unknown',
        error: database.error ?? null,
      },
      presence: { status: livePresence === null ? 'unavailable' : 'healthy', live_visitors: livePresence },
      payments: {
        // ready = the full path works: intent creation (secret), the browser
        // form (publishable), and crediting (webhook secret). The individual
        // flags say which link is missing.
        ready: isPaymentsReady(),
        stripe_configured: isStripeConfigured(),
        publishable_key_configured: isStripePublishableConfigured(),
        webhook_configured: isStripeWebhookConfigured(),
      },
    },
  };

  return NextResponse.json(payload, { status: degraded ? 503 : 200 });
}

import { NextRequest } from 'next/server';

import { eventBus } from '@/lib/engine/eventBus';

export const dynamic = 'force-dynamic';

/**
 * Hard ceiling on one SSE connection.
 *
 * Serverless functions are billed and killed by wall time, and a stream held
 * open indefinitely is a function instance that never returns. Closing at 55s
 * and letting EventSource reconnect (which it does automatically) keeps every
 * invocation inside a normal request budget, at the cost of one reconnect a
 * minute per viewer.
 */
const MAX_CONNECTION_MS = 55_000;
const HEARTBEAT_MS = 15_000;

/**
 * GET /api/v1/live
 *
 * Best-effort event fanout for the local instance only. The event bus lives in
 * process memory, so a client connected to instance A will not see events
 * published on instance B — this stream is a latency optimisation on top of
 * polling, never the source of truth for anything.
 */
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let lifetime: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe: (() => void) | undefined;

      const teardown = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (lifetime) clearTimeout(lifetime);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          /* already closed by the runtime */
        }
      };

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          teardown();
        }
      };

      unsubscribe = eventBus.subscribe('*', (data) => {
        send(`data: ${JSON.stringify(data)}\n\n`);
      });

      heartbeat = setInterval(() => send(': heartbeat\n\n'), HEARTBEAT_MS);
      lifetime = setTimeout(teardown, MAX_CONNECTION_MS);

      request.signal.addEventListener('abort', teardown);

      // `retry:` tells EventSource how soon to come back after we hang up.
      send('retry: 2000\n\n');
      send(`data: ${JSON.stringify({ type: 'connected', time: new Date().toISOString() })}\n\n`);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

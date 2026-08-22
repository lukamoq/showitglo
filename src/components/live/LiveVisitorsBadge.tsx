'use client';

import React, { useState, useEffect } from 'react';

interface LiveVisitorsBadgeProps {
  className?: string;
  variant?: 'badge' | 'compact' | 'pill';
}

interface PresenceSnapshot {
  live: number;
  /** Distinct visitors ever counted — null when the server can't report it. */
  visitors: number | null;
}

/**
 * Real presence, or nothing.
 *
 * `GET /api/v1/live/stats` counts heartbeats from the last 90 seconds, so the
 * viewer is included once their own heartbeat lands, and reports the durable
 * visitor total counted from the same heartbeats. When the endpoint is
 * unavailable the badge unmounts rather than inventing a number — a fake
 * "12 online" is the single fastest way to lose a visitor's trust.
 *
 * The two numbers fail independently: an older deployment that has the live
 * count but no visitors table still renders the live half alone.
 */
export const LiveVisitorsBadge: React.FC<LiveVisitorsBadgeProps> = ({
  className = '',
  variant = 'badge',
}) => {
  // null until the server reports real numbers — never a made-up starting count.
  const [presence, setPresence] = useState<PresenceSnapshot | null>(null);

  useEffect(() => {
    // Generate or retrieve persistent anonymous session token
    let sessionId = '';
    try {
      sessionId = sessionStorage.getItem('showitglo_presence_id') || '';
      if (!sessionId) {
        sessionId = `sess_${Math.random().toString(36).substring(2, 10)}`;
        sessionStorage.setItem('showitglo_presence_id', sessionId);
      }
    } catch {
      sessionId = `sess_${Math.random().toString(36).substring(2, 10)}`;
    }

    let cancelled = false;

    const tick = async () => {
      // Register presence, then read the authoritative counts from /live/stats.
      try {
        await fetch('/api/v1/live/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ session_id: sessionId }),
        });
      } catch {
        // presence is best-effort; the counts below are what matter
      }

      try {
        const res = await fetch('/api/v1/live/stats', { credentials: 'same-origin' });
        if (!res.ok) throw new Error('stats unavailable');
        const data = await res.json();
        const live = data?.live_visitors_now;
        const visitors = data?.visitors_total;
        if (cancelled) return;
        setPresence(
          typeof live === 'number' && live >= 0
            ? {
                live,
                visitors: typeof visitors === 'number' && visitors >= 0 ? visitors : null,
              }
            : null
        );
      } catch {
        // Presence is unavailable — hide the badge rather than invent a number.
        if (!cancelled) setPresence(null);
      }
    };

    void tick();
    const interval = setInterval(() => void tick(), 12000); // 12-second heartbeat

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (presence === null) return null;

  const { live, visitors } = presence;

  /* Both registers are plural-safe by construction — "1 live", "1 in the
     arena" — and the screen-reader string is spelled out either way. */
  const spoken =
    `${live} ${live === 1 ? 'person is' : 'people are'} in the arena right now` +
    (visitors === null
      ? ''
      : `, ${visitors.toLocaleString()} ${visitors === 1 ? 'visitor' : 'visitors'} in total`);

  if (variant === 'compact') {
    return (
      <span
        className={`inline-flex items-center gap-2 text-meta ${className}`}
        title={
          visitors === null
            ? 'Live visitors in the arena right now'
            : 'Live visitors in the arena right now · total visitors counted so far'
        }
      >
        <span className="led led-up" aria-hidden />
        <span className="tnum font-semibold text-ink" aria-hidden>
          {live.toLocaleString()}
        </span>
        <span className="micro-label text-ink-3" aria-hidden>
          live
        </span>
        {visitors !== null && (
          <>
            <span aria-hidden className="h-3 w-px bg-line-strong" />
            <span className="tnum font-semibold text-ink" aria-hidden>
              {visitors.toLocaleString()}
            </span>
            <span className="micro-label text-ink-3" aria-hidden>
              visitors
            </span>
          </>
        )}
        <span className="sr-only">{spoken}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-control border border-line bg-white/[0.03] px-2.5 py-1 ${className}`}
      title={
        visitors === null
          ? 'Live visitors in the arena right now'
          : 'Live visitors in the arena right now · total visitors counted so far'
      }
    >
      <span className="led led-up" aria-hidden />
      <span className="text-dense text-ink-2" aria-hidden>
        <span className="tnum font-semibold text-ink">{live.toLocaleString()}</span> in the arena
      </span>
      {visitors !== null && (
        <>
          <span aria-hidden className="h-3 w-px bg-line-strong" />
          <span className="text-dense text-ink-2" aria-hidden>
            <span className="tnum font-semibold text-ink">{visitors.toLocaleString()}</span>{' '}
            {visitors === 1 ? 'visitor' : 'visitors'}
          </span>
        </>
      )}
      <span className="sr-only">{spoken}</span>
    </span>
  );
};

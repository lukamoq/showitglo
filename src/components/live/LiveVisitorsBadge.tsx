'use client';

import React, { useState, useEffect } from 'react';

interface LiveVisitorsBadgeProps {
  className?: string;
  variant?: 'badge' | 'compact' | 'pill';
}

/**
 * Real presence, or nothing.
 *
 * `GET /api/v1/live/stats` counts heartbeats from the last 90 seconds, so the
 * viewer is included once their own heartbeat lands. When the endpoint is
 * unavailable the badge unmounts rather than inventing a number — a fake
 * "12 online" is the single fastest way to lose a visitor's trust.
 */
export const LiveVisitorsBadge: React.FC<LiveVisitorsBadgeProps> = ({
  className = '',
  variant = 'badge',
}) => {
  // null until the server reports a real number — never a made-up starting count.
  const [liveCount, setLiveCount] = useState<number | null>(null);

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
      // Register presence, then read the authoritative count from /live/stats.
      try {
        await fetch('/api/v1/live/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ session_id: sessionId }),
        });
      } catch {
        // presence is best-effort; the count below is what matters
      }

      try {
        const res = await fetch('/api/v1/live/stats', { credentials: 'same-origin' });
        if (!res.ok) throw new Error('stats unavailable');
        const data = await res.json();
        const count = data?.live_visitors_now;
        if (!cancelled) setLiveCount(typeof count === 'number' && count >= 0 ? count : null);
      } catch {
        // Presence is unavailable — hide the badge rather than invent a number.
        if (!cancelled) setLiveCount(null);
      }
    };

    void tick();
    const interval = setInterval(() => void tick(), 12000); // 12-second heartbeat

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (liveCount === null) return null;

  /* Both registers are plural-safe by construction — "1 live", "1 in the
     arena" — and the screen-reader string is spelled out either way. */
  const spoken = `${liveCount} ${liveCount === 1 ? 'person is' : 'people are'} in the arena right now`;

  if (variant === 'compact') {
    return (
      <span
        className={`inline-flex items-center gap-2 text-meta ${className}`}
        title="Live visitors in the arena right now"
      >
        <span className="led led-up" aria-hidden />
        <span className="tnum font-semibold text-ink" aria-hidden>
          {liveCount.toLocaleString()}
        </span>
        <span className="micro-label text-ink-3" aria-hidden>
          live
        </span>
        <span className="sr-only">{spoken}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-control border border-line bg-white/[0.03] px-2.5 py-1 ${className}`}
      title="Live visitors in the arena right now"
    >
      <span className="led led-up" aria-hidden />
      <span className="text-dense text-ink-2" aria-hidden>
        <span className="tnum font-semibold text-ink">{liveCount.toLocaleString()}</span> in the
        arena
      </span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
};

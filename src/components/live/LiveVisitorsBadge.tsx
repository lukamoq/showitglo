'use client';

import React, { useState, useEffect } from 'react';
import { Users, Radio } from 'lucide-react';

interface LiveVisitorsBadgeProps {
  className?: string;
  variant?: 'badge' | 'compact' | 'pill';
}

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

  if (variant === 'compact') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-meta font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${className}`}
        title="Live concurrent visitors watching the arena right now"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="tnum font-bold text-white tracking-tight">{liveCount}</span>
        <span className="text-emerald-400/80 text-[10px] uppercase font-bold tracking-wider">live</span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] ${className}`}
      title="Real-time live presence counter (heartbeat active)"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
      </span>
      <span className="flex items-baseline gap-1.5">
        <span className="tnum metric text-sm text-white font-bold">{liveCount}</span>
        <span className="micro-label text-ink-3">Live in arena</span>
      </span>
    </div>
  );
};

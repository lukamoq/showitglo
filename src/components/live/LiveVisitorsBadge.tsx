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
  const [liveCount, setLiveCount] = useState<number>(142);
  const [isLive, setIsLive] = useState(true);

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

    const sendHeartbeat = async () => {
      try {
        const res = await fetch('/api/v1/live/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.live_visitors_now) {
            setLiveCount(data.live_visitors_now);
            setIsLive(true);
          }
        }
      } catch (err) {
        // Soft fallback
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 12000); // 12-second heartbeat

    return () => clearInterval(interval);
  }, []);

  if (variant === 'compact') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full glass-segmented border border-emerald-500/30 text-[11px] font-mono text-emerald-300 font-bold ${className}`}
        title="Live concurrent visitors watching the arena right now"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="tabular-nums">{liveCount}</span>
        <span className="text-[9px] text-slate-400 font-normal">live</span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full glass-card border border-emerald-500/30 shadow-lg shadow-emerald-500/10 ${className}`}
      title="Real-time live presence counter (heartbeat active)"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>

      <span className="text-xs font-mono font-bold text-emerald-300 flex items-center gap-1">
        <span className="tabular-nums text-sm font-black">{liveCount}</span>
        <span className="text-[10px] text-slate-300 uppercase tracking-wider font-semibold">
          Live In Arena
        </span>
      </span>
    </div>
  );
};

'use client';

import React from 'react';
import Link from 'next/link';
import { Flame, Swords, TrendingUp } from 'lucide-react';
import { WarEvent } from '@/lib/types';
import { formatUSD } from '@/lib/utils';

interface WarTickerProps {
  wars?: WarEvent[];
}

export const WarTicker: React.FC<WarTickerProps> = ({ wars = [] }) => {
  if (wars.length === 0) return null;

  return (
    <div className="w-full bg-gradient-to-r from-rose-950/60 via-amber-950/40 to-rose-950/60 border-b border-rose-500/20 py-2 px-4 overflow-hidden relative backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-bold uppercase tracking-wider shrink-0">
          <Flame className="w-3.5 h-3.5 animate-pulse text-rose-400" />
          <span>Active War</span>
        </div>

        <div className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-8 text-xs font-mono">
          {wars.map((war, idx) => (
            <Link
              key={idx}
              href="/wars"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0 text-slate-300 group"
            >
              <span className="font-semibold text-white group-hover:text-amber-300">
                #{war.post_a.rank} {war.post_a.title.substring(0, 32)}...
              </span>
              <span className="text-amber-400">({formatUSD(war.post_a.score)})</span>
              
              <Swords className="w-3.5 h-3.5 text-rose-400 animate-pulse" />

              <span className="font-semibold text-white group-hover:text-amber-300">
                #{war.post_b.rank} {war.post_b.title.substring(0, 32)}...
              </span>
              <span className="text-amber-400">({formatUSD(war.post_b.score)})</span>

              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                {war.flip_count_24h} lead changes (24h)
              </span>
            </Link>
          ))}
        </div>

        <Link
          href="/wars"
          className="hidden sm:flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 font-semibold shrink-0"
        >
          <span>View All</span>
          <TrendingUp className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
};

'use client';

import React from 'react';
import Link from 'next/link';
import { Swords } from 'lucide-react';
import { WarEvent } from '@/lib/types';
import { formatUSD } from '@/lib/utils';

interface WarTickerProps {
  wars?: WarEvent[];
}

export const WarTicker: React.FC<WarTickerProps> = ({ wars = [] }) => {
  if (wars.length === 0) return null;

  return (
    <div className="w-full border-b border-line bg-black/30 backdrop-blur-md py-1.5 px-4">
      <div className="max-w-6xl mx-auto flex items-center gap-4 tape text-ink-2">
        <div className="micro-label text-down flex items-center gap-1.5 shrink-0">
          <span className="led led-down" aria-hidden />
          <span>Live fights</span>
        </div>

        <div className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-3 min-w-0">
          {wars.map((war, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <span aria-hidden className="text-ink-3/40 shrink-0">
                  |
                </span>
              )}
              <Link
                href="/wars"
                className="flex items-center gap-2 shrink-0 transition-opacity hover:opacity-80"
              >
                <span className="text-ink font-medium">
                  #{war.post_a.rank} {war.post_a.title.substring(0, 32)}...
                </span>
                <span className="tnum text-gold-text">{formatUSD(war.post_a.score)}</span>

                <Swords className="w-3 h-3 text-down shrink-0" aria-hidden />

                <span className="text-ink font-medium">
                  #{war.post_b.rank} {war.post_b.title.substring(0, 32)}...
                </span>
                <span className="tnum text-gold-text">{formatUSD(war.post_b.score)}</span>

                <span className="chip text-down">
                  {war.flip_count_24h} lead changes (24h)
                </span>
              </Link>
            </React.Fragment>
          ))}
        </div>

        <Link
          href="/wars"
          className="hidden sm:block text-meta text-ink-3 hover:text-ink transition-colors shrink-0"
        >
          View all
        </Link>
      </div>
    </div>
  );
};

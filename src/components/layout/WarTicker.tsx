'use client';

import React from 'react';
import Link from 'next/link';
import { Swords } from 'lucide-react';
import { FightPair } from '@/lib/types';
import { formatScore } from '@/lib/utils';

interface WarTickerProps {
  /**
   * Fight pairs exactly as `/api/v1/boards/[cat]` returns them. The ticker
   * renders nothing when the list is empty — there is no filler state.
   */
  fights?: FightPair[];
}

export const WarTicker: React.FC<WarTickerProps> = ({ fights = [] }) => {
  if (fights.length === 0) return null;

  return (
    <div className="w-full border-b border-line bg-black/30 backdrop-blur-md py-1.5 px-4">
      <div className="max-w-6xl mx-auto flex items-center gap-4 tape text-ink-2">
        <div className="micro-label text-down flex items-center gap-1.5 shrink-0">
          <span className="led led-down" aria-hidden />
          <span>Live fights</span>
        </div>

        <div className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-3 min-w-0">
          {fights.map((fight, idx) => (
            <React.Fragment key={fight.id ?? idx}>
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
                  #{fight.post_a.rank} {fight.post_a.title.slice(0, 32)}
                  {fight.post_a.title.length > 32 ? '…' : ''}
                </span>
                <span className="tnum text-gold-text">{formatScore(fight.post_a.display_score)}</span>

                <Swords className="w-3 h-3 text-down shrink-0" aria-hidden />

                <span className="text-ink font-medium">
                  #{fight.post_b.rank} {fight.post_b.title.slice(0, 32)}
                  {fight.post_b.title.length > 32 ? '…' : ''}
                </span>
                <span className="tnum text-gold-text">{formatScore(fight.post_b.display_score)}</span>

                {fight.lead_changes_24h > 0 && (
                  <span className="chip text-down">
                    {fight.lead_changes_24h} lead {fight.lead_changes_24h === 1 ? 'change' : 'changes'} (24h)
                  </span>
                )}
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

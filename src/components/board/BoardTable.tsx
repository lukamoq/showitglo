'use client';

import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { RankedPostView } from '@/lib/types';
import { BoardRow } from './BoardRow';
import { TapPriceToggle } from '../interactions/TapPriceToggle';

interface BoardTableProps {
  board: RankedPostView[];
  onBoost: (post: RankedPostView) => void;
  onCounter: (post: RankedPostView) => void;
  onLikeExecuted?: () => void;
  onInsufficientFunds?: (shortfallCents: number) => void;
  pulsingPostId?: string | null;
}

/* Labels carry the filter; icons on every tab were decoration competing with
   the rank column for attention. */
const TABS = [
  { key: 'all', label: 'All stances' },
  { key: 'demands', label: 'Companies & institutions' },
  { key: 'opinions', label: 'Uncensored opinions' },
  { key: 'most_backed', label: 'Most backed' },
  { key: 'fights', label: 'Counter fights' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export const BoardTable: React.FC<BoardTableProps> = ({
  board,
  onBoost,
  onCounter,
  onLikeExecuted,
  onInsufficientFunds,
  pulsingPostId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('all');

  const filteredBoard = useMemo(() => {
    let list = [...board];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.author_display.toLowerCase().includes(q) ||
          (p.demand_target && p.demand_target.toLowerCase().includes(q)) ||
          (p.body && p.body.toLowerCase().includes(q))
      );
    }

    if (activeTab === 'demands') {
      list = list.filter((p) => p.kind === 'demand' || Boolean(p.demand_target));
    } else if (activeTab === 'opinions') {
      list = list.filter((p) => p.kind === 'opinion' && !p.demand_target);
    } else if (activeTab === 'most_backed') {
      list.sort((a, b) => b.backers_count - a.backers_count);
    } else if (activeTab === 'fights') {
      list = list.filter((p) => p.counter_of !== null && p.counter_of !== undefined);
    }

    return list;
  }, [board, searchQuery, activeTab]);

  return (
    <div id="board-table" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
      {/* One slab: toolbar, column rule, ruled rows. Never floating cards. */}
      <div className="panel rounded-card overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-line">
          <div className="seg w-full sm:w-auto overflow-x-auto no-scrollbar">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                aria-pressed={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`seg-item ${activeTab === tab.key ? 'seg-item-active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 sunken rounded-control px-2.5 h-9 w-full sm:w-60 focus-within:border-gold/50">
            <Search className="w-3.5 h-3.5 shrink-0 text-ink-3" aria-hidden />
            <input
              id="board-search"
              type="search"
              aria-label="Search stances, brands, and entities"
              placeholder="Search the board…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-dense text-ink placeholder:text-ink-3 outline-none"
            />
          </div>
        </div>

        {/* Its own hairline row: in the row above it squeezed the filter tabs
            into an ellipsis, and it belongs to the Back-it column rather than
            to filtering anyway. */}
        <div className="px-4 sm:px-5 py-2.5 border-b border-line bg-white/[0.015]">
          <TapPriceToggle />
        </div>

        {/* Column rule — states the row grammar once instead of on every row. */}
        <div className="hidden lg:grid lg:grid-cols-[3rem_1fr_7rem_15rem] gap-6 items-center px-4 sm:px-5 py-2 border-b border-line bg-white/[0.015]">
          <div className="micro-label text-ink-3 text-right">Rank</div>
          <div className="micro-label text-ink-3">Stance</div>
          <div className="micro-label text-ink-3 text-right">Score</div>
          <div className="micro-label text-ink-3 text-right">Back it</div>
        </div>

        {filteredBoard.length > 0 ? (
          <div className="divide-y divide-line">
            {filteredBoard.map((post) => (
              <BoardRow
                key={post.id}
                post={post}
                onBoost={onBoost}
                onCounter={onCounter}
                onLikeExecuted={onLikeExecuted}
                onInsufficientFunds={onInsufficientFunds}
                isPulsing={pulsingPostId === post.id}
              />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center">
            <p className="text-dense text-ink-3">No stances match your search or filter.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveTab('all');
              }}
              className="btn btn-ghost btn-sm mt-4"
            >
              Reset filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

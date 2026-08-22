'use client';

import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { RankedPostView } from '@/lib/types';
import { BoardRow } from './BoardRow';

interface BoardTableProps {
  board: RankedPostView[];
  onBoost: (post: RankedPostView) => void;
  onCounter: (post: RankedPostView) => void;
  onLikeExecuted?: () => void;
  onInsufficientFunds?: () => void;
  pulsingPostId?: string | null;
}

const TABS = [
  { key: 'all', label: 'Global Arena' },
  { key: 'top10', label: 'Top 10' },
  { key: 'most_backed', label: 'Most Backed' },
  { key: 'fights', label: 'Counter Fights' },
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
          (p.body && p.body.toLowerCase().includes(q))
      );
    }

    if (activeTab === 'top10') {
      list = list.slice(0, 10);
    } else if (activeTab === 'most_backed') {
      list.sort((a, b) => b.backers_count - a.backers_count);
    } else if (activeTab === 'fights') {
      list = list.filter((p) => p.counter_of !== null && p.counter_of !== undefined);
    }

    return list;
  }, [board, searchQuery, activeTab]);

  return (
    <div id="board-table" className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
      {/* Controls bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
        <div className="seg overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`seg-item ${activeTab === tab.key ? 'seg-item-active' : ''}`}
            >
              {tab.label}
              {tab.key === 'all' && (
                <span className="tnum text-micro opacity-70">{board.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px] sm:w-72">
          <Search className="w-4 h-4 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search the record…"
            className="field pl-9 text-dense py-2"
          />
        </div>
      </div>

      {/* The ledger */}
      {filteredBoard.length > 0 ? (
        <div className="panel rounded-card overflow-hidden">
          {/* Column header */}
          <div className="hidden lg:grid grid-cols-[3.5rem_1fr_auto] gap-4 items-center px-5 py-2.5 border-b border-line bg-black/20">
            <span className="micro-label text-ink-3 text-right pr-1">Rank</span>
            <span className="micro-label text-ink-3">Statement · On the permanent record</span>
            <span className="micro-label text-ink-3 text-right pr-[13.5rem]">Score</span>
          </div>

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
        </div>
      ) : (
        <div className="panel rounded-card p-14 text-center">
          <h3 className="text-base font-semibold text-ink">Nothing on the record matches</h3>
          <p className="text-dense text-ink-3 mt-1.5 max-w-sm mx-auto">
            Clear the filter — or be the first to put a stance on the board.
          </p>
        </div>
      )}
    </div>
  );
};

'use client';

import React, { useState, useMemo } from 'react';
import { Search, Building2, Mic, Flame, Swords, Sparkles } from 'lucide-react';
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
  { key: 'all', label: 'All Stances', icon: Sparkles },
  { key: 'demands', label: 'Companies & Institutions', icon: Building2 },
  { key: 'opinions', label: 'Uncensored Opinions', icon: Mic },
  { key: 'most_backed', label: 'Most Backed', icon: Flame },
  { key: 'fights', label: 'Counter Fights', icon: Swords },
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
    <div id="board-table" className="w-full space-y-4">
      {/* Search and Navigation Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 glass-panel p-2 sm:p-2.5 rounded-2xl border border-white/10">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === tab.key
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Search stances, brands, entities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl glass-card text-xs text-white placeholder-slate-500 border border-white/10 focus:outline-none focus:border-amber-400/50"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      {/* Board Rows List */}
      <div className="space-y-3">
        {filteredBoard.length > 0 ? (
          filteredBoard.map((post) => (
            <BoardRow
              key={post.id}
              post={post}
              onBoost={onBoost}
              onCounter={onCounter}
              onLikeExecuted={onLikeExecuted}
              onInsufficientFunds={onInsufficientFunds}
              isPulsing={pulsingPostId === post.id}
            />
          ))
        ) : (
          <div className="text-center py-16 glass-panel rounded-3xl border border-white/10">
            <p className="text-slate-400 text-sm">No stances match your search or filter.</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setActiveTab('all');
              }}
              className="mt-3 text-xs text-amber-400 hover:underline font-bold"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

'use client';

import React from 'react';
import Link from 'next/link';
import { Crown, Sparkles, TrendingUp, TrendingDown, Zap, ShieldCheck, Flame, Users, Swords, Megaphone, CheckCircle2, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { RankedPostView } from '@/lib/types';
import { formatScore, formatCents } from '@/lib/utils';
import { HoldToLikeButton } from '../interactions/HoldToLikeButton';

interface BoardRowProps {
  post: RankedPostView;
  onBoost: (post: RankedPostView) => void;
  onCounter: (post: RankedPostView) => void;
  onLikeExecuted?: () => void;
  onInsufficientFunds?: () => void;
  isPulsing?: boolean;
}

export const BoardRow: React.FC<BoardRowProps> = ({
  post,
  onBoost,
  onCounter,
  onLikeExecuted,
  onInsufficientFunds,
  isPulsing = false,
}) => {
  const isRank1 = post.rank === 1;
  const isRank2 = post.rank === 2;
  const isRank3 = post.rank === 3;
  const isTop3 = post.rank <= 3;

  return (
    <div
      className={`relative group rounded-2xl p-4 sm:p-5 transition-all duration-300 ${
        isRank1
          ? 'glass-card border-amber-500/50 shadow-xl shadow-amber-500/10 bg-gradient-to-r from-amber-950/30 via-slate-900/70 to-amber-950/30'
          : isRank2
          ? 'glass-card border-slate-300/40 bg-slate-900/70'
          : isRank3
          ? 'glass-card border-amber-700/40 bg-slate-900/70'
          : 'glass-card border-white/10 hover:border-white/20 bg-slate-950/50'
      } ${isPulsing ? 'ring-2 ring-amber-400 animate-pulse-gold' : ''}`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Rank badge + Opinion / Demand statement */}
        <div className="flex items-start gap-3.5 flex-1 min-w-0">
          {/* Rank Badge */}
          <div
            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 font-mono font-black shadow-inner ${
              isRank1
                ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-black shadow-amber-400/50'
                : isRank2
                ? 'bg-gradient-to-b from-slate-200 to-slate-400 text-black'
                : isRank3
                ? 'bg-gradient-to-b from-amber-600 to-amber-800 text-white'
                : 'glass-segmented text-slate-300 text-base'
            }`}
          >
            {isRank1 ? (
              <>
                <Crown className="w-3.5 h-3.5 -mb-0.5 text-black" />
                <span className="text-base leading-none">#1</span>
              </>
            ) : (
              <span className="text-base">#{post.rank}</span>
            )}
          </div>

          {/* Title & Stance Metadata */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Link
                href={`/p/${post.slug}`}
                className="font-bold text-base sm:text-lg text-white hover:text-amber-300 transition-colors line-clamp-1 group-hover:underline underline-offset-2"
              >
                {post.title}
              </Link>

              {post.source_url && (
                <a
                  href={post.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-mono font-bold flex items-center gap-1 hover:bg-purple-500/30 transition-colors"
                  title={`Original link: ${post.source_url}`}
                >
                  <LinkIcon className="w-3 h-3 text-purple-400" />
                  <span>Linked: {post.source_platform?.toUpperCase() || 'EXTERNAL'}</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                </a>
              )}

              {post.kind === 'demand' && (
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                  <Megaphone className="w-3 h-3 text-cyan-400" />
                  Demand: @{post.demand_target || 'Brand'}
                </span>
              )}

              {post.brand_response && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  Official Brand Answer
                </span>
              )}

              {post.streak_days > 0 && isRank1 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-semibold flex items-center gap-1">
                  <Flame className="w-3 h-3 text-amber-400" />
                  Held #1 for {post.streak_days}d
                </span>
              )}

              {post.counter_of && (
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                  <Swords className="w-3 h-3" />
                  Counter Rebuttal
                </span>
              )}

              {post.rank_24h_delta !== 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold flex items-center gap-0.5 ${
                    post.rank_24h_delta > 0
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {post.rank_24h_delta > 0 ? (
                    <>
                      <TrendingUp className="w-2.5 h-2.5" />+{post.rank_24h_delta}
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-2.5 h-2.5" />
                      {post.rank_24h_delta}
                    </>
                  )}
                </span>
              )}
            </div>

            {/* Author, Dual Backers Metric & Actions */}
            <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
              <span className="flex items-center gap-1 text-slate-300 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                {post.author_display}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-cyan-300 font-mono font-semibold">
                <Users className="w-3 h-3 text-cyan-400" />
                {post.backers_count.toLocaleString()} backers
              </span>
              <span>•</span>
              <span className="text-slate-400 font-mono">
                {formatCents(post.total_raised_cents)} raised
              </span>
            </div>
          </div>
        </div>

        {/* Right: Dual Score Metric + Interaction Ladder Controls */}
        <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-white/5">
          <div className="text-left lg:text-right pr-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Decayed Score
            </div>
            <div
              className={`text-xl sm:text-2xl font-black font-mono tracking-tight tabular-nums ${
                isRank1 ? 'text-amber-400' : isTop3 ? 'text-slate-100' : 'text-slate-300'
              }`}
            >
              {formatScore(post.display_score)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <HoldToLikeButton
              postId={post.id}
              initialLikes={post.like_units}
              onLikeExecuted={onLikeExecuted}
              onInsufficientFunds={onInsufficientFunds}
            />

            <button
              onClick={() => onBoost(post)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shadow-md ${
                isRank1 ? 'btn-glass-gold' : 'btn-glass-cyan'
              }`}
              title="Boost or power-boost"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Boost</span>
            </button>

            <button
              onClick={() => onCounter(post)}
              className="px-2.5 py-1.5 rounded-xl glass-card border border-rose-500/30 hover:border-rose-500/60 text-rose-400 hover:text-rose-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
              title="Launch counter-opinion rebuttal"
            >
              <Swords className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Counter</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

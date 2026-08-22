'use client';

import React from 'react';
import Link from 'next/link';
import { Crown, TrendingUp, TrendingDown, Zap, Flame, Swords, Megaphone, CheckCircle2, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { RankedPostView } from '@/lib/types';
import { formatScore, formatCents } from '@/lib/utils';
import { HoldToLikeButton } from '../interactions/HoldToLikeButton';

interface BoardRowProps {
  post: RankedPostView;
  onBoost: (post: RankedPostView) => void;
  onCounter: (post: RankedPostView) => void;
  onLikeExecuted?: () => void;
  onInsufficientFunds?: (shortfallCents: number) => void;
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

  // Top-3 carry a left spine instead of full golden card treatments
  const spine = isRank1
    ? 'bg-gold'
    : isRank2
    ? 'bg-white/25'
    : isRank3
    ? 'bg-gold-deep/60'
    : null;

  return (
    <div
      className={`relative group px-4 sm:px-5 py-4 transition-colors duration-200 hover:bg-white/[0.04] ${
        isRank1 ? 'bg-gold/[0.045]' : ''
      } ${isPulsing ? 'bg-gold/[0.09]' : ''}`}
    >
      {spine && <span aria-hidden className={`absolute left-0 top-0 bottom-0 w-[3px] ${spine}`} />}

      <div className="flex flex-col lg:grid lg:grid-cols-[3.5rem_1fr_auto] gap-3 lg:gap-4 lg:items-center">
        {/* Rank */}
        <div className="flex items-center lg:justify-end gap-2 shrink-0">
          {isRank1 && <Crown className="w-3.5 h-3.5 text-gold-text" aria-hidden />}
          <span
            className={`metric text-xl leading-none ${
              isRank1 ? 'text-gold-text' : post.rank <= 3 ? 'text-ink' : 'text-ink-3'
            }`}
          >
            {post.rank}
          </span>
        </div>

        {/* Statement */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/p/${post.slug}`}
              className="font-semibold text-[15px] sm:text-base text-ink hover:text-gold-text transition-colors line-clamp-1 underline-offset-4 hover:underline"
            >
              {post.title}
            </Link>

            {post.source_url && (
              <a
                href={post.source_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="chip text-steel hover:text-ink-2 transition-colors"
                title={`Original link: ${post.source_url}`}
              >
                <LinkIcon className="w-3 h-3" />
                <span>{post.source_platform?.toUpperCase() || 'EXTERNAL'}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-70" />
              </a>
            )}

            {post.kind === 'demand' && (
              <span className="chip text-info">
                <Megaphone className="w-3 h-3" />
                Demand @{post.demand_target || 'Brand'}
              </span>
            )}

            {post.brand_response && (
              <span className="chip text-up">
                <CheckCircle2 className="w-3 h-3" />
                Brand answered
              </span>
            )}

            {post.streak_days > 0 && isRank1 && (
              <span className="chip text-gold-text">
                <Flame className="w-3 h-3" />
                #1 for {post.streak_days}d
              </span>
            )}

            {post.counter_of && (
              <span className="chip text-down">
                <Swords className="w-3 h-3" />
                Counter
              </span>
            )}

            {post.rank_24h_delta !== 0 && (
              <span className={`chip ${post.rank_24h_delta > 0 ? 'text-up' : 'text-down'}`}>
                {post.rank_24h_delta > 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {post.rank_24h_delta > 0 ? `+${post.rank_24h_delta}` : post.rank_24h_delta}
              </span>
            )}
          </div>

          <div className="mt-1 flex items-center gap-2 text-meta text-ink-3 flex-wrap">
            <span className="text-ink-2 font-medium">{post.author_display}</span>
            <span aria-hidden className="text-ink-3/50">·</span>
            <span className="tnum">{post.backers_count.toLocaleString()} backers</span>
            <span aria-hidden className="text-ink-3/50">·</span>
            <span className="tnum">{formatCents(post.total_raised_cents)} raised</span>
          </div>
        </div>

        {/* Score + actions */}
        <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-line">
          <div className="text-left lg:text-right">
            <div className="micro-label text-ink-3">Score</div>
            <div className={`metric text-lg sm:text-xl leading-tight ${isRank1 ? 'text-gold-text' : 'text-ink'}`}>
              {formatScore(post.display_score)}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <HoldToLikeButton
              postId={post.id}
              initialLikes={post.like_units}
              onLikeExecuted={onLikeExecuted}
              onInsufficientFunds={onInsufficientFunds}
              onLikeCapReached={() => onBoost(post)}
            />

            <button
              type="button"
              onClick={() => onBoost(post)}
              className="btn btn-ghost btn-xs text-gold-text hover:border-gold/40"
              title="Boost or power-boost"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Boost</span>
            </button>

            <button
              type="button"
              onClick={() => onCounter(post)}
              className="btn btn-ghost btn-xs text-down hover:border-down/40"
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

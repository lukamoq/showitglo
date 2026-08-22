'use client';

import React from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Flame,
  Swords,
  Megaphone,
  CheckCircle2,
  Link as LinkIcon,
} from 'lucide-react';
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
  const delta = post.rank_24h_delta;

  return (
    <div
      className={`relative group px-4 sm:px-5 py-4 transition-colors duration-200 hover:bg-white/[0.03] ${
        isRank1 ? 'bg-gold/[0.035]' : ''
      } ${isPulsing ? 'bg-gold/[0.09]' : ''}`}
    >
      {/* Only the leader is marked. A spine on the top three turned the ledger
          into a stack of accented cards. */}
      {isRank1 && <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[2px] bg-gold" />}

      <div className="flex flex-col lg:grid lg:grid-cols-[3rem_1fr_7rem_15rem] gap-3 lg:gap-6 lg:items-center">
        {/* Rank — the 24h move rides alongside it instead of becoming a chip. */}
        <div className="flex items-baseline lg:justify-end gap-1.5 shrink-0">
          <span
            className={`metric text-xl leading-none ${isRank1 ? 'text-gold-text' : 'text-ink-2'}`}
          >
            {post.rank}
          </span>
          {delta !== 0 && (
            <span
              className={`flex items-center gap-0.5 text-micro font-semibold tnum ${
                delta > 0 ? 'text-up' : 'text-down'
              }`}
              title={`${delta > 0 ? 'Up' : 'Down'} ${Math.abs(delta)} in 24h`}
            >
              {delta > 0 ? (
                <TrendingUp className="w-3 h-3" aria-hidden />
              ) : (
                <TrendingDown className="w-3 h-3" aria-hidden />
              )}
              {Math.abs(delta)}
              <span className="sr-only">
                {delta > 0 ? 'up' : 'down'} {Math.abs(delta)} places in 24 hours
              </span>
            </span>
          )}
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

            {post.kind === 'demand' && (
              <span className="chip text-steel">
                <Megaphone className="w-3 h-3" aria-hidden />
                @{post.demand_target || 'Brand'}
              </span>
            )}

            {post.counter_of && (
              <span className="chip text-down">
                <Swords className="w-3 h-3" aria-hidden />
                Counter
              </span>
            )}

            {post.brand_response && (
              <span className="chip text-up">
                <CheckCircle2 className="w-3 h-3" aria-hidden />
                Answered
              </span>
            )}

            {post.streak_days > 0 && isRank1 && (
              <span className="chip text-gold-text">
                <Flame className="w-3 h-3" aria-hidden />
                #1 for {post.streak_days}d
              </span>
            )}
          </div>

          {/* Meta rail — the external source lives here as a quiet link rather
              than a fourth chip beside the title. */}
          <div className="mt-1 flex items-center gap-2 text-meta text-ink-3 flex-wrap">
            <span className="text-ink-2 font-medium">{post.author_display}</span>
            <span aria-hidden className="text-ink-3/40">·</span>
            <span className="tnum">{post.backers_count.toLocaleString()} backer{post.backers_count === 1 ? '' : 's'}</span>
            <span aria-hidden className="text-ink-3/40">·</span>
            <span className="tnum">{formatCents(post.total_raised_cents)} raised</span>
            {post.source_url && (
              <>
                <span aria-hidden className="text-ink-3/40">·</span>
                <a
                  href={post.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 hover:text-ink-2 transition-colors underline-offset-4 hover:underline"
                  title={`Original link: ${post.source_url}`}
                >
                  <LinkIcon className="w-3 h-3" aria-hidden />
                  {post.source_platform?.toLowerCase() || 'source'}
                </a>
              </>
            )}
          </div>
        </div>

        {/* Score — the column rule names it, so the row does not repeat itself. */}
        <div className="flex items-baseline gap-2 lg:block lg:text-right">
          <span className="micro-label text-ink-3 lg:hidden">Score</span>
          <span className={`metric text-lg tnum ${isRank1 ? 'text-gold-text' : 'text-ink'}`}>
            {formatScore(post.display_score)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 lg:justify-end shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-line">
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
            <Zap className="w-3.5 h-3.5" aria-hidden />
            <span>Boost</span>
          </button>

          <button
            type="button"
            onClick={() => onCounter(post)}
            className="btn btn-bare btn-xs"
            title="Launch counter-opinion rebuttal"
            aria-label={`Counter “${post.title}” with a rebuttal`}
          >
            <Swords className="w-3.5 h-3.5" aria-hidden />
            <span className="hidden sm:inline" aria-hidden>
              Counter
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

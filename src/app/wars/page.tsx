'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { BoostDrawer } from '@/components/boost/BoostDrawer';
import { FightPair, RankedPostView } from '@/lib/types';
import { formatUSD } from '@/lib/utils';
import { AlertCircle, Plus, RefreshCw, Swords, Zap } from 'lucide-react';
import Link from 'next/link';
import { HoldToLikeButton } from '@/components/interactions/HoldToLikeButton';
import { WalletTopUpModal } from '@/components/wallet/WalletTopUpModal';
import { CreateWarPostModal } from '@/components/wars/CreateWarPostModal';
import { apiGet, errorText, recommendedTopUpCents } from '@/components/system/api';
import { useWallet } from '@/components/system/useWallet';

export default function WarsPage() {
  const [fights, setFights] = useState<FightPair[]>([]);
  const [selectedPost, setSelectedPost] = useState<RankedPostView | null>(null);
  const [isBoostOpen, setIsBoostOpen] = useState(false);
  const [isCreateWarOpen, setIsCreateWarOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpRecommendation, setTopUpRecommendation] = useState<number | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { balanceCents, refresh: refreshWallet } = useWallet();

  const fetchFights = useCallback(async () => {
    const res = await apiGet<{ fights: FightPair[] }>('/api/v1/fights');
    setIsLoading(false);
    if (!res.ok || !res.data?.fights) {
      setLoadError(errorText(res, 'Live fights could not be loaded.'));
      return;
    }
    setLoadError(null);
    setFights(res.data.fights);
  }, []);

  useEffect(() => {
    void fetchFights();
  }, [fetchFights]);

  const handleBoostPost = (post: RankedPostView) => {
    setSelectedPost(post);
    setIsBoostOpen(true);
  };

  const openTopUpFor = (shortfallCents: number) => {
    setTopUpRecommendation(recommendedTopUpCents(shortfallCents));
    setIsTopUpOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden">
      <Navbar />

      <div className="flex-1 w-full">
        {/* Header */}
        <div className="pt-14 pb-10 sm:pt-20 sm:pb-12">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <span className="kicker">Rebuttals &amp; rivalries</span>

            <h1 className="display-2 text-ink mt-4">Live opinion fights</h1>

            <p className="lead mt-4">
              Disagreement is expressed by elevating counter-opinions.{' '}
              <span className="tnum">Back your side with a 1¢ like</span> or a power boost to win
              the front page.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setIsCreateWarOpen(true)} className="btn btn-gold">
                <Plus className="w-4 h-4" aria-hidden />
                <span>Post a war</span>
              </button>
              <span className="text-meta text-ink-3">Two rival stances, published at once.</span>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          {/* Fights ledger */}
          {loadError ? (
            <div className="panel rounded-card p-10 text-center max-w-md mx-auto">
              <AlertCircle className="w-7 h-7 text-down mx-auto mb-3" aria-hidden />
              <p role="alert" className="text-dense text-ink-2">
                {loadError}
              </p>
              <button type="button" onClick={() => void fetchFights()} className="btn btn-ghost btn-sm mt-5">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          ) : isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-40 w-full rounded-card" />
              ))}
            </div>
          ) : fights.length > 0 ? (
            <div className="panel rounded-card overflow-hidden animate-rise">
              <div className="px-4 sm:px-6 py-3 border-b border-line flex items-center justify-between gap-3">
                <span className="kicker">Active fight pairs</span>
                <span className="text-meta text-ink-3 tnum">{fights.length} on the board</span>
              </div>

              <div className="divide-y divide-line">
                {fights.map((fight) => {
                  const totalScore = fight.post_a.display_score + fight.post_b.display_score;
                  const pctA = totalScore > 0 ? Math.round((fight.post_a.display_score / totalScore) * 100) : 50;
                  const pctB = 100 - pctA;
                  const aLeads = fight.post_a.display_score >= fight.post_b.display_score;

                  return (
                    <div
                      key={fight.id}
                      className="px-4 sm:px-6 py-5 transition-colors duration-200 hover:bg-white/[0.03]"
                    >
                      {/* Fight meta */}
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 flex-wrap text-meta text-ink-3">
                          <span className="micro-label text-ink-3 tnum">
                            Battle for rank #{Math.min(fight.post_a.rank || 1, fight.post_b.rank || 2)}
                          </span>
                          <span aria-hidden className="text-ink-3/40">·</span>
                          <span className="tnum">
                            {fight.lead_changes_24h} lead{' '}
                            {fight.lead_changes_24h === 1 ? 'change' : 'changes'} in 24h
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="led led-down" aria-hidden />
                          <span className="micro-label text-ink-3">Live</span>
                        </div>
                      </div>

                      {/* Tug-of-war meter. The side in front carries the gold —
                          the same signal rank #1 uses — so the bar reads as a
                          scoreboard rather than a good-side / bad-side verdict. */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between gap-3">
                          <span
                            className={`micro-label tnum ${aLeads ? 'text-gold-text' : 'text-ink-3'}`}
                          >
                            Side A · {pctA}%
                          </span>
                          <span
                            className={`micro-label tnum ${aLeads ? 'text-ink-3' : 'text-gold-text'}`}
                          >
                            {pctB}% · Side B
                          </span>
                        </div>

                        <div className="mt-2 flex h-2 rounded-[3px] sunken overflow-hidden gap-px p-px">
                          <div
                            style={{ width: `${pctA}%` }}
                            className={`h-full transition-[width] duration-500 ${
                              aLeads ? 'bg-gold' : 'bg-ink/25'
                            }`}
                          />
                          <div
                            style={{ width: `${pctB}%` }}
                            className={`h-full transition-[width] duration-500 ${
                              aLeads ? 'bg-ink/25' : 'bg-gold'
                            }`}
                          />
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-3 text-meta text-ink-3">
                          <span className="tnum">{fight.post_a.backers_count} backer{fight.post_a.backers_count === 1 ? '' : 's'}</span>
                          <span className="tnum">{fight.post_b.backers_count} backer{fight.post_b.backers_count === 1 ? '' : 's'}</span>
                        </div>
                      </div>

                      {/* Side A vs Side B */}
                      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
                        {/* Side A */}
                        <div className="relative pl-4">
                          <span
                            aria-hidden
                            className={`absolute left-0 top-0 bottom-0 w-[2px] ${
                              aLeads ? 'bg-gold' : 'bg-ink/20'
                            }`}
                          />

                          <div className="flex items-baseline justify-between gap-3">
                            <span className="micro-label text-ink-3 tnum">
                              Rank #{fight.post_a.rank}
                            </span>
                            <span
                              className={`metric text-lg tnum leading-none ${
                                aLeads ? 'text-gold-text' : 'text-ink'
                              }`}
                            >
                              {formatUSD(fight.post_a.display_score)}
                            </span>
                          </div>

                          <Link
                            href={`/p/${fight.post_a.slug}`}
                            className="mt-2 block font-semibold text-[15px] text-ink hover:text-gold-text transition-colors line-clamp-2 underline-offset-4 hover:underline"
                          >
                            {fight.post_a.title}
                          </Link>

                          <div className="mt-1 flex items-center gap-2 text-meta text-ink-3 flex-wrap">
                            <span className="text-ink-2 font-medium">{fight.post_a.author_display}</span>
                            <span aria-hidden className="text-ink-3/50">·</span>
                            <span className="tnum">{fight.post_a.backers_count} backer{fight.post_a.backers_count === 1 ? '' : 's'}</span>
                          </div>

                          <div className="mt-3 flex items-center gap-2 pt-3 border-t border-line">
                            <HoldToLikeButton
                              postId={fight.post_a.id}
                              initialLikes={fight.post_a.like_units}
                              onLikeExecuted={() => {
                                void fetchFights();
                                void refreshWallet();
                              }}
                              onInsufficientFunds={openTopUpFor}
                              onLikeCapReached={() => handleBoostPost(fight.post_a)}
                            />
                            <button
                              type="button"
                              onClick={() => handleBoostPost(fight.post_a)}
                              className="btn btn-ghost btn-xs"
                            >
                              <Zap className="w-3.5 h-3.5" />
                              <span>Back Side A</span>
                            </button>
                          </div>
                        </div>

                        {/* Side B */}
                        <div className="relative pl-4">
                          <span
                            aria-hidden
                            className={`absolute left-0 top-0 bottom-0 w-[2px] ${
                              aLeads ? 'bg-ink/20' : 'bg-gold'
                            }`}
                          />

                          <div className="flex items-baseline justify-between gap-3">
                            <span className="micro-label text-ink-3 tnum">
                              Rank #{fight.post_b.rank}
                            </span>
                            <span
                              className={`metric text-lg tnum leading-none ${
                                aLeads ? 'text-ink' : 'text-gold-text'
                              }`}
                            >
                              {formatUSD(fight.post_b.display_score)}
                            </span>
                          </div>

                          <Link
                            href={`/p/${fight.post_b.slug}`}
                            className="mt-2 block font-semibold text-[15px] text-ink hover:text-gold-text transition-colors line-clamp-2 underline-offset-4 hover:underline"
                          >
                            {fight.post_b.title}
                          </Link>

                          <div className="mt-1 flex items-center gap-2 text-meta text-ink-3 flex-wrap">
                            <span className="text-ink-2 font-medium">{fight.post_b.author_display}</span>
                            <span aria-hidden className="text-ink-3/50">·</span>
                            <span className="tnum">{fight.post_b.backers_count} backer{fight.post_b.backers_count === 1 ? '' : 's'}</span>
                          </div>

                          <div className="mt-3 flex items-center gap-2 pt-3 border-t border-line">
                            <HoldToLikeButton
                              postId={fight.post_b.id}
                              initialLikes={fight.post_b.like_units}
                              onLikeExecuted={() => {
                                void fetchFights();
                                void refreshWallet();
                              }}
                              onInsufficientFunds={openTopUpFor}
                              onLikeCapReached={() => handleBoostPost(fight.post_b)}
                            />
                            <button
                              type="button"
                              onClick={() => handleBoostPost(fight.post_b)}
                              className="btn btn-ghost btn-xs"
                            >
                              <Zap className="w-3.5 h-3.5" />
                              <span>Back Side B</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="panel rounded-card p-12 text-center max-w-xl mx-auto animate-rise">
              <Swords className="w-8 h-8 text-ink-3 mx-auto mb-3" aria-hidden />
              <h2 className="text-xl font-bold tracking-tight text-ink">No active fights declared</h2>
              <p className="text-dense text-ink-3 mt-2 max-w-[46ch] mx-auto leading-relaxed">
                Post both sides of an argument at once, or launch a rebuttal to any opinion on the
                board — either way you get a head-to-head fight pair.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button type="button" onClick={() => setIsCreateWarOpen(true)} className="btn btn-gold">
                  <Plus className="w-4 h-4" aria-hidden />
                  <span>Post a war</span>
                </button>
                <Link href="/" className="btn btn-ghost">
                  Explore the arena board
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <CreateWarPostModal
        isOpen={isCreateWarOpen}
        onClose={() => setIsCreateWarOpen(false)}
        onWarCreated={() => {
          void fetchFights();
          void refreshWallet();
        }}
      />

      <BoostDrawer
        post={selectedPost}
        isOpen={isBoostOpen}
        onClose={() => setIsBoostOpen(false)}
        onSuccess={() => {
          void fetchFights();
          void refreshWallet();
        }}
      />

      <WalletTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => {
          setIsTopUpOpen(false);
          void refreshWallet();
        }}
        currentBalanceCents={balanceCents}
        onTopUpSuccess={() => {
          void refreshWallet();
          setIsTopUpOpen(false);
        }}
        recommendedCents={topUpRecommendation}
      />
    </div>
  );
}

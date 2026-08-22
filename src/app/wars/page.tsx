'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { BoostDrawer } from '@/components/boost/BoostDrawer';
import { FightPair, RankedPostView } from '@/lib/types';
import { formatUSD } from '@/lib/utils';
import { Swords, Zap } from 'lucide-react';
import Link from 'next/link';
import { HoldToLikeButton } from '@/components/interactions/HoldToLikeButton';
import { WalletTopUpModal } from '@/components/wallet/WalletTopUpModal';

export default function WarsPage() {
  const [fights, setFights] = useState<FightPair[]>([]);
  const [selectedPost, setSelectedPost] = useState<RankedPostView | null>(null);
  const [isBoostOpen, setIsBoostOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  const fetchFights = async () => {
    try {
      const res = await fetch('/api/v1/fights');
      const data = await res.json();
      if (data.fights) setFights(data.fights);
    } catch (err) {
      console.error('Error loading fights:', err);
    }
  };

  useEffect(() => {
    fetchFights();
  }, []);

  const handleBoostPost = (post: RankedPostView) => {
    setSelectedPost(post);
    setIsBoostOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden">
      <Navbar />

      <div className="flex-1 w-full">
        {/* Header */}
        <div className="relative pt-10 pb-8 sm:pt-14 sm:pb-10">
          <div className="orb orb-gold -top-64 -left-40 opacity-70" aria-hidden />

          <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="kicker kicker-gold flex items-center gap-2">
              <Swords className="w-4 h-4" aria-hidden />
              <span>The fight arena · Rebuttals &amp; rivalries</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-ink mt-3">Live Opinion Fights</h1>

            <p className="text-[15px] text-ink-2 leading-relaxed max-w-[62ch] mt-3">
              Disagreement is expressed by elevating counter-opinions.{' '}
              <span className="tnum">Back your side with a 1¢ like</span> or a power boost to win
              the front page.
            </p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          {/* Fights ledger */}
          {fights.length > 0 ? (
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="chip text-down">
                            <Swords className="w-3 h-3" />
                            <span className="tnum">{fight.lead_changes_24h}</span> lead changes · 24h
                          </span>
                          <span className="chip text-steel">
                            Battle for rank #{Math.min(fight.post_a.rank || 1, fight.post_b.rank || 2)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="led led-down" aria-hidden />
                          <span className="micro-label text-ink-3">Live</span>
                        </div>
                      </div>

                      {/* Tug-of-war strength meter */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="micro-label text-up tnum">Side A · {pctA}%</span>
                          <span className="micro-label text-down tnum">{pctB}% · Side B</span>
                        </div>

                        <div className="mt-1.5 flex h-2 rounded-md sunken overflow-hidden">
                          <div
                            style={{ width: `${pctA}%` }}
                            className="h-full bg-up/75 transition-all duration-500"
                          />
                          <div
                            style={{ width: `${pctB}%` }}
                            className="h-full bg-down/75 transition-all duration-500"
                          />
                        </div>

                        <div className="mt-1.5 flex items-center justify-between gap-3 text-meta text-ink-3">
                          <span className="tnum">{fight.post_a.backers_count} backers</span>
                          <span className="tnum">{fight.post_b.backers_count} backers</span>
                        </div>
                      </div>

                      {/* Side A vs Side B */}
                      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
                        {/* Side A */}
                        <div className="relative pl-4">
                          <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-up" />

                          <div className="flex items-center justify-between gap-3">
                            <span className="chip text-up">Rank #{fight.post_a.rank}</span>
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
                            <span className="tnum">{fight.post_a.backers_count} backers</span>
                          </div>

                          <div className="mt-3 flex items-center gap-2 pt-3 border-t border-line">
                            <HoldToLikeButton
                              postId={fight.post_a.id}
                              initialLikes={fight.post_a.like_units}
                              onLikeExecuted={fetchFights}
                              onInsufficientFunds={() => setIsTopUpOpen(true)}
                            />
                            <button
                              onClick={() => handleBoostPost(fight.post_a)}
                              className="btn btn-ghost btn-xs flex-1 text-up hover:border-up/40"
                            >
                              <Zap className="w-3.5 h-3.5" />
                              <span>Back Side A</span>
                            </button>
                          </div>
                        </div>

                        {/* Side B */}
                        <div className="relative pl-4">
                          <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-down" />

                          <div className="flex items-center justify-between gap-3">
                            <span className="chip text-down">Rank #{fight.post_b.rank}</span>
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
                            <span className="tnum">{fight.post_b.backers_count} backers</span>
                          </div>

                          <div className="mt-3 flex items-center gap-2 pt-3 border-t border-line">
                            <HoldToLikeButton
                              postId={fight.post_b.id}
                              initialLikes={fight.post_b.like_units}
                              onLikeExecuted={fetchFights}
                              onInsufficientFunds={() => setIsTopUpOpen(true)}
                            />
                            <button
                              onClick={() => handleBoostPost(fight.post_b)}
                              className="btn btn-ghost btn-xs flex-1 text-down hover:border-down/40"
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
                Launch a rebuttal to any opinion on the board to initiate a head-to-head fight pair.
              </p>
              <Link href="/" className="btn btn-gold mt-6 inline-flex">
                Explore the arena board
              </Link>
            </div>
          )}
        </div>
      </div>

      <BoostDrawer
        post={selectedPost}
        isOpen={isBoostOpen}
        onClose={() => setIsBoostOpen(false)}
        onSuccess={fetchFights}
      />

      <WalletTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        currentBalanceCents={0}
        onTopUpSuccess={() => {
          fetchFights();
          setIsTopUpOpen(false);
        }}
      />
    </div>
  );
}

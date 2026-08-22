'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { BoostDrawer } from '@/components/boost/BoostDrawer';
import { FightPair, RankedPostView } from '@/lib/types';
import { formatUSD, formatScore } from '@/lib/utils';
import { Flame, Swords, Zap, Users, Heart, ArrowRight, ShieldCheck } from 'lucide-react';
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
    <div className="min-h-screen bg-[#060709] text-white flex flex-col relative overflow-x-hidden">
      <div className="orb-glow-gold top-10 left-1/4 opacity-40" />
      <div className="orb-glow-cyan top-30 right-1/4 opacity-40" />

      <Navbar />

      <div className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-bold uppercase tracking-wider mb-3">
            <Swords className="w-4 h-4 animate-pulse" />
            <span>The Fight Arena • Rebuttals & Rivalries</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Live Opinion Fights
          </h1>
          <p className="mt-3 text-sm text-slate-300">
            Disagreement is expressed by elevating counter-opinions. Back your side with a 1¢ like or power boost to win the front page.
          </p>
        </div>

        {/* Fights List */}
        {fights.length > 0 ? (
          <div className="space-y-8">
            {fights.map((fight) => {
              const totalScore = fight.post_a.display_score + fight.post_b.display_score;
              const pctA = totalScore > 0 ? Math.round((fight.post_a.display_score / totalScore) * 100) : 50;
              const pctB = 100 - pctA;

              return (
                <div
                  key={fight.id}
                  className="glass-panel p-6 sm:p-8 rounded-3xl border border-rose-500/30 shadow-2xl relative overflow-hidden bg-gradient-to-br from-slate-950 via-rose-950/20 to-slate-950"
                >
                  {/* Header Badge */}
                  <div className="flex items-center justify-between pb-4 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-mono font-bold flex items-center gap-1">
                        <Swords className="w-3.5 h-3.5" />
                        {fight.lead_changes_24h} Lead Changes (24h)
                      </span>
                    </div>

                    <span className="text-xs text-slate-400 font-mono">
                      Battle for Rank #{Math.min(fight.post_a.rank || 1, fight.post_b.rank || 2)}
                    </span>
                  </div>

                  {/* Tug-of-War Strength Meter */}
                  <div className="my-6">
                    <div className="flex items-center justify-between text-xs font-mono font-bold mb-2">
                      <span className="text-amber-400 flex items-center gap-1">
                        <span>Side A: {pctA}%</span>
                        <span className="text-slate-400 font-normal">({fight.post_a.backers_count} backers)</span>
                      </span>
                      <span className="text-cyan-400 flex items-center gap-1">
                        <span className="text-slate-400 font-normal">({fight.post_b.backers_count} backers)</span>
                        <span>Side B: {pctB}%</span>
                      </span>
                    </div>

                    <div className="h-4 rounded-full bg-black/60 p-0.5 border border-white/10 flex overflow-hidden shadow-inner">
                      <div
                        style={{ width: `${pctA}%` }}
                        className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-l-full transition-all duration-500"
                      />
                      <div
                        style={{ width: `${pctB}%` }}
                        className="h-full bg-gradient-to-r from-cyan-400 to-cyan-500 rounded-r-full transition-all duration-500"
                      />
                    </div>
                  </div>

                  {/* Side A vs Side B Stance Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Side A */}
                    <div className="p-5 rounded-2xl glass-card border border-amber-500/40 relative flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-xs">
                            Rank #{fight.post_a.rank}
                          </span>
                          <span className="text-base font-black font-mono text-amber-400">
                            {formatUSD(fight.post_a.display_score)}
                          </span>
                        </div>

                        <Link
                          href={`/p/${fight.post_a.slug}`}
                          className="font-bold text-sm sm:text-base text-white hover:text-amber-300 line-clamp-2 block mb-1"
                        >
                          {fight.post_a.title}
                        </Link>
                        <div className="text-xs text-slate-400 flex items-center gap-2 mb-4">
                          <span>By {fight.post_a.author_display}</span>
                          <span>•</span>
                          <span className="text-cyan-300 font-mono">{fight.post_a.backers_count} backers</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-3 border-t border-white/10">
                        <HoldToLikeButton
                          postId={fight.post_a.id}
                          initialLikes={fight.post_a.like_units}
                          onLikeExecuted={fetchFights}
                          onInsufficientFunds={() => setIsTopUpOpen(true)}
                        />
                        <button
                          onClick={() => handleBoostPost(fight.post_a)}
                          className="flex-1 btn-glass-gold py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>Back Side A</span>
                        </button>
                      </div>
                    </div>

                    {/* Side B */}
                    <div className="p-5 rounded-2xl glass-card border border-cyan-500/40 relative flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold text-xs">
                            Rank #{fight.post_b.rank}
                          </span>
                          <span className="text-base font-black font-mono text-cyan-400">
                            {formatUSD(fight.post_b.display_score)}
                          </span>
                        </div>

                        <Link
                          href={`/p/${fight.post_b.slug}`}
                          className="font-bold text-sm sm:text-base text-white hover:text-cyan-300 line-clamp-2 block mb-1"
                        >
                          {fight.post_b.title}
                        </Link>
                        <div className="text-xs text-slate-400 flex items-center gap-2 mb-4">
                          <span>By {fight.post_b.author_display}</span>
                          <span>•</span>
                          <span className="text-cyan-300 font-mono">{fight.post_b.backers_count} backers</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-3 border-t border-white/10">
                        <HoldToLikeButton
                          postId={fight.post_b.id}
                          initialLikes={fight.post_b.like_units}
                          onLikeExecuted={fetchFights}
                          onInsufficientFunds={() => setIsTopUpOpen(true)}
                        />
                        <button
                          onClick={() => handleBoostPost(fight.post_b)}
                          className="flex-1 btn-glass-cyan py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
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
        ) : (
          <div className="glass-panel p-12 rounded-3xl text-center border border-white/10 max-w-xl mx-auto">
            <Swords className="w-10 h-10 text-rose-400 mx-auto mb-3 opacity-60" />
            <h3 className="text-lg font-bold text-white">No Active Fights Declared</h3>
            <p className="text-xs text-slate-400 mt-2">
              Launch a rebuttal to any opinion on the board to initiate a head-to-head fight pair!
            </p>
            <Link href="/" className="mt-5 inline-block btn-glass-gold px-5 py-2.5 rounded-xl text-xs font-bold">
              Explore Arena Board
            </Link>
          </div>
        )}
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

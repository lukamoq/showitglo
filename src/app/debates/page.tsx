'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { BoostDrawer } from '@/components/boost/BoostDrawer';
import { WalletTopUpModal } from '@/components/wallet/WalletTopUpModal';
import { CreateWarModal } from '@/components/wars/CreateWarModal';
import { DebateView, RankedPostView } from '@/lib/types';
import { formatUSD, formatCents } from '@/lib/utils';
import { Swords, Users, ShieldCheck, Zap, Heart, Trophy, Sparkles, ArrowRight, MessageSquare, Plus } from 'lucide-react';
import Link from 'next/link';

export default function DebatesPage() {
  const [debates, setDebates] = useState<DebateView[]>([]);
  const [selectedPost, setSelectedPost] = useState<RankedPostView | null>(null);
  const [isBoostOpen, setIsBoostOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [isCreateWarOpen, setIsCreateWarOpen] = useState(false);

  const fetchDebates = async () => {
    try {
      const res = await fetch('/api/v1/debates');
      const data = await res.json();
      if (data.debates) setDebates(data.debates);
    } catch (err) {
      console.error('Error fetching debates:', err);
    }
  };

  useEffect(() => {
    fetchDebates();
  }, []);

  const handleBoost = (post: RankedPostView) => {
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
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-bold uppercase tracking-wider mb-3">
            <Swords className="w-4 h-4 text-cyan-400" />
            <span>Multi-Faction War & Debate Arena</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Standing Arenas & LLM Wars
          </h1>
          <p className="mt-3 text-sm text-slate-300">
            Share your uncensored opinion, vote for free, or power-boost your favorite faction to lead the global scoreboard!
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => setIsCreateWarOpen(true)}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-rose-600 via-purple-600 to-cyan-600 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-lg hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              <span>Launch a New War (Free)</span>
            </button>
          </div>
        </div>

        {/* Debates Grid */}
        <div className="space-y-10">
          {debates.map((debate) => {
            return (
              <div
                key={debate.id}
                className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/20 shadow-2xl relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900/60 to-slate-950"
              >
                {/* Header info */}
                <div className="flex items-center justify-between pb-4 border-b border-white/10 text-xs flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono font-bold uppercase text-[10px]">
                      {debate.sides.length}-Way Multi-Faction War
                    </span>
                    {debate.sponsor_label && (
                      <span className="text-emerald-400 font-mono flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {debate.sponsor_label}
                      </span>
                    )}
                  </div>

                  <span className="font-mono text-slate-400">
                    Total Backing: <strong className="text-white">{formatCents(debate.total_money_cents)}</strong> •{' '}
                    <strong className="text-cyan-400">{debate.total_backers.toLocaleString()}</strong> backers •{' '}
                    <strong className="text-purple-300">{(debate.total_free_votes || 0).toLocaleString()}</strong> free opinions
                  </span>
                </div>

                {/* Debate Question */}
                <div className="my-6">
                  <Link
                    href={`/d/${debate.slug}`}
                    className="text-xl sm:text-3xl font-extrabold text-white hover:text-amber-300 transition-colors block"
                  >
                    {debate.question}
                  </Link>
                </div>

                {/* Multi-Segment Tug-of-War Strength Meter */}
                <div className="my-6">
                  <div className="flex items-center justify-between text-xs font-mono font-bold mb-2 flex-wrap gap-2">
                    {debate.sides.map((side) => (
                      <span key={side.side_key} style={{ color: side.color || '#fbbf24' }} className="flex items-center gap-1">
                        <span>{side.label.split(' ')[0]}: {side.percentage}%</span>
                        <span className="text-slate-400 font-normal">({side.backers_count} backers)</span>
                      </span>
                    ))}
                  </div>

                  {/* Segmented bar */}
                  <div className="h-4 rounded-full bg-black/60 p-0.5 border border-white/10 flex overflow-hidden shadow-inner gap-0.5">
                    {debate.sides.map((side) => (
                      <div
                        key={side.side_key}
                        style={{
                          width: `${side.percentage}%`,
                          backgroundColor: side.color || '#fbbf24',
                        }}
                        className="h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full opacity-90 hover:opacity-100"
                        title={`${side.label}: ${side.percentage}%`}
                      />
                    ))}
                  </div>
                </div>

                {/* Faction Cards Breakdown */}
                <div className={`grid grid-cols-1 ${debate.sides.length === 2 ? 'sm:grid-cols-2' : debate.sides.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'} gap-4 my-6`}>
                  {debate.sides.map((side) => (
                    <div
                      key={side.side_key}
                      className="p-5 rounded-2xl glass-card border border-white/10 flex flex-col justify-between space-y-4 relative overflow-hidden"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span
                            style={{ backgroundColor: `${side.color}20`, borderColor: `${side.color}40`, color: side.color }}
                            className="px-2 py-0.5 rounded-md border text-[10px] font-mono font-bold uppercase"
                          >
                            {side.percentage}% Share
                          </span>
                          <span className="text-xs font-mono font-bold text-white">
                            {formatCents(side.total_cents)}
                          </span>
                        </div>

                        <h3 className="font-bold text-sm text-white line-clamp-2">
                          {side.label}
                        </h3>

                        {side.description && (
                          <p className="text-xs text-slate-400 line-clamp-2">
                            {side.description}
                          </p>
                        )}
                      </div>

                      {/* Community Opinions count & Action */}
                      <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-cyan-400" />
                          <span>{side.opinions.length + side.free_votes_count} opinions</span>
                        </span>

                        <Link
                          href={`/d/${debate.slug}?side=${side.side_key}`}
                          className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1"
                        >
                          <span>Defend</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer Action */}
                <div className="pt-4 border-t border-white/10 flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Free community voting & optional conviction boosts active.</span>
                  </div>

                  <Link
                    href={`/d/${debate.slug}`}
                    className="btn-glass-gold px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg"
                  >
                    <span>Enter Debate & Post Opinion</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <CreateWarModal
        isOpen={isCreateWarOpen}
        onClose={() => setIsCreateWarOpen(false)}
        onWarCreated={(newDebate) => {
          setDebates([newDebate, ...debates]);
        }}
      />

      {selectedPost && (
        <BoostDrawer
          isOpen={isBoostOpen}
          onClose={() => setIsBoostOpen(false)}
          post={selectedPost}
          onSuccess={() => {
            setIsBoostOpen(false);
            fetchDebates();
          }}
        />
      )}

      <WalletTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        currentBalanceCents={5000}
        onTopUpSuccess={() => {
          setIsTopUpOpen(false);
          fetchDebates();
        }}
      />
    </div>
  );
}

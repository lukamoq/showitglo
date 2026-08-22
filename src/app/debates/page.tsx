'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { BoostDrawer } from '@/components/boost/BoostDrawer';
import { WalletTopUpModal } from '@/components/wallet/WalletTopUpModal';
import { CreateWarModal } from '@/components/wars/CreateWarModal';
import { DebateView, RankedPostView } from '@/lib/types';
import { formatUSD, formatCents } from '@/lib/utils';
import { Swords, ShieldCheck, Sparkles, ArrowRight, MessageSquare, Plus } from 'lucide-react';
import Link from 'next/link';

/**
 * Sides of a fight read as up vs down first, then fall back to the neutral
 * semantic tones. Token classes only — never raw palette colors.
 */
const SIDE_TONES = [
  { text: 'text-up', bar: 'bg-up' },
  { text: 'text-down', bar: 'bg-down' },
  { text: 'text-info', bar: 'bg-info' },
  { text: 'text-steel', bar: 'bg-steel' },
  { text: 'text-gold-text', bar: 'bg-gold' },
] as const;

const sideTone = (index: number) => SIDE_TONES[index % SIDE_TONES.length];

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
    <div className="min-h-screen text-ink flex flex-col relative overflow-x-hidden">
      <Navbar />

      <div className="relative flex-1 w-full">
        <div className="orb orb-gold -top-52 -left-32 opacity-70" aria-hidden />

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
          {/* Header */}
          <div className="max-w-3xl mb-10">
            <div className="kicker-gold flex items-center gap-2">
              <Swords className="w-3.5 h-3.5" aria-hidden />
              <span>Multi-faction war &amp; debate arena</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-ink mt-3">
              Standing Arenas &amp; LLM Wars
            </h1>

            <p className="mt-3 text-[15px] text-ink-2 leading-relaxed max-w-[62ch]">
              Share your uncensored opinion, vote for free, or power-boost your favorite faction to
              lead the global scoreboard.
            </p>

            <button onClick={() => setIsCreateWarOpen(true)} className="btn btn-gold mt-6">
              <Plus className="w-4 h-4" />
              <span>Launch a New War (Free)</span>
            </button>
          </div>

          {/* Debate Slabs */}
          <div className="space-y-6">
            {debates.map((debate) => {
              return (
                <div key={debate.id} className="panel rounded-card overflow-hidden">
                  {/* Header info */}
                  <div className="flex items-center justify-between gap-3 flex-wrap px-5 sm:px-6 py-3 border-b border-line">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="chip text-steel">
                        {debate.sides.length}-way multi-faction war
                      </span>
                      {debate.sponsor_label && (
                        <span className="chip text-up">
                          <ShieldCheck className="w-3 h-3" />
                          {debate.sponsor_label}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-meta text-ink-3">
                      <span>
                        Total backing{' '}
                        <strong className="font-semibold text-gold-text tnum">
                          {formatCents(debate.total_money_cents)}
                        </strong>
                      </span>
                      <span aria-hidden className="text-ink-3/50">
                        ·
                      </span>
                      <span className="tnum">
                        <strong className="font-semibold text-ink-2">
                          {debate.total_backers.toLocaleString()}
                        </strong>{' '}
                        backers
                      </span>
                      <span aria-hidden className="text-ink-3/50">
                        ·
                      </span>
                      <span className="tnum">
                        <strong className="font-semibold text-ink-2">
                          {(debate.total_free_votes || 0).toLocaleString()}
                        </strong>{' '}
                        free opinions
                      </span>
                    </div>
                  </div>

                  {/* Question + tug-of-war meter */}
                  <div className="px-5 sm:px-6 py-5">
                    <Link
                      href={`/d/${debate.slug}`}
                      className="block text-xl sm:text-2xl font-bold tracking-tight text-ink hover:text-gold-text transition-colors underline-offset-4 hover:underline"
                    >
                      {debate.question}
                    </Link>

                    <div className="mt-5">
                      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap mb-2">
                        {debate.sides.map((side, idx) => (
                          <span
                            key={side.side_key}
                            className={`micro-label flex items-center gap-1.5 ${sideTone(idx).text}`}
                          >
                            <span className="tnum">
                              {side.label.split(' ')[0]} {side.percentage}%
                            </span>
                            <span className="text-ink-3 tnum">({side.backers_count} backers)</span>
                          </span>
                        ))}
                      </div>

                      {/* Segmented bar */}
                      <div className="h-2.5 rounded-control sunken flex overflow-hidden gap-px p-px">
                        {debate.sides.map((side, idx) => (
                          <div
                            key={side.side_key}
                            style={{ width: `${side.percentage}%` }}
                            className={`h-full rounded-sm transition-all duration-700 opacity-80 hover:opacity-100 ${
                              sideTone(idx).bar
                            }`}
                            title={`${side.label}: ${side.percentage}%`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Faction ledger */}
                  <div className="border-t border-line divide-y divide-line">
                    {debate.sides.map((side, idx) => {
                      const tone = sideTone(idx);
                      return (
                        <div
                          key={side.side_key}
                          className="relative px-5 sm:px-6 py-3.5 transition-colors hover:bg-white/[0.04]"
                        >
                          <span
                            aria-hidden
                            className={`absolute left-0 top-0 bottom-0 w-[3px] ${tone.bar} opacity-70`}
                          />

                          <div className="flex flex-col lg:grid lg:grid-cols-[1fr_auto] gap-3 lg:gap-6 lg:items-center">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`chip ${tone.text} tnum`}>
                                  {side.percentage}% share
                                </span>
                                <h3 className="text-dense font-semibold text-ink truncate">
                                  {side.label}
                                </h3>
                              </div>

                              {side.description && (
                                <p className="mt-1 text-meta text-ink-3 line-clamp-2 max-w-[62ch]">
                                  {side.description}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center justify-between lg:justify-end gap-4 shrink-0">
                              <div className="lg:text-right">
                                <div className="micro-label text-ink-3">Backed</div>
                                <div className="metric text-base text-ink tnum leading-tight">
                                  {formatCents(side.total_cents)}
                                </div>
                              </div>

                              <span className="flex items-center gap-1.5 text-meta text-ink-3">
                                <MessageSquare className="w-3.5 h-3.5" aria-hidden />
                                <span className="tnum">
                                  {side.opinions.length + side.free_votes_count} opinions
                                </span>
                              </span>

                              <Link
                                href={`/d/${debate.slug}?side=${side.side_key}`}
                                className="btn btn-ghost btn-xs"
                              >
                                <span>Defend</span>
                                <ArrowRight className="w-3 h-3" />
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer Action */}
                  <div className="px-5 sm:px-6 py-4 border-t border-line flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2 text-meta text-ink-3">
                      <Sparkles className="w-3.5 h-3.5" aria-hidden />
                      <span>Free community voting &amp; optional conviction boosts active.</span>
                    </div>

                    <Link href={`/d/${debate.slug}`} className="btn btn-ghost btn-sm">
                      <span>Enter Debate &amp; Post Opinion</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
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

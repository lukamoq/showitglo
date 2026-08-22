'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { CreateWarModal } from '@/components/wars/CreateWarModal';
import { DebateView } from '@/lib/types';
import { formatCents } from '@/lib/utils';
import { AlertCircle, ArrowRight, MessageSquare, Plus, RefreshCw, ShieldCheck, Swords } from 'lucide-react';
import Link from 'next/link';
import { apiGet, errorText } from '@/components/system/api';

/**
 * Factions are ranked, not colour-coded.
 *
 * The side in front carries the gold — the same signal the #1 rank uses on the
 * board — and the rest step down a neutral ladder. Five saturated hues all
 * reading as "look here" was accent soup, and green-vs-red implied one side was
 * right and the other wrong, which is exactly the judgement this product
 * refuses to make.
 */
const FACTION_STEPS = ['bg-ink/45', 'bg-ink/28', 'bg-ink/18', 'bg-ink/12'] as const;

const leadingSideKey = (sides: DebateView['sides']) =>
  sides.reduce((lead, side) => (side.percentage > lead.percentage ? side : lead), sides[0])
    ?.side_key;

const factionTone = (index: number, isLeader: boolean) =>
  isLeader
    ? { text: 'text-gold-text', bar: 'bg-gold' }
    : { text: 'text-ink-3', bar: FACTION_STEPS[index % FACTION_STEPS.length] };

export default function DebatesPage() {
  const [debates, setDebates] = useState<DebateView[]>([]);
  const [isCreateWarOpen, setIsCreateWarOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDebates = useCallback(async () => {
    const res = await apiGet<{ debates: DebateView[] }>('/api/v1/debates');
    setIsLoading(false);
    if (!res.ok || !res.data?.debates) {
      setLoadError(errorText(res, 'Debates could not be loaded.'));
      return;
    }
    setLoadError(null);
    setDebates(res.data.debates);
  }, []);

  useEffect(() => {
    void fetchDebates();
  }, [fetchDebates]);

  return (
    <div className="min-h-screen text-ink flex flex-col relative overflow-x-hidden">
      <Navbar />

      <div className="relative flex-1 w-full">

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-16 sm:pt-20 w-full">
          {/* Header */}
          <div className="max-w-3xl mb-12 sm:mb-14">
            <span className="kicker">Multi-faction arena</span>

            <h1 className="display-2 text-ink mt-4">Standing arenas &amp; LLM wars</h1>

            <p className="lead mt-4">
              Share your uncensored opinion, vote for free, or power-boost your favourite faction to
              lead the global scoreboard.
            </p>

            <button type="button" onClick={() => setIsCreateWarOpen(true)} className="btn btn-gold mt-7">
              <Plus className="w-4 h-4" aria-hidden />
              <span>Launch a war — free</span>
            </button>
          </div>

          {loadError && (
            <div className="panel rounded-card p-8 text-center max-w-md mx-auto mb-6">
              <AlertCircle className="w-7 h-7 text-down mx-auto mb-3" aria-hidden />
              <p role="alert" className="text-dense text-ink-2">
                {loadError}
              </p>
              <button type="button" onClick={() => void fetchDebates()} className="btn btn-ghost btn-sm mt-5">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {!loadError && isLoading && (
            <div className="space-y-6">
              {[0, 1].map((i) => (
                <div key={i} className="skeleton h-64 w-full rounded-card" />
              ))}
            </div>
          )}

          {!loadError && !isLoading && debates.length === 0 && (
            <div className="panel rounded-card p-12 text-center max-w-md mx-auto">
              <Swords className="w-8 h-8 text-ink-3 mx-auto mb-3" aria-hidden />
              <p className="text-dense text-ink-3">
                No wars have been launched yet. Start the first one — it is free.
              </p>
            </div>
          )}

          {/* Debate Slabs */}
          <div className="space-y-8">
            {debates.map((debate) => {
              const leadKey = leadingSideKey(debate.sides);
              return (
                <div key={debate.id} className="panel rounded-card overflow-hidden">
                  {/* Header info */}
                  <div className="flex items-center justify-between gap-3 flex-wrap px-5 sm:px-6 py-2.5 border-b border-line">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="micro-label text-ink-3 tnum">
                        {debate.sides.length}-way war
                      </span>
                      {debate.sponsor_label && (
                        <span className="chip text-up">
                          <ShieldCheck className="w-3 h-3" aria-hidden />
                          {debate.sponsor_label}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-meta text-ink-3">
                      <span>
                        Backed{' '}
                        <strong className="font-semibold text-gold-text tnum">
                          {formatCents(debate.total_money_cents)}
                        </strong>
                      </span>
                      <span aria-hidden className="text-ink-3/40">·</span>
                      <span className="tnum">
                        <strong className="font-semibold text-ink-2">
                          {debate.total_backers.toLocaleString()}
                        </strong>{' '}
                        backers
                      </span>
                      <span aria-hidden className="text-ink-3/40">·</span>
                      <span className="tnum">
                        <strong className="font-semibold text-ink-2">
                          {(debate.total_free_votes || 0).toLocaleString()}
                        </strong>{' '}
                        free opinions
                      </span>
                    </div>
                  </div>

                  {/* Question + tug-of-war meter */}
                  <div className="px-5 sm:px-6 pt-6 pb-7">
                    <Link
                      href={`/d/${debate.slug}`}
                      className="block display-3 sm:text-[1.625rem] text-ink hover:text-gold-text transition-colors underline-offset-[6px] hover:underline max-w-[24ch]"
                    >
                      {debate.question}
                    </Link>

                    <div className="mt-6">
                      <div className="flex items-center gap-x-5 gap-y-1.5 flex-wrap mb-2.5">
                        {debate.sides.map((side, idx) => {
                          const tone = factionTone(idx, side.side_key === leadKey);
                          return (
                            <span
                              key={side.side_key}
                              className={`micro-label flex items-center gap-1.5 ${tone.text}`}
                            >
                              <span aria-hidden className={`h-2 w-2 rounded-[2px] ${tone.bar}`} />
                              <span className="tnum">
                                {side.label} {side.percentage}%
                              </span>
                            </span>
                          );
                        })}
                      </div>

                      {/* Segmented bar */}
                      <div className="h-2 rounded-[3px] sunken flex overflow-hidden gap-px p-px">
                        {debate.sides.map((side, idx) => (
                          <div
                            key={side.side_key}
                            style={{ width: `${side.percentage}%` }}
                            className={`h-full transition-[width] duration-700 ${
                              factionTone(idx, side.side_key === leadKey).bar
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
                      const isLead = side.side_key === leadKey;
                      const tone = factionTone(idx, isLead);
                      return (
                        <div
                          key={side.side_key}
                          className="relative px-5 sm:px-6 py-4 transition-colors hover:bg-white/[0.03]"
                        >
                          {isLead && (
                            <span
                              aria-hidden
                              className="absolute left-0 top-0 bottom-0 w-[2px] bg-gold"
                            />
                          )}

                          <div className="flex flex-col lg:grid lg:grid-cols-[1fr_auto] gap-3 lg:gap-8 lg:items-center">
                            <div className="min-w-0">
                              <div className="flex items-baseline gap-2.5 flex-wrap">
                                <h3 className="text-[15px] font-semibold text-ink truncate">
                                  {side.label}
                                </h3>
                                <span className={`micro-label tnum ${tone.text}`}>
                                  {side.percentage}% share
                                </span>
                              </div>

                              {side.description && (
                                <p className="mt-1 text-meta text-ink-3 line-clamp-2 max-w-[62ch]">
                                  {side.description}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center justify-between lg:justify-end gap-6 shrink-0">
                              <div className="lg:text-right">
                                <div className="micro-label text-ink-3">Backed</div>
                                <div className="metric text-base text-ink tnum leading-tight mt-0.5">
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
                                <ArrowRight className="w-3 h-3" aria-hidden />
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer Action */}
                  <div className="px-5 sm:px-6 py-3.5 border-t border-line flex items-center justify-between gap-4 flex-wrap">
                    <span className="text-meta text-ink-3">
                      Voting is free. Conviction chips are optional.
                    </span>

                    <Link href={`/d/${debate.slug}`} className="btn btn-ghost btn-sm">
                      <span>Enter debate</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Backing happens inside a debate (/d/[slug]), where a side is chosen —
          this index page only lists and links. */}
      <CreateWarModal
        isOpen={isCreateWarOpen}
        onClose={() => setIsCreateWarOpen(false)}
        onWarCreated={(newDebate) => {
          setDebates([newDebate, ...debates]);
        }}
      />
    </div>
  );
}

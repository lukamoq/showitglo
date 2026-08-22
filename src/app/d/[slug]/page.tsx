'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout/Navbar';
import { BoostDrawer } from '@/components/boost/BoostDrawer';
import { WalletTopUpModal } from '@/components/wallet/WalletTopUpModal';
import { DebateView, RankedPostView } from '@/lib/types';
import { formatUSD, formatCents, timeAgo } from '@/lib/utils';
import { Swords, ShieldCheck, Zap, ArrowLeft, MessageSquare, Send, CheckCircle2 } from 'lucide-react';
import { HoldToLikeButton } from '@/components/interactions/HoldToLikeButton';
import confetti from 'canvas-confetti';

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

export default function SingleDebatePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug as string;
  const initialSide = searchParams.get('side');

  const [debate, setDebate] = useState<DebateView | null>(null);
  const [selectedPost, setSelectedPost] = useState<RankedPostView | null>(null);
  const [isBoostOpen, setIsBoostOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  // Opinion Form State
  const [chosenSideKey, setChosenSideKey] = useState<string>('');
  const [opinionText, setOpinionText] = useState('');
  const [authorName, setAuthorName] = useState('Marc (ShipFast)');
  const [isPaidConviction, setIsPaidConviction] = useState(false);
  const [boostAmountCents, setBoostAmountCents] = useState(100); // $1.00
  const [isSubmittingOpinion, setIsSubmittingOpinion] = useState(false);
  const [opinionSuccess, setOpinionSuccess] = useState(false);

  const fetchDebate = async () => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/v1/debates/${slug}`);
      const data = await res.json();
      if (data.debate) {
        setDebate(data.debate);
        if (!chosenSideKey && data.debate.sides.length > 0) {
          if (initialSide && data.debate.sides.some((s: any) => s.side_key === initialSide)) {
            setChosenSideKey(initialSide);
          } else {
            setChosenSideKey(data.debate.sides[0].side_key);
          }
        }
      }
    } catch (err) {
      console.error('Error loading debate:', err);
    }
  };

  useEffect(() => {
    fetchDebate();
  }, [slug]);

  const handlePostOpinion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosenSideKey || !opinionText.trim()) return;

    setIsSubmittingOpinion(true);
    try {
      const res = await fetch(`/api/v1/debates/${slug}/back`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side_key: chosenSideKey,
          kind: isPaidConviction ? 'boost' : 'free_opinion',
          amount_cents: isPaidConviction ? boostAmountCents : 0,
          payer_display: authorName,
          opinion_text: opinionText.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#F0A824', '#FFC53D', '#F6F7FA'],
        });
        setOpinionText('');
        setOpinionSuccess(true);
        setTimeout(() => setOpinionSuccess(false), 4000);
        fetchDebate();
      }
    } catch (err) {
      console.error('Failed to post opinion:', err);
    } finally {
      setIsSubmittingOpinion(false);
    }
  };

  if (!debate) {
    return (
      <div className="min-h-screen text-ink flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="flex items-center gap-3">
            <span className="led led-gold" aria-hidden />
            <span className="kicker">Loading arena debate</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-ink flex flex-col relative overflow-x-hidden">
      <Navbar />

      <div className="relative flex-1 w-full">
        <div className="orb orb-gold -top-48 left-1/4 -translate-x-1/2 opacity-70" aria-hidden />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
          <Link
            href="/debates"
            className="inline-flex items-center gap-1.5 text-meta text-ink-3 hover:text-ink font-medium mb-6 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to All Debates</span>
          </Link>

          {/* Debate Hero Panel */}
          <div className="panel rounded-card overflow-hidden mb-8">
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
                  Total raised{' '}
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
                  distinct backers
                </span>
              </div>
            </div>

            <div className="px-5 sm:px-8 py-6 sm:py-7">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink leading-tight">
                {debate.question}
              </h1>

              {/* Multi-Segment Tug-of-War Bar */}
              <div className="mt-6">
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

                <div className="h-3 rounded-control sunken flex overflow-hidden gap-px p-px">
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
          </div>

          {/* Free Opinion & Argument Submission Panel */}
          <div className="panel rounded-card p-5 sm:p-8 mb-10">
            <div className="kicker-gold flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5" aria-hidden />
              <span>Cast your vote &amp; share an uncensored argument</span>
            </div>

            <h2 className="text-xl font-bold tracking-tight text-ink mt-2">
              Take Your Stance (Free Community Opinion)
            </h2>

            <p className="text-[15px] text-ink-2 leading-relaxed max-w-[62ch] mt-2 mb-6">
              You don&apos;t need to bet or pay anything to share your opinion here. Speak freely,
              defend your preferred side, or optionally boost your conviction.
            </p>

            {opinionSuccess && (
              <div className="mb-5 sunken rounded-control px-3.5 py-2.5 text-meta text-up flex items-center gap-2 animate-rise">
                <CheckCircle2 className="w-4 h-4" aria-hidden />
                <span>
                  Your argument and vote have been published to the permanent public record.
                </span>
              </div>
            )}

            <form onSubmit={handlePostOpinion} className="space-y-5">
              {/* Pick your side */}
              <div>
                <label className="kicker block mb-2">Select your side / faction *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {debate.sides.map((side, idx) => {
                    const tone = sideTone(idx);
                    const isChosen = chosenSideKey === side.side_key;
                    return (
                      <button
                        type="button"
                        key={side.side_key}
                        onClick={() => setChosenSideKey(side.side_key)}
                        className={`relative overflow-hidden p-3 pl-4 rounded-control border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                          isChosen
                            ? `border-current bg-white/[0.06] ${tone.text}`
                            : 'border-line text-ink-3 hover:text-ink-2 hover:bg-white/[0.04]'
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`absolute left-0 top-0 bottom-0 w-[3px] ${tone.bar} ${
                            isChosen ? 'opacity-100' : 'opacity-30'
                          }`}
                        />
                        <span
                          className={`text-dense font-semibold line-clamp-1 ${
                            isChosen ? 'text-ink' : ''
                          }`}
                        >
                          {side.label}
                        </span>
                        <span className="micro-label mt-1 tnum">{side.percentage}% share</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Opinion text */}
              <div>
                <label className="kicker block mb-2">Your uncensored argument / thesis *</label>
                <textarea
                  rows={3}
                  required
                  value={opinionText}
                  onChange={(e) => setOpinionText(e.target.value)}
                  placeholder={`Why is your chosen side the undisputed winner? Share your raw thoughts...`}
                  className="field resize-none"
                />
              </div>

              {/* Free vs Paid Conviction Switcher */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-line">
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="text-dense font-medium text-ink-2 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPaidConviction}
                      onChange={(e) => setIsPaidConviction(e.target.checked)}
                      className="w-3.5 h-3.5 rounded-[4px] border-line bg-black/40 accent-gold"
                    />
                    <span>Optional micro-boost</span>
                  </label>

                  {isPaidConviction && (
                    <div className="seg animate-rise">
                      {[1, 5, 10, 25, 50, 100].map((cents) => (
                        <button
                          type="button"
                          key={cents}
                          onClick={() => setBoostAmountCents(cents)}
                          className={`seg-item tnum ${
                            boostAmountCents === cents ? 'seg-item-active' : ''
                          }`}
                        >
                          {cents < 100 ? `${cents}¢` : `$${cents / 100}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingOpinion || !opinionText.trim()}
                  className="btn btn-gold"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {isSubmittingOpinion
                      ? 'Publishing Argument...'
                      : isPaidConviction
                      ? `Post Argument + ${boostAmountCents < 100 ? `${boostAmountCents}¢` : `$${boostAmountCents / 100}`} Boost`
                      : 'Cast Vote & Post Opinion ($0.00 Free)'}
                  </span>
                </button>
              </div>
            </form>
          </div>

          {/* Faction Roster & Arguments Streams */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold tracking-tight text-ink flex items-center gap-2">
              <Swords className="w-4 h-4 text-ink-3" aria-hidden />
              <span>Live Arguments &amp; Faction Rosters</span>
            </h2>

            <div
              className={`grid grid-cols-1 ${
                debate.sides.length > 2 ? 'lg:grid-cols-2' : 'grid-cols-1'
              } gap-6`}
            >
              {debate.sides.map((side, idx) => {
                const tone = sideTone(idx);
                return (
                  <div
                    key={side.side_key}
                    className="panel rounded-card overflow-hidden flex flex-col"
                  >
                    {/* Side Title & Score */}
                    <div className="relative flex items-start justify-between gap-3 px-5 py-4 border-b border-line">
                      <span
                        aria-hidden
                        className={`absolute left-0 top-0 bottom-0 w-[3px] ${tone.bar} opacity-70`}
                      />

                      <div className="min-w-0">
                        <div className={`micro-label ${tone.text}`}>
                          Faction · {side.percentage}% market share
                        </div>
                        <h3 className="text-base font-bold tracking-tight text-ink mt-1 truncate">
                          {side.label}
                        </h3>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="micro-label text-ink-3">Backed</div>
                        <div className="metric text-lg text-ink tnum leading-tight">
                          {formatCents(side.total_cents)}
                        </div>
                        <div className="text-meta text-ink-3 tnum">
                          {side.backers_count} backers
                        </div>
                      </div>
                    </div>

                    {/* Core Thesis Statement */}
                    {side.description && (
                      <div className="px-5 py-4 border-b border-line text-dense text-ink-2 leading-relaxed">
                        {side.description}
                      </div>
                    )}

                    {/* Community Arguments Stream */}
                    <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-line">
                      <span className="kicker">Community arguments</span>
                      <span className="chip text-steel tnum">{side.opinions.length}</span>
                    </div>

                    {side.opinions.length > 0 ? (
                      <div className="divide-y divide-line max-h-64 overflow-y-auto">
                        {side.opinions.map((op) => (
                          <div
                            key={op.id}
                            className="px-5 py-3 transition-colors hover:bg-white/[0.04]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-dense font-semibold text-ink truncate">
                                {op.author_name}
                              </span>
                              {op.is_paid && (
                                <span className="chip text-gold-text shrink-0">
                                  Backed ${op.amount_cents / 100}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-meta text-ink-2 leading-relaxed">{op.text}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="px-5 py-8 text-center text-meta text-ink-3">
                        No community arguments yet. Be the first to defend this side.
                      </p>
                    )}

                    {/* Backer Actions */}
                    <div className="mt-auto flex items-center justify-between gap-3 px-5 py-3.5 border-t border-line">
                      <HoldToLikeButton
                        postId={side.post.id}
                        initialLikes={side.post.like_units}
                        onLikeExecuted={fetchDebate}
                        onInsufficientFunds={() => setIsTopUpOpen(true)}
                      />

                      <button
                        onClick={() => {
                          setSelectedPost(side.post);
                          setIsBoostOpen(true);
                        }}
                        className="btn btn-ghost btn-sm text-gold-text hover:border-gold/40"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Boost Faction</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {selectedPost && (
        <BoostDrawer
          isOpen={isBoostOpen}
          onClose={() => setIsBoostOpen(false)}
          post={selectedPost}
          onSuccess={() => {
            setIsBoostOpen(false);
            fetchDebate();
          }}
        />
      )}

      <WalletTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        currentBalanceCents={5000}
        onTopUpSuccess={() => {
          setIsTopUpOpen(false);
          fetchDebate();
        }}
      />
    </div>
  );
}

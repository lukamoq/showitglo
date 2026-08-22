'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout/Navbar';
import { BoostDrawer } from '@/components/boost/BoostDrawer';
import { WalletTopUpModal } from '@/components/wallet/WalletTopUpModal';
import { DebateView, RankedPostView } from '@/lib/types';
import { DEBATE_BACK_ALLOWED, type DebateBackTier } from '@/lib/pricing';
import { formatCents } from '@/lib/utils';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { HoldToLikeButton } from '@/components/interactions/HoldToLikeButton';
import confetti from 'canvas-confetti';
import {
  apiGet,
  apiPost,
  errorText,
  insufficientFunds,
  newIdempotencyKey,
  recommendedTopUpCents,
  useDisplayName,
} from '@/components/system/api';
import { DisplayNameField } from '@/components/system/DisplayNameField';
import { useWallet } from '@/components/system/useWallet';

const OPINION_MAX_LENGTH = 500;

/** The only conviction chips the server will price. */
const BACK_TIERS: Array<{ key: DebateBackTier; label: string }> = [
  { key: 'boost', label: formatCents(DEBATE_BACK_ALLOWED.boost) },
  { key: 'super', label: formatCents(DEBATE_BACK_ALLOWED.super) },
  { key: 'mega', label: formatCents(DEBATE_BACK_ALLOWED.mega) },
];

/**
 * Factions are ranked, not colour-coded — see the note on /debates. The side in
 * front carries the gold; the rest step down a neutral ladder.
 */
const FACTION_STEPS = ['bg-ink/45', 'bg-ink/28', 'bg-ink/18', 'bg-ink/12'] as const;

const leadingSideKey = (sides: DebateView['sides']) =>
  sides.reduce((lead, side) => (side.percentage > lead.percentage ? side : lead), sides[0])
    ?.side_key;

const factionTone = (index: number, isLeader: boolean) =>
  isLeader
    ? { text: 'text-gold-text', bar: 'bg-gold' }
    : { text: 'text-ink-3', bar: FACTION_STEPS[index % FACTION_STEPS.length] };

export default function SingleDebatePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug as string;
  const initialSide = searchParams.get('side');

  const [debate, setDebate] = useState<DebateView | null>(null);
  const [selectedPost, setSelectedPost] = useState<RankedPostView | null>(null);
  const [isBoostOpen, setIsBoostOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpRecommendation, setTopUpRecommendation] = useState<number | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Opinion Form State
  const [chosenSideKey, setChosenSideKey] = useState<string>('');
  const [opinionText, setOpinionText] = useState('');
  const [authorName, setAuthorName] = useDisplayName();
  const [isPaidConviction, setIsPaidConviction] = useState(false);
  const [backTier, setBackTier] = useState<DebateBackTier>('boost');
  const [isSubmittingOpinion, setIsSubmittingOpinion] = useState(false);
  const [opinionSuccess, setOpinionSuccess] = useState(false);
  const [opinionError, setOpinionError] = useState<string | null>(null);
  const [opinionNotice, setOpinionNotice] = useState<string | null>(null);

  const { balanceCents, refresh: refreshWallet } = useWallet();
  const inFlightRef = useRef(false);
  /** Reused when retrying the same backing after a dropped response. */
  const idempotencyKeyRef = useRef<string | null>(null);

  const fetchDebate = useCallback(async () => {
    if (!slug) return;
    const res = await apiGet<{ debate: DebateView }>(`/api/v1/debates/${slug}`);
    setIsLoading(false);

    if (!res.ok || !res.data?.debate) {
      setLoadError(errorText(res, 'This debate could not be loaded.'));
      return;
    }

    setLoadError(null);
    const loaded = res.data.debate;
    setDebate(loaded);
    setChosenSideKey((current) => {
      if (current) return current;
      if (initialSide && loaded.sides.some((s) => s.side_key === initialSide)) return initialSide;
      return loaded.sides[0]?.side_key ?? '';
    });
  }, [slug, initialSide]);

  useEffect(() => {
    void fetchDebate();
  }, [fetchDebate]);

  /**
   * The retained key identifies ONE conviction backing. Switching side, tier,
   * or free-vs-paid is a different backing entirely — reusing the key there
   * would replay the previous one and charge nothing while reporting success
   * for a side the visitor never backed.
   */
  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [chosenSideKey, backTier, isPaidConviction]);

  const handlePostOpinion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current || !chosenSideKey || !opinionText.trim()) return;

    inFlightRef.current = true;
    setIsSubmittingOpinion(true);
    setOpinionError(null);
    setOpinionNotice(null);

    if (isPaidConviction && !idempotencyKeyRef.current) {
      idempotencyKeyRef.current = newIdempotencyKey();
    }

    // Only the tier is sent: the server prices it. A client-chosen amount would
    // be ignored, so offering one would be a lie about how this works.
    const res = await apiPost<{ replayed?: boolean; opinion_recorded?: boolean }>(
      `/api/v1/debates/${slug}/back`,
      {
        side_key: chosenSideKey,
        kind: isPaidConviction ? backTier : 'free_opinion',
        payer_display: authorName,
        opinion_text: opinionText.trim().slice(0, OPINION_MAX_LENGTH),
      },
      isPaidConviction && idempotencyKeyRef.current
        ? { idempotencyKey: idempotencyKeyRef.current }
        : {}
    );

    inFlightRef.current = false;
    setIsSubmittingOpinion(false);

    if (res.ok) {
      idempotencyKeyRef.current = null;

      // A replay settled nothing new, and the server refuses to publish the
      // argument twice. Keep the text in the composer and say so plainly rather
      // than firing confetti over an empty box.
      if (res.data?.replayed) {
        if (res.data.opinion_recorded) setOpinionText('');
        setOpinionNotice(
          res.data.opinion_recorded
            ? 'Already processed — this backing was recorded earlier. Your balance is up to date.'
            : 'Already processed — this backing was recorded earlier, and your argument was not posted again. Your balance is up to date.'
        );
        void fetchDebate();
        void refreshWallet();
        return;
      }

      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#F0A824', '#FFC53D', '#F6F7FA'],
      });
      setOpinionText('');
      setOpinionSuccess(true);
      setTimeout(() => setOpinionSuccess(false), 4000);
      void fetchDebate();
      void refreshWallet();
      return;
    }

    const shortfall = insufficientFunds(res);
    if (shortfall) {
      idempotencyKeyRef.current = null;
      setTopUpRecommendation(recommendedTopUpCents(shortfall.shortfallCents));
      setOpinionError('Not enough wallet balance for that conviction chip. Add funds, or post for free.');
      setIsTopUpOpen(true);
      return;
    }

    if (!res.networkError) idempotencyKeyRef.current = null;
    setOpinionError(errorText(res, 'Your argument could not be published.'));
  };

  if (isLoading) {
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

  if (!debate) {
    return (
      <div className="min-h-screen text-ink flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="panel rounded-card px-8 py-10 text-center max-w-md w-full animate-rise">
            <AlertCircle className="w-7 h-7 text-down mx-auto mb-3" aria-hidden />
            <h2 className="text-xl font-bold tracking-tight text-ink">Debate unavailable</h2>
            <p role="alert" className="text-meta text-ink-3 mt-2">
              {loadError ?? 'This debate does not exist.'}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <button type="button" onClick={() => void fetchDebate()} className="btn btn-ghost btn-sm">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
              <Link href="/debates" className="btn btn-ghost btn-sm">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>All debates</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const leadKey = leadingSideKey(debate.sides);

  return (
    <div className="min-h-screen text-ink flex flex-col relative overflow-x-hidden">
      <Navbar />

      <div className="relative flex-1 w-full">

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
          <Link
            href="/debates"
            className="inline-flex items-center gap-1.5 text-meta text-ink-3 hover:text-ink font-medium mb-6 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to All Debates</span>
          </Link>

          {/* Debate Hero Panel */}
          <div className="panel rounded-card overflow-hidden mb-10">
            <div className="flex items-center justify-between gap-3 flex-wrap px-5 sm:px-6 py-2.5 border-b border-line">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="micro-label text-ink-3 tnum">
                  {debate.sides.length}-way war
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

            <div className="px-5 sm:px-8 pt-7 pb-8">
              <h1 className="display-2 text-ink max-w-[22ch]">{debate.question}</h1>

              {/* Multi-Segment Tug-of-War Bar */}
              <div className="mt-7">
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
                        <span className="text-ink-3 tnum">({side.backers_count} backer{side.backers_count === 1 ? '' : 's'})</span>
                      </span>
                    );
                  })}
                </div>

                <div className="h-2.5 rounded-[3px] sunken flex overflow-hidden gap-px p-px">
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
          </div>

          {/* Free Opinion & Argument Submission Panel */}
          <div className="panel rounded-card p-5 sm:p-8 mb-12">
            <span className="kicker">Cast your vote</span>

            <h2 className="display-3 text-ink mt-3">Take your stance — free</h2>

            <p className="text-[15px] text-ink-2 leading-relaxed max-w-[62ch] mt-2 mb-7">
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
                    const tone = factionTone(idx, side.side_key === leadKey);
                    const isChosen = chosenSideKey === side.side_key;
                    return (
                      <button
                        type="button"
                        key={side.side_key}
                        onClick={() => setChosenSideKey(side.side_key)}
                        aria-pressed={isChosen}
                        className={`relative overflow-hidden p-3 pl-4 rounded-control border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                          isChosen
                            ? 'border-gold/45 bg-gold/[0.07] text-ink'
                            : 'border-line text-ink-3 hover:text-ink-2 hover:bg-white/[0.035]'
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`absolute left-0 top-0 bottom-0 w-[2px] ${
                            isChosen ? 'bg-gold' : tone.bar
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
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label htmlFor="debate-opinion" className="kicker">
                    Your uncensored argument / thesis *
                  </label>
                  <span className="text-micro text-ink-3 tnum">
                    {opinionText.length}/{OPINION_MAX_LENGTH}
                  </span>
                </div>
                <textarea
                  id="debate-opinion"
                  rows={3}
                  required
                  maxLength={OPINION_MAX_LENGTH}
                  value={opinionText}
                  onChange={(e) => setOpinionText(e.target.value)}
                  aria-describedby={opinionError ? 'debate-opinion-error' : undefined}
                  placeholder="Why is your chosen side the undisputed winner? Share your raw thoughts…"
                  className="field resize-none"
                />
              </div>

              <DisplayNameField id="debate-alias" value={authorName} onChange={setAuthorName} />

              {opinionError && (
                <p id="debate-opinion-error" role="alert" className="flex items-start gap-2 text-dense text-down">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                  <span>{opinionError}</span>
                </p>
              )}

              {opinionNotice && (
                <p role="status" className="flex items-start gap-2 text-dense text-ink-2">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-ink-3" aria-hidden />
                  <span>{opinionNotice}</span>
                </p>
              )}

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
                    <span>Back it with a conviction chip</span>
                  </label>

                  {isPaidConviction && (
                    <div className="seg animate-rise" role="group" aria-label="Conviction chip">
                      {BACK_TIERS.map((tier) => (
                        <button
                          type="button"
                          key={tier.key}
                          onClick={() => setBackTier(tier.key)}
                          aria-pressed={backTier === tier.key}
                          className={`seg-item tnum ${backTier === tier.key ? 'seg-item-active' : ''}`}
                        >
                          {tier.label}
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
                  {isSubmittingOpinion ? (
                    <>
                      <span
                        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black"
                        aria-hidden
                      />
                      <span>Publishing argument…</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span className="tnum">
                        {isPaidConviction
                          ? `Post argument + ${formatCents(DEBATE_BACK_ALLOWED[backTier])}`
                          : 'Cast vote & post opinion (free)'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Faction Roster & Arguments Streams */}
          <div className="space-y-6">
            <h2 className="display-3 text-ink">Live arguments &amp; faction rosters</h2>

            <div
              className={`grid grid-cols-1 ${
                debate.sides.length > 2 ? 'lg:grid-cols-2' : 'grid-cols-1'
              } gap-6`}
            >
              {debate.sides.map((side, idx) => {
                const isLead = side.side_key === leadKey;
                const tone = factionTone(idx, isLead);
                return (
                  <div
                    key={side.side_key}
                    className="panel rounded-card overflow-hidden flex flex-col"
                  >
                    {/* Side Title & Score */}
                    <div className="relative flex items-start justify-between gap-3 px-5 py-4 border-b border-line">
                      {isLead && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-0 bottom-0 w-[2px] bg-gold"
                        />
                      )}

                      <div className="min-w-0">
                        <div className={`micro-label tnum ${tone.text}`}>
                          {side.percentage}% share{isLead ? ' · leading' : ''}
                        </div>
                        <h3 className="text-base font-bold tracking-tight text-ink mt-1 truncate">
                          {side.label}
                        </h3>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="micro-label text-ink-3">Backed</div>
                        <div className="metric text-lg text-ink tnum leading-tight mt-0.5">
                          {formatCents(side.total_cents)}
                        </div>
                        <div className="text-meta text-ink-3 tnum">
                          {side.backers_count} backer{side.backers_count === 1 ? '' : 's'}
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
                      <span className="chip chip-quiet tnum">{side.opinions.length}</span>
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
                        onLikeExecuted={() => {
                          void fetchDebate();
                          void refreshWallet();
                        }}
                        onInsufficientFunds={(shortfallCents) => {
                          setTopUpRecommendation(recommendedTopUpCents(shortfallCents));
                          setIsTopUpOpen(true);
                        }}
                        onLikeCapReached={() => {
                          setSelectedPost(side.post);
                          setIsBoostOpen(true);
                        }}
                      />

                      <button
                        type="button"
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
            void fetchDebate();
            void refreshWallet();
          }}
        />
      )}

      <WalletTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => {
          setIsTopUpOpen(false);
          void refreshWallet();
        }}
        currentBalanceCents={balanceCents}
        onTopUpSuccess={() => {
          setIsTopUpOpen(false);
          void refreshWallet();
          // Deliberately no auto-replay: the visitor re-submits when ready.
          setOpinionError('Wallet topped up — submit your argument again to back it.');
        }}
        recommendedCents={topUpRecommendation}
      />
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CreditCard, RefreshCw, ShieldCheck, Sparkles, Trophy, X, Zap } from 'lucide-react';
import confetti from 'canvas-confetti';

import { RankedPostView, Quote } from '@/lib/types';
import { BOOST_CENTS, SUPER_CENTS } from '@/lib/pricing';
import { formatUSD, formatScore, formatCents } from '@/lib/utils';
import { WalletTopUpModal } from '../wallet/WalletTopUpModal';
import {
  apiPost,
  errorText,
  insufficientFunds,
  newIdempotencyKey,
  recommendedTopUpCents,
  useDisplayName,
} from '../system/api';
import { DisplayNameField } from '../system/DisplayNameField';
import { ModalPortal } from '../system/ModalPortal';
import { useModalChrome } from '../system/useModalChrome';
import { useWallet } from '../system/useWallet';

interface BoostDrawerProps {
  post: RankedPostView | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: unknown) => void;
}

type LadderKind = 'boost' | 'super' | 'power';

interface SpendResult {
  old_rank?: number;
  new_rank?: number;
  new_balance_cents?: number;
  /** True when this key had already been settled — nothing new was charged. */
  replayed?: boolean;
}

export const BoostDrawer: React.FC<BoostDrawerProps> = ({ post, isOpen, onClose, onSuccess }) => {
  const [boostLadderKind, setBoostLadderKind] = useState<LadderKind>('boost');
  const [targetRank, setTargetRank] = useState<number>(1);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteTimeLeft, setQuoteTimeLeft] = useState<number>(300);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [topUpRecommendation, setTopUpRecommendation] = useState<number | undefined>(undefined);
  const [retryHint, setRetryHint] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [alias, setAlias] = useDisplayName();

  const { balanceCents, refresh: refreshWallet, applyBalance } = useWallet(isOpen);
  const containerRef = useModalChrome(isOpen, onClose);

  const inFlightRef = useRef(false);
  /** Survives a network failure so retrying the same spend cannot double-charge. */
  const idempotencyKeyRef = useRef<string | null>(null);

  const fetchQuote = useCallback(
    async (rank: number) => {
      if (!post) return;
      setIsLoadingQuote(true);
      setQuoteError(null);

      const res = await apiPost<{ quote: Quote }>('/api/v1/quotes', {
        post_id: post.id,
        target_rank: rank,
      });

      setIsLoadingQuote(false);
      if (res.ok && res.data?.quote) {
        setQuote(res.data.quote);
        return;
      }
      setQuote(null);
      setQuoteError(errorText(res, 'Could not price this rank right now.'));
    },
    [post]
  );

  useEffect(() => {
    if (!isOpen || !post) return;
    const nextTarget = Math.max(1, (post.rank || 2) - 1);
    setTargetRank(nextTarget);
    setBoostLadderKind('boost');
    setError(null);
    setNotice(null);
    setRetryHint(false);
    void refreshWallet();
  }, [isOpen, post, refreshWallet]);

  /**
   * An idempotency key identifies ONE logical spend. The moment the visitor
   * picks a different product, a different target rank or a re-priced quote,
   * they intend a different spend — carrying the old key over (it survives a
   * network failure on purpose) would make the server replay the earlier
   * backing and answer with someone else's product.
   */
  useEffect(() => {
    idempotencyKeyRef.current = null;
    setRetryHint(false);
  }, [post?.id, boostLadderKind, targetRank, quote?.quote_id]);

  useEffect(() => {
    if (!isOpen || boostLadderKind !== 'power') return;
    void fetchQuote(targetRank);
  }, [isOpen, boostLadderKind, targetRank, fetchQuote]);

  useEffect(() => {
    if (!isOpen || !quote) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(quote.expires_at).getTime() - Date.now()) / 1000));
      setQuoteTimeLeft(remaining);
      if (remaining === 0) void fetchQuote(targetRank);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, quote, targetRank, fetchQuote]);

  const costCents =
    boostLadderKind === 'boost' ? BOOST_CENTS : boostLadderKind === 'super' ? SUPER_CENTS : quote?.amount_cents ?? 0;

  const handleShortfall = (shortfallCents: number) => {
    setTopUpRecommendation(recommendedTopUpCents(shortfallCents));
    setError('Not enough wallet balance for this backing.');
    setIsTopUpModalOpen(true);
  };

  const handleExecuteBoost = async () => {
    if (!post || inFlightRef.current) return;
    if (boostLadderKind === 'power' && !quote) {
      setError('Fetch a fresh price before executing a power boost.');
      return;
    }

    inFlightRef.current = true;
    setIsSettling(true);
    setError(null);
    setNotice(null);
    setRetryHint(false);

    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = newIdempotencyKey();
    const idempotencyKey = idempotencyKeyRef.current;

    const res =
      boostLadderKind === 'power'
        ? await apiPost<SpendResult>(
            '/api/v1/power-boosts',
            { quote_id: quote?.quote_id, payer_display: alias },
            { idempotencyKey }
          )
        : await apiPost<SpendResult>(
            `/api/v1/posts/${post.id}/boost`,
            { kind: boostLadderKind, payer_display: alias },
            { idempotencyKey }
          );

    inFlightRef.current = false;
    setIsSettling(false);

    if (res.ok) {
      idempotencyKeyRef.current = null;
      if (typeof res.data?.new_balance_cents === 'number') applyBalance(res.data.new_balance_cents);

      // A replay means the earlier attempt did land and this one moved nothing.
      // Celebrating it would tell the visitor they just backed the post again;
      // the drawer stays open with the real balance so they can decide.
      if (res.data?.replayed) {
        setNotice('Already processed — this backing was recorded earlier. Your balance is up to date.');
        onSuccess(res.data);
        return;
      }

      confetti({
        particleCount: boostLadderKind === 'power' ? 100 : 50,
        spread: boostLadderKind === 'power' ? 80 : 60,
        origin: { y: 0.6 },
        colors: ['#F0A824', '#FFC53D', '#FFFFFF'],
      });
      onSuccess(res.data);
      onClose();
      return;
    }

    const shortfall = insufficientFunds(res);
    if (shortfall) {
      idempotencyKeyRef.current = null;
      handleShortfall(shortfall.shortfallCents);
      return;
    }

    if (res.status === 410 || res.status === 404) {
      idempotencyKeyRef.current = null;
      setError('That price expired. Fetching a fresh quote…');
      void fetchQuote(targetRank);
      return;
    }

    // Keep the key only for a network failure: the server may already have
    // recorded the spend, and the same key makes a retry a no-op.
    if (!res.networkError) idempotencyKeyRef.current = null;
    else setRetryHint(true);
    setError(errorText(res, 'Could not settle this backing.'));
  };

  if (!isOpen || !post) return null;

  const hasEnoughFunds = costCents > 0 && balanceCents >= costCents;

  const ladderOptions = [
    { key: 'boost' as const, price: formatCents(BOOST_CENTS), label: 'Boost', sub: 'Quick backing', Icon: Zap },
    { key: 'super' as const, price: formatCents(SUPER_CENTS), label: 'Super Boost', sub: 'Named entry', Icon: Sparkles },
    { key: 'power' as const, price: '$10+', label: 'Power Boost', sub: 'Target rank #N', Icon: Trophy },
  ];

  return (
    <>
      <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(4,6,12,0.65)] p-0 backdrop-blur-md sm:items-center sm:p-4">
          <div className="absolute inset-0" onClick={onClose} aria-hidden />

          <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="boost-title"
            className="animate-rise panel relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-modal p-6 sm:rounded-modal sm:p-8"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
              <div className="min-w-0">
                <div className="kicker kicker-gold flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  <span>Interaction ladder</span>
                </div>
                <h3 id="boost-title" className="mt-1 line-clamp-1 text-lg font-bold tracking-tight text-ink">
                  {post.title}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-meta text-ink-3">
                  <span>
                    Current <strong className="tnum font-semibold text-ink">#{post.rank}</strong>
                  </span>
                  <span aria-hidden className="text-ink-3/50">
                    ·
                  </span>
                  <span>
                    Score <strong className="tnum font-semibold text-gold-text">{formatScore(post.display_score)}</strong>
                  </span>
                  <span aria-hidden className="text-ink-3/50">
                    ·
                  </span>
                  <span>
                    <strong className="tnum font-semibold text-ink-2">{post.backers_count.toLocaleString()}</strong> backers
                  </span>
                </div>
              </div>

              <button type="button" onClick={onClose} className="btn btn-ghost btn-xs !px-1.5 shrink-0" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Wallet */}
            <div className="sunken mt-4 flex items-center justify-between gap-3 rounded-control p-3 text-dense">
              <div className="flex min-w-0 items-center gap-2">
                <CreditCard className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden />
                <span className="text-ink-3">Wallet available</span>
                <strong className="tnum font-semibold text-ink">{formatCents(balanceCents)}</strong>
              </div>

              <button
                type="button"
                onClick={() => {
                  setTopUpRecommendation(undefined);
                  setIsTopUpModalOpen(true);
                }}
                className="shrink-0 cursor-pointer text-meta font-semibold text-up hover:underline"
              >
                + Add funds
              </button>
            </div>

            {/* Ladder */}
            <div className="mt-5 space-y-2">
              <span className="kicker mb-1.5 block" id="ladder-label">
                Choose conviction level
              </span>

              <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="ladder-label">
                {ladderOptions.map(({ key, price, label, sub, Icon }) => {
                  const isSelected = boostLadderKind === key;
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => setBoostLadderKind(key)}
                      aria-pressed={isSelected}
                      className={`cursor-pointer rounded-control p-3 text-left transition-colors ${
                        isSelected
                          ? 'bg-gold/[0.14] shadow-[inset_0_0_0_1px_rgb(240_168_36/0.35)]'
                          : 'sunken hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className={`tnum metric text-sm ${isSelected ? 'text-gold-text' : 'text-ink-2'}`}>{price}</span>
                        <Icon className={`h-3.5 w-3.5 ${isSelected ? 'text-gold-text' : 'text-ink-3'}`} />
                      </div>
                      <div className="text-dense font-semibold text-ink">{label}</div>
                      <div className="text-micro text-ink-3">{sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Power boost target rank */}
            {boostLadderKind === 'power' && (
              <div className="sunken mt-4 space-y-3 rounded-control p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="kicker">Target rank to take</span>
                  {quote && (
                    <span className="tnum text-micro text-ink-3">
                      Quote lock {Math.floor(quoteTimeLeft / 60)}:{(quoteTimeLeft % 60).toString().padStart(2, '0')}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((r) => (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setTargetRank(r)}
                      aria-pressed={targetRank === r}
                      className={`tnum cursor-pointer rounded-control py-2 text-dense font-semibold transition-colors ${
                        targetRank === r
                          ? 'bg-gold/[0.16] text-gold-text shadow-[inset_0_0_0_1px_rgb(240_168_36/0.35)]'
                          : 'sunken text-ink-3 hover:text-ink'
                      }`}
                    >
                      Take #{r}
                    </button>
                  ))}
                </div>

                <div className="flex items-baseline justify-between gap-2 border-t border-line pt-2">
                  <span className="text-meta text-ink-3">Calculated needed spend</span>
                  <span className="metric tnum text-lg text-ink">
                    {isLoadingQuote ? 'Pricing…' : quote ? formatUSD(quote.amount_cents / 100) : '—'}
                  </span>
                </div>

                {quoteError && (
                  <div className="flex items-center justify-between gap-2">
                    <span role="alert" className="text-meta text-down">
                      {quoteError}
                    </span>
                    <button type="button" onClick={() => void fetchQuote(targetRank)} className="btn btn-ghost btn-xs">
                      <RefreshCw className="h-3 w-3" />
                      <span>Retry</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4">
              <DisplayNameField id="boost-display-name" value={alias} onChange={setAlias} />
            </div>

            {error && (
              <p role="alert" className="mt-4 flex items-start gap-2 text-dense text-down">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  {error}
                  {retryHint && ' Pressing confirm again retries the same attempt — you cannot be charged twice.'}
                </span>
              </p>
            )}

            {notice && (
              <p role="status" className="mt-4 flex items-start gap-2 text-dense text-ink-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                <span>{notice}</span>
              </p>
            )}

            {/* CTA */}
            <div className="mt-6 space-y-3">
              {hasEnoughFunds ? (
                <button
                  type="button"
                  onClick={() => void handleExecuteBoost()}
                  disabled={isSettling || isLoadingQuote}
                  className="btn btn-gold w-full"
                >
                  {isSettling ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" aria-hidden />
                      <span>Settling from wallet…</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      <span className="tnum">
                        Confirm {boostLadderKind.toUpperCase()} ({formatCents(costCents)})
                      </span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTopUpRecommendation(recommendedTopUpCents(Math.max(0, costCents - balanceCents)));
                    setIsTopUpModalOpen(true);
                  }}
                  disabled={costCents === 0}
                  className="btn btn-ghost w-full text-up"
                >
                  <CreditCard className="h-4 w-4" />
                  <span className="tnum">
                    {costCents === 0
                      ? 'Waiting for a price…'
                      : `Add funds to back this (${formatCents(costCents - balanceCents)} short)`}
                  </span>
                </button>
              )}

              <div className="micro-label flex items-center justify-center gap-1.5 text-ink-3">
                <ShieldCheck className="h-3 w-3" />
                <span>Every backing is written to the public ledger</span>
              </div>
            </div>
          </div>
        </div>
      </ModalPortal>

      <WalletTopUpModal
        isOpen={isTopUpModalOpen}
        onClose={() => {
          setIsTopUpModalOpen(false);
          void refreshWallet();
        }}
        currentBalanceCents={balanceCents}
        onTopUpSuccess={(newBalance) => {
          applyBalance(newBalance);
          setIsTopUpModalOpen(false);
          // No auto-replay: the visitor decides whether to spend again.
          setError('Wallet topped up — press confirm to back this stance.');
        }}
        recommendedCents={topUpRecommendation}
      />
    </>
  );
};

'use client';

import React, { useState, useEffect } from 'react';
import { X, Zap, Trophy, ShieldCheck, Sparkles, CreditCard } from 'lucide-react';
import confetti from 'canvas-confetti';
import { RankedPostView, Quote } from '@/lib/types';
import { formatUSD, formatScore, formatCents } from '@/lib/utils';
import { WalletTopUpModal } from '../wallet/WalletTopUpModal';

interface BoostDrawerProps {
  post: RankedPostView | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: any) => void;
}

export const BoostDrawer: React.FC<BoostDrawerProps> = ({
  post,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [boostLadderKind, setBoostLadderKind] = useState<'boost' | 'super' | 'power'>('boost');
  const [targetRank, setTargetRank] = useState<number>(1);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [walletBalanceCents, setWalletBalanceCents] = useState<number>(0);
  const [quoteTimeLeft, setQuoteTimeLeft] = useState<number>(300);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);

  const fetchWallet = async () => {
    try {
      const res = await fetch('/api/v1/wallet?user_id=usr_marc');
      const data = await res.json();
      if (data.wallet) {
        setWalletBalanceCents(data.wallet.balance_cents);
      }
    } catch (err) {
      console.error('Error loading wallet:', err);
    }
  };

  useEffect(() => {
    if (isOpen && post) {
      fetchWallet();
      setTargetRank(Math.max(1, (post.rank || 2) - 1));
      fetchQuote(targetRank);
    }
  }, [isOpen, post]);

  useEffect(() => {
    if (!isOpen || !quote) return;
    const interval = setInterval(() => {
      const expires = new Date(quote.expires_at).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expires - now) / 1000));
      setQuoteTimeLeft(diff);
      if (diff === 0) fetchQuote(targetRank);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, quote, targetRank]);

  const fetchQuote = async (rank: number) => {
    if (!post) return;
    setIsLoadingQuote(true);
    try {
      const res = await fetch('/api/v1/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: post.id,
          target_rank: rank,
        }),
      });
      const data = await res.json();
      if (data.quote) setQuote(data.quote);
    } catch (err) {
      console.error('Error fetching quote:', err);
    } finally {
      setIsLoadingQuote(false);
    }
  };

  const handleExecuteBoost = async () => {
    if (!post) return;
    setIsSettling(true);

    try {
      if (boostLadderKind === 'boost' || boostLadderKind === 'super') {
        const res = await fetch(`/api/v1/posts/${post.id}/boost`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: boostLadderKind,
            user_id: 'usr_marc',
            payer_display: 'Marc (ShipFast)',
          }),
        });
        const result = await res.json();
        if (res.ok) {
          confetti({
            particleCount: 50,
            spread: 60,
            origin: { y: 0.6 },
            colors: ['#F0A824', '#FFC53D', '#FFFFFF'],
          });
          onSuccess(result);
          onClose();
        } else {
          if (result.error && result.error.includes('Insufficient wallet balance')) {
            setIsTopUpModalOpen(true);
          } else {
            alert(result.error || 'Failed to settle boost');
          }
        }
      } else {
        // Power Boost with quote
        if (!quote) return;
        const res = await fetch('/api/v1/power-boosts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quote_id: quote.quote_id,
            user_id: 'usr_marc',
            payer_display: 'Marc (ShipFast)',
          }),
        });
        const result = await res.json();
        if (res.ok) {
          confetti({
            particleCount: 100,
            spread: 80,
            origin: { y: 0.6 },
            colors: ['#F0A824', '#FFC53D', '#FFFFFF'],
          });
          onSuccess(result);
          onClose();
        } else {
          if (result.error === 'insufficient_wallet_balance') {
            setIsTopUpModalOpen(true);
          } else {
            alert(result.error || 'Failed to execute power boost');
          }
        }
      }
    } catch (err: any) {
      alert(err.message || 'Payment error');
    } finally {
      setIsSettling(false);
    }
  };

  if (!isOpen || !post) return null;

  const costCents =
    boostLadderKind === 'boost'
      ? 10
      : boostLadderKind === 'super'
      ? 100
      : quote?.amount_cents || 1000;

  const hasEnoughFunds = walletBalanceCents >= costCents;

  const ladderOptions = [
    { key: 'boost' as const, price: '$0.10', label: 'Boost', sub: '10 units', Icon: Zap },
    { key: 'super' as const, price: '$1.00', label: 'Super Boost', sub: 'Named entry', Icon: Sparkles },
    { key: 'power' as const, price: '$10+', label: 'Power Boost', sub: 'Target rank #N', Icon: Trophy },
  ];

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[rgba(4,6,12,0.65)] backdrop-blur-md">
        <div className="fixed inset-0" onClick={onClose} />

        <div className="relative z-10 w-full max-w-lg panel sm:rounded-modal rounded-t-modal p-6 sm:p-8 overflow-hidden animate-rise">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-line">
            <div className="min-w-0">
              <div className="kicker-gold kicker flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                <span>Interaction ladder</span>
              </div>
              <h3 className="text-lg font-bold tracking-tight text-ink mt-1 line-clamp-1">
                {post.title}
              </h3>
              <div className="mt-1 flex items-center gap-2 text-meta text-ink-3 flex-wrap">
                <span>
                  Current <strong className="text-ink font-semibold tnum">#{post.rank}</strong>
                </span>
                <span aria-hidden className="text-ink-3/50">·</span>
                <span>
                  Score <strong className="text-gold-text font-semibold tnum">{formatScore(post.display_score)}</strong>
                </span>
                <span aria-hidden className="text-ink-3/50">·</span>
                <span>
                  <strong className="text-ink-2 font-semibold tnum">{post.backers_count.toLocaleString()}</strong> backers
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="btn btn-ghost btn-xs !px-1.5 shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Wallet Balance Display */}
          <div className="mt-4 sunken rounded-control p-3 text-dense flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <CreditCard className="w-3.5 h-3.5 text-ink-3 shrink-0" />
              <span className="text-ink-3">Wallet available</span>
              <strong className="tnum font-semibold text-ink">{formatCents(walletBalanceCents)}</strong>
            </div>

            <button
              onClick={() => setIsTopUpModalOpen(true)}
              className="text-up text-meta font-semibold hover:underline cursor-pointer shrink-0"
            >
              + Refill
            </button>
          </div>

          {/* Interaction Ladder Selector (§6) */}
          <div className="mt-5 space-y-2">
            <label className="kicker block mb-1.5">Choose conviction level</label>

            <div className="grid grid-cols-3 gap-2">
              {ladderOptions.map(({ key, price, label, sub, Icon }) => {
                const isSelected = boostLadderKind === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setBoostLadderKind(key);
                      if (key === 'power') fetchQuote(targetRank);
                    }}
                    className={`rounded-control p-3 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-gold/[0.14] shadow-[inset_0_0_0_1px_rgb(240_168_36/0.35)]'
                        : 'sunken hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`tnum metric text-sm ${isSelected ? 'text-gold-text' : 'text-ink-2'}`}
                      >
                        {price}
                      </span>
                      <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-gold-text' : 'text-ink-3'}`} />
                    </div>
                    <div className="text-dense font-semibold text-ink">{label}</div>
                    <div className="text-micro text-ink-3">{sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* If Power Boost selected: Target Rank Selector */}
          {boostLadderKind === 'power' && (
            <div className="mt-4 sunken rounded-control p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="kicker">Target rank to take</span>
                <span className="text-micro text-ink-3 tnum">
                  Quote lock {Math.floor(quoteTimeLeft / 60)}:{(quoteTimeLeft % 60).toString().padStart(2, '0')}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setTargetRank(r);
                      fetchQuote(r);
                    }}
                    className={`py-2 rounded-control text-dense tnum font-semibold transition-colors cursor-pointer ${
                      targetRank === r
                        ? 'bg-gold/[0.16] text-gold-text shadow-[inset_0_0_0_1px_rgb(240_168_36/0.35)]'
                        : 'sunken text-ink-3 hover:text-ink'
                    }`}
                  >
                    Take #{r}
                  </button>
                ))}
              </div>

              <div className="flex items-baseline justify-between gap-2 pt-2 border-t border-line">
                <span className="text-meta text-ink-3">Calculated needed spend</span>
                <span className="metric text-lg tnum text-ink">
                  {quote ? formatUSD(quote.amount_cents / 100) : '$...'}
                </span>
              </div>
            </div>
          )}

          {/* Action CTA */}
          <div className="mt-6 space-y-3">
            {hasEnoughFunds ? (
              <button
                onClick={handleExecuteBoost}
                disabled={isSettling || isLoadingQuote}
                className="btn btn-gold w-full"
              >
                {isSettling ? (
                  <span>Executing spend from wallet...</span>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>Confirm {boostLadderKind.toUpperCase()} ({formatCents(costCents)})</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => setIsTopUpModalOpen(true)}
                className="btn btn-ghost w-full text-up"
              >
                <CreditCard className="w-4 h-4" />
                <span>Refill wallet to execute ({formatCents(costCents - walletBalanceCents)} shortfall)</span>
              </button>
            )}

            <div className="flex items-center justify-center gap-1.5 micro-label text-ink-3">
              <ShieldCheck className="w-3 h-3" />
              <span>Sub-500ms internal ledger · Instant public record</span>
            </div>
          </div>
        </div>
      </div>

      <WalletTopUpModal
        isOpen={isTopUpModalOpen}
        onClose={() => {
          setIsTopUpModalOpen(false);
          fetchWallet();
        }}
        currentBalanceCents={walletBalanceCents}
        onTopUpSuccess={(newBal) => {
          setWalletBalanceCents(newBal);
          setIsTopUpModalOpen(false);
        }}
        recommendedCents={Math.max(500, costCents - walletBalanceCents)}
      />
    </>
  );
};

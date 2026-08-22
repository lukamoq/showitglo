'use client';

import React, { useState, useEffect } from 'react';
import { X, Zap, Trophy, ShieldCheck, Clock, CheckCircle2, ArrowRight, Sparkles, CreditCard, Flame } from 'lucide-react';
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
            colors: ['#fbbf24', '#f59e0b', '#06b6d4'],
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
            colors: ['#fbbf24', '#f59e0b', '#06b6d4', '#10b981'],
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

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md">
        <div className="fixed inset-0" onClick={onClose} />

        <div className="relative z-10 w-full max-w-lg glass-panel sm:rounded-3xl rounded-t-3xl border border-white/20 p-6 sm:p-8 shadow-2xl overflow-hidden animate-rank-climb">
          {/* Header */}
          <div className="flex items-start justify-between pb-4 border-b border-white/10">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-amber-400 font-semibold uppercase">
                <Zap className="w-3.5 h-3.5" />
                <span>Interaction Ladder</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-1 line-clamp-1">
                {post.title}
              </h3>
              <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span>Current: <strong className="text-white">#{post.rank}</strong></span>
                <span>•</span>
                <span>Score: <strong className="text-amber-400 font-mono">{formatScore(post.display_score)}</strong></span>
                <span>•</span>
                <span><strong className="text-cyan-400">{post.backers_count.toLocaleString()}</strong> backers</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full glass-card hover:bg-white/20 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Wallet Balance Display */}
          <div className="mt-4 p-3 rounded-2xl glass-card flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300">Wallet Available:</span>
              <strong className="font-mono text-white text-sm">{formatCents(walletBalanceCents)}</strong>
            </div>

            <button
              onClick={() => setIsTopUpModalOpen(true)}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer"
            >
              + Refill
            </button>
          </div>

          {/* Interaction Ladder Selector (§6) */}
          <div className="mt-5 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Choose Conviction Level:
            </label>

            <div className="grid grid-cols-3 gap-2">
              {/* Option 1: Boost $0.10 */}
              <button
                onClick={() => setBoostLadderKind('boost')}
                className={`p-3 rounded-2xl text-left transition-all cursor-pointer ${
                  boostLadderKind === 'boost'
                    ? 'bg-amber-500/25 border border-amber-400 shadow-md'
                    : 'glass-card text-slate-400 hover:text-white hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-black text-amber-400 text-sm">$0.10</span>
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="font-bold text-xs text-white">Boost</div>
                <div className="text-[10px] text-slate-400">10 units</div>
              </button>

              {/* Option 2: Super Boost $1.00 */}
              <button
                onClick={() => setBoostLadderKind('super')}
                className={`p-3 rounded-2xl text-left transition-all cursor-pointer ${
                  boostLadderKind === 'super'
                    ? 'bg-cyan-500/25 border border-cyan-400 shadow-md'
                    : 'glass-card text-slate-400 hover:text-white hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-black text-cyan-400 text-sm">$1.00</span>
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="font-bold text-xs text-white">Super Boost</div>
                <div className="text-[10px] text-slate-400">Named entry</div>
              </button>

              {/* Option 3: Power Boost $10+ Quote */}
              <button
                onClick={() => {
                  setBoostLadderKind('power');
                  fetchQuote(targetRank);
                }}
                className={`p-3 rounded-2xl text-left transition-all cursor-pointer ${
                  boostLadderKind === 'power'
                    ? 'bg-purple-500/25 border border-purple-400 shadow-md'
                    : 'glass-card text-slate-400 hover:text-white hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-black text-purple-400 text-sm">$10+</span>
                  <Trophy className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div className="font-bold text-xs text-white">Power Boost</div>
                <div className="text-[10px] text-slate-400">Target Rank #N</div>
              </button>
            </div>
          </div>

          {/* If Power Boost selected: Target Rank Selector */}
          {boostLadderKind === 'power' && (
            <div className="mt-4 p-4 rounded-2xl glass-card border border-purple-500/30 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-purple-300">Target Rank to Take:</span>
                <span className="text-[11px] text-slate-400 font-mono">
                  Quote Lock: {Math.floor(quoteTimeLeft / 60)}:{(quoteTimeLeft % 60).toString().padStart(2, '0')}
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
                    className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      targetRank === r
                        ? 'bg-purple-500 text-white font-black shadow-md'
                        : 'glass-segmented text-slate-300 hover:text-white'
                    }`}
                  >
                    Take #{r}
                  </button>
                ))}
              </div>

              <div className="flex items-baseline justify-between pt-2 border-t border-white/10 text-xs">
                <span className="text-slate-400">Calculated Needed Spend:</span>
                <span className="text-lg font-mono font-black text-white">
                  {quote ? formatUSD(quote.amount_cents / 100) : '$...'}
                </span>
              </div>
            </div>
          )}

          {/* Action CTA */}
          <div className="mt-6 space-y-2">
            {hasEnoughFunds ? (
              <button
                onClick={handleExecuteBoost}
                disabled={isSettling || isLoadingQuote}
                className="w-full btn-glass-gold py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-xl disabled:opacity-50"
              >
                {isSettling ? (
                  <span>Executing Spend from Wallet...</span>
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
                className="w-full btn-glass-cyan py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-xl"
              >
                <CreditCard className="w-4 h-4" />
                <span>Refill Wallet to Execute ({formatCents(costCents - walletBalanceCents)} shortfall)</span>
              </button>
            )}

            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              <span>Sub-500ms Internal Ledger • Instant Public Record</span>
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

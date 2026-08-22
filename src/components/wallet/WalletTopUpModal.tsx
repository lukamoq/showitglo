'use client';

import React, { useState } from 'react';
import { X, CreditCard, Zap, Lock } from 'lucide-react';
import { formatCents } from '@/lib/utils';
import confetti from 'canvas-confetti';

interface WalletTopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalanceCents: number;
  onTopUpSuccess: (newBalanceCents: number) => void;
  recommendedCents?: number;
}

export const WalletTopUpModal: React.FC<WalletTopUpModalProps> = ({
  isOpen,
  onClose,
  currentBalanceCents,
  onTopUpSuccess,
  recommendedCents,
}) => {
  const [selectedCents, setSelectedCents] = useState<number>(recommendedCents || 300); // default $3.00 accessible top-up
  const [customDollars, setCustomDollars] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'apple_pay' | 'link' | 'card'>('apple_pay');
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMethod, setSuccessMethod] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectChip = (cents: number) => {
    setSelectedCents(cents);
    setCustomDollars('');
  };

  const handleCustomChange = (val: string) => {
    setCustomDollars(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 1) {
      setSelectedCents(Math.round(num * 100));
    }
  };

  const handleExecuteTopUp = async (method = paymentMethod) => {
    if (selectedCents < 100) {
      alert('Minimum top-up is $1.00');
      return;
    }
    setIsProcessing(true);
    setSuccessMethod(method);

    try {
      const res = await fetch('/api/v1/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_cents: selectedCents,
          user_id: 'usr_marc',
          payment_method: method,
        }),
      });
      const data = await res.json();
      if (res.ok && data.wallet) {
        confetti({
          particleCount: 70,
          spread: 65,
          origin: { y: 0.6 },
          colors: ['#F0A824', '#FFC53D', '#FFFFFF'],
        });
        setTimeout(() => {
          onTopUpSuccess(data.wallet.balance_cents);
          onClose();
          setIsProcessing(false);
          setSuccessMethod(null);
        }, 800);
      } else {
        alert(data.error || 'Failed to top up wallet');
        setIsProcessing(false);
      }
    } catch (err: any) {
      alert(err.message || 'Top-up error');
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(4,6,12,0.65)] backdrop-blur-md">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md panel rounded-modal p-6 sm:p-8 overflow-hidden animate-rise">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-line">
          <div className="min-w-0">
            <div className="kicker-gold kicker flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" />
              <span>Prepaid arena wallet</span>
            </div>
            <h3 className="text-lg font-bold tracking-tight text-ink mt-1">
              Refill your balance
            </h3>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost btn-xs !px-1.5 shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Balance Banner */}
        <div className="my-4 sunken rounded-control p-4 flex items-center justify-between gap-3">
          <div>
            <span className="micro-label text-ink-3 block">Current balance</span>
            <span className="metric text-2xl text-ink tnum">
              {formatCents(currentBalanceCents)}
            </span>
          </div>

          <div className="text-right">
            <span className="text-meta text-up font-medium block">
              100% refundable
            </span>
            <span className="text-micro text-ink-3">
              Closed-loop credits
            </span>
          </div>
        </div>

        {/* Top-Up Amount Chips */}
        <div className="space-y-2.5">
          <label className="kicker block mb-1.5">
            Select top-up amount
          </label>

          <div className="grid grid-cols-4 gap-2">
            {[100, 300, 500, 1000].map((cents) => (
              <button
                key={cents}
                onClick={() => handleSelectChip(cents)}
                className={`py-2 rounded-control text-dense tnum font-semibold transition-colors cursor-pointer ${
                  selectedCents === cents && !customDollars
                    ? 'bg-gold/[0.16] text-gold-text shadow-[inset_0_0_0_1px_rgb(240_168_36/0.35)]'
                    : 'sunken text-ink-3 hover:text-ink'
                }`}
              >
                ${cents / 100}
              </button>
            ))}
          </div>

          {/* Custom Input */}
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3 text-dense tnum">
              $
            </span>
            <input
              type="number"
              min="1"
              step="1"
              value={customDollars}
              onChange={(e) => handleCustomChange(e.target.value)}
              placeholder="Custom amount ($1 min, $50 max)..."
              className="field pl-7 text-dense tnum"
            />
          </div>
        </div>

        {/* 1-Tap Fast Checkout Rails: Apple Pay & Link */}
        <div className="mt-5 space-y-2">
          <label className="kicker block mb-1.5">
            Instant 1-tap checkout
          </label>

          {/* Apple Pay Button */}
          <button
            type="button"
            onClick={() => handleExecuteTopUp('apple_pay')}
            disabled={isProcessing}
            className="w-full py-3 px-4 rounded-control bg-white hover:bg-white/90 text-black font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:-translate-y-px active:scale-[0.97] cursor-pointer disabled:opacity-50"
          >
            {isProcessing && successMethod === 'apple_pay' ? (
              <span className="flex items-center gap-2 text-dense text-black">
                <span className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                Authorizing Face ID / Touch ID...
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-dense text-black/60">Pay with</span>
                <span className="font-bold text-base flex items-center tracking-tight">
                  <span className="text-lg leading-none -mt-0.5"></span>Pay
                </span>
                <span className="text-dense tnum text-black/50 ml-1">({formatCents(selectedCents)})</span>
              </div>
            )}
          </button>

          {/* Stripe Link 1-Click Button */}
          <button
            type="button"
            onClick={() => handleExecuteTopUp('link')}
            disabled={isProcessing}
            className="w-full py-3 px-4 rounded-control bg-[#00D66F] hover:bg-[#00c063] text-[#0A2540] font-bold text-sm flex items-center justify-center gap-2 transition-all hover:-translate-y-px active:scale-[0.97] cursor-pointer disabled:opacity-50"
          >
            {isProcessing && successMethod === 'link' ? (
              <span className="flex items-center gap-2 text-dense text-[#0A2540]">
                <span className="w-4 h-4 rounded-full border-2 border-[#0A2540] border-t-transparent animate-spin" />
                Processing 1-click Link...
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 fill-current" />
                <span>Pay with</span>
                <span className="font-extrabold tracking-tight underline underline-offset-2">Link</span>
                <span className="text-dense tnum opacity-80">({formatCents(selectedCents)})</span>
              </div>
            )}
          </button>
        </div>

        {/* Divider */}
        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-line" />
          <span className="micro-label text-ink-3">Or standard card</span>
          <div className="flex-1 h-px bg-line" />
        </div>

        {/* Card Top-Up Button */}
        <button
          onClick={() => handleExecuteTopUp('card')}
          disabled={isProcessing || selectedCents < 500}
          className="btn btn-ghost btn-sm w-full"
        >
          {isProcessing && successMethod === 'card' ? (
            <span>Charging card...</span>
          ) : (
            <>
              <CreditCard className="w-3.5 h-3.5" />
              <span>Credit or debit card ({formatCents(selectedCents)})</span>
            </>
          )}
        </button>

        {/* Trust & Safety Footer */}
        <div className="mt-4 pt-3 border-t border-line flex items-center justify-between gap-3 micro-label text-ink-3">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3 h-3" />
            <span>256-bit Stripe encryption</span>
          </div>
          <span className="text-up">0% platform fee</span>
        </div>
      </div>
    </div>
  );
};

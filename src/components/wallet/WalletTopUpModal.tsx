'use client';

import React, { useState } from 'react';
import { X, CreditCard, ShieldCheck, Sparkles, Check, ArrowRight, Zap, Smartphone, Lock } from 'lucide-react';
import { formatUSD, formatCents } from '@/lib/utils';
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
  const [selectedCents, setSelectedCents] = useState<number>(recommendedCents || 1000); // default $10.00
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
    if (!isNaN(num) && num >= 5) {
      setSelectedCents(Math.round(num * 100));
    }
  };

  const handleExecuteTopUp = async (method = paymentMethod) => {
    if (selectedCents < 500) {
      alert('Minimum top-up is $5.00');
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
          colors: ['#10b981', '#06b6d4', '#fbbf24', '#ffffff'],
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md glass-panel rounded-3xl border border-white/20 p-6 sm:p-8 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 font-semibold uppercase">
              <CreditCard className="w-3.5 h-3.5" />
              <span>Prepaid Arena Wallet</span>
            </div>
            <h3 className="text-xl font-bold text-white mt-0.5">
              Refill Your Balance
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full glass-card hover:bg-white/20 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Balance Banner */}
        <div className="my-4 p-4 rounded-2xl glass-card border border-emerald-500/30 bg-emerald-950/20 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-slate-400 uppercase font-mono block">Current Balance</span>
            <span className="text-2xl font-black font-mono text-white tabular-nums">
              {formatCents(currentBalanceCents)}
            </span>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-emerald-400 font-mono font-semibold block">
              100% Refundable
            </span>
            <span className="text-[10px] text-slate-500">
              Closed-loop credits
            </span>
          </div>
        </div>

        {/* Top-Up Amount Chips */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-slate-300 block">
            Select Top-Up Amount:
          </label>

          <div className="grid grid-cols-4 gap-2">
            {[500, 1000, 2000, 5000].map((cents) => (
              <button
                key={cents}
                onClick={() => handleSelectChip(cents)}
                className={`py-2.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  selectedCents === cents && !customDollars
                    ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 font-black'
                    : 'glass-card text-slate-300 hover:text-white hover:border-white/20'
                }`}
              >
                ${cents / 100}
              </button>
            ))}
          </div>

          {/* Custom Input */}
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono">
              $
            </span>
            <input
              type="number"
              min="5"
              step="1"
              value={customDollars}
              onChange={(e) => handleCustomChange(e.target.value)}
              placeholder="Custom amount ($5 min, $500 max)..."
              className="w-full pl-8 pr-4 py-2 rounded-xl glass-card border border-white/10 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-400/50"
            />
          </div>
        </div>

        {/* 1-Tap Fast Checkout Rails: Apple Pay & Link */}
        <div className="mt-5 space-y-2">
          <label className="text-[11px] font-semibold text-slate-400 uppercase font-mono block">
            Instant 1-Tap Checkout:
          </label>

          {/* Apple Pay Button */}
          <button
            type="button"
            onClick={() => handleExecuteTopUp('apple_pay')}
            disabled={isProcessing}
            className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-slate-100 text-black font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-xl hover:scale-[1.01] active:scale-[0.99] cursor-pointer disabled:opacity-50"
          >
            {isProcessing && successMethod === 'apple_pay' ? (
              <span className="flex items-center gap-2 font-mono text-xs text-black">
                <span className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                Authorizing Face ID / Touch ID...
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-600 font-mono">Pay with</span>
                <span className="font-bold text-base flex items-center tracking-tight">
                  <span className="text-lg leading-none -mt-0.5"></span>Pay
                </span>
                <span className="text-xs font-mono text-slate-500 ml-1">({formatCents(selectedCents)})</span>
              </div>
            )}
          </button>

          {/* Stripe Link 1-Click Button */}
          <button
            type="button"
            onClick={() => handleExecuteTopUp('link')}
            disabled={isProcessing}
            className="w-full py-3 px-4 rounded-2xl bg-[#00D66F] hover:bg-[#00c063] text-[#0A2540] font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-xl hover:scale-[1.01] active:scale-[0.99] cursor-pointer disabled:opacity-50"
          >
            {isProcessing && successMethod === 'link' ? (
              <span className="flex items-center gap-2 font-mono text-xs text-[#0A2540]">
                <span className="w-4 h-4 rounded-full border-2 border-[#0A2540] border-t-transparent animate-spin" />
                Processing 1-Click Link...
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 fill-current" />
                <span>Pay with</span>
                <span className="font-black tracking-tight underline underline-offset-2">Link</span>
                <span className="text-xs font-mono opacity-80">({formatCents(selectedCents)})</span>
              </div>
            )}
          </button>
        </div>

        {/* Divider */}
        <div className="my-3 flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[10px] text-slate-500 font-mono uppercase">Or Standard Card</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Card Top-Up Button */}
        <button
          onClick={() => handleExecuteTopUp('card')}
          disabled={isProcessing || selectedCents < 500}
          className="w-full btn-glass-dark py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
        >
          {isProcessing && successMethod === 'card' ? (
            <span>Charging card...</span>
          ) : (
            <>
              <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
              <span>Credit or Debit Card ({formatCents(selectedCents)})</span>
            </>
          )}
        </button>

        {/* Trust & Safety Footer */}
        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-500">
          <div className="flex items-center gap-1">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span>256-Bit Stripe Encryption</span>
          </div>
          <span className="text-emerald-400/90 font-mono">0% Platform Fee</span>
        </div>
      </div>
    </div>
  );
};

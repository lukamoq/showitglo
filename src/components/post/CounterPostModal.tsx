'use client';

import React, { useState } from 'react';
import { X, Swords, ShieldCheck, Zap, AlertTriangle, Send } from 'lucide-react';
import { RankedPostView } from '@/lib/types';
import { runGate0Moderation } from '@/lib/moderation/gate0';
import { formatUSD } from '@/lib/utils';
import confetti from 'canvas-confetti';

interface CounterPostModalProps {
  parentPost: RankedPostView | null;
  isOpen: boolean;
  onClose: () => void;
  onCounterCreated: (counterPost: any) => void;
}

export const CounterPostModal: React.FC<CounterPostModalProps> = ({
  parentPost,
  isOpen,
  onClose,
  onCounterCreated,
}) => {
  const [rebuttalTitle, setRebuttalTitle] = useState('');
  const [rebuttalBody, setRebuttalBody] = useState('');
  const [authorDisplay, setAuthorDisplay] = useState('Marc (ShipFast)');
  const [initialBoostCents, setInitialBoostCents] = useState(500); // $5.00
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !parentPost) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rebuttalTitle.trim()) return;

    const mod = runGate0Moderation(rebuttalTitle, rebuttalBody);
    if (!mod.passed) {
      setErrorMsg(mod.reason || 'Counter-opinion flagged by moderation.');
      return;
    }
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/v1/posts/${parentPost.id}/counter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: rebuttalTitle.trim(),
          content: rebuttalBody.trim(),
          author_display: authorDisplay,
          initial_boost_cents: initialBoostCents,
        }),
      });

      const data = await res.json();
      if (res.ok && data.post) {
        confetti({
          particleCount: 70,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#f43f5e', '#fbbf24', '#06b6d4'],
        });
        onCounterCreated(data.post);
        onClose();
        setRebuttalTitle('');
        setRebuttalBody('');
      } else {
        setErrorMsg(data.error || 'Failed to submit counter-opinion.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Submission error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-xl glass-panel rounded-3xl border border-rose-500/40 p-6 sm:p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto bg-gradient-to-b from-slate-950 via-rose-950/20 to-slate-950">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-rose-400 font-semibold uppercase">
              <Swords className="w-3.5 h-3.5 animate-pulse" />
              <span>Declare a Fight • Counter-Opinion</span>
            </div>
            <h3 className="text-xl font-bold text-white mt-0.5">
              Launch Counter Rebuttal
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full glass-card hover:bg-white/20 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Parent Opinion Reference */}
        <div className="mt-4 p-4 rounded-2xl glass-card border border-white/10 text-xs">
          <span className="text-[10px] text-slate-400 uppercase font-mono block mb-1">
            Opposing Statement ({parentPost.author_display})
          </span>
          <p className="font-bold text-slate-200 line-clamp-2">
            &ldquo;{parentPost.title}&rdquo;
          </p>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Your Counter-Opinion Headline *
            </label>
            <input
              type="text"
              required
              maxLength={200}
              value={rebuttalTitle}
              onChange={(e) => setRebuttalTitle(e.target.value)}
              placeholder="State the counter-thesis with conviction..."
              className="w-full px-4 py-2.5 rounded-xl glass-card border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-400/50"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Evidence / Supporting Arguments
            </label>
            <textarea
              rows={3}
              value={rebuttalBody}
              onChange={(e) => setRebuttalBody(e.target.value)}
              placeholder="Explain why this side holds true. Counter-opinions form permanent public fight pairs."
              className="w-full px-4 py-2.5 rounded-xl glass-card border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-400/50 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Initial Backing from Wallet:
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[100, 500, 1000, 2500].map((cents) => (
                <button
                  type="button"
                  key={cents}
                  onClick={() => setInitialBoostCents(cents)}
                  className={`py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    initialBoostCents === cents
                      ? 'bg-rose-500 text-white shadow-md'
                      : 'glass-card text-slate-300 hover:text-white'
                  }`}
                >
                  ${cents / 100}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !rebuttalTitle.trim()}
              className="w-full btn-glass-cyan py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-xl disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Locking Fight Pair in Ledger...</span>
              ) : (
                <>
                  <Swords className="w-4 h-4" />
                  <span>Launch Fight & Back ({formatUSD(initialBoostCents / 100)})</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

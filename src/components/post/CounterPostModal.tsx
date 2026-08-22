'use client';

import React, { useState } from 'react';
import { X, Swords, AlertTriangle } from 'lucide-react';
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
          colors: ['#EF4E66', '#F0A824', '#FFFFFF'],
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(4,6,12,0.65)] backdrop-blur-md">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-xl panel rounded-modal p-6 sm:p-8 overflow-hidden max-h-[90vh] overflow-y-auto animate-rise">
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-line">
          <div className="min-w-0">
            <div className="kicker text-down flex items-center gap-1.5">
              <Swords className="w-3.5 h-3.5" />
              <span>Declare a fight · Counter-opinion</span>
            </div>
            <h3 className="text-lg font-bold tracking-tight text-ink mt-1">
              Launch counter rebuttal
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

        {/* Parent Opinion Reference */}
        <div className="mt-4 sunken rounded-control p-4 border-l-[3px] border-l-down">
          <span className="micro-label text-ink-3 block mb-1">
            Opposing statement ({parentPost.author_display})
          </span>
          <p className="text-dense text-ink-2 font-medium line-clamp-2">
            &ldquo;{parentPost.title}&rdquo;
          </p>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-control bg-down/10 border border-down/30 text-down text-dense p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="kicker block mb-1.5">
              Your counter-opinion headline *
            </label>
            <input
              type="text"
              required
              maxLength={200}
              value={rebuttalTitle}
              onChange={(e) => setRebuttalTitle(e.target.value)}
              placeholder="State the counter-thesis with conviction..."
              className="field"
            />
          </div>

          <div>
            <label className="kicker block mb-1.5">
              Evidence / supporting arguments
            </label>
            <textarea
              rows={3}
              value={rebuttalBody}
              onChange={(e) => setRebuttalBody(e.target.value)}
              placeholder="Explain why this side holds true. Counter-opinions form permanent public fight pairs."
              className="field resize-none"
            />
          </div>

          <div>
            <label className="kicker block mb-1.5">
              Initial backing from wallet
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[100, 500, 1000, 2500].map((cents) => (
                <button
                  type="button"
                  key={cents}
                  onClick={() => setInitialBoostCents(cents)}
                  className={`py-2 rounded-control text-dense tnum font-semibold transition-colors cursor-pointer ${
                    initialBoostCents === cents
                      ? 'bg-down/[0.14] text-down shadow-[inset_0_0_0_1px_rgb(239_78_102/0.35)]'
                      : 'sunken text-ink-3 hover:text-ink'
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
              className="btn btn-danger w-full"
            >
              {isSubmitting ? (
                <span>Locking fight pair in ledger...</span>
              ) : (
                <>
                  <Swords className="w-4 h-4" />
                  <span>Launch fight &amp; back ({formatUSD(initialBoostCents / 100)})</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

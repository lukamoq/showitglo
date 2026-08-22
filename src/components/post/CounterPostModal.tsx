'use client';

import React, { useRef, useState } from 'react';
import { X, Swords, AlertTriangle } from 'lucide-react';
import confetti from 'canvas-confetti';

import { RankedPostView } from '@/lib/types';
import { runGate0Moderation } from '@/lib/moderation/gate0';
import { formatCents } from '@/lib/utils';
import { apiPost, errorText, insufficientFunds, recommendedTopUpCents, useDisplayName } from '../system/api';
import { DisplayNameField } from '../system/DisplayNameField';
import { ModalPortal } from '../system/ModalPortal';
import { useModalChrome } from '../system/useModalChrome';
import { useWallet } from '../system/useWallet';
import { WalletTopUpModal } from '../wallet/WalletTopUpModal';

interface CounterPostModalProps {
  parentPost: RankedPostView | null;
  isOpen: boolean;
  onClose: () => void;
  onCounterCreated: (counterPost: unknown) => void;
}

/** Server-priced backings; anything else is rejected. */
const BACKING_OPTIONS = [0, 10, 100, 1000];

interface CounterResponse {
  post?: { id: string; title: string };
  boost_error?: { shortfall_cents?: number };
}

export const CounterPostModal: React.FC<CounterPostModalProps> = ({
  parentPost,
  isOpen,
  onClose,
  onCounterCreated,
}) => {
  const [rebuttalTitle, setRebuttalTitle] = useState('');
  const [rebuttalBody, setRebuttalBody] = useState('');
  const [authorDisplay, setAuthorDisplay] = useDisplayName();
  const [initialBoostCents, setInitialBoostCents] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpRecommendation, setTopUpRecommendation] = useState<number | undefined>(undefined);

  const inFlightRef = useRef(false);
  const containerRef = useModalChrome(isOpen, onClose);
  const { balanceCents, refresh: refreshWallet } = useWallet(isOpen);

  if (!isOpen || !parentPost) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current || !rebuttalTitle.trim()) return;

    const mod = runGate0Moderation(rebuttalTitle, rebuttalBody);
    if (!mod.passed) {
      setErrorMsg(mod.reason || 'Counter-opinion flagged by moderation.');
      return;
    }

    inFlightRef.current = true;
    setErrorMsg(null);
    setIsSubmitting(true);

    const res = await apiPost<CounterResponse>(`/api/v1/posts/${parentPost.id}/counter`, {
      title: rebuttalTitle.trim(),
      content: rebuttalBody.trim(),
      author_display: authorDisplay,
      initial_boost_cents: initialBoostCents,
    });

    inFlightRef.current = false;
    setIsSubmitting(false);

    if (!res.ok || !res.data?.post) {
      const shortfall = insufficientFunds(res);
      if (shortfall) {
        setTopUpRecommendation(recommendedTopUpCents(shortfall.shortfallCents));
        setErrorMsg('Not enough wallet balance for that backing. Add funds or choose "None".');
        setIsTopUpOpen(true);
        return;
      }
      setErrorMsg(errorText(res, 'Failed to publish your counter-opinion.'));
      return;
    }

    if (res.data.boost_error) {
      setTopUpRecommendation(recommendedTopUpCents(res.data.boost_error.shortfall_cents ?? 0));
      setErrorMsg('Your rebuttal is live, but the backing could not be charged — add funds and boost it.');
      onCounterCreated(res.data.post);
      return;
    }

    confetti({
      particleCount: 70,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#EF4E66', '#F0A824', '#FFFFFF'],
    });
    onCounterCreated(res.data.post);
    onClose();
    setRebuttalTitle('');
    setRebuttalBody('');
  };

  return (
    <>
      <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(4,6,12,0.65)] backdrop-blur-md">
          <div className="absolute inset-0" onClick={onClose} aria-hidden />

          <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="counter-title"
            className="relative z-10 w-full max-w-xl panel rounded-modal p-6 sm:p-8 overflow-hidden max-h-[90vh] overflow-y-auto animate-rise"
          >
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-line">
              <div className="min-w-0">
                <div className="kicker text-down flex items-center gap-1.5">
                  <Swords className="w-3.5 h-3.5" />
                  <span>Declare a fight · Counter-opinion</span>
                </div>
                <h3 id="counter-title" className="text-lg font-bold tracking-tight text-ink mt-1">
                  Launch counter rebuttal
                </h3>
              </div>

              <button type="button" onClick={onClose} className="btn btn-ghost btn-xs !px-1.5 shrink-0" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Parent Opinion Reference */}
            <div className="mt-4 sunken rounded-control p-4 border-l-[3px] border-l-down">
              <span className="micro-label text-ink-3 block mb-1">
                Opposing statement ({parentPost.author_display})
              </span>
              <p className="text-dense text-ink-2 font-medium line-clamp-2">&ldquo;{parentPost.title}&rdquo;</p>
            </div>

            {errorMsg && (
              <div
                id="counter-error"
                role="alert"
                className="mt-4 rounded-control bg-down/10 border border-down/30 text-down text-dense p-3 flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="counter-headline" className="kicker block mb-1.5">
                  Your counter-opinion headline *
                </label>
                <input
                  id="counter-headline"
                  type="text"
                  required
                  maxLength={200}
                  value={rebuttalTitle}
                  onChange={(e) => setRebuttalTitle(e.target.value)}
                  aria-describedby={errorMsg ? 'counter-error' : undefined}
                  placeholder="State the counter-thesis with conviction…"
                  className="field"
                />
              </div>

              <div>
                <label htmlFor="counter-body" className="kicker block mb-1.5">
                  Evidence / supporting arguments
                </label>
                <textarea
                  id="counter-body"
                  rows={3}
                  maxLength={2000}
                  value={rebuttalBody}
                  onChange={(e) => setRebuttalBody(e.target.value)}
                  placeholder="Explain why this side holds true. Counter-opinions form permanent public fight pairs."
                  className="field resize-none"
                />
              </div>

              <DisplayNameField id="counter-alias" value={authorDisplay} onChange={setAuthorDisplay} />

              <div>
                <span className="kicker block mb-1.5" id="counter-backing-label">
                  Initial backing from wallet
                </span>
                <div className="grid grid-cols-4 gap-2" role="group" aria-labelledby="counter-backing-label">
                  {BACKING_OPTIONS.map((cents) => (
                    <button
                      type="button"
                      key={cents}
                      onClick={() => setInitialBoostCents(cents)}
                      aria-pressed={initialBoostCents === cents}
                      className={`py-2 rounded-control text-dense tnum font-semibold transition-colors cursor-pointer ${
                        initialBoostCents === cents
                          ? 'bg-down/[0.14] text-down shadow-[inset_0_0_0_1px_rgb(239_78_102/0.35)]'
                          : 'sunken text-ink-3 hover:text-ink'
                      }`}
                    >
                      {cents === 0 ? 'None' : cents < 100 ? `${cents}¢` : `$${cents / 100}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button type="submit" disabled={isSubmitting || !rebuttalTitle.trim()} className="btn btn-danger w-full">
                  {isSubmitting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
                      <span>Locking fight pair in ledger…</span>
                    </>
                  ) : (
                    <>
                      <Swords className="w-4 h-4" />
                      <span className="tnum">
                        {initialBoostCents === 0
                          ? 'Launch fight'
                          : `Launch fight & back (${formatCents(initialBoostCents)})`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>

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
        }}
        recommendedCents={topUpRecommendation}
      />
    </>
  );
};

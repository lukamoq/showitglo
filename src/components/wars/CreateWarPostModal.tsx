'use client';

import React, { useRef, useState } from 'react';
import { X, Swords, AlertCircle, Flag } from 'lucide-react';
import confetti from 'canvas-confetti';

import { runGate0Moderation } from '@/lib/moderation/gate0';
import { formatCents } from '@/lib/utils';
import { Post } from '@/lib/types';
import { apiPost, errorText, insufficientFunds, recommendedTopUpCents, useDisplayName } from '../system/api';
import { DisplayNameField } from '../system/DisplayNameField';
import { ModalPortal } from '../system/ModalPortal';
import { useModalChrome } from '../system/useModalChrome';
import { useWallet } from '../system/useWallet';
import { WalletTopUpModal } from '../wallet/WalletTopUpModal';

interface CreateWarPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWarCreated: (war: { post_a: Post; post_b: Post }) => void;
}

/** The server only accepts these opening backings, per side; anything else is a 400. */
const BACKING_OPTIONS = [0, 10, 100, 1000];

type SideKey = 'a' | 'b';

interface SideState {
  title: string;
  content: string;
  backingCents: number;
}

const EMPTY_SIDE: SideState = { title: '', content: '', backingCents: 0 };

interface WarResponse {
  war?: { id: string; post_a: Post; post_b: Post };
  boost_errors?: Partial<Record<SideKey, { shortfall_cents?: number }>>;
}

const SIDE_COPY: Record<SideKey, { label: string; titlePlaceholder: string; bodyPlaceholder: string }> = {
  a: {
    label: 'Side A',
    titlePlaceholder: 'e.g. Remote work made teams more honest',
    bodyPlaceholder: 'The strongest case for this side…',
  },
  b: {
    label: 'Side B',
    titlePlaceholder: 'e.g. Remote work quietly gutted mentorship',
    bodyPlaceholder: 'The strongest case against it…',
  },
};

/**
 * Declare a war: two rival stances published in one act.
 *
 * Both sides are written on one sheet split by a seam, and neither is styled as
 * the favourite — no colour, no ordering weight, no default backing on A. Gold
 * is reserved for the single submit, because on this board the leader is
 * decided by money after publication, never by the person who typed the pair.
 */
export const CreateWarPostModal: React.FC<CreateWarPostModalProps> = ({ isOpen, onClose, onWarCreated }) => {
  const [sides, setSides] = useState<Record<SideKey, SideState>>({ a: EMPTY_SIDE, b: EMPTY_SIDE });
  const [authorDisplay, setAuthorDisplay] = useDisplayName();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpRecommendation, setTopUpRecommendation] = useState<number | undefined>(undefined);

  const inFlightRef = useRef(false);
  const containerRef = useModalChrome(isOpen, onClose);
  const { balanceCents, refresh: refreshWallet } = useWallet(isOpen);

  if (!isOpen) return null;

  const totalCents = sides.a.backingCents + sides.b.backingCents;
  const canSubmit = sides.a.title.trim().length > 0 && sides.b.title.trim().length > 0;

  const patchSide = (key: SideKey, patch: Partial<SideState>) =>
    setSides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const resetSides = () => setSides({ a: EMPTY_SIDE, b: EMPTY_SIDE });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current || !canSubmit) return;

    if (sides.a.title.trim().toLowerCase() === sides.b.title.trim().toLowerCase()) {
      setErrorMsg('The two sides have to say different things — that is what makes it a war.');
      return;
    }

    // Screened here as well as on the server so a rejection costs a keystroke
    // rather than a round trip.
    for (const key of ['a', 'b'] as const) {
      const verdict = runGate0Moderation(sides[key].title, sides[key].content);
      if (!verdict.passed) {
        setErrorMsg(
          `${SIDE_COPY[key].label}: ${verdict.reason || 'did not pass the automated moderation check.'}`
        );
        return;
      }
    }

    inFlightRef.current = true;
    setErrorMsg(null);
    setIsSubmitting(true);

    const payload = (key: SideKey) => ({
      title: sides[key].title.trim(),
      content: sides[key].content.trim() ? sides[key].content.trim() : null,
      initial_boost_cents: sides[key].backingCents,
    });

    const res = await apiPost<WarResponse>('/api/v1/wars', {
      side_a: payload('a'),
      side_b: payload('b'),
      author_display: authorDisplay,
      category_id: 'global',
    });

    inFlightRef.current = false;
    setIsSubmitting(false);

    if (!res.ok || !res.data?.war) {
      const shortfall = insufficientFunds(res);
      if (shortfall) {
        setTopUpRecommendation(recommendedTopUpCents(shortfall.shortfallCents));
        setErrorMsg('Not enough wallet balance for those opening backings. Add funds, or set both to "None".');
        setIsTopUpOpen(true);
        return;
      }
      setErrorMsg(errorText(res, 'This war could not be declared.'));
      return;
    }

    const war = res.data.war;

    // The war exists; only an opening backing failed. Say so rather than
    // closing as if everything settled.
    const failed = res.data.boost_errors;
    if (failed && (failed.a || failed.b)) {
      const shortfallCents = failed.a?.shortfall_cents ?? failed.b?.shortfall_cents ?? 0;
      setTopUpRecommendation(recommendedTopUpCents(shortfallCents));
      setErrorMsg(
        'Both sides are live, but an opening backing could not be charged — add funds and back a side from the board.'
      );
      onWarCreated(war);
      return;
    }

    confetti({
      particleCount: 110,
      spread: 88,
      origin: { y: 0.6 },
      colors: ['#EF4E66', '#F0A824', '#FFC53D', '#FFFFFF'],
    });
    onWarCreated(war);
    onClose();
    resetSides();
  };

  const renderSide = (key: SideKey) => {
    const copy = SIDE_COPY[key];
    const side = sides[key];

    return (
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Flag className="w-3.5 h-3.5 text-ink-3" aria-hidden />
          <span className="micro-label text-ink-3">{copy.label}</span>
        </div>

        <div>
          <label htmlFor={`war-${key}-title`} className="kicker mb-1.5 block">
            Stance *
          </label>
          <input
            id={`war-${key}-title`}
            type="text"
            required
            maxLength={200}
            value={side.title}
            onChange={(e) => patchSide(key, { title: e.target.value })}
            aria-describedby={errorMsg ? 'create-war-error' : undefined}
            placeholder={copy.titlePlaceholder}
            className="field"
          />
        </div>

        <div>
          <label htmlFor={`war-${key}-body`} className="kicker mb-1.5 block">
            Argument
          </label>
          <textarea
            id={`war-${key}-body`}
            rows={3}
            maxLength={2000}
            value={side.content}
            onChange={(e) => patchSide(key, { content: e.target.value })}
            placeholder={copy.bodyPlaceholder}
            className="field resize-none"
          />
        </div>

        <div>
          <span className="kicker mb-1.5 block" id={`war-${key}-backing-label`}>
            Opening backing
          </span>
          <div className="grid grid-cols-4 gap-1.5" role="group" aria-labelledby={`war-${key}-backing-label`}>
            {BACKING_OPTIONS.map((cents) => (
              <button
                type="button"
                key={cents}
                onClick={() => patchSide(key, { backingCents: cents })}
                aria-pressed={side.backingCents === cents}
                className={`py-2 rounded-control text-meta tnum font-semibold transition-colors cursor-pointer ${
                  side.backingCents === cents
                    ? 'bg-gold/[0.16] text-gold-text shadow-[inset_0_0_0_1px_rgb(240_168_36/0.35)]'
                    : 'sunken text-ink-3 hover:text-ink'
                }`}
              >
                {cents === 0 ? 'None' : cents < 100 ? `${cents}¢` : `$${cents / 100}`}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(3,4,8,0.72)] backdrop-blur-md">
          <div className="absolute inset-0" onClick={onClose} aria-hidden />

          <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-war-post-title"
            className="relative z-10 w-full max-w-3xl panel rounded-modal overflow-hidden max-h-[90vh] overflow-y-auto animate-rise"
          >
            <div className="flex items-start justify-between gap-4 px-6 sm:px-8 pt-6 sm:pt-7 pb-5 border-b border-line">
              <div className="min-w-0">
                <span className="kicker">Two stances, one act</span>
                <h2 id="create-war-post-title" className="display-3 text-ink mt-2">
                  Post a war
                </h2>
                <p className="text-meta text-ink-3 mt-1.5 max-w-[52ch]">
                  Publish both sides of an argument at once. They go on the board as a pair and fight
                  for rank — the crowd&apos;s money decides which one wins.
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="btn btn-bare btn-sm -mr-2 -mt-1 shrink-0"
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>

            {errorMsg && (
              <div className="px-6 sm:px-8 pt-5">
                <div
                  id="create-war-error"
                  role="alert"
                  className="rounded-control border border-down/30 bg-down/10 px-3.5 py-2.5 text-dense text-down flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                  <span>{errorMsg}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* The seam. Neither side is tinted, weighted or pre-backed —
                  styling a favourite here would be the product making the
                  judgement it exists to refuse. */}
              <div className="relative mt-5 mx-6 sm:mx-8 rounded-card border border-line overflow-hidden grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-line">
                {renderSide('a')}
                {renderSide('b')}

                <span
                  aria-hidden
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:flex items-center justify-center w-9 h-9 rounded-full bg-bg-sunken border border-line-strong"
                >
                  <Swords className="w-4 h-4 text-ink-3" />
                </span>
              </div>

              <div className="px-6 sm:px-8 py-5 space-y-4">
                <DisplayNameField id="create-war-alias" value={authorDisplay} onChange={setAuthorDisplay} />

                <div className="sunken rounded-control px-3.5 py-3 flex items-center justify-between gap-3">
                  <span className="text-meta text-ink-3">
                    Both sides are published under your alias. A war spends two of your five hourly posts.
                  </span>
                  <span className="metric text-base tnum leading-none text-ink shrink-0">
                    {totalCents === 0 ? 'Free' : formatCents(totalCents)}
                  </span>
                </div>

                <button type="submit" disabled={isSubmitting || !canSubmit} className="btn btn-gold w-full">
                  {isSubmitting ? (
                    <>
                      <span
                        className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black"
                        aria-hidden
                      />
                      <span>Declaring the war…</span>
                    </>
                  ) : (
                    <>
                      <Swords className="w-4 h-4" aria-hidden />
                      <span className="tnum">
                        {totalCents === 0 ? 'Declare this war — free' : `Declare this war (${formatCents(totalCents)})`}
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

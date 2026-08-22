'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowUpRight, Check, Sunrise, Timer, X } from 'lucide-react';

import { formatCents } from '@/lib/utils';
import { formatCountdown, firstLightSecondsRemaining, type LadderRung, type PriceLadder } from '@/lib/firstLight';
import {
  apiPost,
  apiGet,
  errorText,
  insufficientFunds,
  newIdempotencyKey,
  recommendedTopUpCents,
} from '../system/api';
import { ModalPortal } from '../system/ModalPortal';
import { useModalChrome } from '../system/useModalChrome';
import { useWallet } from '../system/useWallet';
import { WalletTopUpModal } from '../wallet/WalletTopUpModal';

interface HoldYourGroundModalProps {
  isOpen: boolean;
  post: { id: string; slug: string; title: string } | null;
  onClose: () => void;
  /** Shown at the top of the panel — e.g. an opening bid that did not settle. */
  note?: string | null;
  /** Fired after a settled backing so the board behind can refresh. */
  onBacked?: () => void;
}

/** How often the ladder is re-read. Short: every rung is a live figure. */
const LADDER_REFRESH_MS = 15000;

function rungCta(rung: LadderRung): string {
  if (rung.product?.kind === 'super') return `Super boost ${formatCents(rung.product.cents)}`;
  return `Back it with ${formatCents(rung.cents)}`;
}

/**
 * The moment after publishing — where a reader becomes a payer, or doesn't.
 *
 * A first-time author has just written something and is standing in front of
 * the only two facts that matter: their stance is on the free rail for a while
 * longer, and it currently sits near the bottom of a board ordered by money.
 * This panel states both, and then names the exact price of changing the second
 * one.
 *
 * Three rules hold that honest, and each is load-bearing rather than decorative:
 *
 *  - The countdown is real. It comes from `first_light_until`, a column written
 *    at insert time and enforced by the rail's own query.
 *  - The price is the true minimum, computed from the live board, and is
 *    labelled as a moving figure rather than a held quote. It is re-read every
 *    few seconds, and the settle request re-prices server-side regardless of
 *    what this component believes.
 *  - Declining is a plain button, not a guilt-worded link. The stance stays up
 *    either way; that is the whole promise of the free window.
 */
export const HoldYourGroundModal: React.FC<HoldYourGroundModalProps> = ({
  isOpen,
  post,
  onClose,
  note,
  onBacked,
}) => {
  const [ladder, setLadder] = useState<PriceLadder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [settled, setSettled] = useState<{ cents: number; rank: number } | null>(null);
  const [pendingCents, setPendingCents] = useState<number | null>(null);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpRecommendation, setTopUpRecommendation] = useState<number | undefined>(undefined);
  const [, setTick] = useState(0);

  const inFlightRef = useRef(false);
  /** One key per logical attempt: a retry after a dropped response must replay. */
  const idempotencyRef = useRef<string | null>(null);
  const containerRef = useModalChrome(isOpen, onClose);
  const { balanceCents, refresh: refreshWallet } = useWallet(isOpen);

  const postId = post?.id ?? null;

  const loadLadder = useCallback(async () => {
    if (!postId) return;
    const res = await apiGet<PriceLadder>(`/api/v1/posts/${postId}/price-ladder`);
    setIsLoading(false);
    if (res.ok && res.data?.post_id) setLadder(res.data);
  }, [postId]);

  useEffect(() => {
    if (!isOpen || !postId) return;
    setLadder(null);
    setIsLoading(true);
    setErrorMsg(null);
    setSettled(null);
    void loadLadder();

    const refresh = setInterval(() => void loadLadder(), LADDER_REFRESH_MS);
    const clock = setInterval(() => setTick((n) => n + 1), 1000);
    return () => {
      clearInterval(refresh);
      clearInterval(clock);
    };
  }, [isOpen, postId, loadLadder]);

  const settle = async (rung: LadderRung) => {
    if (!post || !rung.product || inFlightRef.current) return;
    if (rung.product.kind === 'power') return;

    inFlightRef.current = true;
    setPendingCents(rung.cents);
    setErrorMsg(null);
    if (!idempotencyRef.current) idempotencyRef.current = newIdempotencyKey();

    const res =
      rung.product.kind === 'super'
        ? await apiPost<{ new_rank?: number; amount_cents?: number }>(
            `/api/v1/posts/${post.id}/boost`,
            { kind: 'super' },
            { idempotencyKey: idempotencyRef.current }
          )
        : await apiPost<{ new_rank?: number; amount_cents?: number }>(
            `/api/v1/posts/${post.id}/like`,
            { units: rung.product.units },
            { idempotencyKey: idempotencyRef.current }
          );

    inFlightRef.current = false;
    setPendingCents(null);

    if (!res.ok) {
      const shortfall = insufficientFunds(res);
      if (shortfall) {
        // A shortfall is not a failed attempt — the same key must settle it
        // once the wallet is funded, so the key is deliberately kept.
        setTopUpRecommendation(recommendedTopUpCents(shortfall.shortfallCents));
        setErrorMsg('Your wallet is short for that. Add credits and it settles straight away.');
        setIsTopUpOpen(true);
        return;
      }
      idempotencyRef.current = null;
      setErrorMsg(errorText(res, 'That backing could not be settled.'));
      return;
    }

    idempotencyRef.current = null;
    setSettled({
      cents: res.data?.amount_cents ?? rung.cents,
      rank: res.data?.new_rank ?? rung.achieved_rank,
    });
    void refreshWallet();
    void loadLadder();
    onBacked?.();
  };

  if (!isOpen || !post) return null;

  const secondsLeft = ladder ? firstLightSecondsRemaining(ladder.first_light.until) : 0;
  const recommended = ladder?.recommended ?? null;
  const rungs = ladder?.rungs ?? [];

  return (
    <>
      <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(4,6,12,0.65)] backdrop-blur-md">
          <div className="absolute inset-0" onClick={onClose} aria-hidden />

          <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="hold-ground-title"
            className="panel rounded-modal relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto p-6 sm:p-7 animate-rise"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
              <div className="min-w-0">
                <div className="kicker kicker-gold flex items-center gap-1.5">
                  <Sunrise className="h-3.5 w-3.5" aria-hidden />
                  <span>Published</span>
                </div>
                <h3 id="hold-ground-title" className="mt-1 text-lg font-bold tracking-tight text-ink">
                  It&rsquo;s on the board. Now hold your ground.
                </h3>
              </div>
              <button type="button" onClick={onClose} className="btn btn-ghost btn-xs !px-1.5 shrink-0" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 text-dense text-ink-2 line-clamp-2">&ldquo;{post.title}&rdquo;</p>

            {note && (
              <p role="status" className="text-meta text-ink-3 mt-2">
                {note}
              </p>
            )}

            {/* The free window — stated as a fact, with what happens after it. */}
            <div className="sunken rounded-control mt-4 flex items-start gap-2.5 p-3.5">
              <Timer className="mt-0.5 h-4 w-4 shrink-0 text-gold-text" aria-hidden />
              <div className="text-meta leading-relaxed text-ink-2">
                {secondsLeft > 0 ? (
                  <>
                    <span className="font-semibold text-ink tnum">{formatCountdown(secondsLeft)}</span> of
                    free visibility on{' '}
                    <Link href="/#first-light-heading" className="underline underline-offset-2 hover:text-ink">
                      First Light
                    </Link>
                    , where nothing is ordered by money. After that your stance keeps only the rank its
                    backing has bought — and it stays published either way.
                  </>
                ) : (
                  <>
                    Your free window has closed. Your stance stays published; from here it holds the rank
                    its backing has bought.
                  </>
                )}
              </div>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="rounded-control border border-down/30 bg-down/10 text-down text-dense mt-4 flex items-start gap-2 p-3"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{errorMsg}</span>
              </div>
            )}

            {settled && (
              <div
                role="status"
                className="rounded-control border border-up/30 bg-up/10 text-dense mt-4 flex items-start gap-2 p-3 text-ink"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-up" aria-hidden />
                <span className="tnum">
                  {formatCents(settled.cents)} settled — you&rsquo;re at #{settled.rank}.
                </span>
              </div>
            )}

            {/* The ladder. */}
            <div className="mt-5">
              {isLoading ? (
                <div className="space-y-2">
                  <div className="skeleton h-14 w-full rounded-control" />
                  <div className="skeleton h-14 w-full rounded-control" />
                </div>
              ) : !ladder ? (
                <p className="text-meta text-ink-3">
                  The board could not be priced right now. Your stance is published regardless.
                </p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="kicker">Where you stand</span>
                    <span className="text-dense tnum text-ink-2">
                      #{ladder.current_rank} of {ladder.board_size}
                    </span>
                  </div>

                  {rungs.length === 0 ? (
                    <p className="text-meta text-ink-3 mt-3">
                      Nothing above you to buy past — you already hold the top of this board.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {rungs.map((rung) => {
                        const isPrimary = recommended?.target_rank === rung.target_rank;
                        const buyable = rung.product?.kind === 'like' || rung.product?.kind === 'super';

                        return (
                          <li
                            key={`${rung.target_rank}-${rung.cents}`}
                            className="sunken rounded-control flex items-center justify-between gap-3 p-3"
                          >
                            <div className="min-w-0">
                              <div className="text-dense font-semibold text-ink tnum">
                                {formatCents(rung.cents)}{' '}
                                <span className="font-normal text-ink-3">&rarr; #{rung.achieved_rank}</span>
                              </div>
                              <div className="text-micro text-ink-3">{rung.label}</div>
                            </div>

                            {!rung.product ? (
                              // Priced above a dollar and below the power-boost
                              // floor. There is no single purchase here, and a
                              // button that pretends otherwise would take a tap
                              // and deliver a different rank.
                              <span className="text-micro text-ink-3 shrink-0 text-right max-w-[8.5rem]">
                                no single step covers this
                              </span>
                            ) : buyable ? (
                              <button
                                type="button"
                                onClick={() => void settle(rung)}
                                disabled={pendingCents !== null}
                                className={`btn btn-sm shrink-0 ${isPrimary ? 'btn-gold' : 'btn-ghost'}`}
                              >
                                {pendingCents === rung.cents ? (
                                  <>
                                    <span
                                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current"
                                      aria-hidden
                                    />
                                    <span>Settling…</span>
                                  </>
                                ) : (
                                  <span className="tnum">{rungCta(rung)}</span>
                                )}
                              </button>
                            ) : (
                              <Link href={`/p/${post.slug}`} className="btn btn-ghost btn-sm shrink-0">
                                <span>Power boost</span>
                                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* Not a quote, and it must never read like one. */}
                  <p className="text-micro text-ink-3 mt-3 leading-relaxed">
                    These are live figures, not reserved prices: every one of them moves when anyone else
                    backs anything, and they are re-read every few seconds. Backing is charged from your
                    wallet at the price the server sets, and is{' '}
                    <Link href="/terms#spending-is-final" className="underline underline-offset-2 hover:text-ink-2">
                      immediate and final
                    </Link>
                    . Your balance is {formatCents(balanceCents)}.
                  </p>
                </>
              )}
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <button type="button" onClick={onClose} className="btn btn-ghost btn-sm w-full">
                <span>Not now — let it ride</span>
              </button>
            </div>
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
          void loadLadder();
        }}
        recommendedCents={topUpRecommendation}
      />
    </>
  );
};

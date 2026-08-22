'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';

import { apiPost, errorText, hasCode, insufficientFunds, newIdempotencyKey } from '../system/api';
import { TAPS_PER_PENNY, useTapPriceMode } from './tapPrice';

interface HoldToLikeButtonProps {
  postId: string;
  initialLikes?: number;
  onLikeExecuted?: (units: number, newLikes: number) => void;
  /** Called with the amount still needed so the wallet modal can prefill it. */
  onInsufficientFunds?: (shortfallCents: number) => void;
  /** The per-post 24h like cap was hit — a boost is the way forward. */
  onLikeCapReached?: () => void;
}

interface TapResponse {
  rank_cents: number;
  tap_units: number;
  remaining_rank_cents: number;
}

interface LikeResponse {
  units: number;
  amount_cents: number;
  new_balance_cents: number;
  /** True when this key had already been settled — nothing new was charged. */
  replayed?: boolean;
}

export const HoldToLikeButton: React.FC<HoldToLikeButtonProps> = ({
  postId,
  initialLikes = 0,
  onLikeExecuted,
  onInsufficientFunds,
  onLikeCapReached,
}) => {
  const tapPriceMode = useTapPriceMode();
  const isTenthMode = tapPriceMode === 'tenth';

  const [likesCount, setLikesCount] = useState<number>(initialLikes);
  /**
   * Taps banked towards the next penny, 0..TAPS_PER_PENNY-1.
   *
   * Deliberately not persisted. A tap that has not reached the tenth has
   * bought nothing and promised nothing, and resurrecting a half-finished
   * count days later would charge someone for a gesture they have forgotten
   * making. It survives re-renders and board refreshes (rows are keyed by
   * post id), which is the span that actually matters.
   */
  const [tapProgress, setTapProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [floatingBubbles, setFloatingBubbles] = useState<Array<{ id: number; text: string }>>([]);

  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Ticks banked by the current hold: like-units in penny mode, taps in tenth mode. */
  const accumulatedUnitsRef = useRef<number>(0);
  /** Mirrors `tapProgress` for the interval and hold callbacks, which close over stale state. */
  const tapProgressRef = useRef(0);
  /** Progress at the moment a hold began. The hold's own ticks are counted
   *  from here, so the running total never reads back its own writes. */
  const holdStartProgressRef = useRef(0);
  const inFlightRef = useRef(false);
  /** True when the click that follows mouseup belongs to a hold, not a tap. */
  const didHoldRef = useRef(false);
  /**
   * The key for the batch currently being retried, remembered WITH its unit
   * count. Reusing a key across retries is what stops a double charge; reusing
   * it for a batch of a different size is the opposite mistake — the server
   * would replay the earlier batch and report units nobody just asked for. The
   * key therefore belongs to (this many units), not to the button.
   */
  const pendingBatchRef = useRef<{ key: string; units: number } | null>(null);

  useEffect(() => {
    setLikesCount(initialLikes);
  }, [initialLikes]);

  /** A key belongs to one post's batch; never carry it to a different post. */
  useEffect(() => {
    pendingBatchRef.current = null;
    tapProgressRef.current = 0;
    setTapProgress(0);
    setErrorMsg(null);
    setNoticeMsg(null);
  }, [postId]);

  /* Switching price mode abandons a half-finished penny rather than carrying
     the count across: nine taps banked at a tenth of a penny each mean
     something different once a tap costs a full penny. */
  useEffect(() => {
    tapProgressRef.current = 0;
    setTapProgress(0);
  }, [tapPriceMode]);

  useEffect(
    () => () => {
      if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    },
    []
  );

  const triggerBubble = (text = '+1¢') => {
    const bubbleId = Date.now() + Math.random();
    setFloatingBubbles((prev) => [...prev.slice(-4), { id: bubbleId, text }]);
    setTimeout(() => {
      setFloatingBubbles((prev) => prev.filter((b) => b.id !== bubbleId));
    }, 900);
  };

  const sendLikesBatch = useCallback(
    async (units: number): Promise<boolean> => {
      if (inFlightRef.current || units < 1) return false;
      inFlightRef.current = true;
      setIsSending(true);
      setErrorMsg(null);
      setNoticeMsg(null);

      const pending = pendingBatchRef.current;
      if (!pending || pending.units !== units) {
        pendingBatchRef.current = { key: newIdempotencyKey(), units };
      }
      const idempotencyKey = (pendingBatchRef.current as { key: string }).key;

      const res = await apiPost<LikeResponse>(`/api/v1/posts/${postId}/like`, { units }, { idempotencyKey });

      inFlightRef.current = false;
      setIsSending(false);

      if (res.ok) {
        pendingBatchRef.current = null;
        // The server's unit count is authoritative — on a replay it is the
        // count of the ORIGINAL batch, which is what the wallet actually paid.
        const applied = res.data?.units ?? units;
        setLikesCount((prev) => prev + applied);
        if (res.data?.replayed) {
          setNoticeMsg('Already counted — your balance is up to date.');
        }
        if (onLikeExecuted) onLikeExecuted(applied, likesCount + applied);
        return true;
      }

      // Every failure path below leaves the counter untouched — the optimistic
      // bump only happens once the server confirms.
      const shortfall = insufficientFunds(res);
      if (shortfall) {
        pendingBatchRef.current = null;
        setErrorMsg('Not enough wallet balance.');
        if (onInsufficientFunds) onInsufficientFunds(shortfall.shortfallCents);
        return false;
      }

      if (hasCode(res, 'LIKE_CAP_REACHED')) {
        pendingBatchRef.current = null;
        setErrorMsg('Daily like limit reached for this post — try a boost.');
        if (onLikeCapReached) onLikeCapReached();
        return false;
      }

      // A network failure keeps the key so pressing again retries the SAME
      // attempt rather than risking a second charge.
      if (!res.networkError) pendingBatchRef.current = null;
      setErrorMsg(errorText(res, 'Could not register that like.'));
      return false;
    },
    [postId, onLikeExecuted, onInsufficientFunds, onLikeCapReached, likesCount]
  );

  const setProgress = useCallback((taps: number) => {
    tapProgressRef.current = taps;
    setTapProgress(taps);
  }, []);

  /**
   * Send one completed run of taps for rank.
   *
   * Nothing is charged: the server grants the rank a penny would have bought
   * and leaves the wallet and the post's money total alone. The grant is
   * capped per post per day, so this can come back refused while everything
   * else about the page is fine — which is a notice, not an error.
   */
  const sendTapGrant = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    setIsSending(true);
    setErrorMsg(null);
    setNoticeMsg(null);

    const res = await apiPost<TapResponse>(`/api/v1/posts/${postId}/tap`, { rank_cents: 1 });

    inFlightRef.current = false;
    setIsSending(false);

    if (res.ok) {
      if (onLikeExecuted) onLikeExecuted(0, likesCount);
      if (res.data && res.data.remaining_rank_cents <= 0) {
        setNoticeMsg('That is all the free rank this post can give you today.');
      }
      return true;
    }

    if (hasCode(res, 'TAP_CAP_REACHED')) {
      setNoticeMsg('Free rank for this post is used up for today — backing it with money still counts.');
      return false;
    }

    setErrorMsg(errorText(res, 'Could not count those taps.'));
    return false;
  }, [postId, onLikeExecuted, likesCount]);

  /**
   * Bank `taps` towards the next penny and claim the rank for each one reached.
   */
  const commitTaps = useCallback(
    async (taps: number) => {
      const total = tapProgressRef.current + taps;
      const pennies = Math.floor(total / TAPS_PER_PENNY);
      const remainder = total % TAPS_PER_PENNY;

      if (pennies < 1) {
        // No bubble: the count and the bar under the button already say where
        // this tap landed, and one bubble per tap stacks up over the row.
        setProgress(total);
        return;
      }

      // Cleared before the request, so a second tap during the round trip
      // starts the next penny instead of re-sending this one.
      setProgress(remainder);
      triggerBubble(`+${pennies}¢ rank`);

      // One grant per completed run; the server caps the rest.
      const ok = await sendTapGrant();
      if (ok) return;

      /* The grant did not land, so the taps that earned it are handed back —
         one short of a full run, so a single further tap retries it. */
      setProgress(Math.min(total, TAPS_PER_PENNY - 1));
    },
    [sendTapGrant, setProgress]
  );

  const stopHold = useCallback(() => {
    setIsHolding(false);
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    const ticks = accumulatedUnitsRef.current;
    accumulatedUnitsRef.current = 0;
    didHoldRef.current = ticks > 0;
    if (ticks <= 0) return;

    if (isTenthMode) {
      /* Counted from where the hold started, not from the progress the hold
         has itself been advancing. Whole pennies settle now; the remainder
         stays banked towards the next one. */
      const total = holdStartProgressRef.current + ticks;
      const pennies = Math.floor(total / TAPS_PER_PENNY);
      setProgress(total % TAPS_PER_PENNY);
      // Each completed run is its own grant, and each is capped server-side.
      for (let i = 0; i < pennies; i++) void sendTapGrant();
      return;
    }
    void sendLikesBatch(ticks);
  }, [sendLikesBatch, sendTapGrant, commitTaps, isTenthMode]);

  const startHold = useCallback(() => {
    if (inFlightRef.current || holdIntervalRef.current) return;
    setIsHolding(true);
    accumulatedUnitsRef.current = 0;
    holdStartProgressRef.current = tapProgressRef.current;

    holdIntervalRef.current = setInterval(() => {
      accumulatedUnitsRef.current += 1;
      const ticks = accumulatedUnitsRef.current;

      if (isTenthMode) {
        // A held tick is worth one tap. Only whole pennies are announced —
        // the tenths are visible on the button itself.
        const banked = holdStartProgressRef.current + ticks;
        if (banked > 0 && banked % TAPS_PER_PENNY === 0) {
          triggerBubble(`+${Math.floor(banked / TAPS_PER_PENNY)}¢ rank`);
        }
        setProgress(banked % TAPS_PER_PENNY);
        // Same 100-unit ceiling as penny mode, counted in taps.
        if (ticks >= 100 * TAPS_PER_PENNY) stopHold();
        return;
      }

      triggerBubble(`+${ticks}¢`);
      if (ticks >= 100) stopHold();
    }, 150);
  }, [stopHold, isTenthMode]);

  const handleClick = () => {
    // The click that follows a hold's mouseup already sent its batch.
    if (didHoldRef.current) {
      didHoldRef.current = false;
      return;
    }
    if (inFlightRef.current) return;

    if (isTenthMode) {
      void commitTaps(1);
      return;
    }

    triggerBubble('+1¢');
    void sendLikesBatch(1);
  };

  return (
    <div className="relative inline-block select-none">
      {/* Floating +N¢ readouts */}
      <div className="pointer-events-none absolute -top-6 left-1/2 flex -translate-x-1/2 flex-col items-center">
        {floatingBubbles.map((bubble) => (
          <span
            key={bubble.id}
            className="animate-rise tnum rounded-md border border-gold/30 bg-black/80 px-1.5 py-0.5 text-micro font-semibold text-gold-text shadow-lg"
          >
            {bubble.text}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={handleClick}
        onMouseDown={startHold}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        onTouchStart={startHold}
        onTouchEnd={stopHold}
        disabled={isSending}
        aria-label={
          isTenthMode
            ? `Back this stance by tapping. ${TAPS_PER_PENNY} taps earn the rank of 1 cent and cost nothing; ${tapProgress} of ${TAPS_PER_PENNY} tapped so far. ${likesCount} paid likes on this stance.`
            : `Back this stance with a 1 cent like. ${likesCount} likes so far.`
        }
        aria-describedby={errorMsg ? `like-error-${postId}` : undefined}
        className={`btn btn-xs ${
          isHolding ? 'btn-danger' : 'btn-ghost hover:border-down/40'
        }`}
        title={
          isTenthMode
            ? `${TAPS_PER_PENNY} taps earn the rank of $0.01 — free, ${tapProgress} of ${TAPS_PER_PENNY} so far. Your wallet is not touched.`
            : 'Tap to give $0.01, hold to rapid-fire'
        }
      >
        <Heart
          className={`h-3.5 w-3.5 ${isHolding ? 'fill-white' : 'fill-down/25 text-down/80'}`}
        />
        <span className="tnum">{likesCount.toLocaleString()}</span>
        {/* "1¢" is a fixed price worth hiding on a narrow screen; the tap
            count is live feedback, and a phone is where the tapping happens —
            so it stays visible at every width. */}
        <span
          className={`text-micro text-ink-3 tnum ${isTenthMode ? '' : 'hidden sm:inline'}`}
        >
          {isSending ? '…' : isTenthMode ? `${tapProgress}/${TAPS_PER_PENNY}` : '1¢'}
        </span>
      </button>

      {/* Progress towards the next penny. Rendered only while a penny is part
          way there, so a button nobody has tapped looks exactly as before. */}
      {isTenthMode && tapProgress > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-1 -bottom-0.5 h-0.5 overflow-hidden rounded-full bg-line"
        >
          <span
            className="block h-full bg-down/70 transition-[width] duration-150"
            style={{ width: `${(tapProgress / TAPS_PER_PENNY) * 100}%` }}
          />
        </span>
      )}

      {errorMsg && (
        <span
          id={`like-error-${postId}`}
          role="alert"
          className="absolute left-0 top-full z-10 mt-1 whitespace-nowrap rounded-md border border-down/30 bg-black/85 px-1.5 py-0.5 text-micro text-down"
        >
          {errorMsg}
        </span>
      )}

      {!errorMsg && noticeMsg && (
        <span
          role="status"
          className="absolute left-0 top-full z-10 mt-1 whitespace-nowrap rounded-md border border-line bg-black/85 px-1.5 py-0.5 text-micro text-ink-3"
        >
          {noticeMsg}
        </span>
      )}
    </div>
  );
};

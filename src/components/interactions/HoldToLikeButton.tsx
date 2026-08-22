'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';

import { apiPost, errorText, hasCode, insufficientFunds, newIdempotencyKey } from '../system/api';

interface HoldToLikeButtonProps {
  postId: string;
  initialLikes?: number;
  onLikeExecuted?: (units: number, newLikes: number) => void;
  /** Called with the amount still needed so the wallet modal can prefill it. */
  onInsufficientFunds?: (shortfallCents: number) => void;
  /** The per-post 24h like cap was hit — a boost is the way forward. */
  onLikeCapReached?: () => void;
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
  const [likesCount, setLikesCount] = useState<number>(initialLikes);
  const [isHolding, setIsHolding] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [floatingBubbles, setFloatingBubbles] = useState<Array<{ id: number; text: string }>>([]);

  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accumulatedUnitsRef = useRef<number>(0);
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
    setErrorMsg(null);
    setNoticeMsg(null);
  }, [postId]);

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
    async (units: number) => {
      if (inFlightRef.current || units < 1) return;
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
        return;
      }

      // Every failure path below leaves the counter untouched — the optimistic
      // bump only happens once the server confirms.
      const shortfall = insufficientFunds(res);
      if (shortfall) {
        pendingBatchRef.current = null;
        setErrorMsg('Not enough wallet balance.');
        if (onInsufficientFunds) onInsufficientFunds(shortfall.shortfallCents);
        return;
      }

      if (hasCode(res, 'LIKE_CAP_REACHED')) {
        pendingBatchRef.current = null;
        setErrorMsg('Daily like limit reached for this post — try a boost.');
        if (onLikeCapReached) onLikeCapReached();
        return;
      }

      // A network failure keeps the key so pressing again retries the SAME
      // attempt rather than risking a second charge.
      if (!res.networkError) pendingBatchRef.current = null;
      setErrorMsg(errorText(res, 'Could not register that like.'));
    },
    [postId, onLikeExecuted, onInsufficientFunds, onLikeCapReached, likesCount]
  );

  const stopHold = useCallback(() => {
    setIsHolding(false);
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    const units = accumulatedUnitsRef.current;
    accumulatedUnitsRef.current = 0;
    didHoldRef.current = units > 0;
    if (units > 0) void sendLikesBatch(units);
  }, [sendLikesBatch]);

  const startHold = useCallback(() => {
    if (inFlightRef.current || holdIntervalRef.current) return;
    setIsHolding(true);
    accumulatedUnitsRef.current = 0;

    holdIntervalRef.current = setInterval(() => {
      accumulatedUnitsRef.current += 1;
      triggerBubble(`+${accumulatedUnitsRef.current}¢`);
      if (accumulatedUnitsRef.current >= 100) stopHold();
    }, 150);
  }, [stopHold]);

  const handleClick = () => {
    // The click that follows a hold's mouseup already sent its batch.
    if (didHoldRef.current) {
      didHoldRef.current = false;
      return;
    }
    if (inFlightRef.current) return;
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
        aria-label={`Back this stance with a 1 cent like. ${likesCount} likes so far.`}
        aria-describedby={errorMsg ? `like-error-${postId}` : undefined}
        className={`btn btn-xs ${
          isHolding ? 'btn-danger' : 'btn-ghost hover:border-down/40'
        }`}
        title="Tap to give $0.01, hold to rapid-fire"
      >
        <Heart
          className={`h-3.5 w-3.5 ${isHolding ? 'fill-white' : 'fill-down/25 text-down/80'}`}
        />
        <span className="tnum">{likesCount.toLocaleString()}</span>
        <span className="hidden text-micro text-ink-3 sm:inline">{isSending ? '…' : '1¢'}</span>
      </button>

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

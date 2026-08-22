'use client';

import React, { useState, useRef } from 'react';
import { Heart } from 'lucide-react';

interface HoldToLikeButtonProps {
  postId: string;
  initialLikes?: number;
  onLikeExecuted?: (units: number, newLikes: number) => void;
  onInsufficientFunds?: () => void;
}

export const HoldToLikeButton: React.FC<HoldToLikeButtonProps> = ({
  postId,
  initialLikes = 0,
  onLikeExecuted,
  onInsufficientFunds,
}) => {
  const [likesCount, setLikesCount] = useState<number>(initialLikes);
  const [isLiking, setIsLiking] = useState(false);
  const [floatingBubbles, setFloatingBubbles] = useState<Array<{ id: number; text: string }>>([]);

  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedUnitsRef = useRef<number>(0);

  const triggerBubble = (text = '+1¢') => {
    const bubbleId = Date.now() + Math.random();
    setFloatingBubbles((prev) => [...prev.slice(-4), { id: bubbleId, text }]);
    setTimeout(() => {
      setFloatingBubbles((prev) => prev.filter((b) => b.id !== bubbleId));
    }, 900);
  };

  const sendLikesBatch = async (units: number) => {
    try {
      const res = await fetch(`/api/v1/posts/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ units, user_id: 'usr_marc' }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error && data.error.includes('Insufficient wallet balance')) {
          if (onInsufficientFunds) onInsufficientFunds();
        }
      } else {
        if (onLikeExecuted) onLikeExecuted(units, likesCount + units);
      }
    } catch (err) {
      console.error('Error sending likes:', err);
    }
  };

  const handleSingleTap = () => {
    setLikesCount((prev) => prev + 1);
    triggerBubble('+1¢');
    sendLikesBatch(1);
  };

  const handleMouseDown = () => {
    setIsLiking(true);
    accumulatedUnitsRef.current = 0;

    let speed = 150;
    holdIntervalRef.current = setInterval(() => {
      accumulatedUnitsRef.current += 1;
      setLikesCount((prev) => prev + 1);
      triggerBubble(`+${accumulatedUnitsRef.current}¢`);

      if (accumulatedUnitsRef.current >= 100) {
        handleMouseUp(); // Hit 100 cap per session
      }
    }, speed);
  };

  const handleMouseUp = () => {
    setIsLiking(false);
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    if (accumulatedUnitsRef.current > 0) {
      sendLikesBatch(accumulatedUnitsRef.current);
      accumulatedUnitsRef.current = 0;
    }
  };

  return (
    <div className="relative inline-block select-none">
      {/* Floating +N¢ readouts */}
      <div className="absolute -top-6 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center">
        {floatingBubbles.map((bubble) => (
          <span
            key={bubble.id}
            className="animate-rise tnum text-micro font-semibold text-gold-text bg-black/80 px-1.5 py-0.5 rounded-md border border-gold/30 shadow-lg"
          >
            {bubble.text}
          </span>
        ))}
      </div>

      <button
        onClick={handleSingleTap}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchEnd={handleMouseUp}
        className={`btn btn-xs transition-all ${
          isLiking
            ? 'btn-danger scale-105'
            : 'btn-ghost text-down hover:border-down/40'
        }`}
        title="Tap to give $0.01 like, hold to rapid-fire"
      >
        <Heart className={`w-3.5 h-3.5 ${isLiking ? 'fill-white' : 'fill-down/20'}`} />
        <span className="tnum">{likesCount.toLocaleString()}</span>
        <span className="text-micro text-ink-3 hidden sm:inline">1¢</span>
      </button>
    </div>
  );
};

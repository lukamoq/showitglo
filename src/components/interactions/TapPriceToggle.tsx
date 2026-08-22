'use client';

import React from 'react';

import { TAPS_PER_PENNY, setTapPriceMode, useTapPriceMode, type TapPriceMode } from './tapPrice';

const OPTIONS: Array<{ mode: TapPriceMode; label: string; title: string }> = [
  {
    mode: 'penny',
    label: 'Pay 1¢',
    title: 'Every tap spends a penny from your wallet, and counts as money backing the post.',
  },
  {
    mode: 'tenth',
    label: `Tap ${TAPS_PER_PENNY}× free`,
    title: `${TAPS_PER_PENNY} taps move a post exactly as one paid penny would, but cost nothing. Capped per post per day.`,
  },
];

/**
 * Chooses what a tap on a like button costs.
 *
 * The preference is the reader's, not the post's, so it is stored per browser
 * and applies to every like button on every board at once — which is why this
 * is a single control in the toolbar rather than a switch repeated on each row.
 */
export const TapPriceToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const mode = useTapPriceMode();

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}>
      <div className="seg" role="group" aria-label="How a tap backs a stance">
        {OPTIONS.map((option) => (
          <button
            key={option.mode}
            type="button"
            aria-pressed={mode === option.mode}
            onClick={() => setTapPriceMode(option.mode)}
            title={option.title}
            className={`seg-item tnum ${mode === option.mode ? 'seg-item-active' : ''}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* States the consequence of the current choice rather than labelling the
          control — "Tap price" above a pair of buttons that already read
          "1 tap = 1¢" says nothing the reader cannot see. */}
      <p className="text-meta text-ink-3">
        {mode === 'tenth'
          ? `${TAPS_PER_PENNY} taps lift a post as much as a paid penny does — free, capped daily, and not counted as money raised.`
          : 'Every tap spends 1¢ from your wallet and counts towards the money behind the post.'}
      </p>
    </div>
  );
};

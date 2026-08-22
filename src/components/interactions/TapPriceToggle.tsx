'use client';

import React from 'react';

import { TAPS_PER_PENNY, setTapPriceMode, useTapPriceMode, type TapPriceMode } from './tapPrice';

const OPTIONS: Array<{ mode: TapPriceMode; label: string; title: string }> = [
  {
    mode: 'penny',
    label: '1 tap = 1¢',
    title: 'Every tap spends a penny.',
  },
  {
    mode: 'tenth',
    label: `${TAPS_PER_PENNY} taps = 1¢`,
    title: `A tap costs a tenth as much: ${TAPS_PER_PENNY} of them spend one penny, and nothing is charged until the ${TAPS_PER_PENNY}th.`,
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
      <div className="seg" role="group" aria-label="What one tap on a like button spends">
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
          ? `A tap costs a tenth of a penny of progress — the ${TAPS_PER_PENNY}th spends 1¢, and nothing is charged before it.`
          : 'Every tap spends 1¢ straight away.'}
      </p>
    </div>
  );
};

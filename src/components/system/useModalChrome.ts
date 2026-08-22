'use client';

import { useEffect, useRef } from 'react';

/**
 * Baseline modal behaviour: Escape closes it, focus moves into it on open and
 * returns to whatever opened it on close.
 *
 * `onClose` is held in a ref so an inline arrow function at the call site does
 * not re-run the effect on every render and yank focus out of whatever the user
 * is typing into.
 */
export function useModalChrome(isOpen: boolean, onClose: () => void) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeRef.current();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    const target =
      containerRef.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      containerRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), textarea, select, button, [href], [tabindex]:not([tabindex="-1"])'
      );
    target?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [isOpen]);

  return containerRef;
}

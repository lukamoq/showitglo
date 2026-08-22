'use client';

import { useSyncExternalStore } from 'react';

/**
 * How many taps make up one penny in the patient mode.
 *
 * Ten taps settle as ONE ordinary 1¢ like. Nothing fractional is ever sent to
 * the server and nothing fractional is ever stored: money in this app is whole
 * cents everywhere — the wallet, the ledger, the refund terms — and a tenth of
 * a cent would be the one amount that cannot be refunded at face value. The
 * tenths live only in the button, as a count of how far the reader has got
 * towards the next penny they will actually spend.
 */
export const TAPS_PER_PENNY = 10;

/**
 * 'penny' — one tap spends 1¢, the original behaviour and still the default.
 * 'tenth' — ten taps spend 1¢, so a single tap costs a tenth as much.
 */
export type TapPriceMode = 'penny' | 'tenth';

export const DEFAULT_TAP_PRICE_MODE: TapPriceMode = 'penny';

const STORAGE_KEY = 'showitglo_tap_price_mode';

function isMode(value: unknown): value is TapPriceMode {
  return value === 'penny' || value === 'tenth';
}

/* A module-level cache, not a read of localStorage per render:
   useSyncExternalStore compares snapshots by identity every time it checks,
   and a getter that touches storage on each call is both slow and (in a
   browser that throws on storage access) unreliable. */
let current: TapPriceMode | null = null;
const listeners = new Set<() => void>();

function read(): TapPriceMode {
  if (current !== null) return current;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    current = isMode(stored) ? stored : DEFAULT_TAP_PRICE_MODE;
  } catch {
    // Private mode, or a browser set to block site data. The preference is a
    // convenience; losing it costs the reader nothing but a second click.
    current = DEFAULT_TAP_PRICE_MODE;
  }
  return current;
}

export function getTapPriceMode(): TapPriceMode {
  return read();
}

export function setTapPriceMode(mode: TapPriceMode): void {
  if (read() === mode) return;
  current = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Not persisted, but still applied for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  /* Another tab changing the preference should not leave this one disagreeing
     with it — both are the same reader. */
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    current = isMode(event.newValue) ? event.newValue : DEFAULT_TAP_PRICE_MODE;
    listeners.forEach((l) => l());
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * The reader's tap price, shared by every like button on the page.
 *
 * Server-rendered markup always reflects the default: the stored preference
 * lives in the browser, so claiming to know it during SSR would hydrate a
 * button whose price does not match what the server drew.
 */
export function useTapPriceMode(): TapPriceMode {
  return useSyncExternalStore(subscribe, getTapPriceMode, () => DEFAULT_TAP_PRICE_MODE);
}

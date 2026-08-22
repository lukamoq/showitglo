'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Browser-side API plumbing.
 *
 * Two rules this module exists to enforce:
 *  1. The client NEVER states who it is. Identity is the signed `sig_uid`
 *     session cookie the server sets on the first `GET /api/v1/wallet`, so no
 *     request here ever carries a `user_id`.
 *  2. Every spend carries an `Idempotency-Key`, and a retry of the SAME logical
 *     attempt reuses the SAME key — a dropped response must never be able to
 *     charge a wallet twice.
 */

/** Every API error in this app is `{error, code, ...details}` + an HTTP status. */
export interface ApiPayload {
  error?: string;
  code?: string;
  message?: string;
  [key: string]: unknown;
}

export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data: (T & ApiPayload) | null;
  /** Set only when the request never reached the server (offline, abort, DNS). */
  networkError: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(path, { credentials: 'same-origin', ...init });
    let data: (T & ApiPayload) | null = null;
    try {
      data = (await res.json()) as T & ApiPayload;
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data, networkError: null };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      networkError: err instanceof Error ? err.message : 'Network request failed',
    };
  }
}

export interface GetOptions {
  /** Sent as `x-admin-key`; only the admin surface has one. */
  adminKey?: string;
}

export function apiGet<T>(path: string, options: GetOptions = {}): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {};
  if (options.adminKey) headers['x-admin-key'] = options.adminKey;
  return request<T>(path, { method: 'GET', headers });
}

export interface PostOptions {
  /** Reuse the same key when retrying the same logical spend attempt. */
  idempotencyKey?: string;
  adminKey?: string;
}

export function apiPost<T>(path: string, body?: unknown, options: PostOptions = {}): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  if (options.adminKey) headers['x-admin-key'] = options.adminKey;

  return request<T>(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });
}

/** A human-readable message for a failed response. Never leaks a machine code. */
export function errorText(res: ApiResponse<unknown>, fallback: string): string {
  if (res.networkError) return 'Network error — check your connection and try again.';
  const data = res.data;
  if (data) {
    if (typeof data.message === 'string' && data.message.trim()) return data.message;
    // `insufficient_wallet_balance` and friends are machine tokens, not copy.
    if (typeof data.error === 'string' && data.error.trim() && !/^[a-z0-9_]+$/.test(data.error)) {
      return data.error;
    }
  }
  if (res.status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (res.status === 403) return 'This request was rejected. Reload the page and try again.';
  return fallback;
}

export interface Shortfall {
  currentBalanceCents: number;
  requiredCents: number;
  shortfallCents: number;
}

/** Recognises the canonical 402 insufficient-funds envelope. */
export function insufficientFunds(res: ApiResponse<unknown>): Shortfall | null {
  const data = res.data;
  if (!data) return null;
  const isMatch =
    res.status === 402 || data.code === 'INSUFFICIENT_FUNDS' || data.error === 'insufficient_wallet_balance';
  if (!isMatch) return null;

  const required = typeof data.required_cents === 'number' ? data.required_cents : 0;
  const current = typeof data.current_balance_cents === 'number' ? data.current_balance_cents : 0;
  const shortfall =
    typeof data.shortfall_cents === 'number' ? data.shortfall_cents : Math.max(0, required - current);

  return { currentBalanceCents: current, requiredCents: required, shortfallCents: shortfall };
}

export function hasCode(res: ApiResponse<unknown>, code: string): boolean {
  return res.data?.code === code;
}

/**
 * A top-up amount that clears a shortfall: round up to a whole dollar, never
 * below the $1 minimum, never above the $50 per-transaction ceiling.
 */
export function recommendedTopUpCents(shortfallCents: number): number {
  const rounded = Math.ceil(Math.max(shortfallCents, 100) / 100) * 100;
  return Math.min(Math.max(rounded, 100), 5000);
}

export function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the non-crypto id below */
  }
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/* ------------------------------------------------------------------ *
 * Display name
 * ------------------------------------------------------------------ */

const ALIAS_KEY = 'sig_alias';
export const DEFAULT_ALIAS = 'Anonymous';
export const ALIAS_MAX_LENGTH = 50;

export function readAlias(): string {
  try {
    const stored = window.localStorage.getItem(ALIAS_KEY);
    if (stored && stored.trim()) return stored.trim().slice(0, ALIAS_MAX_LENGTH);
  } catch {
    /* private mode / storage disabled — fall back to the anonymous default */
  }
  return DEFAULT_ALIAS;
}

export function writeAlias(value: string): void {
  try {
    const trimmed = value.trim().slice(0, ALIAS_MAX_LENGTH);
    if (trimmed && trimmed !== DEFAULT_ALIAS) window.localStorage.setItem(ALIAS_KEY, trimmed);
    else window.localStorage.removeItem(ALIAS_KEY);
  } catch {
    /* nothing we can do; the name simply won't persist */
  }
}

/**
 * The name shown next to what you back. Read after mount so server and client
 * markup agree on the first paint.
 */
export function useDisplayName(): [string, (next: string) => void] {
  const [alias, setAlias] = useState<string>(DEFAULT_ALIAS);

  useEffect(() => {
    setAlias(readAlias());
  }, []);

  const update = useCallback((next: string) => {
    // An emptied field is not a nameless post — it is an explicitly anonymous one.
    setAlias(next.trim() ? next.slice(0, ALIAS_MAX_LENGTH) : DEFAULT_ALIAS);
    writeAlias(next);
  }, []);

  return [alias, update];
}

/* ------------------------------------------------------------------ *
 * Pending top-up (survives a reload between "card charged" and "wallet credited")
 * ------------------------------------------------------------------ */

const PENDING_TOPUP_KEY = 'sig_pending_topup';

export function readPendingTopUp(): string | null {
  try {
    const stored = window.localStorage.getItem(PENDING_TOPUP_KEY);
    return stored && /^pi_[A-Za-z0-9_]+$/.test(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writePendingTopUp(paymentIntentId: string | null): void {
  try {
    if (paymentIntentId) window.localStorage.setItem(PENDING_TOPUP_KEY, paymentIntentId);
    else window.localStorage.removeItem(PENDING_TOPUP_KEY);
  } catch {
    /* best effort only */
  }
}

/* ------------------------------------------------------------------ *
 * EU withdrawal consent (remembered for the browser session only)
 * ------------------------------------------------------------------ */

const WITHDRAWAL_CONSENT_KEY = 'sig_withdrawal_consent';

/**
 * Whether this browser session already ticked the immediate-delivery box.
 *
 * `sessionStorage`, not `localStorage`, and deliberately: a consent that
 * silently outlives the visit stops being an act the customer performed. Within
 * one sitting it spares a repeat top-up the same tick; the line itself is always
 * rendered, always ticked visibly, and always un-tickable.
 */
export function readWithdrawalConsent(): boolean {
  try {
    return window.sessionStorage.getItem(WITHDRAWAL_CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeWithdrawalConsent(accepted: boolean): void {
  try {
    if (accepted) window.sessionStorage.setItem(WITHDRAWAL_CONSENT_KEY, '1');
    else window.sessionStorage.removeItem(WITHDRAWAL_CONSENT_KEY);
  } catch {
    /* private mode / storage disabled — the box is simply asked again */
  }
}

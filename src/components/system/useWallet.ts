'use client';

import { useCallback, useEffect, useState } from 'react';

import { apiGet, errorText } from './api';
import type { Wallet, WalletLedgerEntry } from '@/lib/types';

interface WalletResponse {
  wallet: Wallet;
  ledger: WalletLedgerEntry[];
  /** Whether a real address is linked. The address itself is never sent in full. */
  has_receipt_email: boolean;
  receipt_email_masked: string | null;
}

/**
 * Reads the session wallet. `GET /api/v1/wallet` takes no parameters — it mints
 * the anonymous user and sets the signed cookie on first call, so this is also
 * the session bootstrap every page performs before any spend is possible.
 */
export function useWallet(enabled = true) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [hasReceiptEmail, setHasReceiptEmail] = useState(false);
  const [receiptEmailMasked, setReceiptEmailMasked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await apiGet<WalletResponse>('/api/v1/wallet');
    if (res.ok && res.data?.wallet) {
      setWallet(res.data.wallet);
      setLedger(res.data.ledger ?? []);
      setHasReceiptEmail(res.data.has_receipt_email === true);
      setReceiptEmailMasked(res.data.receipt_email_masked ?? null);
      setError(null);
    } else {
      setError(errorText(res, 'Could not load your wallet.'));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // Drawers and modals mount closed on most pages; don't spend a request
    // until the surface that needs a balance is actually on screen.
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  const applyBalance = useCallback((balanceCents: number) => {
    setWallet((current) => (current ? { ...current, balance_cents: balanceCents } : current));
  }, []);

  return {
    wallet,
    ledger,
    balanceCents: wallet?.balance_cents ?? 0,
    hasReceiptEmail,
    receiptEmailMasked,
    isLoading,
    error,
    refresh,
    applyBalance,
  };
}

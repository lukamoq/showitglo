'use client';

import React, { useState, useEffect } from 'react';
import { Wallet as WalletIcon, Plus } from 'lucide-react';
import { formatCents } from '@/lib/utils';
import { WalletTopUpModal } from './WalletTopUpModal';

interface WalletChipProps {
  onBalanceUpdated?: (cents: number) => void;
}

export const WalletChip: React.FC<WalletChipProps> = ({ onBalanceUpdated }) => {
  const [balanceCents, setBalanceCents] = useState<number>(0);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  /**
   * No identity is sent: `GET /api/v1/wallet` reads the signed session cookie
   * and mints it on the first call. Because the chip sits in the navbar on
   * every page, this is also the session bootstrap that guarantees a cookie
   * exists before the visitor's first spend.
   */
  const fetchWallet = async () => {
    try {
      const res = await fetch('/api/v1/wallet', { credentials: 'same-origin' });
      const data = await res.json();
      if (data.wallet) {
        setBalanceCents(data.wallet.balance_cents);
        if (onBalanceUpdated) onBalanceUpdated(data.wallet.balance_cents);
      }
    } catch (err) {
      console.error('Error fetching wallet:', err);
    }
  };

  useEffect(() => {
    fetchWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTopUpSuccess = (newBalance: number) => {
    setBalanceCents(newBalance);
    if (onBalanceUpdated) onBalanceUpdated(newBalance);
  };

  return (
    <>
      {/* Height matches the rail's other controls; the gold accent stays on the
          header's single primary CTA, so the chip reads as a quiet readout. */}
      <div className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-white/[0.04] pl-3 pr-1.5 text-dense transition-colors hover:bg-white/[0.07]">
        <span className="flex items-center gap-1.5">
          <WalletIcon className="h-3.5 w-3.5 text-ink-3" aria-hidden />
          <span className="tnum font-semibold tracking-tight text-ink">{formatCents(balanceCents)}</span>
        </span>

        <button
          type="button"
          onClick={() => setIsTopUpOpen(true)}
          className="btn btn-ghost btn-xs !rounded-full"
          title="Add funds to your prepaid balance"
        >
          <Plus className="h-3 w-3" />
          <span>Add</span>
        </button>
      </div>

      <WalletTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        currentBalanceCents={balanceCents}
        onTopUpSuccess={handleTopUpSuccess}
      />
    </>
  );
};

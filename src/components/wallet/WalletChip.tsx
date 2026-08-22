'use client';

import React, { useState, useEffect } from 'react';
import { Wallet as WalletIcon, Plus } from 'lucide-react';
import { formatCents } from '@/lib/utils';
import { WalletTopUpModal } from './WalletTopUpModal';

interface WalletChipProps {
  userId?: string;
  onBalanceUpdated?: (cents: number) => void;
}

export const WalletChip: React.FC<WalletChipProps> = ({
  userId = 'usr_marc',
  onBalanceUpdated,
}) => {
  const [balanceCents, setBalanceCents] = useState<number>(0);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  const fetchWallet = async () => {
    try {
      const res = await fetch(`/api/v1/wallet?user_id=${userId}`);
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
  }, [userId]);

  const handleTopUpSuccess = (newBalance: number) => {
    setBalanceCents(newBalance);
    if (onBalanceUpdated) onBalanceUpdated(newBalance);
  };

  return (
    <>
      <div className="inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-control sunken text-dense">
        <span className="flex items-center gap-1.5">
          <WalletIcon className="w-3.5 h-3.5 text-ink-3" aria-hidden />
          <span className="tnum font-semibold text-ink">{formatCents(balanceCents)}</span>
        </span>

        <button
          onClick={() => setIsTopUpOpen(true)}
          className="btn btn-ghost btn-xs text-up hover:border-up/40"
          title="Top up wallet balance"
        >
          <Plus className="w-3 h-3" />
          <span>Refill</span>
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

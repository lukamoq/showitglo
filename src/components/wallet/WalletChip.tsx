'use client';

import React, { useState, useEffect } from 'react';
import { Wallet as WalletIcon, Plus, CreditCard } from 'lucide-react';
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
      <div className="flex items-center gap-1.5 p-1 pl-3 rounded-full glass-segmented border border-emerald-500/30 text-xs font-mono">
        <div className="flex items-center gap-1.5 text-emerald-400">
          <WalletIcon className="w-3.5 h-3.5" />
          <span className="font-bold tabular-nums text-white">
            {formatCents(balanceCents)}
          </span>
        </div>

        <button
          onClick={() => setIsTopUpOpen(true)}
          className="p-1 px-2 rounded-full bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 font-sans font-bold text-[11px] flex items-center gap-0.5 cursor-pointer transition-colors"
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

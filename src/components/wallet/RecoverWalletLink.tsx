'use client';

import React, { useState } from 'react';

import { RecoverWalletDialog } from './RecoverWalletDialog';

/**
 * The footer entry point to wallet recovery.
 *
 * It lives in the footer because that is the only surface a visitor who has
 * ALREADY lost their session can reach — every other affordance is behind the
 * dashboard, which such a visitor no longer recognises as theirs.
 */
export const RecoverWalletLink: React.FC<{ className?: string }> = ({ className }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={className ?? 'text-dense text-ink-3 transition-colors hover:text-ink'}
      >
        Recover wallet
      </button>

      <RecoverWalletDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};

'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, KeyRound, Mail, X } from 'lucide-react';

import { apiPost, errorText, hasCode } from '../system/api';
import { AdornedField } from '../system/AdornedField';
import { ModalPortal } from '../system/ModalPortal';
import { useModalChrome } from '../system/useModalChrome';

interface RecoverWalletDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "I lost my session, get me back into my wallet."
 *
 * The success copy is deliberately the same sentence the server returns for an
 * address it has never seen, and it is shown for BOTH outcomes. Anything that
 * distinguished them — "no wallet found for that address" — would make this
 * form a public tool for testing whether a given person has an account, which
 * is exactly the fact an anonymous arena exists to withhold.
 */
export const RecoverWalletDialog: React.FC<RecoverWalletDialogProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<'form' | 'sent' | 'unavailable'>('form');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const containerRef = useModalChrome(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    setEmail('');
    setPhase('form');
    setError(null);
    setIsSending(false);
  }, [isOpen]);

  const submit = async () => {
    if (isSending) return;
    if (!email.trim()) {
      setError('Enter the email address this wallet was secured with.');
      return;
    }

    setIsSending(true);
    setError(null);

    const res = await apiPost('/api/v1/auth/recover', { email: email.trim() });
    setIsSending(false);

    if (hasCode(res, 'EMAIL_NOT_CONFIGURED')) {
      setPhase('unavailable');
      return;
    }

    if (!res.ok) {
      setError(errorText(res, 'Could not send a recovery link. Please try again.'));
      return;
    }

    setPhase('sent');
  };

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,6,12,0.65)] p-4 backdrop-blur-md">
        <div className="absolute inset-0" onClick={onClose} aria-hidden />

        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="recover-title"
          className="animate-rise panel relative z-10 w-full max-w-md rounded-modal p-6 sm:p-7"
        >
          <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
            <div className="min-w-0">
              <div className="kicker kicker-gold flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                <span>Wallet recovery</span>
              </div>
              <h3 id="recover-title" className="mt-1 text-lg font-bold tracking-tight text-ink">
                Recover your wallet
              </h3>
            </div>

            <button type="button" onClick={onClose} className="btn btn-ghost btn-xs shrink-0 !px-1.5" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          {phase === 'form' && (
            <form
              className="mt-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <p className="text-dense leading-relaxed text-ink-2">
                If you secured this wallet with an email address, we can send a one-time link that
                restores the session — your balance, your ranked stances, your ledger.
              </p>

              <div>
                <label htmlFor="recover-email" className="micro-label mb-1.5 block text-ink-3">
                  Email address
                </label>
                <AdornedField
                  id="recover-email"
                  name="recover-email"
                  type="email"
                  autoComplete="email"
                  data-autofocus
                  prefix={<Mail className="h-4 w-4" />}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  placeholder="you@example.com"
                  aria-describedby={error ? 'recover-error' : undefined}
                />
              </div>

              {error && (
                <p id="recover-error" role="alert" className="flex items-start gap-2 text-dense text-down">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{error}</span>
                </p>
              )}

              <button type="submit" disabled={isSending} className="btn btn-gold w-full">
                {isSending ? 'Sending…' : 'Send me a recovery link'}
              </button>

              <p className="text-meta text-ink-3">
                Never linked an address? Then there is nothing to recover — a wallet with no email is
                tied to this browser only.
              </p>
            </form>
          )}

          {phase === 'sent' && (
            <div className="mt-5 space-y-4">
              <p className="flex items-start gap-2.5 text-dense text-ink-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gold-text" aria-hidden />
                <span>If that email secures a wallet, a recovery link is on its way.</span>
              </p>
              <p className="text-meta text-ink-3">
                The link works once and expires in 30 minutes. Check the spam folder before asking for
                another.
              </p>
              <button type="button" onClick={onClose} className="btn btn-ghost w-full">
                Close
              </button>
            </div>
          )}

          {phase === 'unavailable' && (
            <div className="mt-5 space-y-4">
              <div className="sunken flex items-start gap-2.5 rounded-control p-4 text-dense text-ink-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
                <span>
                  <strong className="font-semibold text-ink">Email is not enabled on this deployment yet.</strong>{' '}
                  Recovery links cannot be sent from here, so nothing was mailed. Your wallet is
                  untouched and still tied to this browser.
                </span>
              </div>
              <button type="button" onClick={onClose} className="btn btn-ghost w-full">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </ModalPortal>
  );
};

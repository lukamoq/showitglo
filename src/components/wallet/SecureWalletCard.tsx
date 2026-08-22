'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, KeyRound, Mail, ShieldCheck } from 'lucide-react';

import { apiPost, errorText, hasCode } from '../system/api';
import { AdornedField } from '../system/AdornedField';

interface SecureWalletCardProps {
  /** From GET /api/v1/wallet — the address itself is never sent to the browser. */
  hasEmail: boolean;
  maskedEmail: string | null;
  isLoading?: boolean;
}

type Phase = 'idle' | 'pending' | 'unavailable';

/**
 * The one place the product asks for an email — optional, and framed as what
 * it is.
 *
 * The promise line is not marketing copy: an address collected here is used
 * for wallet recovery and Stripe receipts and nothing else, there is no list
 * to join, and the card says so at every state. Nothing changes on the account
 * until the confirmation link is clicked, so an address typed in by mistake
 * costs nothing.
 */
export const SecureWalletCard: React.FC<SecureWalletCardProps> = ({ hasEmail, maskedEmail, isLoading }) => {
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // A confirmation elsewhere (another tab, a phone) flips `hasEmail`; drop the
  // "check your inbox" state so the card stops asking for something that is done.
  useEffect(() => {
    if (hasEmail) {
      setPhase('idle');
      setIsEditing(false);
    }
  }, [hasEmail]);

  const submit = async () => {
    if (isSending) return;
    if (!email.trim()) {
      setError('Enter an email address.');
      return;
    }

    setIsSending(true);
    setError(null);

    const res = await apiPost('/api/v1/me/link-email', { email: email.trim() });
    setIsSending(false);

    if (hasCode(res, 'EMAIL_NOT_CONFIGURED')) {
      setPhase('unavailable');
      return;
    }

    if (!res.ok) {
      setError(errorText(res, 'Could not send the confirmation email. Please try again.'));
      return;
    }

    setEmail('');
    setPhase('pending');
  };

  const showForm = (!hasEmail || isEditing) && phase === 'idle';

  return (
    <div className="card rounded-card p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-control ${
            hasEmail ? 'bg-up/[0.12] text-up' : 'sunken text-ink-3'
          }`}
        >
          {hasEmail ? <ShieldCheck className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">Secure your wallet</h2>
          <p className="mt-1 max-w-[62ch] text-meta leading-relaxed text-ink-3">
            Optional. Your wallet lives in this browser&apos;s session — clear your cookies and the
            balance goes with them. Linking an email is the only way back in.
          </p>

          {/* ---------------------------------------------------------- */}
          {isLoading && !hasEmail && phase === 'idle' && !isEditing && (
            <div className="skeleton mt-4 h-10 w-full max-w-sm rounded-control" />
          )}

          {hasEmail && !isEditing && phase === 'idle' && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="chip text-up">
                <ShieldCheck className="h-3 w-3" />
                {maskedEmail ?? 'Email linked'}
              </span>
              <button type="button" onClick={() => setIsEditing(true)} className="btn btn-ghost btn-xs">
                Update address
              </button>
            </div>
          )}

          {showForm && !isLoading && (
            <form
              className="mt-4 space-y-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="min-w-0 flex-1">
                  <label htmlFor="link-email" className="sr-only">
                    Email address
                  </label>
                  <AdornedField
                    id="link-email"
                    name="link-email"
                    type="email"
                    autoComplete="email"
                    prefix={<Mail className="h-4 w-4" />}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    placeholder="you@example.com"
                    aria-describedby="link-email-promise"
                  />
                </div>

                <button type="submit" disabled={isSending} className="btn btn-gold btn-sm shrink-0">
                  {isSending ? 'Sending…' : isEditing ? 'Send link' : 'Secure my wallet'}
                </button>

                {isEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEmail('');
                      setError(null);
                    }}
                    className="btn btn-ghost btn-sm shrink-0"
                  >
                    Cancel
                  </button>
                )}
              </div>

              <p id="link-email-promise" className="text-meta text-ink-3">
                Only used to recover your balance and send payment receipts — nothing else.
              </p>

              {error && (
                <p role="alert" className="flex items-start gap-2 text-dense text-down">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{error}</span>
                </p>
              )}
            </form>
          )}

          {phase === 'pending' && (
            <div className="mt-4 space-y-2">
              <p className="flex items-start gap-2 text-dense text-ink-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gold-text" aria-hidden />
                <span>Check your inbox to confirm. Nothing is linked until you click the link.</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setPhase('idle');
                  setIsEditing(hasEmail);
                }}
                className="btn btn-ghost btn-xs"
              >
                Use a different address
              </button>
            </div>
          )}

          {phase === 'unavailable' && (
            <p className="mt-4 flex items-start gap-2 text-dense text-ink-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
              <span>
                Email isn&apos;t enabled on this deployment yet, so no confirmation could be sent.
                Nothing was changed.
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

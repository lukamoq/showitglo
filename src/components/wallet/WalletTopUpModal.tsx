'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, CreditCard, Lock, Mail, RefreshCw, X } from 'lucide-react';
import { loadStripe, type Appearance, type Stripe } from '@stripe/stripe-js';
import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import confetti from 'canvas-confetti';

import { formatCents } from '@/lib/utils';
import { TOPUP_MAX_CENTS, TOPUP_MIN_CENTS } from '@/lib/pricing';
import type { Wallet } from '@/lib/types';
import { apiGet, apiPost, errorText, readPendingTopUp, writePendingTopUp } from '../system/api';
import { AdornedField } from '../system/AdornedField';
import { ModalPortal } from '../system/ModalPortal';
import { useModalChrome } from '../system/useModalChrome';

interface WalletTopUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalanceCents: number;
  onTopUpSuccess: (newBalanceCents: number) => void;
  /** Prefill for the amount that would clear a 402 shortfall. */
  recommendedCents?: number;
}

interface CreateIntentResponse {
  client_secret: string;
  payment_intent_id: string;
  publishable_key: string;
  amount_cents: number;
}

interface TopUpResponse {
  success: boolean;
  credited: boolean;
  wallet: Wallet;
  amount_cents: number;
}

interface HealthResponse {
  services?: { payments?: { stripe_configured?: boolean } };
}

/** The wallet endpoint never sends the address itself — only a mask. */
interface WalletSummaryResponse {
  has_receipt_email?: boolean;
  receipt_email_masked?: string | null;
}

/**
 * `loadStripe` must run once per publishable key for the lifetime of the page —
 * calling it per render would re-download Stripe.js and detach mounted Elements.
 */
let cachedKey: string | null = null;
let cachedStripe: Promise<Stripe | null> | null = null;

function getStripe(publishableKey: string): Promise<Stripe | null> {
  if (!cachedStripe || cachedKey !== publishableKey) {
    cachedKey = publishableKey;
    cachedStripe = loadStripe(publishableKey);
  }
  return cachedStripe;
}

/** Matches the dark arena surfaces so the iframe does not look bolted on. */
const STRIPE_APPEARANCE: Appearance = {
  theme: 'night',
  variables: {
    colorPrimary: '#F0A824',
    colorBackground: '#0B0D14',
    colorText: '#F6F7FA',
    colorTextSecondary: '#9AA3B2',
    colorDanger: '#EF4E66',
    fontFamily: 'Figtree, system-ui, -apple-system, sans-serif',
    borderRadius: '10px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { border: '1px solid rgba(255,255,255,0.10)', boxShadow: 'none' },
    '.Input:focus': { border: '1px solid rgba(240,168,36,0.65)', boxShadow: '0 0 0 3px rgba(240,168,36,0.15)' },
    '.Label': { fontSize: '12.5px', fontWeight: '600' },
    '.Tab': { border: '1px solid rgba(255,255,255,0.10)' },
  },
};

const AMOUNT_CHIPS = [100, 300, 500, 1000];

type Phase = 'checking' | 'unavailable' | 'amount' | 'pay' | 'syncing' | 'sync_failed' | 'done';

/* ------------------------------------------------------------------ *
 * Payment surface (inside <Elements>)
 * ------------------------------------------------------------------ */

interface CheckoutSurfaceProps {
  amountCents: number;
  onPaid: (paymentIntentId: string) => void;
  onBack: () => void;
}

const CheckoutSurface: React.FC<CheckoutSurfaceProps> = ({ amountCents, onPaid, onBack }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isConfirming, setIsConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expressReady, setExpressReady] = useState<boolean | null>(null);

  const finish = useCallback(
    (paymentIntentId: string) => {
      onPaid(paymentIntentId);
    },
    [onPaid]
  );

  const submitPayment = useCallback(async () => {
    if (!stripe || !elements || isConfirming) return;
    setIsConfirming(true);
    setMessage(null);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: window.location.href },
      });

      if (error) {
        // Card declines and validation problems both land here; Stripe's own
        // message is the most accurate thing we can show.
        setMessage(error.message ?? 'This payment could not be completed. Try another method.');
        setIsConfirming(false);
        return;
      }

      if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
        finish(paymentIntent.id);
        return;
      }

      setMessage('The payment was not completed. You can try again.');
      setIsConfirming(false);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unexpected payment error.');
      setIsConfirming(false);
    }
  }, [stripe, elements, isConfirming, finish]);

  return (
    <div className="mt-5 space-y-4">
      {/* Apple Pay / Google Pay / Link — only rendered when a real wallet is available */}
      {expressReady !== false && (
        <div className={expressReady ? 'space-y-2' : 'sr-only'}>
          <span className="kicker block">Express checkout</span>
          <ExpressCheckoutElement
            options={{ buttonHeight: 44 }}
            onReady={(event) => {
              const methods = event.availablePaymentMethods;
              setExpressReady(Boolean(methods && Object.values(methods).some(Boolean)));
            }}
            onLoadError={() => setExpressReady(false)}
            onConfirm={() => {
              void submitPayment();
            }}
          />
        </div>
      )}

      {expressReady && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-line" />
          <span className="micro-label text-ink-3">Or pay by card</span>
          <div className="h-px flex-1 bg-line" />
        </div>
      )}

      <PaymentElement options={{ layout: 'tabs' }} />

      {message && (
        <p role="alert" className="flex items-start gap-2 text-dense text-down">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{message}</span>
        </p>
      )}

      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} disabled={isConfirming} className="btn btn-ghost btn-sm shrink-0">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Amount</span>
        </button>

        <button type="button" onClick={() => void submitPayment()} disabled={!stripe || isConfirming} className="btn btn-gold flex-1">
          {isConfirming ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" aria-hidden />
              <span>Confirming payment…</span>
            </>
          ) : (
            <>
              <Lock className="h-4 w-4" />
              <span className="tnum">Pay {formatCents(amountCents)}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Modal
 * ------------------------------------------------------------------ */

export const WalletTopUpModal: React.FC<WalletTopUpModalProps> = ({
  isOpen,
  onClose,
  currentBalanceCents,
  onTopUpSuccess,
  recommendedCents,
}) => {
  const [phase, setPhase] = useState<Phase>('checking');
  const [selectedCents, setSelectedCents] = useState<number>(recommendedCents ?? 500);
  const [customDollars, setCustomDollars] = useState('');
  const [receiptEmail, setReceiptEmail] = useState('');
  // Read on open rather than passed in: this modal is mounted from nine
  // surfaces, and threading the same two props through all of them is nine
  // chances for one to go stale and show a receipt field that does nothing.
  const [linkedReceipt, setLinkedReceipt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [intent, setIntent] = useState<CreateIntentResponse | null>(null);
  const [pendingIntentId, setPendingIntentId] = useState<string | null>(null);
  const [creditedCents, setCreditedCents] = useState<number>(0);

  const isSyncingRef = useRef(false);
  const containerRef = useModalChrome(isOpen, onClose);

  /**
   * Credit the wallet from a PaymentIntent that Stripe has already accepted.
   * Safe to call repeatedly with the same id: the server keys the credit on the
   * intent, so a retry after a dropped response is a no-op, not a double credit.
   */
  const syncTopUp = useCallback(
    async (paymentIntentId: string) => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      setPhase('syncing');
      setError(null);
      writePendingTopUp(paymentIntentId);

      const res = await apiPost<TopUpResponse>('/api/v1/wallet/topup', {
        payment_intent_id: paymentIntentId,
      });
      isSyncingRef.current = false;

      if (res.ok && res.data?.wallet) {
        writePendingTopUp(null);
        setPendingIntentId(null);
        setCreditedCents(res.data.amount_cents ?? 0);
        onTopUpSuccess(res.data.wallet.balance_cents);
        setPhase('done');
        confetti({
          particleCount: 70,
          spread: 65,
          origin: { y: 0.6 },
          colors: ['#F0A824', '#FFC53D', '#FFFFFF'],
        });
        return;
      }

      // 400/404 mean this intent can never be credited to this session — stop
      // offering a retry that would fail forever.
      if (res.status === 400 || res.status === 404) {
        writePendingTopUp(null);
        setPendingIntentId(null);
      } else {
        setPendingIntentId(paymentIntentId);
      }

      setError(errorText(res, 'The payment went through but we could not confirm the credit yet.'));
      setPhase('sync_failed');
    },
    [onTopUpSuccess]
  );

  /**
   * Call sites pass inline arrows for `onTopUpSuccess`, so `syncTopUp` gets a
   * new identity on every parent render. Holding it (and the prefill) in refs
   * keeps the open-effect keyed on `isOpen` alone — otherwise an unrelated
   * re-render would wipe the amount the visitor just typed.
   */
  const syncTopUpRef = useRef(syncTopUp);
  syncTopUpRef.current = syncTopUp;
  const recommendedRef = useRef(recommendedCents);
  recommendedRef.current = recommendedCents;

  // On open: pick up any payment that was charged but never confirmed, then
  // check whether this deployment can take payments at all.
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setError(null);
    setIntent(null);
    setCustomDollars('');
    setReceiptEmail('');
    setSelectedCents(recommendedRef.current ?? 500);

    const pending = readPendingTopUp();
    if (pending) {
      setPendingIntentId(pending);
      void syncTopUpRef.current(pending);
      return () => {
        cancelled = true;
      };
    }

    setPhase('checking');
    void (async () => {
      const [health, wallet] = await Promise.all([
        apiGet<HealthResponse>('/api/health'),
        apiGet<WalletSummaryResponse>('/api/v1/wallet'),
      ]);
      if (cancelled) return;

      setLinkedReceipt(wallet.data?.has_receipt_email ? wallet.data.receipt_email_masked ?? 'your linked email' : null);

      const configured = health.data?.services?.payments?.stripe_configured;
      setPhase(configured === false ? 'unavailable' : 'amount');
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleChip = (cents: number) => {
    setSelectedCents(cents);
    setCustomDollars('');
    setError(null);
  };

  const handleCustomChange = (value: string) => {
    const digitsOnly = value.replace(/[^\d]/g, '').slice(0, 3);
    setCustomDollars(digitsOnly);
    setError(null);
    setSelectedCents(digitsOnly ? Number(digitsOnly) * 100 : 0);
  };

  const amountIsValid = selectedCents >= TOPUP_MIN_CENTS && selectedCents <= TOPUP_MAX_CENTS;

  /** Why the CTA is disabled — a greyed-out button with no reason is a dead end. */
  const amountProblem = amountIsValid
    ? null
    : selectedCents > TOPUP_MAX_CENTS
      ? `The most you can add in one go is ${formatCents(TOPUP_MAX_CENTS)}.`
      : selectedCents > 0
        ? `The minimum top-up is ${formatCents(TOPUP_MIN_CENTS)}.`
        : 'Choose an amount to continue.';

  const startPayment = async () => {
    if (isCreatingIntent) return;
    if (!amountIsValid) {
      setError(
        `Choose an amount between ${formatCents(TOPUP_MIN_CENTS)} and ${formatCents(TOPUP_MAX_CENTS)}.`
      );
      return;
    }

    setIsCreatingIntent(true);
    setError(null);

    // Sent only when no address is linked: the server ignores this field for a
    // wallet that already has one, so offering it there would be a control that
    // silently does nothing.
    const trimmedReceipt = receiptEmail.trim();
    const res = await apiPost<CreateIntentResponse>('/api/v1/wallet/create-intent', {
      amount_cents: selectedCents,
      ...(!linkedReceipt && trimmedReceipt ? { receipt_email: trimmedReceipt } : {}),
    });
    setIsCreatingIntent(false);

    if (res.status === 503) {
      setPhase('unavailable');
      return;
    }

    if (!res.ok || !res.data?.client_secret || !res.data.publishable_key) {
      setError(errorText(res, 'Could not start the payment. Please try again.'));
      return;
    }

    setIntent(res.data);
    setPhase('pay');
  };

  const stripePromise = useMemo(
    () => (intent?.publishable_key ? getStripe(intent.publishable_key) : null),
    [intent?.publishable_key]
  );

  if (!isOpen) return null;

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,6,12,0.65)] p-4 backdrop-blur-md">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />

      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="topup-title"
        className="animate-rise panel relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-modal p-6 sm:p-8"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div className="min-w-0">
            <div className="kicker kicker-gold flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              <span>Prepaid arena wallet</span>
            </div>
            <h3 id="topup-title" className="mt-1 text-lg font-bold tracking-tight text-ink">
              Add funds
            </h3>
          </div>

          <button type="button" onClick={onClose} className="btn btn-ghost btn-xs !px-1.5 shrink-0" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Balance */}
        <div className="sunken my-4 flex items-center justify-between gap-3 rounded-control p-4">
          <div>
            <span className="micro-label block text-ink-3">Current balance</span>
            <span className="metric tnum text-2xl text-ink">{formatCents(currentBalanceCents)}</span>
          </div>
          <span className="text-micro text-ink-3">
            {formatCents(TOPUP_MIN_CENTS)}–{formatCents(TOPUP_MAX_CENTS)} per top-up
          </span>
        </div>

        {phase === 'checking' && (
          <div className="flex items-center gap-2.5 py-6 text-dense text-ink-3">
            <span className="led led-gold" aria-hidden />
            <span>Checking payment availability…</span>
          </div>
        )}

        {phase === 'unavailable' && (
          <div className="space-y-4 py-2">
            <div className="sunken flex items-start gap-2.5 rounded-control p-4 text-dense text-ink-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />
              <span>
                <strong className="font-semibold text-ink">Payments are not yet enabled on this deployment.</strong>{' '}
                Stripe is not configured here, so no wallet top-up can be taken. Nothing has been charged.
              </span>
            </div>
            <button type="button" onClick={onClose} className="btn btn-ghost w-full">
              Close
            </button>
          </div>
        )}

        {phase === 'amount' && (
          <>
            <div className="space-y-2.5">
              <span className="kicker mb-1.5 block" id="topup-amount-label">
                Select top-up amount
              </span>

              <div className="grid grid-cols-4 gap-2" role="group" aria-labelledby="topup-amount-label">
                {AMOUNT_CHIPS.map((cents) => {
                  const isSelected = selectedCents === cents && !customDollars;
                  return (
                    <button
                      type="button"
                      key={cents}
                      onClick={() => handleChip(cents)}
                      aria-pressed={isSelected}
                      className={`tnum cursor-pointer rounded-control py-2 text-dense font-semibold transition-colors ${
                        isSelected
                          ? 'bg-gold/[0.16] text-gold-text shadow-[inset_0_0_0_1px_rgb(240_168_36/0.35)]'
                          : 'sunken text-ink-3 hover:text-ink'
                      }`}
                    >
                      ${cents / 100}
                    </button>
                  );
                })}
              </div>

              <label htmlFor="topup-custom" className="micro-label block text-ink-3">
                Custom amount (whole dollars, $1–$50)
              </label>
              <AdornedField
                id="topup-custom"
                name="topup-custom"
                inputMode="numeric"
                autoComplete="off"
                prefix="$"
                value={customDollars}
                onChange={(e) => handleCustomChange(e.target.value)}
                placeholder="e.g. 25"
                inputClassName="tnum"
                aria-invalid={customDollars !== '' && !amountIsValid}
                aria-describedby={error || (customDollars !== '' && amountProblem) ? 'topup-error' : undefined}
              />
            </div>

            {/* Receipts. Stripe sends them; we only decide the address. A
                confirmed linked address always wins server-side, so when one
                exists this is a statement of fact, not an input. */}
            <div className="mt-4">
              {linkedReceipt ? (
                <p className="text-meta text-ink-3">Your receipt goes to {linkedReceipt}.</p>
              ) : (
                <>
                  <label htmlFor="topup-receipt" className="micro-label mb-1.5 block text-ink-3">
                    Email for receipt (optional)
                  </label>
                  <AdornedField
                    id="topup-receipt"
                    name="topup-receipt"
                    type="email"
                    autoComplete="email"
                    prefix={<Mail className="h-4 w-4" />}
                    value={receiptEmail}
                    onChange={(e) => {
                      setReceiptEmail(e.target.value);
                      setError(null);
                    }}
                    placeholder="you@example.com"
                    aria-describedby="topup-receipt-note"
                  />
                  <p id="topup-receipt-note" className="mt-1.5 text-meta text-ink-3">
                    Used once, by Stripe, to send this receipt. Leave it blank to stay fully
                    anonymous.
                  </p>
                </>
              )}
            </div>

            {(error || (customDollars !== '' && amountProblem)) && (
              <p id="topup-error" role="alert" className="mt-3 flex items-start gap-2 text-dense text-down">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{error ?? amountProblem}</span>
              </p>
            )}

            <button
              type="button"
              onClick={() => void startPayment()}
              disabled={isCreatingIntent || !amountIsValid}
              className="btn btn-gold mt-5 w-full"
            >
              {isCreatingIntent ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" aria-hidden />
                  <span>Preparing secure checkout…</span>
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  <span className="tnum">Continue to payment ({formatCents(selectedCents)})</span>
                </>
              )}
            </button>
          </>
        )}

        {phase === 'pay' && intent && stripePromise && (
          <Elements
            key={intent.client_secret}
            stripe={stripePromise}
            options={{ clientSecret: intent.client_secret, appearance: STRIPE_APPEARANCE }}
          >
            <CheckoutSurface
              amountCents={intent.amount_cents ?? selectedCents}
              onPaid={(paymentIntentId) => void syncTopUp(paymentIntentId)}
              onBack={() => {
                setIntent(null);
                setPhase('amount');
              }}
            />
          </Elements>
        )}

        {phase === 'syncing' && (
          <div className="flex items-center gap-2.5 py-8 text-dense text-ink-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold/30 border-t-gold" aria-hidden />
            <span>Payment accepted — crediting your wallet…</span>
          </div>
        )}

        {phase === 'sync_failed' && (
          <div className="space-y-4 py-2">
            <p role="alert" className="flex items-start gap-2 text-dense text-down">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{error ?? 'We could not confirm the credit yet.'}</span>
            </p>

            {pendingIntentId ? (
              <>
                <p className="text-meta text-ink-3">
                  Your card was charged. The credit is safe — retrying is free and cannot charge you twice.
                </p>
                <button
                  type="button"
                  onClick={() => void syncTopUp(pendingIntentId)}
                  className="btn btn-gold w-full"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Retry crediting my wallet</span>
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setPhase('amount')} className="btn btn-ghost w-full">
                Back to amount
              </button>
            )}
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-2.5 text-dense text-up">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="tnum">
                {creditedCents > 0 ? `${formatCents(creditedCents)} added to your wallet.` : 'Your wallet is up to date.'}
              </span>
            </div>
            <button type="button" onClick={onClose} className="btn btn-gold w-full">
              Done
            </button>
          </div>
        )}

        {/* Trust footer — only claims that are actually true */}
        <div className="micro-label mt-4 flex items-center gap-1.5 border-t border-line pt-3 text-ink-3">
          <Lock className="h-3 w-3" />
          <span>Secure checkout by Stripe — card details never reach our servers</span>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};

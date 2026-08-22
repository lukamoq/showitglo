'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/layout/Navbar';
import { BoostDrawer } from '@/components/boost/BoostDrawer';
import { WalletTopUpModal } from '@/components/wallet/WalletTopUpModal';
import { SecureWalletCard } from '@/components/wallet/SecureWalletCard';
import { RecoverWalletDialog } from '@/components/wallet/RecoverWalletDialog';
import { User, RankedPostView, Notification } from '@/lib/types';
import { formatCents, timeAgo } from '@/lib/utils';
import {
  LayoutDashboard,
  Trophy,
  Zap,
  CreditCard,
  Plus,
  AlertCircle,
  RefreshCw,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { apiGet, apiPost, errorText } from '@/components/system/api';
import { useWallet } from '@/components/system/useWallet';

interface DashboardResponse {
  user: User;
  posts: RankedPostView[];
  reclaim_alerts: Notification[];
  metrics: {
    total_posts: number;
    total_boosts: number;
    total_spent_cents: number;
    active_top_rank: number | null;
  };
}

const EMPTY_METRICS = {
  total_posts: 0,
  total_boosts: 0,
  total_spent_cents: 0,
  active_top_rank: null as number | null,
};

const ERASE_CONFIRM_WORD = 'DELETE';

/**
 * The outcomes /api/v1/auth/confirm and /api/v1/auth/magic redirect back with.
 * Both endpoints are opened from an inbox, so the result has to be legible on
 * the page the browser lands on rather than in a JSON body nobody sees.
 */
const LINK_BANNERS: Record<string, { tone: 'good' | 'bad'; message: string }> = {
  '1': { tone: 'good', message: 'Email confirmed. Your wallet can now be recovered with it, and receipts will go there.' },
  conflict: {
    tone: 'bad',
    message: 'That address already secures another wallet, so nothing was linked. Use “Recover wallet” to get into that one.',
  },
  invalid: {
    tone: 'bad',
    message: 'That confirmation link is invalid, expired or already used. Request a new one below.',
  },
};

const RECOVER_BANNERS: Record<string, { tone: 'good' | 'bad'; message: string }> = {
  '1': { tone: 'good', message: 'Welcome back — this browser now holds your recovered wallet session.' },
  invalid: {
    tone: 'bad',
    message: 'That recovery link is invalid, expired or already used. Ask for a fresh one.',
  },
};

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<RankedPostView[]>([]);
  const [reclaimAlerts, setReclaimAlerts] = useState<Notification[]>([]);
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedPostForBoost, setSelectedPostForBoost] = useState<RankedPostView | null>(null);
  const [isBoostOpen, setIsBoostOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  const [isErasePanelOpen, setIsErasePanelOpen] = useState(false);
  const [eraseConfirmText, setEraseConfirmText] = useState('');
  const [eraseError, setEraseError] = useState<string | null>(null);
  const [isErasing, setIsErasing] = useState(false);
  const [erasureDone, setErasureDone] = useState(false);

  const [isRecoverOpen, setIsRecoverOpen] = useState(false);
  const [authBanner, setAuthBanner] = useState<{ tone: 'good' | 'bad'; message: string } | null>(null);

  const {
    wallet,
    ledger,
    balanceCents,
    hasReceiptEmail,
    receiptEmailMasked,
    isLoading: isWalletLoading,
    refresh: refreshWallet,
  } = useWallet();
  const eraseInFlightRef = useRef(false);

  /**
   * Read from `window.location` rather than `useSearchParams` so the page
   * needs no Suspense boundary, and strip the parameter afterwards: a
   * `?recovered=1` left in the URL gets bookmarked and shared, and re-announces
   * a recovery that happened days ago every time the page is opened.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linked = params.get('linked');
    const recovered = params.get('recovered');

    const banner = (linked && LINK_BANNERS[linked]) || (recovered && RECOVER_BANNERS[recovered]) || null;
    if (!banner) return;

    setAuthBanner(banner);
    params.delete('linked');
    params.delete('recovered');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, []);

  const fetchDashboard = useCallback(async () => {
    const res = await apiGet<DashboardResponse>('/api/v1/me/dashboard');
    setIsLoading(false);

    if (!res.ok || !res.data?.user) {
      setLoadError(errorText(res, 'Your terminal could not be loaded.'));
      return;
    }

    setLoadError(null);
    setUser(res.data.user);
    setPosts(res.data.posts || []);
    setReclaimAlerts(res.data.reclaim_alerts || []);
    setMetrics(res.data.metrics || EMPTY_METRICS);
  }, []);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const handle1TapReclaim = (alert: Notification) => {
    const targetPost = posts.find((p) => p.id === alert.payload.post_id);
    if (targetPost) {
      setSelectedPostForBoost(targetPost);
      setIsBoostOpen(true);
    }
  };

  const handleGdprErasure = async () => {
    if (eraseInFlightRef.current) return;
    if (eraseConfirmText.trim().toUpperCase() !== ERASE_CONFIRM_WORD) {
      setEraseError(`Type ${ERASE_CONFIRM_WORD} to confirm.`);
      return;
    }

    eraseInFlightRef.current = true;
    setIsErasing(true);
    setEraseError(null);

    const res = await apiPost('/api/v1/me/erase', { confirm: true });

    eraseInFlightRef.current = false;
    setIsErasing(false);

    if (!res.ok) {
      setEraseError(errorText(res, 'Your data could not be erased. Nothing was changed.'));
      return;
    }

    setErasureDone(true);
    setIsErasePanelOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden">
      <Navbar onBalanceUpdated={() => void refreshWallet()} />

      <div className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        {/* Header & Wallet Banner */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-line">
          <div>
            <div className="kicker flex items-center gap-2">
              <LayoutDashboard className="w-3.5 h-3.5" aria-hidden />
              <span>Combatant &amp; Creator Terminal</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-ink mt-2">
              {user?.alias || 'Anonymous'}
            </h1>
            <p className="text-meta text-ink-3 mt-1">
              {hasReceiptEmail
                ? 'Anonymous session · recoverable with your linked email'
                : 'Anonymous session · no account, no email required'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={() => setIsTopUpOpen(true)} className="btn btn-gold btn-sm">
              <Plus className="w-3.5 h-3.5" />
              <span>Add Funds</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsErasePanelOpen((open) => !open);
                setEraseError(null);
                setEraseConfirmText('');
              }}
              aria-expanded={isErasePanelOpen}
              className="btn btn-ghost btn-sm !text-down hover:border-down/40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Erase my data</span>
            </button>
          </div>
        </div>

        {authBanner && (
          <div
            role="status"
            className={`mt-4 rounded-card p-4 text-dense animate-rise flex flex-wrap items-center justify-between gap-3 ${
              authBanner.tone === 'good'
                ? 'border border-up/30 bg-up/10 text-up'
                : 'border border-down/30 bg-down/10 text-down'
            }`}
          >
            <span className="flex items-start gap-2">
              {authBanner.tone === 'good' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              )}
              <span>{authBanner.message}</span>
            </span>
            <button type="button" onClick={() => setAuthBanner(null)} className="btn btn-ghost btn-xs">
              Dismiss
            </button>
          </div>
        )}

        {loadError && (
          <div className="mt-4 rounded-card border border-down/30 bg-down/10 p-4 text-dense text-down flex flex-wrap items-center justify-between gap-3">
            <span role="alert">{loadError}</span>
            <button type="button" onClick={() => void fetchDashboard()} className="btn btn-ghost btn-xs">
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Optional email link — the only place the product ever asks for one. */}
        <div className="mt-6">
          <SecureWalletCard
            hasEmail={hasReceiptEmail}
            maskedEmail={receiptEmailMasked}
            isLoading={isWalletLoading}
          />
        </div>

        {isErasePanelOpen && !erasureDone && (
          <div className="mt-4 panel rounded-card p-5 animate-rise space-y-3">
            <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-down" aria-hidden />
              <span>Erase everything tied to this session</span>
            </h2>
            <p className="text-dense text-ink-2 leading-relaxed max-w-[70ch]">
              Your alias is removed, your backings are anonymised, and the stances you authored are
              tombstoned. This is irreversible, and any remaining wallet balance is not refunded by
              this action.
            </p>

            <div>
              <label htmlFor="erase-confirm" className="kicker block mb-1.5">
                Type {ERASE_CONFIRM_WORD} to confirm
              </label>
              <input
                id="erase-confirm"
                type="text"
                autoComplete="off"
                value={eraseConfirmText}
                onChange={(e) => {
                  setEraseConfirmText(e.target.value);
                  setEraseError(null);
                }}
                aria-describedby={eraseError ? 'erase-error' : undefined}
                placeholder={ERASE_CONFIRM_WORD}
                className="field max-w-xs"
              />
            </div>

            {eraseError && (
              <p id="erase-error" role="alert" className="text-dense text-down">
                {eraseError}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleGdprErasure()}
                disabled={isErasing || eraseConfirmText.trim().toUpperCase() !== ERASE_CONFIRM_WORD}
                className="btn btn-danger btn-sm"
              >
                {isErasing ? 'Erasing…' : 'Erase my data permanently'}
              </button>
              <button type="button" onClick={() => setIsErasePanelOpen(false)} className="btn btn-ghost btn-sm">
                Cancel
              </button>
            </div>
          </div>
        )}

        {erasureDone && (
          <div className="mt-4 rounded-card border border-up/30 bg-up/10 p-4 animate-rise space-y-3">
            <p className="text-dense text-up flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              <span>
                Your data has been erased: alias removed, backings anonymised, authored stances
                tombstoned.
              </span>
            </p>
            <button type="button" onClick={() => window.location.reload()} className="btn btn-ghost btn-sm">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reload with a fresh session</span>
            </button>
          </div>
        )}

        {/* 1-Tap Outbid Reclaim Alerts */}
        {reclaimAlerts.length > 0 && (
          <div className="mt-8">
            <h2 className="kicker !text-down flex items-center gap-1.5 mb-3">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden />
              <span>Outbid Alerts — Defend Your Rank</span>
            </h2>

            <div className="panel rounded-card overflow-hidden divide-y divide-line">
              {reclaimAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="relative px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors duration-200 hover:bg-white/[0.04]"
                >
                  <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-down" />

                  <div className="min-w-0">
                    <span className="font-semibold text-[15px] text-ink block">
                      {alert.payload.post_title}
                    </span>
                    <span className="text-meta text-ink-3">
                      {alert.payload.message}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handle1TapReclaim(alert)}
                    className="btn btn-ghost btn-sm !text-gold-text hover:border-gold/40 shrink-0 self-start sm:self-auto"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span className="tnum">
                      Reclaim #{alert.payload.old_rank}
                      {typeof alert.payload.reclaim_amount_cents === 'number'
                        ? ` (${formatCents(alert.payload.reclaim_amount_cents)})`
                        : ''}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4-Stat Terminal Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          <div className="card rounded-card p-4">
            <div className="micro-label text-ink-3">Wallet Available</div>
            <div className="metric text-2xl text-gold-text tnum mt-1.5 leading-none">
              {formatCents(balanceCents)}
            </div>
            <div className="text-meta text-ink-3 mt-1.5">Closed-loop balance</div>
          </div>

          <div className="card rounded-card p-4">
            <div className="micro-label text-ink-3">Lifetime Spend</div>
            <div className="metric text-2xl text-ink tnum mt-1.5 leading-none">
              {formatCents(wallet?.lifetime_spend_cents || 0)}
            </div>
            <div className="text-meta text-ink-3 mt-1.5">Likes &amp; boosts</div>
          </div>

          <div className="card rounded-card p-4">
            <div className="micro-label text-ink-3">My Ranked Stances</div>
            <div className="metric text-2xl text-ink tnum mt-1.5 leading-none">
              {metrics.total_posts}
            </div>
          </div>

          <div className="card rounded-card p-4">
            <div className="micro-label text-ink-3">Top Active Rank</div>
            <div className="metric text-2xl text-ink tnum mt-1.5 leading-none">
              {metrics.active_top_rank ? `#${metrics.active_top_rank}` : 'None'}
            </div>
          </div>
        </div>

        {/* My Stances / Opinions */}
        <div className="mt-12">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-4 h-4 text-ink-3" aria-hidden />
            <h2 className="text-xl font-bold tracking-tight text-ink">My Ranked Opinions</h2>
            <span className="chip text-steel tnum">{posts.length}</span>
          </div>

          <div className="panel rounded-card overflow-hidden">
            <div className="hidden lg:grid lg:grid-cols-[3.5rem_1fr_7rem_auto] gap-4 items-center px-4 sm:px-5 py-2 border-b border-line bg-black/20">
              <div className="micro-label text-ink-3 text-right">Rank</div>
              <div className="micro-label text-ink-3">Stance</div>
              <div className="micro-label text-ink-3 text-right">Score</div>
              <div className="micro-label text-ink-3 text-right">Actions</div>
            </div>

            <div className="divide-y divide-line">
              {posts.length > 0 ? (
                posts.map((post) => (
                  <div
                    key={post.id}
                    className="relative px-4 sm:px-5 py-4 transition-colors duration-200 hover:bg-white/[0.04]"
                  >
                    {post.rank === 1 && (
                      <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-gold" />
                    )}

                    <div className="flex flex-col lg:grid lg:grid-cols-[3.5rem_1fr_7rem_auto] gap-3 lg:gap-4 lg:items-center">
                      {/* Rank */}
                      <div className="flex items-center lg:justify-end shrink-0">
                        <span
                          className={`metric text-xl leading-none tnum ${
                            post.rank === 1 ? 'text-gold-text' : post.rank ? 'text-ink' : 'text-ink-3'
                          }`}
                        >
                          #{post.rank || '—'}
                        </span>
                      </div>

                      {/* Statement */}
                      <div className="min-w-0">
                        <Link
                          href={`/p/${post.slug}`}
                          className="font-semibold text-[15px] sm:text-base text-ink hover:text-gold-text transition-colors line-clamp-1 underline-offset-4 hover:underline"
                        >
                          {post.title}
                        </Link>
                        <div className="mt-1 flex items-center gap-2 text-meta text-ink-3 flex-wrap">
                          <span className="tnum">{post.backers_count} backers</span>
                          <span aria-hidden className="text-ink-3/50">·</span>
                          <span className="tnum">{formatCents(post.total_raised_cents)} raised</span>
                        </div>
                      </div>

                      {/* Score */}
                      <div className="flex items-baseline gap-2 lg:block lg:text-right">
                        <div className="micro-label text-ink-3 lg:hidden">Score</div>
                        <div
                          className={`metric text-lg leading-tight tnum ${
                            post.rank === 1 ? 'text-gold-text' : 'text-ink'
                          }`}
                        >
                          ${post.display_score.toFixed(2)}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0 lg:justify-end pt-2 lg:pt-0 border-t lg:border-t-0 border-line">
                        <Link
                          href={`/p/${post.slug}`}
                          className="btn btn-ghost btn-xs"
                        >
                          View Record
                        </Link>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPostForBoost(post);
                            setIsBoostOpen(true);
                          }}
                          className="btn btn-ghost btn-xs !text-gold-text hover:border-gold/40"
                        >
                          <Zap className="w-3 h-3" />
                          <span>Boost</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : isLoading ? (
                <div className="space-y-2 p-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="skeleton h-12 w-full rounded-control" />
                  ))}
                </div>
              ) : (
                <div className="py-10 text-center space-y-2">
                  <p className="text-dense text-ink-3">No ranked stances yet.</p>
                  {/* A visitor staring at an empty terminal may be looking at a
                      NEW anonymous session rather than an empty old one —
                      cleared cookies, another device. This is the way back. */}
                  <p className="text-meta text-ink-3">
                    Expected to see a wallet here?{' '}
                    <button
                      type="button"
                      onClick={() => setIsRecoverOpen(true)}
                      className="text-gold-text underline underline-offset-4 hover:text-ink transition-colors"
                    >
                      Recover a wallet you secured with email
                    </button>
                    .
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Wallet Ledger History */}
        <div className="mt-12">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-4 h-4 text-ink-3" aria-hidden />
            <h2 className="text-xl font-bold tracking-tight text-ink">Wallet Transaction Ledger</h2>
            <span className="chip text-steel tnum">{ledger.length}</span>
          </div>

          <div className="panel rounded-card overflow-hidden">
            <div className="hidden sm:grid sm:grid-cols-[7rem_1fr_9rem_7rem] gap-4 items-center px-4 sm:px-5 py-2 border-b border-line bg-black/20">
              <div className="micro-label text-ink-3 text-right">Amount</div>
              <div className="micro-label text-ink-3">Type</div>
              <div className="micro-label text-ink-3 text-right">Balance After</div>
              <div className="micro-label text-ink-3 text-right">When</div>
            </div>

            <div className="divide-y divide-line max-h-[28rem] overflow-y-auto">
              {ledger.length > 0 ? (
                ledger.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:grid sm:grid-cols-[7rem_1fr_9rem_7rem] sm:gap-4 px-4 sm:px-5 py-2.5 text-dense transition-colors duration-200 hover:bg-white/[0.04]"
                  >
                    <span
                      className={`font-semibold tnum sm:text-right ${
                        entry.delta_cents > 0 ? 'text-up' : 'text-ink-2'
                      }`}
                    >
                      {entry.delta_cents > 0 ? `+${formatCents(entry.delta_cents)}` : formatCents(entry.delta_cents)}
                    </span>

                    <span>
                      <span className="chip text-steel">{entry.kind}</span>
                    </span>

                    <span className="text-ink-3 tnum sm:text-right">
                      <span className="sm:hidden micro-label mr-1">Balance</span>
                      {formatCents(entry.balance_after_cents)}
                    </span>

                    <span className="text-meta text-ink-3 text-right ml-auto sm:ml-0">
                      {timeAgo(entry.created_at)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-dense text-ink-3 py-10 text-center">No wallet activity yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <BoostDrawer
        post={selectedPostForBoost}
        isOpen={isBoostOpen}
        onClose={() => setIsBoostOpen(false)}
        onSuccess={() => {
          void fetchDashboard();
          void refreshWallet();
        }}
      />

      <WalletTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => {
          setIsTopUpOpen(false);
          void refreshWallet();
        }}
        currentBalanceCents={balanceCents}
        onTopUpSuccess={() => {
          void refreshWallet();
          void fetchDashboard();
          setIsTopUpOpen(false);
        }}
      />

      <RecoverWalletDialog isOpen={isRecoverOpen} onClose={() => setIsRecoverOpen(false)} />
    </div>
  );
}

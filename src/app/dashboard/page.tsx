'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/layout/Navbar';
import { BoostDrawer } from '@/components/boost/BoostDrawer';
import { WalletTopUpModal } from '@/components/wallet/WalletTopUpModal';
import { User, Wallet, WalletLedgerEntry, RankedPostView, Notification } from '@/lib/types';
import { formatUSD, formatCents, timeAgo } from '@/lib/utils';
import {
  LayoutDashboard,
  Trophy,
  Zap,
  CreditCard,
  Plus,
  AlertCircle,
  Trash2,
} from 'lucide-react';

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [posts, setPosts] = useState<RankedPostView[]>([]);
  const [reclaimAlerts, setReclaimAlerts] = useState<Notification[]>([]);
  const [metrics, setMetrics] = useState({
    total_posts: 0,
    total_boosts: 0,
    total_spent_cents: 0,
    active_top_rank: null as number | null,
  });

  const [selectedPostForBoost, setSelectedPostForBoost] = useState<RankedPostView | null>(null);
  const [isBoostOpen, setIsBoostOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [erasureDone, setErasureDone] = useState(false);

  const fetchDashboard = async () => {
    try {
      const [resDash, resWallet] = await Promise.all([
        fetch('/api/v1/me/dashboard'),
        fetch('/api/v1/wallet?user_id=usr_marc'),
      ]);
      const dataDash = await resDash.json();
      const dataWallet = await resWallet.json();

      if (dataDash.user) {
        setUser(dataDash.user);
        setPosts(dataDash.posts || []);
        setReclaimAlerts(dataDash.reclaim_alerts || []);
        setMetrics(dataDash.metrics || {});
      }
      if (dataWallet.wallet) {
        setWallet(dataWallet.wallet);
        setLedger(dataWallet.ledger || []);
      }
    } catch (err) {
      console.error('Error fetching dashboard:', err);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handle1TapReclaim = (alert: Notification) => {
    const targetPost = posts.find((p) => p.id === alert.payload.post_id);
    if (targetPost) {
      setSelectedPostForBoost(targetPost);
      setIsBoostOpen(true);
    }
  };

  const handleGdprErasure = async () => {
    if (!user) return;
    if (!confirm('Are you sure? Per GDPR Right to Erasure, all your personal data will be anonymized and your authored opinions will be tombstoned.')) {
      return;
    }

    try {
      const res = await fetch('/api/v1/me/erase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
      if (res.ok) {
        setErasureDone(true);
        fetchDashboard();
      }
    } catch (err) {
      console.error('Error erasing account:', err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden">
      <Navbar onBalanceUpdated={() => fetchDashboard()} />

      <div className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        {/* Header & Wallet Banner */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-line">
          <div>
            <div className="kicker flex items-center gap-2">
              <LayoutDashboard className="w-3.5 h-3.5" aria-hidden />
              <span>Combatant &amp; Creator Terminal</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-ink mt-2">
              {user?.alias || 'Marc (ShipFast)'}
            </h1>
            <p className="text-meta text-ink-3 mt-1">
              Verified Fighter · {user?.email}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsTopUpOpen(true)}
              className="btn btn-gold btn-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Refill Wallet</span>
            </button>

            <button
              onClick={handleGdprErasure}
              className="btn btn-ghost btn-sm text-down hover:border-down/40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">GDPR Erasure</span>
            </button>
          </div>
        </div>

        {erasureDone && (
          <div className="mt-4 rounded-card border border-up/30 bg-up/10 p-4 text-dense text-up animate-rise">
            ✓ Account data successfully anonymized and content tombstoned under GDPR Article 17.
          </div>
        )}

        {/* 1-Tap Outbid Reclaim Alerts */}
        {reclaimAlerts.length > 0 && (
          <div className="mt-8">
            <h2 className="kicker text-down flex items-center gap-1.5 mb-3">
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
                    onClick={() => handle1TapReclaim(alert)}
                    className="btn btn-ghost btn-sm text-gold-text hover:border-gold/40 shrink-0 self-start sm:self-auto"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span className="tnum">
                      1-Tap Reclaim #{alert.payload.old_rank} ({formatCents(alert.payload.reclaim_amount_cents || 1000)})
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
              {formatCents(wallet?.balance_cents || 0)}
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
            <div className="text-meta text-ink-3 mt-1.5">On the permanent board</div>
          </div>

          <div className="card rounded-card p-4">
            <div className="micro-label text-ink-3">Top Active Rank</div>
            <div className="metric text-2xl text-ink tnum mt-1.5 leading-none">
              {metrics.active_top_rank ? `#${metrics.active_top_rank}` : 'None'}
            </div>
            <div className="text-meta text-ink-3 mt-1.5">Best standing right now</div>
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
                          onClick={() => {
                            setSelectedPostForBoost(post);
                            setIsBoostOpen(true);
                          }}
                          className="btn btn-ghost btn-xs text-gold-text hover:border-gold/40"
                        >
                          <Zap className="w-3 h-3" />
                          <span>Boost</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-dense text-ink-3 py-10 text-center">No ranked stances yet.</p>
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
                    className="flex items-center justify-between gap-4 sm:grid sm:grid-cols-[7rem_1fr_9rem_7rem] px-4 sm:px-5 py-2.5 text-dense transition-colors duration-200 hover:bg-white/[0.04]"
                  >
                    <span
                      className={`font-semibold tnum sm:text-right ${
                        entry.delta_cents > 0 ? 'text-up' : 'text-ink-2'
                      }`}
                    >
                      {entry.delta_cents > 0 ? `+${formatCents(entry.delta_cents)}` : formatCents(entry.delta_cents)}
                    </span>

                    <span className="hidden sm:block">
                      <span className="chip text-steel">{entry.kind}</span>
                    </span>

                    <span className="hidden sm:block text-ink-3 tnum text-right">
                      {formatCents(entry.balance_after_cents)}
                    </span>

                    <span className="text-meta text-ink-3 text-right">{timeAgo(entry.created_at)}</span>
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
        onSuccess={() => fetchDashboard()}
      />

      <WalletTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => {
          setIsTopUpOpen(false);
          fetchDashboard();
        }}
        currentBalanceCents={wallet?.balance_cents || 0}
        onTopUpSuccess={() => {
          fetchDashboard();
          setIsTopUpOpen(false);
        }}
      />
    </div>
  );
}

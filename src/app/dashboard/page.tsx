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
  Clock,
  Sparkles,
  Trash2,
  Users,
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
    <div className="min-h-screen bg-[#060709] text-white flex flex-col relative overflow-x-hidden">
      <Navbar onBalanceUpdated={() => fetchDashboard()} />

      <div className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Header & Wallet Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-purple-400 font-semibold uppercase">
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Combatant & Creator Terminal</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white mt-1">
              {user?.alias || 'Marc (ShipFast)'}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Verified Fighter • {user?.email}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsTopUpOpen(true)}
              className="btn-glass-cyan px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Refill Wallet</span>
            </button>

            <button
              onClick={handleGdprErasure}
              className="btn-glass-dark px-3 py-2 rounded-xl text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">GDPR Erasure</span>
            </button>
          </div>
        </div>

        {erasureDone && (
          <div className="mt-4 p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs">
            ✓ Account data successfully anonymized and content tombstoned under GDPR Article 17.
          </div>
        )}

        {/* 1-Tap Outbid Reclaim Alerts */}
        {reclaimAlerts.length > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              <span>Outbid Alerts — Defend Your Rank</span>
            </h3>

            {reclaimAlerts.map((alert) => (
              <div
                key={alert.id}
                className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/40 via-amber-950/20 to-slate-900 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg"
              >
                <div>
                  <span className="font-bold text-sm text-white block">
                    {alert.payload.post_title}
                  </span>
                  <span className="text-xs text-rose-300/90">
                    {alert.payload.message}
                  </span>
                </div>

                <button
                  onClick={() => handle1TapReclaim(alert)}
                  className="btn-glass-gold px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer shadow-md"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>
                    1-Tap Reclaim #{alert.payload.old_rank} ({formatCents(alert.payload.reclaim_amount_cents || 1000)})
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 4-Stat Terminal Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="glass-card p-4 rounded-2xl border border-emerald-500/30">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Wallet Available</div>
            <div className="text-2xl font-black font-mono text-emerald-400 mt-1 tabular-nums">
              {formatCents(wallet?.balance_cents || 0)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Closed-loop balance</div>
          </div>

          <div className="glass-card p-4 rounded-2xl border border-white/10">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Lifetime Spend</div>
            <div className="text-2xl font-black font-mono text-amber-400 mt-1 tabular-nums">
              {formatCents(wallet?.lifetime_spend_cents || 0)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Likes & boosts</div>
          </div>

          <div className="glass-card p-4 rounded-2xl border border-white/10">
            <div className="text-[10px] text-slate-400 uppercase font-mono">My Ranked Stances</div>
            <div className="text-2xl font-black font-mono text-white mt-1">
              {metrics.total_posts}
            </div>
          </div>

          <div className="glass-card p-4 rounded-2xl border border-white/10">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Top Active Rank</div>
            <div className="text-2xl font-black font-mono text-cyan-400 mt-1">
              {metrics.active_top_rank ? `#${metrics.active_top_rank}` : 'None'}
            </div>
          </div>
        </div>

        {/* My Stances / Opinions */}
        <div className="mt-10">
          <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>My Ranked Opinions ({posts.length})</span>
          </h2>

          <div className="space-y-3">
            {posts.map((post) => (
              <div
                key={post.id}
                className="glass-card p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-black ${
                      post.rank === 1 ? 'bg-amber-500 text-black' : 'glass-segmented text-white'
                    }`}
                  >
                    #{post.rank || '—'}
                  </div>

                  <div>
                    <Link
                      href={`/p/${post.slug}`}
                      className="font-bold text-sm sm:text-base text-white hover:text-amber-300"
                    >
                      {post.title}
                    </Link>
                    <div className="text-xs text-slate-400 mt-0.5 font-mono flex items-center gap-2">
                      <span>Score: ${post.display_score.toFixed(2)}</span>
                      <span>•</span>
                      <span className="text-cyan-300">{post.backers_count} backers</span>
                      <span>•</span>
                      <span>{formatCents(post.total_raised_cents)} raised</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/p/${post.slug}`}
                    className="btn-glass-dark px-3 py-1.5 rounded-xl text-xs font-semibold"
                  >
                    View Record
                  </Link>

                  <button
                    onClick={() => {
                      setSelectedPostForBoost(post);
                      setIsBoostOpen(true);
                    }}
                    className="btn-glass-gold px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Zap className="w-3 h-3" />
                    <span>Boost</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Wallet Ledger History */}
        <div className="mt-10">
          <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-400" />
            <span>Wallet Transaction Ledger ({ledger.length})</span>
          </h2>

          <div className="glass-panel p-5 rounded-3xl border border-white/10 space-y-2">
            {ledger.length > 0 ? (
              ledger.map((entry) => (
                <div
                  key={entry.id}
                  className="glass-card p-3 rounded-xl flex items-center justify-between text-xs font-mono"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-bold ${
                        entry.delta_cents > 0 ? 'text-emerald-400' : 'text-slate-300'
                      }`}
                    >
                      {entry.delta_cents > 0 ? `+${formatCents(entry.delta_cents)}` : formatCents(entry.delta_cents)}
                    </span>
                    <span className="text-slate-400 font-sans uppercase text-[10px] px-1.5 py-0.5 rounded bg-white/5">
                      {entry.kind}
                    </span>
                    <span className="text-slate-500">
                      Balance: {formatCents(entry.balance_after_cents)}
                    </span>
                  </div>
                  <span className="text-slate-500">{timeAgo(entry.created_at)}</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 py-6 text-center">No wallet activity yet.</p>
            )}
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

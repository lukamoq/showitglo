'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Category, AuditLog, Report, Post } from '@/lib/types';
import { formatUSD, formatCents, timeAgo } from '@/lib/utils';
import {
  ShieldAlert,
  Sliders,
  DollarSign,
  FileText,
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  CreditCard,
  Users,
} from 'lucide-react';

export default function AdminPage() {
  const [stats, setStats] = useState<any>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [pendingPosts, setPendingPosts] = useState<Post[]>([]);

  const [selectedStrategy, setSelectedStrategy] = useState<string>('percent');
  const [halfLifeHours, setHalfLifeHours] = useState<number>(168);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchAdminData = async () => {
    try {
      const [resOverview, resMod] = await Promise.all([
        fetch('/api/v1/admin/overview'),
        fetch('/api/v1/admin/moderation'),
      ]);
      const dataOverview = await resOverview.json();
      const dataMod = await resMod.json();

      if (dataOverview.stats) setStats(dataOverview.stats);
      if (dataOverview.categories) {
        setCategories(dataOverview.categories);
        const globalCat = dataOverview.categories.find((c: any) => c.id === 'global');
        if (globalCat) {
          setSelectedStrategy(globalCat.increment_strategy);
          setHalfLifeHours(globalCat.half_life_hours);
        }
      }
      if (dataOverview.recent_audit_logs) setAuditLogs(dataOverview.recent_audit_logs);
      if (dataMod.reports) setReports(dataMod.reports);
      if (dataMod.pending_posts) setPendingPosts(dataMod.pending_posts);
    } catch (err) {
      console.error('Error fetching admin data:', err);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleUpdateStrategy = async () => {
    try {
      const res = await fetch('/api/v1/admin/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: 'global',
          strategy: selectedStrategy,
          half_life_hours: Number(halfLifeHours),
        }),
      });
      if (res.ok) {
        setStatusMessage('✓ Strategy and half-life updated successfully in ledger!');
        fetchAdminData();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRebase = async () => {
    if (!confirm('Rebase Board Epoch T0 to now? All base scores will be scaled by decay factor.')) return;
    try {
      const res = await fetch('/api/v1/admin/rebase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: 'global' }),
      });
      if (res.ok) {
        setStatusMessage('✓ Epoch rebase executed. Invariant base scores updated.');
        fetchAdminData();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleModerate = async (postId: string, action: 'approve' | 'reject' | 'remove') => {
    const reason = prompt(`Enter reason for ${action}:`, action === 'remove' ? 'Violated Terms §4: Unverified promotional claim' : 'Passed manual verification');
    if (!reason) return;

    try {
      const res = await fetch('/api/v1/admin/moderation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id: postId,
          action,
          reason,
        }),
      });
      if (res.ok) {
        setStatusMessage(`✓ Opinion ${action} applied.`);
        fetchAdminData();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#060709] text-white flex flex-col relative overflow-x-hidden">
      <Navbar />

      <div className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Header */}
        <div className="pb-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 font-semibold uppercase">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>ShowItGlo Market Operations & Trust Center</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white mt-1">
              Admin & Market Control
            </h1>
          </div>

          <button
            onClick={handleRebase}
            className="btn-glass-cyan px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Trigger Epoch Rebase</span>
          </button>
        </div>

        {statusMessage && (
          <div className="mt-4 p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs">
            {statusMessage}
          </div>
        )}

        {/* Deferred vs Recognized Revenue Bar (Blueprint §5 & §13) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="glass-card p-4 rounded-2xl border border-emerald-500/30">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Recognized Spend Revenue</div>
            <div className="text-2xl font-black font-mono text-white mt-1">
              {formatUSD(stats.recognized_spend_dollars || 0)}
            </div>
            <div className="text-[10px] text-emerald-400 mt-0.5">Interaction spend</div>
          </div>

          <div className="glass-card p-4 rounded-2xl border border-white/10">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Unspent Wallet Float</div>
            <div className="text-2xl font-black font-mono text-cyan-400 mt-1">
              {formatUSD(stats.unspent_float_dollars || 0)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Deferred Revenue Liability</div>
          </div>

          <div className="glass-card p-4 rounded-2xl border border-white/10">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Stripe Top-Up Fees</div>
            <div className="text-2xl font-black font-mono text-rose-400 mt-1">
              {formatUSD(stats.stripe_fees_dollars || 0)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">~4-6% on prepaid volume</div>
          </div>

          <div className="glass-card p-4 rounded-2xl border border-white/10">
            <div className="text-[10px] text-slate-400 uppercase font-mono">Penny Army Backers</div>
            <div className="text-2xl font-black font-mono text-amber-400 mt-1">
              {(stats.distinct_backers || 0).toLocaleString()}
            </div>
            <div className="text-[10px] text-amber-300/80 mt-0.5">{(stats.total_likes_units || 0).toLocaleString()} penny likes</div>
          </div>
        </div>

        {/* 2-Column Section: Market Mechanics & Moderation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          {/* Column 1: Market Mechanics */}
          <div className="glass-panel p-6 rounded-3xl border border-white/10">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Increment Strategy & Decay Engine</span>
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Leaderboard Displacement Rule:
                </label>
                <div className="space-y-2">
                  {[
                    { id: 'percent', label: 'Percentage (+10%, min $0.50)', desc: 'Recommended default. Scales with stakes.' },
                    { id: 'fixed', label: 'Fixed Increment (+ $0.10)', desc: 'High-frequency micro-fights.' },
                    { id: 'expo', label: 'Exponential (× 2.0)', desc: 'Doubling Day spectacle events only.' },
                  ].map((st) => (
                    <label
                      key={st.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                        selectedStrategy === st.id
                          ? 'bg-amber-500/20 border-amber-500/50 text-white'
                          : 'glass-card border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="strategy"
                        checked={selectedStrategy === st.id}
                        onChange={() => setSelectedStrategy(st.id)}
                        className="mt-0.5 accent-amber-500"
                      />
                      <div>
                        <span className="font-bold text-xs block text-white">{st.label}</span>
                        <span className="text-[11px] text-slate-400">{st.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Half-Life Decay Window:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { hours: 24, label: '24 Hours (Fast)' },
                    { hours: 168, label: '7 Days (Standard)' },
                    { hours: 720, label: '30 Days (Slow)' },
                  ].map((h) => (
                    <button
                      key={h.hours}
                      onClick={() => setHalfLifeHours(h.hours)}
                      className={`py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                        halfLifeHours === h.hours
                          ? 'bg-amber-500 text-black font-bold shadow-md'
                          : 'glass-card text-slate-300 hover:text-white'
                      }`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleUpdateStrategy}
                className="w-full btn-glass-gold py-2.5 rounded-xl text-xs font-bold cursor-pointer"
              >
                Save Market Parameters
              </button>
            </div>
          </div>

          {/* Column 2: Moderation Queue */}
          <div className="glass-panel p-6 rounded-3xl border border-white/10">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>Gate 1 Visibility-Tiered Moderation</span>
            </h3>

            {pendingPosts.length > 0 ? (
              <div className="space-y-3">
                {pendingPosts.map((post) => (
                  <div key={post.id} className="p-4 rounded-xl glass-card border border-rose-500/30 text-xs">
                    <span className="font-bold text-white block text-sm mb-1">{post.title}</span>
                    <p className="text-slate-300 text-xs mb-3">{post.body || 'No description'}</p>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleModerate(post.id, 'approve')}
                        className="btn-glass-cyan px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Approve
                      </button>

                      <button
                        onClick={() => handleModerate(post.id, 'remove')}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1 hover:bg-rose-500/30 cursor-pointer"
                      >
                        <XCircle className="w-3 h-3" />
                        Tombstone Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center glass-card rounded-2xl">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-70" />
                <span className="text-xs text-slate-300 font-semibold block">Moderation Queue Clear</span>
                <span className="text-[11px] text-slate-500">All live opinions have passed automated Gate 0 screening.</span>
              </div>
            )}
          </div>
        </div>

        {/* Append-Only Audit Trail */}
        <div className="mt-8">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-cyan-400" />
            <span>Append-Only Market Audit Trail</span>
          </h3>

          <div className="glass-panel p-5 rounded-3xl border border-white/10 space-y-2 max-h-72 overflow-y-auto font-mono text-xs">
            {auditLogs.map((log) => (
              <div key={log.id} className="p-2.5 rounded-xl glass-card flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-amber-300 font-bold uppercase">
                    {log.action}
                  </span>
                  <span className="text-slate-300">
                    {log.entity_type} {log.entity_id ? `(${log.entity_id.substring(0, 12)}...)` : ''}
                  </span>
                </div>
                <span className="text-slate-500">{timeAgo(log.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

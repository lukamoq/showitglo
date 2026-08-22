'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Category, AuditLog, Report, Post } from '@/lib/types';
import { formatUSD, formatCents, timeAgo } from '@/lib/utils';
import {
  ShieldAlert,
  Sliders,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCcw,
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
    <div className="min-h-screen flex flex-col relative overflow-x-hidden">
      <Navbar />

      <div className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        {/* Header */}
        <div className="pb-6 border-b border-line flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="kicker flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5" aria-hidden />
              <span>ShowItGlo Market Operations &amp; Trust Center</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-ink mt-2">
              Admin &amp; Market Control
            </h1>
          </div>

          <button
            onClick={handleRebase}
            className="btn btn-ghost btn-sm self-start sm:self-auto shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Trigger Epoch Rebase</span>
          </button>
        </div>

        {statusMessage && (
          <div className="mt-4 rounded-card border border-up/30 bg-up/10 p-3 text-dense text-up animate-rise">
            {statusMessage}
          </div>
        )}

        {/* Deferred vs Recognized Revenue Bar (Blueprint §5 & §13) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          <div className="card rounded-card p-4">
            <div className="micro-label text-ink-3">Recognized Spend Revenue</div>
            <div className="metric text-2xl text-gold-text tnum mt-1.5 leading-none">
              {formatUSD(stats.recognized_spend_dollars || 0)}
            </div>
            <div className="text-meta text-ink-3 mt-1.5">Interaction spend</div>
          </div>

          <div className="card rounded-card p-4">
            <div className="micro-label text-ink-3">Unspent Wallet Float</div>
            <div className="metric text-2xl text-ink tnum mt-1.5 leading-none">
              {formatUSD(stats.unspent_float_dollars || 0)}
            </div>
            <div className="text-meta text-ink-3 mt-1.5">Deferred revenue liability</div>
          </div>

          <div className="card rounded-card p-4">
            <div className="micro-label text-ink-3">Stripe Top-Up Fees</div>
            <div className="metric text-2xl text-ink tnum mt-1.5 leading-none">
              {formatUSD(stats.stripe_fees_dollars || 0)}
            </div>
            <div className="text-meta text-ink-3 mt-1.5">~4–6% on prepaid volume</div>
          </div>

          <div className="card rounded-card p-4">
            <div className="micro-label text-ink-3">Penny Army Backers</div>
            <div className="metric text-2xl text-ink tnum mt-1.5 leading-none">
              {(stats.distinct_backers || 0).toLocaleString()}
            </div>
            <div className="text-meta text-ink-3 mt-1.5 tnum">
              {(stats.total_likes_units || 0).toLocaleString()} penny likes
            </div>
          </div>
        </div>

        {/* 2-Column Section: Market Mechanics & Moderation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-12">
          {/* Column 1: Market Mechanics */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Sliders className="w-4 h-4 text-ink-3" aria-hidden />
              <h2 className="text-xl font-bold tracking-tight text-ink">
                Increment Strategy &amp; Decay Engine
              </h2>
            </div>

            <div className="panel rounded-card p-5 flex-1">
              <div className="space-y-6">
                <div>
                  <span className="kicker block mb-2">Leaderboard displacement rule</span>

                  <div className="sunken rounded-control overflow-hidden divide-y divide-line">
                    {[
                      { id: 'percent', label: 'Percentage (+10%, min $0.50)', desc: 'Recommended default. Scales with stakes.' },
                      { id: 'fixed', label: 'Fixed Increment (+ $0.10)', desc: 'High-frequency micro-fights.' },
                      { id: 'expo', label: 'Exponential (× 2.0)', desc: 'Doubling Day spectacle events only.' },
                    ].map((st) => {
                      const isActive = selectedStrategy === st.id;
                      return (
                        <label
                          key={st.id}
                          className={`relative flex items-start gap-3 px-3.5 py-3 cursor-pointer transition-colors duration-200 ${
                            isActive ? 'bg-gold/[0.10]' : 'hover:bg-white/[0.04]'
                          }`}
                        >
                          {isActive && (
                            <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-gold" />
                          )}
                          <input
                            type="radio"
                            name="strategy"
                            checked={isActive}
                            onChange={() => setSelectedStrategy(st.id)}
                            className="mt-1 accent-gold"
                          />
                          <span className="min-w-0">
                            <span className={`block text-dense font-semibold ${isActive ? 'text-gold-text' : 'text-ink'}`}>
                              {st.label}
                            </span>
                            <span className="block text-meta text-ink-3">{st.desc}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className="kicker block mb-2">Half-life decay window</span>

                  <div className="seg w-full">
                    {[
                      { hours: 24, label: '24 Hours (Fast)' },
                      { hours: 168, label: '7 Days (Standard)' },
                      { hours: 720, label: '30 Days (Slow)' },
                    ].map((h) => (
                      <button
                        key={h.hours}
                        onClick={() => setHalfLifeHours(h.hours)}
                        className={`seg-item flex-1 justify-center text-center !whitespace-normal tnum ${
                          halfLifeHours === h.hours ? 'seg-item-active' : ''
                        }`}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={handleUpdateStrategy} className="btn btn-gold w-full">
                  Save Market Parameters
                </button>
              </div>
            </div>
          </div>

          {/* Column 2: Moderation Queue */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-ink-3" aria-hidden />
              <h2 className="text-xl font-bold tracking-tight text-ink">
                Gate 1 Visibility-Tiered Moderation
              </h2>
              <span className="chip text-steel tnum">{pendingPosts.length}</span>
            </div>

            {pendingPosts.length > 0 ? (
              <div className="panel rounded-card overflow-hidden divide-y divide-line flex-1">
                {pendingPosts.map((post) => (
                  <div
                    key={post.id}
                    className="relative px-4 sm:px-5 py-4 transition-colors duration-200 hover:bg-white/[0.04]"
                  >
                    <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-down" />

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[15px] text-ink">{post.title}</span>
                      <span className="chip text-steel">Pending</span>
                    </div>

                    <p className="text-dense text-ink-3 mt-1 mb-3">{post.body || 'No description'}</p>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleModerate(post.id, 'approve')}
                        className="btn btn-ghost btn-xs !text-up hover:border-up/40"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Approve
                      </button>

                      <button
                        onClick={() => handleModerate(post.id, 'remove')}
                        className="btn btn-ghost btn-xs !text-down hover:border-down/40"
                      >
                        <XCircle className="w-3 h-3" />
                        Tombstone Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="panel rounded-card p-8 text-center flex-1 flex flex-col items-center justify-center">
                <CheckCircle className="w-7 h-7 text-up mb-3" aria-hidden />
                <span className="text-sm font-semibold text-ink block">Moderation Queue Clear</span>
                <span className="text-meta text-ink-3 mt-1 block max-w-[42ch]">
                  All live opinions have passed automated Gate 0 screening.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Append-Only Audit Trail */}
        <div className="mt-12">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-ink-3" aria-hidden />
            <h2 className="text-xl font-bold tracking-tight text-ink">
              Append-Only Market Audit Trail
            </h2>
            <span className="chip text-steel tnum">{auditLogs.length}</span>
          </div>

          <div className="panel rounded-card overflow-hidden">
            <div className="grid grid-cols-[7rem_1fr_4.5rem] sm:grid-cols-[9.5rem_1fr_6rem] gap-3 sm:gap-4 items-center px-4 sm:px-5 py-2 border-b border-line bg-black/20">
              <div className="micro-label text-ink-3">Action</div>
              <div className="micro-label text-ink-3">Entity</div>
              <div className="micro-label text-ink-3 text-right">When</div>
            </div>

            <div className="divide-y divide-line max-h-72 overflow-y-auto">
              {auditLogs.length > 0 ? (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="grid grid-cols-[7rem_1fr_4.5rem] sm:grid-cols-[9.5rem_1fr_6rem] gap-3 sm:gap-4 items-center px-4 sm:px-5 py-2.5 text-dense transition-colors duration-200 hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0 overflow-hidden">
                      <span className="chip text-gold-text">{log.action}</span>
                    </span>
                    <span className="text-ink-2 truncate">
                      {log.entity_type} {log.entity_id ? `(${log.entity_id.substring(0, 12)}...)` : ''}
                    </span>
                    <span className="text-meta text-ink-3 text-right">{timeAgo(log.created_at)}</span>
                  </div>
                ))
              ) : (
                <p className="text-dense text-ink-3 py-10 text-center">No audit entries yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

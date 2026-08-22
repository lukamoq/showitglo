'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Category, AuditLog, Report, Post } from '@/lib/types';
import { formatUSD, timeAgo } from '@/lib/utils';
import {
  ShieldAlert,
  Sliders,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RotateCcw,
  KeyRound,
  LogOut,
} from 'lucide-react';
import { apiGet, apiPost, errorText } from '@/components/system/api';

interface AdminStatsView {
  recognized_spend_dollars?: number;
  unspent_float_dollars?: number;
  stripe_fees_dollars?: number;
  distinct_backers?: number;
  total_likes_units?: number;
}

const ADMIN_KEY_STORAGE = 'sig_admin_key';

function readStoredAdminKey(): string {
  try {
    return window.sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

function writeStoredAdminKey(key: string): void {
  try {
    if (key) window.sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    else window.sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    /* the key simply won't survive a reload */
  }
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStatsView>({});
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [pendingPosts, setPendingPosts] = useState<Post[]>([]);

  const [selectedStrategy, setSelectedStrategy] = useState<string>('percent');
  const [halfLifeHours, setHalfLifeHours] = useState<number>(168);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Admin key: never rendered back, kept only for this browser tab.
  const [adminKey, setAdminKey] = useState<string>('');
  const [keyDraft, setKeyDraft] = useState<string>('');
  const [authState, setAuthState] = useState<'needs_key' | 'ok' | 'unauthorized' | 'not_configured'>('needs_key');

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [moderationTarget, setModerationTarget] = useState<{ postId: string; action: 'approve' | 'remove' } | null>(
    null
  );
  const [moderationReason, setModerationReason] = useState('');
  const inFlightRef = useRef(false);

  useEffect(() => {
    const stored = readStoredAdminKey();
    if (stored) setAdminKey(stored);
  }, []);

  const fetchAdminData = useCallback(async () => {
    // No key, no request: an unauthenticated admin fetch tells us nothing and
    // only produces noise in the logs.
    if (!adminKey) {
      setAuthState('needs_key');
      return;
    }

    const [resOverview, resMod] = await Promise.all([
      apiGet<{ stats: AdminStatsView; categories: Category[]; recent_audit_logs: AuditLog[] }>(
        '/api/v1/admin/overview',
        { adminKey }
      ),
      apiGet<{ reports: Report[]; pending_posts: Post[] }>('/api/v1/admin/moderation', { adminKey }),
    ]);

    if (resOverview.status === 503 || resMod.status === 503) {
      setAuthState('not_configured');
      return;
    }
    if (resOverview.status === 401 || resMod.status === 401) {
      setAuthState('unauthorized');
      return;
    }
    if (!resOverview.ok) {
      setErrorMessage(errorText(resOverview, 'Admin overview could not be loaded.'));
      return;
    }

    setAuthState('ok');
    setErrorMessage(null);

    if (resOverview.data?.stats) setStats(resOverview.data.stats);
    const globalCat = resOverview.data?.categories?.find((c) => c.id === 'global');
    if (globalCat) {
      setSelectedStrategy(globalCat.increment_strategy);
      setHalfLifeHours(globalCat.half_life_hours);
    }
    if (resOverview.data?.recent_audit_logs) setAuditLogs(resOverview.data.recent_audit_logs);
    if (resMod.ok && resMod.data?.pending_posts) setPendingPosts(resMod.data.pending_posts);
  }, [adminKey]);

  useEffect(() => {
    void fetchAdminData();
  }, [fetchAdminData]);

  const runAdminPost = async (label: string, path: string, body: Record<string, unknown>) => {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    setBusyAction(label);
    setErrorMessage(null);
    setStatusMessage(null);

    const res = await apiPost(path, body, { adminKey });

    inFlightRef.current = false;
    setBusyAction(null);

    if (res.status === 503) {
      setAuthState('not_configured');
      return false;
    }
    if (res.status === 401) {
      setAuthState('unauthorized');
      return false;
    }
    if (!res.ok) {
      setErrorMessage(errorText(res, 'That admin action failed.'));
      return false;
    }
    return true;
  };

  const handleUpdateStrategy = async () => {
    const ok = await runAdminPost('strategy', '/api/v1/admin/strategy', {
      category_id: 'global',
      strategy: selectedStrategy,
      half_life_hours: Number(halfLifeHours),
    });
    if (ok) {
      setStatusMessage('Strategy and half-life updated.');
      void fetchAdminData();
    }
  };

  const handleRebase = async () => {
    const ok = await runAdminPost('rebase', '/api/v1/admin/rebase', { category_id: 'global' });
    if (ok) {
      setStatusMessage('Epoch rebase executed. Invariant base scores updated.');
      void fetchAdminData();
    }
  };

  const handleModerate = async () => {
    if (!moderationTarget) return;
    if (!moderationReason.trim()) {
      setErrorMessage('A reason is required for every moderation action.');
      return;
    }

    const ok = await runAdminPost('moderate', '/api/v1/admin/moderation', {
      post_id: moderationTarget.postId,
      action: moderationTarget.action,
      reason: moderationReason.trim(),
    });

    if (ok) {
      setStatusMessage(`Moderation action "${moderationTarget.action}" applied.`);
      setModerationTarget(null);
      setModerationReason('');
      void fetchAdminData();
    }
  };

  const applyKey = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyDraft.trim();
    if (!trimmed) return;
    writeStoredAdminKey(trimmed);
    setAdminKey(trimmed);
    setKeyDraft('');
    setErrorMessage(null);
  };

  const clearKey = () => {
    writeStoredAdminKey('');
    setAdminKey('');
    setAuthState('needs_key');
    setStats({});
    setAuditLogs([]);
    setPendingPosts([]);
  };

  if (authState !== 'ok') {
    return (
      <div className="min-h-screen flex flex-col relative overflow-x-hidden">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="panel rounded-card p-8 w-full max-w-md animate-rise">
            <div className="kicker flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5" aria-hidden />
              <span>Restricted — market operations</span>
            </div>

            {authState === 'not_configured' ? (
              <>
                <h1 className="text-xl font-bold tracking-tight text-ink mt-2">Admin access is not configured</h1>
                <p className="text-dense text-ink-2 leading-relaxed mt-2">
                  This deployment has no admin key set, so the admin API refuses every request. Nothing
                  here can be unlocked from the browser.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold tracking-tight text-ink mt-2">Enter your admin key</h1>
                <p className="text-dense text-ink-2 leading-relaxed mt-2">
                  The key is sent as an <code className="text-ink-3">x-admin-key</code> header and kept
                  only for this browser tab.
                </p>

                <form onSubmit={applyKey} className="mt-5 space-y-3">
                  <div>
                    <label htmlFor="admin-key" className="kicker block mb-1.5">
                      Admin key
                    </label>
                    <input
                      id="admin-key"
                      type="password"
                      autoComplete="off"
                      value={keyDraft}
                      onChange={(e) => setKeyDraft(e.target.value)}
                      aria-describedby={authState === 'unauthorized' ? 'admin-key-error' : undefined}
                      className="field"
                    />
                  </div>

                  {authState === 'unauthorized' && (
                    <p id="admin-key-error" role="alert" className="text-dense text-down">
                      That key was rejected.
                    </p>
                  )}
                  {errorMessage && (
                    <p role="alert" className="text-dense text-down">
                      {errorMessage}
                    </p>
                  )}

                  <button type="submit" disabled={!keyDraft.trim()} className="btn btn-gold w-full">
                    <KeyRound className="w-4 h-4" />
                    <span>Unlock admin</span>
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

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

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => void handleRebase()}
              disabled={busyAction !== null}
              className="btn btn-ghost btn-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{busyAction === 'rebase' ? 'Rebasing…' : 'Trigger Epoch Rebase'}</span>
            </button>

            <button type="button" onClick={clearKey} className="btn btn-ghost btn-sm" title="Forget the admin key">
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lock</span>
            </button>
          </div>
        </div>

        {statusMessage && (
          <div role="status" className="mt-4 rounded-card border border-up/30 bg-up/10 p-3 text-dense text-up animate-rise">
            {statusMessage}
          </div>
        )}

        {errorMessage && (
          <div role="alert" className="mt-4 rounded-card border border-down/30 bg-down/10 p-3 text-dense text-down animate-rise">
            {errorMessage}
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
            <div className="text-meta text-ink-3 mt-1.5">Estimate: 2.9% + 30¢ per charge</div>
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
                        type="button"
                        aria-pressed={halfLifeHours === h.hours}
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

                <button
                  type="button"
                  onClick={() => void handleUpdateStrategy()}
                  disabled={busyAction !== null}
                  className="btn btn-gold w-full"
                >
                  {busyAction === 'strategy' ? 'Saving…' : 'Save Market Parameters'}
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
                        type="button"
                        onClick={() => {
                          setModerationTarget({ postId: post.id, action: 'approve' });
                          setModerationReason('');
                          setErrorMessage(null);
                        }}
                        className="btn btn-ghost btn-xs !text-up hover:border-up/40"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Approve
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setModerationTarget({ postId: post.id, action: 'remove' });
                          setModerationReason('');
                          setErrorMessage(null);
                        }}
                        className="btn btn-ghost btn-xs !text-down hover:border-down/40"
                      >
                        <XCircle className="w-3 h-3" />
                        Tombstone Remove
                      </button>
                    </div>

                    {/* Every action is audit-logged, so the reason is typed here
                        rather than guessed from a default. */}
                    {moderationTarget?.postId === post.id && (
                      <div className="mt-3 sunken rounded-control p-3 space-y-2 animate-rise">
                        <label htmlFor={`mod-reason-${post.id}`} className="kicker block">
                          Reason for {moderationTarget.action} (recorded in the audit log)
                        </label>
                        <input
                          id={`mod-reason-${post.id}`}
                          type="text"
                          maxLength={500}
                          value={moderationReason}
                          onChange={(e) => setModerationReason(e.target.value)}
                          placeholder="e.g. Violates Terms §4 — unverified promotional claim"
                          className="field text-dense"
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleModerate()}
                            disabled={busyAction !== null || !moderationReason.trim()}
                            className="btn btn-ghost btn-xs"
                          >
                            {busyAction === 'moderate' ? 'Applying…' : `Confirm ${moderationTarget.action}`}
                          </button>
                          <button
                            type="button"
                            onClick={() => setModerationTarget(null)}
                            className="btn btn-ghost btn-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
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

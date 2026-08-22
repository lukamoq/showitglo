'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { InsightDemandAggregate, ApiKey } from '@/lib/types';
import { formatUSD, formatCents, timeAgo } from '@/lib/utils';
import {
  BarChart3,
  Key,
  Lock,
  Building2,
  CheckCircle2,
  TrendingUp,
  ShieldCheck,
  Zap,
  Copy,
  Plus,
  Flame,
  Swords,
  ShieldAlert,
} from 'lucide-react';

export default function InsightsPage() {
  const [demands, setDemands] = useState<InsightDemandAggregate[]>([]);
  const [debatesData, setDebatesData] = useState<any[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [selectedTier, setSelectedTier] = useState<'starter' | 'growth' | 'enterprise'>('growth');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchInsights = async () => {
    try {
      const [resDemands, resDebates, resKeys] = await Promise.all([
        fetch('/api/v1/insights/demands'),
        fetch('/api/v1/insights/debates'),
        fetch('/api/v1/insights/keys?user_id=usr_marc'),
      ]);
      const dataDemands = await resDemands.json();
      const dataDebates = await resDebates.json();
      const dataKeys = await resKeys.json();

      if (dataDemands.data) setDemands(dataDemands.data);
      if (dataDebates.data) setDebatesData(dataDebates.data);
      if (dataKeys.keys) setApiKeys(dataKeys.keys);
    } catch (err) {
      console.error('Error loading insights:', err);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  const handleCreateKey = async () => {
    setIsGeneratingKey(true);
    try {
      const res = await fetch('/api/v1/insights/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 'usr_marc', tier: selectedTier }),
      });
      if (res.ok) fetchInsights();
    } catch (err) {
      console.error('Error generating key:', err);
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleCopy = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedKey(token);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#060709] text-white flex flex-col relative overflow-x-hidden">
      <div className="orb-glow-gold top-10 left-1/4 opacity-30" />
      <div className="orb-glow-cyan top-40 right-1/4 opacity-40" />

      <Navbar />

      <div className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-3">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span>ShowItGlo Market Intelligence API</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            The World&apos;s Live Focus Group
          </h1>
          <p className="mt-3 text-sm text-slate-300">
            Surveys are free; money is truthful. The Insights API delivers real-time, money-weighted aggregate vote sentiment and brand demands.
          </p>
        </div>

        {/* Absolute Zero User Data Policy Guarantee Box */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-emerald-500/40 bg-emerald-950/20 shadow-2xl mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <ShieldCheck className="w-5 h-5" />
              <span>ZERO USER DATA SOLD GUARANTEE</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
              We <strong>only sell aggregate vote totals, faction market shares, and consumer demand statistics</strong> via this API. <strong>Zero personal data, zero emails, zero IP addresses, zero aliases, and zero individual payment records are ever sold, exported, or accessible.</strong>
            </p>
          </div>

          <div className="px-3.5 py-2 rounded-xl glass-segmented font-mono text-[11px] text-emerald-300 shrink-0 border border-emerald-500/30">
            k ≥ 100 Anonymity Protected
          </div>
        </div>

        {/* 3-Pillar Value Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="glass-card p-5 rounded-2xl border border-white/10">
            <ShieldCheck className="w-5 h-5 text-emerald-400 mb-2" />
            <h3 className="font-bold text-sm text-white">Aggregated Votes Only</h3>
            <p className="text-xs text-slate-400 mt-1">
              Data points reflect macro vote distributions and dollars raised. No individual identity is ever tracked or sold.
            </p>
          </div>

          <div className="glass-card p-5 rounded-2xl border border-white/10">
            <TrendingUp className="w-5 h-5 text-cyan-400 mb-2" />
            <h3 className="font-bold text-sm text-white">Money-Weighted Truth</h3>
            <p className="text-xs text-slate-400 mt-1">
              Derived from real conviction votes and prepaid wallet commitments, completely free of bot farms.
            </p>
          </div>

          <div className="glass-card p-5 rounded-2xl border border-white/10">
            <Lock className="w-5 h-5 text-purple-400 mb-2" />
            <h3 className="font-bold text-sm text-white">Anti-Scraping Defenses</h3>
            <p className="text-xs text-slate-400 mt-1">
              Protected endpoints, HMAC request validation, and strict k-anonymity floors keep the data secure.
            </p>
          </div>
        </div>

        {/* Live Multi-Faction War Votes Section */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/20 shadow-2xl mb-10">
          <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Swords className="w-5 h-5 text-rose-400" />
                <span>Aggregated Multi-Faction War & Debate Votes</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Aggregated market share, total free votes, and money-weighted conviction per candidate.
              </p>
            </div>

            <code className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-white/10 text-cyan-300">
              GET /api/v1/insights/debates
            </code>
          </div>

          <div className="space-y-4">
            {debatesData.map((war, idx) => (
              <div key={idx} className="p-4 rounded-2xl glass-card border border-white/10 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-bold text-sm text-white">{war.question}</h3>
                  <span className="text-xs font-mono text-slate-400">
                    Total: <strong className="text-white">{formatCents(war.total_money_raised_cents)}</strong> ({war.total_distinct_backers} backers)
                  </span>
                </div>

                {/* Breakdown chips */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {war.faction_breakdown.map((f: any, fIdx: number) => (
                    <div key={fIdx} className="p-2.5 rounded-xl glass-segmented text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white line-clamp-1">{f.faction.split(' ')[0]}</span>
                        <span className="font-mono text-amber-400 font-bold">{f.percentage}%</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {formatCents(f.total_cents)} • {f.backers_count} backers
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Demands by Brand Table */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/20 shadow-2xl mb-10">
          <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-400" />
                <span>Aggregated Consumer Demands by Target Brand</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Aggregated paid demand volume backed by distinct verified consumer wallets.
              </p>
            </div>

            <code className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-white/10 text-emerald-300">
              GET /api/v1/insights/demands
            </code>
          </div>

          <div className="space-y-3">
            {demands.map((item, idx) => (
              <div
                key={idx}
                className="p-4 rounded-2xl glass-card border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-white">{item.target_brand}</span>
                    {item.status === 'responded' ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        Brand Responded
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                        <Flame className="w-3 h-3 text-amber-400" />
                        Unanswered Demand
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 italic line-clamp-1">
                    &ldquo;{item.top_demand_title}&rdquo;
                  </p>
                </div>

                <div className="flex items-center gap-4 text-right font-mono shrink-0">
                  <div>
                    <div className="text-sm font-bold text-cyan-400">
                      {item.total_backers.toLocaleString()} Backers
                    </div>
                    <div className="text-[10px] text-slate-400">k-Anonymity Verified</div>
                  </div>

                  <div className="pl-4 border-l border-white/10">
                    <div className="text-base font-black text-amber-400">
                      {formatCents(item.total_money_cents)}
                    </div>
                    <div className="text-[10px] text-slate-400">Paid Conviction Total</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* API Key Management Section */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/20 shadow-2xl">
          <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-cyan-400" />
                <span>Your Insights API Access Tokens</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Generate programmatic bearer keys for ingestion into Bloomberg, Snowflake, or custom data lakes.
              </p>
            </div>

            <button
              onClick={handleCreateKey}
              disabled={isGeneratingKey}
              className="btn-glass-cyan px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isGeneratingKey ? 'Issuing Key...' : 'Generate New API Key'}</span>
            </button>
          </div>

          {/* Active Keys List */}
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="p-4 rounded-2xl glass-card border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs"
              >
                <div className="flex items-center gap-3">
                  <div className="px-2.5 py-1 rounded-lg glass-segmented font-bold text-amber-400 uppercase text-[10px]">
                    {key.tier}
                  </div>
                  <div className="text-slate-300">
                    {key.key_token.substring(0, 16)}••••••••••••••••
                  </div>
                  <span className="text-slate-500 text-[10px]">({key.rate_limit_per_min} req/min)</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopy(key.key_token)}
                    className="px-3 py-1.5 rounded-lg btn-glass-dark text-xs flex items-center gap-1 cursor-pointer text-slate-300 hover:text-white"
                  >
                    <Copy className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{copiedKey === key.key_token ? 'Copied!' : 'Copy Full Token'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

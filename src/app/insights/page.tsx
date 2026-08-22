'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { InsightDemandAggregate, ApiKey } from '@/lib/types';
import { formatCents } from '@/lib/utils';
import {
  BarChart3,
  Key,
  Lock,
  Building2,
  CheckCircle2,
  TrendingUp,
  ShieldCheck,
  Copy,
  Plus,
  Flame,
  Swords,
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
    <div className="min-h-screen flex flex-col relative overflow-x-hidden">
      <Navbar />

      <div className="flex-1 w-full">
        {/* Header */}
        <div className="relative pt-10 pb-8 sm:pt-14 sm:pb-10">
          <div className="orb orb-gold -top-64 -left-40 opacity-70" aria-hidden />

          <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="kicker kicker-gold flex items-center gap-2">
              <BarChart3 className="w-4 h-4" aria-hidden />
              <span>ShowItGlo market intelligence API</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-ink mt-3">
              The World&apos;s Live Focus Group
            </h1>

            <p className="text-[15px] text-ink-2 leading-relaxed max-w-[62ch] mt-3">
              Surveys are free; money is truthful. The Insights API delivers real-time,
              money-weighted aggregate vote sentiment and brand demands.
            </p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 space-y-6">
          {/* Zero user data guarantee */}
          <div className="panel rounded-card p-6 sm:p-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div>
              <span className="chip text-up">
                <ShieldCheck className="w-3 h-3" />
                Zero user data sold
              </span>
              <p className="text-dense text-ink-2 leading-relaxed max-w-[70ch] mt-2.5">
                We <strong className="text-ink font-semibold">only sell aggregate vote totals,
                faction market shares, and consumer demand statistics</strong> via this API.{' '}
                <strong className="text-ink font-semibold">Zero personal data, zero emails, zero
                IP addresses, zero aliases, and zero individual payment records</strong> are ever
                sold, exported, or accessible.
              </p>
            </div>

            <div className="sunken rounded-control px-4 py-3 text-dense tnum text-ink-2 shrink-0">
              k ≥ 100 anonymity protected
            </div>
          </div>

          {/* Three pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card rounded-card p-5">
              <ShieldCheck className="w-4 h-4 text-ink-3" aria-hidden />
              <h3 className="text-sm font-semibold text-ink mt-2.5">Aggregated votes only</h3>
              <p className="text-dense text-ink-3 leading-relaxed mt-1.5">
                Data points reflect macro vote distributions and dollars raised. No individual
                identity is ever tracked or sold.
              </p>
            </div>

            <div className="card rounded-card p-5">
              <TrendingUp className="w-4 h-4 text-ink-3" aria-hidden />
              <h3 className="text-sm font-semibold text-ink mt-2.5">Money-weighted truth</h3>
              <p className="text-dense text-ink-3 leading-relaxed mt-1.5">
                Derived from real conviction votes and prepaid wallet commitments, completely free
                of bot farms.
              </p>
            </div>

            <div className="card rounded-card p-5">
              <Lock className="w-4 h-4 text-ink-3" aria-hidden />
              <h3 className="text-sm font-semibold text-ink mt-2.5">Anti-scraping defenses</h3>
              <p className="text-dense text-ink-3 leading-relaxed mt-1.5">
                Protected endpoints, HMAC request validation, and strict k-anonymity floors keep the
                data secure.
              </p>
            </div>
          </div>

          {/* Aggregated faction votes */}
          <div className="panel rounded-card overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-line flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-ink flex items-center gap-2">
                  <Swords className="w-4 h-4 text-ink-3" aria-hidden />
                  <span>Aggregated war &amp; debate votes</span>
                </h2>
                <p className="text-dense text-ink-3 mt-1">
                  Market share, total free votes, and money-weighted conviction per candidate.
                </p>
              </div>

              <code className="sunken rounded-control px-3 py-1.5 text-micro tnum text-ink-3 shrink-0">
                GET /api/v1/insights/debates
              </code>
            </div>

            <div className="divide-y divide-line">
              {debatesData.length > 0 ? (
                debatesData.map((war, idx) => (
                  <div
                    key={idx}
                    className="px-4 sm:px-6 py-5 transition-colors duration-200 hover:bg-white/[0.03]"
                  >
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <h3 className="font-semibold text-[15px] text-ink">{war.question}</h3>
                      <span className="text-meta text-ink-3 tnum">
                        Total{' '}
                        <strong className="text-ink-2 font-semibold">
                          {formatCents(war.total_money_raised_cents)}
                        </strong>{' '}
                        · {war.total_distinct_backers} backers
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                      {war.faction_breakdown.map((f: any, fIdx: number) => (
                        <div key={fIdx} className="card rounded-card p-4">
                          <div className="micro-label text-ink-3 line-clamp-1">
                            {f.faction.split(' ')[0]}
                          </div>
                          <div className="metric text-2xl text-ink tnum mt-1 leading-none">
                            {f.percentage}%
                          </div>
                          <div className="text-meta text-ink-3 tnum mt-1.5">
                            {formatCents(f.total_cents)} · {f.backers_count} backers
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 sm:px-6 py-10 text-center text-dense text-ink-3">
                  No aggregated war votes available yet.
                </div>
              )}
            </div>
          </div>

          {/* Aggregated demands by brand */}
          <div className="panel rounded-card overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-line flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-ink flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-ink-3" aria-hidden />
                  <span>Consumer demands by target brand</span>
                </h2>
                <p className="text-dense text-ink-3 mt-1">
                  Aggregated paid demand volume backed by distinct verified consumer wallets.
                </p>
              </div>

              <code className="sunken rounded-control px-3 py-1.5 text-micro tnum text-ink-3 shrink-0">
                GET /api/v1/insights/demands
              </code>
            </div>

            <div className="divide-y divide-line">
              {demands.length > 0 ? (
                demands.map((item, idx) => (
                  <div
                    key={idx}
                    className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors duration-200 hover:bg-white/[0.03]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[15px] sm:text-base text-ink">
                          {item.target_brand}
                        </span>
                        {item.status === 'responded' ? (
                          <span className="chip text-up">
                            <CheckCircle2 className="w-3 h-3" />
                            Brand responded
                          </span>
                        ) : (
                          <span className="chip text-gold-text">
                            <Flame className="w-3 h-3" />
                            Unanswered demand
                          </span>
                        )}
                      </div>
                      <p className="text-dense text-ink-3 italic line-clamp-1 mt-1">
                        &ldquo;{item.top_demand_title}&rdquo;
                      </p>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-line">
                      <div>
                        <div className="micro-label text-ink-3">Backers</div>
                        <div className="metric text-lg text-ink tnum leading-tight">
                          {item.total_backers.toLocaleString()}
                        </div>
                        <div className="text-meta text-ink-3">k-anonymity verified</div>
                      </div>

                      <div className="pl-4 border-l border-line">
                        <div className="micro-label text-ink-3">Paid conviction</div>
                        <div className="metric text-xl text-gold-text tnum leading-tight">
                          {formatCents(item.total_money_cents)}
                        </div>
                        <div className="text-meta text-ink-3">Total committed</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 sm:px-6 py-10 text-center text-dense text-ink-3">
                  No aggregated brand demands available yet.
                </div>
              )}
            </div>
          </div>

          {/* API access tokens */}
          <div className="panel rounded-card overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-line flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-ink flex items-center gap-2">
                  <Key className="w-4 h-4 text-ink-3" aria-hidden />
                  <span>Your Insights API access tokens</span>
                </h2>
                <p className="text-dense text-ink-3 mt-1">
                  Generate programmatic bearer keys for ingestion into Bloomberg, Snowflake, or
                  custom data lakes.
                </p>
              </div>

              <button
                onClick={handleCreateKey}
                disabled={isGeneratingKey}
                className="btn btn-gold btn-sm shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isGeneratingKey ? 'Issuing key…' : 'Generate new API key'}</span>
              </button>
            </div>

            <div className="divide-y divide-line">
              {apiKeys.length > 0 ? (
                apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors duration-200 hover:bg-white/[0.03]"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-wrap">
                      <span className="chip text-gold-text">{key.tier}</span>

                      <code className="sunken rounded-control px-3 py-2 text-dense tnum text-ink-2 truncate">
                        {key.key_token.substring(0, 16)}••••••••••••••••
                      </code>

                      <span className="text-meta text-ink-3 tnum">
                        {key.rate_limit_per_min} req/min
                      </span>
                    </div>

                    <button
                      onClick={() => handleCopy(key.key_token)}
                      className="btn btn-ghost btn-xs shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedKey === key.key_token ? 'Copied' : 'Copy full token'}</span>
                    </button>
                  </div>
                ))
              ) : (
                <div className="px-4 sm:px-6 py-10 text-center text-dense text-ink-3">
                  No API keys issued yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

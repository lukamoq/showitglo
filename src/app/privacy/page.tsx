import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Lock, Eye, Database, Scale, UserCheck } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | ShowItGlo',
  description: 'Privacy Policy and Data Protection declaration for ShowItGlo and MomentumQ GmbH.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#060709] text-white flex flex-col relative overflow-x-hidden">
      <div className="orb-glow-gold top-20 left-1/4 opacity-30" />
      <div className="orb-glow-cyan top-40 right-1/4 opacity-30" />

      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        {/* Back navigation */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-medium mb-8 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Arena Board</span>
        </Link>

        {/* Hero Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold uppercase tracking-wider mb-3">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>GDPR & Swiss FADP Compliant</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Last Updated: August 2026 • Operated by MomentumQ GmbH, Zurich, Switzerland.
          </p>
        </div>

        {/* Core Principle Banner: "We Sell Statistics, Never You" */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-emerald-500/30 bg-emerald-950/20 shadow-2xl mb-8 space-y-3">
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-400" />
            <span>The Core Guarantee: &ldquo;We Sell Statistics, Never You&rdquo;</span>
          </h2>
          <p className="text-xs text-slate-200 leading-relaxed">
            ShowItGlo monetizes attention through open-market paid interactions and B2B aggregate market research (Insights API). We enforce a strict <strong>k-anonymity guarantee ($\ge 100$ distinct backers)</strong> on all aggregate analytics. <strong>We never sell, rent, or export individual-level personal data at any price.</strong>
          </p>
        </div>

        {/* Policy Sections */}
        <div className="space-y-6 text-xs text-slate-300 leading-relaxed">
          {/* Section 1: Controller */}
          <div className="glass-card p-6 rounded-2xl border border-white/10 space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-cyan-400" />
              <span>1. Data Controller</span>
            </h3>
            <p>
              The data controller responsible for the processing of your personal data on ShowItGlo in accordance with the Swiss Federal Act on Data Protection (FADP) and the EU General Data Protection Regulation (GDPR) is:
            </p>
            <div className="p-3 rounded-xl glass-segmented font-mono text-slate-300 space-y-0.5 mt-2">
              <div className="font-bold text-white">MomentumQ GmbH</div>
              <div>Leutschenbachstrasse 95, 8050 Zürich, Switzerland</div>
              <div>UID: CHE-222.957.350</div>
              <div>Email: <a href="mailto:info@momentumq.com" className="text-amber-400 underline">info@momentumq.com</a></div>
            </div>
          </div>

          {/* Section 2: Data We Process */}
          <div className="glass-card p-6 rounded-2xl border border-white/10 space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-400" />
              <span>2. Data We Process & Purpose</span>
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
              <li>
                <strong>Account & Profile Information:</strong> Email address, pseudonym/alias, notification preferences, and voluntary profile display data.
              </li>
              <li>
                <strong>Prepaid Wallet & Ledger Records:</strong> Balances, top-up receipts, and immutable interaction logs (penny likes, boosts, and power boosts).
              </li>
              <li>
                <strong>Payment Processing (Stripe, Apple Pay & Link):</strong> Credit card and banking credentials are submitted directly to Stripe (PCI-DSS Level 1 compliant). MomentumQ GmbH never sees or stores full credit card numbers.
              </li>
              <li>
                <strong>Public Arena Interactions:</strong> Statements, demands, and public boosts you choose to publish on the permanent board. Users may choose <strong>Anonymous Backing</strong> to conceal their identity from public rosters.
              </li>
            </ul>
          </div>

          {/* Section 3: Insights API & k-Anonymity */}
          <div className="glass-card p-6 rounded-2xl border border-white/10 space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-purple-400" />
              <span>3. B2B Insights API & Anti-Scraping Defenses</span>
            </h3>
            <p>
              Aggregated consumer demand metrics and debate sentiment indices sold through the Insights API are strictly materialized statistical views. Any aggregate slice with fewer than 100 distinct contributors is suppressed by our k-anonymity engine. Anti-scraping safeguards protect this proprietary aggregate from unauthorized third-party scraping.
            </p>
          </div>

          {/* Section 4: Your Rights (GDPR / FADP) */}
          <div className="glass-card p-6 rounded-2xl border border-white/10 space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>4. Your Rights (Access, Rectification, Erasure)</span>
            </h3>
            <p>
              Under GDPR and Swiss FADP, you have the right to request access to your personal data, correction of inaccurate records, data portability, and erasure of your account.
            </p>
            <p>
              Upon exercising your <strong>Right to Erasure (GDPR Tombstone)</strong> via account settings or API (<code className="text-amber-300 font-mono">/api/v1/me/erase</code>), your email, credentials, and personal identifiers are permanently scrubbed from our systems. Historical financial accounting entries are anonymized as legally required for tax compliance.
            </p>
          </div>

          {/* Section 5: Cookies & Analytics */}
          <div className="glass-card p-6 rounded-2xl border border-white/10 space-y-2">
            <h3 className="text-sm font-bold text-white">5. Cookies & Local Storage</h3>
            <p>
              ShowItGlo uses strictly necessary functional storage (session tokens, wallet client state, theme preferences). We do not use third-party behavioral advertising trackers.
            </p>
          </div>

          {/* Section 6: Contact */}
          <div className="glass-card p-6 rounded-2xl border border-white/10 space-y-2">
            <h3 className="text-sm font-bold text-white">6. Contacting the Data Protection Desk</h3>
            <p>
              To exercise any of your privacy rights or file an inquiry, please contact our Data Protection desk at{' '}
              <a href="mailto:info@momentumq.com" className="text-cyan-400 hover:underline">
                info@momentumq.com
              </a>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

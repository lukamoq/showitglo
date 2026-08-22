import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Lock } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | ShowItGlo',
  description: 'Privacy Policy and Data Protection declaration for ShowItGlo and MomentumQ GmbH.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden">
      <Navbar />

      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        {/* Back navigation */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-meta text-ink-3 hover:text-ink font-medium mb-10 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          <span>Back to Arena Board</span>
        </Link>

        {/* Hero Header */}
        <div className="mb-10">
          <div className="kicker flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
            <span>GDPR &amp; Swiss FADP Compliant</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-ink mt-2">
            Privacy Policy
          </h1>
          <p className="mt-2 text-meta text-ink-3">
            Last updated: August 2026 · Operated by MomentumQ GmbH, Zurich, Switzerland.
          </p>
        </div>

        {/* Core Principle Banner: "We Sell Statistics, Never You" */}
        <div className="panel rounded-card p-6 sm:p-7">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Lock className="w-4 h-4 text-gold-text" aria-hidden />
            <span>The Core Guarantee: &ldquo;We Sell Statistics, Never You&rdquo;</span>
          </h2>
          <p className="text-[15px] text-ink-2 leading-relaxed mt-3 [&_strong]:text-ink [&_strong]:font-semibold">
            ShowItGlo monetizes attention through open-market paid interactions and B2B aggregate
            market research (Insights API). We enforce a strict{' '}
            <strong>k-anonymity guarantee (≥ 100 distinct backers)</strong> on all aggregate
            analytics. <strong>We never sell, rent, or export individual-level personal data at any price.</strong>
          </p>
        </div>

        {/* Policy Sections */}
        <div className="text-[15px] text-ink-2 leading-relaxed [&_strong]:text-ink [&_strong]:font-semibold">
          {/* Section 1: Controller */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            1. Data Controller
          </h2>
          <p>
            The data controller responsible for the processing of your personal data on ShowItGlo in accordance with the Swiss Federal Act on Data Protection (FADP) and the EU General Data Protection Regulation (GDPR) is:
          </p>
          <div className="sunken rounded-control p-4 mt-4 text-dense text-ink-2 space-y-0.5">
            <div className="font-semibold text-ink">MomentumQ GmbH</div>
            <div>Leutschenbachstrasse 95, 8050 Zürich, Switzerland</div>
            <div className="tnum">UID: CHE-222.957.350</div>
            <div>
              Email:{' '}
              <a
                href="mailto:info@momentumq.com"
                className="text-gold-text underline underline-offset-4 hover:text-gold-bright transition-colors"
              >
                info@momentumq.com
              </a>
            </div>
          </div>

          {/* Section 2: Data We Process */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            2. Data We Process &amp; Purpose
          </h2>
          <ul className="list-disc pl-5 space-y-2 marker:text-ink-3">
            <li>
              <strong>Account &amp; Profile Information:</strong> Email address, pseudonym/alias, notification preferences, and voluntary profile display data.
            </li>
            <li>
              <strong>Prepaid Wallet &amp; Ledger Records:</strong> Balances, top-up receipts, and immutable interaction logs (penny likes, boosts, and power boosts).
            </li>
            <li>
              <strong>Payment Processing (Stripe, Apple Pay &amp; Link):</strong> Credit card and banking credentials are submitted directly to Stripe (PCI-DSS Level 1 compliant). MomentumQ GmbH never sees or stores full credit card numbers.
            </li>
            <li>
              <strong>Public Arena Interactions:</strong> Statements, demands, and public boosts you choose to publish on the permanent board. Users may choose <strong>Anonymous Backing</strong> to conceal their identity from public rosters.
            </li>
          </ul>

          {/* Section 3: Insights API & k-Anonymity */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            3. B2B Insights API &amp; Anti-Scraping Defenses
          </h2>
          <p>
            Aggregated consumer demand metrics and debate sentiment indices sold through the Insights API are strictly materialized statistical views. Any aggregate slice with fewer than 100 distinct contributors is suppressed by our k-anonymity engine. Anti-scraping safeguards protect this proprietary aggregate from unauthorized third-party scraping.
          </p>

          {/* Section 4: Your Rights (GDPR / FADP) */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            4. Your Rights (Access, Rectification, Erasure)
          </h2>
          <p>
            Under GDPR and Swiss FADP, you have the right to request access to your personal data, correction of inaccurate records, data portability, and erasure of your account.
          </p>
          <p className="mt-3">
            Upon exercising your <strong>Right to Erasure (GDPR Tombstone)</strong> via account settings or API (<code className="text-dense text-gold-text">/api/v1/me/erase</code>), your email, credentials, and personal identifiers are permanently scrubbed from our systems. Historical financial accounting entries are anonymized as legally required for tax compliance.
          </p>

          {/* Section 5: Cookies & Analytics */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            5. Cookies &amp; Local Storage
          </h2>
          <p>
            ShowItGlo uses strictly necessary functional storage (session tokens, wallet client state, theme preferences). We do not use third-party behavioral advertising trackers.
          </p>

          {/* Section 6: Contact */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            6. Contacting the Data Protection Desk
          </h2>
          <p>
            To exercise any of your privacy rights or file an inquiry, please contact our Data Protection desk at{' '}
            <a
              href="mailto:info@momentumq.com"
              className="text-gold-text underline underline-offset-4 hover:text-gold-bright transition-colors"
            >
              info@momentumq.com
            </a>.
          </p>
        </div>
      </main>
    </div>
  );
}

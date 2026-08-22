import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import Link from 'next/link';
import { ArrowLeft, Building2, Scale } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Impressum | ShowItGlo',
  description: 'Legal disclosure and Impressum for ShowItGlo, operated by MomentumQ GmbH, Zurich, Switzerland.',
};

const PARTICULARS: { label: string; value: string; foot: string; accent?: boolean }[] = [
  {
    label: 'Operating Entity',
    value: 'MomentumQ GmbH',
    foot: 'Operator of ShowItGlo',
  },
  {
    label: 'Legal Form',
    value: 'Gesellschaft mit beschränkter Haftung (GmbH)',
    foot: 'Incorporated under Swiss Law',
  },
  {
    label: 'Registered Office & Address',
    value: 'Leutschenbachstrasse 95',
    foot: '8050 Zürich, Switzerland',
  },
  {
    label: 'Company Registration / UID',
    value: 'CHE-222.957.350',
    foot: 'Commercial Register of the Canton of Zurich',
    accent: true,
  },
  {
    label: 'Managing Director',
    value: 'Luka Petrovic',
    foot: 'Sole Signatory Authority',
  },
];

export default function ImpressumPage() {
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
            <Scale className="w-3.5 h-3.5" aria-hidden />
            <span>Legal Disclosure · Swiss Law</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-ink mt-2">
            Impressum
          </h1>
          <p className="mt-2 text-[15px] text-ink-2 leading-relaxed">
            Legal disclosure and operator information in accordance with Swiss corporate legislation.
          </p>
        </div>

        {/* Registered Particulars */}
        <div className="panel rounded-card overflow-hidden">
          <div className="px-4 sm:px-5 py-2.5 border-b border-line bg-black/20 flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-ink-3" aria-hidden />
            <span className="micro-label text-ink-3">Company Particulars</span>
          </div>

          <dl className="divide-y divide-line">
            {PARTICULARS.map((row) => (
              <div
                key={row.label}
                className="px-4 sm:px-5 py-3.5 sm:grid sm:grid-cols-[13rem_1fr] sm:gap-4 sm:items-baseline"
              >
                <dt className="micro-label text-ink-3">{row.label}</dt>
                <dd className="mt-1 sm:mt-0">
                  <span
                    className={`block text-dense font-semibold ${
                      row.accent ? 'text-gold-text tnum' : 'text-ink'
                    }`}
                  >
                    {row.value}
                  </span>
                  <span className="block text-meta text-ink-3">{row.foot}</span>
                </dd>
              </div>
            ))}

            <div className="px-4 sm:px-5 py-3.5 sm:grid sm:grid-cols-[13rem_1fr] sm:gap-4 sm:items-baseline">
              <dt className="micro-label text-ink-3">Contact &amp; Support</dt>
              <dd className="mt-1 sm:mt-0">
                <span className="block text-dense font-semibold">
                  <a
                    href="mailto:contact@showitglo.com"
                    className="text-gold-text underline underline-offset-4 hover:text-gold-bright transition-colors"
                  >
                    contact@showitglo.com
                  </a>
                </span>
                <span className="block text-meta text-ink-3">
                  Web:{' '}
                  <a
                    href="https://www.momentumq.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ink-2 underline underline-offset-4 hover:text-ink transition-colors"
                  >
                    www.momentumq.com
                  </a>
                </span>
              </dd>
            </div>
          </dl>
        </div>

        {/* Legal Disclaimers & Copyright */}
        <div className="text-[15px] text-ink-2 leading-relaxed">
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">Platform Purpose</h2>
          <p>
            ShowItGlo is a digital marketplace for public speech, community opinion ranking, and consumer demand expression. The ranking of content is determined by transparent, mathematical algorithms based on user prepaid interactions, half-life temporal decay, and open market bidding.
          </p>

          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">Disclaimer of Liability</h2>
          <p>
            Opinions, statements, and demands published on ShowItGlo represent the views of their respective authors and contributors, not of MomentumQ GmbH. MomentumQ GmbH assumes no liability for user-generated content, external links, or third-party websites. Despite continuous automated and human moderation (Gate 0 filter), no guarantee is given for the completeness or accuracy of user posts.
          </p>

          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            Copyright &amp; Intellectual Property
          </h2>
          <p>
            The design, software architecture, mathematical decay engine, and brand assets of ShowItGlo are the intellectual property of MomentumQ GmbH and are protected by Swiss and international copyright laws. Any unauthorized reproduction, automated bulk extraction, or reverse engineering is strictly prohibited.
          </p>

          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">Legal Enquiries</h2>
          <p>
            For legal inquiries, notice of rights violations, or law enforcement requests, please contact our legal desk at{' '}
            <a
              href="mailto:contact@showitglo.com"
              className="text-gold-text underline underline-offset-4 hover:text-gold-bright transition-colors"
            >
              contact@showitglo.com
            </a>.
          </p>
        </div>
      </main>
    </div>
  );
}

import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import Link from 'next/link';
import { ArrowLeft, Building2, ShieldCheck, Mail, Globe, Scale } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Impressum | ShowItGlo',
  description: 'Legal disclosure and Impressum for ShowItGlo, operated by MomentumQ GmbH, Zurich, Switzerland.',
};

export default function ImpressumPage() {
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
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold uppercase tracking-wider mb-3">
            <Scale className="w-3.5 h-3.5" />
            <span>Legal Disclosure • Swiss Law</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Impressum
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Legal disclosure and operator information in accordance with Swiss corporate legislation.
          </p>
        </div>

        {/* Registered Particulars Table */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/20 shadow-2xl space-y-6 mb-8">
          <h2 className="text-lg font-bold text-white flex items-center gap-2 border-b border-white/10 pb-3">
            <Building2 className="w-5 h-5 text-amber-400" />
            <span>Company Particulars</span>
          </h2>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs">
            <div>
              <dt className="text-slate-400 font-mono uppercase text-[10px]">Operating Entity</dt>
              <dd className="text-white font-bold text-sm mt-0.5">MomentumQ GmbH</dd>
              <dd className="text-slate-400 text-xs">Operator of ShowItGlo</dd>
            </div>

            <div>
              <dt className="text-slate-400 font-mono uppercase text-[10px]">Legal Form</dt>
              <dd className="text-white font-bold text-sm mt-0.5">Gesellschaft mit beschränkter Haftung (GmbH)</dd>
              <dd className="text-slate-400 text-xs">Incorporated under Swiss Law</dd>
            </div>

            <div>
              <dt className="text-slate-400 font-mono uppercase text-[10px]">Registered Office & Address</dt>
              <dd className="text-white font-bold text-sm mt-0.5">Leutschenbachstrasse 95</dd>
              <dd className="text-slate-300 text-xs">8050 Zürich, Switzerland</dd>
            </div>

            <div>
              <dt className="text-slate-400 font-mono uppercase text-[10px]">Company Registration / UID</dt>
              <dd className="text-amber-400 font-mono font-bold text-sm mt-0.5">CHE-222.957.350</dd>
              <dd className="text-slate-400 text-xs">Commercial Register of the Canton of Zurich</dd>
            </div>

            <div>
              <dt className="text-slate-400 font-mono uppercase text-[10px]">Managing Director</dt>
              <dd className="text-white font-bold text-sm mt-0.5">Luka Petrovic</dd>
              <dd className="text-slate-400 text-xs">Sole Signatory Authority</dd>
            </div>

            <div>
              <dt className="text-slate-400 font-mono uppercase text-[10px]">Contact & Support</dt>
              <dd className="text-cyan-400 font-bold text-sm mt-0.5">
                <a href="mailto:info@momentumq.com" className="hover:underline">info@momentumq.com</a>
              </dd>
              <dd className="text-slate-400 text-xs">
                Web: <a href="https://www.momentumq.com" target="_blank" rel="noopener noreferrer" className="hover:underline text-slate-300">www.momentumq.com</a>
              </dd>
            </div>
          </dl>
        </div>

        {/* Legal Disclaimers & Copyright */}
        <div className="space-y-6 text-xs text-slate-300 leading-relaxed">
          <div className="glass-card p-6 rounded-2xl border border-white/10">
            <h3 className="text-sm font-bold text-white mb-2">Platform Purpose</h3>
            <p>
              ShowItGlo is a digital marketplace for public speech, community opinion ranking, and consumer demand expression. The ranking of content is determined by transparent, mathematical algorithms based on user prepaid interactions, half-life temporal decay, and open market bidding.
            </p>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-white/10">
            <h3 className="text-sm font-bold text-white mb-2">Disclaimer of Liability</h3>
            <p>
              Opinions, statements, and demands published on ShowItGlo represent the views of their respective authors and contributors, not of MomentumQ GmbH. MomentumQ GmbH assumes no liability for user-generated content, external links, or third-party websites. Despite continuous automated and human moderation (Gate 0 filter), no guarantee is given for the completeness or accuracy of user posts.
            </p>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-white/10">
            <h3 className="text-sm font-bold text-white mb-2">Copyright & Intellectual Property</h3>
            <p>
              The design, software architecture, mathematical decay engine, and brand assets of ShowItGlo are the intellectual property of MomentumQ GmbH and are protected by Swiss and international copyright laws. Any unauthorized reproduction, automated bulk extraction, or reverse engineering is strictly prohibited.
            </p>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-white/10">
            <h3 className="text-sm font-bold text-white mb-2">Legal Enquiries</h3>
            <p>
              For legal inquiries, notice of rights violations, or law enforcement requests, please contact our legal desk at{' '}
              <a href="mailto:info@momentumq.com" className="text-amber-400 hover:underline">
                info@momentumq.com
              </a>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

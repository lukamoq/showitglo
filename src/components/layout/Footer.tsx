import React from 'react';
import Link from 'next/link';
import { Shield, Sparkles, Scale, Terminal, Lock } from 'lucide-react';
import { ShowItGloLogo } from '../brand/ShowItGloLogo';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-white/10 mt-20 py-12 px-4 sm:px-6 lg:px-8 bg-black/60 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShowItGloLogo size={28} withText={true} />
          </div>
          <p className="text-xs text-slate-300 font-medium italic">
            &ldquo;Let the world decide what opinion is real.&rdquo;
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Always wanted to share your opinion but you didn&apos;t get the stage or got censored? We don&apos;t! The permanent public arena where open community votes and money rank the world&apos;s stances.
          </p>
          <div className="text-[11px] text-slate-500 font-mono">
            Operated by MomentumQ GmbH, Zurich, Switzerland
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Market Engine
          </h4>
          <ul className="text-xs text-slate-400 space-y-1.5 font-medium">
            <li><Link href="/" className="hover:text-amber-400">Global Leaderboard</Link></li>
            <li><Link href="/debates" className="hover:text-cyan-400">Standing Debates & Rosters</Link></li>
            <li><Link href="/wars" className="hover:text-rose-400">Live Counter Fights</Link></li>
            <li><Link href="/insights" className="hover:text-emerald-400">B2B Insights API</Link></li>
          </ul>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-cyan-400" />
            Trust & Legal
          </h4>
          <ul className="text-xs text-slate-400 space-y-1.5 font-medium">
            <li><Link href="/privacy" className="text-slate-300 hover:text-emerald-400 font-bold">Privacy Policy (GDPR / FADP)</Link></li>
            <li><Link href="/impressum" className="text-slate-300 hover:text-amber-400 font-bold">Impressum (Legal Disclosure)</Link></li>
            <li><span className="text-slate-500">Gate 0 Moderation & Tombstones</span></li>
            <li><span className="text-slate-500">k-Anonymity Data Protection</span></li>
          </ul>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            Operations
          </h4>
          <ul className="text-xs text-slate-400 space-y-1.5 font-medium">
            <li><Link href="/admin" className="hover:text-emerald-400">Strategy Switcher (Fixed/Percent/Expo)</Link></li>
            <li><Link href="/admin" className="hover:text-emerald-400">Moderation Queue & Public Tombstones</Link></li>
            <li><Link href="/admin" className="hover:text-emerald-400">Daily Revenue & Float Reconciliation</Link></li>
            <li><span className="text-slate-500">Append-Only Audit Ledger</span></li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-10 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
        <div className="flex items-center gap-3">
          <span>© 2026 MomentumQ GmbH. All rights reserved.</span>
          <span>•</span>
          <Link href="/privacy" className="hover:text-slate-300 underline">Privacy Policy</Link>
          <span>•</span>
          <Link href="/impressum" className="hover:text-slate-300 underline">Impressum</Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Terminal className="w-3 h-3 text-amber-400" />
            Next.js Fluid Compute
          </span>
          <span className="w-1 h-1 rounded-full bg-slate-700" />
          <span>Stripe Prepaid Protocol</span>
        </div>
      </div>
    </footer>
  );
};

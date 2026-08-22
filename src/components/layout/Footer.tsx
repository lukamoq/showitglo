import React from 'react';
import Link from 'next/link';
import { ShowItGloLogo } from '../brand/ShowItGloLogo';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-line mt-20 py-12 px-4 sm:px-6 lg:px-8 bg-black/30">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShowItGloLogo size={28} withText={true} />
          </div>
          <p className="text-dense text-ink-2 italic">
            &ldquo;Let the world decide what opinion is real.&rdquo;
          </p>
          <p className="text-meta text-ink-3 leading-relaxed max-w-[42ch]">
            Always wanted to share your opinion but you didn&apos;t get the stage or got censored? We don&apos;t! The permanent public arena where open community votes and money rank the world&apos;s stances.
          </p>
          <div className="micro-label text-ink-3">
            Operated by MomentumQ GmbH, Zurich, Switzerland
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="kicker">Market Engine</h4>
          <ul className="space-y-1.5">
            <li><Link href="/" className="text-dense text-ink-3 hover:text-ink transition-colors">Global Leaderboard</Link></li>
            <li><Link href="/debates" className="text-dense text-ink-3 hover:text-ink transition-colors">Standing Debates &amp; Rosters</Link></li>
            <li><Link href="/wars" className="text-dense text-ink-3 hover:text-ink transition-colors">Live Counter Fights</Link></li>
            <li><Link href="/insights" className="text-dense text-ink-3 hover:text-ink transition-colors">B2B Insights API</Link></li>
          </ul>
        </div>

        <div className="space-y-2">
          <h4 className="kicker">Trust &amp; Legal</h4>
          <ul className="space-y-1.5">
            <li><Link href="/privacy" className="text-dense text-ink-3 hover:text-ink transition-colors">Privacy Policy (GDPR / FADP)</Link></li>
            <li><Link href="/impressum" className="text-dense text-ink-3 hover:text-ink transition-colors">Impressum (Legal Disclosure)</Link></li>
            <li><span className="text-dense text-ink-3/70">Gate 0 Moderation &amp; Tombstones</span></li>
            <li><span className="text-dense text-ink-3/70">k-Anonymity Data Protection</span></li>
          </ul>
        </div>

        <div className="space-y-2">
          <h4 className="kicker">Operations</h4>
          <ul className="space-y-1.5">
            <li><Link href="/admin" className="text-dense text-ink-3 hover:text-ink transition-colors">Strategy Switcher (Fixed/Percent/Expo)</Link></li>
            <li><Link href="/admin" className="text-dense text-ink-3 hover:text-ink transition-colors">Moderation Queue &amp; Public Tombstones</Link></li>
            <li><Link href="/admin" className="text-dense text-ink-3 hover:text-ink transition-colors">Daily Revenue &amp; Float Reconciliation</Link></li>
            <li><span className="text-dense text-ink-3/70">Append-Only Audit Ledger</span></li>
          </ul>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-4 text-meta text-ink-3">
        <div className="flex items-center gap-2">
          <span>© 2026 MomentumQ GmbH. All rights reserved.</span>
          <span aria-hidden className="text-ink-3/50">·</span>
          <Link href="/privacy" className="hover:text-ink transition-colors">Privacy Policy</Link>
          <span aria-hidden className="text-ink-3/50">·</span>
          <Link href="/impressum" className="hover:text-ink transition-colors">Impressum</Link>
        </div>
        <div className="micro-label text-ink-3 flex items-center gap-2">
          <span>Next.js Fluid Compute</span>
          <span aria-hidden className="text-ink-3/50">·</span>
          <span>Stripe Prepaid Protocol</span>
        </div>
      </div>
    </footer>
  );
};

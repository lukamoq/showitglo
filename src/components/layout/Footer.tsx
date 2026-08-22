import React from 'react';
import Link from 'next/link';
import { ShowItGloLogo } from '../brand/ShowItGloLogo';
import { RecoverWalletLink } from '../wallet/RecoverWalletLink';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-line mt-20 py-12 px-4 sm:px-6 lg:px-8 bg-black/30">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShowItGloLogo size={28} withText={true} />
          </div>
          <p className="text-meta text-ink-3 leading-relaxed max-w-[42ch]">
            A public board of opinions and demands, ordered by what readers pay to back them
            rather than by an editor or a recommendation algorithm.
          </p>
          <div className="micro-label text-ink-3">
            Operated by MomentumQ GmbH, Zurich, Switzerland
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="kicker">The board</h4>
          <ul className="space-y-1.5">
            <li><Link href="/" className="text-dense text-ink-3 hover:text-ink transition-colors">Global Leaderboard</Link></li>
            <li><Link href="/debates" className="text-dense text-ink-3 hover:text-ink transition-colors">Standing Debates &amp; Rosters</Link></li>
            <li><Link href="/wars" className="text-dense text-ink-3 hover:text-ink transition-colors">Live Counter Fights</Link></li>
            <li><Link href="/insights" className="text-dense text-ink-3 hover:text-ink transition-colors">B2B Insights API</Link></li>
            {/* Reachable without a session on purpose — someone who lost their
                cookie has no dashboard to find this on. */}
            <li><RecoverWalletLink /></li>
          </ul>
        </div>

        <div className="space-y-2">
          <h4 className="kicker">Trust &amp; Legal</h4>
          <ul className="space-y-1.5">
            <li><Link href="/terms" className="text-dense text-ink-3 hover:text-ink transition-colors">Terms of Service</Link></li>
            <li><Link href="/privacy" className="text-dense text-ink-3 hover:text-ink transition-colors">Privacy Policy (GDPR / FADP)</Link></li>
            <li><Link href="/impressum" className="text-dense text-ink-3 hover:text-ink transition-colors">Impressum (Legal Disclosure)</Link></li>
          </ul>
        </div>

      </div>

      <div className="max-w-6xl mx-auto mt-10 pt-6 border-t border-line flex flex-col sm:flex-row items-center justify-between gap-4 text-meta text-ink-3">
        <div className="flex items-center gap-2">
          <span>© 2026 MomentumQ GmbH. All rights reserved.</span>
          <span aria-hidden className="text-ink-3/50">·</span>
          <Link href="/terms" className="hover:text-ink transition-colors">Terms</Link>
          <span aria-hidden className="text-ink-3/50">·</span>
          <Link href="/privacy" className="hover:text-ink transition-colors">Privacy Policy</Link>
          <span aria-hidden className="text-ink-3/50">·</span>
          <Link href="/impressum" className="hover:text-ink transition-colors">Impressum</Link>
        </div>
        <div className="micro-label text-ink-3">
          <span>Card payments processed by Stripe</span>
        </div>
      </div>
    </footer>
  );
};

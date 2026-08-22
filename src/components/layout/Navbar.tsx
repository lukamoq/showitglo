'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Flame, ShieldAlert, PlusCircle, LayoutDashboard, Radio, Swords, BarChart3 } from 'lucide-react';
import { WalletChip } from '../wallet/WalletChip';
import { ShowItGloLogo } from '../brand/ShowItGloLogo';
import { LiveVisitorsBadge } from '../live/LiveVisitorsBadge';

interface NavbarProps {
  onOpenCreate?: () => void;
  onBalanceUpdated?: (cents: number) => void;
}

const NAV_LINK_BASE =
  'px-3 py-1.5 rounded-control text-dense font-medium transition-colors flex items-center gap-1.5';
const NAV_LINK_INACTIVE = 'text-ink-3 hover:text-ink hover:bg-white/5';
const NAV_LINK_ACTIVE =
  'bg-gold/[0.14] text-gold-text shadow-[inset_0_0_0_1px_rgb(240_168_36/0.30)]';

const navLink = (isActive: boolean) =>
  `${NAV_LINK_BASE} ${isActive ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE}`;

export const Navbar: React.FC<NavbarProps> = ({ onOpenCreate, onBalanceUpdated }) => {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-line panel">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <ShowItGloLogo size={36} withText={true} />
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 ml-4">
            <Link href="/" className={navLink(pathname === '/')}>
              <Radio className="w-4 h-4" />
              Arena Board
            </Link>

            <Link
              href="/debates"
              className={navLink(
                Boolean(pathname?.startsWith('/debates') || pathname?.startsWith('/d/'))
              )}
            >
              <Swords className="w-4 h-4" />
              Debates
            </Link>

            <Link href="/wars" className={navLink(pathname === '/wars')}>
              <Flame className="w-4 h-4" />
              Live Fights
            </Link>

            <Link href="/insights" className={navLink(pathname === '/insights')}>
              <BarChart3 className="w-4 h-4" />
              Insights API
            </Link>

            <Link href="/dashboard" className={navLink(pathname === '/dashboard')}>
              <LayoutDashboard className="w-4 h-4" />
              My Stances
            </Link>

            <Link href="/admin" className={navLink(pathname === '/admin')}>
              <ShieldAlert className="w-4 h-4" />
              Admin
            </Link>
          </nav>
        </div>

        {/* Right CTA + Live Presence Badge + Wallet Chip */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:block">
            <LiveVisitorsBadge variant="compact" />
          </div>

          <WalletChip onBalanceUpdated={onBalanceUpdated} />

          <button onClick={onOpenCreate} className="btn btn-gold btn-sm">
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Post Stance / Demand</span>
            <span className="sm:hidden">Post</span>
          </button>
        </div>
      </div>
    </header>
  );
};

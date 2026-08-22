'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Flame, ShieldAlert, History, PlusCircle, LayoutDashboard, Radio, Swords, BarChart3 } from 'lucide-react';
import { WalletChip } from '../wallet/WalletChip';
import { ShowItGloLogo } from '../brand/ShowItGloLogo';
import { LiveVisitorsBadge } from '../live/LiveVisitorsBadge';

interface NavbarProps {
  onOpenCreate?: () => void;
  onBalanceUpdated?: (cents: number) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenCreate, onBalanceUpdated }) => {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 glass-panel">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand with 2D Modern Logo */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <ShowItGloLogo size={36} withText={true} />
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 ml-4 text-sm font-medium">
            <Link
              href="/"
              className={`px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                pathname === '/'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Radio className="w-4 h-4 text-amber-400" />
              Arena Board
            </Link>

            <Link
              href="/debates"
              className={`px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                pathname?.startsWith('/debates') || pathname?.startsWith('/d/')
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Swords className="w-4 h-4 text-cyan-400" />
              Debates
            </Link>

            <Link
              href="/wars"
              className={`px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                pathname === '/wars'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Flame className="w-4 h-4 text-rose-400" />
              Live Fights
            </Link>

            <Link
              href="/insights"
              className={`px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                pathname === '/insights'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              Insights API
            </Link>

            <Link
              href="/dashboard"
              className={`px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                pathname === '/dashboard'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-purple-400" />
              My Stances
            </Link>

            <Link
              href="/admin"
              className={`px-3 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                pathname === '/admin'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-slate-400" />
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

          <button
            onClick={onOpenCreate}
            className="btn-glass-gold px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-lg cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Post Stance / Demand</span>
            <span className="sm:hidden">Post</span>
          </button>
        </div>
      </div>
    </header>
  );
};

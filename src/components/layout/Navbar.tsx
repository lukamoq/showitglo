'use client';

/**
 * Navbar — the arena's header rail.
 *
 * Design contract (DESIGN.md): the app is a market instrument, so the header is
 * a ruled rail, not a floating glass pebble. One gold element per view (the
 * primary CTA); the active route is marked by a 2px gold rule that lands
 * exactly on the header's bottom hairline, so the ledger's ruling continues up
 * into the navigation. Fixed 64px height — the drawer overlays, never pushes.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Flame,
  LayoutDashboard,
  Menu,
  PlusCircle,
  Radio,
  ShieldAlert,
  Swords,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { WalletChip } from '../wallet/WalletChip';
import { ShowItGloLogo } from '../brand/ShowItGloLogo';
import { LiveVisitorsBadge } from '../live/LiveVisitorsBadge';

interface NavbarProps {
  onOpenCreate?: () => void;
  onBalanceUpdated?: (cents: number) => void;
}

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Route-match rule — unchanged from the previous implementation. */
  match: (pathname: string | null) => boolean;
  /** Renders the crimson live LED next to the label. */
  live?: boolean;
  /** Desktop-only: show the icon instead of the label (utility rank). */
  compact?: boolean;
};

const PRIMARY_NAV: NavItem[] = [
  { href: '/', label: 'Arena Board', icon: Radio, match: (p) => p === '/' },
  {
    href: '/debates',
    label: 'Debates',
    icon: Swords,
    match: (p) => Boolean(p?.startsWith('/debates') || p?.startsWith('/d/')),
  },
  { href: '/wars', label: 'Live Fights', icon: Flame, match: (p) => p === '/wars', live: true },
  { href: '/insights', label: 'Insights API', icon: BarChart3, match: (p) => p === '/insights' },
  { href: '/dashboard', label: 'My Stances', icon: LayoutDashboard, match: (p) => p === '/dashboard' },
];

/** Operator surface — reachable everywhere, but never competing with the board. */
const UTILITY_NAV: NavItem[] = [
  { href: '/admin', label: 'Admin', icon: ShieldAlert, match: (p) => p === '/admin', compact: true },
];

const ALL_NAV = [...PRIMARY_NAV, ...UTILITY_NAV];

export const Navbar: React.FC<NavbarProps> = ({ onOpenCreate, onBalanceUpdated }) => {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  /* Elevation on scroll — passive listener, boolean state, so React bails out
     of re-rendering on every frame and only commits when the threshold flips. */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* Close the drawer whenever the route changes. */
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const closeMenu = useCallback((returnFocus: boolean) => {
    setMenuOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  }, []);

  /* Escape closes and hands focus back to the toggle. */
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen, closeMenu]);

  const handleCreate = () => {
    setMenuOpen(false);
    onOpenCreate?.();
  };

  /* One gold element per view. On pages that do not own a compose modal the
     CTA is a link home rather than a dead button. */
  const ctaClass = 'btn btn-gold shrink-0';
  const cta = onOpenCreate ? (
    <button type="button" onClick={handleCreate} className={ctaClass}>
      <PlusCircle className="h-4 w-4" aria-hidden />
      <span className="sr-only min-[420px]:not-sr-only">Post Stance</span>
    </button>
  ) : (
    <Link href="/" className={ctaClass}>
      <PlusCircle className="h-4 w-4" aria-hidden />
      <span className="sr-only min-[420px]:not-sr-only">Post Stance</span>
    </Link>
  );

  return (
    <header className="sticky top-0 z-50">
      {/* Scrim — sits under the rail (z-20) but over the page. */}
      {menuOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => closeMenu(false)}
          className="fixed inset-x-0 bottom-0 top-16 z-0 cursor-default bg-[rgba(4,6,12,0.65)] lg:hidden"
        />
      )}

      {/* The rail. Fixed 64px so nothing below it ever shifts. */}
      <div
        className={clsx(
          'relative z-20 h-16 border-b bg-bg/95 supports-[backdrop-filter]:bg-bg/75',
          'backdrop-blur-xl backdrop-saturate-150',
          'transition-[background-color,border-color,box-shadow] duration-200',
          scrolled
            ? 'border-line-strong shadow-[0_18px_40px_-28px_rgba(2,4,10,0.95)]'
            : 'border-line'
        )}
      >
        <div className="mx-auto flex h-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          {/* Brand */}
          <div className="flex h-full min-w-0 items-center gap-1 lg:gap-4">
            <Link
              href="/"
              aria-label="ShowItGlo — home"
              className="group flex min-w-0 items-center gap-2.5 rounded-control py-1"
            >
              <ShowItGloLogo size={30} withText={false} />
              <span className="hidden truncate text-[17px] font-extrabold leading-none tracking-[-0.02em] text-ink sm:inline">
                ShowIt
                <span className="text-gold-text transition-colors duration-150 group-hover:text-gold-bright">
                  Glo
                </span>
              </span>
            </Link>

            <span aria-hidden className="hidden h-6 w-px bg-line-strong lg:block" />

            {/* Desktop rail */}
            <nav aria-label="Primary" className="hidden h-full items-center lg:flex">
              {PRIMARY_NAV.map((item) => (
                <RailTab key={item.href} item={item} active={item.match(pathname)} />
              ))}
              <span aria-hidden className="mx-2 h-5 w-px bg-line-strong" />
              {UTILITY_NAV.map((item) => (
                <RailTab key={item.href} item={item} active={item.match(pathname)} />
              ))}
            </nav>
          </div>

          {/* Utilities + the single primary action */}
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            {/* `empty:hidden` — when presence is unavailable the badge renders
                nothing, and the wrapper collapses instead of leaving a gap. */}
            <div className="hidden empty:hidden xl:flex">
              <LiveVisitorsBadge variant="compact" />
            </div>

            {/* Mounted at every breakpoint: GET /api/v1/wallet is also the
                session bootstrap that mints the signed cookie. */}
            <WalletChip onBalanceUpdated={onBalanceUpdated} />

            {cta}

            <button
              ref={toggleRef}
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="primary-mobile-nav"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line bg-white/[0.04] text-ink-2 transition-colors duration-150 hover:bg-white/[0.08] hover:text-ink lg:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Drawer — absolutely positioned under the rail, so the page never reflows. */}
      {menuOpen && (
        <nav
          id="primary-mobile-nav"
          aria-label="Primary"
          className="animate-rise absolute inset-x-0 top-16 z-10 border-b border-line bg-bg/95 shadow-[0_28px_60px_-32px_rgba(2,4,10,0.95)] backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-bg/90 lg:hidden"
        >
          <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
            <p className="kicker px-0.5 pb-2">Navigate</p>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-black/25">
              {ALL_NAV.map((item) => {
                const active = item.match(pathname);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setMenuOpen(false)}
                      className={clsx(
                        'relative flex min-h-[48px] items-center gap-3 px-4 py-3 text-dense transition-colors duration-150',
                        active ? 'bg-white/[0.05] text-ink' : 'text-ink-2 hover:bg-white/[0.03] hover:text-ink'
                      )}
                    >
                      {active && (
                        <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-gold" />
                      )}
                      <Icon className={clsx('h-4 w-4 shrink-0', active ? 'text-gold-text' : 'text-ink-3')} />
                      <span className="min-w-0 truncate">{item.label}</span>
                      {item.live && (
                        <>
                          <span className="led led-down ml-auto" aria-hidden />
                          <span className="sr-only">Live now</span>
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>
      )}
    </header>
  );
};

/** A full-height rail tab. The marker lands on the header's bottom hairline. */
const RailTab: React.FC<{ item: NavItem; active: boolean }> = ({ item, active }) => {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      aria-label={item.compact ? item.label : undefined}
      title={item.compact ? item.label : undefined}
      className={clsx(
        'group relative flex h-full items-center gap-2 rounded-md px-2 text-dense font-medium transition-colors duration-150 xl:px-3',
        active ? 'text-ink' : 'text-ink-3 hover:text-ink'
      )}
    >
      {item.compact ? <Icon className="h-4 w-4" /> : <span>{item.label}</span>}
      {item.live && (
        <>
          <span className="led led-down" aria-hidden />
          <span className="sr-only">Live now</span>
        </>
      )}
      <span
        aria-hidden
        className={clsx(
          'pointer-events-none absolute inset-x-0 bottom-0 h-[2px] rounded-t-full transition-opacity duration-200',
          active ? 'bg-gold opacity-100' : 'bg-line-strong opacity-0 group-hover:opacity-100'
        )}
      />
    </Link>
  );
};

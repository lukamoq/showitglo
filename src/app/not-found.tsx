import React from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/layout/Navbar';
import { ArrowLeft, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen text-ink flex flex-col relative overflow-x-hidden">
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-4 py-16 relative">
        <div className="orb orb-gold top-1/4 -left-20 opacity-40" aria-hidden />

        <div className="relative z-10 max-w-md w-full panel rounded-card p-8 text-center space-y-6 animate-rise">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full sunken mx-auto text-gold-text">
            <Search className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <div className="kicker-gold kicker">404 — Stance Not Found</div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              This Page Does Not Exist in the Arena
            </h1>
            <p className="text-sm text-ink-2 leading-relaxed">
              The opinion, debate, or link you are looking for may have been archived or does not exist on the permanent ledger.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/" className="btn btn-gold w-full sm:w-auto">
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Global Board</span>
            </Link>
            <Link href="/debates" className="btn btn-ghost w-full sm:w-auto">
              <span>Explore Debates</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

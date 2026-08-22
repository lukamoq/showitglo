'use client';

import React, { useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled Arena Exception:', error);
  }, [error]);

  return (
    <div className="min-h-screen text-ink flex flex-col relative overflow-x-hidden">
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-4 py-16 relative">

        <div className="relative z-10 max-w-md w-full panel rounded-card p-8 text-center space-y-6 animate-rise">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full sunken mx-auto text-down">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <div className="kicker text-down">System Resilience Guard</div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              Something went wrong
            </h1>
            <p className="text-sm text-ink-2 leading-relaxed">
              An unexpected error occurred while loading this view. Nothing you did was charged or
              recorded — retrying is safe.
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => reset()}
              className="btn btn-gold w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry</span>
            </button>
            <Link href="/" className="btn btn-ghost w-full sm:w-auto">
              <Home className="w-4 h-4" />
              <span>Go Home</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

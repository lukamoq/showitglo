'use client';

import React from 'react';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#060709] text-white min-h-screen flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full p-8 rounded-2xl bg-[#0d1117] border border-white/10 text-center space-y-4">
          <h2 className="text-xl font-bold text-white">Critical System Error</h2>
          <p className="text-sm text-slate-400">
            A critical error interrupted the application layout. Please reload to restore state.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm cursor-pointer transition-colors"
          >
            Reload Arena
          </button>
        </div>
      </body>
    </html>
  );
}

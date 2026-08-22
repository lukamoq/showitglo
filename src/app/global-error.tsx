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
      {/* This route replaces the root layout, so it cannot rely on the token
          stylesheet being present — the palette is inlined to match it. */}
      <body
        style={{
          background: '#090A0E',
          color: '#F4F6FA',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          margin: 0,
        }}
      >
        <div
          style={{
            maxWidth: '28rem',
            width: '100%',
            padding: '2rem',
            borderRadius: '0.75rem',
            background: '#12141B',
            border: '1px solid rgba(255,255,255,0.08)',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.018em', margin: 0 }}>
            Critical system error
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#828996', margin: '0.75rem 0 1.5rem' }}>
            A critical error interrupted the application layout. Please reload to restore state.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '0.5625rem 1rem',
              borderRadius: '0.5rem',
              background: '#F0A824',
              border: '1px solid rgba(184,125,14,0.55)',
              color: '#1A1205',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Reload arena
          </button>
        </div>
      </body>
    </html>
  );
}

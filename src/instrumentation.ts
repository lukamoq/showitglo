/**
 * Next.js server bootstrap hook.
 *
 * Runs once per server instance before any request is served. We use it to
 * fail fast on a misconfigured production environment rather than discovering
 * a missing secret halfway through a payment.
 *
 * LOCATION: this file must live in `src/`, not the repository root. Next only
 * looks for `instrumentation.ts` next to the `app` directory — in a project
 * with a `src/` folder, a root-level copy is silently never loaded.
 *
 * The build phase is explicitly exempt: `next build` executes server code to
 * collect page data, and a build machine legitimately has no runtime secrets.
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { validateEnv } = await import('./lib/env');
  // In production a misconfigured environment must abort boot — a missing
  // SESSION_SECRET or Stripe secret discovered mid-payment is far worse than
  // a failed deploy. validateEnv() only throws when NODE_ENV === 'production'.
  validateEnv();
}

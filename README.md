# ShowItGlo

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat&logo=postgresql)](https://www.postgresql.org/)
[![Stripe](https://img.shields.io/badge/Stripe-Payment%20Element-635BFF?style=flat&logo=stripe)](https://stripe.com/)

> **"Always wanted to share your opinion but you didn't get the stage or got
> censored? We don't! Let the world decide what opinion is real."**

A money-weighted public opinion board. A like costs 1¢, a boost 10¢, and every
cent moves a post up a leaderboard whose ranking is invariant to when you look
at it. Paying for attention is the whole point: it makes the ranking expensive
to fake.

---

## How it works

**Identity.** There is no signup. The first request mints an anonymous user row
and returns a signed, HttpOnly `sig_uid` cookie. Identity comes from that cookie
and from nothing else — a `user_id` in a request body is ignored. Wiping cookies
starts a new identity (and abandons the old wallet).

**Money.** A closed-loop wallet, topped up through Stripe. All spending is
server-priced: the client picks a *product* (like / boost / super / a quoted
power boost), never an amount. Every debit is one Postgres transaction holding
a row lock on the wallet and the post, appended to a `wallet_ledger` that always
sums to the balance. An `Idempotency-Key` header makes a retried request replay
instead of charging twice.

**Ranking.** A boost of `A` cents at time `t` is stored as
`A · 2^((t − T₀)/H)` with a 7-day half-life. Because the exponent depends only
on when the boost happened, the *ordering* of posts never changes with the
evaluation time — the leaderboard cannot silently reshuffle between two page
loads. `npm run test:math` proves that property against the shipped code.

**Wars.** `POST /api/v1/wars` publishes two rival stances in one transaction —
side B carries `counter_of = A.id`, the same edge a rebuttal creates, so a
declared war and an argument that grew organically are the same object on the
board. Both sides are moderated before either is written and the pair is
all-or-nothing: half a war never reaches the board. A war spends two of the
author's five hourly posts, and each side may carry its own opening backing.

**First Light.** Publishing is free, but a post nobody has backed opens at the
bottom of a board ordered by money — so every new post is also carried on a
second rail, `GET /api/v1/first-light`, ordered by time alone. The window is
`FIRST_LIGHT_MINUTES` (60) from creation, written into `posts.first_light_until`
at insert time and enforced by the rail's own query. It cannot be bought,
extended or skipped, and when it closes nothing is deleted — the post simply
holds the rank its backing earned.

**The price ladder.** `GET /api/v1/posts/[id]/price-ladder` answers what it
would cost, *at that instant*, to move a post past one place, into the top ten,
and into the lead — plus where that money would actually land it, counted
against the live board. Each rung is the **true minimum** (enough to clear the
target's score by a cent), never the increment strategy's recommended margin,
which is a larger number and would overstate the cost. It is an observation,
not a quote: nothing is written, nothing is reserved, and it carries
`computed_at` because anyone else spending moves it. Every charge is still
priced server-side from `src/lib/pricing.ts`. `npm run test:math` covers the
ladder arithmetic against the shipped module.

**Presence.** "Live in arena" counts rows in `presence_heartbeats` seen in the
last 90 seconds, keyed by an HMAC of the session id. The table stores no user
id, no IP and nothing that links back to a person.

**Insights (paid API).** `GET /api/v1/insights/demands` and
`/api/v1/insights/debates` return money-weighted aggregates. They require an
`Authorization: Bearer sig_live_…` key (self-serve at `/insights`) or the
operator key — they are not public. Keys are stored as sha256 hashes; the token
itself is shown once at creation and is not recoverable.

---

## Data policy — what is and is not true

- **k-anonymity by suppression, not by rounding.** A demand group with fewer
  than `INSIGHTS_K_MIN` (default **100**) distinct backers is **omitted from the
  response entirely**. Counts that are returned are the real counts — nothing is
  floored, padded or inflated to reach the threshold.
- **No personal data is sold or exposed through the API.** The Insights
  endpoints return aggregates only: no aliases, no payment profiles, no
  per-user rows.
- **No email addresses are collected.** Anonymous users get a synthetic
  `anon_<uuid>@anon.showitglo.local` placeholder to satisfy a NOT NULL column.
  Nothing is ever sent to it.
- **IP addresses are used transiently for rate limiting and are never sold.**
  `X-Forwarded-For` is read in memory to throttle posting and boosting bursts.
  It is not written to the database — the `audit_logs.ip_hash` column exists and
  is always `NULL`.
- **No free credit, ever.** First Light gives away *visibility*, never spendable
  balance: no endpoint mints credit, and `npm run verify:prod` fails if one
  appears. Ranking is arithmetic with no element of chance — no draw, no random
  multiplier, no prize pool, no payout. ShowItGlo is not a game of chance.
- **Erasure is self-service.** `POST /api/v1/me/erase` with `{"confirm": true}`
  tombstones the calling session's own account, anonymises its display names and
  removes its posts. Financial rows are retained as books of record with their
  human-readable fields anonymised.

---

## Quick start

Requires Node 20+ and PostgreSQL 16. (`npm run test:math` additionally needs
Node **22.18+ / 23.6+** — it imports `src/lib/engine/*.ts` and
`src/lib/firstLight.ts` directly rather than testing a copy of the formulas.)

```bash
npm install
createdb showitglo_dev
cp .env.example .env.local          # then fill in the values below
npm run db:init                     # applies scripts/schema.sql (idempotent)
npm run db:seed                     # optional: a small, honest demo dataset
npm run dev                         # http://localhost:3000
```

The minimum `.env.local` for local development:

```env
DATABASE_URL=postgresql://postgres@localhost:5432/showitglo_dev
SESSION_SECRET=<openssl rand -hex 32>
ADMIN_SECRET_KEY=<openssl rand -hex 24>
```

Everything else is optional locally. Without Stripe keys the payment endpoints
answer `503 PAYMENTS_NOT_CONFIGURED` — deliberately, so nothing hands the client
a fake `client_secret`. To exercise the real flow, add a Stripe **test-mode**
key set and forward webhooks:

```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...          # printed by `stripe listen`
```

```bash
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
```

See `.env.example` for the full annotated list — it is kept in lockstep with
`src/lib/env.ts`, and `npm run verify:prod` fails if the two drift.

### Seeds

| command | what it writes |
|---|---|
| `npm run db:seed` | `scripts/seed-dev.mjs` — three obviously-fake demo users and six posts that start at **zero**, then real backing driven through the store so wallets, ledgers and post totals reconcile. No invented numbers, no real brands. |
| `npm run db:seed:wars` | `scripts/seed-wars.mjs` — a larger demo dataset of debates and counter-wars. It writes post totals and backer rows **directly**, so the wallet ledger does not reconcile against them. Local demo only; never point it at production. |

---

## Tests

```bash
npm run test:math          # scoring engine, against src/lib/engine
npm run test:integration   # money-path regression suite (needs Postgres)
npm run verify:prod        # config, schema, forbidden patterns
npm run test:all           # all three
```

`test:integration` is the one that matters. It creates a throwaway
`showitglo_test` database, applies the schema, boots two `next dev` servers from
an isolated copy of the tree, and asserts over HTTP that:

- a tampered session cookie yields a **new** identity, never someone else's;
- a `user_id` in a request body debits nobody;
- no endpoint can mint credit — with Stripe unconfigured, top-up returns 503 and
  the wallet stays at zero;
- 10 parallel 100¢ likes against a 100¢ wallet settle **exactly once**, and the
  balance never goes negative;
- a replayed `Idempotency-Key` debits once and reports `replayed: true`;
- an unsigned, mis-signed or stale-timestamped webhook is rejected, a correctly
  signed one credits once, and a replay credits nothing;
- admin routes answer 401 without a key and **503 when no key is configured** —
  they fail closed, never open;
- a demand group with 3 backers is absent from the Insights response.

It cleans up after itself and is safe to re-run. Set `TEST_KEEP=1` to keep the
database and server logs for debugging.

---

## Deployment

Target is **Vercel** (serverless) + Neon Postgres + Stripe.

1. Set the seven required environment variables (see `.env.example`) plus
   `STRICT_ENV_CHECK=true`, so a missing secret aborts the deploy instead of
   silently degrading a feature.
2. Deploy.
3. Apply the schema once: `DATABASE_URL="<neon unpooled url>" node scripts/init-db.mjs`.
   Re-run it only when `scripts/schema.sql` changes.
4. `curl https://<domain>/api/health` — `services.database.schema` must be
   `ready` and `services.payments.ready` must be `true`.

**Every remaining human step — Stripe key rotation, Apple Pay domain
verification, the custom domain, Neon backups, the live-mode $1 test — is
written up with values and verification commands in
[`PRODUCTION_MANUAL_STEPS.md`](./PRODUCTION_MANUAL_STEPS.md). Read it before
launch.**

> `Dockerfile` and `docker-compose.yml` are present but **unverified**. The
> Dockerfile sets `DOCKER_BUILD=1` so `next.config.ts` emits the standalone
> output it copies, but `docker-compose.yml` still passes no `SESSION_SECRET`
> and no `ADMIN_SECRET_KEY` (so admin routes answer 503 and, under
> `NODE_ENV=production`, every session request throws) and still runs a Redis
> service that no code touches. Vercel is the supported path.

---

## Apple Pay

Stripe requires the domain association file at
`/.well-known/apple-developer-merchantid-domain-association`. It is served two
ways — from `public/.well-known/` and from a route handler at
`src/app/.well-known/apple-developer-merchantid-domain-association/route.ts` —
because a dot-directory under `public/` is not reliably shipped by every builder.

The file **is** committed, but it was generated on 2024-05-08 and this
repository cannot confirm it matches the production domain. Before verifying,
download a fresh file from **Stripe Dashboard → Settings → Payments → Payment
methods → Apple Pay → Add a new domain**, replace the committed one, redeploy,
and only then press **Verify**. Details in `PRODUCTION_MANUAL_STEPS.md` §B4.

---

## Corporate & legal

- **Operator:** MomentumQ GmbH, Leutschenbachstrasse 95, 8050 Zürich,
  Switzerland (UID: CHE-222.957.350)
- **Impressum:** [`/impressum`](src/app/impressum/page.tsx)
- **Privacy policy:** [`/privacy`](src/app/privacy/page.tsx)

Proprietary. All rights reserved.

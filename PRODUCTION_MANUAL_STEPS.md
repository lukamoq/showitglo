# Production manual steps

Everything in this file requires a human with dashboard access. Nothing here
can be done by code in the repository, and nothing here is done automatically
by a deploy.

- **Project:** `momentumq/showitglo` on Vercel (serverless / Fluid Compute)
- **Database:** Neon Postgres (provisioned, schema applied to the branch used
  by `DATABASE_URL`)
- **Payments:** Stripe, live mode
- **Verified against the live project on 2026-08-22** with `vercel env ls production`
  and `vercel ls --prod`

> **Blocking status at the time of writing: there is no production deployment.**
> `vercel ls --prod` reports no deployments and `https://showitglo.vercel.app`
> answers `DEPLOYMENT_NOT_FOUND`. The Stripe webhook endpoint that was created
> during this overhaul therefore points at a URL that does not resolve; every
> event Stripe sends will fail and enter its retry schedule. Do step **B1**
> before doing anything else with real money.

---

## A. Already done during this overhaul

These are recorded so nobody redoes them, and so the rotation procedure for
each one is written down before it is needed.

### A1 — `DATABASE_URL` (Neon Postgres)

| | |
|---|---|
| **Where** | Vercel → Project → Settings → Environment Variables (Production, Preview, Development) |
| **Why** | Every piece of correctness-critical state — wallets, ledger, posts, votes, idempotency keys — lives in Postgres. Vercel runs many instances; nothing survives in process memory. |
| **Value** | The **pooled** Neon connection string. `DATABASE_URL_UNPOOLED` is also set and is the one to use for migrations. |
| **Verify** | `curl -s https://<deployment>/api/health \| jq '.services.database'` → `{"status":"connected","schema":"ready"}` |
| **Risk if wrong** | Total outage. `/api/health` returns 503 and every money route fails. |

**Rotation.** Create a new Neon role or reset the password in the Neon console →
`vercel env rm DATABASE_URL production` → `vercel env add DATABASE_URL production`
→ redeploy. Do the same for `DATABASE_URL_UNPOOLED`. There is no data migration;
the database is the same.

### A2 — `SESSION_SECRET`

| | |
|---|---|
| **Where** | Vercel → Environment Variables (Production) |
| **Why** | HMAC key for the anonymous `sig_uid` session cookie. Identity comes from this cookie and nowhere else, so this key *is* the authentication system. |
| **Value** | ≥ 32 characters of random hex — `openssl rand -hex 32` |
| **Verify** | Load the site, then check the response for `Set-Cookie: sig_uid=v1.<uuid>.<sig>; HttpOnly; Secure; SameSite=Lax`. If the app boots at all in production, the secret is present: `getSessionSecret()` throws rather than fall back to the committed development constant. |
| **Risk if wrong** | Anyone who knows the committed fallback constant could forge any visitor's cookie and spend their wallet. |

**Rotation is destructive and should be treated as a last resort.** Changing it
invalidates every issued cookie: every visitor becomes a brand-new anonymous
user and loses access to the wallet balance attached to their old identity —
money they paid for. Only rotate on a confirmed compromise, and be prepared to
reconcile balances manually from `wallet_ledger` afterwards.

### A3 — `ADMIN_SECRET_KEY`

| | |
|---|---|
| **Where** | Vercel → Environment Variables (Production) |
| **Why** | The only credential for `/api/v1/admin/*`, `/api/v1/posts/[id]/respond` (publishing an official brand response) and operator access to the Insights API. |
| **Value** | ≥ 16 characters — `openssl rand -hex 24` |
| **Verify** | `curl -s -o /dev/null -w '%{http_code}' https://<deployment>/api/v1/admin/overview` → `401` (not `503`, which means the key is unset, and never `200`). Then repeat with `-H "x-admin-key: <key>"` → `200`. |
| **Risk if wrong** | Admin auth fails **closed**, so an unset key locks operators out rather than opening the door — but moderation, refunds triage and brand responses all become impossible. |

**Rotation.** `vercel env rm ADMIN_SECRET_KEY production` → `vercel env add …` →
redeploy. No user-visible effect; update any operator tooling holding the old key.

### A4 — `NEXT_PUBLIC_APP_URL`

| | |
|---|---|
| **Where** | Vercel → Environment Variables (Production) |
| **Why** | Used by the same-origin (CSRF) check on every mutation, and by `robots.ts` / `sitemap.ts`. |
| **Value** | The canonical `https://` origin, no trailing slash. Must be updated when the custom domain goes live (step **B7**). |
| **Verify** | `curl -s https://<deployment>/robots.txt` should reference the same host. |
| **Risk if wrong** | Browser mutations from the real origin can be rejected with `403 BAD_ORIGIN`, or the CSRF check silently loosens. |

### A5 — `STRIPE_SECRET_KEY` (live restricted key)

| | |
|---|---|
| **Where** | Vercel → Environment Variables (Production) |
| **Why** | Creates PaymentIntents and re-fetches them when confirming a top-up. |
| **Value** | A **restricted** live key (`rk_live_…` / `sk_live_…`) with write access to PaymentIntents. It needs nothing else. |
| **Verify** | `curl -s https://<deployment>/api/health \| jq '.services.payments'` → `stripe_configured: true`. Key material is never echoed. |
| **Risk if wrong** | `/api/v1/wallet/create-intent` answers `503 PAYMENTS_NOT_CONFIGURED`; nobody can top up. |

**⚠ This key must be rotated — see step B5.**

### A6 — `STRIPE_WEBHOOK_SECRET` and the live webhook endpoint

| | |
|---|---|
| **Where** | Stripe Dashboard → Developers → Webhooks (the endpoint) and Vercel → Environment Variables (the signing secret) |
| **Endpoint** | `https://showitglo.vercel.app/api/v1/webhooks/stripe` |
| **Events** | `payment_intent.succeeded`, `charge.refunded`, `charge.dispute.created` |
| **Why** | The webhook is the **authoritative** money-in path. Signature verification is unconditional — there is no development bypass — so without the signing secret the route answers `503` and no payment is ever credited. |
| **Value** | The `whsec_…` shown once when the endpoint is created (recoverable later from the endpoint's page). |
| **Verify** | `curl -s https://<deployment>/api/health \| jq '.services.payments.webhook_configured'` → `true`. Then in Stripe → Webhooks → the endpoint → **Send test webhook** → `payment_intent.succeeded`: it must return `200` with `{"received":true,...}`. A `400` means the secret in Vercel does not match the endpoint. |
| **Risk if wrong** | Customers are charged and never credited. This is the single worst failure mode in the system. |

**Rotation.** Stripe → Webhooks → endpoint → **Roll secret**, choose an
expiry window that gives you time to deploy → `vercel env rm STRIPE_WEBHOOK_SECRET production`
→ `vercel env add …` with the new value → redeploy **before** the old secret
expires. Re-run the "Send test webhook" check afterwards.

> The endpoint URL above was created for `showitglo.vercel.app`. It must be
> updated when the custom domain goes live (step **B7**), and it currently
> resolves to nothing (step **B1**).

### A7 — `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

Listed as outstanding when this overhaul began; it was added to Vercel
production on 2026-08-22 and is present now.

| | |
|---|---|
| **Where** | Vercel → Environment Variables (Production) |
| **Why** | Mounts the Stripe Payment Element (card, Link, Apple Pay) in the browser. It is public by design. |
| **Value** | `pk_live_…` **from the same Stripe account and the same mode as `STRIPE_SECRET_KEY`.** A test publishable key paired with a live secret key produces an Element that silently fails to confirm. |
| **Verify** | `curl -s https://<deployment>/api/health \| jq '.services.payments'` → `publishable_key_configured: true` **and** `ready: true` (`ready` is only true when secret, publishable and webhook secret are all present). Then open the top-up drawer and confirm the Payment Element renders. |
| **Risk if wrong** | `/api/v1/wallet/create-intent` answers `503` — the whole top-up flow is dead even though the server-side keys are fine. |

**Rotation.** Publishable keys are not secret; they only change when the Stripe
account or mode changes. Re-add and redeploy.

### A8 — `STRICT_ENV_CHECK`

Present in Vercel production. **Its value cannot be read back from the CLI, and
it matters — confirm it is exactly `true`** (step **B3**).

---

## B. Still required

### B1 — Make the first production deployment  ✅ DONE (22 Aug 2026)

Deployed to production; live at https://www.showitglo.com (health: healthy, payments.ready: true). Original step for reference:

| | |
|---|---|
| **What** | `vercel --prod` (or push to the default branch once the Git integration is connected). |
| **Why** | There is no deployment. Everything below — Apple Pay verification, the webhook, the live-mode test — needs a URL that answers. |
| **Verify** | `vercel ls --prod` lists a `Ready` deployment, and `curl -s https://showitglo.vercel.app/api/health` returns JSON with `"status":"healthy"`. |
| **Risk if skipped** | Stripe is already configured to deliver events to a dead URL. Any payment taken now is charged at Stripe and never credited in the ledger. |

### B2 — Apply the schema to Neon  ✅ DONE (22 Aug 2026 — 25 tables verified)

| | |
|---|---|
| **What** | `DATABASE_URL="<neon unpooled url>" node scripts/init-db.mjs` |
| **Where** | Any machine with network access to Neon. Use the **unpooled** URL: DDL through a transaction pooler is unreliable. |
| **Why** | The app does not create its own tables. `scripts/init-db.mjs` applies `scripts/schema.sql` under `pg_advisory_lock(727272)` so two concurrent runs cannot collide. |
| **Verify** | The script prints `25 tables verified ✓` and `default category "global" ✓`. Then `curl -s https://<deployment>/api/health \| jq '.services.database.schema'` → `"ready"`. |
| **Risk if skipped** | Every route 500s and `/api/health` reports `schema: "missing"` (503 in production). |

**Redeploys do not need this.** Run it again only when `scripts/schema.sql`
changes — the file is idempotent (`CREATE TABLE IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`), and
`scripts/verify-production.mjs` proves that by applying it twice to a scratch
database on every run.

### B3 — Confirm `STRICT_ENV_CHECK=true`  ✅ CONFIRMED (the boot guard fired in production on 22 Aug and blocked a misconfigured deploy — it works)

| | |
|---|---|
| **What** | `vercel env rm STRICT_ENV_CHECK production` then `vercel env add STRICT_ENV_CHECK production` with the value `true` (the CLI cannot show you the current value). |
| **Why** | `validateEnv()` in `src/lib/env.ts` gates on this variable, **not** on `NODE_ENV`. With it unset or set to anything other than the exact string `true`, a production deploy with a missing `STRIPE_WEBHOOK_SECRET` boots happily and only writes a warning line — and then silently fails to credit every payment. With it set, the deploy aborts instead. |
| **Verify** | Temporarily remove a non-critical variable in a **preview** deployment and confirm the build/boot fails with `Refusing to start: N required environment variable(s)…`. Restore it. |
| **Risk if skipped** | Silent, revenue-losing misconfiguration instead of a loud failed deploy. |

### B4 — Apple Pay domain verification  ✅ DONE (www.showitglo.com registered in live mode via API, 22 Aug 2026)

| | |
|---|---|
| **What** | Stripe Dashboard → Settings → Payments → **Payment methods** → Apple Pay → **Add a new domain** → enter the production domain → **Verify**. |
| **Where the file is served** | `public/.well-known/apple-developer-merchantid-domain-association`, plus a route handler at `src/app/.well-known/apple-developer-merchantid-domain-association/route.ts` that serves the same bytes as `text/plain` (a dot-directory under `public/` is not reliably shipped by every builder, so both exist). |
| **⚠ Check the file first** | The association file committed to this repository was generated on **2024-05-08** and its embedded `pspId` cannot be matched to this domain from outside Stripe. **Download a fresh file from the Stripe dashboard for the exact domain you are verifying and replace `public/.well-known/apple-developer-merchantid-domain-association` with it**, then redeploy before pressing Verify. |
| **Verify** | `curl -s https://<domain>/.well-known/apple-developer-merchantid-domain-association \| head -c 64` returns the hex blob, and Stripe shows the domain as **Verified**. Then open the site in Safari on a device with a card in Wallet and confirm the Apple Pay button appears in the top-up drawer. |
| **Risk if skipped** | Apple Pay silently does not appear. Card and Link still work, so this fails quietly rather than loudly. |

Repeat this for **every** domain that serves the checkout — the `.vercel.app`
host and the custom domain are separate entries in Stripe.

### B5 — Rotate the Stripe secret key  ← do this soon after launch

| | |
|---|---|
| **Why** | The restricted live key currently in Vercel was transmitted through a chat transcript during this overhaul. Treat it as disclosed. |
| **Steps** | 1. Stripe Dashboard → Developers → API keys → **Create restricted key**, granting exactly the same permissions as the current one (write on PaymentIntents; nothing else).<br>2. `vercel env rm STRIPE_SECRET_KEY production`<br>3. `vercel env add STRIPE_SECRET_KEY production` → paste the new key<br>4. `vercel --prod` (a redeploy is required; environment changes do not apply to a running deployment)<br>5. Confirm the new deployment is healthy and a `$1` top-up succeeds (step **B8**)<br>6. **Only then** delete the old key in the Stripe dashboard. |
| **Verify** | Stripe → API keys shows the old key deleted and the new one with a recent "last used" timestamp. |
| **Risk if skipped** | Anyone holding the transcript can create PaymentIntents against the live account. |

Do not delete the old key before step 5 — deleting first turns a rotation into
an outage.

### B6 — Neon backups: point-in-time restore and RPO/RTO

| | |
|---|---|
| **What** | Neon console → the project → **Settings → Storage / History retention**. Confirm the retention window and write down the actual number. |
| **Why** | `wallet_ledger`, `payments` and `interactions` are the books of record for real money. Neon's history retention is what makes a point-in-time restore possible; on the free tier it is measured in hours, and it is the only backup that exists — nothing in this repository takes one. |
| **Values to record** | Retention window (hours/days). Target **RPO ≈ the retention granularity** (Neon PITR is continuous within the window, so effectively seconds) and **RTO = branch-create + connection-string swap + redeploy**, realistically 10–20 minutes. |
| **Verify** | Create a branch from a timestamp five minutes ago in the Neon console, connect to it, and confirm `SELECT COUNT(*) FROM wallet_ledger` returns plausible data. Delete the branch. Do this **before** you need it. |
| **Risk if skipped** | A bad migration or an erroneous `DELETE` is unrecoverable, and the ledger is the only record of what customers paid. |

Also consider a periodic logical dump (`pg_dump` of `users`, `wallets`,
`wallet_ledger`, `payments`, `interactions`) to object storage — retention
windows expire, dumps do not.

### B7 — Custom domain (`showitglo.com`)  ✅ DONE (nameservers flipped; www.showitglo.com live; webhook + NEXT_PUBLIC_APP_URL point at it)

| | |
|---|---|
| **What** | Vercel → Project → Settings → **Domains** → add `showitglo.com` and `www.showitglo.com`, then set the DNS records Vercel shows at the registrar. |
| **Then, in order** | 1. `vercel env rm NEXT_PUBLIC_APP_URL production` and re-add it as `https://showitglo.com`<br>2. Redeploy<br>3. Stripe → Webhooks → edit the endpoint URL to `https://showitglo.com/api/v1/webhooks/stripe` (or add a second endpoint and retire the old one once no events are pending)<br>4. Stripe → Apple Pay → add and verify `showitglo.com` as a domain (step **B4**)<br>5. Update the Impressum / privacy pages if they name the deployment URL |
| **Verify** | `curl -sI https://showitglo.com/api/health` returns `200`; a browser mutation from `https://showitglo.com` is not rejected with `403 BAD_ORIGIN`; Stripe's webhook page shows recent successful deliveries to the new URL. |
| **Risk if skipped** | Mutations rejected as cross-origin, webhooks delivered to the old host, Apple Pay unverified on the domain customers actually visit. |

### B8 — Live-mode end-to-end test (real money)

| | |
|---|---|
| **What** | With the production deployment live, top up **$1.00** with a real card, then refund it from the Stripe dashboard. |
| **Steps** | 1. Open the production site, top up `$1.00`.<br>2. Stripe → Payments: the PaymentIntent is `succeeded`, `metadata.purpose = wallet_topup`, `metadata.user_id` is a UUID.<br>3. Stripe → Webhooks: `payment_intent.succeeded` delivered with a `200`.<br>4. In Postgres: `SELECT * FROM payments ORDER BY created_at DESC LIMIT 1;` shows one row, and `SELECT delta_cents, kind, balance_after_cents FROM wallet_ledger WHERE user_id = '<uuid>' ORDER BY id DESC LIMIT 3;` shows exactly **one** `topup` of `+100`. The confirm call and the webhook both credit through the same unique index — if you see two, the idempotency guard has regressed.<br>5. Refund the payment in Stripe.<br>6. Confirm `charge.refunded` delivered `200`, `payments.status = 'refunded'`, and a `refund` ledger row of `-100`. |
| **Verify** | `SELECT balance_cents FROM wallets WHERE user_id = '<uuid>'` equals `SELECT SUM(delta_cents) FROM wallet_ledger WHERE user_id = '<uuid>'`. |
| **Risk if skipped** | Test-mode success proves nothing about live-mode keys, live webhook signatures or Apple Pay on the real domain. |

Do this once before announcing the product, and again after any Stripe key
rotation or domain change.

---

### B9 — Finish the Resend install (wallet recovery emails)  ← not started

Wallet recovery ships behind an optional key. **With `RESEND_API_KEY` unset the
app is fully functional**: linking an email and recovering a wallet answer
`503 EMAIL_NOT_CONFIGURED`, the UI says "email isn't enabled on this deployment
yet", and nothing else is affected. Stripe **receipts already work without
this** — they are sent by Stripe from the `receipt_email` on the PaymentIntent.

What is at stake if it stays unset: a visitor who clears their cookies loses the
wallet and the balance in it, permanently, with no way for support to restore
it. That is the entire reason to finish this.

| | |
|---|---|
| **What** | Provision Resend, verify a sender domain, set two env vars. |
| **Steps** | 1. `vercel integration add resend` (the CLI stops at the marketplace terms — accept them in the browser, then re-run). Alternatively create the account directly at resend.com and copy an API key.<br>2. In Resend → Domains, add `showitglo.com` and publish the **SPF** and **DKIM** records it prints into the domain's DNS. Wait for both to show *verified*. Skipping this is the difference between "recovery email arrives" and "recovery email is filed as spam", which for this feature is the same as it not working.<br>3. `vercel env add RESEND_API_KEY production`<br>4. `vercel env add NOTIFICATIONS_FROM_EMAIL production` → `ShowItGlo <noreply@showitglo.com>` (must be on the verified domain; the default `onboarding@resend.dev` is Resend's shared sandbox sender and will not deliver reliably).<br>5. `vercel --prod` — env changes need a redeploy. |
| **Verify** | On the production dashboard, link a real address you control → the confirmation email arrives → click it → the dashboard shows `Email confirmed` and the masked address. Then open a **private window** (no session), use *Recover wallet* in the footer with that address, click the link, and confirm the dashboard shows the ORIGINAL wallet's balance and stances. Finally check that a wrong address still returns the same "if that email secures a wallet…" line — a different answer for a known address would make the endpoint an account-enumeration oracle. |
| **Risk if skipped** | Every wallet is one cookie clear away from being unrecoverable, and support has no mechanism to help — by design, since there is no other proof of ownership. |

Never set `EMAIL_DEBUG_FILE` in production. It is the test hook that writes
outgoing magic links to a file, and `src/lib/env.ts` refuses to honour it when
`NODE_ENV=production` — but it should not be present at all.

### B10 — Verify a real receipt in production

| | |
|---|---|
| **What** | Confirm Stripe actually mails a receipt for a live top-up. |
| **Steps** | 1. On production, open the top-up modal with **no** email linked and enter an address in *Email for receipt (optional)*.<br>2. Complete a `$1.00` top-up.<br>3. Confirm the receipt arrives from Stripe, and that Stripe → Payments shows `receipt_email` set on the intent.<br>4. Repeat with an address **linked** to the wallet and leave the field alone: the modal should say "Your receipt goes to a\*\*\*@d\*\*\*.com" and Stripe should use the linked address. |
| **Verify** | The linked address wins. Passing a different `receipt_email` in the request body while an address is linked must NOT change where the receipt goes — that field is only honoured for wallets with no linked address. |
| **Risk if skipped** | Silent non-delivery of payment receipts, which for a prepaid balance is a consumer-protection problem, not just a UX one. |

---

## C. Quick reference

```bash
# what is set in production (names only — values stay encrypted)
vercel env ls production

# replace one variable and roll it out
vercel env rm  STRIPE_SECRET_KEY production
vercel env add STRIPE_SECRET_KEY production
vercel --prod                      # env changes need a redeploy

# apply / re-apply the schema (only when scripts/schema.sql changed)
DATABASE_URL="<neon unpooled url>" node scripts/init-db.mjs

# is the deployment actually wired up?
curl -s https://showitglo.com/api/health | jq '.services'
```

**Environment variables required in production** (all seven are validated at
boot by `src/lib/env.ts`, and all seven are currently set):

`DATABASE_URL` · `SESSION_SECRET` · `ADMIN_SECRET_KEY` · `NEXT_PUBLIC_APP_URL` ·
`STRIPE_SECRET_KEY` · `STRIPE_WEBHOOK_SECRET` · `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

**Optional, and deliberately not validated at boot** — the feature behind them
self-disables rather than blocking a deploy:

`RESEND_API_KEY` · `NOTIFICATIONS_FROM_EMAIL` (see B9)

Plus `STRICT_ENV_CHECK=true` so that list is actually enforced (step **B3**).

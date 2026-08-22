# Counsel brief — prepaid credits: deposit-taking, e-money, money transmission

**Client:** MomentumQ GmbH, Leutschenbachstrasse 95, 8050 Zürich (UID CHE-222.957.350)
**Product:** ShowItGlo — www.showitglo.com, live
**Prepared by:** ShowItGlo engineering
**Date:** 22 August 2026
**Purpose:** a scoped, cheap-to-answer question set on whether the prepaid credit
balance is a regulated activity in Switzerland, the EU, or the US.

Every fact in Part A is taken from the running code and is cited to the file that
enforces it. Where a limit is a database default rather than a hard constant, we
say so. If a fact matters to your answer and is not stated here, please ask
rather than assume — we would rather add a paragraph than have you price in
uncertainty.

---

## Part A — The facts

### A1. What the product is

ShowItGlo is a public opinion board. Users publish opinions and demands, and pay
small amounts to raise how highly a post ranks. Ranking is arithmetic: a score
built from what has been paid into a post, decaying on a fixed half-life. Posting
is free; ranking is not.

### A2. The credit

To pay for anything a user first loads **credits** into a prepaid wallet, then
spends them. The credit is closed-loop in the strict sense:

| Property | Status | Enforced by |
|---|---|---|
| Spendable on ShowItGlo services | **Yes** — likes, boosts, super boosts, power boosts, backing a debate side | `src/lib/pricing.ts`, `store.recordInteraction` |
| Spendable anywhere else | **No.** No merchant, partner or third party accepts it; there is no acceptance network of any kind | — (no such code path exists) |
| Transferable user-to-user | **No.** There is no transfer, gift, trade or P2P endpoint | — (no such route exists) |
| Payable out to a user | **No.** No withdrawal, no payout, no bank-account field anywhere in the product | — |
| Interest-bearing | **No** | — |
| Expiring | **No.** Nothing expires a balance; there is no dormancy fee and no sweep job | `scripts/schema.sql` |
| Redeemable for cash | **Only** as a refund of the *unspent* balance to the original payment method (below) | `store.applyRefund` |

### A3. Money in

* Top-up via Stripe PaymentIntent, currency **USD**, `automatic_payment_methods`
  (card, Apple Pay, Google Pay, Link). Card data never reaches our servers.
* **$1.00 minimum, $50.00 maximum per transaction** (`TOPUP_MIN_CENTS = 100`,
  `TOPUP_MAX_CENTS = 5000`, `src/lib/pricing.ts`).
* **$500.00 wallet balance ceiling** (`WALLET_MAX_CENTS = 50000`), enforced at
  PaymentIntent creation — before the card is charged — and counting top-ups
  already in flight, so concurrent intents cannot exceed it
  (`store.reserveWalletHeadroom`). It is deliberately *not* enforced when the
  webhook credits a settled payment: refusing money already captured would lose
  it.
* **Rate limit of 10 top-up attempts per user per minute** (`checkDbRateLimit`).
* The wallet is credited only from a Stripe payment we have verified
  (`payment_intent.succeeded` webhook with a valid signature, or a server-side
  retrieve that confirms `status === 'succeeded'` and that the intent's metadata
  names the session's own user). Idempotent on the PaymentIntent id, so a
  replayed webhook cannot double-credit.

### A4. Money out — the only three ways

1. **Spending inside ShowItGlo.** Instant, irreversible, publicly recorded.
   Fixed prices: like $0.01 per unit (1–100 units, capped at 100 units per user
   per post per 24h), boost $0.10, super boost $1.00; power boosts priced by a
   server-issued quote valid 5 minutes with a $10.00 floor; debate backing chips
   $0.10 / $1.00 / $10.00.
2. **Refund of unspent balance to the original payment method.** Operator-
   initiated in Stripe on a support request; the `charge.refunded` webhook then
   debits the wallet, cumulatively and clamped to whatever balance remains
   (`store.applyRefund`). There is **no user-facing refund endpoint** and no way
   to direct the money anywhere other than the card that paid.
3. **Chargeback.** `charge.dispute.created` reverses the payment in full and
   **freezes the wallet**; a frozen wallet can neither top up nor spend.

There is no fourth path. No payouts, no transfers, no cash-out, no crypto, no
marketplace: the operator is the sole counterparty and the sole supplier of
everything a credit buys.

### A5. Velocity, in practice

Worth being precise, because it bounds every exposure figure:

* **Spending** is capped at **$50.00 per rolling 24 hours per wallet**
  (`wallets.daily_cap_cents`, default 5000, checked against the trailing 24h of
  spend ledger rows in `store.recordInteraction`). This is a **column default**,
  adjustable per wallet, not a hard-coded constant.
* **Top-ups have no separate daily cap.** They are bounded instead by the $500
  balance ceiling: a wallet can be filled to $500 on day one (ten $50
  transactions), after which further top-ups are only possible to the extent
  credits have been spent — and spending is capped at $50/day.
* So the steady-state maximum inflow per wallet is about **$50 per day**, with a
  $500 one-off at the start. Maximum outstanding float per wallet is **$500**.

### A6. Identity, AML-relevant surface

* **No signup, no KYC, no identity data.** A user is a random UUID in a signed
  HttpOnly cookie (`sig_uid`, 400-day lifetime). The `users.email` column holds a
  synthetic placeholder (`anon_<uuid>@anon.showitglo.local`) purely to satisfy a
  NOT NULL UNIQUE constraint.
* An email address may be **optionally** linked, solely so a lost wallet can be
  recovered by magic link. Most wallets have none.
* We hold **no name, no address, no date of birth, no document, no card
  fingerprint** (the `payments.card_fingerprint` and `risk_score` columns exist
  in the schema but are never written). The payer's identity is known to Stripe
  and only to Stripe.
* Customers are worldwide, including the EU/EEA and the US. There is no
  geo-blocking and no country selection anywhere in the flow.
* Every top-up now writes an audit row recording the user id, timestamp, amount
  and the version of the EU withdrawal-consent wording that was ticked.

### A7. Operator and processing

MomentumQ GmbH is a Swiss GmbH with no establishment, branch, agent or bank
account outside Switzerland. It does not market into the EU in any targeted way —
the site is in English, prices in USD, and EU consumers reach it as they would
any public website. Stripe is the sole processor and is the merchant of record's
acquirer; funds settle to the company's Stripe account and then to its bank.

---

## Part B — The questions

### B1. Switzerland — BankG / FINIG deposit-taking, and GwG (AMLA)

The balance is customer money sitting with a non-bank until the customer spends
it, which is the shape that attracts the deposit-taking question.

1. Does the outstanding balance constitute **public deposits** under BankG art. 1
   / BankV, or does it fall within the exception for **settlement accounts**
   (funds held to settle the customer's own transactions with the operator), or
   within any de-minimis relief, given the $500 per-wallet ceiling and the fact
   that the operator is the sole supplier of everything the credit buys?
2. Does anything change if aggregate float grows — is the analysis per wallet, on
   the aggregate, or on both? **Is there a total float figure at which we must
   come back to you?** A number we can monitor is worth more to us than a
   principle.
3. Does the fact that unspent balances are refundable on request — to the
   original card only, never to a nominated account — help or hurt? Our
   instinct is that "refundable" pulls toward deposit-like, while
   "refund-to-source only, no expiry, no interest, no payout" pulls firmly away
   from it. Which reading prevails?
4. **GwG/AMLA:** at these caps ($50 per transaction, $500 balance, $50/day
   spend, refund-to-source only, no transfers, no payouts), is the operator a
   financial intermediary at all? If not, is there a cap, velocity or aggregate
   threshold at which it becomes one, and is a self-regulatory organisation (SRO)
   affiliation ever triggered by this design?
5. Would **removing** the refund entirely (credits sold as strictly
   non-refundable) improve the regulatory position — and if so, is that gain
   worth the EU consumer-law cost of doing it? We would rather keep the refund;
   we are asking whether that preference is expensive.

### B2. EU — EMD2 e-money, for a Swiss issuer serving EU consumers passively

6. Do these credits qualify as **electronic money** under Directive 2009/110/EC
   art. 2(2) — electronically stored monetary value, issued on receipt of funds,
   accepted by a person other than the issuer? Our reading is that the third
   limb fails outright: nobody other than MomentumQ GmbH ever accepts a credit,
   for anything.
7. If they nonetheless engage EMD2, does the **limited-network exclusion**
   (art. 1(4), and the PSD2 art. 3(k) analogue) apply to a credit usable only for
   services supplied by the issuer itself on its own platform? Is there any
   notification duty attached to relying on it, at the volumes described?
8. Does a **Swiss issuer with no EU establishment**, serving EU consumers who
   arrive at a public English-language website, fall within any member state's
   supervisory perimeter at all — and does the answer change if we begin actively
   marketing in the EU, or accept EUR, or add a language?
9. Anything at the **national** level in the likely-largest markets (DE, FR, NL,
   IE) that goes beyond the directive here?

### B3. United States — money transmission

10. Does the design engage **state money-transmitter licensing**, or does it sit
    within the standard **closed-loop / stored-value exemptions**? The relevant
    facts are: single issuer, single acceptor, no P2P transfer, no payout, and
    refunds only to the original payment method.
11. Do the state **gift-card and unclaimed-property (escheat)** rules bite on a
    non-expiring, refundable balance — and is non-expiry a help or a hazard here?
    We chose it as a consumer-friendly feature and would like to know if it
    created a liability.
12. **FinCEN:** any federal MSB registration exposure on these facts?
13. Is this a "answer properly in the states that matter" question, or a "the
    closed-loop exemption is clean everywhere, note it and move on" question? A
    calibration is genuinely useful to us.

### B4. Design changes that would de-risk

We can change the product. We would rather change it now than find out later.
Please tell us which of these actually move the needle, and which are
superstition:

14. **Lower the balance ceiling** (e.g. $500 → $200 or $100). Cheap for us —
    almost nobody holds a large balance.
15. **Add an expiry** to unspent credits. Possible, but it worsens the consumer
    position and we would need a reason better than tidiness.
16. **A KYC trigger** at some cumulative-spend or lifetime-top-up threshold.
    Which threshold, and which fields, would be the minimum that achieves
    something? Note this is in direct tension with the anonymity the product is
    sold on, so we need the trigger to be real, not decorative.
17. **A daily top-up cap** in addition to the balance ceiling (there is none
    today — see A5). Trivial to add if it matters.
18. **Non-refundable credits.** See B1(5).
19. Anything else that, in your experience, is the single highest-value change
    for a design like this.

---

## Part C — Scope: what you do NOT need to review

To keep this cheap, and because none of the following exists in the product:

* **No payouts, withdrawals or transfers** of any kind — no user ever receives
  money from us other than as a refund to the card that paid.
* **No user-to-user payments**, no marketplace, no split settlements, no seller
  accounts, no Stripe Connect.
* **No crypto, no tokens, no on-chain anything.**
* **No lending, no interest, no yield, no investment feature.** Balances sit
  inert.
* **No custody of funds for third parties.** Stripe holds the money until
  settlement; we hold a number in a database.
* **No gambling mechanic.** Spending buys a deterministic, published score
  change — no chance element, no prize pool, no payout.
* **Data protection and VAT are out of scope here** — the privacy policy is
  published separately, and the tax questions are in `docs/VAT_BRIEF.md`, which
  is for the accountant.

## Part D — What we are asking for

A short written answer to Part B, in the form we can act on:

1. **Are we regulated today, in each of CH / EU / US?** Yes or no, with the
   reasoning compressed.
2. **If no — what is the trigger?** A number, a threshold, or a feature we must
   not add. Something we can put in a monitoring query and an engineering
   checklist.
3. **If yes — what is the minimum path to compliant?** Including whether the
   answer is "change the product" rather than "get a licence".
4. **Which of B4 is worth doing anyway.**

Engineering contact for follow-up facts, code excerpts, or a walkthrough of any
flow: `contact@showitglo.com`. We can produce exact figures for outstanding
float, per-wallet balance distribution and top-up velocity from the production
database on request.

# VAT / MWST brief — ShowItGlo

**For:** the accountant of MomentumQ GmbH
**From:** ShowItGlo engineering
**Date:** 22 August 2026
**Status:** engineering-side preparation. No tax registration exists yet, no tax
is being collected, and nothing in the product calculates or shows tax.

This document states what the software actually does, what data it holds, and
the questions we need answered before EU or US volume arrives. It does not
contain tax advice and does not assume an answer.

---

## 1. What is sold

One thing, sold to consumers, worldwide: **paid interactions inside ShowItGlo**.

The customer first buys **credits** into a prepaid wallet, then spends those
credits on interactions — a like, a boost, a super boost, a power boost, or
backing a side of a debate. Each interaction is delivered instantly and
electronically, with no human involvement. In EU terms this is an
*electronically supplied service*; in Swiss terms an *elektronische
Dienstleistung*.

Key characteristics, all enforced in code:

| | |
|---|---|
| Customer type | B2C. There is no business account, no VAT-number field and no invoice function. Insights API keys exist but are issued free at the `starter` tier — **no B2B revenue is billed today**. |
| Geography | Worldwide. No geo-blocking, no country selection anywhere in the flow. |
| Credits | Closed-loop: spendable only on ShowItGlo services, never transferable between users, never paid out to anyone. The only outflow is a refund to the original card. |
| Top-up bounds | $1.00 – $50.00 per transaction; wallet balance ceiling $500.00; spending ceiling $50.00 per rolling 24 hours. |
| Expiry | None. Balances do not expire and there is no dormancy fee. |
| Currency | Every charge is created in **USD** (`currency: 'usd'`, hard-coded in `src/app/api/v1/wallet/create-intent/route.ts`). Payout currency to the company's bank is a Stripe dashboard setting — please confirm it there. |
| Registration | None. There is no signup; a customer is a signed cookie. An email address is optional and most wallets have none. |

## 2. Where the money flows

```
customer card ──► Stripe (MomentumQ GmbH's Swiss Stripe account) ──► company bank
                    │
                    └─ webhook ──► our database credits the wallet
```

* Stripe is the only payment processor. Cards, Apple Pay, Google Pay and Link
  all arrive through the same Stripe PaymentIntent.
* We never touch card data. Stripe issues the receipt.
* Refunds go back to the original payment method through Stripe, initiated by us
  in the Stripe dashboard. There is no other way money leaves.
* Stripe's own fee (2.9% + $0.30 on card) is netted by Stripe, not invoiced by
  us. The admin dashboard estimates it; it is not a booked figure.

## 3. What data exists per sale

Our `payments` table holds, per successful charge:

| Column | Content |
|---|---|
| `stripe_payment_intent_id` | the Stripe reference — the join key for everything below |
| `user_id` | our internal anonymous UUID |
| `amount_cents`, `currency` | gross amount charged, always `usd` today |
| `status` | `succeeded` / `refunded` / `disputed` |
| `created_at`, `updated_at` | timestamps |

Plus, since August 2026, an `audit_logs` row per top-up with
`action = 'topup_consent'` carrying the user id, timestamp, amount and the
version of the EU withdrawal-consent wording the customer ticked.

**What we do NOT hold, and this is the important part for tax:**

* **No billing address.** We never ask for one and never store one.
* **No customer country.** Nothing in our database says where a payer is.
* **No IP-based geolocation** of payers, and no card BIN or fingerprint (the
  `payments.card_fingerprint` and `risk_score` columns exist in the schema but
  are never written — they are always NULL).
* **No VAT number field**, no B2B flag, no invoice generator.

The only country evidence that exists anywhere is **inside Stripe**: the card's
issuing country, and the billing details Stripe itself collected during
checkout. It is retrievable per charge through the Stripe dashboard or API, but
it is not in our system and not in any report we produce today.

> Engineering note: the EU place-of-supply rules for B2C electronic services
> generally expect two non-contradictory pieces of evidence for the customer's
> location. Today we have at most one, and it lives at Stripe. If the answer to
> §4.2 below is "yes, register", collecting and storing that evidence is a
> product change we need lead time for — it touches the anonymity promise on
> which the whole product is sold, so it needs a decision, not just a ticket.

## 4. Questions we need answered

### 4.1 Switzerland — MWST registration duty

MomentumQ GmbH is Zürich-domiciled. Our understanding is that the registration
threshold is **CHF 100,000 of worldwide turnover**, not Swiss turnover, and that
electronic services to Swiss consumers are supplied where the recipient is.

* At what point does the duty to register bite, measured on which turnover
  figure, and over which window?
* Is the relevant figure **top-ups received** or **credits spent** (see §4.4)?
* Once registered: what rate applies to a Swiss consumer, and does the sale to a
  non-Swiss consumer fall outside Swiss MWST entirely?
* Anything required *before* the threshold is crossed — voluntary registration,
  bookkeeping form, invoice wording?

### 4.2 EU/EEA — OSS non-Union scheme

We are a non-EU supplier selling electronic services to EU consumers. There is
no EU establishment and no intention to create one.

* Once EU B2C supplies begin, is registration under the **non-Union OSS scheme**
  the right route, and from which supply — the first one, or a threshold?
* Which member state should we register in, and what does that cost in ongoing
  compliance?
* What location evidence will be demanded of us in practice, given §3? Is
  Stripe's card-issuing country plus its checkout billing country acceptable as
  the two pieces, or do we need something we are not collecting?
* Prices are shown to the customer as a flat USD amount with no tax line. If EU
  VAT becomes due, does it have to be **added** at checkout or can it be treated
  as **included** in the amount already charged? This decides whether a product
  change is needed and how big it is.

### 4.3 United States — sales tax on digital goods

* Do the current volumes plausibly create economic nexus in any state, and which
  states tax this category of digital good at all?
* Is a prepaid credit for on-platform interactions treated as a digital good, a
  digital service, or as a non-taxable prepayment until redeemed?
* If nexus is reached, is Stripe Tax's state-by-state calculation sufficient, or
  is registration per state unavoidable first?

### 4.4 The central question: taxed at top-up, or at spend?

This is the one that changes the software, so we would like it answered
explicitly.

**The facts.** A top-up buys credits, not any specific service. The customer
does not choose what to buy until later, may spend across many interactions of
different kinds, may never spend at all, and can ask for the unspent balance
back at face value at any time, with no expiry. The service is supplied — and
consumed, publicly and irreversibly — only at the moment of the spend.

**The argument we think follows.** The taxable supply is the *interaction*, not
the top-up. A top-up is a prepayment creating a liability, not revenue; it
becomes revenue when the credit is redeemed. This is also how the product
already accounts for it internally: the admin dashboard splits
`total_topup_dollars` (cash in) from `recognized_spend_dollars` (credits
actually redeemed) and `unspent_float_dollars` (the outstanding liability), and
the wallet ledger records every top-up and every spend as separate rows, so
either basis can be reported exactly, for any period, without estimation.

**What we need from you.** Whether that treatment holds for (a) Swiss MWST, (b)
EU VAT under the single-purpose / multi-purpose voucher distinction — our reading
is that a credit spendable on several differently-natured interactions looks like
a *multi-purpose voucher*, taxed on redemption, but that is exactly the kind of
reading that should not be made by engineers — and (c) US state sales tax. If the
answer differs by jurisdiction, we need to know which basis to report in each,
because the two figures diverge by the outstanding float and that gap is
permanent, not a timing quirk.

Related, and cheap to get wrong: how should the **unspent float** be presented in
the annual accounts, and does an unspent, non-expiring, refundable balance create
any obligation beyond a liability line?

## 5. What Stripe Tax could automate — once registrations exist

Stripe Tax is **not enabled**; no code path sets `automatic_tax`, and no tax
amount is calculated, shown or stored anywhere in the product.

Once actual registrations exist, enabling it in the Stripe dashboard would give
us, without a rewrite:

* rate determination per charge from the location evidence Stripe already holds;
* the calculated tax recorded on the charge and available in exports;
* per-jurisdiction reporting for filings;
* threshold monitoring, which would answer §4.1 and §4.3 continuously instead of
  by periodic panic.

What it would **not** do: register us anywhere, decide the top-up-versus-spend
question, produce invoices, or invent the location evidence we are not
collecting. Registration has to come first, and the answer to §4.4 has to come
before we point Stripe Tax at either the top-up or the spend.

Enabling it also changes what the customer is charged or what we net, so it is a
product decision, not just a dashboard toggle.

## 6. What engineering will do next

Nothing, until §4 is answered. We are not going to guess a tax treatment into
production. When the answers arrive, the likely work is:

1. record a country of supply per payment (needs a product decision about
   anonymity first — see the note in §3);
2. either add a tax line at checkout or document the tax-inclusive treatment;
3. enable Stripe Tax against real registrations;
4. add a period report on the chosen basis — the ledger already supports both.

Questions on any of this: `contact@showitglo.com`.

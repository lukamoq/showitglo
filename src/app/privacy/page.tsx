import React from 'react';
import { Navbar } from '@/components/layout/Navbar';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Lock } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | ShowItGlo',
  description:
    'What ShowItGlo actually stores, where it is processed, how long it is kept, and how to get it deleted. MomentumQ GmbH, Zürich.',
};

/* Sub-processors — every third party that receives data because of ShowItGlo. */
const SUBPROCESSORS: { who: string; what: string; where: string }[] = [
  {
    who: 'Vercel Inc.',
    what: 'Hosting, serverless functions, edge network, server logs, cookieless traffic counts',
    where: 'USA + global edge',
  },
  {
    who: 'Neon Inc.',
    what: 'The Postgres database — every row described on this page lives here',
    where: 'AWS us-east-1, Virginia, USA',
  },
  {
    who: 'Stripe',
    what: 'Card and wallet payments, fraud checks, receipts. Card details go to Stripe, never to us',
    where: 'USA + Ireland',
  },
  {
    who: 'Resend',
    what: 'Sends the two emails that exist: wallet confirmation and wallet recovery',
    where: 'USA',
  },
];

/* Browser storage — first-party only, all of it verifiable in devtools. */
const STORAGE: { key: string; kind: string; life: string; why: string }[] = [
  {
    key: 'sig_uid',
    kind: 'Cookie · HttpOnly · SameSite=Lax · Secure',
    life: '400 days',
    why: 'Your anonymous identity and the wallet attached to it. Signed with HMAC-SHA256 so it cannot be forged. Strictly necessary — without it you have no wallet.',
  },
  {
    key: 'sig_alias',
    kind: 'localStorage',
    life: 'Until you clear it',
    why: 'The display name you last typed, so the next post remembers it.',
  },
  {
    key: 'sig_pending_topup',
    kind: 'localStorage',
    life: 'Until the top-up settles',
    why: 'The id of a top-up in flight, so reloading between “card charged” and “wallet credited” does not lose your money.',
  },
  {
    key: 'sig_withdrawal_consent',
    kind: 'sessionStorage',
    life: 'Until the tab closes',
    why: 'Remembers that you ticked the immediate-delivery box this sitting. Deliberately not persistent — a consent that outlives the visit stops being an act you performed.',
  },
  {
    key: 'showitglo_presence_id',
    kind: 'sessionStorage',
    life: 'Until the tab closes',
    why: 'A random id used by the live-visitor badge. The server ignores it when counting.',
  },
  {
    key: 'sig_admin_key',
    kind: 'sessionStorage',
    life: 'Until the tab closes',
    why: 'Only ever set on /admin, and only for staff. Nothing on the public site touches it.',
  },
];

/* Retention — the numbers are the ones the code actually enforces. */
const RETENTION: { what: string; how_long: string }[] = [
  { what: 'Session cookie (sig_uid)', how_long: '400 days from issue — the browser maximum' },
  { what: 'Your user row, alias and wallet', how_long: 'Until you erase it. Erasure tombstones the row rather than dropping it, so the ledger keeps its foreign keys' },
  { what: 'Posts, demands, counters, backings, rosters', how_long: 'Permanent — this is the public record the arena is for. Erasure removes what you authored (see §9)' },
  { what: 'Payments and the wallet ledger', how_long: 'Retained after erasure, anonymised. Swiss law requires business books to be kept for ten years (Art. 958f CO)' },
  { what: 'Wallet recovery / email confirmation tokens', how_long: 'Valid 30 minutes, single use. The used or expired row is swept about seven days later' },
  { what: 'Presence heartbeats', how_long: 'Counted over a 90-second window, rows deleted about 10 minutes after your last heartbeat' },
  { what: 'Rate-limit counters', how_long: 'Deleted after 25 hours' },
  { what: 'Audit and moderation records', how_long: 'Kept for as long as the account, payment or post they describe' },
  { what: 'Server logs', how_long: "Vercel's retention for our plan. They contain ids, amounts and outcomes — never tokens, cards or unmasked addresses" },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden">
      <Navbar />

      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        {/* Back navigation */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-meta text-ink-3 hover:text-ink font-medium mb-10 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
          <span>Back to Arena Board</span>
        </Link>

        {/* Hero Header */}
        <div className="mb-10">
          <div className="kicker flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
            <span>Swiss FADP &amp; EU GDPR</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-ink mt-2">
            Privacy Policy
          </h1>
          <p className="mt-2 text-meta text-ink-3">
            Version 2.0 · 22 August 2026 · Replaces the version of August 2026, which described accounts,
            profiles and email notifications this product does not have. Operated by MomentumQ GmbH, Zürich.
          </p>
        </div>

        {/* Core principle */}
        <div className="panel rounded-card p-6 sm:p-7">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Lock className="w-4 h-4 text-gold-text" aria-hidden />
            <span>The short version</span>
          </h2>
          <div className="text-[15px] text-ink-2 leading-relaxed mt-3 space-y-3 [&_strong]:text-ink [&_strong]:font-semibold">
            <p>
              There is <strong>no signup</strong>. You arrive, the server hands your browser one signed cookie,
              and that cookie is your entire identity here. We never ask for your name, your address, your age
              or your phone number, and there is nowhere on the site to upload a photo.
            </p>
            <p>
              An <strong>email address is optional</strong>. It exists for exactly two things: getting your wallet
              back if you lose the cookie, and letting Stripe send you a payment receipt. There is no newsletter
              and no notification mail.
            </p>
            <p>
              We sell <strong>aggregate market data</strong>, never individual records. We do not run advertising
              trackers, we do not track you across other sites, and we do not sell, rent or export personal data
              at any price.
            </p>
            <p>
              The uncomfortable part, stated up front: <strong>your data is processed in the United States.</strong>{' '}
              Our host and our database are both US companies, and the database sits in AWS Virginia. Section 6
              says exactly what that means.
            </p>
          </div>
        </div>

        {/* Policy Sections */}
        <div className="text-[15px] text-ink-2 leading-relaxed [&_strong]:text-ink [&_strong]:font-semibold">
          {/* 1. Controller */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            1. Who is responsible
          </h2>
          <p>
            The controller for everything described here, under the Swiss Federal Act on Data Protection (FADP)
            and the EU General Data Protection Regulation (GDPR), is:
          </p>
          <div className="sunken rounded-control p-4 mt-4 text-dense text-ink-2 space-y-0.5">
            <div className="font-semibold text-ink">MomentumQ GmbH</div>
            <div>Leutschenbachstrasse 95, 8050 Zürich, Switzerland</div>
            <div className="tnum">UID: CHE-222.957.350</div>
            <div>
              Email:{' '}
              <a
                href="mailto:contact@showitglo.com"
                className="text-gold-text underline underline-offset-4 hover:text-gold-bright transition-colors"
              >
                contact@showitglo.com
              </a>{' '}
              · legal:{' '}
              <a
                href="mailto:legal@momentumq.com"
                className="text-gold-text underline underline-offset-4 hover:text-gold-bright transition-colors"
              >
                legal@momentumq.com
              </a>
            </div>
          </div>
          <p className="mt-3">
            We have not appointed a Data Protection Officer. At our size neither the FADP nor the GDPR requires
            one, and pretending otherwise would be a nicer sentence than it is a fact. Privacy mail goes to the
            addresses above and is read by a person.
          </p>

          {/* 2. Identity */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            2. How we know who you are (we mostly don&rsquo;t)
          </h2>
          <p>
            On your first request the server creates a row with a random UUID and sets one cookie,{' '}
            <code className="text-dense text-gold-text">sig_uid</code>, containing that UUID and an HMAC-SHA256
            signature. Identity comes from that cookie and nothing else — a user id sent in a request body is
            always ignored, because anyone could type one.
          </p>
          <p className="mt-3">
            To satisfy a database constraint, every new row is given a synthetic placeholder address of the form{' '}
            <code className="text-dense text-gold-text">anon_&lt;uuid&gt;@anon.showitglo.local</code>. It is a
            database artefact, it is not deliverable, and it is not an email address we collected.
          </p>

          {/* 3. What we store */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            3. What we actually store
          </h2>
          <ul className="list-disc pl-5 space-y-2.5 marker:text-ink-3">
            <li>
              <strong>Your session row:</strong> a random UUID, the placeholder address above, an optional alias,
              a role, a status, and timestamps.
            </li>
            <li>
              <strong>The display name you type:</strong> kept in your browser and copied onto each post and each
              backing at the moment you make it. We do not verify it. If you type your real name, your real name
              is now on a public board.
            </li>
            <li>
              <strong>Your wallet and its ledger:</strong> balance in cents, daily cap, lifetime top-ups and
              spend, plus one append-only ledger line for every credit and debit.
            </li>
            <li>
              <strong>Payment records:</strong> the Stripe PaymentIntent id, the amount, the currency, the status
              and the time. <strong>No card number, no expiry, no CVC, no cardholder name ever reaches our
              servers</strong> — the card form is a Stripe-hosted frame and the card goes straight to Stripe. We
              do not create Stripe Customer records for you.
            </li>
            <li>
              <strong>Your email address — only if you gave us one:</strong> stored only after you typed it into
              the &ldquo;secure your wallet&rdquo; card <em>and</em> clicked the confirmation link. Used for wallet
              recovery and for passing to Stripe as the receipt address. Nothing else, ever.
            </li>
            <li>
              <strong>What you publish:</strong> titles, bodies, an optional source link, the display name you
              chose, and whether the backing is shown under that name or as anonymous.
            </li>
            <li>
              <strong>Reports you file:</strong> the post, the reason, your optional note, and your session id —
              the last one so that three complaints from one browser cannot masquerade as three complainants.
            </li>
            <li>
              <strong>Audit and moderation records:</strong> append-only rows for top-ups, refunds, the EU
              withdrawal waiver you tick before paying, moderation decisions and erasures. The audit table has an{' '}
              <code className="text-dense text-gold-text">ip_hash</code> column and every row we write leaves it
              empty.
            </li>
            <li>
              <strong>Presence:</strong> a 32-character key and a last-seen timestamp, so the site can say how
              many people are here. With a session, the key is an HMAC of your session id under a server secret.
              Without one, it is a SHA-256 of your IP address and user-agent. Neither is stored in the clear and
              neither is joined to anything.
            </li>
            <li>
              <strong>Rate-limit counters:</strong> a bucket name, a time window and a count. Most buckets are
              keyed on your session id. Two are not, and we would rather say so: the{' '}
              <strong>wallet-recovery and email-linking endpoints key on your raw IP address</strong>, so for
              those two requests your IP is written to our database and deleted within about 25 hours. On the
              recovery endpoint the per-address limit is keyed on a SHA-256 of the address, so the table never
              accumulates a list of the addresses people typed.
            </li>
            <li>
              <strong>Server logs:</strong> one JSON line per event, containing ids, amounts and outcomes.
              Tokens, secrets, cookies, card fields and email addresses are dropped or masked
              (<code className="text-dense text-gold-text">a***@e***.com</code>) before anything is written.
            </li>
          </ul>
          <p className="mt-4">
            Things we deliberately do <strong>not</strong> collect: passwords, phone numbers, postal addresses,
            date of birth, gender, precise location, contact lists, device fingerprints, and uploaded media —
            no endpoint on this site accepts a file.
          </p>

          {/* 4. Browser storage */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            4. Cookies and browser storage
          </h2>
          <p>
            Everything below is first-party. There is no advertising cookie, no analytics cookie, and nothing
            that reads across sites.
          </p>
          <div className="panel rounded-card overflow-hidden mt-4">
            <div className="px-4 sm:px-5 py-2.5 border-b border-line bg-black/20">
              <span className="micro-label text-ink-3">First-party storage</span>
            </div>
            <dl className="divide-y divide-line">
              {STORAGE.map((row) => (
                <div key={row.key} className="px-4 sm:px-5 py-3.5">
                  <dt className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <code className="text-dense font-semibold text-gold-text">{row.key}</code>
                    <span className="text-meta text-ink-3">{row.kind}</span>
                    <span className="text-meta text-ink-3 tnum">· {row.life}</span>
                  </dt>
                  <dd className="mt-1 text-dense text-ink-2">{row.why}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="mt-4">
            <strong>There is no cookie banner because nothing here needs consent.</strong> Every item above is
            strictly necessary for something you asked for. Our traffic measurement is Vercel Web Analytics,
            which is cookieless — it loads a script and sets no identifier.
          </p>
          <p className="mt-3">
            One exception worth naming: when you open the card form, Stripe.js loads from Stripe and sets its own
            cookies for fraud prevention. That happens only inside the payment flow, only after you have chosen an
            amount, and it is necessary to take a card payment safely. It never fires on an ordinary page view.
          </p>

          {/* 5. Fonts */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            5. Fonts — served from our own domain
          </h2>
          <p>
            The Figtree typeface is <strong>self-hosted</strong>: the font files are bundled at build time and served
            from showitglo.com itself. An ordinary page view makes <strong>no request to Google or any other font
            provider</strong> — no third party learns your IP address just because you looked at a page.
          </p>

          {/* 6. Where it is processed */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            6. Where your data is processed, and the US question
          </h2>
          <p>
            ShowItGlo runs on Vercel, and its database is Neon Postgres hosted on{' '}
            <strong>AWS us-east-1 in Northern Virginia, USA</strong>. So: although we are a Swiss company, your
            posts, your wallet, your ledger and — if you linked one — your email address are stored in the United
            States and processed by US companies. There is no EU-only or Swiss-only deployment of this site.
          </p>
          <div className="panel rounded-card overflow-hidden mt-4">
            <div className="px-4 sm:px-5 py-2.5 border-b border-line bg-black/20">
              <span className="micro-label text-ink-3">Sub-processors</span>
            </div>
            <dl className="divide-y divide-line">
              {SUBPROCESSORS.map((row) => (
                <div
                  key={row.who}
                  className="px-4 sm:px-5 py-3.5 sm:grid sm:grid-cols-[11rem_1fr] sm:gap-4 sm:items-baseline"
                >
                  <dt className="text-dense font-semibold text-ink">{row.who}</dt>
                  <dd className="mt-1 sm:mt-0">
                    <span className="block text-dense text-ink-2">{row.what}</span>
                    <span className="block text-meta text-ink-3">{row.where}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="mt-4">
            <strong>Transfer mechanism.</strong> We rely on the EU/Swiss Standard Contractual Clauses contained in
            each provider&rsquo;s standard data processing agreement, together with the technical measures
            described on this page — TLS in transit, encryption at rest, hashed tokens, masked logs. Several of
            these providers additionally self-certify under the EU&ndash;U.S. and Swiss&ndash;U.S. Data Privacy
            Framework; where a provider is certified, that mechanism applies as well. We are not claiming that a
            certification exists for a provider that does not hold one, and we are not claiming that these clauses
            make US government access impossible. They do not.
          </p>
          <p className="mt-3">
            If US processing is not acceptable to you, the honest advice is to use the site without linking an
            email and without topping up a wallet — an anonymous read of a public board leaves a session row and
            a presence key and nothing else.
          </p>

          {/* 7. Public and permanent */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            7. What is public, and for how long
          </h2>
          <p>
            The arena is a public board, and it is designed to be a permanent one. Anything you publish — a
            stance, a demand, a counter, a debate opinion — is visible to everyone, indexable by search engines,
            and stays up. So does the money attached to it: the amounts backing a post, and the roster of who
            backed it, under the display name chosen at that moment.
          </p>
          <p className="mt-3">
            You control the name, not the fact. Each backing is either shown under your display name or marked{' '}
            <strong>anonymous</strong>, and an anonymous backing still counts toward the post&rsquo;s public
            totals — it just carries no name. Choosing anonymous hides you from other visitors; it does not hide
            you from us, because the row still belongs to your session so that refunds and disputes work.
          </p>
          <p className="mt-3">
            Before you post: this is free text on a public stage. Do not put your own special-category data
            (health, beliefs, politics, sexuality) in it if you do not want it public, and do not put someone
            else&rsquo;s in it at all. Reports of content about private individuals go through the report button
            and are acted on.
          </p>

          {/* 8. Aggregate insights */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            8. The Insights API: statistics, not people
          </h2>
          <p>
            We sell aggregate market data to businesses: how much money is behind a demand aimed at a brand, how
            a debate is split between factions, how many distinct people are behind each side. Those queries
            return sums and counts computed in SQL. <strong>No individual row, session id, alias or address is
            ever exposed through it.</strong>
          </p>
          <p className="mt-3">
            A slice is only published when it has at least <strong>100 distinct backers</strong>. Below that floor
            the row is not returned at all — it is not rounded, padded or noised, it simply does not appear. The
            floor is enforced in the database query itself, not in the response formatting.
          </p>
          <p className="mt-3">
            This is a floor on the <em>aggregate product</em>, not a promise of obscurity for the board. Posts and
            rosters are public from the moment you make them, whatever the backer count.
          </p>

          {/* 9. Erasure */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            9. Erasure: exactly what the button does
          </h2>
          <p>
            Your dashboard has a self-serve erasure control. You type the confirmation word, it posts to{' '}
            <code className="text-dense text-gold-text">/api/v1/me/erase</code>, and it acts on the session
            holding the cookie — never on an id typed into a form. Here is precisely what happens, in one database
            transaction:
          </p>
          <ul className="list-disc pl-5 space-y-2 marker:text-ink-3 mt-4">
            <li>Your user row is marked deleted, your alias becomes <strong>[Deleted User]</strong>, your email address is overwritten with a non-deliverable placeholder, and the profile is set non-public.</li>
            <li>Every post you authored is taken off the board and its author name is replaced with <strong>[Anonymous]</strong>.</li>
            <li>Every roster entry you appear in becomes <strong>Anonymous</strong> and is switched to anonymous visibility.</li>
            <li>Every interaction record loses its payer name.</li>
            <li>Any Insights API keys you hold are revoked immediately.</li>
            <li>One audit line records that an erasure happened, and your session cookie is cleared.</li>
          </ul>
          <p className="mt-4">
            <strong>What survives, and why.</strong> The financial rows — payments, ledger lines, interaction
            amounts and timestamps — are kept, tied to a user row that no longer identifies anyone. They are
            accounting books, and Swiss law requires them to be kept (Art. 958f CO). The totals your backing
            contributed to a post also stay, because they are now part of that post&rsquo;s public history rather
            than yours.
          </p>
          <p className="mt-3">
            <strong>Two honest limits.</strong> Free-text opinions posted into a debate are stored with the
            display name you typed and no link back to your session, so automated erasure cannot find them —
            email us with the details and we will remove them by hand. And a used or expired wallet-recovery token
            row can still carry the address it was sent to for up to seven days before it is swept.
          </p>
          <p className="mt-3">
            Erasure is irreversible and it takes the wallet with it. Spend or ask about your balance first.
          </p>

          {/* 10. Rights */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            10. Your rights
          </h2>
          <ul className="list-disc pl-5 space-y-2 marker:text-ink-3">
            <li><strong>Erasure</strong> — self-serve, in your dashboard, described above.</li>
            <li><strong>Access and portability</strong> — <strong>on request</strong>. There is no export button and we are not going to imply there is one. Your dashboard already shows your posts, boosts, ledger and notifications; for a machine-readable copy of everything held against your session, email us and we will produce it.</li>
            <li><strong>Rectification</strong> — on request. Aliases and display names can be corrected; the amount and time of a settled payment cannot, because it is a book of record.</li>
            <li><strong>Restriction and objection</strong> — on request, including objection to any processing we base on legitimate interests.</li>
            <li><strong>Withdrawing consent</strong> — if you linked an email, ask us to unlink it. Withdrawal does not undo anything done before it.</li>
          </ul>
          <p className="mt-4">
            One practical caveat that follows from having no accounts: we can only act on a request we can tie to
            actual data. That means either sending it from the address that secures a wallet, or using the
            self-serve control from the browser holding the cookie. If you write from an address we have never
            seen and cannot identify a session, we will have nothing to look up — that is a consequence of
            anonymity, not a refusal.
          </p>
          <p className="mt-3">
            We answer within 30 days. Nothing here costs anything.
          </p>

          {/* 11. Legal bases */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            11. Legal bases
          </h2>
          <ul className="list-disc pl-5 space-y-2 marker:text-ink-3">
            <li><strong>Performance of a contract</strong> (Art. 6(1)(b) GDPR) — running the board, the wallet, top-ups, and publishing what you publish.</li>
            <li><strong>Legal obligation</strong> (Art. 6(1)(c)) — keeping payment and accounting records, and acting on reports of illegal content.</li>
            <li><strong>Legitimate interests</strong> (Art. 6(1)(f)) — rate limiting, fraud and abuse prevention, counting live visitors, cookieless traffic measurement, and serving the typeface. In each case the data is minimal, short-lived and never used to profile anyone.</li>
            <li><strong>Consent</strong> (Art. 6(1)(a)) — linking an email address, which you can withdraw.</li>
          </ul>
          <p className="mt-3">
            Under the Swiss FADP the same processing rests on the contract with you, our overriding private
            interest in a secure and functioning service, and your consent for the optional address.
          </p>

          {/* 12. Automated decisions */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            12. Automated processing
          </h2>
          <p>
            One automated filter runs before a post is published: a rule-based content check that can refuse to
            publish text it flags. It runs entirely on our servers, sends nothing to any third party, and looks
            only at the words in the post. It is not profiling, it does not look at who you are, and it produces
            no legal effect — but it can stop your post, so if it is wrong, email us and a person will look at it.
          </p>
          <p className="mt-3">
            Ranking is arithmetic on money and time, published in the Terms. It does not read your data to decide
            anything about you.
          </p>

          {/* 13. Security */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            13. Security
          </h2>
          <p>
            HTTPS everywhere with HSTS. Session cookies are HttpOnly, SameSite=Lax, Secure in production, and
            HMAC-signed. Recovery and confirmation links are 32 random bytes, stored only as a SHA-256 hash, valid
            for 30 minutes and single-use — a database leak cannot be replayed as a login. Insights API keys are
            stored the same way. Mutations are origin-checked. The endpoints that could otherwise be used to test
            whether an address has a wallet return the same sentence in every case, on purpose.
          </p>

          {/* 14. Complaints */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            14. Complaints and changes
          </h2>
          <p>
            If you think we have handled your data badly, tell us first —{' '}
            <a
              href="mailto:contact@showitglo.com"
              className="text-gold-text underline underline-offset-4 hover:text-gold-bright transition-colors"
            >
              contact@showitglo.com
            </a>{' '}
            or{' '}
            <a
              href="mailto:legal@momentumq.com"
              className="text-gold-text underline underline-offset-4 hover:text-gold-bright transition-colors"
            >
              legal@momentumq.com
            </a>
            , or by post to the Zürich address in §1. You can also complain directly to a supervisory authority:
            in Switzerland the Federal Data Protection and Information Commissioner (EDÖB), Feldeggweg 1, 3003
            Bern; in the EU/EEA, the authority where you live or work.
          </p>
          <p className="mt-3">
            When this policy changes materially we bump the version at the top of the page and say what changed.
            This version is 2.0, dated 22 August 2026.
          </p>

          {/* Retention table */}
          <h2 className="text-xl font-bold tracking-tight text-ink mt-10 mb-3">
            Appendix: retention at a glance
          </h2>
          <div className="panel rounded-card overflow-hidden">
            <div className="px-4 sm:px-5 py-2.5 border-b border-line bg-black/20">
              <span className="micro-label text-ink-3">How long we keep things</span>
            </div>
            <dl className="divide-y divide-line">
              {RETENTION.map((row) => (
                <div
                  key={row.what}
                  className="px-4 sm:px-5 py-3.5 sm:grid sm:grid-cols-[14rem_1fr] sm:gap-4 sm:items-baseline"
                >
                  <dt className="text-dense font-semibold text-ink">{row.what}</dt>
                  <dd className="mt-1 sm:mt-0 text-dense text-ink-2">{row.how_long}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="mt-4 text-meta text-ink-3">
            The short-lived sweeps above (presence, rate limits, spent tokens) run opportunistically on live
            traffic rather than on a timer, so on a quiet day a row can outlive its window by a little before it
            is cleared.
          </p>
        </div>
      </main>
    </div>
  );
}

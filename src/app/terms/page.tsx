import React from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Scale } from 'lucide-react';
import type { Metadata } from 'next';

import { Navbar } from '@/components/layout/Navbar';
import { WITHDRAWAL_CONSENT_TEXT } from '@/lib/consent';
import { FIRST_LIGHT_MINUTES } from '@/lib/firstLight';
import { TOPUP_MAX_CENTS, TOPUP_MIN_CENTS, WALLET_MAX_CENTS } from '@/lib/pricing';
import { formatCents } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Terms of Service | ShowItGlo',
  description:
    'Terms of Service for ShowItGlo, operated by MomentumQ GmbH, Zurich, Switzerland — prepaid credits, refunds, EU withdrawal rights, content rules and liability.',
};

const EFFECTIVE_DATE = '22 August 2026';
const VERSION = 'v0.1 (draft)';

/** The daily spend ceiling on a wallet — `wallets.daily_cap_cents`. */
const DAILY_SPEND_CAP_CENTS = 5000;

const SECTIONS: { id: string; title: string }[] = [
  { id: 'who-we-are', title: '1. Who we are, and what acceptance means' },
  { id: 'the-service', title: '2. The service, and what credits are' },
  { id: 'first-light', title: '3. First Light, ranking, and the prices we show' },
  { id: 'spending-is-final', title: '4. Spending is immediate and final' },
  { id: 'no-refund-on-outbid', title: '5. Being outbid is not a defect' },
  { id: 'unspent-credits', title: '6. Unspent credits are refundable' },
  { id: 'eu-withdrawal', title: '7. EU/EEA consumers: your 14-day right' },
  { id: 'wallet-loss', title: '8. Your wallet is a cookie' },
  { id: 'content-rules', title: '9. What you may publish, and moderation' },
  { id: 'payments', title: '10. Payments, receipts and chargebacks' },
  { id: 'liability', title: '11. Liability, governing law and changes' },
  { id: 'contact', title: '12. Contact and version' },
];

function Heading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-24 text-xl font-bold tracking-tight text-ink mt-10 mb-3">
      {children}
    </h2>
  );
}

export default function TermsPage() {
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

        {/* Draft notice — the first thing anyone reads, deliberately */}
        <div className="rounded-card border border-gold/30 bg-gold/[0.07] p-4 sm:p-5">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gold-text" aria-hidden />
            <div className="text-dense text-ink-2">
              <strong className="block font-semibold text-ink">
                DRAFT — under review by counsel. Contact: legal@momentumq.com
              </strong>
              <span className="mt-1 block">
                This is a working draft written by the ShowItGlo team, not yet reviewed by a
                qualified lawyer. It describes how the service actually behaves today and is
                published so nothing about paying us is hidden. Where it turns out to conflict with
                mandatory consumer law, the law wins.
              </span>
            </div>
          </div>
        </div>

        {/* Hero header */}
        <div className="mt-10 mb-10">
          <div className="kicker flex items-center gap-2">
            <Scale className="w-3.5 h-3.5" aria-hidden />
            <span>Terms of Service · Swiss Law</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-ink mt-2">Terms of Service</h1>
          <p className="mt-2 text-meta text-ink-3">
            {VERSION} · Effective {EFFECTIVE_DATE} · Operated by MomentumQ GmbH, Zurich, Switzerland.
          </p>
        </div>

        {/* Contents */}
        <nav aria-label="Contents" className="panel rounded-card p-4 sm:p-5">
          <span className="micro-label block text-ink-3">On this page</span>
          <ol className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-dense text-ink-3 hover:text-ink transition-colors"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="text-[15px] text-ink-2 leading-relaxed [&_strong]:text-ink [&_strong]:font-semibold">
          {/* ---------------------------------------------------------------- */}
          <Heading id="who-we-are">1. Who we are, and what acceptance means</Heading>
          <p>
            ShowItGlo is operated by MomentumQ GmbH. &ldquo;We&rdquo; and &ldquo;us&rdquo; mean that
            company; &ldquo;you&rdquo; means the person using the site.
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
              </a>
            </div>
          </div>
          <p className="mt-4">
            <strong>Using ShowItGlo means accepting these terms.</strong> There is no signup form and
            no account to create, so there is no separate moment where you tick &ldquo;I
            agree&rdquo;. Reading a board, publishing, and spending credits are each acceptance.
          </p>
          <p className="mt-3">
            <strong>You must be at least 18 years old.</strong> If you are not, do not use ShowItGlo
            and do not pay us anything. We have no way to verify age, which is why this is stated as
            a condition rather than as a control.
          </p>

          {/* ---------------------------------------------------------------- */}
          <Heading id="the-service">2. The service, and what credits are</Heading>
          <p>
            ShowItGlo is a public arena for opinions and consumer demands. Anyone can publish one,
            and anyone can raise how high it ranks — either by tapping, which is free and capped per
            post per day, or by paying small amounts. Ranking is arithmetic, not editorial: a score
            built from what has been put into a post, whether tapped or paid, decaying over time on
            a fixed half-life. Free taps move the score only; they are not money, they are never
            added to the amount a post has raised, and they give no claim to a refund. We do not
            curate the boards and we do not sell placement.
          </p>
          <p className="mt-3">
            To pay for an interaction you first load <strong>credits</strong> into a prepaid wallet.
            Credits are closed-loop: they exist to be spent here and nowhere else. Specifically:
          </p>
          <ul className="list-disc pl-5 space-y-2 marker:text-ink-3 mt-3">
            <li>
              Credits are <strong>not money</strong>, not a deposit, not e-money and not a payment
              instrument. They are prepayment for services we supply ourselves.
            </li>
            <li>
              Credits can be spent <strong>only inside ShowItGlo</strong>, on ShowItGlo&rsquo;s own
              paid interactions. No merchant, person or platform outside ShowItGlo accepts them.
            </li>
            <li>
              Credits are <strong>not transferable</strong>. You cannot send them to another user,
              sell them, gift them, or pay anyone with them.
            </li>
            <li>
              Credits pay <strong>no interest</strong> and <strong>never expire</strong>. There is no
              dormancy fee and no clock running against your balance.
            </li>
          </ul>
          <p className="mt-4">These are the limits the software enforces today:</p>
          <div className="sunken rounded-control p-4 mt-3 text-dense text-ink-2 space-y-1.5">
            <div>
              <span className="text-ink font-semibold tnum">
                {formatCents(TOPUP_MIN_CENTS)} – {formatCents(TOPUP_MAX_CENTS)}
              </span>{' '}
              per top-up transaction.
            </div>
            <div>
              <span className="text-ink font-semibold tnum">{formatCents(WALLET_MAX_CENTS)}</span>{' '}
              maximum wallet balance. Top-ups you have started but not finished count against this
              ceiling for an hour.
            </div>
            <div>
              <span className="text-ink font-semibold tnum">
                {formatCents(DAILY_SPEND_CAP_CENTS)}
              </span>{' '}
              maximum spend in any rolling 24 hours.
            </div>
            <div>All amounts are in US dollars.</div>
          </div>
          <p className="mt-4">
            We may change these limits for the service as a whole, or lower them for an individual
            wallet where we have a fraud or abuse concern. Lowering a limit never takes credits away
            from you; it only restricts what you can add or spend next.
          </p>

          {/* ---------------------------------------------------------------- */}
          <Heading id="first-light">3. First Light, ranking, and the prices we show</Heading>
          <p>
            Publishing on ShowItGlo is free and always has been. Because the main board is ordered by
            money, a post nobody has backed would otherwise open at the bottom of it, so every new
            post is also carried on <strong>First Light</strong> &mdash; a separate rail ordered by
            time alone.
          </p>
          <ul className="list-disc pl-5 space-y-2 marker:text-ink-3 mt-3">
            <li>
              First Light lasts <strong className="tnum">{FIRST_LIGHT_MINUTES} minutes</strong> from
              publication, for every post, with no payment and no condition attached. It cannot be
              bought, extended, shortened or skipped, by you or by anyone else. We do not sell
              placement on it and we do not accept payment to change its order.
            </li>
            <li>
              The countdown you see is the real one. The end of the window is written when the post
              is created and is what the rail itself queries &mdash; it is not a display device to
              hurry you along, and nothing about your post changes if you ignore it.
            </li>
            <li>
              When the window closes <strong>nothing is deleted, hidden or unpublished</strong>. The
              post keeps its own page, stays in search and on the board, and simply holds whatever
              position its backing has earned it.
            </li>
          </ul>

          <p className="mt-4">
            <strong>Ranking is arithmetic, and only arithmetic.</strong> A post&rsquo;s position is a
            published formula over what has been paid into it, decaying on a fixed half-life. There
            is no element of chance anywhere in it: no draw, no lottery, no random multiplier, no
            jackpot and no prize pool. Nothing you spend is ever staked, returned, matched, or paid
            out to you or to anyone else &mdash; it buys a score change and nothing more. ShowItGlo
            is not a game of chance and is not gambling, and we will not add a mechanic that would
            make it one.
          </p>

          <p className="mt-4">
            <strong>The prices we quote are live estimates, not offers.</strong> In places we show
            what it would cost, at that instant, to move a post past a given position. Please read
            those numbers for what they are:
          </p>
          <ul className="list-disc pl-5 space-y-2 marker:text-ink-3 mt-3">
            <li>
              They are computed from the board as it stands at that second and are labelled with the
              time they were computed. They are <strong>not reserved</strong>: nothing is held for
              you, and no price is locked by looking at it.
            </li>
            <li>
              They move whenever anyone else backs anything, which can happen between the moment a
              figure is displayed and the moment you confirm. A figure that was accurate when shown
              may buy a different position by the time it settles.
            </li>
            <li>
              What you are charged is always the published price of the interaction you chose, set by
              our server &mdash; never a number your browser sent us. <strong>You are buying the
              interaction, not the position.</strong> No amount of spending buys a guaranteed rank,
              a guaranteed audience, a guaranteed reply, or any particular outcome.
            </li>
          </ul>
          <p className="mt-4">
            The one exception is a <strong>power boost</strong>, which is priced by a quote we issue
            and hold for the period stated on it. Everything else is priced at the moment it settles.
          </p>

          {/* ---------------------------------------------------------------- */}
          <Heading id="spending-is-final">4. Spending is immediate and final</Heading>
          <p>
            Every paid interaction — a like, a boost, a super boost, a power boost, or backing a side
            of a debate — is performed the instant you confirm it. Your credits are debited, the
            post&rsquo;s score changes, the board re-ranks, and the interaction becomes part of a
            public record. <strong>There is no undo</strong>, and there is nothing left for us to
            deliver afterwards.
          </p>
          <p className="mt-3">
            We intend that public record to be permanent. Honestly stated, permanence has three
            limits, and all three are outside your control:
          </p>
          <ul className="list-disc pl-5 space-y-2 marker:text-ink-3 mt-3">
            <li>
              <strong>Moderation.</strong> Content that breaks the rules in section 8 is removed, and
              the score bought for it goes with it.
            </li>
            <li>
              <strong>Erasure requests.</strong> If someone exercises their right to erasure under
              the GDPR or the Swiss FADP, their identifiers are scrubbed and their posts are
              tombstoned. A valid erasure request overrides our permanence — the law is not
              negotiable by a term of ours.
            </li>
            <li>
              <strong>Legal orders.</strong> A court or competent authority can require removal.
            </li>
          </ul>
          <p className="mt-4">
            Accounting records of what was paid are kept for as long as tax and company law require,
            in anonymised form once an erasure request has been carried out.
          </p>

          {/* ---------------------------------------------------------------- */}
          <Heading id="no-refund-on-outbid">5. Being outbid is not a defect</Heading>
          <p>
            When you spend, <strong>you buy score at that moment</strong>. You are not buying a rank,
            and you are not buying a rank for a period of time.
          </p>
          <p className="mt-3">
            Someone can outspend you a minute later and push you down. Scores also decay with time by
            design, so a post that nobody backs slides regardless of what anyone else does. Both are
            the market working exactly as described. Therefore:
          </p>
          <ul className="list-disc pl-5 space-y-2 marker:text-ink-3 mt-3">
            <li>We do not refund a spend because your post was overtaken.</li>
            <li>We do not refund a spend because decay reduced your score.</li>
            <li>
              We do not guarantee any position, any duration at a position, any audience, any traffic
              or any commercial result.
            </li>
          </ul>
          <p className="mt-4">
            If holding a position is what you actually want, ShowItGlo is the wrong product and you
            should not top up.
          </p>

          {/* ---------------------------------------------------------------- */}
          <Heading id="unspent-credits">6. Unspent credits are refundable</Heading>
          <p>
            Credits you have <strong>not spent</strong> are yours, and you can ask for them back at
            face value at any time: {formatCents(100)} of unspent credit is {formatCents(100)}{' '}
            returned. How it works:
          </p>
          <ul className="list-disc pl-5 space-y-2 marker:text-ink-3 mt-3">
            <li>
              Email{' '}
              <a
                href="mailto:contact@showitglo.com"
                className="text-gold-text underline underline-offset-4 hover:text-gold-bright transition-colors"
              >
                contact@showitglo.com
              </a>{' '}
              with the payment reference from your Stripe receipt, or from the email address linked
              to the wallet.
            </li>
            <li>
              Refunds are paid back to the <strong>original payment method</strong> through Stripe.
              We cannot send the money anywhere else — not to a different card, not to a bank
              account, not to another person. That restriction is deliberate: it is part of what
              keeps ShowItGlo out of the money-transfer business.
            </li>
            <li>
              We refund <strong>unspent balance only</strong>. Credits already spent bought a service
              that was delivered in full at the moment you spent them.
            </li>
            <li>
              Requests above {formatCents(10000)} go through a manual review before payout, and we
              may ask you to evidence the payments being refunded.
            </li>
            <li>
              Balances never expire, so there is no deadline for asking and no penalty for asking
              late.
            </li>
            <li>
              A refund reduces your balance by the amount refunded. If you have already spent part of
              a payment we are reversing, only what is still in the wallet can be taken back.
            </li>
          </ul>
          <p className="mt-4">
            We aim to process refund requests within 10 working days. Stripe and your bank then take
            their own time to return the money to your statement.
          </p>

          {/* ---------------------------------------------------------------- */}
          <Heading id="eu-withdrawal">7. EU/EEA consumers: your 14-day right</Heading>
          <p>
            If you are a consumer in the EU or EEA, you normally have <strong>14 days</strong> to
            withdraw from a distance contract for digital content. Before you pay, we ask you to tick
            this box:
          </p>
          <div className="sunken rounded-control p-4 mt-3 text-dense text-ink-2 italic">
            &ldquo;{WITHDRAWAL_CONSENT_TEXT}&rdquo;
          </div>
          <p className="mt-4">
            That tick does two things and nothing more: it is your{' '}
            <strong>express request for immediate delivery</strong> of your credits, and your{' '}
            <strong>acknowledgement</strong> that the 14-day right stops applying to credits you
            actually spend — because at that instant the service has been fully performed.
          </p>
          <p className="mt-3">
            <strong>It does not touch your unspent credits.</strong> Unspent credits remain
            refundable at face value under section 5, with no 14-day deadline and no reason required.
            That is more than the withdrawal right would give you, and we would rather say so here
            than leave you to work it out.
          </p>
          <p className="mt-3">
            To withdraw within 14 days, email{' '}
            <a
              href="mailto:contact@showitglo.com"
              className="text-gold-text underline underline-offset-4 hover:text-gold-bright transition-colors"
            >
              contact@showitglo.com
            </a>
            . No form and no reason are needed. We record the tick, its wording and its timestamp
            against your payment, so a later question about what you agreed to has a factual answer.
          </p>

          {/* ---------------------------------------------------------------- */}
          <Heading id="wallet-loss">8. Your wallet is a cookie</Heading>
          <p>
            ShowItGlo has no signup. Your identity is a random, signed identifier stored in a cookie
            named <code className="text-dense text-gold-text">sig_uid</code>, valid for up to 400
            days. <strong>That cookie is the only key to your wallet.</strong>
          </p>
          <ul className="list-disc pl-5 space-y-2 marker:text-ink-3 mt-3">
            <li>
              Clear your cookies, browse privately, or move to another browser or device, and you
              arrive in a new, empty wallet. The old one still exists — we simply have no way to know
              it was yours.
            </li>
            <li>
              You can <strong>link an email address</strong> to your wallet. Once linked, we can send
              a recovery link to that address that puts you back into it. This is the only recovery
              mechanism there is, and using it is optional.
            </li>
            <li>
              If no address is linked and the cookie is gone, that wallet is{' '}
              <strong>unrecoverable</strong>. Not by support, not by us, and not by showing a
              receipt: a receipt proves a payment was made, not that the person holding it is the
              person who made it.
            </li>
          </ul>
          <p className="mt-4">
            By choosing not to link an address, you accept that risk. Anonymity and recoverability
            pull against each other here, and we would rather be blunt about the trade than let you
            discover it after losing a balance.
          </p>

          {/* ---------------------------------------------------------------- */}
          <Heading id="content-rules">9. What you may publish, and moderation</Heading>
          <p>ShowItGlo is for stating opinions and demands. It is not for the following:</p>
          <ul className="list-disc pl-5 space-y-2 marker:text-ink-3 mt-3">
            <li>
              <strong>Illegal content</strong> of any kind, including anything sexualising minors,
              content facilitating crime, and material that infringes someone else&rsquo;s rights.
            </li>
            <li>
              <strong>Harassment or targeting of private individuals.</strong> Companies,
              institutions, public bodies and public figures acting in their public role may be
              criticised — factually, in your own words, and about what they did. Private people are
              not fair game.
            </li>
            <li>
              <strong>Political campaign advertising:</strong> asking people to vote for a candidate
              or a ballot measure, or soliciting campaign donations. Political opinions themselves
              are welcome; campaigning is not, at least for now.
            </li>
            <li>
              <strong>Promotion of adult content, gambling, weapons or pharmaceuticals.</strong>
            </li>
            <li>
              <strong>Covert brand spending.</strong> If you post or back on behalf of a company or a
              client, say so. Paying to move a board while pretending to be an ordinary member of the
              public is the one thing that would make every number here meaningless.
            </li>
            <li>
              <strong>Impersonation, spam and deceptive financial promotion</strong> — fake
              endorsements, guaranteed-return schemes, and the rest of that genre.
            </li>
          </ul>
          <p className="mt-4">Moderation runs in three layers:</p>
          <ul className="list-disc pl-5 space-y-2 marker:text-ink-3 mt-3">
            <li>
              An <strong>automated gate</strong> screens every post before it is published and blocks
              the clearest violations outright.
            </li>
            <li>
              <strong>Reports from users.</strong> A post reported by three different people is
              escalated for review automatically.
            </li>
            <li>
              <strong>Human review</strong>, which can approve, reject, remove or restore a post.
              Removed posts leave a visible tombstone rather than disappearing silently, so the board
              does not quietly rewrite its own history.
            </li>
          </ul>
          <p className="mt-4">How moderation interacts with money:</p>
          <ul className="list-disc pl-5 space-y-2 marker:text-ink-3 mt-3">
            <li>
              If a post is removed because <strong>its author broke these rules</strong>, the credits
              spent on it are not refunded — including credits other people spent backing it. The
              interaction was delivered; what the author did with the post afterwards is not a defect
              in our service.
            </li>
            <li>
              If we remove content <strong>by our own mistake</strong>, or a fault on our side
              destroys the effect of a spend, we put it right: we restore the post where we can, and
              refund the credits involved where we cannot.
            </li>
          </ul>
          <p className="mt-4">
            We can also suspend or freeze a wallet where we have concrete grounds to suspect fraud,
            payment abuse or coordinated manipulation. A freeze stops top-ups and spending; it does
            not confiscate a balance, and an unspent balance stays refundable under section 5 once
            the matter is settled.
          </p>

          {/* ---------------------------------------------------------------- */}
          <Heading id="payments">10. Payments, receipts and chargebacks</Heading>
          <p>
            Card payments are processed by <strong>Stripe</strong>. Card details travel from your
            browser to Stripe and never reach our servers, so we cannot see, store or leak them.
            Stripe issues the receipt; the only thing we decide is the address it goes to, and an
            address you have linked to your wallet always wins over one typed into the payment form.
          </p>
          <p className="mt-3">
            <strong>Chargebacks.</strong> If you dispute a ShowItGlo charge with your bank, we freeze
            the wallet while the dispute runs. A frozen wallet cannot top up and cannot spend, and
            the disputed payment is reversed out of the balance up to whatever is left in it. If the
            dispute is decided in your favour, that ends the matter. If it is decided in ours, email
            us and we will unfreeze the wallet.
          </p>
          <p className="mt-3">
            If you think a charge is wrong, <strong>email us before calling your bank</strong>. It is
            faster, it costs you nothing, and it does not freeze your wallet.
          </p>

          {/* ---------------------------------------------------------------- */}
          <Heading id="liability">11. Liability, governing law and changes</Heading>
          <p>
            We run ShowItGlo with reasonable care, but we do not promise that it will be
            uninterrupted or free of errors, and we do not promise any ranking, audience or outcome.
          </p>
          <p className="mt-3">
            We are liable without limit for damage caused intentionally or through gross negligence,
            for injury to life, body or health, and in every other case where Swiss law does not
            allow liability to be limited. Beyond that, and as far as Swiss law permits, our total
            liability for any claim connected with ShowItGlo is limited to the amount you paid us in
            the twelve months before the claim arose.
          </p>
          <p className="mt-3">
            <strong>We are not liable for what other users publish.</strong> Opinions and demands on
            the boards belong to the people who wrote them.
          </p>
          <p className="mt-3">
            <strong>Governing law and forum.</strong> Swiss law applies, and the place of
            jurisdiction is Zürich, Switzerland. If you are a consumer resident in the EU/EEA — or
            anywhere whose consumer law gives you mandatory protections or a mandatory forum — those
            protections continue to apply and nothing in these terms removes them or forces you to
            litigate somewhere else.
          </p>
          <p className="mt-3">
            <strong>Changes.</strong> We may update these terms. For material changes we will post a
            notice on the site at least 14 days before they take effect, and email wallets with a
            linked address. Changes never apply retroactively to credits already spent. If you do not
            accept a change, ask for a refund of your unspent balance under section 5 before it takes
            effect.
          </p>
          <p className="mt-3">
            If any clause here turns out to be unenforceable, the rest stays in force.
          </p>

          {/* ---------------------------------------------------------------- */}
          <Heading id="contact">12. Contact and version</Heading>
          <div className="sunken rounded-control p-4 mt-3 text-dense text-ink-2 space-y-1.5">
            <div>
              <span className="micro-label block text-ink-3">Support, refunds, withdrawal</span>
              <a
                href="mailto:contact@showitglo.com"
                className="text-gold-text underline underline-offset-4 hover:text-gold-bright transition-colors"
              >
                contact@showitglo.com
              </a>
            </div>
            <div>
              <span className="micro-label block text-ink-3">Legal enquiries and notices</span>
              <a
                href="mailto:legal@momentumq.com"
                className="text-gold-text underline underline-offset-4 hover:text-gold-bright transition-colors"
              >
                legal@momentumq.com
              </a>
            </div>
            <div>
              <span className="micro-label block text-ink-3">Version</span>
              <span className="tnum">
                {VERSION} · effective {EFFECTIVE_DATE}
              </span>
            </div>
          </div>
          <p className="mt-4 text-meta text-ink-3">
            Related: <Link href="/privacy" className="hover:text-ink transition-colors underline underline-offset-4">Privacy Policy</Link>{' '}
            ·{' '}
            <Link href="/impressum" className="hover:text-ink transition-colors underline underline-offset-4">
              Impressum
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

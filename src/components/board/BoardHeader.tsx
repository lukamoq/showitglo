"use client";

import React from "react";
import { Swords } from "lucide-react";
import { formatCents, formatUSD } from "@/lib/utils";
import { Category, RankedPostView } from "@/lib/types";
import { LiveVisitorsBadge } from "../live/LiveVisitorsBadge";

interface BoardHeaderProps {
  category?: Category;
  topPrice: number;
  totalVolume: number;
  totalBoosts: number;
  distinctPayers: number;
  /** Top of the live board. The hero shows the first few instead of describing them. */
  leaders?: RankedPostView[];
  /** True while the first board fetch is in flight — reserves the card's space. */
  isLoading?: boolean;
  /** True when the board could not be loaded at all. */
  loadFailed?: boolean;
  onOpenCreate?: () => void;
  onOpenWar?: () => void;
}

export const BoardHeader: React.FC<BoardHeaderProps> = ({
  category,
  topPrice,
  totalVolume,
  distinctPayers,
  leaders = [],
  isLoading = false,
  loadFailed = false,
  onOpenCreate,
  onOpenWar,
}) => {
  const incrementStrategy =
    category?.increment_strategy === "percent"
      ? "+10% (floor $0.50)"
      : category?.increment_strategy || "Percent";

  /**
   * Three numbers, not four. "Decay half-life 168h" is precise and completely
   * opaque to someone who arrived ten seconds ago, and it was occupying a
   * quarter of the most valuable space on the page; it still appears on the
   * board itself, where a reader has the context to want it.
   */
  /* The card holds its place while the board loads: popping it in afterwards
     shoves the whole page down and is exactly the jolt that makes a first-time
     visitor lose their place. */
  const showLeaderCard = isLoading || leaders.length > 0;

  const stats = [
    {
      label: "Price to beat #1",
      value: formatUSD(topPrice),
      foot: incrementStrategy,
    },
    {
      label: "Backing the board",
      value: formatUSD(totalVolume),
      foot: "spent by readers, not paid out",
    },
    {
      label: "Backers",
      value: distinctPayers.toLocaleString(),
      foot: "wallets behind stances",
    },
  ];

  return (
    <div className="w-full pt-8 pb-8 sm:pt-14 sm:pb-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* One column when there is no card beside the thesis, so an empty
            board does not leave the headline stranded in a 1.4fr well. */}
        <div
          className={`grid grid-cols-1 gap-8 lg:gap-14 items-start ${
            showLeaderCard ? "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : ""
          }`}
        >
          {/* Left — the thesis */}
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <LiveVisitorsBadge variant="compact" />
              <span className="kicker">Public opinion board</span>
            </div>

            {/* Says what the site is, in the words a stranger would use.
                The previous headline ("The public stage where opinions fight
                for rank") described a metaphor, not a mechanism — and a
                metaphor is exactly what a reader discounts when they are
                deciding whether a site that asks for money is real. */}
            <h1 className="display-statement text-ink mt-5 max-w-[19ch]">
              Opinions, ranked by what people pay to back them.
            </h1>

            <p className="lead mt-5">
              Anyone can post a stance. A like costs{" "}
              <span className="tnum">1¢</span>, a boost{" "}
              <span className="tnum">10¢</span>, and the total spent sets the
              order of the board. Nothing is paid out to the people posting: the
              money buys rank, and whatever you have not spent is refundable at
              face value.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onOpenCreate}
                className="btn btn-gold"
              >
                Post a stance — 1¢
              </button>
              {onOpenWar && (
                <button
                  type="button"
                  onClick={onOpenWar}
                  className="btn btn-ghost"
                >
                  <Swords className="h-4 w-4" aria-hidden />
                  <span>Post a war</span>
                </button>
              )}
              <a href="#board-table" className="btn btn-ghost">
                See the full board
              </a>
            </div>

            {/* Every line here is already true and already written down in the
                terms — it was just buried three clicks away, which is the one
                place it cannot do any work. A site that asks for money and
                will not say who runs it or what happens to unspent credit
                reads as a scam whether or not it is one. */}
            <ul className="mt-7 flex flex-col gap-2 text-meta text-ink-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
              <li>
                <a
                  href="/terms#unspent-credits"
                  className="hover:text-ink transition-colors"
                >
                  Unspent credit refunded at face value
                </a>
              </li>
              <li className="hidden sm:block" aria-hidden>
                <span className="h-3 w-px bg-line-strong block" />
              </li>
              <li>Balances never expire</li>
              <li className="hidden sm:block" aria-hidden>
                <span className="h-3 w-px bg-line-strong block" />
              </li>
              <li>
                <a
                  href="/impressum"
                  className="hover:text-ink transition-colors"
                >
                  MomentumQ GmbH, Zurich
                </a>
              </li>
            </ul>
          </div>

          {/* Right — what people are actually saying.
              This column used to hold four abstract market metrics. A visitor
              who has been here ten seconds cannot tell what the site is from
              "$297.00 total backing"; they can tell instantly from three real
              stances with money against them. On mobile it sits directly under
              the fold-height headline instead of a screenful further down. */}
          {showLeaderCard && (
            <div className="panel rounded-card overflow-hidden w-full">
              <div className="px-4 py-2.5 border-b border-line flex items-center justify-between gap-3">
                <span className="kicker">Top of the board</span>
              </div>

              {isLoading ? (
                <div className="space-y-3 p-4" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="skeleton h-12 w-full rounded-control"
                    />
                  ))}
                </div>
              ) : (
                <ol>
                  {leaders.map((post, i) => (
                    <li
                      key={post.id}
                      className={i > 0 ? "border-t border-line" : ""}
                    >
                      <a
                        href={`/p/${post.slug}`}
                        className="flex items-start gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-white/[0.04]"
                      >
                        <span
                          className={`metric tnum text-[0.9375rem] leading-6 shrink-0 ${
                            i === 0 ? "text-gold-text" : "text-ink-3"
                          }`}
                          aria-hidden
                        >
                          {post.rank}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-dense text-ink line-clamp-2">
                            {post.title}
                          </span>
                          <span className="mt-1 block text-meta text-ink-3 tnum">
                            {formatCents(post.total_raised_cents)} backed ·{" "}
                            {post.backers_count.toLocaleString()}{" "}
                            {post.backers_count === 1 ? "backer" : "backers"}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ol>
              )}

              <a
                href="#board-table"
                className="block border-t border-line px-4 py-2.5 text-meta text-ink-3 transition-colors duration-150 hover:bg-white/[0.04] hover:text-ink"
              >
                See the full board ↓
              </a>
            </div>
          )}
        </div>

        {/* The credibility numbers, as a hairline strip spanning the hero
            rather than a four-cell slab in the right column.

            It sits *below* both columns deliberately: on a phone the grid
            stacks, and anything placed here in the left column pushes the
            real stances down another screenful. Numbers are the supporting
            argument, so they read after the thing they support. */}
        {/* Withheld when the board did not load. The placeholder metrics are all
            zero, and "$0.00 · 0 backers" printed above a network error states
            figures that were never fetched — on a page whose whole problem is
            looking untrustworthy, inventing numbers is the last thing to do. */}
        {!loadFailed && (
          <dl className="mt-9 flex flex-wrap items-end gap-x-10 gap-y-4 border-t border-line pt-5">
            {/* Held back until the real figures land. The placeholder metrics are
              all zero, and "$0.00 backed · 0 backers" flashed at a first-time
              visitor on a slow connection reads as a dead site. */}
            {isLoading
              ? [0, 1, 2].map((i) => (
                  <div key={i} className="w-28" aria-hidden>
                    <div className="skeleton h-3 w-20 rounded-control" />
                    <div className="skeleton mt-2 h-6 w-24 rounded-control" />
                    <div className="skeleton mt-2 h-3 w-28 rounded-control" />
                  </div>
                ))
              : stats.map((stat) => (
                  <div key={stat.label}>
                    <dt className="micro-label text-ink-3">{stat.label}</dt>
                    <dd className="metric text-[1.375rem] tnum mt-1.5 leading-none text-ink">
                      {stat.value}
                    </dd>
                    <dd className="text-meta text-ink-3 mt-1.5">{stat.foot}</dd>
                  </div>
                ))}
          </dl>
        )}
      </div>
    </div>
  );
};

/**
 * How the board actually works.
 *
 * This replaces a two-part manifesto ("Say things out loud" / "Change
 * things") whose copy asserted values instead of explaining mechanics. A
 * reader deciding whether a site that takes money is legitimate is not
 * reassured by a mission statement; they are reassured by being told, in
 * order and without adjectives, what their money does — including the parts
 * that are not in the site's favour.
 *
 * Every claim below is the operative wording of the published terms.
 */
export const BoardMission: React.FC = () => {
  const steps = [
    {
      step: "1",
      title: "Post a stance, or back one",
      body: "Anyone can post. Backing an existing stance costs 1¢ for a like or 10¢ for a boost, taken from prepaid credit.",
    },
    {
      step: "2",
      title: "The board ranks by money paid",
      body: "No editor and no algorithm picks the order, and placement is not for sale separately. Scores decay on a fixed seven-day half-life, so nothing holds the top on old spending.",
    },
    {
      step: "3",
      title: "Spent is spent — unspent is yours",
      body: "Being outbid is not refunded: someone can outspend you a minute later. Credit you have not spent is refundable at face value, with no deadline and no reason required.",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
      <div className="mt-14 border-t border-line pt-7">
        <h2 className="kicker">How it works</h2>
        <div className="mt-5 grid grid-cols-1 gap-x-12 gap-y-7 md:grid-cols-3">
          {steps.map((item) => (
            <div key={item.step} className="max-w-[42ch]">
              <div className="flex items-baseline gap-2.5">
                <span
                  className="metric tnum text-ink-3 text-[0.9375rem]"
                  aria-hidden
                >
                  {item.step}
                </span>
                <h3 className="text-[15px] font-semibold text-ink">
                  {item.title}
                </h3>
              </div>
              <p className="text-dense text-ink-3 leading-relaxed mt-1.5">
                {item.body}
              </p>
            </div>
          ))}
        </div>

        <p className="text-meta text-ink-3 mt-7">
          Payments are handled by Stripe. Full detail in the{" "}
          <a
            href="/terms"
            className="text-ink-2 underline underline-offset-4 hover:text-ink"
          >
            terms
          </a>
          , including refunds and the EU/EEA 14-day withdrawal right.
        </p>
      </div>
    </div>
  );
};

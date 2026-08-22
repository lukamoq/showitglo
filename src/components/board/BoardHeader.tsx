"use client";

import React from "react";
import { formatUSD } from "@/lib/utils";
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
  onOpenCreate?: () => void;
}

export const BoardHeader: React.FC<BoardHeaderProps> = ({
  category,
  topPrice,
  totalVolume,
  distinctPayers,
  leaders = [],
  isLoading = false,
  onOpenCreate,
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
      gold: true,
    },
    {
      label: "Backing the board",
      value: formatUSD(totalVolume),
      foot: "real money, publicly staked",
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
              <span className="kicker">Global arena · open board</span>
            </div>

            <h1 className="display-hero text-ink mt-5">
              <span className="reveal-line">
                <span style={{ animationDelay: "0.05s" }}>
                  The public stage
                </span>
              </span>
              <span className="reveal-line">
                <span style={{ animationDelay: "0.15s" }}>where opinions</span>
              </span>
              <span className="reveal-line">
                <span
                  className="text-gold-text"
                  style={{ animationDelay: "0.25s" }}
                >
                  fight for rank.
                </span>
              </span>
            </h1>

            <p className="lead mt-5">
              No stage, no algorithm, no censors.{" "}
              <span className="tnum">A like is 1¢, a boost is 10¢</span> — say
              it out loud or put paid crowd weight behind a demand, and the
              market decides what rises.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onOpenCreate}
                className="btn btn-gold"
              >
                Take the stage — 1¢
              </button>
              <a href="#board-table" className="btn btn-ghost">
                See the full board
              </a>
            </div>
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
                <span className="kicker">Winning right now</span>
                <span className="led led-gold" aria-hidden />
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
                            {formatUSD(post.total_raised_cents)} backed ·{" "}
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
                  <dd
                    className={`metric text-[1.375rem] tnum mt-1.5 leading-none ${
                      stat.gold ? "text-gold-text" : "text-ink"
                    }`}
                  >
                    {stat.value}
                  </dd>
                  <dd className="text-meta text-ink-3 mt-1.5">{stat.foot}</dd>
                </div>
              ))}
        </dl>
      </div>
    </div>
  );
};

/**
 * The manifesto, moved out of the hero.
 *
 * It used to sit between the headline and the board, which meant every first
 * visit paid for two columns of prose before reaching a single opinion. It
 * reads better once the board above it has already made the argument, so it
 * now renders after the table.
 */
export const BoardMission: React.FC = () => {
  const mission = [
    {
      title: "Say things out loud",
      body: "No black-box algorithm decides who gets seen. Conviction goes on the permanent public record, and every like and penny boost commands front-page rank.",
    },
    {
      title: "Change things",
      body: "Petitions get ignored because signatures are free. Here a demand carries the money behind it, publicly and permanently.",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
      <div className="mt-14 border-t border-line pt-7 grid grid-cols-1 md:grid-cols-2 gap-x-14 gap-y-7">
        {mission.map((item) => (
          <div key={item.title} className="max-w-[46ch]">
            <h2 className="text-[15px] font-semibold text-ink">{item.title}</h2>
            <p className="text-dense text-ink-3 leading-relaxed mt-1.5">
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

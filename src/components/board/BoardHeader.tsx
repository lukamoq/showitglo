'use client';

import React from 'react';
import { formatUSD } from '@/lib/utils';
import { Category } from '@/lib/types';
import { LiveVisitorsBadge } from '../live/LiveVisitorsBadge';

interface BoardHeaderProps {
  category?: Category;
  topPrice: number;
  totalVolume: number;
  totalBoosts: number;
  distinctPayers: number;
  onOpenCreate?: () => void;
}

export const BoardHeader: React.FC<BoardHeaderProps> = ({
  category,
  topPrice,
  totalVolume,
  distinctPayers,
  onOpenCreate,
}) => {
  const halfLifeHours = category?.half_life_hours || 168;
  const incrementStrategy =
    category?.increment_strategy === 'percent'
      ? '+10% (floor $0.50)'
      : category?.increment_strategy || 'Percent';

  const stats = [
    {
      label: '#1 price to beat',
      value: formatUSD(topPrice),
      foot: `To beat: ${incrementStrategy}`,
      gold: true,
    },
    {
      label: 'Total backing',
      value: formatUSD(totalVolume),
      foot: 'Crowd pennies + power boosts',
    },
    {
      label: 'Distinct backers',
      value: distinctPayers.toLocaleString(),
      foot: 'Wallets behind stances',
    },
    {
      label: 'Decay half-life',
      value: `${halfLifeHours}h`,
      foot: '1¢ like · 10¢ boost',
    },
  ];

  /* The mission, as a ruled two-column note rather than a pair of feature
     cards — the ledger language already carries the structure. */
  const mission = [
    {
      title: 'Say things out loud',
      body: 'No black-box algorithm decides who gets seen. Conviction goes on the permanent public record, and every like and penny boost commands front-page rank.',
    },
    {
      title: 'Change things',
      body: 'Petitions get ignored because signatures are free. Here a demand carries the money behind it, publicly and permanently.',
    },
  ];

  return (
    <div className="w-full pt-12 pb-10 sm:pt-20 sm:pb-14">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-10 lg:gap-16 items-start">
          {/* Left — the thesis */}
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <LiveVisitorsBadge variant="compact" />
              <span className="kicker">Global arena · open board</span>
            </div>

            <h1 className="display-hero text-ink mt-6">
              <span className="reveal-line">
                <span style={{ animationDelay: '0.05s' }}>The public stage</span>
              </span>
              <span className="reveal-line">
                <span style={{ animationDelay: '0.15s' }}>where opinions</span>
              </span>
              <span className="reveal-line">
                <span className="text-gold-text" style={{ animationDelay: '0.25s' }}>
                  fight for rank.
                </span>
              </span>
            </h1>

            <p className="lead mt-6">
              No stage, no algorithm, no censors. <span className="tnum">A like is 1¢, a boost is
              10¢</span> — say it out loud or put paid crowd weight behind a demand, and the market
              decides what rises.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button type="button" onClick={onOpenCreate} className="btn btn-gold">
                Take the stage — 1¢
              </button>
              <a href="#board-table" className="btn btn-ghost">
                Watch the board
              </a>
            </div>
          </div>

          {/* Right — market terminal slab */}
          <div className="panel rounded-card overflow-hidden w-full">
            <div className="px-4 py-2.5 border-b border-line flex items-center justify-between gap-3">
              <span className="kicker">Market terminal</span>
              <span className="led led-gold" aria-hidden />
            </div>

            <div className="grid grid-cols-2">
              {stats.map((stat, i) => (
                <div
                  key={stat.label}
                  className={`cell ${i % 2 === 0 ? 'border-r' : ''} ${i < 2 ? 'border-b' : ''}`}
                >
                  <div className="micro-label text-ink-3">{stat.label}</div>
                  <div
                    className={`metric text-[1.625rem] tnum mt-2 leading-none ${
                      stat.gold ? 'text-gold-text' : 'text-ink'
                    }`}
                  >
                    {stat.value}
                  </div>
                  <div className="text-meta text-ink-3 mt-2">{stat.foot}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mission — a hairline note, not a card grid */}
        <div className="mt-14 lg:mt-20 border-t border-line pt-7 grid grid-cols-1 md:grid-cols-2 gap-x-14 gap-y-7">
          {mission.map((item) => (
            <div key={item.title} className="max-w-[46ch]">
              <h2 className="text-[15px] font-semibold text-ink">{item.title}</h2>
              <p className="text-dense text-ink-3 leading-relaxed mt-1.5">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

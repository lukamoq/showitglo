'use client';

import React from 'react';
import { Megaphone, Mic } from 'lucide-react';
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
      foot: 'Wallets standing behind stances',
    },
    {
      label: 'Decay half-life',
      value: `${halfLifeHours}h`,
      foot: '1¢ like · 10¢ boost',
    },
  ];

  return (
    <div className="relative w-full pt-10 pb-12 sm:pt-14 sm:pb-16">
      <div className="orb orb-gold -top-56 -left-40 opacity-80" aria-hidden />

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-8 lg:gap-12 items-start">
          {/* Left — the pitch */}
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <LiveVisitorsBadge variant="compact" />
              <span className="chip text-gold-text !whitespace-normal">
                No stage? No algorithm? No censors. Here, the market decides.
              </span>
            </div>

            <h1 className="display-hero text-ink mt-5">
              <span className="reveal-line">
                <span style={{ animationDelay: '0.04s' }}>The public stage</span>
              </span>
              <span className="reveal-line">
                <span style={{ animationDelay: '0.13s' }}>where opinions</span>
              </span>
              <span className="reveal-line">
                <span className="text-gold-text" style={{ animationDelay: '0.22s' }}>
                  fight for rank.
                </span>
              </span>
            </h1>

            <p className="text-[15px] text-ink-2 leading-relaxed max-w-[52ch] mt-5">
              <span className="tnum">A like is 1¢. A boost is 10¢.</span> No shadowbans, no
              algorithmic gatekeepers, no silent censorship — say it out loud or put paid crowd
              weight behind a demand, and the market decides what rises.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button onClick={onOpenCreate} className="btn btn-gold">
                Take the stage — 1¢
              </button>
              <a href="#board-table" className="btn btn-ghost">
                Watch the board
              </a>
            </div>
          </div>

          {/* Right — market terminal slab */}
          <div className="card rounded-card overflow-hidden w-full">
            <div className="px-4 py-2 border-b border-line flex items-center justify-between gap-3">
              <span className="kicker">Market terminal</span>
              <span className="led led-gold" aria-hidden />
            </div>

            <div className="grid grid-cols-2">
              {stats.map((stat, i) => (
                <div
                  key={stat.label}
                  className={`p-4 ${i % 2 === 0 ? 'border-r border-line' : ''} ${
                    i < 2 ? 'border-b border-line' : ''
                  }`}
                >
                  <div className="micro-label text-ink-3">{stat.label}</div>
                  <div
                    className={`metric text-2xl tnum mt-1.5 leading-none ${
                      stat.gold ? 'text-gold-text' : 'text-ink'
                    }`}
                  >
                    {stat.value}
                  </div>
                  <div className="text-meta text-ink-3 mt-1.5">{stat.foot}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mission — two quiet cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-10 lg:mt-12">
          <div className="card rounded-card p-5">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-ink-3" aria-hidden />
              <span className="kicker">Unfiltered public stage</span>
            </div>
            <h3 className="text-sm font-semibold text-ink mt-2.5">Say Things Out Loud</h3>
            <p className="text-dense text-ink-3 leading-relaxed mt-1.5">
              No black-box algorithm decides who gets seen. Put your conviction on the permanent
              public record, where every like and penny boost commands front-page rank.
            </p>
          </div>

          <div className="card rounded-card p-5">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-ink-3" aria-hidden />
              <span className="kicker">Paid crowd mandates</span>
            </div>
            <h3 className="text-sm font-semibold text-ink mt-2.5">Change Things</h3>
            <p className="text-dense text-ink-3 leading-relaxed mt-1.5">
              Petitions get ignored because signatures are free. When 15,000 paying consumers rally
              $5,000+ behind a demand, brands are forced to answer on the record.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

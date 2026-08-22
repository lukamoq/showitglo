'use client';

import React from 'react';
import { Trophy, TrendingUp, Users, Clock, Zap, Swords, Megaphone, Mic, ShieldAlert, Sparkles, ArrowRight } from 'lucide-react';
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
  return (
    <div className="relative w-full pt-6 pb-8">
      {/* Ambient Orbs */}
      <div className="orb-glow-gold top-0 left-1/4 -translate-x-1/2 opacity-70" />
      <div className="orb-glow-cyan top-10 right-1/4 translate-x-1/2 opacity-50" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Title and tagline */}
        <div className="text-center max-w-4xl mx-auto mb-10">
          <div className="flex items-center justify-center gap-3 flex-wrap mb-4">
            <LiveVisitorsBadge variant="badge" />

            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-segmented border border-amber-500/40 text-amber-300 text-xs font-semibold tracking-wide shadow-xl">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
              <span>Always wanted to share your opinion but you didn&apos;t get the stage or got censored? We don&apos;t!</span>
            </div>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight">
            Let the World Decide <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-200">
              What Opinion is Real.
            </span>
          </h1>

          <p className="mt-4 text-sm sm:text-base text-slate-300 max-w-3xl mx-auto leading-relaxed">
            No shadowbans. No algorithmic gatekeepers. No silent censorship. Whether you want to <strong>say what everyone is thinking out loud</strong> or <strong>force companies to change things with paid crowd demands</strong> — this is the uncensored public arena where the people decide what rises to the top.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={onOpenCreate}
              className="btn-glass-gold px-6 py-3.5 rounded-2xl text-sm font-bold shadow-xl flex items-center gap-2 cursor-pointer"
            >
              <Swords className="w-4 h-4" />
              <span>Claim The Stage & Post (1¢)</span>
            </button>
            <a
              href="#board-table"
              className="btn-glass-dark px-6 py-3.5 rounded-2xl text-sm font-semibold hover:border-white/30"
            >
              Explore Live Arena
            </a>
          </div>
        </div>

        {/* 2-Column Mission Feature Cards: "Say Things Out Loud" vs "Change Things" */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 max-w-4xl mx-auto">
          {/* Card 1: Say Things Out Loud */}
          <div className="glass-panel p-5 rounded-3xl border border-amber-500/30 bg-gradient-to-br from-slate-950 via-slate-900/80 to-amber-950/20 shadow-xl">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Mic className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-amber-400 uppercase font-mono font-bold">Unfiltered Public Stage</span>
                <h3 className="font-bold text-sm text-white">Say Things Out Loud</h3>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              No black-box algorithms deciding who gets seen. Put your conviction on the permanent public record where every like and penny boost directly commands front-page rank.
            </p>
          </div>

          {/* Card 2: Change Things */}
          <div className="glass-panel p-5 rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-slate-950 via-slate-900/80 to-cyan-950/20 shadow-xl">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Megaphone className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] text-cyan-400 uppercase font-mono font-bold">Paid Crowd Mandates</span>
                <h3 className="font-bold text-sm text-white">Change Things</h3>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Petitions are ignored because signatures are free. When 15,000 paying consumers rally $5,000+ behind a demand at a company, brands are forced to answer on the record.
            </p>
          </div>
        </div>

        {/* 4-Stat High Density Market Terminal Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Stat 1: #1 Price to Beat */}
          <div className="glass-card p-4 rounded-2xl border border-amber-500/30 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-colors" />
            <div className="flex items-center justify-between text-xs text-amber-400/90 font-medium">
              <span className="flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-400" />
                #1 Price to Beat
              </span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono">
                Crown
              </span>
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black font-mono tracking-tight text-white tabular-nums">
              {formatUSD(topPrice)}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Score needed to take #1 crown
            </div>
          </div>

          {/* Stat 2: Total Volume Raised */}
          <div className="glass-card p-4 rounded-2xl border border-white/10 relative overflow-hidden group">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Total Backing Raised
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">Arena</span>
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black font-mono tracking-tight text-white tabular-nums">
              {formatUSD(totalVolume)}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Crowd pennies + whale power boosts
            </div>
          </div>

          {/* Stat 3: Total Distinct Backers */}
          <div className="glass-card p-4 rounded-2xl border border-white/10 relative overflow-hidden group">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-cyan-400" />
                Penny Army Backers
              </span>
              <span className="text-[10px] text-cyan-400 font-mono">People</span>
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black font-mono tracking-tight text-white tabular-nums">
              {distinctPayers.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              Distinct wallets standing behind stances
            </div>
          </div>

          {/* Stat 4: Decay & Interaction Ladder */}
          <div className="glass-card p-4 rounded-2xl border border-white/10 relative overflow-hidden group">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-purple-400" />
                7-Day Decay Flow
              </span>
              <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono">
                {category?.half_life_hours || 168}h
              </span>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold font-mono tracking-tight text-white">
              1¢ Like • 10¢ Boost
            </div>
            <div className="mt-1 text-[11px] text-purple-300/80 font-mono">
              Strategy: {category?.increment_strategy === 'percent' ? '+10% (floor $0.50)' : category?.increment_strategy || 'Percent'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

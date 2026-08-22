'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { BoardSnapshot } from '@/lib/types';
import { formatUSD, formatCents } from '@/lib/utils';
import { History, Calendar, Trophy, Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function HistoryPage() {
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load available snapshot dates
  useEffect(() => {
    const fetchDates = async () => {
      try {
        const res = await fetch('/api/v1/boards/global/history');
        const data = await res.json();
        if (data.available_dates && data.available_dates.length > 0) {
          setAvailableDates(data.available_dates);
          setSelectedDate(data.available_dates[0]);
        }
      } catch (err) {
        console.error('Error loading history dates:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDates();
  }, []);

  // Fetch snapshot when selectedDate changes
  useEffect(() => {
    if (!selectedDate) return;
    const fetchSnapshot = async () => {
      try {
        const res = await fetch(`/api/v1/boards/global/history?date=${selectedDate}`);
        const data = await res.json();
        if (data.rankings) {
          setSnapshot(data);
        }
      } catch (err) {
        console.error('Error fetching snapshot:', err);
      }
    };
    fetchSnapshot();
  }, [selectedDate]);

  return (
    <div className="min-h-screen bg-[#060709] text-white flex flex-col relative overflow-x-hidden">
      <div className="orb-glow-cyan top-20 right-1/3 opacity-30" />

      <Navbar />

      <div className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-3">
            <History className="w-4 h-4" />
            <span>Time-Travel Archive</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Permanent Board Playback
          </h1>
          <p className="mt-3 text-sm text-slate-300">
            ShowItGlo never deletes ranking history. Scrub through time to view the exact state of the world&apos;s attention on any past date.
          </p>
        </div>

        {/* Date Selector Scrubber */}
        <div className="glass-panel p-4 rounded-2xl border border-white/10 mb-8 max-w-xl mx-auto">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-300">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <span>Select Snapshot Date:</span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 font-mono text-xs">
            {availableDates.map((date) => (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`px-3 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                  selectedDate === date
                    ? 'bg-cyan-500 text-black font-bold shadow-lg shadow-cyan-500/20'
                    : 'glass-card text-slate-300 hover:text-white'
                }`}
              >
                {date}
              </button>
            ))}
          </div>
        </div>

        {/* Snapshot Table */}
        {snapshot ? (
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">
                  Board Snapshot: <strong className="text-cyan-400 font-mono">{snapshot.snapshot_date}</strong>
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {snapshot.rankings.length} posts archived
              </span>
            </div>

            <div className="space-y-3">
              {snapshot.rankings.map((p) => (
                <div
                  key={p.rank}
                  className="glass-card p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono font-black ${
                        p.rank === 1
                          ? 'bg-amber-500 text-black'
                          : p.rank === 2
                          ? 'bg-slate-300 text-black'
                          : p.rank === 3
                          ? 'bg-amber-700 text-white'
                          : 'glass-segmented text-slate-300'
                      }`}
                    >
                      #{p.rank}
                    </div>

                    <div>
                      <span className="font-bold text-sm text-white block">
                        {p.title}
                      </span>
                      <span className="text-slate-400">By {p.author_display}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 sm:text-right">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-mono">Decayed Score on {snapshot.snapshot_date}</div>
                      <div className="text-base font-black font-mono text-amber-400 tabular-nums">
                        {formatUSD(p.score_display)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="glass-panel p-12 rounded-3xl text-center border border-white/10 max-w-md mx-auto">
            <Sparkles className="w-8 h-8 text-cyan-400 mx-auto mb-2 opacity-60" />
            <p className="text-xs text-slate-400">Select a date to view historical snapshots.</p>
          </div>
        )}
      </div>
    </div>
  );
}

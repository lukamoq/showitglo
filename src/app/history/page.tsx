'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { BoardSnapshot } from '@/lib/types';
import { formatUSD } from '@/lib/utils';
import { History, Calendar, AlertCircle, RefreshCw } from 'lucide-react';
import { apiGet, errorText } from '@/components/system/api';

export default function HistoryPage() {
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchDates = useCallback(async () => {
    const res = await apiGet<{ available_dates: string[] }>('/api/v1/boards/global/history');
    setIsLoading(false);

    if (!res.ok) {
      setLoadError(errorText(res, 'The archive index could not be loaded.'));
      return;
    }

    setLoadError(null);
    const dates = res.data?.available_dates ?? [];
    setAvailableDates(dates);
    setSelectedDate((current) => current || dates[0] || '');
  }, []);

  useEffect(() => {
    void fetchDates();
  }, [fetchDates]);

  // Fetch snapshot when selectedDate changes
  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;

    void (async () => {
      const res = await apiGet<BoardSnapshot>(`/api/v1/boards/global/history?date=${selectedDate}`);
      if (cancelled) return;
      if (res.ok && res.data?.rankings) {
        setSnapshot(res.data);
        setLoadError(null);
      } else {
        setSnapshot(null);
        setLoadError(errorText(res, `No archived board found for ${selectedDate}.`));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden">
      <Navbar />

      <div className="flex-1 w-full">
        {/* Header */}
        <div className="relative pt-10 pb-8 sm:pt-14 sm:pb-10">
          <div className="orb orb-gold -top-64 -left-40 opacity-70" aria-hidden />

          <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="kicker kicker-gold flex items-center gap-2">
              <History className="w-4 h-4" aria-hidden />
              <span>Time-travel archive</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-ink mt-3">
              Permanent Board Playback
            </h1>

            <p className="text-[15px] text-ink-2 leading-relaxed max-w-[62ch] mt-3">
              ShowItGlo never deletes ranking history. Scrub through time to view the exact state of
              the world&apos;s attention on any past date.
            </p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 space-y-6">
          {/* Date scrubber */}
          <div className="panel rounded-card p-4">
            <div className="flex items-center gap-2 mb-2.5 text-ink-3">
              <Calendar className="w-4 h-4" aria-hidden />
              <span className="kicker">Snapshot date</span>
            </div>

            <div className="overflow-x-auto pb-1">
              {isLoading ? (
                <div className="flex items-center gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="skeleton h-8 w-24 rounded-control" />
                  ))}
                </div>
              ) : availableDates.length > 0 ? (
                <div className="seg">
                  {availableDates.map((date) => (
                    <button
                      key={date}
                      type="button"
                      aria-pressed={selectedDate === date}
                      onClick={() => setSelectedDate(date)}
                      className={`seg-item tnum ${selectedDate === date ? 'seg-item-active' : ''}`}
                    >
                      {date}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-dense text-ink-3">
                  No daily snapshots have been archived yet.
                </p>
              )}
            </div>
          </div>

          {loadError && (
            <div className="panel rounded-card p-6 text-center max-w-md mx-auto">
              <AlertCircle className="w-7 h-7 text-down mx-auto mb-3" aria-hidden />
              <p role="alert" className="text-dense text-ink-2">
                {loadError}
              </p>
              <button type="button" onClick={() => void fetchDates()} className="btn btn-ghost btn-sm mt-5">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* Snapshot ledger */}
          {snapshot ? (
            <div className="panel rounded-card overflow-hidden animate-rise">
              <div className="px-4 sm:px-6 py-3 border-b border-line flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="kicker">Board snapshot</span>
                  <span className="chip text-gold-text tnum">{snapshot.snapshot_date}</span>
                </div>
                <span className="text-meta text-ink-3 tnum">
                  {snapshot.rankings.length} posts archived
                </span>
              </div>

              <div className="divide-y divide-line">
                {snapshot.rankings.map((p) => {
                  const isRank1 = p.rank === 1;
                  const isRank2 = p.rank === 2;
                  const isRank3 = p.rank === 3;

                  const spine = isRank1
                    ? 'bg-gold'
                    : isRank2
                    ? 'bg-white/25'
                    : isRank3
                    ? 'bg-gold-deep/60'
                    : null;

                  return (
                    <div
                      key={p.rank}
                      className={`relative px-4 sm:px-5 py-4 transition-colors duration-200 hover:bg-white/[0.04] ${
                        isRank1 ? 'bg-gold/[0.045]' : ''
                      }`}
                    >
                      {spine && (
                        <span
                          aria-hidden
                          className={`absolute left-0 top-0 bottom-0 w-[3px] ${spine}`}
                        />
                      )}

                      <div className="flex flex-col lg:grid lg:grid-cols-[3.5rem_1fr_auto] gap-3 lg:gap-4 lg:items-center">
                        {/* Rank */}
                        <div className="flex items-center lg:justify-end shrink-0">
                          <span
                            className={`metric text-xl leading-none tnum ${
                              isRank1 ? 'text-gold-text' : p.rank <= 3 ? 'text-ink' : 'text-ink-3'
                            }`}
                          >
                            {p.rank}
                          </span>
                        </div>

                        {/* Statement */}
                        <div className="min-w-0">
                          <span className="font-semibold text-[15px] sm:text-base text-ink block line-clamp-1">
                            {p.title}
                          </span>
                          <span className="text-meta text-ink-3">
                            <span className="text-ink-2 font-medium">{p.author_display}</span>
                          </span>
                        </div>

                        {/* Archived score */}
                        <div className="shrink-0 text-left lg:text-right pt-2 lg:pt-0 border-t lg:border-t-0 border-line">
                          <div className="micro-label text-ink-3">
                            Decayed score · {snapshot.snapshot_date}
                          </div>
                          <div
                            className={`metric text-lg sm:text-xl leading-tight tnum ${
                              isRank1 ? 'text-gold-text' : 'text-ink'
                            }`}
                          >
                            {formatUSD(p.score_display)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            !loadError && (
              <div className="panel rounded-card p-12 text-center max-w-md mx-auto">
                <History className="w-8 h-8 text-ink-3 mx-auto mb-3" aria-hidden />
                <p className="text-dense text-ink-3">
                  Select a date to replay the board as it stood.
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

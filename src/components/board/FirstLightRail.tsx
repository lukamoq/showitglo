'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Sunrise, Timer } from 'lucide-react';

import { apiGet } from '../system/api';
import { formatCountdown, firstLightSecondsRemaining } from '@/lib/firstLight';
import { formatScore } from '@/lib/utils';
import type { RankedPostView } from '@/lib/types';

interface FirstLightPost extends RankedPostView {
  first_light_seconds_remaining: number;
}

interface FirstLightResponse {
  window_minutes: number;
  posts: FirstLightPost[];
}

/**
 * The free stage.
 *
 * Everything else on this site is ordered by money. This strip is ordered by
 * the clock, and it exists so that publishing a stance with an empty wallet is
 * still worth doing. The countdown is not a growth trick — the window is
 * stamped in the database at insert time and enforced by the query behind this
 * rail, so when it reads "12 min" the post really does leave in twelve minutes
 * and fall back to whatever rank it has been paid into.
 *
 * The rail hides itself when nothing is inside its window rather than
 * rendering an empty shelf.
 */
export const FirstLightRail: React.FC<{ onPublish?: () => void }> = ({ onPublish }) => {
  const [posts, setPosts] = useState<FirstLightPost[]>([]);
  const [windowMinutes, setWindowMinutes] = useState(60);
  // A bare re-render beat. The countdowns are derived from the server's
  // `first_light_until` on every paint, so this only needs to cause paints.
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    const res = await apiGet<FirstLightResponse>('/api/v1/first-light');
    if (res.ok && Array.isArray(res.data?.posts)) {
      setPosts(res.data.posts);
      if (typeof res.data.window_minutes === 'number') setWindowMinutes(res.data.window_minutes);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = setInterval(() => void load(), 30000);
    // A separate, cheaper beat so the countdowns move without refetching.
    const clock = setInterval(() => setTick((n) => n + 1), 1000);
    return () => {
      clearInterval(refresh);
      clearInterval(clock);
    };
  }, [load]);

  // Recomputed from the server's `first_light_until`, not by decrementing a
  // number every second: a backgrounded tab that stops firing intervals would
  // otherwise come back showing a countdown minutes behind the truth.
  const live = posts
    .map((post) => ({ post, secondsLeft: firstLightSecondsRemaining(post.first_light_until) }))
    .filter((entry) => entry.secondsLeft > 0);

  if (live.length === 0) return null;

  return (
    <section aria-labelledby="first-light-heading" className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 pt-6">
      <div className="panel rounded-card overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 sm:px-5 pt-4 pb-3">
          <div className="min-w-0">
            <div className="kicker-gold kicker flex items-center gap-1.5">
              <Sunrise className="h-3.5 w-3.5" aria-hidden />
              <span>First Light</span>
            </div>
            <h2 id="first-light-heading" className="mt-1 text-dense font-semibold text-ink">
              Just published — seen by everyone, paid for by nobody
            </h2>
          </div>
          <p className="text-meta text-ink-3 max-w-sm">
            Every new stance gets {windowMinutes} minutes here, newest first, whatever its wallet
            says. When the clock runs out it keeps only the rank its backing bought.
          </p>
        </div>

        <ul className="flex gap-2.5 overflow-x-auto px-4 sm:px-5 pb-4 snap-x">
          {live.map(({ post, secondsLeft }) => (
            <li key={post.id} className="snap-start shrink-0 w-[15.5rem]">
              <Link
                href={`/p/${post.slug}`}
                className="sunken rounded-control block h-full p-3 transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-micro font-semibold tnum text-gold-text">
                    <Timer className="h-3 w-3" aria-hidden />
                    <span>{formatCountdown(secondsLeft)} left</span>
                  </span>
                  <span className="text-micro tnum text-ink-3">
                    #{post.rank} · {formatScore(post.display_score)}
                  </span>
                </div>

                <p className="mt-2 text-dense text-ink line-clamp-3 leading-snug">{post.title}</p>
                <p className="mt-2 text-micro text-ink-3 truncate">{post.author_display}</p>
              </Link>
            </li>
          ))}
        </ul>

        {onPublish && (
          <div className="border-t border-line px-4 sm:px-5 py-3">
            <button type="button" onClick={onPublish} className="btn btn-ghost btn-sm">
              <Sunrise className="h-3.5 w-3.5" aria-hidden />
              <span>Put yours up here — free</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

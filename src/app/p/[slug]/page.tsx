'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout/Navbar';
import { BoostDrawer } from '@/components/boost/BoostDrawer';
import { CounterPostModal } from '@/components/post/CounterPostModal';
import { ShareCardModal } from '@/components/post/ShareCardModal';
import { HoldToLikeButton } from '@/components/interactions/HoldToLikeButton';
import { WalletTopUpModal } from '@/components/wallet/WalletTopUpModal';
import { ReportPostControl } from '@/components/post/ReportPostControl';
import { RankedPostView, Interaction } from '@/lib/types';
import { formatScore, formatCents, timeAgo } from '@/lib/utils';
import {
  Zap,
  Share2,
  Users,
  Clock,
  User as UserIcon,
  ArrowLeft,
  Swords,
  Lock,
  Megaphone,
  CheckCircle2,
  Building2,
  RefreshCw,
} from 'lucide-react';
import { apiGet, errorText, recommendedTopUpCents } from '@/components/system/api';
import { useWallet } from '@/components/system/useWallet';

/** Shape the posts endpoint returns for the aggregated backer roster. */
interface BackerRow {
  name: string;
  totalCents: number;
  boostCount: number;
}

export default function PostDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [post, setPost] = useState<RankedPostView | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [backers, setBackers] = useState<BackerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isBoostOpen, setIsBoostOpen] = useState(false);
  const [isCounterOpen, setIsCounterOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpRecommendation, setTopUpRecommendation] = useState<number | undefined>(undefined);
  const [isUnderReview, setIsUnderReview] = useState(false);

  const { balanceCents, refresh: refreshWallet } = useWallet();

  const fetchPost = useCallback(async () => {
    if (!slug) return;
    const res = await apiGet<{
      post: RankedPostView;
      boosts: Interaction[];
      top_backers: BackerRow[];
      under_review?: boolean;
    }>(`/api/v1/posts/${slug}`);
    setIsLoading(false);

    if (!res.ok || !res.data?.post) {
      setLoadError(res.status === 404 ? null : errorText(res, 'This record could not be loaded.'));
      setPost(null);
      return;
    }

    setLoadError(null);
    setIsUnderReview(res.data.under_review === true);
    setPost(res.data.post);
    setInteractions(res.data.boosts || []);
    setBackers(res.data.top_backers || []);
  }, [slug]);

  useEffect(() => {
    void fetchPost();
  }, [fetchPost]);

  if (isLoading) {
    return (
      <div className="min-h-screen text-ink flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="flex items-center gap-3">
            <span className="led led-gold" aria-hidden />
            <span className="kicker">Retrieving permanent ledger record</span>
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen text-ink flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="panel rounded-card px-8 py-10 text-center max-w-md w-full animate-rise">
            <div className="kicker">Ledger lookup</div>
            <h2 className="text-xl font-bold tracking-tight text-ink mt-2">
              {loadError ? 'Record unavailable' : 'Opinion Not Found'}
            </h2>
            <p role={loadError ? 'alert' : undefined} className="text-meta text-ink-3 mt-2">
              {loadError ?? 'This permanent URL does not exist or was removed.'}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              {loadError && (
                <button type="button" onClick={() => void fetchPost()} className="btn btn-ghost btn-sm">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
              )}
              <Link href="/" className="btn btn-ghost btn-sm">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Arena Board</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /**
   * A post pulled off the board by community reports.
   *
   * The URL was already shared, so a 404 here would be a lie — and if the
   * review ends in a restore, a lie we would have to take back. The honest
   * answer is the one below: this exists, it is hidden, a human is looking at
   * it. The title stays because it is what the link already promised; the
   * body, the ledger and the roster do not, because they are what a reported
   * post might be using to do harm.
   */
  if (isUnderReview) {
    return (
      <div className="min-h-screen text-ink flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="panel rounded-card px-8 py-10 max-w-lg w-full animate-rise">
            <div className="kicker flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" aria-hidden />
              <span>Under review</span>
            </div>

            <h1 className="text-xl font-bold tracking-tight text-ink mt-2">{post.title}</h1>

            <p className="text-dense text-ink-2 leading-relaxed mt-4">
              This stance is temporarily hidden from the board while a moderator reviews reports
              about it. Nothing has been deleted, and no decision has been made yet — if it is
              cleared it returns with its score and ledger intact.
            </p>

            <div className="mt-6 flex items-center gap-2">
              <Link href="/" className="btn btn-ghost btn-sm">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Arena Board</span>
              </Link>
              <button type="button" onClick={() => void fetchPost()} className="btn btn-ghost btn-sm">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Check again</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isRank1 = post.rank === 1;

  return (
    <div className="min-h-screen text-ink flex flex-col relative overflow-x-hidden">
      <Navbar />

      <div className="relative flex-1 w-full">

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16 w-full">
          {/* Back Link */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-meta text-ink-3 hover:text-ink font-medium mb-6 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Arena Board</span>
          </Link>

          {/* Post Hero Slab — the statement leads, the controls follow it. */}
          <div className="panel rounded-card p-5 sm:p-8">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span
                className={`metric text-lg leading-none tnum ${
                  isRank1 ? 'text-gold-text' : 'text-ink-2'
                }`}
              >
                #{post.rank || '—'}
              </span>
              <span aria-hidden className="h-4 w-px bg-line-strong" />
              <span className="text-meta text-ink-2 font-medium inline-flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5 text-ink-3" aria-hidden />
                {post.author_display}
              </span>
              <span aria-hidden className="text-ink-3/40">·</span>
              <span className="text-meta text-ink-3 tnum">{timeAgo(post.created_at)}</span>

              {post.kind === 'demand' && (
                <span className="chip text-steel">
                  <Megaphone className="w-3 h-3" aria-hidden />
                  Demand @{post.demand_target || 'Brand'}
                  </span>
              )}
            </div>

            {/* Statement & Body Content */}
            <div className="mt-5">
              <h1 className="display-2 text-ink max-w-[22ch]">{post.title}</h1>

              <div className="micro-label text-ink-3 mt-4 flex items-center gap-1.5">
                <Lock className="w-3 h-3" aria-hidden />
                <span>Immutable public record</span>
              </div>
            </div>

            {/* Action rail */}
            <div className="mt-6 pt-6 border-t border-line flex items-center gap-2 flex-wrap">
              <button type="button" onClick={() => setIsBoostOpen(true)} className="btn btn-gold btn-sm">
                <Zap className="w-3.5 h-3.5" aria-hidden />
                <span>Boost</span>
              </button>

              <HoldToLikeButton
                postId={post.id}
                initialLikes={post.like_units}
                onLikeExecuted={() => {
                  void fetchPost();
                  void refreshWallet();
                }}
                onInsufficientFunds={(shortfallCents) => {
                  setTopUpRecommendation(recommendedTopUpCents(shortfallCents));
                  setIsTopUpOpen(true);
                }}
                onLikeCapReached={() => setIsBoostOpen(true)}
              />

              <button
                type="button"
                onClick={() => setIsCounterOpen(true)}
                className="btn btn-ghost btn-sm hover:border-down/40"
                title="Launch counter-opinion rebuttal"
              >
                <Swords className="w-3.5 h-3.5 text-down/80" aria-hidden />
                <span>Counter this</span>
              </button>

              <button
                type="button"
                onClick={() => setIsShareOpen(true)}
                className="btn btn-bare btn-sm"
                title="Generate a shareable flex card"
              >
                <Share2 className="w-3.5 h-3.5" aria-hidden />
                <span>Flex card</span>
              </button>

              <span className="ml-auto">
                <ReportPostControl postId={post.id} />
              </span>
            </div>

            <div className="mt-6 space-y-4">
              {/* Linked External Post Reference (§4) */}
              {post.source_url && (
                <div className="sunken rounded-control px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="micro-label text-ink-3 block">
                      Linked external post ({post.source_platform?.toUpperCase() || 'EXTERNAL'})
                    </span>
                    <span className="text-meta text-ink-2 line-clamp-1 break-all mt-0.5 block">
                      {post.source_url}
                    </span>
                  </div>

                  <a
                    href={post.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-xs shrink-0"
                  >
                    <span>View original</span>
                    <Share2 className="w-3 h-3" aria-hidden />
                  </a>
                </div>
              )}

              {post.body && (
                <blockquote className="border-l-2 border-line-strong pl-5 text-[15px] text-ink-2 leading-relaxed whitespace-pre-wrap max-w-[68ch]">
                  {post.body}
                </blockquote>
              )}
            </div>

            {/* Official Brand Response Section (§9) */}
            {post.brand_response ? (
              <div className="mt-6 rounded-card border border-up/20 bg-up/[0.045] p-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="chip text-up">
                    <CheckCircle2 className="w-3 h-3" aria-hidden />
                    Official brand response
                  </span>
                  <span className="text-meta text-ink-3">
                    By {post.brand_response.author_display}
                  </span>
                </div>
                <h2 className="text-[15px] font-semibold text-ink mt-3">
                  {post.brand_response.title}
                </h2>
                <p className="text-[15px] text-ink-2 leading-relaxed mt-1.5 max-w-[68ch]">
                  {post.brand_response.body}
                </p>
              </div>
            ) : post.kind === 'demand' && (
              /* There is no self-serve brand verification yet, so there is no
                 "post as this company" button — anyone could press it. Official
                 responses are published only through a verified channel. */
              <p className="mt-6 flex items-start gap-2 text-meta text-ink-3 max-w-[72ch]">
                <Building2 className="w-4 h-4 shrink-0 mt-px" aria-hidden />
                <span>
                  No official response from {post.demand_target || 'this company'} yet. Responses are
                  published only after ShowItGlo verifies the responder, so nothing here can be posted
                  in a company&apos;s name by someone else.
                </span>
              </p>
            )}

            {/* Metrics readout — one ruled strip, flush inside the slab. */}
            <div className="mt-8 -mx-5 sm:-mx-8 -mb-5 sm:-mb-8 border-t border-line grid grid-cols-2 sm:grid-cols-4">
              {[
                {
                  label: 'Decayed score',
                  value: formatScore(post.display_score),
                  gold: true,
                },
                { label: 'Distinct backers', value: post.backers_count.toLocaleString() },
                { label: 'Penny likes (1¢)', value: post.like_units.toLocaleString() },
                { label: 'Gross backing', value: formatCents(post.total_raised_cents) },
              ].map((stat, i) => (
                <div
                  key={stat.label}
                  className={`cell border-line ${i % 2 === 0 ? 'border-r' : ''} ${
                    i < 2 ? 'border-b' : ''
                  } sm:border-b-0 sm:border-r sm:last:border-r-0`}
                >
                  <div className="micro-label text-ink-3">{stat.label}</div>
                  <div
                    className={`metric text-[1.5rem] tnum mt-2 leading-none ${
                      stat.gold ? 'text-gold-text' : 'text-ink'
                    }`}
                  >
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2-Column Section: Crowd Backers & Interaction Ledger */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8 items-start">
            <div className="panel rounded-card overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
                <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
                  <Users className="w-4 h-4 text-ink-3" aria-hidden />
                  <span>Penny Army backers</span>
                </h2>
                <span className="chip chip-quiet tnum">{backers.length}</span>
              </div>

              {backers.length > 0 ? (
                <div className="divide-y divide-line">
                  {backers.map((backer, idx) => (
                    <div
                      key={`${backer.name}-${idx}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-full sunken flex items-center justify-center text-micro font-semibold text-ink-2 shrink-0">
                          {(backer.name || 'A').substring(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="block text-dense font-semibold text-ink truncate">
                            {backer.name || 'Anonymous'}
                          </span>
                          <span className="micro-label text-ink-3 tnum">
                            {backer.boostCount ?? 0} contribution{backer.boostCount === 1 ? '' : 's'}
                          </span>
                        </div>
                      </div>

                      <span className="text-dense font-semibold text-gold-text tnum shrink-0">
                        {formatCents(backer.totalCents ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-5 py-10 text-center text-meta text-ink-3">
                  Be the first to back this opinion with 1¢.
                </p>
              )}
            </div>

            <div className="panel rounded-card overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
                <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
                  <Clock className="w-4 h-4 text-ink-3" aria-hidden />
                  <span>Immutable ledger timeline</span>
                </h2>
                <span className="chip chip-quiet tnum">{interactions.length}</span>
              </div>

              {interactions.length > 0 ? (
                <div className="divide-y divide-line max-h-80 overflow-y-auto">
                  {interactions.map((i: any) => (
                    <div
                      key={i.id}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-white/[0.04]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-dense font-semibold text-up tnum">
                            +{formatCents(i.amount_cents)}
                          </span>
                          <span className="text-meta text-ink-3 truncate">
                            by {i.payer_display}
                          </span>
                        </div>
                        <span className="micro-label text-ink-3">
                          {timeAgo(i.settled_at || i.created_at)}
                        </span>
                      </div>

                      {i.achieved_rank && (
                        <span className="micro-label text-gold-text tnum shrink-0">
                          → #{i.achieved_rank}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-5 py-10 text-center text-meta text-ink-3">
                  No interactions recorded yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <BoostDrawer
        post={post}
        isOpen={isBoostOpen}
        onClose={() => setIsBoostOpen(false)}
        onSuccess={() => {
          void fetchPost();
          void refreshWallet();
        }}
      />

      <CounterPostModal
        parentPost={post}
        isOpen={isCounterOpen}
        onClose={() => setIsCounterOpen(false)}
        onCounterCreated={() => void fetchPost()}
      />

      <ShareCardModal
        post={post}
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />

      <WalletTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => {
          setIsTopUpOpen(false);
          void refreshWallet();
        }}
        currentBalanceCents={balanceCents}
        onTopUpSuccess={() => {
          void refreshWallet();
          setIsTopUpOpen(false);
        }}
        recommendedCents={topUpRecommendation}
      />
    </div>
  );
}

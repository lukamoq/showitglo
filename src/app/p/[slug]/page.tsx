'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout/Navbar';
import { BoostDrawer } from '@/components/boost/BoostDrawer';
import { CounterPostModal } from '@/components/post/CounterPostModal';
import { ShareCardModal } from '@/components/post/ShareCardModal';
import { HoldToLikeButton } from '@/components/interactions/HoldToLikeButton';
import { WalletTopUpModal } from '@/components/wallet/WalletTopUpModal';
import { RankedPostView, Interaction, PostBacker } from '@/lib/types';
import { formatUSD, formatScore, formatCents, timeAgo } from '@/lib/utils';
import {
  Trophy,
  Zap,
  Share2,
  Users,
  Clock,
  ShieldCheck,
  ArrowLeft,
  Swords,
  Lock,
  Megaphone,
  CheckCircle2,
  Building2,
} from 'lucide-react';

export default function PostDetailPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [post, setPost] = useState<RankedPostView | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [backers, setBackers] = useState<PostBacker[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBoostOpen, setIsBoostOpen] = useState(false);
  const [isCounterOpen, setIsCounterOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  // Brand Response Form State
  const [isResponding, setIsResponding] = useState(false);
  const [respTitle, setRespTitle] = useState('');
  const [respBody, setRespBody] = useState('');
  const [respAuthor, setRespAuthor] = useState('');

  const fetchPost = async () => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/v1/posts/${slug}`);
      const data = await res.json();
      if (data.post) {
        setPost(data.post);
        setInteractions(data.boosts || []);
        setBackers(data.top_backers || []);
      }
    } catch (err) {
      console.error('Error fetching post:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPost();
  }, [slug]);

  const handleBrandRespond = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post || !respTitle.trim() || !respBody.trim()) return;

    try {
      const res = await fetch(`/api/v1/posts/${post.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: respTitle.trim(),
          response_body: respBody.trim(),
          author_display: respAuthor.trim() || `${post.demand_target || 'Brand'} Corporate`,
        }),
      });
      if (res.ok) {
        setIsResponding(false);
        fetchPost();
      }
    } catch (err) {
      console.error('Error publishing response:', err);
    }
  };

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
            <h2 className="text-xl font-bold tracking-tight text-ink mt-2">Opinion Not Found</h2>
            <p className="text-meta text-ink-3 mt-2">
              This permanent URL does not exist or was removed.
            </p>
            <Link href="/" className="btn btn-ghost btn-sm mt-5">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Arena Board</span>
            </Link>
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
        <div className="orb orb-gold -top-48 left-1/4 -translate-x-1/2 opacity-70" aria-hidden />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
          {/* Back Link */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-meta text-ink-3 hover:text-ink font-medium mb-6 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Arena Board</span>
          </Link>

          {/* Post Hero Slab */}
          <div className="panel rounded-card p-5 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-line">
              {/* Rank and Author */}
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-14 h-14 rounded-control flex flex-col items-center justify-center gap-0.5 shrink-0 ${
                    isRank1
                      ? 'bg-gold/15 text-gold-text ring-1 ring-gold/35 shadow-[0_0_26px_-6px_rgb(var(--gold)/0.6)]'
                      : 'sunken text-ink'
                  }`}
                >
                  {isRank1 && <Trophy className="w-3.5 h-3.5" aria-hidden />}
                  <span className="metric text-lg leading-none">#{post.rank || '—'}</span>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="chip text-steel">
                      <ShieldCheck className="w-3 h-3" />
                      {post.author_display}
                    </span>

                    {post.kind === 'demand' && (
                      <span className="chip text-gold-text">
                        <Megaphone className="w-3 h-3" />
                        Demand @{post.demand_target || 'Brand'}
                      </span>
                    )}

                    <span className="text-meta text-ink-3 tnum">{timeAgo(post.created_at)}</span>
                  </div>

                  <div className="micro-label text-ink-3 mt-1.5 flex items-center gap-1.5">
                    <Lock className="w-3 h-3" aria-hidden />
                    <span>Immutable public record</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <HoldToLikeButton
                  postId={post.id}
                  initialLikes={post.like_units}
                  onLikeExecuted={fetchPost}
                  onInsufficientFunds={() => setIsTopUpOpen(true)}
                />

                <button
                  onClick={() => setIsCounterOpen(true)}
                  className="btn btn-ghost btn-sm text-down hover:border-down/40"
                  title="Launch counter-opinion rebuttal"
                >
                  <Swords className="w-3.5 h-3.5" />
                  <span>Counter This</span>
                </button>

                <button
                  onClick={() => setIsShareOpen(true)}
                  className="btn btn-ghost btn-sm"
                  title="Generate a shareable flex card"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Flex Card</span>
                </button>

                <button onClick={() => setIsBoostOpen(true)} className="btn btn-gold btn-sm">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Boost</span>
                </button>
              </div>
            </div>

            {/* Statement & Body Content */}
            <div className="my-6">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink leading-tight">
                {post.title}
              </h1>

              {/* Linked External Post Reference (§4) */}
              {post.source_url && (
                <div className="mt-5 sunken rounded-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-white/[0.05] border border-line flex items-center justify-center text-ink-3 shrink-0">
                      <Megaphone className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="micro-label text-ink-3 block">
                        Linked external post ({post.source_platform?.toUpperCase() || 'EXTERNAL'})
                      </span>
                      <span className="text-meta text-ink-2 line-clamp-1 break-all">
                        {post.source_url}
                      </span>
                    </div>
                  </div>

                  <a
                    href={post.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-xs shrink-0"
                  >
                    <span>View Original Post</span>
                    <Share2 className="w-3 h-3" />
                  </a>
                </div>
              )}

              {post.body && (
                <div className="mt-5 sunken rounded-card p-5 text-[15px] text-ink-2 leading-relaxed whitespace-pre-wrap">
                  {post.body}
                </div>
              )}
            </div>

            {/* Official Brand Response Section (§9) */}
            {post.brand_response ? (
              <div className="my-6 card rounded-card p-5 sm:p-6 bg-up/[0.04]">
                <div className="flex items-center justify-between gap-3 flex-wrap pb-3 border-b border-line mb-3">
                  <span className="chip text-up">
                    <CheckCircle2 className="w-3 h-3" />
                    Official on-the-record brand response
                  </span>
                  <span className="text-meta text-ink-3">
                    By {post.brand_response.author_display}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-ink mb-2">{post.brand_response.title}</h3>
                <p className="text-[15px] text-ink-2 leading-relaxed">{post.brand_response.body}</p>
              </div>
            ) : post.kind === 'demand' && (
              <div className="my-6 sunken rounded-card px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-meta text-ink-2">
                  <Building2 className="w-4 h-4 text-ink-3" aria-hidden />
                  <span>
                    Represent {post.demand_target || 'this company'}? Answer this consumer mandate on
                    the public record.
                  </span>
                </div>
                <button onClick={() => setIsResponding(true)} className="btn btn-ghost btn-xs shrink-0">
                  Official Response
                </button>
              </div>
            )}

            {/* If Brand is responding */}
            {isResponding && (
              <form
                onSubmit={handleBrandRespond}
                className="my-6 card rounded-card p-5 sm:p-6 space-y-4 animate-rise"
              >
                <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-ink-3" aria-hidden />
                  <span>Publish official brand statement</span>
                </h3>

                <div>
                  <label className="kicker block mb-1.5">Response headline</label>
                  <input
                    type="text"
                    required
                    value={respTitle}
                    onChange={(e) => setRespTitle(e.target.value)}
                    placeholder="e.g. Official Update: Batch Testing Approved"
                    className="field"
                  />
                </div>

                <div>
                  <label className="kicker block mb-1.5">Official response message</label>
                  <textarea
                    rows={3}
                    required
                    value={respBody}
                    onChange={(e) => setRespBody(e.target.value)}
                    placeholder="Explain your company's official stance..."
                    className="field resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsResponding(false)}
                    className="btn btn-ghost btn-sm"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-ghost btn-sm text-gold-text hover:border-gold/40">
                    Publish to Permanent Ledger
                  </button>
                </div>
              </form>
            )}

            {/* Dual Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 border-t border-line">
              <div className="card rounded-card p-3.5">
                <div className="micro-label text-ink-3">Current decayed score</div>
                <div className="metric text-2xl text-gold-text mt-1 tnum">
                  {formatScore(post.display_score)}
                </div>
              </div>

              <div className="card rounded-card p-3.5">
                <div className="micro-label text-ink-3">Total distinct backers</div>
                <div className="metric text-2xl text-ink mt-1 tnum">
                  {post.backers_count.toLocaleString()}
                </div>
              </div>

              <div className="card rounded-card p-3.5">
                <div className="micro-label text-ink-3">Penny likes (1¢)</div>
                <div className="metric text-2xl text-ink mt-1 tnum">
                  {post.like_units.toLocaleString()}
                </div>
              </div>

              <div className="card rounded-card p-3.5">
                <div className="micro-label text-ink-3">Gross backing raised</div>
                <div className="metric text-2xl text-ink mt-1 tnum">
                  {formatCents(post.total_raised_cents)}
                </div>
              </div>
            </div>
          </div>

          {/* 2-Column Section: Crowd Backers & Interaction Ledger */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <div className="panel rounded-card overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
                <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
                  <Users className="w-4 h-4 text-ink-3" aria-hidden />
                  <span>Penny Army backers</span>
                </h2>
                <span className="chip text-steel tnum">{backers.length}</span>
              </div>

              {backers.length > 0 ? (
                <div className="divide-y divide-line">
                  {backers.map((backer: any, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-white/[0.04]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-full sunken flex items-center justify-center text-micro font-semibold text-ink-2 shrink-0">
                          {(backer.name || 'A').substring(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="block text-dense font-semibold text-ink truncate">
                            {backer.name || 'Anonymous Backer'}
                          </span>
                          <span className="micro-label text-ink-3">
                            {backer.boostCount || 1} contribution(s)
                          </span>
                        </div>
                      </div>

                      <span className="text-dense font-semibold text-gold-text tnum shrink-0">
                        {formatCents(backer.totalCents || 100)}
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
                <span className="chip text-steel tnum">{interactions.length}</span>
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
                        <span className="chip text-gold-text shrink-0">
                          Achieved #{i.achieved_rank}
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
        onSuccess={() => fetchPost()}
      />

      <CounterPostModal
        parentPost={post}
        isOpen={isCounterOpen}
        onClose={() => setIsCounterOpen(false)}
        onCounterCreated={() => fetchPost()}
      />

      <ShareCardModal
        post={post}
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />

      <WalletTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        currentBalanceCents={0}
        onTopUpSuccess={() => {
          fetchPost();
          setIsTopUpOpen(false);
        }}
      />
    </div>
  );
}

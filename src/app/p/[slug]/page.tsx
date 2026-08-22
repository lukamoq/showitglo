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
  Flame,
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
      <div className="min-h-screen bg-[#060709] text-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-amber-400 font-mono text-sm">
            <span className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
            <span>Retrieving permanent ledger record...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-[#060709] text-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <h2 className="text-xl font-bold text-white">Opinion Not Found</h2>
          <p className="text-xs text-slate-400 mt-1">This permanent URL does not exist or was removed.</p>
          <Link href="/" className="mt-4 btn-glass-gold px-4 py-2 rounded-xl text-xs font-bold">
            Back to Arena Board
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060709] text-white flex flex-col relative overflow-x-hidden">
      <div className="orb-glow-gold top-20 left-1/3 -translate-x-1/2 opacity-50" />
      <div className="orb-glow-cyan top-40 right-1/4 opacity-40" />

      <Navbar />

      <div className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Back Link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-medium mb-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Arena Board</span>
        </Link>

        {/* Post Hero Card */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/20 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
            {/* Rank and Author */}
            <div className="flex items-center gap-3">
              <div
                className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-mono font-black shadow-lg ${
                  post.rank === 1
                    ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-black shadow-amber-400/30'
                    : 'glass-segmented text-white text-lg'
                }`}
              >
                {post.rank === 1 && <Trophy className="w-4 h-4 text-black" />}
                <span className="text-lg">#{post.rank || '—'}</span>
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {post.author_display}
                  </span>

                  {post.kind === 'demand' && (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold font-mono flex items-center gap-1">
                      <Megaphone className="w-3.5 h-3.5 text-amber-400" />
                      Demand: @{post.demand_target || 'Brand'}
                    </span>
                  )}

                  <span className="text-xs text-slate-400 font-mono">
                    {timeAgo(post.created_at)}
                  </span>
                </div>
                <div className="text-[11px] text-purple-400 font-mono mt-1 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>Immutable Public Record</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <HoldToLikeButton
                postId={post.id}
                initialLikes={post.like_units}
                onLikeExecuted={fetchPost}
                onInsufficientFunds={() => setIsTopUpOpen(true)}
              />

              <button
                onClick={() => setIsCounterOpen(true)}
                className="px-3.5 py-2 rounded-xl glass-card border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5 hover:border-rose-500/80 cursor-pointer"
              >
                <Swords className="w-3.5 h-3.5 text-rose-400" />
                <span>Counter This</span>
              </button>

              <button
                onClick={() => setIsShareOpen(true)}
                className="btn-glass-dark px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Flex Card</span>
              </button>

              <button
                onClick={() => setIsBoostOpen(true)}
                className="btn-glass-gold px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-lg"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Boost</span>
              </button>
            </div>
          </div>

          {/* Statement & Body Content */}
          <div className="my-6">
            <h1 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight">
              {post.title}
            </h1>

            {/* Linked External Post Reference (§4) */}
            {post.source_url && (
              <div className="mt-4 p-4 rounded-2xl glass-card border border-purple-500/30 bg-purple-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                    <Megaphone className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-purple-300 uppercase font-mono font-bold block">
                      Linked External Post ({post.source_platform?.toUpperCase() || 'EXTERNAL'})
                    </span>
                    <span className="text-xs text-slate-300 font-mono line-clamp-1">
                      {post.source_url}
                    </span>
                  </div>
                </div>

                <a
                  href={post.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-glass-dark px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 text-purple-300 hover:text-white shrink-0"
                >
                  <span>View Original Post</span>
                  <Share2 className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {post.body && (
              <div className="mt-4 p-5 rounded-2xl glass-card text-sm sm:text-base text-slate-200 leading-relaxed whitespace-pre-wrap">
                {post.body}
              </div>
            )}
          </div>

          {/* Official Brand Response Section (§9) */}
          {post.brand_response ? (
            <div className="my-6 p-6 rounded-3xl bg-emerald-950/30 border border-emerald-500/40 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-emerald-500/20 mb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-sm text-emerald-300">
                    Official On-the-Record Brand Response
                  </span>
                </div>
                <span className="text-xs font-mono text-emerald-400/80">
                  By {post.brand_response.author_display}
                </span>
              </div>
              <h3 className="text-base font-bold text-white mb-2">{post.brand_response.title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{post.brand_response.body}</p>
            </div>
          ) : post.kind === 'demand' && (
            <div className="my-6 p-4 rounded-2xl glass-segmented border border-white/10 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Building2 className="w-4 h-4 text-cyan-400" />
                <span>Represent {post.demand_target || 'this company'}? Answer this consumer mandate on the public record.</span>
              </div>
              <button
                onClick={() => setIsResponding(true)}
                className="btn-glass-cyan px-3 py-1.5 rounded-xl font-bold cursor-pointer"
              >
                Official Response
              </button>
            </div>
          )}

          {/* If Brand is responding */}
          {isResponding && (
            <form onSubmit={handleBrandRespond} className="my-6 p-6 rounded-3xl glass-card border border-cyan-500/40 space-y-4">
              <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                <span>Publish Official Brand Statement</span>
              </h3>
              <div>
                <label className="text-xs text-slate-300 block mb-1">Response Headline</label>
                <input
                  type="text"
                  required
                  value={respTitle}
                  onChange={(e) => setRespTitle(e.target.value)}
                  placeholder="e.g. Official Update: Batch Testing Approved"
                  className="w-full px-4 py-2 rounded-xl glass-card border border-white/10 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-1">Official Response Message</label>
                <textarea
                  rows={3}
                  required
                  value={respBody}
                  onChange={(e) => setRespBody(e.target.value)}
                  placeholder="Explain your company's official stance..."
                  className="w-full px-4 py-2 rounded-xl glass-card border border-white/10 text-xs text-white resize-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsResponding(false)}
                  className="btn-glass-dark px-3 py-1.5 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-glass-cyan px-4 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Publish to Permanent Ledger
                </button>
              </div>
            </form>
          )}

          {/* Dual Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 border-t border-white/10">
            <div className="glass-card p-3 rounded-2xl">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Current Decayed Score</div>
              <div className="text-xl font-black font-mono text-amber-400 mt-0.5 tabular-nums">
                {formatScore(post.display_score)}
              </div>
            </div>

            <div className="glass-card p-3 rounded-2xl">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Total Distinct Backers</div>
              <div className="text-xl font-black font-mono text-cyan-400 mt-0.5 tabular-nums">
                {post.backers_count.toLocaleString()}
              </div>
            </div>

            <div className="glass-card p-3 rounded-2xl">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Penny Likes (1¢)</div>
              <div className="text-xl font-black font-mono text-rose-400 mt-0.5 tabular-nums">
                {post.like_units.toLocaleString()}
              </div>
            </div>

            <div className="glass-card p-3 rounded-2xl">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Gross Backing Raised</div>
              <div className="text-xl font-black font-mono text-white mt-0.5 tabular-nums">
                {formatCents(post.total_raised_cents)}
              </div>
            </div>
          </div>
        </div>

        {/* 2-Column Section: Crowd Backers & Interaction Ledger */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="glass-panel p-6 rounded-3xl border border-white/10 shadow-xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-cyan-400" />
              <span>Penny Army Backers ({backers.length})</span>
            </h3>

            {backers.length > 0 ? (
              <div className="space-y-2.5">
                {backers.map((backer: any, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-xl glass-card text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold text-white text-[11px]">
                        {(backer.name || 'A').substring(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-semibold text-white block">{backer.name || 'Anonymous Backer'}</span>
                        <span className="text-[10px] text-slate-400">{backer.boostCount || 1} contribution(s)</span>
                      </div>
                    </div>

                    <div className="font-mono font-bold text-amber-300">
                      {formatCents(backer.totalCents || 100)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-6 text-center">Be the first to back this opinion with 1¢!</p>
            )}
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-white/10 shadow-xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Immutable Ledger Timeline</span>
            </h3>

            {interactions.length > 0 ? (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {interactions.map((i: any) => (
                  <div
                    key={i.id}
                    className="p-3 rounded-xl glass-card text-xs flex items-center justify-between font-mono"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 font-bold">
                          +{formatCents(i.amount_cents)}
                        </span>
                        <span className="text-slate-400 font-sans">by {i.payer_display}</span>
                      </div>
                      <span className="text-[10px] text-slate-500">{timeAgo(i.settled_at || i.created_at)}</span>
                    </div>

                    {i.achieved_rank && (
                      <span className="px-2 py-0.5 rounded bg-white/10 text-slate-300 text-[10px] font-bold">
                        Achieved #{i.achieved_rank}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-6 text-center">No interactions recorded yet.</p>
            )}
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

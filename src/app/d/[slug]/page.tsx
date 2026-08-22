'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/layout/Navbar';
import { BoostDrawer } from '@/components/boost/BoostDrawer';
import { WalletTopUpModal } from '@/components/wallet/WalletTopUpModal';
import { DebateView, RankedPostView } from '@/lib/types';
import { formatUSD, formatCents, timeAgo } from '@/lib/utils';
import { Swords, Users, ShieldCheck, Zap, ArrowLeft, Trophy, Heart, MessageSquare, Send, Sparkles, CheckCircle2 } from 'lucide-react';
import { HoldToLikeButton } from '@/components/interactions/HoldToLikeButton';
import confetti from 'canvas-confetti';

export default function SingleDebatePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug as string;
  const initialSide = searchParams.get('side');

  const [debate, setDebate] = useState<DebateView | null>(null);
  const [selectedPost, setSelectedPost] = useState<RankedPostView | null>(null);
  const [isBoostOpen, setIsBoostOpen] = useState(false);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);

  // Opinion Form State
  const [chosenSideKey, setChosenSideKey] = useState<string>('');
  const [opinionText, setOpinionText] = useState('');
  const [authorName, setAuthorName] = useState('Marc (ShipFast)');
  const [isPaidConviction, setIsPaidConviction] = useState(false);
  const [boostAmountCents, setBoostAmountCents] = useState(100); // $1.00
  const [isSubmittingOpinion, setIsSubmittingOpinion] = useState(false);
  const [opinionSuccess, setOpinionSuccess] = useState(false);

  const fetchDebate = async () => {
    if (!slug) return;
    try {
      const res = await fetch(`/api/v1/debates/${slug}`);
      const data = await res.json();
      if (data.debate) {
        setDebate(data.debate);
        if (!chosenSideKey && data.debate.sides.length > 0) {
          if (initialSide && data.debate.sides.some((s: any) => s.side_key === initialSide)) {
            setChosenSideKey(initialSide);
          } else {
            setChosenSideKey(data.debate.sides[0].side_key);
          }
        }
      }
    } catch (err) {
      console.error('Error loading debate:', err);
    }
  };

  useEffect(() => {
    fetchDebate();
  }, [slug]);

  const handlePostOpinion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosenSideKey || !opinionText.trim()) return;

    setIsSubmittingOpinion(true);
    try {
      const res = await fetch(`/api/v1/debates/${slug}/back`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side_key: chosenSideKey,
          kind: isPaidConviction ? 'boost' : 'free_opinion',
          amount_cents: isPaidConviction ? boostAmountCents : 0,
          payer_display: authorName,
          opinion_text: opinionText.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#06b6d4', '#fbbf24', '#a855f7'],
        });
        setOpinionText('');
        setOpinionSuccess(true);
        setTimeout(() => setOpinionSuccess(false), 4000);
        fetchDebate();
      }
    } catch (err) {
      console.error('Failed to post opinion:', err);
    } finally {
      setIsSubmittingOpinion(false);
    }
  };

  if (!debate) {
    return (
      <div className="min-h-screen bg-[#060709] text-white flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <span className="text-amber-400 font-mono text-sm">Loading arena debate...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060709] text-white flex flex-col relative overflow-x-hidden">
      <div className="orb-glow-gold top-20 left-1/3 opacity-40" />
      <div className="orb-glow-cyan top-40 right-1/4 opacity-40" />

      <Navbar />

      <div className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <Link
          href="/debates"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-medium mb-6 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to All Debates</span>
        </Link>

        {/* Debate Hero Panel */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/20 shadow-2xl relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900/80 to-slate-950 mb-8">
          <div className="flex items-center justify-between pb-4 border-b border-white/10 text-xs flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono font-bold uppercase text-[10px]">
                {debate.sides.length}-Way Multi-Faction War
              </span>
              {debate.sponsor_label && (
                <span className="text-emerald-400 font-mono flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {debate.sponsor_label}
                </span>
              )}
            </div>

            <span className="font-mono text-slate-400">
              Total Raised: <strong className="text-white">{formatCents(debate.total_money_cents)}</strong> •{' '}
              <strong className="text-cyan-400">{debate.total_backers.toLocaleString()}</strong> distinct backers
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold text-white my-6 leading-tight">
            {debate.question}
          </h1>

          {/* Multi-Segment Tug-of-War Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs font-mono font-bold mb-2 flex-wrap gap-2">
              {debate.sides.map((side) => (
                <span key={side.side_key} style={{ color: side.color || '#fbbf24' }} className="flex items-center gap-1">
                  <span>{side.label.split(' ')[0]}: {side.percentage}%</span>
                  <span className="text-slate-400 font-normal">({side.backers_count} backers)</span>
                </span>
              ))}
            </div>

            <div className="h-5 rounded-full bg-black/70 p-1 border border-white/10 flex overflow-hidden shadow-inner gap-0.5">
              {debate.sides.map((side) => (
                <div
                  key={side.side_key}
                  style={{
                    width: `${side.percentage}%`,
                    backgroundColor: side.color || '#fbbf24',
                  }}
                  className="h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full opacity-90 hover:opacity-100"
                  title={`${side.label}: ${side.percentage}%`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Free Opinion & Argument Submission Card */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-cyan-500/30 shadow-2xl relative overflow-hidden bg-gradient-to-br from-slate-950 via-cyan-950/20 to-slate-950 mb-10">
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 font-bold uppercase mb-1">
            <MessageSquare className="w-4 h-4" />
            <span>Cast Your Vote & Share Uncensored Argument</span>
          </div>
          <h2 className="text-xl font-bold text-white">
            Take Your Stance (Free Community Opinion)
          </h2>
          <p className="text-xs text-slate-300 mt-1 mb-5">
            You don&apos;t need to bet or pay anything to share your opinion here. Speak freely, defend your preferred side, or optionally boost your conviction.
          </p>

          {opinionSuccess && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Your argument and vote have been published to the permanent public record!</span>
            </div>
          )}

          <form onSubmit={handlePostOpinion} className="space-y-4">
            {/* Pick your side */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                Select Your Side / Faction *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {debate.sides.map((side) => (
                  <button
                    type="button"
                    key={side.side_key}
                    onClick={() => setChosenSideKey(side.side_key)}
                    style={{
                      borderColor: chosenSideKey === side.side_key ? side.color : 'rgba(255,255,255,0.1)',
                      backgroundColor: chosenSideKey === side.side_key ? `${side.color}25` : 'rgba(255,255,255,0.03)',
                      color: chosenSideKey === side.side_key ? '#fff' : '#94a3b8',
                    }}
                    className="p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <span className="font-bold text-xs line-clamp-1">{side.label}</span>
                    <span className="text-[10px] font-mono mt-1 opacity-80">{side.percentage}% share</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Opinion text */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Your Uncensored Argument / Thesis *
              </label>
              <textarea
                rows={3}
                required
                value={opinionText}
                onChange={(e) => setOpinionText(e.target.value)}
                placeholder={`Why is your chosen side the undisputed winner? Share your raw thoughts...`}
                className="w-full px-4 py-2.5 rounded-xl glass-card border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 resize-none"
              />
            </div>

            {/* Free vs Paid Conviction Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-white/5">
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPaidConviction}
                    onChange={(e) => setIsPaidConviction(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-amber-400"
                  />
                  <span>Optional Micro-Boost</span>
                </label>

                {isPaidConviction && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[1, 5, 10, 25, 50, 100].map((cents) => (
                      <button
                        type="button"
                        key={cents}
                        onClick={() => setBoostAmountCents(cents)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold cursor-pointer ${
                          boostAmountCents === cents ? 'bg-amber-500 text-black' : 'glass-card text-slate-400 hover:text-white'
                        }`}
                      >
                        {cents < 100 ? `${cents}¢` : `$${cents / 100}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmittingOpinion || !opinionText.trim()}
                className="btn-glass-cyan px-6 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {isSubmittingOpinion
                    ? 'Publishing Argument...'
                    : isPaidConviction
                    ? `Post Argument + ${boostAmountCents < 100 ? `${boostAmountCents}¢` : `$${boostAmountCents / 100}`} Boost`
                    : '⚡ Cast Vote & Post Opinion ($0.00 Free)'}
                </span>
              </button>
            </div>
          </form>
        </div>

        {/* Faction Roster & Arguments Streams */}
        <div className="space-y-8">
          <div className="flex items-center gap-2 text-base font-bold text-white">
            <Swords className="w-4 h-4 text-amber-400" />
            <span>Live Arguments & Faction Rosters</span>
          </div>

          <div className={`grid grid-cols-1 ${debate.sides.length > 2 ? 'lg:grid-cols-2' : 'grid-cols-1'} gap-6`}>
            {debate.sides.map((side) => (
              <div
                key={side.side_key}
                className="glass-panel p-6 rounded-3xl border border-white/10 flex flex-col justify-between space-y-5"
              >
                <div>
                  {/* Side Title & Score */}
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div>
                      <span
                        style={{ color: side.color }}
                        className="text-[10px] font-mono uppercase font-bold tracking-wider block"
                      >
                        Faction • {side.percentage}% Market Share
                      </span>
                      <h3 className="text-lg font-bold text-white mt-0.5">
                        {side.label}
                      </h3>
                    </div>

                    <div className="text-right font-mono">
                      <div className="text-sm font-black text-amber-400">
                        {formatCents(side.total_cents)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {side.backers_count} backers
                      </div>
                    </div>
                  </div>

                  {/* Core Thesis Statement */}
                  {side.description && (
                    <div className="my-3 p-3.5 rounded-xl glass-card text-xs text-slate-300 leading-relaxed">
                      {side.description}
                    </div>
                  )}

                  {/* Community Arguments Stream */}
                  <div className="mt-4 space-y-3">
                    <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                      Community Arguments ({side.opinions.length})
                    </span>

                    {side.opinions.length > 0 ? (
                      <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                        {side.opinions.map((op) => (
                          <div
                            key={op.id}
                            className="p-3 rounded-xl glass-card border border-white/5 space-y-1 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-200">
                                {op.author_name}
                              </span>
                              {op.is_paid && (
                                <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                                  Backed ${op.amount_cents / 100}
                                </span>
                              )}
                            </div>
                            <p className="text-slate-300 leading-relaxed text-[11px]">
                              {op.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl glass-segmented text-center text-xs text-slate-500">
                        No community arguments yet. Be the first to defend this side!
                      </div>
                    )}
                  </div>
                </div>

                {/* Backer Actions */}
                <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                  <HoldToLikeButton
                    postId={side.post.id}
                    initialLikes={side.post.like_units}
                    onLikeExecuted={fetchDebate}
                    onInsufficientFunds={() => setIsTopUpOpen(true)}
                  />

                  <button
                    onClick={() => {
                      setSelectedPost(side.post);
                      setIsBoostOpen(true);
                    }}
                    className="btn-glass-gold px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shadow-md"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Boost Faction</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selectedPost && (
        <BoostDrawer
          isOpen={isBoostOpen}
          onClose={() => setIsBoostOpen(false)}
          post={selectedPost}
          onSuccess={() => {
            setIsBoostOpen(false);
            fetchDebate();
          }}
        />
      )}

      <WalletTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => setIsTopUpOpen(false)}
        currentBalanceCents={5000}
        onTopUpSuccess={() => {
          setIsTopUpOpen(false);
          fetchDebate();
        }}
      />
    </div>
  );
}

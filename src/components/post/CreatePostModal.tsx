'use client';

import React, { useState } from 'react';
import { X, Sparkles, AlertCircle, ShieldCheck, Zap, Megaphone, Mic, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { runGate0Moderation } from '@/lib/moderation/gate0';
import { formatUSD } from '@/lib/utils';
import confetti from 'canvas-confetti';

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated: (post: any) => void;
}

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  isOpen,
  onClose,
  onPostCreated,
}) => {
  const [postMode, setPostMode] = useState<'opinion' | 'linked' | 'demand'>('opinion');
  const [sourceUrl, setSourceUrl] = useState('');
  const [demandTarget, setDemandTarget] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [authorDisplay, setAuthorDisplay] = useState('Marc (ShipFast)');
  const [initialBoostCents, setInitialBoostCents] = useState<number>(500); // $5.00 default initial backing
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (postMode === 'demand' && !demandTarget.trim()) {
      setErrorMsg('Target company or brand is required for a demand.');
      return;
    }

    if (postMode === 'linked' && !sourceUrl.trim()) {
      setErrorMsg('Source URL is required for a linked post.');
      return;
    }

    const modResult = runGate0Moderation(title, content);
    if (!modResult.passed) {
      setErrorMsg(modResult.reason || 'Content did not pass automated moderation check.');
      return;
    }
    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const formattedTitle =
        postMode === 'demand' && !title.toLowerCase().includes(demandTarget.toLowerCase())
          ? `${demandTarget}: ${title.trim()}`
          : title.trim();

      const res = await fetch('/api/v1/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formattedTitle,
          content: content ? content.trim() : null,
          author_display: authorDisplay,
          category_id: 'global',
          kind: postMode === 'demand' ? 'demand' : 'opinion',
          demand_target: postMode === 'demand' ? demandTarget.trim() : null,
          source_url: postMode === 'linked' ? sourceUrl.trim() : null,
          initial_boost_cents: initialBoostCents,
        }),
      });

      const data = await res.json();
      if (res.ok && data.post) {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#fbbf24', '#f59e0b', '#06b6d4'],
        });
        onPostCreated(data.post);
        onClose();
        setTitle('');
        setContent('');
        setSourceUrl('');
        setDemandTarget('');
      } else {
        setErrorMsg(data.error || 'Failed to submit post.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Submission error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-xl glass-panel rounded-3xl border border-white/20 p-6 sm:p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-amber-400 font-semibold uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Unfiltered Public Record</span>
            </div>
            <h3 className="text-xl font-bold text-white mt-0.5">
              Take The Stage
            </h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full glass-card hover:bg-white/20 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3-Mode Post Kind Selector: Say It Out Loud vs Link a Post vs Demand Change */}
        <div className="mt-4 grid grid-cols-3 gap-1.5 p-1 rounded-2xl glass-segmented border border-white/10 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setPostMode('opinion')}
            className={`py-2 px-2 rounded-xl transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
              postMode === 'opinion' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Mic className="w-4 h-4 text-amber-400 mb-0.5" />
            <span className="font-bold text-[11px] leading-tight">Say It Out Loud</span>
            <span className="text-[9px] text-slate-400 font-normal">Original Stance</span>
          </button>

          <button
            type="button"
            onClick={() => setPostMode('linked')}
            className={`py-2 px-2 rounded-xl transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
              postMode === 'linked' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <LinkIcon className="w-4 h-4 text-purple-400 mb-0.5" />
            <span className="font-bold text-[11px] leading-tight">Link a Post</span>
            <span className="text-[9px] text-slate-400 font-normal">X, YouTube, Reddit</span>
          </button>

          <button
            type="button"
            onClick={() => setPostMode('demand')}
            className={`py-2 px-2 rounded-xl transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
              postMode === 'demand' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Megaphone className="w-4 h-4 text-cyan-400 mb-0.5" />
            <span className="font-bold text-[11px] leading-tight">Demand Change</span>
            <span className="text-[9px] text-slate-400 font-normal">Aim at a Brand</span>
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Linked URL input if in Linked Mode */}
          {postMode === 'linked' && (
            <div>
              <label className="text-xs font-semibold text-purple-300 block mb-1.5 flex items-center justify-between">
                <span>External Post URL (X, YouTube, Reddit, News, etc.) *</span>
                <span className="text-[10px] text-slate-400 font-mono">Won&apos;t get censored here</span>
              </label>
              <div className="relative">
                <input
                  type="url"
                  required
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://x.com/username/status/... or https://youtube.com/..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl glass-card border border-purple-500/40 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-purple-400"
                />
                <LinkIcon className="w-4 h-4 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          )}

          {/* Target Company input if in Demand Mode */}
          {postMode === 'demand' && (
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Target Company, Brand, or Organization *
              </label>
              <input
                type="text"
                required
                value={demandTarget}
                onChange={(e) => setDemandTarget(e.target.value)}
                placeholder="e.g. McDonald's, Tesla, Nintendo, Apple, Valve..."
                className="w-full px-4 py-2.5 rounded-xl glass-card border border-cyan-500/30 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/60"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              {postMode === 'demand'
                ? 'What change are you demanding? *'
                : postMode === 'linked'
                ? 'Your Uncensored Opinion on this Post *'
                : 'What do you want to say out loud? *'}
            </label>
            <input
              type="text"
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                postMode === 'demand'
                  ? 'e.g. Bring back physical climate knobs on all models...'
                  : postMode === 'linked'
                  ? 'e.g. This take completely misses the real economic reality...'
                  : 'e.g. Messi is the greatest footballer of all time, no debate...'
              }
              className="w-full px-4 py-2.5 rounded-xl glass-card border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/50"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Supporting Analysis / Context
            </label>
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Why this matters and why your stance should rise to the top of the internet..."
              className="w-full px-4 py-2.5 rounded-xl glass-card border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400/50 resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Initial Conviction Backing (Debit from Wallet):
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[100, 500, 1000, 2500].map((cents) => (
                <button
                  type="button"
                  key={cents}
                  onClick={() => setInitialBoostCents(cents)}
                  className={`py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                    initialBoostCents === cents
                      ? 'bg-amber-500 text-black font-black shadow-md'
                      : 'glass-card text-slate-300 hover:text-white'
                  }`}
                >
                  ${cents / 100}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="w-full btn-glass-gold py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-xl disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Publishing to Permanent Public Record...</span>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>
                    Put On Stage ({formatUSD(initialBoostCents / 100)})
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

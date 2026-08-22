'use client';

import React, { useState } from 'react';
import { X, Copy, Check, Share2, Sparkles, Trophy, ExternalLink } from 'lucide-react';
import { RankedPostView } from '@/lib/types';
import { formatUSD, formatScore, formatCents } from '@/lib/utils';
import { ShowItGloLogo } from '../brand/ShowItGloLogo';

interface ShareCardModalProps {
  post: RankedPostView | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ShareCardModal: React.FC<ShareCardModalProps> = ({
  post,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !post) return null;

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/p/${post.slug}` : `https://showitglo.com/p/${post.slug}`;
  const tweetText = `Let the world decide what opinion is real. I'm holding #${post.rank} on @ShowItGlo with ${formatCents(post.total_raised_cents)} raised:\n${shareUrl}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md glass-panel rounded-3xl border border-white/20 p-6 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-1.5 text-xs font-mono text-amber-400 font-semibold uppercase">
            <Share2 className="w-3.5 h-3.5" />
            <span>Social Flex Card</span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-full glass-card hover:bg-white/20 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* The Visual Share Card */}
        <div className="mt-4 p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-amber-950/40 to-black border border-amber-500/40 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl" />

          {/* Card Header */}
          <div className="flex items-center justify-between">
            <ShowItGloLogo size={22} withText={true} />

            <div className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
              <Trophy className="w-3 h-3 text-amber-400" />
              Rank #{post.rank}
            </div>
          </div>

          {/* Card Body */}
          <div className="my-5">
            <h4 className="font-bold text-base text-white leading-snug line-clamp-2">
              {post.title}
            </h4>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
              <span>By {post.author_display}</span>
              <span>•</span>
              <span className="text-purple-400 font-mono">Permanent Record</span>
            </div>
          </div>

          {/* Card Metrics */}
          <div className="pt-3 border-t border-white/10 grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Live Score</div>
              <div className="text-lg font-black font-mono text-amber-400 tabular-nums">
                {formatScore(post.display_score)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-mono">Total Raised</div>
              <div className="text-lg font-black font-mono text-white tabular-nums">
                {formatCents(post.total_raised_cents)}
              </div>
            </div>
          </div>

          {/* Slogan Badge on Card */}
          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
            <span className="italic font-medium text-amber-300/90">&ldquo;Let the world decide what opinion is real.&rdquo;</span>
            <span className="font-mono text-slate-500">showitglo.com</span>
          </div>
        </div>

        {/* Share Actions */}
        <div className="mt-5 space-y-2">
          <button
            onClick={handleOpenTwitter}
            className="w-full btn-glass-cyan py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Share Flex on X / Twitter
          </button>

          <button
            onClick={handleCopyLink}
            className="w-full btn-glass-dark py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Permanent Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Permanent Link</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

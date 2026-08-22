'use client';

import React, { useState } from 'react';
import { X, Copy, Check, Share2, Trophy, ExternalLink } from 'lucide-react';
import { RankedPostView } from '@/lib/types';
import { formatScore, formatCents } from '@/lib/utils';
import { ShowItGloLogo } from '../brand/ShowItGloLogo';
import { ModalPortal } from '../system/ModalPortal';
import { useModalChrome } from '../system/useModalChrome';

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
  const [copyError, setCopyError] = useState<string | null>(null);
  const containerRef = useModalChrome(isOpen, onClose);

  if (!isOpen || !post) return null;

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/p/${post.slug}` : `https://showitglo.com/p/${post.slug}`;
  const tweetText = `Let the world decide what opinion is real. I'm holding #${post.rank} on @ShowItGlo with ${formatCents(post.total_raised_cents)} raised:\n${shareUrl}`;

  const handleCopyLink = async () => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied in some browsers/contexts — show the URL so
      // it can still be copied by hand rather than silently pretending it worked.
      setCopyError(shareUrl);
    }
  };

  const handleOpenTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, '_blank');
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(4,6,12,0.65)] backdrop-blur-md">
        <div className="absolute inset-0" onClick={onClose} aria-hidden />

        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-card-title"
          className="relative z-10 w-full max-w-md panel rounded-modal p-6 sm:p-8 overflow-hidden animate-rise"
        >
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-line">
            <div className="min-w-0">
              <div className="kicker-gold kicker flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5" />
                <span>Social flex card</span>
              </div>
              <h3 id="share-card-title" className="text-lg font-bold tracking-tight text-ink mt-1">
                Share this stance
              </h3>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-xs !px-1.5 shrink-0"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* The Visual Share Card */}
          <div className="mt-5 rounded-card p-6 bg-[#0E1017] border border-gold/25 shadow-[0_16px_40px_-12px_rgb(240_168_36/0.15),inset_0_1px_0_rgb(255_255_255/0.08)]">
            {/* Card Header */}
            <div className="flex items-center justify-between gap-3">
              <ShowItGloLogo size={22} withText={true} />

              <span className="chip text-gold-text">
                <Trophy className="w-3 h-3" />
                Rank #{post.rank}
              </span>
            </div>

            {/* Card Body */}
            <div className="my-5">
              <h4 className="font-bold text-base text-ink leading-snug line-clamp-2">
                {post.title}
              </h4>
              <div className="mt-1 flex items-center gap-2 text-meta text-ink-3">
                <span>By {post.author_display}</span>
                <span aria-hidden className="text-ink-3/50">·</span>
                <span>Permanent record</span>
              </div>
            </div>

            {/* Card Metrics */}
            <div className="pt-3 border-t border-line grid grid-cols-2 gap-2">
              <div>
                <div className="micro-label text-ink-3">Live score</div>
                <div className="metric text-lg tnum text-gold-text">
                  {formatScore(post.display_score)}
                </div>
              </div>
              <div>
                <div className="micro-label text-ink-3">Total raised</div>
                <div className="metric text-lg tnum text-ink">
                  {formatCents(post.total_raised_cents)}
                </div>
              </div>
            </div>

            {/* Slogan Badge on Card */}
            <div className="mt-4 pt-3 border-t border-line flex items-center justify-between gap-3">
              <span className="text-meta text-ink-3 italic">&ldquo;Let the world decide what opinion is real.&rdquo;</span>
              <span className="text-micro text-ink-3 shrink-0">showitglo.com</span>
            </div>
          </div>

          {/* Share Actions */}
          <div className="mt-5 space-y-2">
            <button
              type="button"
              onClick={handleOpenTwitter}
              className="btn btn-gold btn-sm w-full"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Share flex on X / Twitter
            </button>

            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className={`btn btn-ghost btn-sm w-full ${copied ? 'text-up' : ''}`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Permanent link copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy permanent link</span>
                </>
              )}
            </button>

            {copyError && (
              <p role="alert" className="text-meta text-down">
                Clipboard access was blocked. Copy this link manually:{' '}
                <span className="break-all text-ink-2">{copyError}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

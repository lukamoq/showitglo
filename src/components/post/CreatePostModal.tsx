'use client';

import React, { useRef, useState } from 'react';
import { X, Sparkles, AlertCircle, Zap, Mic, Link as LinkIcon, Building2, Flame } from 'lucide-react';
import confetti from 'canvas-confetti';

import { FIRST_LIGHT_MINUTES } from '@/lib/firstLight';
import { runGate0Moderation } from '@/lib/moderation/gate0';
import { formatCents } from '@/lib/utils';
import { apiPost, errorText, insufficientFunds, recommendedTopUpCents, useDisplayName } from '../system/api';
import { AdornedField } from '../system/AdornedField';
import { DisplayNameField } from '../system/DisplayNameField';
import { ModalPortal } from '../system/ModalPortal';
import { useModalChrome } from '../system/useModalChrome';
import { useWallet } from '../system/useWallet';
import { WalletTopUpModal } from '../wallet/WalletTopUpModal';

/** What the page should do once the post exists, beyond refreshing the board. */
export interface PostCreatedFollowUp {
  /** Open the post-publish panel: the free window, and the price of holding rank. */
  followUp: boolean;
  /** Surfaced at the top of that panel — e.g. an opening bid that did not settle. */
  note?: string;
}

interface CreatePostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPostCreated: (post: unknown, followUp?: PostCreatedFollowUp) => void;
}

/** The server only accepts these initial backings; anything else is a 400. */
const BACKING_OPTIONS = [0, 10, 100, 1000];

interface CreatePostResponse {
  post?: { id: string; slug: string; title: string };
  boost_error?: { shortfall_cents?: number; message?: string };
}

export const CreatePostModal: React.FC<CreatePostModalProps> = ({ isOpen, onClose, onPostCreated }) => {
  const [postMode, setPostMode] = useState<'opinion' | 'linked' | 'demand'>('opinion');
  const [sourceUrl, setSourceUrl] = useState('');
  const [demandTarget, setDemandTarget] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [authorDisplay, setAuthorDisplay] = useDisplayName();
  const [initialBoostCents, setInitialBoostCents] = useState<number>(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpRecommendation, setTopUpRecommendation] = useState<number | undefined>(undefined);

  const inFlightRef = useRef(false);
  const containerRef = useModalChrome(isOpen, onClose);
  const { balanceCents, refresh: refreshWallet } = useWallet(isOpen);

  if (!isOpen) return null;

  const quickTargets = ['Tesla', 'Apple', "McDonald's", 'OpenAI', 'Google', 'Airlines', 'Central Banks', 'SEC / Regulators'];

  const modes = [
    { key: 'opinion' as const, label: 'Say It Out Loud', sub: 'Uncensored opinion', Icon: Mic },
    { key: 'demand' as const, label: 'Call Out Entity', sub: 'Company / institution', Icon: Building2 },
    { key: 'linked' as const, label: 'Link a Post', sub: 'X, YouTube, Reddit', Icon: LinkIcon },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current || !title.trim()) return;

    if (postMode === 'demand' && !demandTarget.trim()) {
      setErrorMsg('Target company, institution, or organization is required.');
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

    inFlightRef.current = true;
    setErrorMsg(null);
    setIsSubmitting(true);

    const formattedTitle =
      postMode === 'demand' && !title.toLowerCase().includes(demandTarget.toLowerCase())
        ? `${demandTarget}: ${title.trim()}`
        : title.trim();

    const res = await apiPost<CreatePostResponse>('/api/v1/posts', {
      title: formattedTitle,
      content: content ? content.trim() : null,
      author_display: authorDisplay,
      category_id: 'global',
      kind: postMode === 'demand' ? 'demand' : 'opinion',
      demand_target: postMode === 'demand' ? demandTarget.trim() : null,
      source_url: postMode === 'linked' ? sourceUrl.trim() : null,
      initial_boost_cents: initialBoostCents,
    });

    inFlightRef.current = false;
    setIsSubmitting(false);

    if (!res.ok || !res.data?.post) {
      const shortfall = insufficientFunds(res);
      if (shortfall) {
        setTopUpRecommendation(recommendedTopUpCents(shortfall.shortfallCents));
        setErrorMsg('Not enough wallet balance for that initial backing. Add funds or choose "No backing".');
        setIsTopUpOpen(true);
        return;
      }
      setErrorMsg(errorText(res, 'Failed to publish your stance.'));
      return;
    }

    // The post exists; only the optional backing failed. That is exactly what
    // the post-publish panel is for — it prices the live board and can fund the
    // wallet — so hand off rather than leaving the author in a form with an
    // error and no way to finish.
    if (res.data.boost_error) {
      onPostCreated(res.data.post, {
        followUp: true,
        note: 'Your stance is published, but the opening backing could not be charged.',
      });
      onClose();
      setTitle('');
      setContent('');
      setSourceUrl('');
      setDemandTarget('');
      return;
    }

    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#F0A824', '#FFC53D', '#FFFFFF'],
    });
    onPostCreated(res.data.post, { followUp: true });
    onClose();
    setTitle('');
    setContent('');
    setSourceUrl('');
    setDemandTarget('');
  };

  return (
    <>
      <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(4,6,12,0.65)] backdrop-blur-md">
          <div className="absolute inset-0" onClick={onClose} aria-hidden />

          <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-post-title"
            className="relative z-10 w-full max-w-xl panel rounded-modal p-6 sm:p-8 overflow-hidden max-h-[90vh] overflow-y-auto animate-rise"
          >
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-line">
              <div className="min-w-0">
                <div className="kicker-gold kicker flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Unfiltered public record</span>
                </div>
                <h3 id="create-post-title" className="text-lg font-bold tracking-tight text-ink mt-1">
                  Take the public stage
                </h3>
              </div>

              <button type="button" onClick={onClose} className="btn btn-ghost btn-xs !px-1.5 shrink-0" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 3-Mode Post Kind Selector */}
            <div className="mt-4 seg w-full">
              {modes.map(({ key, label, sub, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPostMode(key)}
                  aria-pressed={postMode === key}
                  className={`seg-item flex-1 flex-col text-center !py-2.5 ${postMode === key ? 'seg-item-active' : ''}`}
                >
                  <Icon className="w-4 h-4 mb-0.5" />
                  <span className="leading-tight">{label}</span>
                  <span className="text-micro opacity-70 font-normal">{sub}</span>
                </button>
              ))}
            </div>

            {errorMsg && (
              <div
                id="create-post-error"
                role="alert"
                className="mt-4 rounded-control bg-down/10 border border-down/30 text-down text-dense p-3 flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {/* Linked URL input */}
              {postMode === 'linked' && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label htmlFor="post-source-url" className="kicker">
                      External post URL *
                    </label>
                    <span className="text-micro text-ink-3">Won&apos;t get censored here</span>
                  </div>
                  <AdornedField
                    id="post-source-url"
                    type="url"
                    required
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://x.com/username/status/…"
                    prefix={<LinkIcon className="w-4 h-4" />}
                    inputClassName="text-dense"
                  />
                </div>
              )}

              {/* Target company / institution */}
              {postMode === 'demand' && (
                <div className="space-y-2">
                  <label htmlFor="post-demand-target" className="kicker block mb-1.5">
                    Target company, institution, or regulatory body *
                  </label>
                  <input
                    id="post-demand-target"
                    type="text"
                    required
                    maxLength={80}
                    value={demandTarget}
                    onChange={(e) => setDemandTarget(e.target.value)}
                    placeholder="e.g. Tesla, Apple, McDonald's, OpenAI, Central Banks, FIFA…"
                    className="field"
                  />

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="micro-label text-ink-3">Popular</span>
                    {quickTargets.map((target) => (
                      <button
                        type="button"
                        key={target}
                        onClick={() => setDemandTarget(target)}
                        className="chip text-steel hover:text-gold-text transition-colors cursor-pointer"
                      >
                        {target}
                      </button>
                    ))}
                  </div>

                  <div className="sunken rounded-control p-3 text-meta text-ink-2 leading-relaxed flex items-start gap-2">
                    <Flame className="w-3.5 h-3.5 shrink-0 mt-0.5 text-ink-3" />
                    <span>
                      <strong className="text-ink font-semibold">How escalation works:</strong> the more money the crowd
                      puts behind this demand, the higher it climbs the global board — and the harder it is for the target
                      to ignore. Nothing here obliges anyone to reply.
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="post-title" className="kicker block mb-1.5">
                  {postMode === 'demand'
                    ? 'What change or accountability are you demanding? *'
                    : postMode === 'linked'
                    ? 'Your uncensored opinion on this post *'
                    : 'What do you want to say out loud? *'}
                </label>
                <input
                  id="post-title"
                  type="text"
                  required
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  aria-describedby={errorMsg ? 'create-post-error' : undefined}
                  placeholder={
                    postMode === 'demand'
                      ? 'e.g. Add physical buttons for wipers and climate control…'
                      : postMode === 'linked'
                      ? 'e.g. This policy will completely distort the housing market…'
                      : 'e.g. Modern institutions are ignoring the real root cause of inflation…'
                  }
                  className="field"
                />
              </div>

              <div>
                <label htmlFor="post-content" className="kicker block mb-1.5">
                  Supporting arguments / context
                </label>
                <textarea
                  id="post-content"
                  rows={3}
                  maxLength={2000}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Why this matters and why your stance should rise to the top of the internet…"
                  className="field resize-none"
                />
              </div>

              <DisplayNameField id="create-post-alias" value={authorDisplay} onChange={setAuthorDisplay} />

              <div>
                <span className="kicker block mb-1.5" id="initial-backing-label">
                  Initial conviction backing
                </span>
                {/* Said before the amounts, not after: "None" has to read as a
                    real choice, because it is one. */}
                <p className="text-micro text-ink-3 mb-2 leading-relaxed">
                  Optional. Every new stance is carried free on{' '}
                  <span className="text-ink-2">First Light</span> for {FIRST_LIGHT_MINUTES} minutes,
                  newest first, whatever you back it with — including nothing. Backing decides where it
                  ranks once that window closes.
                </p>
                <div className="grid grid-cols-4 gap-2" role="group" aria-labelledby="initial-backing-label">
                  {BACKING_OPTIONS.map((cents) => (
                    <button
                      type="button"
                      key={cents}
                      onClick={() => setInitialBoostCents(cents)}
                      aria-pressed={initialBoostCents === cents}
                      className={`py-2 rounded-control text-dense tnum font-semibold transition-colors cursor-pointer ${
                        initialBoostCents === cents
                          ? 'bg-gold/[0.16] text-gold-text shadow-[inset_0_0_0_1px_rgb(240_168_36/0.35)]'
                          : 'sunken text-ink-3 hover:text-ink'
                      }`}
                    >
                      {cents === 0 ? 'None' : cents < 100 ? `${cents}¢` : `$${cents / 100}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button type="submit" disabled={isSubmitting || !title.trim()} className="btn btn-gold w-full">
                  {isSubmitting ? (
                    <>
                      <span
                        className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black"
                        aria-hidden
                      />
                      <span>Publishing to the public record…</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span className="tnum">
                        {initialBoostCents === 0
                          ? 'Put on stage'
                          : `Put on stage (${formatCents(initialBoostCents)})`}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>

      <WalletTopUpModal
        isOpen={isTopUpOpen}
        onClose={() => {
          setIsTopUpOpen(false);
          void refreshWallet();
        }}
        currentBalanceCents={balanceCents}
        onTopUpSuccess={() => {
          setIsTopUpOpen(false);
          void refreshWallet();
        }}
        recommendedCents={topUpRecommendation}
      />
    </>
  );
};

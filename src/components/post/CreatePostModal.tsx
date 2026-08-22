'use client';

import React, { useState } from 'react';
import { X, Sparkles, AlertCircle, Zap, Mic, Link as LinkIcon, Building2, Flame } from 'lucide-react';
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
  const [initialBoostCents, setInitialBoostCents] = useState<number>(100); // $1.00 accessible default
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const quickTargets = ['Tesla', 'Apple', "McDonald's", 'OpenAI', 'Google', 'Airlines', 'Central Banks', 'SEC / Regulators'];

  const modes = [
    { key: 'opinion' as const, label: 'Say It Out Loud', sub: 'Uncensored opinion', Icon: Mic },
    { key: 'demand' as const, label: 'Call Out Entity', sub: 'Company / institution', Icon: Building2 },
    { key: 'linked' as const, label: 'Link a Post', sub: 'X, YouTube, Reddit', Icon: LinkIcon },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

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
          colors: ['#F0A824', '#FFC53D', '#FFFFFF'],
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(4,6,12,0.65)] backdrop-blur-md">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-xl panel rounded-modal p-6 sm:p-8 overflow-hidden max-h-[90vh] overflow-y-auto animate-rise">
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-line">
          <div className="min-w-0">
            <div className="kicker-gold kicker flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Unfiltered public record</span>
            </div>
            <h3 className="text-lg font-bold tracking-tight text-ink mt-1">
              Take the public stage
            </h3>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost btn-xs !px-1.5 shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3-Mode Post Kind Selector: Say It Out Loud vs Call Out Company/Institution vs Link a Post */}
        <div className="mt-4 seg w-full">
          {modes.map(({ key, label, sub, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setPostMode(key)}
              className={`seg-item flex-1 flex-col text-center !py-2.5 ${
                postMode === key ? 'seg-item-active' : ''
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span className="leading-tight">{label}</span>
              <span className="text-micro opacity-70 font-normal">{sub}</span>
            </button>
          ))}
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-control bg-down/10 border border-down/30 text-down text-dense p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Linked URL input if in Linked Mode */}
          {postMode === 'linked' && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="kicker">External post URL *</label>
                <span className="text-micro text-ink-3">Won&apos;t get censored here</span>
              </div>
              <div className="relative">
                <input
                  type="url"
                  required
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://x.com/username/status/... or https://youtube.com/..."
                  className="field pl-9 text-dense"
                />
                <LinkIcon className="w-4 h-4 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          )}

          {/* Target Company / Institution input if in Demand Mode */}
          {postMode === 'demand' && (
            <div className="space-y-2">
              <label className="kicker block mb-1.5">
                Target company, institution, or regulatory body *
              </label>
              <input
                type="text"
                required
                value={demandTarget}
                onChange={(e) => setDemandTarget(e.target.value)}
                placeholder="e.g. Tesla, Apple, McDonald's, OpenAI, Central Banks, FIFA..."
                className="field"
              />

              {/* Quick suggestion chips */}
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
                  <strong className="text-ink font-semibold">Escalation guarantee:</strong> When the crowd backs this demand with money, it rises to the top of the global board and forces the company/institution to officially respond on the public record.
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="kicker block mb-1.5">
              {postMode === 'demand'
                ? 'What change or accountability are you demanding? *'
                : postMode === 'linked'
                ? 'Your uncensored opinion on this post *'
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
                  ? 'e.g. Add physical buttons for wipers and climate control...'
                  : postMode === 'linked'
                  ? 'e.g. This policy will completely distort the housing market...'
                  : 'e.g. Modern institutions are ignoring the real root cause of inflation...'
              }
              className="field"
            />
          </div>

          <div>
            <label className="kicker block mb-1.5">
              Supporting arguments / context
            </label>
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Why this matters and why your stance should rise to the top of the internet..."
              className="field resize-none"
            />
          </div>

          <div>
            <label className="kicker block mb-1.5">
              Initial conviction backing
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[10, 50, 100, 500].map((cents) => (
                <button
                  type="button"
                  key={cents}
                  onClick={() => setInitialBoostCents(cents)}
                  className={`py-2 rounded-control text-dense tnum font-semibold transition-colors cursor-pointer ${
                    initialBoostCents === cents
                      ? 'bg-gold/[0.16] text-gold-text shadow-[inset_0_0_0_1px_rgb(240_168_36/0.35)]'
                      : 'sunken text-ink-3 hover:text-ink'
                  }`}
                >
                  {cents < 100 ? `${cents}¢` : `$${cents / 100}`}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="btn btn-gold w-full"
            >
              {isSubmitting ? (
                <span>Publishing to permanent public record...</span>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>
                    Put on stage ({formatUSD(initialBoostCents / 100)})
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

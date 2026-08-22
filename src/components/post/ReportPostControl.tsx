'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Flag, X } from 'lucide-react';

import { apiPost, errorText } from '../system/api';

interface ReportPostControlProps {
  postId: string;
  className?: string;
}

/**
 * The reasons the form offers. `private_person` exists separately from
 * `harassment` because "this is about a private individual, not a public
 * figure or a company" is a distinct call a moderator has to make, and
 * collapsing it into harassment loses the one fact that decides it.
 */
const REASONS: { value: string; label: string; hint: string }[] = [
  { value: 'illegal', label: 'Illegal content', hint: 'Breaks the law where it is published' },
  { value: 'harassment', label: 'Harassment or hate', hint: 'Targets or degrades a person or group' },
  { value: 'private_person', label: 'About a private person', hint: 'Names someone who is not a public figure' },
  { value: 'scam', label: 'Scam or fraud', hint: 'Tries to take money or data from readers' },
  { value: 'spam', label: 'Spam', hint: 'Repetitive or purely promotional' },
  { value: 'other', label: 'Something else', hint: 'Tell us below' },
];

const MAX_DETAIL = 500;

/**
 * Reporting a stance.
 *
 * The success state says the same thing whether this was the first report or
 * the one that pulled the post: "Reported — thank you." A reporter learning
 * that their click hid a post would turn the count into a game, and telling
 * them how many others agreed would tell a brigade how many more they need.
 */
export const ReportPostControl: React.FC<ReportPostControlProps> = ({ postId, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  const submit = async () => {
    if (isSending) return;
    if (!reason) {
      setError('Pick a reason.');
      return;
    }

    setIsSending(true);
    setError(null);

    const res = await apiPost('/api/v1/posts/' + encodeURIComponent(postId) + '/report', {
      reason,
      ...(detail.trim() ? { detail: detail.trim() } : {}),
    });
    setIsSending(false);

    if (!res.ok) {
      setError(errorText(res, 'Your report could not be filed. Please try again.'));
      return;
    }

    // A duplicate report comes back 200 as well, and is presented identically:
    // the reporter's answer is "we have it", which is true either way.
    setIsDone(true);
    setIsOpen(false);
  };

  if (isDone) {
    return (
      <span className={`chip text-up ${className ?? ''}`}>
        <CheckCircle2 className="h-3 w-3" />
        Reported — thank you.
      </span>
    );
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => {
          setIsOpen((open) => !open);
          setError(null);
        }}
        aria-expanded={isOpen}
        className="btn btn-ghost btn-sm !text-ink-3 hover:!text-ink"
        title="Report this stance to moderators"
      >
        <Flag className="h-3.5 w-3.5" />
        <span>Report</span>
      </button>

      {isOpen && (
        <div className="panel animate-rise absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-card p-4">
          <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
            <div>
              <div className="kicker">Report this stance</div>
              <p className="mt-1 text-meta text-ink-3">
                Goes to a human moderator. Your identity is not shown to the author.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="btn btn-ghost btn-xs shrink-0 !px-1.5"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <fieldset className="mt-3 space-y-1">
            <legend className="micro-label mb-1.5 text-ink-3">Reason</legend>
            {REASONS.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-control px-2.5 py-2 transition-colors ${
                  reason === option.value ? 'bg-gold/[0.12]' : 'hover:bg-white/[0.04]'
                }`}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={option.value}
                  checked={reason === option.value}
                  onChange={() => {
                    setReason(option.value);
                    setError(null);
                  }}
                  className="mt-1 shrink-0 accent-gold"
                />
                <span className="min-w-0">
                  <span className="block text-dense font-semibold text-ink">{option.label}</span>
                  <span className="block text-meta text-ink-3">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="mt-3">
            <label htmlFor="report-detail" className="micro-label mb-1.5 block text-ink-3">
              Anything else (optional)
            </label>
            <textarea
              id="report-detail"
              rows={2}
              maxLength={MAX_DETAIL}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="What should a moderator look at?"
              className="field w-full resize-none"
            />
          </div>

          {error && (
            <p role="alert" className="mt-2 flex items-start gap-2 text-dense text-down">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </p>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={isSending || !reason}
            className="btn btn-ghost btn-sm mt-3 w-full !text-down hover:border-down/40"
          >
            {isSending ? 'Sending…' : 'Send report'}
          </button>
        </div>
      )}
    </div>
  );
};

'use client';

import React, { useRef, useState } from 'react';
import { X, Swords, Plus, Trash2 } from 'lucide-react';
import confetti from 'canvas-confetti';

import { DebateView } from '@/lib/types';
import { apiPost, errorText, useDisplayName } from '../system/api';
import { DisplayNameField } from '../system/DisplayNameField';
import { ModalPortal } from '../system/ModalPortal';
import { useModalChrome } from '../system/useModalChrome';

interface CreateWarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWarCreated: (debate: DebateView) => void;
}

export const CreateWarModal: React.FC<CreateWarModalProps> = ({
  isOpen,
  onClose,
  onWarCreated,
}) => {
  const [question, setQuestion] = useState('');
  const [sides, setSides] = useState<Array<{ label: string; description: string }>>([
    { label: '', description: '' },
    { label: '', description: '' },
  ]);
  const [authorDisplay, setAuthorDisplay] = useDisplayName();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const inFlightRef = useRef(false);
  const containerRef = useModalChrome(isOpen, onClose);

  if (!isOpen) return null;

  const handleAddSide = () => {
    if (sides.length < 6) {
      setSides([...sides, { label: '', description: '' }]);
    }
  };

  const handleRemoveSide = (idx: number) => {
    if (sides.length > 2) {
      setSides(sides.filter((_, i) => i !== idx));
    }
  };

  const handleSideChange = (idx: number, field: 'label' | 'description', val: string) => {
    const next = [...sides];
    next[idx][field] = val;
    setSides(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current) return;

    if (!question.trim()) {
      setErrorMsg('War / Debate question is required.');
      return;
    }

    const validSides = sides.filter((s) => s.label.trim().length > 0);
    if (validSides.length < 2) {
      setErrorMsg('At least 2 sides/options with labels are required.');
      return;
    }

    inFlightRef.current = true;
    setErrorMsg(null);
    setIsSubmitting(true);

    const res = await apiPost<{ debate: DebateView }>('/api/v1/debates', {
      question: question.trim(),
      sides: validSides,
      author_display: authorDisplay,
    });

    inFlightRef.current = false;
    setIsSubmitting(false);

    if (!res.ok || !res.data?.debate) {
      setErrorMsg(errorText(res, 'Failed to create this war.'));
      return;
    }

    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#EF4E66', '#F0A824', '#FFC53D', '#FFFFFF'],
    });
    onWarCreated(res.data.debate);
    onClose();
    setQuestion('');
    setSides([
      { label: '', description: '' },
      { label: '', description: '' },
    ]);
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(3,4,8,0.72)] backdrop-blur-md">
        <div className="absolute inset-0" onClick={onClose} aria-hidden />

        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-war-title"
          className="relative z-10 w-full max-w-xl panel rounded-modal p-6 sm:p-8 overflow-hidden max-h-[90vh] overflow-y-auto animate-rise"
        >
          <div className="flex items-start justify-between gap-4 pb-5 border-b border-line">
            <div>
              <span className="kicker">Multi-faction arena</span>
              <h2 id="create-war-title" className="display-3 text-ink mt-2">
                Launch a war
              </h2>
              <p className="text-meta text-ink-3 mt-1.5">
                Free to start — anyone can share opinions and vote without paying.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="btn btn-bare btn-sm -mr-2 -mt-1 shrink-0"
            >
              <X className="w-5 h-5" aria-hidden />
            </button>
          </div>

          {errorMsg && (
            <p
              id="create-war-error"
              role="alert"
              className="mt-5 rounded-control border border-down/30 bg-down/10 px-3.5 py-2.5 text-dense text-down"
            >
              {errorMsg}
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="war-question" className="kicker block mb-2">
                War question / topic *
              </label>
              <input
                id="war-question"
                type="text"
                required
                maxLength={200}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                aria-describedby={errorMsg ? 'create-war-error' : undefined}
                placeholder="e.g. Which cloud provider is best: AWS, GCP, Azure or Cloudflare?"
                className="field"
              />
            </div>

            <DisplayNameField id="create-war-alias" value={authorDisplay} onChange={setAuthorDisplay} />

            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="kicker">Factions / sides (2–6) *</span>
                {sides.length < 6 && (
                  <button type="button" onClick={handleAddSide} className="btn btn-bare btn-xs">
                    <Plus className="w-3.5 h-3.5" aria-hidden />
                    <span>Add option</span>
                  </button>
                )}
              </div>

              <div className="rounded-card border border-line divide-y divide-line overflow-hidden">
                {sides.map((side, idx) => (
                  <div key={idx} className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="micro-label text-ink-3 tnum">Option {idx + 1}</span>
                      {sides.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSide(idx)}
                          aria-label={`Remove option ${idx + 1}`}
                          className="btn btn-bare btn-xs hover:!text-down"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden />
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={side.label}
                      onChange={(e) => handleSideChange(idx, 'label', e.target.value)}
                      aria-label={`Option ${idx + 1} label`}
                      placeholder={`e.g. ${idx === 0 ? 'Claude' : idx === 1 ? 'ChatGPT' : idx === 2 ? 'Gemini' : 'Grok'}`}
                      className="field !text-dense !py-2"
                    />

                    <input
                      type="text"
                      maxLength={160}
                      value={side.description}
                      onChange={(e) => handleSideChange(idx, 'description', e.target.value)}
                      aria-label={`Option ${idx + 1} thesis`}
                      placeholder="Short core thesis / strength (optional)"
                      className="field !text-dense !py-2"
                    />
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !question.trim()}
              className="btn btn-gold w-full"
            >
              <Swords className="w-4 h-4" aria-hidden />
              <span>{isSubmitting ? 'Launching…' : 'Launch this war — free'}</span>
            </button>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
};

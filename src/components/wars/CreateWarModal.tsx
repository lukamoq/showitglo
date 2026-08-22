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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
        <div className="absolute inset-0" onClick={onClose} aria-hidden />

        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-war-title"
          className="relative z-10 w-full max-w-xl glass-panel rounded-3xl border border-white/20 p-6 sm:p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-mono text-rose-400 font-semibold uppercase">
                <Swords className="w-3.5 h-3.5" />
                <span>Multi-Faction War Arena</span>
              </div>
              <h3 id="create-war-title" className="text-xl font-bold text-white mt-0.5">
                Launch a New War / Debate
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Free to start • Anyone can share opinions and vote without paying.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-full glass-card hover:bg-white/20 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {errorMsg && (
            <div
              id="create-war-error"
              role="alert"
              className="mt-4 p-3 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs"
            >
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="war-question" className="text-xs font-semibold text-slate-300 block mb-1.5">
                War Question / Topic *
              </label>
              <input
                id="war-question"
                type="text"
                required
                maxLength={200}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                aria-describedby={errorMsg ? 'create-war-error' : undefined}
                placeholder="e.g. Which Cloud Provider is Best: AWS, GCP, Azure, or Cloudflare?"
                className="w-full px-4 py-2.5 rounded-xl glass-card border border-white/10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-400"
              />
            </div>

            <DisplayNameField id="create-war-alias" value={authorDisplay} onChange={setAuthorDisplay} />

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300">
                  Factions / Sides (2 to 6 Options) *
                </label>
                {sides.length < 6 && (
                  <button
                    type="button"
                    onClick={handleAddSide}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Option</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {sides.map((side, idx) => (
                  <div key={idx} className="p-3 rounded-2xl glass-card border border-white/10 relative space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase font-bold text-slate-400">
                        Option {idx + 1}
                      </span>
                      {sides.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSide(idx)}
                          aria-label={`Remove option ${idx + 1}`}
                          className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
                      className="w-full px-3 py-1.5 rounded-lg glass-segmented text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />

                    <input
                      type="text"
                      maxLength={160}
                      value={side.description}
                      onChange={(e) => handleSideChange(idx, 'description', e.target.value)}
                      aria-label={`Option ${idx + 1} thesis`}
                      placeholder="Short core thesis / strength (optional)"
                      className="w-full px-3 py-1.5 rounded-lg glass-segmented text-xs text-slate-300 placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !question.trim()}
                className="w-full py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-xl bg-gradient-to-r from-rose-600 via-purple-600 to-cyan-600 text-white hover:opacity-90 disabled:opacity-50"
              >
                <Swords className="w-4 h-4" />
                <span>{isSubmitting ? 'Igniting War...' : 'Ignite Community War (Free)'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
};

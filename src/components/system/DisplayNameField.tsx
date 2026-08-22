'use client';

import React from 'react';

import { ALIAS_MAX_LENGTH, DEFAULT_ALIAS } from './api';

interface DisplayNameFieldProps {
  id: string;
  value: string;
  onChange: (next: string) => void;
  label?: string;
  hint?: string;
}

/**
 * The name shown next to what you post or back. There are no accounts here, so
 * this is a local preference (stored under `sig_alias`) rather than a profile —
 * leaving it empty publishes as "Anonymous".
 */
export const DisplayNameField: React.FC<DisplayNameFieldProps> = ({
  id,
  value,
  onChange,
  label = 'Shown publicly as',
  hint = 'Saved on this device only. Leave empty to stay Anonymous.',
}) => (
  <div>
    <label htmlFor={id} className="kicker mb-1.5 block">
      {label}
    </label>
    <input
      id={id}
      name={id}
      type="text"
      maxLength={ALIAS_MAX_LENGTH}
      value={value === DEFAULT_ALIAS ? '' : value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={DEFAULT_ALIAS}
      className="field text-dense"
      aria-describedby={`${id}-hint`}
    />
    <p id={`${id}-hint`} className="text-micro mt-1 text-ink-3">
      {hint}
    </p>
  </div>
);

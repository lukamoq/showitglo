'use client';

import React from 'react';

interface AdornedFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  /** Rendered before the input — a currency sign, an icon, a unit. */
  prefix?: React.ReactNode;
  /** Rendered after the input. */
  suffix?: React.ReactNode;
  wrapperClassName?: string;
  inputClassName?: string;
}

/**
 * A text field with an adornment that cannot collide with the placeholder.
 *
 * The obvious version of this — an absolutely positioned "$" plus `className="field pl-7"`
 * — is broken in this codebase: `.field` sets `padding` outside any cascade
 * layer, so it beats Tailwind's `pl-*` (which lives in `@layer utilities`) and
 * the placeholder renders underneath the adornment. So the adornment here is a
 * real flex sibling and the input carries no border, background, or padding of
 * its own: the wrapper is the visible field, and layout does the spacing.
 */
export const AdornedField = React.forwardRef<HTMLInputElement, AdornedFieldProps>(
  ({ prefix, suffix, wrapperClassName = '', inputClassName = '', ...inputProps }, ref) => (
    <div
      className={`flex w-full items-center gap-2 rounded-control border border-line bg-black/[0.32] px-3.5 py-2.5 transition-colors focus-within:border-gold/60 focus-within:ring-[3px] focus-within:ring-gold/[0.15] ${wrapperClassName}`}
    >
      {prefix != null && (
        <span aria-hidden className="shrink-0 select-none leading-none text-ink-3">
          {prefix}
        </span>
      )}

      <input
        ref={ref}
        {...inputProps}
        className={`min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] leading-normal text-ink outline-none placeholder:text-ink-3/75 ${inputClassName}`}
      />

      {suffix != null && (
        <span aria-hidden className="shrink-0 select-none leading-none text-ink-3">
          {suffix}
        </span>
      )}
    </div>
  )
);

AdornedField.displayName = 'AdornedField';

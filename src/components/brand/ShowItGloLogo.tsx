'use client';

import React from 'react';

interface ShowItGloLogoProps {
  className?: string;
  size?: number;
  withText?: boolean;
  textColor?: string;
}

export const ShowItGloLogo: React.FC<ShowItGloLogoProps> = ({
  className = '',
  size = 36,
  withText = false,
  textColor = 'text-ink',
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* The Real 2D Generated Logo Image */}
      <img
        src="/logo.jpg"
        alt="ShowItGlo Logo"
        width={size}
        height={size}
        className="rounded-lg object-cover shrink-0 border border-line"
        style={{ width: `${size}px`, height: `${size}px` }}
      />

      {/* Wordmark */}
      {withText && (
        <div className="flex flex-col">
          <span className={`font-bold tracking-tight text-lg leading-none ${textColor}`}>
            ShowIt<span className="text-gold-text">Glo</span>
          </span>
          <span className="micro-label text-ink-3 mt-0.5">
            Let the world decide
          </span>
        </div>
      )}
    </div>
  );
};

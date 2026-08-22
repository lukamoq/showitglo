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
  textColor = 'text-white',
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* The Real 2D Generated Logo Image */}
      <img
        src="/logo.jpg"
        alt="ShowItGlo Logo"
        width={size}
        height={size}
        className="rounded-xl object-cover shrink-0 shadow-md shadow-amber-500/20 border border-white/10"
        style={{ width: `${size}px`, height: `${size}px` }}
      />

      {/* Wordmark */}
      {withText && (
        <div className="flex flex-col">
          <span className={`font-black tracking-tight text-lg sm:text-xl leading-none ${textColor}`}>
            ShowIt<span className="text-amber-400">Glo</span>
          </span>
          <span className="text-[9px] text-amber-400/90 font-mono tracking-wider uppercase mt-0.5">
            Let the world decide
          </span>
        </div>
      )}
    </div>
  );
};

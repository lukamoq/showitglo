'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders an overlay into `document.body`.
 *
 * Without this, a `position: fixed` overlay is not laid out against the
 * viewport: any ancestor with a `transform`, `filter`, or `backdrop-filter`
 * becomes its containing block. The header rail uses `backdrop-filter`, so the
 * wallet modal — mounted inside the wallet chip, inside that rail — was being
 * clipped to a 64px-tall box and rendered half off-screen. A portal takes the
 * overlay out of that subtree entirely, so every call site gets a true
 * full-viewport overlay regardless of where the trigger lives.
 */
export const ModalPortal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
};

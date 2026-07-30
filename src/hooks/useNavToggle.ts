// hooks/useNavToggle.ts
// Atom hook — simple mobile nav open/close state + click-outside-to-close

import { useState, useEffect, useRef } from 'react';

export function useNavToggle() {
  const [isOpen, setIsOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  const toggle = () => setIsOpen(v => !v);
  const close  = () => setIsOpen(false);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [isOpen]);

  return { isOpen, toggle, close, navRef };
}

// components/molecules/Navbar.tsx
// Glassmorphic premium navbar with responsive hamburger — Atomic Design: Molecule

import { NavLink } from 'react-router-dom';
import { useNavToggle } from '@hooks/useNavToggle';

const NAV_ITEMS = [
  { to: '/',         label: 'Home' },
  { to: '/play',     label: 'Play vs AI' },
  { to: '/analysis', label: 'Analysis' },
  { to: '/stats',    label: 'Player Stats' },
] as const;

export function Navbar() {
  const { isOpen, toggle, close, navRef } = useNavToggle();

  return (
    <nav
      ref={navRef}
      className="w-full sticky top-0 z-50 flex flex-wrap items-center justify-between
                 px-6 md:px-10 py-3.5
                 bg-[rgba(7,9,15,0.85)] backdrop-blur-xl
                 border-b border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
    >
      {/* Brand */}
      <NavLink
        to="/"
        onClick={close}
        className="text-[22px] font-black tracking-tight text-white hover:opacity-90 transition-opacity"
      >
        i<span className="bg-gradient-to-br from-[#00fff5] to-[#00adb5] bg-clip-text text-transparent">Chess</span>
      </NavLink>

      {/* Hamburger (mobile) */}
      <button
        type="button"
        onClick={toggle}
        aria-label="Toggle navigation"
        className="md:hidden bg-white/5 border border-white/10 rounded-lg px-3 py-2
                   text-[#e2e8f0] hover:bg-white/10 hover:text-white transition-colors text-lg leading-none"
      >
        {isOpen ? '✕' : '☰'}
      </button>

      {/* Nav links */}
      <div
        className={`
          ${isOpen ? 'flex' : 'hidden'} md:flex
          w-full md:w-auto
          flex-col md:flex-row
          items-stretch md:items-center
          gap-1.5 mt-3 md:mt-0
          p-2 md:p-1
          bg-[rgba(15,19,34,0.96)] md:bg-white/[0.03]
          border md:border border-[#232c45] md:border-white/[0.06]
          rounded-xl
          backdrop-blur-xl md:backdrop-blur-none
          shadow-[0_12px_36px_rgba(0,0,0,0.6)] md:shadow-none
          animate-[slideNav_0.2s_ease-out] md:animate-none
        `}
      >
        {NAV_ITEMS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={close}
            className={({ isActive }) =>
              `px-[18px] py-2 rounded-lg text-[13.5px] font-semibold transition-all duration-200
               border border-transparent tracking-[0.2px] text-center
               ${isActive
                 ? 'bg-gradient-to-br from-[rgba(0,173,181,0.22)] to-[rgba(0,173,181,0.08)] text-white border-[rgba(0,173,181,0.35)] shadow-[0_4px_16px_rgba(0,173,181,0.25)] font-bold'
                 : 'text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-white/[0.06]'
               }`
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

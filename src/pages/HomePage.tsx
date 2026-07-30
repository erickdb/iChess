// pages/HomePage.tsx — Landing page (Container-View pattern: Container)

import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

const FEATURES = [
  {
    icon: '🎮',
    title: 'AI Engine Cerdas',
    desc: 'Bertanding melawan AI dari level Pemula (~800 ELO) hingga Dewa Catur (~3500 ELO) dengan prediksi rencana langkah AI secara live.',
    link: '/play',
    cta: 'Mulai Main →',
  },
  {
    icon: '🔍',
    title: 'Analisis PGN & FEN',
    desc: 'Evaluasi permainan dengan grafik keunggulan, deteksi blunder otomatis, dan pengenalan nama pembukaan ECO resmi.',
    link: '/analysis',
    cta: 'Buka Analisis →',
  },
  {
    icon: '📊',
    title: 'Player Stats & Analytics',
    desc: 'Laporan statistik 7 kategori performa (Opening, Tactics, Resourcefulness, Time, Endgame) langsung dari Chess.com Public API.',
    link: '/stats',
    cta: 'Cek Stats Pemain →',
  },
] as const;

const PLATFORM_STATS = [
  { num: 'Depth 24',    label: 'Max AI Level' },
  { num: '7 Categories', label: 'Performance Analysis' },
  { num: 'Live API',    label: 'Chess.com Integration' },
  { num: '100% Free',   label: 'Open Access' },
] as const;

export function HomePage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const u = username.trim();
    if (u) navigate(`/stats?u=${encodeURIComponent(u)}`);
  }

  return (
    <div className="w-full max-w-[1200px] mx-auto px-6 py-16 flex flex-col items-center gap-20 pb-24">

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center text-center max-w-[860px] animate-[fadeIn_0.5s_ease-out]">
        <div className="inline-flex items-center gap-2 bg-[rgba(0,173,181,0.1)] border border-[rgba(0,173,181,0.28)] rounded-full px-[18px] py-1.5 text-[13px] font-semibold text-[#00adb5] mb-7 shadow-[0_4px_20px_rgba(0,173,181,0.12)]">
          <span>NEW</span> • Next-Gen AI Chess &amp; Player Analytics
        </div>

        <h1 className="gradient-text text-[clamp(2.4rem,5.5vw,4.2rem)] font-black leading-[1.15] tracking-[-1px] mb-5">
          Kuasai Permainan Catur dengan Kecerdasan AI
        </h1>

        <p className="text-[17px] text-[#94a3b8] leading-[1.65] max-w-[680px] mb-10">
          Platform catur modern yang menggabungkan AI engine tangguh hingga kedalaman langkah Depth 24,
          analisis taktis PGN/FEN mendalam, dan laporan statistik pemain riil dari Chess.com.
        </p>

        <div className="flex flex-wrap gap-4 justify-center">
          {[
            { to: '/play',     icon: '🎮', label: 'Bermain Lawan AI' },
            { to: '/stats',    icon: '📊', label: 'Player Stats Lookup' },
            { to: '/analysis', icon: '🔍', label: 'Analisis PGN & FEN' },
          ].map(({ to, icon, label }) => (
            <a
              key={to}
              href={to}
              onClick={(e) => { e.preventDefault(); navigate(to); }}
              className="
                inline-flex items-center gap-2.5 px-7 py-3.5
                bg-[rgba(30,36,51,0.6)] border-[1.5px] border-white/[0.12]
                text-[#f1f5f9] text-[15px] font-semibold rounded-[14px]
                backdrop-blur-[12px] tracking-[0.2px] no-underline
                transition-all duration-250
                hover:bg-[rgba(0,173,181,0.12)] hover:border-[rgba(0,173,181,0.45)]
                hover:text-white hover:-translate-y-0.5
                hover:shadow-[0_8px_24px_rgba(0,173,181,0.25)]
              "
            >
              <span>{icon}</span> {label}
            </a>
          ))}
        </div>
      </section>

      {/* ── Quick Lookup Widget ─────────────────────────────────────── */}
      <section className="relative w-full max-w-[680px] bg-[rgba(26,32,51,0.8)] border border-[#232c45] rounded-[20px] px-5 sm:px-10 py-9 backdrop-blur-[16px] shadow-[0_20px_50px_rgba(0,0,0,0.4)] text-center overflow-hidden">
        {/* ambient glow top-right */}
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-[radial-gradient(circle,rgba(0,173,181,0.15),transparent_70%)] pointer-events-none" />

        <h2 className="text-[20px] font-extrabold text-white mb-2">Cari &amp; Analisa Akun Chess.com</h2>
        <p className="text-[14px] text-[#64748b] mb-6">
          Masukkan username untuk melihat statistik rating, win rate, dan 7 kategori analisis performa.
        </p>

        <form onSubmit={handleLookup} className="flex flex-col sm:flex-row gap-3 w-full">
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Contoh: hikaru, magnuscarlsen, irychee..."
            autoComplete="off"
            className="
              flex-1 bg-[#0d1120] border-[1.5px] border-[#232c45] rounded-xl
              px-[18px] py-3.5 text-white text-[15px] outline-none
              placeholder:text-[#475569]
              focus:border-[#00adb5] focus:shadow-[0_0_0_3px_rgba(0,173,181,0.15)]
              transition-all duration-200
            "
          />
          <button
            type="submit"
            className="
              bg-gradient-to-br from-[#00adb5] to-[#007b82] border-none rounded-xl
              px-6 py-3.5 text-white font-bold text-[14px] cursor-pointer
              transition-all duration-200 whitespace-nowrap
              hover:shadow-[0_4px_16px_rgba(0,173,181,0.4)] hover:-translate-y-px
            "
          >
            Get Report →
          </button>
        </form>
      </section>

      {/* ── Feature Pillars Grid ────────────────────────────────────── */}
      <section className="w-full">
        <div className="text-center mb-12">
          <h2 className="text-[28px] font-extrabold text-white mb-3">Fitur Unggulan iChess</h2>
          <p className="text-[15px] text-[#64748b]">Segala yang kamu butuhkan untuk melatih taktik, bertanding, dan menganalisis permainan</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map(({ icon, title, desc, link, cta }) => (
            <a
              key={link}
              href={link}
              onClick={(e) => { e.preventDefault(); navigate(link); }}
              className="
                glass-card flex flex-col gap-4 p-8 no-underline text-inherit
                transition-all duration-250
                hover:-translate-y-1 hover:border-[rgba(0,173,181,0.35)]
                hover:shadow-[0_16px_40px_rgba(0,0,0,0.35)]
              "
            >
              <div className="w-[52px] h-[52px] rounded-[14px] bg-[rgba(0,173,181,0.1)] border border-[rgba(0,173,181,0.25)] flex items-center justify-center text-[24px]">
                {icon}
              </div>
              <h3 className="text-[19px] font-extrabold text-white m-0">{title}</h3>
              <p className="text-[14px] text-[#94a3b8] leading-[1.6] m-0 flex-1">{desc}</p>
              <span className="text-[13px] font-bold text-[#00adb5] flex items-center gap-1.5 mt-2">{cta}</span>
            </a>
          ))}
        </div>
      </section>

      {/* ── Platform Stats Bar ──────────────────────────────────────── */}
      <section className="w-full bg-[rgba(23,28,45,0.6)] border border-[#232c45] rounded-2xl px-9 py-6 grid grid-cols-2 md:grid-cols-4 gap-5 text-center">
        {PLATFORM_STATS.map(({ num, label }) => (
          <div key={label}>
            <div className="text-[28px] font-black text-white mb-1">{num}</div>
            <div className="text-[12px] font-semibold text-[#64748b] uppercase tracking-[0.8px]">{label}</div>
          </div>
        ))}
      </section>

    </div>
  );
}

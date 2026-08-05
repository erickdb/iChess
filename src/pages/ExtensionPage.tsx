// pages/ExtensionPage.tsx

import { useState } from 'react';

export function ExtensionPage() {
  const [downloading, setDownloading] = useState(false);

  function handleDownload() {
    setDownloading(true);
    setTimeout(() => setDownloading(false), 3000);
  }

  const FEATURES = [
    {
      icon: '💡',
      title: 'Real-time Overlay',
      desc: 'Cyan (from) + Green (to) highlights rendered directly over the Chess.com board, updated every 300ms with no noticeable delay.',
      badge: 'Visual Assist',
      accent: '#00adb5',
      glow: 'rgba(0,173,181,0.15)',
      border: 'rgba(0,173,181,0.3)',
    },
    {
      icon: '🔥',
      title: 'Brilliant Hunter (!!)',
      desc: 'Scans 5 MultiPV lines simultaneously to detect tactical piece sacrifices and instantly highlights them in red.',
      badge: 'Aggressive',
      accent: '#ff4b4b',
      glow: 'rgba(255,75,75,0.15)',
      border: 'rgba(255,75,75,0.3)',
    },
  ] as const;

  return (
    <div className="w-full max-w-[1100px] mx-auto px-6 py-12 flex flex-col gap-10 pb-28">

      {/* ── Hero Card ──────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 bg-[rgba(19,25,41,0.8)] border border-[#232c45] rounded-3xl p-8 backdrop-blur-xl shadow-[0_24px_60px_rgba(0,0,0,0.5)]">

        <div className="flex flex-col sm:flex-row items-start gap-6">
          {/* Icon */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#00fff5] via-[#00adb5] to-[#005f63] flex items-center justify-center text-4xl shadow-[0_8px_30px_rgba(0,173,181,0.35)] border border-white/10 flex-shrink-0">
            ♟️
          </div>

          <div className="flex flex-col gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight m-0">
              iChess Assistant
            </h1>

            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-[#00adb5] font-bold">iChess Inc.</span>
              <span className="text-[#334155]">•</span>
              {['Chrome Extension', 'Manifest V3', 'Stockfish 18'].map(tag => (
                <span key={tag} className="bg-[#1a2033] border border-[#2d3748] px-2.5 py-0.5 rounded-md font-semibold text-[#94a3b8]">
                  {tag}
                </span>
              ))}
            </div>

            <p className="text-sm text-[#64748b] leading-relaxed m-0 max-w-[520px]">
              Stockfish 18 engine running directly in your browser — reads the Chess.com board in real-time and displays the best move as a glowing visual overlay on top of the board.
            </p>
          </div>
        </div>

        {/* Download CTA */}
        <div className="flex flex-col items-stretch lg:items-end gap-2 w-full lg:w-auto flex-shrink-0">
          <a
            href="/ichess-extension.zip"
            download="ichess-extension.zip"
            onClick={handleDownload}
            className="inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] hover:from-[#1d4ed8] hover:to-[#1e40af] text-white font-extrabold text-sm px-8 py-4 rounded-2xl shadow-[0_8px_24px_rgba(37,99,235,0.35)] transition-all duration-200 hover:scale-[1.03] active:scale-95 no-underline cursor-pointer border-0 whitespace-nowrap"
          >
            <span className="text-lg">📥</span>
            <span>{downloading ? 'Downloading...' : 'Download Extension'}</span>
          </a>
          <span className="text-[11px] text-[#475569] text-center lg:text-right">
            .zip · extract before installing
          </span>
        </div>
      </div>

      {/* ── Feature Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {FEATURES.map(({ icon, title, desc, badge, accent, glow, border }) => (
          <div
            key={title}
            style={{ background: `linear-gradient(135deg, ${glow}, transparent)`, borderColor: border }}
            className="glass-card border p-6 flex flex-col gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-3xl leading-none">{icon}</span>
              <span
                style={{ color: accent, borderColor: `${accent}40`, background: `${accent}15` }}
                className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-md border tracking-wide flex-shrink-0"
              >
                {badge}
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white mb-1.5 m-0">{title}</h3>
              <p className="text-xs text-[#94a3b8] leading-relaxed m-0">{desc}</p>
            </div>
            <div className="pt-3 border-t border-white/5 text-[10px] text-white/30 font-mono">
              ✦ Active Module
            </div>
          </div>
        ))}
      </div>

      {/* ── Bottom Grid: About + Install ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">

        {/* About */}
        <div className="glass-card p-7 flex flex-col gap-6">
          <h2 className="text-base font-bold text-white border-b border-[#1e2840] pb-3 m-0">
            About This Extension
          </h2>

          <div className="flex flex-col gap-4 text-xs text-[#94a3b8] leading-relaxed">
            <p className="m-0">
              <strong className="text-white">iChess Assistant</strong> injects Stockfish 18 directly into Chess.com via a WebWorker.
              Every 300ms, the extension reads piece positions from the DOM, builds a FEN string, and sends it to the engine —
              the best move appears as a glowing overlay on top of the board without any page refresh.
            </p>
            <p className="m-0">
              Built on a <strong className="text-white">dual-world architecture</strong>: an isolated content script handles core logic,
              while a MAIN world injector bypasses Chess.com's CSP to spawn the WebWorker.
              Compatible with <strong className="text-white">Chrome, Brave, Edge, and Opera</strong>.
            </p>

            <div className="flex flex-col gap-2 mt-1">
              <h3 className="text-xs font-bold text-white m-0">Features:</h3>
              {[
                { color: '#00adb5', label: 'Visual Overlay', desc: 'Cyan + Green highlights rendered directly on the board with pulse animation, always above Chess.com UI.' },
                { color: '#ff4b4b', label: 'Brilliant Hunter', desc: 'Detects tactical piece sacrifices across 5 MultiPV lines and auto-highlights them in red.' },
                { color: '#f59e0b', label: 'Depth Control', desc: 'Set Stockfish depth from 6 (~1350 ELO) to 24 (~3500 ELO) directly from the popup.' },
                { color: '#64748b', label: 'Stability Check', desc: 'FEN must be stable for 2 consecutive scans before evaluation — prevents false triggers during Chess.com move animations.' },
              ].map(f => (
                <div key={f.label} className="flex gap-2.5">
                  <span style={{ color: f.color }} className="mt-0.5 flex-shrink-0">▸</span>
                  <span><strong className="text-white">{f.label}</strong> — {f.desc}</span>
                </div>
              ))}
            </div>

            {/* Tech Stack */}
            <div className="bg-[#080c14] border border-[#1e2840] rounded-xl p-4 font-mono text-[10.5px] text-[#475569] mt-1">
              <span className="text-[#00adb5]"># Tech Stack</span><br />
              <span className="text-[#334155]">Engine  </span><span className="text-[#94a3b8]">: Stockfish 18 (WASM WebWorker)</span><br />
              <span className="text-[#334155]">Parser  </span><span className="text-[#94a3b8]">: chess.js — FEN validation &amp; legality check</span><br />
              <span className="text-[#334155]">Scan    </span><span className="text-[#94a3b8]">: setInterval every 300ms</span><br />
              <span className="text-[#334155]">Manifest</span><span className="text-[#94a3b8]">: V3 — Service Worker + dual content script</span>
            </div>
          </div>
        </div>

        {/* Install Guide */}
        <div className="glass-card p-7 flex flex-col gap-6 border-[#00adb5]/20">
          <h2 className="text-base font-bold text-white border-b border-[#1e2840] pb-3 m-0">
            ⚡ How to Install
          </h2>

          <div className="flex flex-col gap-6 text-xs">

            {/* Step 1 */}
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#00adb5]/20 text-[#00adb5] font-black text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <div className="flex flex-col gap-2">
                <strong className="text-white text-[13px]">Download &amp; Extract ZIP</strong>
                <span className="text-[#94a3b8]">
                  Click <strong className="text-white">Download Extension</strong> above.
                  Once done, right-click the file → <strong className="text-white">Extract All...</strong> and choose a destination.
                </span>
                <div className="bg-[#080c14] border border-[#1e2840] rounded-lg px-3 py-2 font-mono text-[10px] text-[#00adb5]">
                  📂 C:\Users\<span className="text-white">YourName</span>\Downloads\ichess-extension\
                </div>
                <span className="text-[#475569] text-[11px]">
                  ⚠️ Make sure <code className="text-white bg-white/5 px-1 rounded">manifest.json</code> is directly inside the folder, not nested in a subfolder.
                </span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#00adb5]/20 text-[#00adb5] font-black text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <div className="flex flex-col gap-2">
                <strong className="text-white text-[13px]">Open chrome://extensions</strong>
                <span className="text-[#94a3b8]">Open a new tab and type this in the address bar:</span>
                <div className="bg-[#080c14] border border-[#1e2840] rounded-lg px-3 py-2 font-mono text-[10px] text-white select-all">
                  chrome://extensions
                </div>
                <span className="text-[#94a3b8]">Enable the <strong className="text-white">Developer mode</strong> toggle in the top-right corner.</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#00adb5]/20 text-[#00adb5] font-black text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <div className="flex flex-col gap-2">
                <strong className="text-white text-[13px]">Load Unpacked</strong>
                <span className="text-[#94a3b8]">Click <strong className="text-white">Load unpacked</strong> in the top-left, then navigate to your extracted folder:</span>
                <div className="bg-[#080c14] border border-[#1e2840] rounded-lg px-3 py-2 font-mono text-[10px] text-[#00adb5]">
                  📂 ...\ichess-extension\
                </div>
                <span className="text-[#94a3b8]">Click <strong className="text-white">Select Folder</strong>. The extension is now active.</span>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#22c55e]/20 text-[#22c55e] font-black text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">✓</span>
              <div className="flex flex-col gap-1.5">
                <strong className="text-white text-[13px]">Open Chess.com &amp; Play</strong>
                <span className="text-[#94a3b8]">
                  Go to <code className="text-white bg-white/5 px-1 rounded">chess.com/play</code>.
                  The iChess HUD appears in the bottom-right corner — overlay activates automatically on your turn.
                </span>
              </div>
            </div>
          </div>

          <a
            href="/ichess-extension.zip"
            download="ichess-extension.zip"
            onClick={handleDownload}
            className="w-full py-3.5 rounded-xl font-extrabold text-sm text-center bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white no-underline shadow-lg hover:brightness-110 hover:scale-[1.02] active:scale-95 transition-all cursor-pointer border-0 block"
          >
            📥 Download ichess-extension.zip
          </a>
        </div>
      </div>

    </div>
  );
}

// pages/ExtensionPage.tsx — Chrome Web Store Style Extension Detail & Direct Zip Download Page

import { useState } from 'react';

export function ExtensionPage() {
  const [downloading, setDownloading] = useState(false);

  function handleDownload() {
    setDownloading(true);
    setTimeout(() => setDownloading(false), 3000);
  }

  const PREVIEWS = [
    {
      icon: '💡',
      title: 'Real-time Overlay Highlight',
      desc: 'Petunjuk langkah terbaik (Cyan = Asal, Green = Tujuan) langsung di atas papan Chess.com.',
      badge: 'Visual Assist',
      color: 'from-[#00fff5]/20 to-[#00adb5]/10',
      borderColor: 'border-[#00adb5]/40',
    },
    {
      icon: '🔥',
      title: 'Brilliant Hunter Mode (!!)',
      desc: 'Ngescan 5 jalur MultiPV sekaligus buat nyari pengorbanan perwira taktis ala Mikhail Tal.',
      badge: 'Super Aggressive',
      color: 'from-[#ff4b4b]/20 to-[#f97316]/10',
      borderColor: 'border-[#ff4b4b]/40',
    },
    {
      icon: '⚠️',
      title: 'Anti-Ban Mistake Generator',
      desc: 'Sengaja bikin kesalahan kecil tiap N langkah (3/5/7/10) biar akun aman dari deteksi bot.',
      badge: 'Humanized Play',
      color: 'from-[#f59e0b]/20 to-[#d97706]/10',
      borderColor: 'border-[#f59e0b]/40',
    },
    {
      icon: '⚡',
      title: 'Humanized Auto-Play',
      desc: 'Klik otomatis perwira pake simulasi pointer event dengan delay reaksi manusia (450ms - 850ms).',
      badge: 'Auto Clicker',
      color: 'from-[#22c55e]/20 to-[#16a34a]/10',
      borderColor: 'border-[#22c55e]/40',
    },
  ] as const;

  return (
    <div className="w-full max-w-[1150px] mx-auto px-6 py-10 flex flex-col gap-12 pb-24">

      {/* ── Web Store Navigation Bar ───────────────────────────────── */}
      <div className="flex items-center gap-4 text-xs font-semibold text-[#64748b] border-b border-[#232c45] pb-4">
        <span className="text-white font-bold flex items-center gap-1.5 text-sm">
          <span className="text-lg">🛍️</span> iChess Web Store
        </span>
        <span>›</span>
        <span>Ekstensi</span>
        <span>›</span>
        <span>Produktivitas &amp; Game</span>
        <span>›</span>
        <span className="text-[#00adb5] font-bold">iChess Assistant</span>
      </div>

      {/* ── Hero Header (Chrome Web Store Style) ────────────────────── */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 bg-[rgba(26,32,51,0.6)] border border-[#232c45] rounded-3xl p-8 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
        
        {/* Left Info */}
        <div className="flex flex-col sm:flex-row items-start gap-6">
          {/* Extension App Icon */}
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#00fff5] via-[#00adb5] to-[#005f63] flex items-center justify-center text-4xl shadow-[0_8px_30px_rgba(0,173,181,0.4)] border-2 border-white/20 flex-shrink-0">
            ♟️
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight">
              iChess Assistant &amp; Auto-Player
            </h1>

            {/* Badges / Meta */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-[#94a3b8]">
              <span className="text-[#00adb5] font-bold underline">iChess Inc.</span>
              <span>•</span>
              <span className="flex items-center gap-1 text-[#f59e0b] font-extrabold">
                ★ 4.9 <span className="text-[#64748b] font-normal">(1.420 rating)</span>
              </span>
              <span>•</span>
              <span className="bg-[#1a2033] border border-[#232c45] px-2.5 py-0.5 rounded-md font-semibold text-white">
                Ekstensi Chrome
              </span>
              <span>•</span>
              <span className="text-white font-semibold">50.000+ pengguna</span>
            </div>

            <p className="text-xs text-[#64748b] mt-1 max-w-[550px]">
              Mesin pembantu Stockfish 18 real-time untuk Chess.com. Dilengkapi visual overlay glowing, mode Brilliant Hunter, dan Auto-Play aman.
            </p>
          </div>
        </div>

        {/* Right Download Action Button (Big Blue Chrome Store Button) */}
        <div className="flex flex-col items-stretch lg:items-end gap-2 w-full lg:w-auto">
          <a
            href="/ichess-extension.zip"
            download="ichess-extension.zip"
            onClick={handleDownload}
            className="
              inline-flex items-center justify-center gap-3
              bg-gradient-to-r from-[#2563eb] to-[#1d4ed8]
              hover:from-[#1d4ed8] hover:to-[#1e40af]
              text-white font-extrabold text-[15px] px-8 py-4 rounded-2xl
              shadow-[0_8px_24px_rgba(37,99,235,0.4)]
              transition-all duration-200 hover:scale-105 active:scale-95
              no-underline cursor-pointer border-0
            "
          >
            <span className="text-xl">📥</span>
            <span>{downloading ? 'Mengunduh Zip...' : 'Download Extension (.zip)'}</span>
          </a>

          <span className="text-[11px] text-[#64748b] text-center lg:text-right">
            File `.zip` siap diekstrak &amp; dipasang di Chrome
          </span>
        </div>
      </div>

      {/* ── Previews / Screenshots Carousel Showcase ───────────────── */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span>🖼️</span> Pratinjau Tampilan &amp; Fitur Utama
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PREVIEWS.map(({ icon, title, desc, badge, color, borderColor }) => (
            <div
              key={title}
              className={`glass-card p-5 flex flex-col justify-between gap-4 border bg-gradient-to-b ${color} ${borderColor} transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_16px_36px_rgba(0,0,0,0.4)]`}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-3xl">{icon}</span>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-black/40 text-white border border-white/10">
                    {badge}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white m-0">{title}</h3>
                <p className="text-xs text-[#94a3b8] leading-relaxed m-0">{desc}</p>
              </div>

              <div className="pt-3 border-t border-white/10 text-[10px] text-white/50 font-mono">
                ✦ Active Module
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Summary & Installation Steps ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Cols: Summary Description */}
        <div className="lg:col-span-2 glass-card p-7 flex flex-col gap-5">
          <h2 className="text-lg font-bold text-white border-b border-[#232c45] pb-3">
            Ringkasan &amp; Deskripsi Ekstensi
          </h2>

          <div className="text-xs text-[#94a3b8] leading-relaxed flex flex-col gap-3">
            <p>
              <strong className="text-white">iChess Assistant</strong> adalah ekstensi browser berteknologi tinggi yang dirancang untuk membaca papan catur Chess.com secara real-time dan memberikan analisis taktis tercepat bertenaga Stockfish 18 WebWorker.
            </p>
            <p>
              Ekstensi ini dirancang dengan arsitektur Manifest V3 terbaru yang kompatibel dengan Google Chrome, Brave Browser, Microsoft Edge, dan Opera.
            </p>

            <h3 className="text-sm font-bold text-white mt-2">Fitur Unggulan Ekstensi:</h3>
            <ul className="list-disc list-inside space-y-1 text-[#cbd5e1]">
              <li><strong>Visual Overlay Guidance</strong>: Menampilkan petunjuk petak asal (Cyan) dan tujuan (Hijau) langsung di atas papan catur.</li>
              <li><strong>🔥 Brilliant Hunter Mode</strong>: Memindai 5 variasi MultiPV untuk mendeteksi taktik pengorbanan perwira (<code className="text-[#ff4b4b]">!!</code>).</li>
              <li><strong>⚠️ Anti-Ban Mistake Simulator</strong>: Fitur keamanan untuk menjadwalkan kesalahan manusiawi (Inaccuracy, Mistake, Blunder) setiap N langkah agar akun terlindungi dari sistem anti-cheat.</li>
              <li><strong>🎛️ Dynamic Engine Depth</strong>: Bebas mengatur tingkat kedalaman Stockfish dari Depth 6 hingga Depth 24.</li>
            </ul>
          </div>
        </div>

        {/* Right 1 Col: Quick Install Guide */}
        <div className="glass-card p-7 flex flex-col gap-5 border-[#00adb5]/30">
          <h2 className="text-lg font-bold text-white border-b border-[#232c45] pb-3">
            ⚡ Cara Install Zip (3 Langkah)
          </h2>

          <div className="flex flex-col gap-4 text-xs">
            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#00adb5]/20 text-[#00adb5] font-black flex items-center justify-center flex-shrink-0">
                1
              </span>
              <div>
                <strong className="text-white block mb-0.5">Download File Zip</strong>
                <span className="text-[#94a3b8]">Klik tombol <code className="text-[#00adb5]">Download Extension (.zip)</code> di atas lalu ekstrak file zip tersebut di laptop kamu.</span>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#00adb5]/20 text-[#00adb5] font-black flex items-center justify-center flex-shrink-0">
                2
              </span>
              <div>
                <strong className="text-white block mb-0.5">Buka chrome://extensions</strong>
                <span className="text-[#94a3b8]">Buka tab baru di browser, ketik <code className="text-white">chrome://extensions</code> lalu nyalakan sakelar <strong>Developer mode</strong> di pojok kanan atas.</span>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#00adb5]/20 text-[#00adb5] font-black flex items-center justify-center flex-shrink-0">
                3
              </span>
              <div>
                <strong className="text-white block mb-0.5">Load Unpacked</strong>
                <span className="text-[#94a3b8]">Klik tombol <strong>Load unpacked</strong> di kiri atas, lalu pilih folder ekstensi hasil ekstrak tadi. Selesai!</span>
              </div>
            </div>
          </div>

          <a
            href="/ichess-extension.zip"
            download="ichess-extension.zip"
            onClick={handleDownload}
            className="mt-2 w-full py-3 rounded-xl font-extrabold text-xs text-center bg-gradient-to-r from-[#2563eb] to-[#1d4ed8] text-white no-underline shadow-lg hover:brightness-110 transition-all cursor-pointer border-0"
          >
            📥 Unduh File Zip Ekstensi Now
          </a>
        </div>

      </div>

    </div>
  );
}

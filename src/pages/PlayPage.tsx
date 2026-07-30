// pages/PlayPage.tsx — AI vs Player game page (Container-View)

import { useState } from 'react';
import { useChessEngine } from '@hooks/useChessEngine';
import { ChessBoard } from '@components/organisms/ChessBoard';
import { PiecePalette } from '@components/molecules/PiecePalette';
import type { PlayerColor } from '@hooks/useChessGame';

const DEPTH_OPTIONS = [
  { value: 2,  label: 'Depth 2 — Pemula ~800 ELO' },
  { value: 4,  label: 'Depth 4 — ~1100 ELO' },
  { value: 6,  label: 'Depth 6 — Menengah ~1350 ELO' },
  { value: 8,  label: 'Depth 8 — Mahir ~1600 ELO' },
  { value: 10, label: 'Depth 10 — Advanced ~1850 ELO' },
  { value: 12, label: 'Depth 12 — Expert ~2100 ELO' },
  { value: 14, label: 'Depth 14 — Master ~2400 ELO' },
  { value: 16, label: 'Depth 16 — Grandmaster ~2700 ELO' },
  { value: 18, label: 'Depth 18 — Super GM ~3000 ELO' },
  { value: 20, label: 'Depth 20 — Dewa Catur ~3200 ELO' },
  { value: 22, label: 'Depth 22 — Ultra Engine ~3400 ELO' },
  { value: 24, label: 'Depth 24 — Absolute Max ~3500 ELO' },
] as const;

export function PlayPage() {
  const engine = useChessEngine();
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(engine.notationValue).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const labelCls = 'block text-[11px] font-bold text-[#64748b] uppercase tracking-[0.8px] mb-1.5';
  const selectCls = `
    w-full bg-[#0d1120] border border-[#232c45] rounded-lg px-3 py-2 text-[13px] text-white
    outline-none cursor-pointer transition-colors
    focus:border-[#00adb5] hover:border-[#334155]
  `;
  const btnBase = 'w-full py-2.5 rounded-lg font-semibold text-[13px] transition-all duration-200 cursor-pointer border-0';

  return (
    <div className="w-full flex flex-col lg:flex-row gap-8 justify-center items-start px-5 py-8 max-w-[1300px] mx-auto">

      {/* ── Board Column ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 w-full max-w-[520px] mx-auto lg:mx-0">

        {/* Continuation card */}
        <div className="glass-card p-4">
          <div className="text-[11px] font-bold text-[#00adb5] uppercase tracking-wider mb-1">
            💡 Prediksi &amp; Tujuan Rencana AI
          </div>
          <div className="text-[13px] text-[#94a3b8] mb-1">
            {engine.continuationText}
          </div>
          <div className="text-[13px] text-[#64748b]">
            {engine.aiGoalText}
          </div>
        </div>

        {/* Board */}
        <ChessBoard
          fen={engine.fen}
          orientation={engine.boardOrientation}
          onPieceDrop={engine.onPieceDrop}
          onSquareClick={engine.handleSquareClick}
          allowDragging={!engine.selectedTool.type}
        />

        {/* Piece Palette / Custom Position Toolbar */}
        <PiecePalette
          selectedTool={engine.selectedTool}
          onSelectTool={engine.setSelectedTool}
          onClearBoard={engine.handleClearBoard}
          onResetBoard={engine.handleResetBoard}
        />
      </div>

      {/* ── Controls Column ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 w-full max-w-[340px] mx-auto lg:mx-0">

        {/* Mode */}
        <div className="glass-card p-5 flex flex-col gap-4">
          <div>
            <label className={labelCls}>Mode / Warna Kamu</label>
            <select
              className={selectCls}
              value={engine.playerColor}
              onChange={e => engine.setPlayerColor(e.target.value as PlayerColor)}
            >
              <option value="white">Putih (Melangkah Pertama)</option>
              <option value="black">Hitam (AI Melangkah Pertama)</option>
              <option value="aivsai">🤖 AI vs AI (Bot vs Bot)</option>
            </select>
          </div>

          {/* White depth */}
          {engine.playerColor !== 'black' && (
            <div>
              <label className={labelCls}>Level AI Putih (Depth)</label>
              <select
                className={selectCls}
                value={engine.whiteDepth}
                onChange={e => engine.setWhiteDepth(Number(e.target.value))}
              >
                {DEPTH_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Black depth */}
          {engine.playerColor !== 'white' && (
            <div>
              <label className={labelCls}>Level AI Hitam (Depth)</label>
              <select
                className={selectCls}
                value={engine.blackDepth}
                onChange={e => engine.setBlackDepth(Number(e.target.value))}
              >
                {DEPTH_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Play controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={engine.handleUndo}
              disabled={!engine.canUndo}
              title="Undo"
              className={`
                flex-shrink-0 w-10 h-10 rounded-lg border border-[#232c45]
                bg-[#1a2033] text-white text-[16px] flex items-center justify-center
                transition-all hover:border-[#00adb5] hover:text-[#00adb5]
                disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer
              `}
            >◄</button>

            <button
              onClick={engine.togglePlay}
              className={`
                flex-1 py-2.5 rounded-lg font-bold text-[13px] border-0 cursor-pointer transition-all
                ${engine.isPlaying
                  ? 'bg-[#ef4444] text-white hover:bg-[#dc2626]'
                  : 'bg-gradient-to-br from-[#00adb5] to-[#007b82] text-white hover:shadow-[0_4px_16px_rgba(0,173,181,0.4)]'
                }
              `}
            >
              {engine.isPlaying ? 'Stop AI' : 'Start AI'}
            </button>

            <button
              onClick={engine.handleRedo}
              disabled={!engine.canRedo}
              title="Redo"
              className={`
                flex-shrink-0 w-10 h-10 rounded-lg border border-[#232c45]
                bg-[#1a2033] text-white text-[16px] flex items-center justify-center
                transition-all hover:border-[#00adb5] hover:text-[#00adb5]
                disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer
              `}
            >►</button>
          </div>

          <div className="flex gap-2">
            <button onClick={engine.handleFlip} className={`${btnBase} flex-1 bg-[#1a2033] border border-[#232c45] text-[#94a3b8] hover:text-white hover:border-[#334155]`}>
              Putar Papan
            </button>
            <button onClick={engine.handleReset} className={`${btnBase} flex-1 bg-[#1a2033] border border-[#232c45] text-[#94a3b8] hover:text-white hover:border-[#334155]`}>
              Restart
            </button>
          </div>

          {/* Status */}
          <div className={`text-[12px] font-semibold px-3 py-2 rounded-lg text-center ${engine.isGameOver ? 'bg-[rgba(239,68,68,0.15)] text-[#ef4444] border border-[rgba(239,68,68,0.3)]' : 'bg-[#0d1120] text-[#94a3b8]'}`}>
            {engine.isGameOver ? engine.gameOverReason : engine.status}
          </div>
        </div>

        {/* Notation card */}
        <div className="glass-card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className={labelCls + ' mb-0'}>Notasi Langkah</span>
            <select
              className="bg-[#0d1120] border border-[#232c45] rounded-md px-2 py-1 text-[12px] text-white outline-none cursor-pointer"
              value={engine.notationType}
              onChange={e => engine.setNotationType(e.target.value as 'PGN' | 'FEN')}
            >
              <option value="PGN">PGN</option>
              <option value="FEN">FEN</option>
            </select>
          </div>
          <div className="bg-[#0d1120] border border-[#232c45] rounded-lg p-3 text-[12px] text-[#94a3b8] font-mono min-h-[60px] max-h-[120px] overflow-auto break-all whitespace-pre-wrap">
            {engine.notationValue || '—'}
          </div>
          <button
            onClick={handleCopy}
            className={`${btnBase} bg-[#1a2033] border border-[#232c45] text-[#94a3b8] hover:text-white hover:border-[#334155] text-[12px]`}
          >
            {copied ? '✓ Tersalin!' : 'Copy Notasi'}
          </button>
        </div>

      </div>
    </div>
  );
}

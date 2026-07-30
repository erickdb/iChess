// pages/AnalysisPage.tsx — Chess.com Style Game Review & PGN/FEN Analyzer (Container-View)
// Matches exact Chess.com Report (Accuracies, Classification Counters, Eval Graph) and Analysis tabs.

import { useState, useRef, useCallback, useEffect } from 'react';
import { Chess } from 'chess.js';
import { ChessBoard } from '@components/organisms/ChessBoard';
import { useStockfish } from '@hooks/useStockfish';
import { parsePGNHeaders, getOpeningName } from '@lib/chessUtils';

export type QualityType =
  | 'Brilliant'
  | 'Critical'
  | 'Best'
  | 'Excellent'
  | 'Okay'
  | 'Inaccuracy'
  | 'Mistake'
  | 'Blunder'
  | 'Theory';

export interface MoveData {
  fenBefore: string;
  fenAfter: string;
  san: string;
  uci: string;
  color: 'w' | 'b';
  eval: number;
  bestMove: string;
  quality: QualityType;
  qualitySymbol: string;
  qualityColor: string;
  moveNumber: number;
}

interface ClassMeta {
  label: string;
  symbol: string;
  color: string;
}

const CLASS_META: Record<QualityType, ClassMeta> = {
  Brilliant:  { label: 'Brilliant',  symbol: '‼️', color: '#00fff5' },
  Critical:   { label: 'Critical',   symbol: '❗', color: '#3b82f6' },
  Best:       { label: 'Best',       symbol: '⭐', color: '#22c55e' },
  Excellent:  { label: 'Excellent',  symbol: '👍', color: '#84cc16' },
  Okay:       { label: 'Okay',       symbol: '✔', color: '#94a3b8' },
  Inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#f59e0b' },
  Mistake:    { label: 'Mistake',    symbol: '?',  color: '#f97316' },
  Blunder:    { label: 'Blunder',    symbol: '??', color: '#ef4444' },
  Theory:     { label: 'Theory',     symbol: '📖', color: '#a855f7' },
};

// ── Chess.com CAPS2 Win Probability & Accuracy Formula ─────────────────────── //
function winProbability(whiteCp: number): number {
  return 100 / (1 + Math.pow(10, -whiteCp / 400));
}

function calculateMoveAccuracy(cpWhiteBef: number, cpWhiteAft: number, isWhite: boolean): number {
  const wBef = winProbability(cpWhiteBef);
  const wAft = winProbability(cpWhiteAft);
  const winLoss = isWhite ? Math.max(0, wBef - wAft) : Math.max(0, (100 - wBef) - (100 - wAft));

  // CAPS2 exponential decay: Acc = 100 * e^(-0.035 * winLoss)
  return Math.min(100, Math.max(0, 100 * Math.exp(-0.035 * winLoss)));
}

function classifyMove(cpWhiteBef: number, cpWhiteAft: number, isWhite: boolean, moveNo: number, isTopMove: boolean): { quality: QualityType; symbol: string; color: string } {
  const wBef = winProbability(cpWhiteBef);
  const wAft = winProbability(cpWhiteAft);
  const winLoss = isWhite ? Math.max(0, wBef - wAft) : Math.max(0, (100 - wBef) - (100 - wAft));
  const cpDelta = isWhite ? cpWhiteAft - cpWhiteBef : cpWhiteBef - cpWhiteAft;

  let q: QualityType;
  if (moveNo <= 3 && winLoss <= 2.5)          q = 'Theory';
  else if (cpDelta >= 120 && (isWhite ? cpWhiteAft : -cpWhiteAft) >= 150) q = 'Brilliant';
  else if (isTopMove || winLoss <= 1.8)       q = 'Best';
  else if (winLoss <= 6.0)                    q = 'Excellent';
  else if (winLoss <= 12.0)                   q = 'Okay';
  else if (winLoss <= 22.0)                   q = 'Inaccuracy';
  else if (winLoss <= 38.0)                   q = 'Mistake';
  else                                        q = 'Blunder';

  const m = CLASS_META[q];
  return { quality: q, symbol: m.symbol, color: m.color };
}

export function AnalysisPage() {
  const stockfish = useStockfish();

  const [importType, setImportType] = useState<'PGN' | 'FEN'>('PGN');
  const [inputText, setInputText]   = useState('');
  const [view, setView]             = useState<'import' | 'review'>('import');
  const [moves, setMoves]           = useState<MoveData[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress]       = useState(0);
  const [activeReviewTab, setActiveReviewTab] = useState<'report' | 'analysis'>('report');
  const [whiteAcc, setWhiteAcc]     = useState<number | null>(null);
  const [blackAcc, setBlackAcc]     = useState<number | null>(null);
  const [evalHistory, setEvalHistory] = useState<number[]>([]);
  const autoPlayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [openingName, setOpeningName] = useState<string>('');

  // Track board container width so eval bar always matches board height
  const boardContainerRef = useRef<HTMLDivElement>(null);
  const [boardPx, setBoardPx] = useState(490);
  useEffect(() => {
    const el = boardContainerRef.current;
    if (!el) return;
    const update = () => setBoardPx(Math.floor(el.getBoundingClientRect().width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const TARGET_DEPTH = 24;

  const currentFen = moves.length === 0
    ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    : currentIdx === 0
      ? moves[0].fenBefore
      : moves[currentIdx - 1].fenAfter;

  const analyseMoves = useCallback(async (gameMoves: { san: string; fen: string; uci: string; color: 'w' | 'b'; moveNumber: number }[]) => {
    setIsAnalyzing(true);
    setProgress(0);

    // Optimize Stockfish speed for deep fast evaluations
    stockfish.sendCommand('setoption name Hash value 64');
    stockfish.sendCommand('setoption name MultiPV value 1');

    if (gameMoves.length === 0) {
      setIsAnalyzing(false);
      setProgress(100);
      return;
    }

    // ── Build the full list of N+1 FEN positions to evaluate ──────────────── //
    // positionFens[0] = starting position (before move 0)
    // positionFens[i+1] = after move i is played (= before move i+1)
    const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const positionFens: string[] = [START_FEN];
    for (const m of gameMoves) {
      positionFens.push(m.fen);
    }

    // positionEvals[j] = whiteCp eval of positionFens[j]
    const positionEvals: number[] = [];
    // bestMoves[i] = Stockfish best move UCI from positionFens[i] (before move i)
    const bestMoveUcis: string[] = [];

    for (let j = 0; j < positionFens.length; j++) {
      setProgress(Math.round((j / positionFens.length) * 100));

      const fen = positionFens[j];
      const tempC = new Chess(fen);
      const sideToMove = tempC.turn();

      let lastBestMoveUci = '';
      let evaluatedCp: number | null = null;

      await new Promise<void>(resolve => {
        let resolved = false;

        const timeout = setTimeout(() => {
          if (!resolved) { resolved = true; resolve(); }
        }, 10000);

        stockfish.setMessageHandler(line => {
          if (line.startsWith('info')) {
            const cpM = line.match(/score cp (-?\d+)/);
            if (cpM) evaluatedCp = parseInt(cpM[1]);
            const mateM = line.match(/score mate (-?\d+)/);
            if (mateM) evaluatedCp = parseInt(mateM[1]) > 0 ? 10000 : -10000;
            const pvM = line.match(/pv\s(\w+)/);
            if (pvM) lastBestMoveUci = pvM[1];
          }
          if (line.startsWith('bestmove') && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            const bm = line.split(' ')[1];
            if (bm && bm !== '(none)') lastBestMoveUci = bm;
            resolve();
          }
        });

        stockfish.sendCommand('stop');
        stockfish.sendCommand(`position fen ${fen}`);
        stockfish.sendCommand(`go depth ${TARGET_DEPTH} movetime 1500`);
      });

      // rawCp is relative to sideToMove; normalize to always be from White's perspective
      const rawCp = evaluatedCp ?? (j > 0 ? (sideToMove === 'w' ? positionEvals[j-1] : -positionEvals[j-1]) : 0);
      const whiteCp = sideToMove === 'w' ? rawCp : -rawCp;
      positionEvals.push(whiteCp);
      bestMoveUcis.push(lastBestMoveUci);
    }

    setProgress(100);

    // ── Pass 2: Classify every move using aligned before/after evals ─────── //
    // Move i: played from positionFens[i] → positionFens[i+1]
    // cpWhiteBef = positionEvals[i], cpWhiteAft = positionEvals[i+1]
    // bestMoveUcis[i] = Stockfish best UCI from position before move i
    const results: MoveData[] = [];

    for (let i = 0; i < gameMoves.length; i++) {
      const m = gameMoves[i];
      const fenBef = positionFens[i];
      const cpWhiteBef = positionEvals[i];
      const cpWhiteAft = positionEvals[i + 1];

      // isTopMove: compare actual move UCI vs Stockfish recommended UCI from same position
      const sfBestUci = bestMoveUcis[i];
      const isTopMove = Boolean(sfBestUci && m.uci.substring(0, 4) === sfBestUci.substring(0, 4));

      // Convert Stockfish best UCI → SAN for display
      let bestMoveSan = '';
      try {
        if (sfBestUci && sfBestUci.length >= 4) {
          const temp = new Chess(fenBef);
          const res = temp.move({
            from: sfBestUci.substring(0, 2),
            to: sfBestUci.substring(2, 4),
            promotion: sfBestUci[4] ?? 'q',
          });
          if (res) bestMoveSan = res.san;
        }
      } catch { bestMoveSan = ''; }

      const { quality, symbol, color } = classifyMove(cpWhiteBef, cpWhiteAft, m.color === 'w', m.moveNumber, isTopMove);

      results.push({
        fenBefore: fenBef,
        fenAfter: m.fen,
        san: m.san,
        uci: m.uci,
        color: m.color,
        eval: cpWhiteAft,
        bestMove: isTopMove ? '' : bestMoveSan,
        quality,
        qualitySymbol: symbol,
        qualityColor: color,
        moveNumber: m.moveNumber,
      });
    }

    // ── Compute per-side accuracy using CAPS2 ────────────────────────────── //
    const computeSideAcc = (color: 'w' | 'b') => {
      const sideMoves = results.filter(m => m.color === color);
      if (sideMoves.length === 0) return null;
      let sum = 0;
      for (const m of sideMoves) {
        const i = results.indexOf(m);
        sum += calculateMoveAccuracy(positionEvals[i], positionEvals[i + 1], color === 'w');
      }
      return sum / sideMoves.length;
    };

    setWhiteAcc(computeSideAcc('w'));
    setBlackAcc(computeSideAcc('b'));
    setEvalHistory(positionEvals.slice(1)); // one eval per move (after each move)
    setMoves(results);
    setCurrentIdx(0);
    setIsAnalyzing(false);
    setView('review');
  }, [stockfish]);

  function handleAnalyse() {
    if (!inputText.trim()) return;
    try {
      const chess = new Chess();
      if (importType === 'FEN') {
        chess.load(inputText.trim());
        setOpeningName('');
      } else {
        chess.loadPgn(inputText.trim());
        const hdrs = parsePGNHeaders(inputText.trim());
        const opName = getOpeningName(hdrs);
        setOpeningName(opName && opName !== 'Unknown Opening' ? opName : '');
      }

      const history = chess.history({ verbose: true });
      const tempChess = new Chess();
      const gameMoves = history.map((m, i) => {
        tempChess.move(m.san);
        return {
          san: m.san,
          fen: tempChess.fen(),
          uci: `${m.from}${m.to}${m.promotion ?? ''}`,
          color: m.color as 'w' | 'b',
          moveNumber: Math.floor(i / 2) + 1,
        };
      });

      analyseMoves(gameMoves);
    } catch {
      alert('Format PGN/FEN tidak valid. Silakan periksa kembali.');
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      const trimmed = text.trim();
      setInputText(trimmed);

      if (trimmed.includes('1.') || trimmed.includes('[Event') || trimmed.includes('[Site')) {
        setImportType('PGN');
      } else if (trimmed.split('/').length >= 7) {
        setImportType('FEN');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function stepTo(idx: number) {
    if (idx < 0 || idx > moves.length) return;
    setCurrentIdx(idx);
  }

  function toggleAutoPlay() {
    if (isAutoPlaying) {
      if (autoPlayRef.current) clearTimeout(autoPlayRef.current);
      setIsAutoPlaying(false);
    } else {
      setIsAutoPlaying(true);
    }
  }

  useEffect(() => {
    if (!isAutoPlaying) return;
    if (currentIdx >= moves.length) { setIsAutoPlaying(false); return; }
    autoPlayRef.current = setTimeout(() => setCurrentIdx(i => i + 1), 1200);
    return () => { if (autoPlayRef.current) clearTimeout(autoPlayRef.current); };
  }, [isAutoPlaying, currentIdx, moves.length]);

  // Compute counts for classification table
  const counts: Record<QualityType, { w: number; b: number }> = {
    Brilliant:  { w: 0, b: 0 },
    Critical:   { w: 0, b: 0 },
    Best:       { w: 0, b: 0 },
    Excellent:  { w: 0, b: 0 },
    Okay:       { w: 0, b: 0 },
    Inaccuracy: { w: 0, b: 0 },
    Mistake:    { w: 0, b: 0 },
    Blunder:    { w: 0, b: 0 },
    Theory:     { w: 0, b: 0 },
  };

  for (const m of moves) {
    if (m.color === 'w') counts[m.quality].w++;
    else counts[m.quality].b++;
  }

  const cardCls = 'glass-card p-5';
  const navBtnCls = 'w-10 h-10 rounded-xl bg-[#1a2033] border border-[#232c45] text-white text-lg flex items-center justify-center hover:border-[#00adb5] hover:text-[#00adb5] transition-all cursor-pointer';

  return (
    <div className="w-full max-w-[1250px] mx-auto px-5 py-8">
      {view === 'import' ? (
        /* ── Import View ─────────────────────────────────────────────── */
        <div className="max-w-[700px] mx-auto flex flex-col gap-6">
          <h1 className="text-3xl font-black text-white text-center">PGN &amp; FEN Analysis</h1>

          <div className={cardCls}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pgn,.fen,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex gap-2">
                {(['PGN', 'FEN'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setImportType(t)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border cursor-pointer transition-all ${importType === t ? 'bg-[rgba(0,173,181,0.2)] border-[rgba(0,173,181,0.4)] text-white' : 'bg-transparent border-[#232c45] text-[#94a3b8] hover:text-white'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="bg-[#0d1120] border border-[#232c45] text-[#00adb5] text-xs font-bold rounded-lg px-3 py-2 flex items-center gap-1.5">
                  ⚡ Depth 24 Stockfish 18
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 rounded-lg text-xs font-bold bg-[#1a2033] border border-[#232c45] text-white hover:border-[#00adb5] hover:bg-[rgba(0,173,181,0.1)] transition-all cursor-pointer flex items-center gap-1.5"
                >
                  📁 Upload File
                </button>
              </div>
            </div>

            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={importType === 'PGN' ? '1. e4 e5 2. Nf3 Nc6 3. Bb5... (or upload a .pgn file above)' : 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 (or upload a .fen file above)'}
              className="w-full h-40 bg-[#0d1120] border border-[#232c45] rounded-lg p-3 text-[13px] text-white font-mono outline-none resize-none placeholder:text-[#475569] focus:border-[#00adb5] transition-colors"
            />

            <button
              onClick={handleAnalyse}
              disabled={isAnalyzing || !inputText.trim()}
              className="w-full mt-4 py-3 rounded-xl font-bold text-[14px] border-0 cursor-pointer transition-all bg-gradient-to-br from-[#00adb5] to-[#007b82] text-white hover:shadow-[0_4px_16px_rgba(0,173,181,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAnalyzing ? `Analyzing... ${progress}%` : 'Analyze Now'}
            </button>
          </div>
        </div>
      ) : (
        /* ── Review View (Chess.com Style UI) ────────────────────────── */
        <div className="flex flex-col lg:flex-row gap-6 items-start justify-center">

          {/* Board Column — with Eval Bar */}
          <div className="flex flex-col gap-4 w-full max-w-[520px] mx-auto lg:mx-0">
            <div className="flex gap-2 items-stretch">
              {/* ── Vertical Eval Bar ───────────────────────────── */}
              {(() => {
                const evalCp = moves.length > 0 ? (currentIdx > 0 ? moves[currentIdx - 1].eval : evalHistory[0] ?? 0) : 0;
                // Clamp cp to [-1000, 1000] then map to [0, 100]% white fill from bottom
                const clamped = Math.max(-1000, Math.min(1000, evalCp));
                const whitePct = Math.round(50 + (clamped / 1000) * 50);
                const blackPct = 100 - whitePct;
                const absEval = Math.abs(evalCp / 100);
                const displayEval = evalCp >= 10000 ? 'M' : absEval >= 10 ? absEval.toFixed(0) : absEval.toFixed(1);
                const labelOnTop = clamped >= 0; // show label on black side if white is winning
                return (
                  <div className="flex flex-col w-[22px] rounded-lg overflow-hidden border border-[#232c45] relative select-none flex-shrink-0" style={{ height: boardPx }}>
                    {/* Black portion (top) */}
                    <div
                      className="transition-all duration-500 ease-in-out flex items-end justify-center pb-1"
                      style={{ height: `${blackPct}%`, background: '#1a1a1a' }}
                    >
                      {!labelOnTop && (
                        <span className="text-[9px] font-black text-white leading-none">{displayEval}</span>
                      )}
                    </div>
                    {/* White portion (bottom) */}
                    <div
                      className="transition-all duration-500 ease-in-out flex items-start justify-center pt-1"
                      style={{ height: `${whitePct}%`, background: '#e8e8e8' }}
                    >
                      {labelOnTop && (
                        <span className="text-[9px] font-black text-[#1a1a1a] leading-none">{displayEval}</span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ── Chessboard ─────────────────────────────────── */}
              <div ref={boardContainerRef} className="flex-1 min-w-0">
                {(() => {
                  const currentMove = currentIdx > 0 ? moves[currentIdx - 1] : null;
                  const squareBadge = currentMove
                    ? {
                        square: currentMove.uci.substring(2, 4),
                        symbol: currentMove.qualitySymbol,
                        color: currentMove.qualityColor,
                      }
                    : null;
                  return (
                    <ChessBoard
                      fen={currentFen}
                      orientation="white"
                      onPieceDrop={() => false}
                      squareBadge={squareBadge}
                      boardWidth={boardPx}
                    />
                  );
                })()}
              </div>
            </div>

            {/* Move Navigation Bar */}
            <div className="glass-card p-3 flex items-center gap-2 justify-between">
              <button onClick={() => stepTo(0)} title="First Move" className={navBtnCls}>⏮</button>
              <button onClick={() => stepTo(currentIdx - 1)} title="Previous Move" className={navBtnCls}>◀</button>
              <button onClick={toggleAutoPlay} title="Play/Pause" className={`${navBtnCls} flex-1 max-w-[100px] text-sm font-bold ${isAutoPlaying ? 'text-[#ef4444] border-[#ef4444]' : 'text-[#00adb5]'}`}>
                {isAutoPlaying ? '⏸ Pause' : '▶ Play'}
              </button>
              <button onClick={() => stepTo(currentIdx + 1)} title="Next Move" className={navBtnCls}>▶</button>
              <button onClick={() => stepTo(moves.length)} title="Last Move" className={navBtnCls}>⏭</button>
              <button onClick={() => { setView('import'); setMoves([]); setCurrentIdx(0); }} className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#1a2033] border border-[#232c45] text-[#94a3b8] hover:text-white transition-all cursor-pointer">
                New Import
              </button>
            </div>
          </div>

          {/* Review Panel Column (Report vs Analysis) */}
          <div className="flex flex-col gap-4 w-full max-w-[420px] mx-auto lg:mx-0">

            {/* Report / Analysis Tab Selector (Exact Chess.com style) */}
            <div className="flex bg-[#1a2033] border border-[#232c45] rounded-xl p-1 w-full">
              <button
                onClick={() => setActiveReviewTab('report')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer ${activeReviewTab === 'report' ? 'bg-[#2d3748] text-white shadow-md' : 'text-[#94a3b8] hover:text-white'}`}
              >
                Report
              </button>
              <button
                onClick={() => setActiveReviewTab('analysis')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer ${activeReviewTab === 'analysis' ? 'bg-[#2d3748] text-white shadow-md' : 'text-[#94a3b8] hover:text-white'}`}
              >
                Analysis
              </button>
            </div>

            {activeReviewTab === 'report' ? (
              /* ── REPORT TAB (Exact Chess.com Layout) ───────────────── */
              <div className="flex flex-col gap-4">

                {/* 0. Move Feedback & Best Move Suggestion Card (Exact Chess.com Style) */}
                {(() => {
                  const currMove = currentIdx > 0 ? moves[currentIdx - 1] : null;
                  if (!currMove) return null;
                  const isBest = currMove.quality === 'Best' || currMove.quality === 'Brilliant' || currMove.quality === 'Theory';
                  return (
                    <div
                      className="glass-card p-4 flex flex-col gap-1.5 border-l-4 transition-all"
                      style={{ borderLeftColor: currMove.qualityColor }}
                    >
                      <div className="flex items-center gap-2 text-base font-black" style={{ color: currMove.qualityColor }}>
                        <span className="text-xl">{currMove.qualitySymbol}</span>
                        <span>{currMove.san} is {currMove.quality.toLowerCase()}</span>
                      </div>

                      {!isBest && currMove.bestMove && (
                        <div className="text-xs text-[#94a3b8]">
                          The best move was <span className="text-[#22c55e] font-extrabold underline cursor-pointer">{currMove.bestMove}</span>
                        </div>
                      )}

                      {isBest && (
                        <div className="text-xs text-[#22c55e] font-bold">
                          ✓ This was the best move!
                        </div>
                      )}

                      {openingName && (
                        <div className="bg-[#0d1120] border border-[#232c45] rounded-lg px-3 py-1.5 text-[11px] font-bold text-[#e2e8f0] text-center mt-1">
                          {openingName}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 1. Eval Curve Banner */}
                <div className="glass-card p-4">
                  <div className="text-[11px] font-bold text-[#64748b] uppercase tracking-wider mb-2">
                    Evaluation Curve
                  </div>
                  <div className="flex items-end gap-0.5 h-24 bg-[#0d1120] rounded-xl p-2 overflow-x-auto border border-[#232c45]">
                    {evalHistory.map((cp, i) => {
                      const pct = Math.max(8, Math.min(92, 50 + cp / 80));
                      const isActive = i + 1 === currentIdx;
                      return (
                        <div
                          key={i}
                          onClick={() => stepTo(i + 1)}
                          className="flex-1 min-w-[4px] cursor-pointer transition-all rounded-sm relative group"
                          style={{
                            height: `${pct}%`,
                            background: cp >= 0 ? '#e2e8f0' : '#475569',
                            opacity: isActive ? 1 : 0.65,
                            boxShadow: isActive ? '0 0 8px #00fff5' : 'none',
                          }}
                        >
                          <div className="opacity-0 group-hover:opacity-100 absolute -top-7 left-1/2 -translate-x-1/2 bg-[#0d1120] border border-[#232c45] px-1.5 py-0.5 text-[10px] text-white font-mono rounded whitespace-nowrap z-20 pointer-events-none">
                            {i+1}. {cp > 0 ? '+' : ''}{(cp/100).toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Accuracies Bar */}
                <div className="glass-card overflow-hidden">
                  <div className="bg-[#1a2033] px-4 py-2 border-b border-[#232c45] text-center text-xs font-extrabold uppercase tracking-widest text-[#94a3b8]">
                    Accuracies
                  </div>
                  <div className="flex text-center">
                    <div className="flex-1 bg-white text-[#0d1120] py-3.5 text-2xl font-black border-r border-[#232c45]">
                      {whiteAcc?.toFixed(1) ?? '—'}%
                    </div>
                    <div className="flex-1 bg-[#0d1120] text-white py-3.5 text-2xl font-black">
                      {blackAcc?.toFixed(1) ?? '—'}%
                    </div>
                  </div>
                </div>

                {/* 3. Classification Counters Table (Exact Chess.com Style) */}
                <div className="glass-card p-4">
                  <div className="flex justify-between items-center px-3 pb-2 text-[11px] font-bold text-[#64748b] border-b border-[#232c45] uppercase tracking-wider mb-1">
                    <span>White</span>
                    <span>Classification</span>
                    <span>Black</span>
                  </div>

                  <div className="flex flex-col gap-1 mt-2">
                    {(Object.keys(CLASS_META) as QualityType[]).map(q => {
                      const meta = CLASS_META[q];
                      const wCnt = counts[q].w;
                      const bCnt = counts[q].b;
                      return (
                        <div key={q} className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                          <span className="w-8 text-center text-sm font-bold text-white">{wCnt}</span>
                          <div className="flex items-center gap-2 flex-1 justify-center">
                            <span className="text-base">{meta.symbol}</span>
                            <span className="text-xs font-semibold" style={{ color: meta.color }}>
                              {meta.label}
                            </span>
                          </div>
                          <span className="w-8 text-center text-sm font-bold text-white">{bCnt}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            ) : (
              /* ── ANALYSIS TAB (Notation List with Badges) ───────────── */
              <div className="glass-card p-4 flex flex-col gap-4">

                {/* Top Engine lines preview */}
                <div className="bg-[#0d1120] border border-[#232c45] rounded-xl p-3 text-xs font-mono flex flex-col gap-1.5">
                  <div className="text-[10px] font-bold text-[#00adb5] uppercase">Depth: 12 Engine Eval</div>
                  {moves[currentIdx - 1] ? (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-[#00adb5]/20 text-[#00adb5] font-bold rounded">
                        {moves[currentIdx - 1].eval > 0 ? '+' : ''}{(moves[currentIdx - 1].eval / 100).toFixed(2)}
                      </span>
                      <span className="text-[#94a3b8] truncate">
                        {moves[currentIdx - 1].color === 'w' ? 'White' : 'Black'} played {moves[currentIdx - 1].san} ({moves[currentIdx - 1].quality})
                      </span>
                    </div>
                  ) : (
                    <span className="text-[#64748b]">Pilih atau jalankan langkah untuk melihat evaluasi.</span>
                  )}
                </div>

                {/* Notation Table with Classification Icons */}
                <div className="max-h-[380px] overflow-y-auto pr-1">
                  <table className="w-full text-xs font-mono border-collapse">
                    <tbody>
                      {Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => (
                        <tr key={i} className="border-b border-[#232c45]/40 hover:bg-white/5 transition-colors">
                          <td className="px-2 py-2 text-[#64748b] w-8 text-right font-bold">{i + 1}.</td>
                          {[0, 1].map(side => {
                            const idx = i * 2 + side;
                            const m = moves[idx];
                            if (!m) return <td key={side} className="px-2 py-2" />;
                            const isActive = idx + 1 === currentIdx;
                            return (
                              <td
                                key={side}
                                onClick={() => stepTo(idx + 1)}
                                className={`px-2 py-2 cursor-pointer transition-all rounded-lg ${isActive ? 'bg-[#00adb5] text-white font-bold shadow-[0_0_12px_rgba(0,173,181,0.4)]' : 'hover:bg-white/10 text-[#e2e8f0]'}`}
                              >
                                <span className="mr-1.5">{m.qualitySymbol}</span>
                                <span>{m.san}</span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

              </div>
            )}

          </div>

        </div>
      )}
    </div>
  );
}

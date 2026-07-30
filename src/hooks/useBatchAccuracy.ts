// hooks/useBatchAccuracy.ts
// Batch Stockfish accuracy engine — analyzes games missing Chess.com accuracy data.
// Uses chess.js to convert SAN → UCI moves, then evaluates positions at depth 5.
// CAPS2 formula (win% delta per move) → per-game accuracy score.
// Calls onUpdate(gameIndex, accuracy) incrementally per game.

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';
import type { ParsedGame } from '@lib/analysisEngine';
import { cpToWinPct } from '@lib/chessUtils';

const ANALYSIS_DEPTH = 8;     // good quality, still fast enough
const MAX_TOTAL_GAMES = 100;  // up to 100 games per time class (matching display cap)
const MOVE_SAMPLE = 24;       // max plies to analyze per game (samples evenly if game is longer)
const INTER_GAME_DELAY = 120; // ms yield between games so UI stays responsive

// ── CAPS2 accuracy from win% delta ──────────────────────────────────────────
function capsAccuracy(wpBefore: number, wpAfter: number): number {
  const loss = Math.max(0, wpBefore - wpAfter);
  const acc = 103.1668 * Math.exp(-0.04354 * loss) - 3.1669;
  return Math.min(100, Math.max(0, acc));
}

// ── Wait for Stockfish to return bestmove for a given position ──────────────
function evalPosition(worker: Worker, uciMoves: string[], depth: number): Promise<number> {
  return new Promise(resolve => {
    let cp = 0;
    const movesStr = uciMoves.length > 0 ? `moves ${uciMoves.join(' ')}` : '';

    const onMsg = (e: MessageEvent<string | { toString(): string }>) => {
      const line = typeof e.data === 'string' ? e.data : e.data.toString();

      if (line.startsWith('info') && line.includes(' score ')) {
        if (line.includes(' score cp ')) {
          const m = line.match(/score cp (-?\d+)/);
          if (m) cp = parseInt(m[1]);
        } else if (line.includes(' score mate ')) {
          const m = line.match(/score mate (-?\d+)/);
          if (m) cp = parseInt(m[1]) > 0 ? 30000 : -30000;
        }
      } else if (line.startsWith('bestmove')) {
        worker.removeEventListener('message', onMsg as EventListener);
        resolve(cp);
      }
    };

    worker.addEventListener('message', onMsg as EventListener);
    worker.postMessage(`position startpos ${movesStr}`);
    worker.postMessage(`go depth ${depth}`);
  });
}

// ── Initialize a Stockfish worker for batch use ────────────────────────────
function createBatchWorker(): Promise<Worker> {
  return new Promise(resolve => {
    const worker = new Worker('/engine/stockfish.js');
    const onReady = (e: MessageEvent<string | { toString(): string }>) => {
      const line = typeof e.data === 'string' ? e.data : e.data.toString();
      if (line === 'readyok') {
        worker.removeEventListener('message', onReady as EventListener);
        resolve(worker);
      }
    };
    worker.addEventListener('message', onReady as EventListener);
    worker.postMessage('uci');
    worker.postMessage('setoption name Hash value 16');
    worker.postMessage('setoption name Threads value 1');
    worker.postMessage('isready');
  });
}

// ── Analyze a single game PGN → return accuracy for given side ────────────
async function analyzeGameAccuracy(
  worker: Worker,
  pgn: string,
  isWhite: boolean,
): Promise<number> {
  // Parse PGN → get move history as UCI
  const chess = new Chess();
  try {
    chess.loadPgn(pgn, { strict: false });
  } catch {
    return 75; // fallback if PGN parse fails
  }

  const history = chess.history({ verbose: true });
  if (history.length === 0) return 75;

  // Build UCI moves array
  const uciMoves = history.map(m => m.from + m.to + (m.promotion ?? ''));

  // Sample: analyze up to MOVE_SAMPLE plies for speed
  // Focus on the moves of the analyzed player (even indices = white, odd = black)
  const playerIndices: number[] = [];
  for (let i = 0; i < uciMoves.length; i++) {
    const isWhiteMove = i % 2 === 0;
    if (isWhiteMove === isWhite) playerIndices.push(i);
  }

  // Limit sample size
  const sampleIndices = playerIndices.length <= MOVE_SAMPLE
    ? playerIndices
    : playerIndices.filter((_, j) => j % Math.ceil(playerIndices.length / MOVE_SAMPLE) === 0);

  if (sampleIndices.length === 0) return 75;

  const accuracies: number[] = [];

  for (const idx of sampleIndices) {
    // Eval BEFORE the move (sign relative to white's perspective)
    const evalBefore = await evalPosition(worker, uciMoves.slice(0, idx), ANALYSIS_DEPTH);
    const evalAfter  = await evalPosition(worker, uciMoves.slice(0, idx + 1), ANALYSIS_DEPTH);

    // Convert to win% from the moving player's perspective
    const wpBefore = isWhite
      ? cpToWinPct(evalBefore)
      : cpToWinPct(-evalBefore);
    const wpAfter = isWhite
      ? cpToWinPct(evalAfter)
      : cpToWinPct(-evalAfter);

    accuracies.push(capsAccuracy(wpBefore, wpAfter));
  }

  if (accuracies.length === 0) return 75;
  const avg = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
  return Math.round(avg * 10) / 10;
}

// ── Public hook ────────────────────────────────────────────────────────────
export type BatchAccuracyUpdate = (gameIndex: number, acc: number) => void;

export interface UseBatchAccuracyOptions {
  games: ParsedGame[];
  onUpdate: BatchAccuracyUpdate;
  enabled: boolean;
}

export function useBatchAccuracy({ games, onUpdate, enabled }: UseBatchAccuracyOptions) {
  const workerRef  = useRef<Worker | null>(null);
  const runningRef = useRef(false);
  const abortRef   = useRef(false);

  // Take the last MAX_TOTAL_GAMES games PER time class independently.
  // blitz:100 + rapid:2 + bullet:0  →  30 + 2 + 0 = 32 total queued.
  // Then filter to only those that still need accuracy computed.
  const gamesToAnalyze = useMemo(() => {
    const TIME_CLASSES = ['blitz', 'rapid', 'bullet', 'daily'] as const;
    const selected: { game: typeof games[0]; idx: number }[] = [];

    for (const tc of TIME_CLASSES) {
      const classGames = games
        .map((g, i) => ({ game: g, idx: i }))
        .filter(({ game }) => game.timeClass === tc);

      // Take most recent MAX_TOTAL_GAMES from this class
      // parsedGames are newest-first (from getRecentGames sort), so slice(0, N) = latest N
      const recent = classGames.slice(0, MAX_TOTAL_GAMES);
      selected.push(...recent);
    }

    // Only queue games that still need analysis
    return selected.filter(({ game }) => game.myAcc == null && game.computedAcc == null && game.pgn);
  }, [games]);

  const run = useCallback(async (worker: Worker, batch: typeof gamesToAnalyze) => {
    if (runningRef.current) return;
    runningRef.current = true;

    for (const { game, idx } of batch) {
      if (abortRef.current) break;
      try {
        const acc = await analyzeGameAccuracy(worker, game.pgn, game.isWhite);
        if (!abortRef.current) onUpdate(idx, acc);
      } catch {
        // silently skip failed games
      }
      // Yield between games
      await new Promise(r => setTimeout(r, INTER_GAME_DELAY));
    }

    runningRef.current = false;
  }, [onUpdate]);

  useEffect(() => {
    if (!enabled || gamesToAnalyze.length === 0) return;

    let cancelled = false;
    abortRef.current = false;

    // Delay start so initial render completes first
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const worker = await createBatchWorker();
        workerRef.current = worker;
        if (!cancelled) {
          await run(worker, gamesToAnalyze);
        }
        if (!cancelled) worker.terminate();
      } catch {
        // Worker creation failed — skip silently
      }
    }, 2000); // 2s delay after load

    return () => {
      cancelled = true;
      abortRef.current = true;
      clearTimeout(timer);
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      runningRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, games.length]);

  // Expose the actual queue size so callers can display accurate progress totals
  return { queueSize: gamesToAnalyze.length };
}

// hooks/useChessEngine.ts
// COMPOUND HOOK — composes useChessGame + useStockfish + useOpeningBook
// This is the single hook that PlayPage consumes.

import { useState, useCallback, useRef, useEffect } from 'react';
import { Chess, type Square } from 'chess.js';
import { useChessGame, type PlayerColor } from './useChessGame';
import { useStockfish } from './useStockfish';
import { useOpeningBook } from './useOpeningBook';
import { PIECE_NAMES_ID } from '@lib/constants';
import { sideLabel } from '@lib/chessUtils';
import type { SquareBadge } from '@components/organisms/ChessBoard';

export type NotationType = 'PGN' | 'FEN';

export interface SelectedPieceTool {
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k' | 'erase' | null;
  color: 'w' | 'b';
}

interface MpvEval {
  move: string;
  cp: number;
  pvArray: string[];
}

export interface UseChessEngineReturn {
  // Game state (from useChessGame)
  fen: string;
  history: string[];
  pgn: string;
  isGameOver: boolean;
  gameOverReason: string;
  canUndo: boolean;
  canRedo: boolean;

  // Engine state
  playerColor: PlayerColor;
  setPlayerColor: (c: PlayerColor) => void;
  whiteDepth: number;
  setWhiteDepth: (d: number) => void;
  blackDepth: number;
  setBlackDepth: (d: number) => void;
  isPlaying: boolean;
  togglePlay: () => void;
  status: string;

  // Brilliant Hunter Mode
  isBrilliantHunter: boolean;
  setBrilliantHunter: (active: boolean) => void;
  squareBadge: SquareBadge | null;

  // Board Setup / Palette
  selectedTool: SelectedPieceTool;
  setSelectedTool: (tool: SelectedPieceTool) => void;
  handleSquareClick: (square: string) => void;
  handleClearBoard: () => void;
  handleResetBoard: () => void;

  // Notation
  notationType: NotationType;
  setNotationType: (t: NotationType) => void;
  notationValue: string;

  // AI insight
  continuationText: string;
  aiGoalText: string;

  // Actions
  onPieceDrop: (from: string, to: string, piece?: string) => boolean;
  handleUndo: () => void;
  handleRedo: () => void;
  handleReset: () => void;
  handleFlip: () => void;
  boardOrientation: 'white' | 'black';
}

export function useChessEngine(): UseChessEngineReturn {
  const chessGame    = useChessGame();
  const stockfish    = useStockfish();
  const openingBook  = useOpeningBook();

  const [playerColor, setPlayerColor]   = useState<PlayerColor>('white');
  const [whiteDepth, setWhiteDepth]     = useState(8);
  const [blackDepth, setBlackDepth]     = useState(8);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [status, setStatus]             = useState('Click Start AI to begin!');
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [notationType, setNotationType] = useState<NotationType>('PGN');
  const [continuationText, setContinuation] = useState('—');
  const [aiGoalText, setAiGoal]         = useState('🎯 Goal: Waiting for move...');

  const [selectedTool, setSelectedTool] = useState<SelectedPieceTool>({ type: null, color: 'w' });
  const [isBrilliantHunter, setBrilliantHunter] = useState(false);
  const [squareBadge, setSquareBadge]   = useState<SquareBadge | null>(null);

  const isBrilliantHunterRef = useRef(isBrilliantHunter);
  isBrilliantHunterRef.current = isBrilliantHunter;

  const handleSquareClick = useCallback((square: string) => {
    if (!selectedTool.type) return;
    if (selectedTool.type === 'erase') {
      chessGame.removeSquare(square);
    } else {
      chessGame.putPiece(square, selectedTool.type, selectedTool.color);
    }
  }, [selectedTool, chessGame]);

  const handleClearBoard = useCallback(() => {
    chessGame.clearBoard();
    setSquareBadge(null);
    setStatus('Board cleared.');
  }, [chessGame]);

  const handleResetBoard = useCallback(() => {
    chessGame.reset();
    setSquareBadge(null);
    setStatus('Starting position reset.');
  }, [chessGame]);

  const mpvRef          = useRef<MpvEval[]>([]);
  const isAiThinkingRef = useRef(false);
  const isPlayingRef    = useRef(false);
  isPlayingRef.current  = isPlaying;

  // Register Stockfish message handler ONCE — stable, never re-registered.
  // Bug Fix: Previously had `chessGame.fen` as a dependency which caused the handler
  // to be briefly null on every move, creating a window where `bestmove` could be
  // missed entirely, permanently locking isAiThinkingRef = true and freezing the AI.
  useEffect(() => {
    stockfish.setMessageHandler(line => {
      handleEngineInfo(line);
      if (line.startsWith('bestmove')) handleBestMove(line);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockfish]);

  // Trigger AI move when it's AI's turn
  useEffect(() => {
    if (!isPlaying || chessGame.isGameOver) return;
    if (isAiTurn()) {
      const timer = setTimeout(() => {
        scheduleAiMove();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, chessGame.fen, playerColor, chessGame.isGameOver]);

  // Watchdog: if isAiThinkingRef is stuck for more than 15s, auto-recover.
  // This catches edge cases where bestmove is missed and AI freezes permanently.
  useEffect(() => {
    if (!isPlaying) return;
    const watchdog = setInterval(() => {
      if (isAiThinkingRef.current && isPlayingRef.current && !chessGame.isGameOver) {
        console.warn('[Brilliant Hunter Watchdog] AI thinking stuck > 15s, auto-recovering...');
        isAiThinkingRef.current = false;
        stockfish.sendCommand('stop');
        // Re-trigger via a small delay to let Stockfish finish cleanly
        setTimeout(() => scheduleAiMove(), 400);
      }
    }, 15000);
    return () => clearInterval(watchdog);
  }, [isPlaying, chessGame.isGameOver]);

  // ── helpers ────────────────────────────────────────────────────────────── //

  function isAiTurn(): boolean {
    if (chessGame.isGameOver) return false;
    const t = chessGame.game.turn();
    if (playerColor === 'aivsai') return true;
    if (playerColor === 'white')  return t === 'b';
    if (playerColor === 'black')  return t === 'w';
    return false;
  }

  function getDepth(): number {
    return chessGame.game.turn() === 'w' ? whiteDepth : blackDepth;
  }

  function scheduleAiMove() {
    if (isAiThinkingRef.current || !isPlayingRef.current) return;
    isAiThinkingRef.current = true;
    setStatus(isBrilliantHunterRef.current ? '🔥 Brilliant Hunter AI is calculating sacrifices...' : '🤖 AI is thinking...');

    // Bug Fix: Always clear stale MPV data before a new search so detectBrilliantSacrifice
    // never picks a sacrifice from the previous board position.
    mpvRef.current = [];

    // Dynamic MultiPV configuration based on Brilliant Hunter Mode
    stockfish.setMultiPV(isBrilliantHunterRef.current ? 5 : 2);

    // Try opening book first if Brilliant Hunter isn't forcing custom sacrifice evaluation
    if (!isBrilliantHunterRef.current) {
      const bookMove = openingBook.getBookMove(chessGame.game);
      if (bookMove) {
        isAiThinkingRef.current = false;
        const res = chessGame.makeUciMove(bookMove);
        if (res) {
          setStatus(`AI (${res.color === 'w' ? 'White' : 'Black'}): ${res.san}`);
        } else {
          isAiThinkingRef.current = true;
          stockfish.sendCommand('position fen ' + chessGame.game.fen());
          stockfish.sendCommand(`go depth ${getDepth()}`);
        }
        return;
      }
    }

    // Send position to Stockfish
    stockfish.sendCommand('position fen ' + chessGame.game.fen());
    stockfish.sendCommand(`go depth ${getDepth()}`);
  }

  function handleEngineInfo(line: string) {
    const cpMatch   = line.match(/score cp (-?\d+)/);
    const mateMatch = line.match(/score mate (-?\d+)/);
    const pvMatch   = line.match(/pv\s((?:[a-h][1-8][a-h][1-8][qrbn]?\s*)+)/);
    const mpvMatch  = line.match(/multipv\s(\d+)/);

    if (!pvMatch || !mpvMatch) return;
    const rank     = parseInt(mpvMatch[1]);
    const pvMoves  = pvMatch[1].trim().split(/\s+/);
    const cp = cpMatch
      ? parseInt(cpMatch[1])
      : mateMatch
        ? (parseInt(mateMatch[1]) > 0 ? 10000 : -10000)
        : 0;

    mpvRef.current[rank - 1] = { move: pvMoves[0], cp, pvArray: pvMoves };

    if (rank === 1 && pvMoves.length > 0) {
      setContinuation(formatPv(chessGame.game.fen(), pvMoves));
      setAiGoal(buildGoalText(chessGame.game.fen(), pvMoves));
    }
  }

  function handleBestMove(line: string) {
    isAiThinkingRef.current = false;
    if (!isPlayingRef.current) return;

    const parts = line.split(' ');
    const best  = parts[1];
    if (!best || best === '(none)') {
      setStatus(chessGame.gameOverReason || 'Game over');
      return;
    }

    let chosen = best;
    let isBrilliantExec = false;
    let sacrificePieceName = '';
    let sacrificeTargetSq = '';

    // Brilliant Hunter Mode — scan MultiPV lines for safe & tactical piece sacrifices
    if (isBrilliantHunterRef.current) {
      const brilliant = detectBrilliantSacrifice(chessGame.game, mpvRef.current, best);
      if (brilliant.isSacrifice) {
        chosen = brilliant.move;
        isBrilliantExec = true;
        sacrificePieceName = brilliant.pieceName;
        sacrificeTargetSq = brilliant.targetSquare;
        setSquareBadge({ square: brilliant.targetSquare, symbol: '!!', color: '#00c853' });
      } else {
        setSquareBadge(null);
      }
    } else {
      if (openingBook.isNajdorfActive(chessGame.game)) {
        chosen = selectMikhailTalMove(mpvRef.current, best);
      }
      setSquareBadge(null);
    }

    const result = chessGame.makeUciMove(chosen);
    if (result) {
      if (isBrilliantExec) {
        setStatus(`🔥 BRILLIANT SACRIFICE (!!): AI (${result.color === 'w' ? 'White' : 'Black'}) sacrificed ${sacrificePieceName} on ${sacrificeTargetSq}!`);
      } else {
        setStatus(`AI (${result.color === 'w' ? 'White' : 'Black'}): ${result.san}`);
      }
    }
  }

  // ── Public handlers ────────────────────────────────────────────────────── //

  const onPieceDrop = useCallback((from: string, to: string, _piece?: string): boolean => {
    // Clear previous brilliant badge when user plays
    setSquareBadge(null);

    // 1. If AI is playing & it's user's turn, try legal chess move
    if (isPlayingRef.current) {
      if (chessGame.game.turn() === 'b' && playerColor === 'white') return false;
      if (chessGame.game.turn() === 'w' && playerColor === 'black') return false;

      const result = chessGame.move(from, to, 'q');
      if (result) {
        setStatus(`You: ${result.san}`);
        return true;
      }
      return false;
    }

    // 2. Palette mode active → clicks handle placement, drag must not interfere
    if (selectedTool.type) return false;

    // 3. Edit / Custom Position Mode — free piece movement
    if (from === to) return false; // no-op guard
    const moved = chessGame.movePieceCustom(from, to);
    if (moved) {
      setStatus(`Position updated: ${from} ➔ ${to}`);
      return true;
    }

    return false;
  }, [chessGame, playerColor, selectedTool]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      setIsPlaying(false);
      stockfish.sendCommand('stop');
      setStatus('AI paused.');
    } else {
      setIsPlaying(true);
      setStatus('AI running...');
    }
  }, [isPlaying, stockfish]);

  const handleUndo = useCallback(() => {
    stockfish.sendCommand('stop');
    setSquareBadge(null);
    chessGame.undo();
    if (playerColor !== 'aivsai') chessGame.undo(); // undo AI move too
    isAiThinkingRef.current = false;
  }, [chessGame, stockfish, playerColor]);

  const handleRedo = useCallback(() => {
    setSquareBadge(null);
    chessGame.redo();
  }, [chessGame]);

  const handleReset = useCallback(() => {
    stockfish.sendCommand('stop');
    setSquareBadge(null);
    chessGame.reset();
    mpvRef.current = [];
    isAiThinkingRef.current = false;
    setIsPlaying(false);
    setStatus('Click Start AI to begin!');
    setContinuation('—');
    setAiGoal('🎯 Goal: Waiting for move...');
  }, [chessGame, stockfish]);

  const handleFlip = useCallback(() => {
    setBoardOrientation(o => o === 'white' ? 'black' : 'white');
  }, []);

  const notationValue = notationType === 'PGN' ? chessGame.pgn : chessGame.fen;

  return {
    fen: chessGame.fen,
    history: chessGame.history,
    pgn: chessGame.pgn,
    isGameOver: chessGame.isGameOver,
    gameOverReason: chessGame.gameOverReason,
    canUndo: chessGame.canUndo,
    canRedo: chessGame.canRedo,
    playerColor,
    setPlayerColor,
    whiteDepth,
    setWhiteDepth,
    blackDepth,
    setBlackDepth,
    isPlaying,
    togglePlay,
    status,
    isBrilliantHunter,
    setBrilliantHunter,
    squareBadge,
    selectedTool,
    setSelectedTool,
    handleSquareClick,
    handleClearBoard,
    handleResetBoard,
    notationType,
    setNotationType,
    notationValue,
    continuationText,
    aiGoalText,
    onPieceDrop,
    handleUndo,
    handleRedo,
    handleReset,
    handleFlip,
    boardOrientation,
  };
}

// ── PV formatting & goal text helpers (pure) ────────────────────────────── //

function formatPv(fen: string, uciArray: string[]): string {
  try {
    const tmp = new Chess(fen);
    const moves: string[] = [];
    for (let i = 0; i < Math.min(4, uciArray.length); i++) {
      const uci = uciArray[i];
      if (!uci || uci.length < 4) break;
      const res = tmp.move({ from: uci.substring(0,2), to: uci.substring(2,4), promotion: uci[4] ?? 'q' });
      if (res) moves.push(`${sideLabel(res.color === 'w' ? 'w' : 'b')}: ${res.san}`);
      else break;
    }
    return moves.length > 0 ? moves.join(' ➔ ') : '—';
  } catch { return '—'; }
}

function buildGoalText(fen: string, uciArray: string[]): string {
  try {
    const tmp  = new Chess(fen);
    const uci  = uciArray[0];
    if (!uci || uci.length < 4) return '🎯 Goal: Adjusting positional tempo.';
    const res  = tmp.move({ from: uci.substring(0,2), to: uci.substring(2,4), promotion: uci[4] ?? 'q' });
    if (!res) return '🎯 Goal: Adjusting positional tempo.';
    const side = sideLabel(res.color === 'w' ? 'w' : 'b');

    if (tmp.isCheckmate())   return `🎯 Goal (${side}): ⚡ EXECUTE CHECKMATE!`;
    if (tmp.inCheck())       return `🎯 Goal (${side}): 💥 Check enemy King!`;
    if (res.captured) {
      const n = PIECE_NAMES_ID[res.captured] ?? 'Piece';
      return `🎯 Goal (${side}): ⚔️ Capture enemy ${n}.`;
    }
    if (res.san === 'O-O' || res.san === 'O-O-O')
      return `🎯 Goal (${side}): 🏰 Castle for King safety.`;
    if (res.piece === 'p' && ['e4','d4','e5','d5'].includes(res.to))
      return `🎯 Goal (${side}): ♟️ Control central square (${res.to}).`;
    if (res.piece === 'n' || res.piece === 'b') {
      const pn = res.piece === 'n' ? 'Knight' : 'Bishop';
      return `🎯 Goal (${side}): 🐴 Develop ${pn} to ${res.to}.`;
    }
    return `🎯 Goal (${side}): ♟️ Solidify position on ${res.to}.`;
  } catch { return '🎯 Goal: Structuring positional strategy.'; }
}

function selectMikhailTalMove(mpv: MpvEval[], defaultMove: string): string {
  if (!mpv.length) return defaultMove;
  const topCp = mpv[0].cp;
  for (const e of mpv) {
    if (!e?.move) continue;
    if (topCp - e.cp > 80) continue;
    return e.move;
  }
  return defaultMove;
}

interface BrilliantAnalysisResult {
  move: string;
  isSacrifice: boolean;
  pieceName: string;
  targetSquare: string;
}

function detectBrilliantSacrifice(
  game: Chess,
  mpvList: MpvEval[],
  defaultBest: string,
): BrilliantAnalysisResult {
  const PIECE_VALUES: Record<string, number> = {
    p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
  };

  // Filter to valid entries only
  const validItems = mpvList.filter(item => item && item.move && item.move.length >= 4);
  if (validItems.length === 0) {
    return { move: defaultBest, isSacrifice: false, pieceName: '', targetSquare: '' };
  }

  // IMPORTANT: In Stockfish UCI protocol, `score cp` is ALREADY from the side-to-move's
  // perspective. cp=+200 always means the moving side has +2 pawn advantage.
  // No flipping needed — previous normalizeCp was a double-flip BUG.
  const topCp = validItems[0].cp;

  // Refuse to hunt for sacrifices if the position is already objectively losing.
  // If our best line is already worse than -1 pawn, don't throw more material away.
  if (topCp < -100) {
    return { move: defaultBest, isSacrifice: false, pieceName: '', targetSquare: '' };
  }

  // Scan ALL candidate lines (including #1) — a brilliant sacrifice is often line 1.
  // We use a TIGHT window: the sacrifice line must be within 60cp of the best line,
  // and must not leave us in a position worse than -80cp (not a blunder).
  const MAX_CP_DELTA = 60;
  const MIN_CP_AFTER = -80;

  for (const item of validItems) {
    const cpDelta = topCp - item.cp;
    if (cpDelta > MAX_CP_DELTA) continue;   // Too inferior — skip
    if (item.cp < MIN_CP_AFTER) continue;   // Results in losing position — skip

    const uci = item.move;
    const from = uci.substring(0, 2);
    const to   = uci.substring(2, 4);

    const piece = game.get(from as Square);
    // Only flag Knight, Bishop, Rook, or Queen sacrifices (not King or pawn)
    if (!piece || piece.type === 'k' || piece.type === 'p') continue;

    const attackerVal = PIECE_VALUES[piece.type] || 0;
    const targetPiece = game.get(to as Square);
    const targetVal   = targetPiece ? (PIECE_VALUES[targetPiece.type] || 0) : 0;

    // Sacrifice Type A — Unequal trade: AI piece captures a clearly lower-value opponent piece
    // Example: Rook(5) takes Knight(3) = delta 2. Queen(9) takes Rook(5) = delta 4.
    if (targetPiece && targetPiece.color !== piece.color && (attackerVal - targetVal >= 2)) {
      return {
        move: uci,
        isSacrifice: true,
        pieceName: PIECE_NAMES_ID[piece.type] || piece.type,
        targetSquare: to,
      };
    }

    // Sacrifice Type B — Positional: AI moves to an empty square that the opponent
    // can immediately recapture with a STRICTLY CHEAPER piece (not equal exchange).
    // Example: Knight(3) leaps to a square defended by only a Pawn(1) → sacrifice.
    if (!targetPiece) {
      try {
        const clone = new Chess(game.fen());
        const res = clone.move({ from, to, promotion: uci[4] ?? 'q' });
        if (res) {
          const oppMoves = clone.moves({ verbose: true });
          const canRecaptureCheaply = oppMoves.some(
            om => om.to === to && (PIECE_VALUES[om.piece] || 0) < attackerVal,
          );
          if (canRecaptureCheaply) {
            return {
              move: uci,
              isSacrifice: true,
              pieceName: PIECE_NAMES_ID[piece.type] || piece.type,
              targetSquare: to,
            };
          }
        }
      } catch { /* ignore */ }
    }
  }

  return { move: defaultBest, isSacrifice: false, pieceName: '', targetSquare: '' };
}

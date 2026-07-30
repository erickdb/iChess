// hooks/useChessEngine.ts
// COMPOUND HOOK — composes useChessGame + useStockfish + useOpeningBook
// This is the single hook that PlayPage consumes.

import { useState, useCallback, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
import { useChessGame, type PlayerColor } from './useChessGame';
import { useStockfish } from './useStockfish';
import { useOpeningBook } from './useOpeningBook';
import { PIECE_NAMES_ID } from '@lib/constants';
import { sideLabel } from '@lib/chessUtils';

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
    setStatus('Board cleared.');
  }, [chessGame]);

  const handleResetBoard = useCallback(() => {
    chessGame.reset();
    setStatus('Starting position reset.');
  }, [chessGame]);

  const mpvRef          = useRef<MpvEval[]>([]);
  const isAiThinkingRef = useRef(false);
  const isPlayingRef    = useRef(false);
  isPlayingRef.current  = isPlaying;

  // Register Stockfish message handler
  useEffect(() => {
    stockfish.setMessageHandler(line => {
      handleEngineInfo(line);
      if (line.startsWith('bestmove')) handleBestMove(line);
    });
  }, [stockfish, chessGame.fen]);

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
    setStatus('🤖 AI is thinking...');

    // Try opening book first
    const bookMove = openingBook.getBookMove(chessGame.game);
    if (bookMove) {
      isAiThinkingRef.current = false;
      const res = chessGame.makeUciMove(bookMove);
      if (res) {
        setStatus(`AI (${res.color === 'w' ? 'White' : 'Black'}): ${res.san}`);
      } else {
        // Fall back to engine if book move failed
        isAiThinkingRef.current = true;
        stockfish.sendCommand('position fen ' + chessGame.game.fen());
        stockfish.sendCommand(`go depth ${getDepth()}`);
      }
      return;
    }

    // Fall back to Stockfish
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

    // Najdorf Mikhail Tal speculative mode
    let chosen = best;
    if (openingBook.isNajdorfActive(chessGame.game)) {
      chosen = selectMikhailTalMove(mpvRef.current, best);
    }

    const result = chessGame.makeUciMove(chosen);
    if (result) {
      setStatus(`AI (${result.color === 'w' ? 'White' : 'Black'}): ${result.san}`);
    }
  }

  // ── Public handlers ────────────────────────────────────────────────────── //

  const onPieceDrop = useCallback((from: string, to: string, _piece?: string): boolean => {
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
    const pieceOnFrom = chessGame.game.get(from as any);
    if (pieceOnFrom) {
      chessGame.removeSquare(from);
      chessGame.putPiece(to, pieceOnFrom.type, pieceOnFrom.color);
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
    chessGame.undo();
    if (playerColor !== 'aivsai') chessGame.undo(); // undo AI move too
    isAiThinkingRef.current = false;
  }, [chessGame, stockfish, playerColor]);

  const handleRedo = useCallback(() => {
    chessGame.redo();
  }, [chessGame]);

  const handleReset = useCallback(() => {
    stockfish.sendCommand('stop');
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

// hooks/useChessGame.ts
// Manages chess.js game state: moves, undo, redo, FEN, PGN, history.
// SRP: only game state logic, no AI, no UI.

import { useState, useCallback, useRef } from 'react';
import { Chess, type Move, type Square } from 'chess.js';

export type PlayerColor = 'white' | 'black' | 'aivsai';

export interface UseChessGameReturn {
  game: Chess;
  fen: string;
  history: string[];
  pgn: string;
  isGameOver: boolean;
  gameOverReason: string;
  move: (from: string, to: string, promotion?: string) => Move | null;
  makeUciMove: (uci: string) => Move | null;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  loadFen: (newFen: string) => boolean;
  putPiece: (square: string, type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k', color: 'w' | 'b') => boolean;
  removeSquare: (square: string) => boolean;
  clearBoard: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useChessGame(): UseChessGameReturn {
  const gameRef     = useRef<Chess>(new Chess());
  const [fen, setFen]         = useState(gameRef.current.fen());
  const [history, setHistory] = useState<string[]>([]);
  const [pgn, setPgn]         = useState('');
  const redoStackRef          = useRef<string[]>([]); // stores FEN snapshots for redo

  const sync = useCallback(() => {
    setFen(gameRef.current.fen());
    setHistory(gameRef.current.history());
    setPgn(gameRef.current.pgn());
  }, []);

  const move = useCallback((from: string, to: string, promotion = 'q'): Move | null => {
    try {
      const result = gameRef.current.move({ from, to, promotion });
      if (result) {
        redoStackRef.current = []; // any new move clears redo stack
        sync();
      }
      return result;
    } catch {
      return null;
    }
  }, [sync]);

  const makeUciMove = useCallback((uci: string): Move | null => {
    if (!uci || uci.length < 4) return null;
    return move(uci.substring(0, 2), uci.substring(2, 4), uci.length > 4 ? uci[4] : 'q');
  }, [move]);

  const undo = useCallback(() => {
    const undone = gameRef.current.undo();
    if (undone) {
      // push current FEN to redo stack before undo
      redoStackRef.current.push(gameRef.current.fen());
      sync();
    }
  }, [sync]);

  const redo = useCallback(() => {
    const nextFen = redoStackRef.current.pop();
    if (nextFen) {
      gameRef.current.load(nextFen);
      sync();
    }
  }, [sync]);

  const reset = useCallback(() => {
    gameRef.current = new Chess();
    redoStackRef.current = [];
    sync();
  }, [sync]);

  const loadFen = useCallback((newFen: string): boolean => {
    try {
      gameRef.current.load(newFen);
      redoStackRef.current = [];
      sync();
      return true;
    } catch {
      return false;
    }
  }, [sync]);

  const putPiece = useCallback((square: string, type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k', color: 'w' | 'b'): boolean => {
    try {
      gameRef.current.remove(square as Square);
      const ok = gameRef.current.put({ type, color }, square as Square);
      if (ok) sync();
      return ok;
    } catch {
      return false;
    }
  }, [sync]);

  const removeSquare = useCallback((square: string): boolean => {
    try {
      gameRef.current.remove(square as Square);
      sync();
      return true;
    } catch {
      return false;
    }
  }, [sync]);

  const clearBoard = useCallback(() => {
    gameRef.current.clear();
    sync();
  }, [sync]);

  const g = gameRef.current;
  const isGameOver = g.isGameOver();
  const gameOverReason = isGameOver
    ? g.isCheckmate()    ? (g.turn() === 'w' ? 'Hitam Menang! Skakmat!' : 'Putih Menang! Skakmat!')
    : g.isStalemate()   ? 'Seri — Stalemate!'
    : g.isDraw()        ? 'Seri — Posisi Draw!'
    : 'Game Over'
    : '';

  return {
    game: gameRef.current,
    fen,
    history,
    pgn,
    isGameOver,
    gameOverReason,
    move,
    makeUciMove,
    undo,
    redo,
    reset,
    loadFen,
    putPiece,
    removeSquare,
    clearBoard,
    canUndo: history.length > 0,
    canRedo: redoStackRef.current.length > 0,
  };
}

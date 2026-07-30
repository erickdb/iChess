// hooks/useOpeningBook.ts
// Custom hook that encapsulates the London System + Sicilian Najdorf opening book logic.
// Exposed via useChessEngine (hook composition).

import { useCallback } from 'react';
import { Chess } from 'chess.js';
import { LONDON_TREE, SICILIAN_NAJDORF_TREE } from '@lib/constants';

export function useOpeningBook() {
  /**
   * Given the current game history (SAN) and a Chess instance,
   * returns a UCI candidate move from the opening book if available,
   * or null to fall back to Stockfish.
   */
  const getBookMove = useCallback((game: Chess): string | null => {
    const history    = game.history();
    const historyStr = history.join(' ');
    const turn       = game.turn();

    let candidateUci: string | null = null;

    if (turn === 'w') {
      candidateUci = history.length === 0
        ? 'd2d4'
        : (LONDON_TREE[historyStr] ?? null);
    } else {
      candidateUci = SICILIAN_NAJDORF_TREE[historyStr] ?? null;
    }

    if (!candidateUci) return null;

    // Validate legality
    if (!canPlayUci(game, candidateUci)) return null;

    // Tactical safety guard
    if (!isMoveTacticallySafe(game, candidateUci)) return null;

    return candidateUci;
  }, []);

  const isNajdorfActive = useCallback((game: Chess): boolean => {
    const h = game.history();
    if (h.length < 10) return false;
    const str = h.join(' ');
    return str.includes('c5') && str.includes('a6') && (str.includes('Nf6') || str.includes('d6'));
  }, []);

  return { getBookMove, isNajdorfActive };
}

// ── helpers ──────────────────────────────────────────────────────────────── //

function canPlayUci(game: Chess, uci: string): boolean {
  if (!uci || uci.length < 4) return false;
  const legal = game.moves({ verbose: true });
  const from  = uci.substring(0, 2);
  const to    = uci.substring(2, 4);
  const promo = uci.length > 4 ? uci[4] : undefined;
  return legal.some(m => m.from === from && m.to === to && (!promo || m.promotion === promo));
}

function isMoveTacticallySafe(game: Chess, uci: string): boolean {
  if (!uci || uci.length < 4) return false;
  const tmpBoard = new Chess(game.fen());
  const from  = uci.substring(0, 2);
  const to    = uci.substring(2, 4);
  const promo = uci.length > 4 ? uci[4] : undefined;

  const moveObj = tmpBoard.move({ from, to, promotion: promo });
  if (!moveObj) return false;

  const pv: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const oppMoves = tmpBoard.moves({ verbose: true });

  for (const opp of oppMoves) {
    if (!opp.captured) continue;
    const capVal     = pv[opp.captured] ?? 1;
    const attVal     = pv[opp.piece]    ?? 1;
    const defender   = new Chess(tmpBoard.fen());
    defender.move({ from: opp.from, to: opp.to, promotion: 'q' });
    const recaps     = defender.moves({ verbose: true }).filter(m => m.to === opp.to);
    if (recaps.length === 0 && capVal >= attVal) return false;
  }
  return true;
}

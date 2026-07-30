// lib/chessUtils.ts
// Pure utility functions for PGN/FEN parsing — no side effects

export function parsePGNHeaders(pgn: string): Record<string, string> {
  const h: Record<string, string> = {};
  const re = /\[(\w+)\s+"([^"]*)"\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pgn)) !== null) h[m[1]] = m[2];
  return h;
}

export function getMoveCount(pgn: string): number {
  if (!pgn) return 0;
  const ms = pgn.match(/\b(\d+)\./g);
  return ms ? Math.max(...ms.map(s => parseInt(s))) : 0;
}

export function getOpeningName(headers: Record<string, string>): string {
  return headers['ECOUrl']
    ? headers['ECOUrl'].split('/').pop()?.replace(/-/g, ' ') ?? 'Unknown Opening'
    : headers['Opening'] ?? 'Unknown Opening';
}

export function formatAccuracy(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '—';
  return `${val.toFixed(1)}%`;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

export function cpToWinPct(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Convert a chess.js `game.turn()` ('w' | 'b') to human-readable side name */
export function sideLabel(turn: 'w' | 'b'): string {
  return turn === 'w' ? 'Putih' : 'Hitam';
}

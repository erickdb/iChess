// lib/constants.ts
// All global constants for iChess — one source of truth

export const API_BASE = 'https://api.chess.com/pub/player';

export const UA_HDR: Record<string, string> = {
  'User-Agent': 'iChess-Platform/2.0 (ichess@example.com)',
};

export interface TimeClassConfig {
  icon: string;
  label: string;
  cls: string;
  color: string;
}

export const TC_CFG: Record<string, TimeClassConfig> = {
  blitz:          { icon: '⚡', label: 'Blitz',    cls: 'blitz',    color: '#f59e0b' },
  rapid:          { icon: '🕐', label: 'Rapid',    cls: 'rapid',    color: '#22c55e' },
  bullet:         { icon: '🔫', label: 'Bullet',   cls: 'bullet',   color: '#ef4444' },
  daily:          { icon: '📅', label: 'Daily',    cls: 'daily',    color: '#3b82f6' },
  puzzle:         { icon: '🧩', label: 'Puzzles',  cls: 'puzzle',   color: '#a855f7' },
  chess960_blitz: { icon: '🔮', label: 'Chess960', cls: 'puzzle960', color: '#ec4899' },
};

export const MODE_LABELS: Record<string, string> = {
  all:    'All Games',
  bullet: 'Bullet',
  blitz:  'Blitz',
  rapid:  'Rapid',
};

export const MODE_ICONS: Record<string, string> = {
  all:    '🌐',
  bullet: '🔫',
  blitz:  '⚡',
  rapid:  '🕐',
};

export type AnalysisMode = 'all' | 'bullet' | 'blitz' | 'rapid';

export type GameResult = 'win' | 'loss' | 'draw';

// London System opening tree (UCI moves)
export const LONDON_TREE: Record<string, string> = {
  '': 'd2d4',
  'd4': 'c1f4',
  'd4 d5': 'c1f4',
  'd4 Nf6': 'c1f4',
  'd4 e6': 'c1f4',
  'd4 g6': 'c1f4',
  'd4 d6': 'c1f4',
  'd4 c5': 'd4d5',
  'd4 e5': 'd4e5',
  'd4 f5': 'c1f4',
  'd4 Nc6': 'g1f3',
  'd4 d5 Bf4': 'e2e3',
  'd4 d5 Bf4 Nf6': 'e2e3',
  'd4 d5 Bf4 c5': 'c2c3',
  'd4 d5 Bf4 e6': 'g1f3',
  'd4 d5 Bf4 Bf5': 'e2e3',
  'd4 d5 Bf4 Bd6': 'f4g3',
  'd4 d5 Bf4 Nc6': 'e2e3',
  'd4 d5 Bf4 c6': 'e2e3',
  'd4 d5 Bf4 Nf6 e3 c5': 'c2c3',
  'd4 d5 Bf4 Nf6 e3 e6': 'g1f3',
  'd4 d5 Bf4 Nf6 e3 Bf5': 'g1f3',
  'd4 d5 Bf4 Nf6 e3 Bd6': 'f4g3',
  'd4 d5 Bf4 Bf5 e3 e6': 'g1f3',
  'd4 d5 Bf4 Bf5 e3 Bd6': 'f4g3',
  'd4 d5 Bf4 Bf5 e3 e6 Nf3 Bd6': 'f4g3',
  'd4 d5 Bf4 Bf5 e3 e6 Nf3 c5': 'c2c3',
  'd4 d5 Bf4 Bf5 e3 e6 Nf3 Nf6': 'c2c3',
  'd4 d5 Bf4 Bf5 e3 e6 Nf3 Be7': 'b1d2',
  'd4 d5 Bf4 Nf6 e3 c5 c3 Qb6': 'd1b3',
  'd4 d5 Bf4 Bf5 e3 e6 Nf3 Bd6 Bg3 Bxg3': 'h2g3',
};

// Sicilian Najdorf opening tree (UCI moves)
export const SICILIAN_NAJDORF_TREE: Record<string, string> = {
  'e4': 'c7c5',
  'e4 c5 Nf3': 'd7d6',
  'e4 c5 Nf3 d6 d4': 'c5d4',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4': 'g8f6',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3': 'a7a6',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5': 'e7e6',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3': 'e7e5',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2': 'e7e5',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 h3':  'e7e5',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 f4':  'e7e5',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 g3':  'e7e5',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bc4': 'e7e6',
};

export const PIECE_VALUES: Record<string, number> = {
  p: 1, n: 3, b: 3, r: 5, q: 9, k: 100,
};

export const PIECE_NAMES_ID: Record<string, string> = {
  p: 'Pion', n: 'Kuda', b: 'Gajah', r: 'Benteng', q: 'Menteri',
};

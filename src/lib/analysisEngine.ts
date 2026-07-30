// lib/analysisEngine.ts
// Pure computation functions for Aimchess-style player analytics
// No DOM, no React, no side effects — pure data in, data out.

import type { GameResult, AnalysisMode } from './constants';
import { parsePGNHeaders, getMoveCount, getOpeningName } from './chessUtils';
import { MODE_LABELS, MODE_ICONS } from './constants';

// ─────────────────────────────────────────────────────────────────────────── //
//  TYPES
// ─────────────────────────────────────────────────────────────────────────── //
export interface ParsedGame {
  result: GameResult;
  myAcc: number | null;
  oppAcc: number | null;
  opening: string;
  moveCount: number;
  lostOnTime: boolean;
  isWhite: boolean;
  myRating: number;
  oppRating: number;
  oppUsername: string;
  timeClass: string;
  url: string;
  pgn: string;           // raw PGN — needed for local Stockfish accuracy
  computedAcc?: number;  // filled by batch accuracy engine, overrides myAcc if present
}

export interface CategoryScore {
  score: number;        // 0–100
  label: string;        // e.g. "Good", "Excellent"
  description: string;
}

export interface AllCategoriesAnalysis {
  opening:         CategoryScore;
  tactics:         CategoryScore;
  resourcefulness: CategoryScore;
  advCap:          CategoryScore;
  timeMgmt:        CategoryScore;
  endgame:         CategoryScore;
  overall:         CategoryScore;
  openingStats:    OpeningEntry[];
  endgameStats:    EndgameStats;
}

export interface OpeningEntry {
  name: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
}

export interface AccuracyPhaseData {
  overall: number | null;
  opening: number | null;    // moves 1-15
  middlegame: number | null; // moves 16-35
  endgame: number | null;    // moves 36+
  sampleSize: number;
}

export interface EndgameStats {
  gameCount: number;            // games reaching move 36+
  winRate: number;              // win% in those games (0-1)
  wins: number;
  draws: number;
  losses: number;
  lostOnTime: number;           // flagged in long games
  overallWinRate: number;       // baseline for comparison
  advantageConversion: number;  // win% in endgame games where myRating >= oppRating - 50
  reachRate: number;            // % of total games that reached move 36+
}

// ─────────────────────────────────────────────────────────────────────────── //
//  RAW GAME PARSER
// ─────────────────────────────────────────────────────────────────────────── //
export function parseGames(
  games: ChessComGame[],
  username: string,
): ParsedGame[] {
  const lu = username.toLowerCase();
  return games.map(game => {
    const isWhite = game.white.username.toLowerCase() === lu;
    const me  = isWhite ? game.white  : game.black;
    const opp = isWhite ? game.black  : game.white;
    const myAcc  = isWhite ? game.accuracies?.white ?? null : game.accuracies?.black ?? null;
    const oppAcc = isWhite ? game.accuracies?.black ?? null : game.accuracies?.white ?? null;

    let result: GameResult;
    if (me.result === 'win') result = 'win';
    else if (['checkmated','resigned','timeout','abandoned','bughousepartnerlose'].includes(me.result)) result = 'loss';
    else result = 'draw';

    const headers   = parsePGNHeaders(game.pgn ?? '');
    const moveCount = getMoveCount(game.pgn ?? '');
    const opening   = getOpeningName(headers);
    const term      = (headers['Termination'] ?? '').toLowerCase();
    const lostOnTime = result === 'loss' && term.includes('time');

    return {
      result, myAcc, oppAcc, opening, moveCount, lostOnTime,
      isWhite, myRating: me.rating, oppRating: opp.rating,
      oppUsername: opp.username,
      timeClass: game.time_class, url: game.url,
      pgn: game.pgn ?? '',
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────── //
//  CATEGORY COMPUTATION
// ─────────────────────────────────────────────────────────────────────────── //
export function computeAllCategories(
  games: ParsedGame[],
  _baseRating: number,
): AllCategoriesAnalysis {
  const wins   = games.filter(g => g.result === 'win').length;
  const losses = games.filter(g => g.result === 'loss').length;
  const total  = games.length;
  const winRate = total > 0 ? wins / total : 0;

  // Opening: win rate in first 20 moves
  const openingGames = games.filter(g => g.moveCount <= 25);
  const openingWinRate = openingGames.length > 0
    ? openingGames.filter(g => g.result === 'win').length / openingGames.length
    : winRate;

  // Tactics: average accuracy
  const accGames = games.filter(g => g.myAcc != null);
  const avgAcc = accGames.length > 0
    ? accGames.reduce((s, g) => s + (g.myAcc ?? 0), 0) / accGames.length
    : 70;

  // Resourcefulness: win rate when my accuracy < opponent accuracy
  const underDogGames = games.filter(g => g.myAcc != null && g.oppAcc != null && (g.myAcc ?? 0) < (g.oppAcc ?? 0));
  const resourceScore = underDogGames.length > 0
    ? underDogGames.filter(g => g.result === 'win').length / underDogGames.length
    : 0.15;

  // AdvCap: win rate in high accuracy games (>= 75%)
  const highAccGames = games.filter(g => (g.myAcc ?? 0) >= 75);
  const advCapScore  = highAccGames.length > 0
    ? highAccGames.filter(g => g.result === 'win').length / highAccGames.length
    : winRate;

  // Time Management: loss by timeout ratio
  const timeoutLosses = games.filter(g => g.lostOnTime).length;
  const timeMgmtScore = losses > 0 ? 1 - (timeoutLosses / losses) : 1;

  // Endgame: comprehensive game-based metrics for games reaching move 36+
  const endgameGames   = games.filter(g => g.moveCount > 35);
  const endgameWins    = endgameGames.filter(g => g.result === 'win').length;
  const endgameDraws   = endgameGames.filter(g => g.result === 'draw').length;
  const endgameLosses  = endgameGames.filter(g => g.result === 'loss').length;
  const endgameLostOnTime = endgameGames.filter(g => g.lostOnTime).length;
  const endgameWinRate = endgameGames.length > 0 ? endgameWins / endgameGames.length : winRate;

  // Advantage conversion: in long games where player is close-to-equal or favoured
  const endgameAdvGames = endgameGames.filter(g => g.myRating >= g.oppRating - 50);
  const endgameAdvConv  = endgameAdvGames.length > 0
    ? endgameAdvGames.filter(g => g.result === 'win').length / endgameAdvGames.length
    : endgameWinRate;

  const endgameStats: EndgameStats = {
    gameCount:           endgameGames.length,
    winRate:             endgameWinRate,
    wins:                endgameWins,
    draws:               endgameDraws,
    losses:              endgameLosses,
    lostOnTime:          endgameLostOnTime,
    overallWinRate:      winRate,
    advantageConversion: endgameAdvConv,
    reachRate:           total > 0 ? endgameGames.length / total : 0,
  };

  // Overall composite
  const overallScore = (openingWinRate + (avgAcc / 100) + resourceScore + advCapScore + timeMgmtScore + endgameWinRate) / 6;

  // Opening breakdown per opening name
  const openingMap: Record<string, { wins: number; draws: number; losses: number; games: number }> = {};
  for (const g of games) {
    if (!openingMap[g.opening]) openingMap[g.opening] = { wins: 0, draws: 0, losses: 0, games: 0 };
    openingMap[g.opening].games++;
    if (g.result === 'win')  openingMap[g.opening].wins++;
    if (g.result === 'draw') openingMap[g.opening].draws++;
    if (g.result === 'loss') openingMap[g.opening].losses++;
  }
  const openingStats: OpeningEntry[] = Object.entries(openingMap)
    .map(([name, s]) => ({ name, ...s, winRate: s.games > 0 ? s.wins / s.games : 0 }))
    .sort((a, b) => b.games - a.games)
    .slice(0, 8);

  const score = (raw: number) => Math.round(clampScore(raw * 100));
  const label = (s: number) =>
    s >= 80 ? 'Excellent' : s >= 65 ? 'Good' : s >= 50 ? 'Average' : 'Needs Work';
  const desc  = (s: number, cat: string) => `${cat}: ${label(s)} (${s}/100)`;

  return {
    opening:         { score: score(openingWinRate),  label: label(score(openingWinRate)),  description: desc(score(openingWinRate), 'Opening') },
    tactics:         { score: Math.round(avgAcc),     label: label(Math.round(avgAcc)),     description: desc(Math.round(avgAcc), 'Tactics') },
    resourcefulness: { score: score(resourceScore),   label: label(score(resourceScore)),   description: desc(score(resourceScore), 'Resourcefulness') },
    advCap:          { score: score(advCapScore),     label: label(score(advCapScore)),     description: desc(score(advCapScore), 'Advantage Conversion') },
    timeMgmt:        { score: score(timeMgmtScore),   label: label(score(timeMgmtScore)),   description: desc(score(timeMgmtScore), 'Time Management') },
    endgame:         { score: score(endgameWinRate),  label: label(score(endgameWinRate)),  description: desc(score(endgameWinRate), 'Endgame') },
    overall:         { score: score(overallScore),    label: label(score(overallScore)),    description: desc(score(overallScore), 'Overall') },
    openingStats,
    endgameStats,
  };
}

function clampScore(n: number): number {
  return Math.min(100, Math.max(0, n));
}

// ─────────────────────────────────────────────────────────────────────────── //
//  ACCURACY PHASE BREAKDOWN
// ─────────────────────────────────────────────────────────────────────────── //
export function computeAccuracyByPhase(
  games: ParsedGame[],
  mode: string,
): AccuracyPhaseData {
  const filtered = mode === 'all'
    ? games
    : games.filter(g => g.timeClass === mode);

  // Use myAcc from Chess.com if available, else computedAcc from Stockfish
  const effectiveAcc = (g: ParsedGame): number | null => g.myAcc ?? g.computedAcc ?? null;

  const withAcc = filtered.filter(g => effectiveAcc(g) != null);
  if (withAcc.length === 0) {
    return { overall: null, opening: null, middlegame: null, endgame: null, sampleSize: 0 };
  }

  const overall = avg(withAcc.map(g => effectiveAcc(g)!));

  // Since myAcc is a whole-game value from Chess.com (not per-phase),
  // we use the game as representative for a phase based on its length.
  // A short game (~≤20 moves) is more opening-focused, long game (36+) more endgame-focused.
  // But we always fall back to overall if not enough phase-specific games exist.
  const openingGames    = withAcc.filter(g => g.moveCount <= 20);
  const middlegameGames = withAcc.filter(g => g.moveCount > 10 && g.moveCount <= 40);
  const endgameGames    = withAcc.filter(g => g.moveCount > 25);

  // If a phase bucket is empty, fall back to overall so we never show "—"
  const openingAcc    = openingGames.length > 0    ? avg(openingGames.map(g => effectiveAcc(g)!))    : overall;
  const middlegameAcc = middlegameGames.length > 0 ? avg(middlegameGames.map(g => effectiveAcc(g)!)) : overall;
  const endgameAcc    = endgameGames.length > 0    ? avg(endgameGames.map(g => effectiveAcc(g)!))    : overall;

  return {
    overall,
    opening:    openingAcc,
    middlegame: middlegameAcc,
    endgame:    endgameAcc,
    sampleSize: withAcc.length,
  };
}


function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ─────────────────────────────────────────────────────────────────────────── //
//  EMPTY STATE STRING BUILDER
// ─────────────────────────────────────────────────────────────────────────── //
export function buildEmptyStateInfo(mode: AnalysisMode, count: number): {
  title: string; desc: string; icon: string;
} {
  const label = MODE_LABELS[mode] ?? mode;
  const icon  = MODE_ICONS[mode]  ?? '📭';
  const isAll = mode === 'all';
  const need  = Math.max(0, 5 - count);
  return {
    icon,
    title: isAll ? 'Not Enough Games' : `No ${label} Data`,
    desc: isAll
      ? 'Need at least 5 games to run analysis. Play more on Chess.com.'
      : count === 0
        ? `No ${label} games found in the last 3 months.`
        : `Only ${count} ${label} game${count === 1 ? '' : 's'} found. Play ${need} more to unlock.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────── //
//  CHESS.COM API TYPES (light — only what we use)
// ─────────────────────────────────────────────────────────────────────────── //
export interface ChessComPlayerSide {
  username: string;
  rating: number;
  result: string;
}

export interface ChessComGame {
  uuid: string;
  url: string;
  pgn?: string;
  time_class: string;
  end_time: number;
  white: ChessComPlayerSide;
  black: ChessComPlayerSide;
  accuracies?: { white: number; black: number };
}

export interface ChessComProfile {
  username: string;
  name?: string;
  avatar?: string;
  country?: string;
  followers: number;
  joined: number;
  last_online: number;
  status?: string;
  title?: string;
  league?: string;
}

export interface ChessComStats {
  chess_blitz?:  TimeClassStats;
  chess_rapid?:  TimeClassStats;
  chess_bullet?: TimeClassStats;
  chess_daily?:  TimeClassStats;
  tactics?: { highest: { rating: number } };
  puzzle_rush?: { best: { score: number } };
}

export interface TimeClassStats {
  last:    { rating: number; date: number };
  best?:   { rating: number; date: number; game: string };
  record:  { win: number; loss: number; draw: number };
}

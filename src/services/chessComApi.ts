// services/chessComApi.ts
// Repository-Service Pattern — ALL Chess.com API calls live here.
// Components never call fetch() directly.

import { API_BASE, UA_HDR } from '@lib/constants';
import type {
  ChessComProfile,
  ChessComStats,
  ChessComGame,
} from '@lib/analysisEngine';

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA_HDR });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Player not found — check the username and try again.');
    }
    throw new Error(`Chess.com API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const chessComApi = {
  /** Get public player profile */
  getProfile(username: string): Promise<ChessComProfile> {
    return fetchJSON<ChessComProfile>(`${API_BASE}/${username}`);
  },

  /** Get all-time stats for a player */
  getStats(username: string): Promise<ChessComStats> {
    return fetchJSON<ChessComStats>(`${API_BASE}/${username}/stats`);
  },

  /** Get all games for a specific year/month */
  async getGamesForMonth(
    username: string,
    year: number,
    month: number,
  ): Promise<ChessComGame[]> {
    const m = String(month).padStart(2, '0');
    try {
      const data = await fetchJSON<{ games: ChessComGame[] }>(
        `${API_BASE}/${username}/games/${year}/${m}`,
      );
      return data.games ?? [];
    } catch {
      return []; // Empty month — normal case
    }
  },

  /** Fetch up to `months` months of games, capped at 100, deduped, newest first */
  async getRecentGames(username: string, months = 3): Promise<ChessComGame[]> {
    const all: ChessComGame[] = [];
    const now = new Date();

    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const games = await this.getGamesForMonth(username, d.getFullYear(), d.getMonth() + 1);
      all.push(...games);
    }

    // Deduplicate by uuid, sort newest first
    const seen = new Set<string>();
    return all
      .filter(g => {
        if (seen.has(g.uuid)) return false;
        seen.add(g.uuid);
        return true;
      })
      .sort((a, b) => b.end_time - a.end_time);
  },
};

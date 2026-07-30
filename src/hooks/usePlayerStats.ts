// hooks/usePlayerStats.ts
// COMPOUND HOOK — wraps chessComApi + analysisEngine into a single stat-state machine.
// Container pages consume only this hook; they never call the API directly.

import { useState, useCallback, useRef, useEffect } from 'react';
import { chessComApi } from '@services/chessComApi';
import { parseGames, computeAllCategories, computeAccuracyByPhase } from '@lib/analysisEngine';
import { useBatchAccuracy } from '@hooks/useBatchAccuracy';
import type {
  ChessComProfile,
  ChessComStats,
  ParsedGame,
  AllCategoriesAnalysis,
  AccuracyPhaseData,
  ChessComGame,
} from '@lib/analysisEngine';
import type { AnalysisMode } from '@lib/constants';

export type FetchState = 'idle' | 'loading' | 'results' | 'error';

export interface UsePlayerStatsReturn {
  // state
  fetchState: FetchState;
  errorMsg: string;
  profile: ChessComProfile | null;
  statsData: ChessComStats | null;
  recentGames: ChessComGame[];
  parsedGames: ParsedGame[];
  analysis: AllCategoriesAnalysis | null;
  activeMode: AnalysisMode;
  accuracyData: AccuracyPhaseData | null;
  activeTimeClass: string;
  isAnalyzingAccuracy: boolean;  // true while batch Stockfish is running
  analyzeProgress: { done: number; total: number }; // progress counter

  // actions
  search: (username: string) => Promise<void>;
  setActiveMode: (mode: AnalysisMode) => void;
  setActiveTimeClass: (tc: string) => void;
}

function pickDefaultTimeClass(stats: ChessComStats): string {
  if (stats.chess_blitz?.last.rating)  return 'chess_blitz';
  if (stats.chess_rapid?.last.rating)  return 'chess_rapid';
  if (stats.chess_bullet?.last.rating) return 'chess_bullet';
  return 'chess_blitz';
}

function getBaseRating(stats: ChessComStats): number {
  return stats.chess_blitz?.last.rating
    ?? stats.chess_rapid?.last.rating
    ?? stats.chess_bullet?.last.rating
    ?? 1200;
}

export function usePlayerStats(): UsePlayerStatsReturn {
  const [fetchState, setFetchState]       = useState<FetchState>('idle');
  const [errorMsg, setErrorMsg]           = useState('');
  const [profile, setProfile]             = useState<ChessComProfile | null>(null);
  const [statsData, setStatsData]         = useState<ChessComStats | null>(null);
  const [recentGames, setRecentGames]     = useState<ChessComGame[]>([]);
  const [parsedGames, setParsedGames]     = useState<ParsedGame[]>([]);
  const [analysis, setAnalysis]           = useState<AllCategoriesAnalysis | null>(null);
  const [activeMode, setActiveModeState]  = useState<AnalysisMode>('all');
  const [accuracyData, setAccuracyData]   = useState<AccuracyPhaseData | null>(null);
  const [activeTimeClass, setActiveTimeClass] = useState('chess_blitz');
  const [isAnalyzingAccuracy, setIsAnalyzingAccuracy] = useState(false);
  const [analyzeProgress, setAnalyzeProgress]         = useState({ done: 0, total: 0 });
  const [baseRating, setBaseRating]       = useState(1200);

  // Ref always reflects the latest activeMode — prevents stale closure in handleAccuracyUpdate
  const activeModeRef = useRef<AnalysisMode>('all');
  useEffect(() => { activeModeRef.current = activeMode; }, [activeMode]);

  // Captures the initial queue size once per search — used to compute accurate done/total progress.
  // queueSize from useBatchAccuracy shrinks as games complete, so we can't use it as total directly.
  const initialQueueRef = useRef(0);

  // Incremental update when a game's accuracy is computed by Stockfish
  const handleAccuracyUpdate = useCallback((idx: number, acc: number) => {
    setParsedGames(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], computedAcc: acc };

      // Always filter by current mode before recomputing
      const currentMode = activeModeRef.current;
      const filtered = currentMode === 'all' ? next : next.filter(g => g.timeClass === currentMode);
      setAnalysis(computeAllCategories(filtered, baseRating));
      setAccuracyData(computeAccuracyByPhase(filtered, currentMode));
      return next;
    });
  }, [baseRating]); // activeModeRef is a stable ref — not needed in deps

  // Start batch accuracy on games that need it
  const needsAccuracy = fetchState === 'results' &&
    parsedGames.some(g => g.myAcc == null && g.computedAcc == null);

  const { queueSize } = useBatchAccuracy({
    games: parsedGames,
    onUpdate: handleAccuracyUpdate,
    enabled: needsAccuracy,
  });

  // Derive accurate progress from queueSize (remaining) vs initialQueueRef (total).
  // done = initialTotal - remaining so done and total always move in the same direction.
  useEffect(() => {
    if (queueSize > 0) {
      // Capture initial total once per search session
      if (initialQueueRef.current === 0) {
        initialQueueRef.current = queueSize;
      }
      const done = Math.max(0, initialQueueRef.current - queueSize);
      setAnalyzeProgress({ done, total: initialQueueRef.current });
    } else if (initialQueueRef.current > 0) {
      // queueSize hit 0 — all games done
      setAnalyzeProgress({ done: initialQueueRef.current, total: initialQueueRef.current });
      setIsAnalyzingAccuracy(false);
    }
  }, [queueSize]);

  const search = useCallback(async (username: string) => {
    if (!username.trim()) return;
    setFetchState('loading');
    setErrorMsg('');
    setIsAnalyzingAccuracy(false);
    initialQueueRef.current = 0; // reset so progress is fresh for this search

    try {
      const [profileData, statsResp] = await Promise.all([
        chessComApi.getProfile(username),
        chessComApi.getStats(username),
      ]);

      const games = await chessComApi.getRecentGames(username, 3);

      setProfile(profileData);
      setStatsData(statsResp);
      setRecentGames(games.slice(0, 15));
      setActiveTimeClass(pickDefaultTimeClass(statsResp));
      setFetchState('results');

      // Parse and run analysis asynchronously
      if (games.length >= 5) {
        const parsed = parseGames(games, username);

        // Cap to 100 per time class — matches useBatchAccuracy's MAX_TOTAL_GAMES.
        // getRecentGames returns games newest-first so slice(0, 100) = most recent 100.
        const MAX_PER_CLASS = 100;
        const countPerClass: Record<string, number> = {};
        const capped = parsed.filter(g => {
          const n = countPerClass[g.timeClass] ?? 0;
          if (n >= MAX_PER_CLASS) return false;
          countPerClass[g.timeClass] = n + 1;
          return true;
        });

        setParsedGames(capped);

        const base   = getBaseRating(statsResp);
        setBaseRating(base);
        const computed = computeAllCategories(capped, base);
        setAnalysis(computed);

        const accData = computeAccuracyByPhase(capped, 'all');
        setAccuracyData(accData);

        // If some games lack accuracy, batch analysis will kick in.
        const missingAcc = capped.filter(g => g.myAcc == null).length;
        if (missingAcc > 0) {
          setIsAnalyzingAccuracy(true);
          setAnalyzeProgress({ done: 0, total: 0 }); // overridden by queueSize effect
        }
      }


    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load player data.';
      setErrorMsg(msg);
      setFetchState('error');
    }
  }, []);

  const setActiveMode = useCallback((mode: AnalysisMode) => {
    setActiveModeState(mode);
    if (parsedGames.length === 0) return;
    const filtered = mode === 'all' ? parsedGames : parsedGames.filter(g => g.timeClass === mode);
    // Recompute with new filter — analysis hook is pure so this is cheap
    setAnalysis(computeAllCategories(filtered, baseRating));
    setAccuracyData(computeAccuracyByPhase(filtered, mode));
  }, [parsedGames, baseRating]);

  return {
    fetchState,
    errorMsg,
    profile,
    statsData,
    recentGames,
    parsedGames,
    analysis,
    activeMode,
    accuracyData,
    activeTimeClass,
    isAnalyzingAccuracy,
    analyzeProgress,
    search,
    setActiveMode,
    setActiveTimeClass,
  };
}

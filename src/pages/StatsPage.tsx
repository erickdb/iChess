// pages/StatsPage.tsx — Chess.com Player Stats & Analytics (Container-View)

import { useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { usePlayerStats } from '@hooks/usePlayerStats';
import { Tabs } from '@components/molecules/Tabs';
import { useState } from 'react';
import type { TimeClassStats } from '@lib/analysisEngine';
import { TC_CFG } from '@lib/constants';

export function StatsPage() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const stats          = usePlayerStats();
  const [inputVal, setInputVal] = useState(searchParams.get('u') ?? '');
  const [tab, setTab]           = useState('statsPanel');
  const didAutoSearch           = useRef(false);

  // Auto-search from URL param
  useEffect(() => {
    const u = searchParams.get('u');
    if (u && !didAutoSearch.current) {
      didAutoSearch.current = true;
      stats.search(u);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const u = inputVal.trim();
    if (!u) return;
    navigate(`/stats?u=${encodeURIComponent(u)}`, { replace: true });
    stats.search(u);
  }

  // ── Render ──────────────────────────────────────────────────────────── //
  return (
    <div className="w-full max-w-[1100px] mx-auto px-5 py-10 flex flex-col gap-8">

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-3 w-full max-w-[600px] mx-auto">
        <input
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          placeholder="Masukkan username Chess.com..."
          className="flex-1 bg-[#0d1120] border border-[#232c45] rounded-xl px-4 py-3 text-white text-[14px] outline-none placeholder:text-[#475569] focus:border-[#00adb5] focus:shadow-[0_0_0_3px_rgba(0,173,181,0.15)] transition-all"
        />
        <button
          type="submit"
          disabled={stats.fetchState === 'loading'}
          className="bg-gradient-to-br from-[#00adb5] to-[#007b82] border-0 rounded-xl px-6 py-3 text-white font-bold text-[14px] cursor-pointer transition-all hover:shadow-[0_4px_16px_rgba(0,173,181,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {stats.fetchState === 'loading' ? 'Loading…' : 'Cari →'}
        </button>
      </form>

      {/* Loading */}
      {stats.fetchState === 'loading' && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-[#232c45] border-t-[#00adb5] rounded-full animate-spin" />
          <p className="text-[#64748b] text-sm">Memuat data pemain...</p>
        </div>
      )}

      {/* Error */}
      {stats.fetchState === 'error' && (
        <div className="max-w-[500px] mx-auto glass-card p-8 text-center">
          <div className="text-4xl mb-3">😵</div>
          <p className="text-[#ef4444] font-bold">{stats.errorMsg}</p>
        </div>
      )}

      {/* Results */}
      {stats.fetchState === 'results' && stats.profile && (
        <>
          {/* Profile header */}
          <div className="glass-card p-6 flex flex-col sm:flex-row gap-5 items-center sm:items-start">
            {stats.profile.avatar && (
              <img src={stats.profile.avatar} alt="avatar" className="w-20 h-20 rounded-2xl object-cover border-2 border-[#00adb5]/30" />
            )}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2 mb-1">
                <h1 className="text-2xl font-black text-white">{stats.profile.name ?? stats.profile.username}</h1>
                {stats.profile.title && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-[rgba(0,173,181,0.2)] text-[#00adb5] rounded-md border border-[rgba(0,173,181,0.3)]">
                    {stats.profile.title}
                  </span>
                )}
              </div>
              <p className="text-[#64748b] text-sm">@{stats.profile.username}</p>
              {stats.profile.league && (
                <p className="text-[#f59e0b] text-xs mt-1">🏆 {stats.profile.league} League</p>
              )}
              <p className="text-[#64748b] text-xs mt-1">👥 {stats.profile.followers.toLocaleString()} followers</p>
            </div>
          </div>

          {/* Tab bar */}
          <Tabs active={tab} onChange={setTab} className="flex flex-col gap-4">
            <div className="flex gap-2 p-1 bg-white/[0.03] border border-white/[0.06] rounded-xl w-fit">
              <Tabs.Tab id="statsPanel">Game Statistics</Tabs.Tab>
              <Tabs.Tab id="analysisPanel">Game Analysis</Tabs.Tab>
            </div>

            <Tabs.Panel id="statsPanel">
              <StatsPanel stats={stats} myUsername={stats.profile?.username ?? ''} />
            </Tabs.Panel>

            <Tabs.Panel id="analysisPanel">
              <AnalysisPanel stats={stats} />
            </Tabs.Panel>
          </Tabs>
        </>
      )}
    </div>
  );
}

// ── Stats Panel (Presentational) ─────────────────────────────────────────── //
function StatsPanel({ stats, myUsername }: { stats: ReturnType<typeof usePlayerStats>; myUsername: string }) {
  const { statsData, activeTimeClass, setActiveTimeClass, parsedGames } = stats;
  if (!statsData) return null;

  const TIME_CLASSES = ['chess_blitz', 'chess_rapid', 'chess_bullet', 'chess_daily'] as const;
  const activeStats: TimeClassStats | undefined = statsData[activeTimeClass as keyof typeof statsData] as TimeClassStats | undefined;

  // Filter games by active time class
  const tcKey = activeTimeClass.replace('chess_', '');
  const historyGames = parsedGames
    .filter(g => activeTimeClass === 'all' || g.timeClass === tcKey)
    .slice(0, 20);

  return (
    <div className="flex flex-col gap-6">

      {/* Rating cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TIME_CLASSES.map(tc => {
          const s = statsData[tc as keyof typeof statsData] as TimeClassStats | undefined;
          if (!s) return null;
          const key = tc.replace('chess_', '') as keyof typeof TC_CFG;
          const cfg = TC_CFG[key] ?? TC_CFG['blitz'];
          const isActive = activeTimeClass === tc;
          return (
            <button
              key={tc}
              onClick={() => setActiveTimeClass(tc)}
              className={`relative glass-card p-4 text-center cursor-pointer transition-all duration-200 border overflow-hidden ${
                isActive
                  ? 'border-[#00adb5] shadow-[0_0_24px_rgba(0,173,181,0.35)] bg-[rgba(0,173,181,0.1)]'
                  : 'border-[#232c45] hover:border-[rgba(255,255,255,0.15)]'
              }`}
            >
              {/* Active indicator bar at top */}
              {isActive && (
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#00adb5] to-[#007b82] rounded-t" />
              )}
              <div className="text-xl mb-1">{cfg.icon}</div>
              <div className={`text-[22px] font-black ${isActive ? 'text-white' : 'text-[#cbd5e1]'}`}>{s.last.rating}</div>
              <div className={`text-[11px] font-semibold uppercase ${isActive ? 'text-[#00adb5]' : 'text-[#64748b]'}`}>{cfg.label}</div>
            </button>
          );
        })}
      </div>

      {/* Win rate donut (simple CSS) */}
      {activeStats && (() => {
        const { win, loss, draw } = activeStats.record;
        const total = win + loss + draw;
        const wr = total > 0 ? ((win / total) * 100).toFixed(1) : '0.0';
        return (
          <div className="glass-card p-6">
            <h3 className="text-sm font-bold text-white mb-4">Win Rate — {TC_CFG[activeTimeClass.replace('chess_','') as keyof typeof TC_CFG]?.label ?? activeTimeClass}</h3>
            <div className="flex flex-col sm:flex-row gap-6 items-center">
              {/* Simple pie visualization */}
              <div className="relative w-28 h-28 flex-shrink-0">
                <svg viewBox="0 0 36 36" className="w-28 h-28 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1a2033" strokeWidth="3"/>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#22c55e" strokeWidth="3"
                    strokeDasharray={`${(win/total)*100} 100`} strokeLinecap="round"/>
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#64748b" strokeWidth="3"
                    strokeDasharray={`${(draw/total)*100} 100`}
                    strokeDashoffset={`${-(win/total)*100}`}/>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-black text-white">{wr}%</span>
                  <span className="text-[10px] text-[#64748b]">Win</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 flex-1">
                {[
                  { label: 'Menang', count: win,  color: '#22c55e' },
                  { label: 'Seri',   count: draw, color: '#64748b' },
                  { label: 'Kalah',  count: loss, color: '#ef4444' },
                ].map(({ label, count, color }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-sm text-[#94a3b8] flex-1">{label}</span>
                    <span className="text-sm font-bold text-white">{count.toLocaleString()}</span>
                    <span className="text-xs text-[#64748b] w-12 text-right">
                      {total > 0 ? `${((count/total)*100).toFixed(1)}%` : '—'}
                    </span>
                  </div>
                ))}
                <div className="pt-1 border-t border-[#232c45] text-xs text-[#475569]">
                  🌐 All-Time · Total {total.toLocaleString()} games
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Game History */}
      {historyGames.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-sm font-bold text-white mb-4">
            🕓 Riwayat Game Terakhir
            <span className="ml-2 text-[#64748b] font-normal text-xs">({historyGames.length} game)</span>
          </h3>
          <div className="flex flex-col gap-0 overflow-hidden rounded-xl border border-[#232c45]">
            {/* Header */}
            <div className="grid grid-cols-[28px_1fr_80px_60px_60px_36px] gap-2 px-3 py-2 bg-[#0d1120] text-[10px] font-bold text-[#475569] uppercase tracking-wide">
              <div></div>
              <div>Lawan</div>
              <div>Opening</div>
              <div className="text-center">Langkah</div>
              <div className="text-center">Akurasi</div>
              <div></div>
            </div>

            {historyGames.map((g, idx) => {
              const isWin  = g.result === 'win';
              const isDraw = g.result === 'draw';
              const resultColor = isWin ? '#22c55e' : isDraw ? '#64748b' : '#ef4444';
              const resultLabel = isWin ? 'W' : isDraw ? 'D' : 'L';
              const resultBg    = isWin ? 'rgba(34,197,94,0.12)' : isDraw ? 'rgba(100,116,139,0.12)' : 'rgba(239,68,68,0.12)';

              return (
                <div
                  key={idx}
                  className="grid grid-cols-[28px_1fr_80px_60px_60px_36px] gap-2 px-3 py-2.5 items-center border-t border-[#232c45] hover:bg-white/[0.03] transition-colors"
                >
                  {/* Result badge */}
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-black flex-shrink-0"
                    style={{ background: resultBg, color: resultColor }}
                  >
                    {resultLabel}
                  </div>

                  {/* Opponent — piece color + username vs username */}
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1 min-w-0 flex-wrap">
                      {/* Me */}
                      <span className="text-[11px] font-bold truncate max-w-[65px] flex items-center gap-0.5" title={myUsername}>
                        <span className="text-[10px]">{g.isWhite ? '⬜' : '⬛'}</span>
                        <span className="text-[#e2e8f0]">{myUsername}</span>
                      </span>
                      <span className="text-[9px] text-[#475569] flex-shrink-0 font-semibold">vs</span>
                      {/* Opp */}
                      <span className="text-[11px] font-bold truncate max-w-[65px] flex items-center gap-0.5" title={g.oppUsername}>
                        <span className="text-[10px]">{g.isWhite ? '⬛' : '⬜'}</span>
                        <span className="text-[#94a3b8]">{g.oppUsername}</span>
                      </span>
                    </div>
                    <span className="text-[10px] text-[#475569] truncate">{g.myRating} · {g.oppRating} · {g.timeClass}</span>
                  </div>

                  {/* Opening */}
                  <div className="text-[10px] text-[#64748b] truncate leading-tight" title={g.opening}>
                    {g.opening || '—'}
                  </div>

                  {/* Move count */}
                  <div className="text-[12px] font-semibold text-[#94a3b8] text-center">
                    {g.moveCount}
                  </div>

                  {/* My accuracy */}
                  <div className="text-center">
                    {(() => {
                      const acc = g.myAcc ?? g.computedAcc ?? null;
                      const isComputed = g.myAcc == null && g.computedAcc != null;
                      if (acc == null) {
                        return <span className="text-[11px] text-[#475569]">—</span>;
                      }
                      return (
                        <div className="flex flex-col items-center">
                          <span
                            className="text-[12px] font-bold"
                            style={{ color: acc >= 85 ? '#22c55e' : acc >= 70 ? '#f59e0b' : '#ef4444' }}
                          >
                            {acc.toFixed(1)}%
                          </span>
                          {isComputed && (
                            <span className="text-[9px] text-[#00adb5]" title="Estimated by Stockfish">⚡</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Link */}
                  <div className="flex justify-center">
                    {g.url && (
                      <a
                        href={g.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-6 h-6 rounded-md bg-[#1a2033] border border-[#232c45] flex items-center justify-center text-[#64748b] hover:text-[#00adb5] hover:border-[#00adb5] transition-all text-[10px]"
                        title="Buka di Chess.com"
                      >
                        ↗
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


// ── Analysis Panel (Chess.com Insights Style) ────────────────────────────── //
function AnalysisPanel({ stats }: { stats: ReturnType<typeof usePlayerStats> }) {
  const { analysis, activeMode, setActiveMode, accuracyData, parsedGames, statsData, isAnalyzingAccuracy, analyzeProgress } = stats;
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['opening']));
  const toggleSection = (key: string) =>
    setOpenSections(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  const MODES = ['all', 'bullet', 'blitz', 'rapid'] as const;
  const MODE_LABELS: Record<string, string> = { all: '🌐 All', bullet: '🔫 Bullet', blitz: '⚡ Blitz', rapid: '🕐 Rapid' };

  if (parsedGames.length < 5) {
    return (
      <div className="glass-card p-12 text-center">
        <div className="text-4xl mb-3">📭</div>
        <p className="text-white font-bold">Not Enough Games</p>
        <p className="text-[#64748b] text-sm mt-1">Need at least 5 recent games to run analysis.</p>
      </div>
    );
  }

  // Filter games by selected mode — same filter the hook uses
  const filteredGames = activeMode === 'all'
    ? parsedGames
    : parsedGames.filter(g => g.timeClass === activeMode);

  // If selected mode has no games, show empty state early
  const MODE_LABELS_FULL: Record<string, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid' };
  if (activeMode !== 'all' && filteredGames.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {/* Mode filter still rendered so user can switch */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'bullet', 'blitz', 'rapid'] as const).map(m => (
            <button
              key={m}
              onClick={() => setActiveMode(m)}
              className={`px-4 py-2 rounded-lg text-[13px] font-semibold border cursor-pointer transition-all
                ${activeMode === m
                  ? 'bg-[rgba(0,173,181,0.2)] border-[rgba(0,173,181,0.4)] text-white'
                  : 'bg-transparent border-[#232c45] text-[#94a3b8] hover:text-white'
                }`}
            >
              {{ all: '🌐 All', bullet: '🔫 Bullet', blitz: '⚡ Blitz', rapid: '🕐 Rapid' }[m]}
            </button>
          ))}
        </div>
        <div className="glass-card p-12 text-center">
          <div className="text-4xl mb-3">🎯</div>
          <p className="text-white font-bold">No {MODE_LABELS_FULL[activeMode]} Games Found</p>
          <p className="text-[#64748b] text-sm mt-1">Play some {MODE_LABELS_FULL[activeMode]} games on Chess.com to unlock analysis for this mode.</p>
        </div>
      </div>
    );
  }

  // Get user's base rating for bar chart scale
  const baseRating = statsData?.chess_blitz?.last.rating
    ?? statsData?.chess_rapid?.last.rating
    ?? statsData?.chess_bullet?.last.rating
    ?? 800;
  const maxRating = Math.max(baseRating + 400, 1200);

  // Win rates for opening with white/black
  const whiteGames = filteredGames.filter(g => g.isWhite);
  const blackGames = filteredGames.filter(g => !g.isWhite);
  const whiteWr = whiteGames.length > 0 ? (whiteGames.filter(g => g.result === 'win').length / whiteGames.length) * 100 : 0;
  const blackWr = blackGames.length > 0 ? (blackGames.filter(g => g.result === 'win').length / blackGames.length) * 100 : 0;

  // Advantage cap stats
  const advGames = filteredGames.filter(g => {
    const myR = g.myRating; const oppR = g.oppRating;
    return (myR - oppR) >= 50; // significantly better rated
  });
  const advWon = advGames.filter(g => g.result === 'win').length;
  const advPct = advGames.length > 0 ? Math.round((advWon / advGames.length) * 100) : 0;

  const CATEGORIES = [
    {
      key: 'opening',
      label: 'Opening',
      icon: '📖',
      color: '#22c55e',
      insight: `Win rate: ${whiteWr.toFixed(0)}% as White, ${blackWr.toFixed(0)}% as Black across ${filteredGames.length} games.`,
      tips: (score: number) => score >= 75 ? [
        'Expand your repertoire with a second system for both colors.',
        'Study opponent openings — preparation wins games at your level.',
        'Practice transpositions to stay flexible out of book.',
      ] : score >= 50 ? [
        'Pick one solid opening for White and one for Black — master them first.',
        'Learn the key ideas behind each opening, not just the moves.',
        'Review your opening losses to find where you go wrong.',
      ] : [
        'Start with beginner-friendly openings: Italian, London, or Caro-Kann.',
        'Focus on principles: control center, develop pieces, king safety.',
        'Use Chess.com Opening Explorer to study your most-played openings.',
      ],
    },
    {
      key: 'tactics',
      label: 'Tactics',
      icon: '⚔️',
      color: '#38bdf8',
      insight: accuracyData ? `Average accuracy ${accuracyData.overall?.toFixed(1) ?? '—'}%. Middlegame: ${accuracyData.middlegame?.toFixed(1) ?? '—'}%.` : 'Not enough data.',
      tips: (score: number) => score >= 75 ? [
        'Solve 15+ puzzles daily to maintain tactical sharpness.',
        'Study complex combinations: pins, skewers, discovered attacks.',
        'Analyze your games to find missed tactical opportunities.',
      ] : score >= 50 ? [
        'Do puzzle rushes to improve pattern recognition speed.',
        'Focus on one tactic theme per week (forks, pins, back rank).',
        'Review every game for missed wins — train your tactical eye.',
      ] : [
        'Solve at least 10 puzzles per day — consistency beats quantity.',
        'Learn the basic tactics: fork, pin, skewer, discovered check.',
        'Use Chess.com Puzzle Trainer — start at your rating level.',
      ],
    },
    {
      key: 'resourcefulness',
      label: 'Resourcefulness',
      icon: '💪',
      color: '#818cf8',
      insight: `Evaluated from ${filteredGames.length} recent games — how often you recover from losing positions.`,
      tips: (score: number) => score >= 75 ? [
        'Study defensive techniques: prophylaxis and counterplay.',
        'Practice unbalanced positions where you must find practical chances.',
        'Train endgames — knowing when a draw is achievable is key.',
      ] : score >= 50 ? [
        'Never resign too early — look for counterplay every move.',
        'Study famous comeback games by Kasparov and Tal.',
        'Practice fortress positions and perpetual check escapes.',
      ] : [
        'Stop resigning in "lost" positions — practice fighting spirit.',
        'Always look for your opponent\'s threats AND your own chances.',
        'Study the "Hope Chess" concept — assume your opponent can make mistakes too.',
      ],
    },
    {
      key: 'advCap',
      label: 'Advantage Capitalization',
      icon: '🎯',
      color: '#4ade80',
      insight: advGames.length > 0
        ? `In ${advGames.length} games you had a rating advantage, you won ${advWon} of them (${advPct}%). Your goal is to capitalize every game with such an advantage.`
        : 'Not enough advantage games found yet.',
      tips: (score: number) => score >= 75 ? [
        'Convert better by trading into won endgames when ahead.',
        'Study "how to win a won game" — patience and technique.',
        'Avoid unnecessary complications when you have a clear advantage.',
      ] : score >= 50 ? [
        'When winning, simplify the position — trade pieces not pawns.',
        'Learn basic endgame technique: King + Rook vs King, etc.',
        'Don\'t let opponents create counterplay — cut off their pieces.',
      ] : [
        'Recognize winning positions — don\'t stop pushing when you\'re ahead.',
        'Study how grandmasters convert material advantages into wins.',
        'Practice king and pawn endgames — precision wins games.',
      ],
    },
    {
      key: 'timeMgmt',
      label: 'Time Management',
      icon: '⏱️',
      color: '#fb923c',
      insight: `Lost on time: ${filteredGames.filter(g => g.lostOnTime).length} of ${filteredGames.length} games.`,
      tips: (score: number) => score >= 75 ? [
        'Practice longer time controls to deepen your calculation.',
        'Challenge yourself with rapid/classical to remove time pressure habits.',
        'Keep your clock advantage by playing fast in known positions.',
      ] : score >= 50 ? [
        'Use most of your time on critical decisions, spend less on simple moves.',
        'Pre-move in clearly forced sequences to save seconds.',
        'Practice bullet and blitz to build instinctive pattern recognition.',
      ] : [
        'Stop spending too long on low-stakes moves early in the game.',
        'Learn to trust your instincts — over-thinking burns your clock.',
        'Play daily time-control games to build comfort with chess rhythm.',
      ],
    },
    {
      key: 'endgame',
      label: 'Endgame',
      icon: '♜',
      color: '#a78bfa',
      insight: (() => {
        const es = analysis.endgameStats;
        if (es.gameCount === 0) return 'None of your recent games reached move 36 — most end in the opening or middlegame.';
        const winPct   = (es.winRate * 100).toFixed(0);
        const ovPct    = (es.overallWinRate * 100).toFixed(0);
        const reachPct = (es.reachRate * 100).toFixed(0);
        return `${es.gameCount} of your games reached move 36+ (${reachPct}%). ` +
          `In those: ${es.wins}W · ${es.draws}D · ${es.losses}L (${winPct}% win rate vs ${ovPct}% overall).` +
          (es.lostOnTime > 0 ? ` You flagged in ${es.lostOnTime} long game${es.lostOnTime > 1 ? 's' : ''}.` : '');
      })(),
      tips: (score: number) => score >= 75 ? [
        'Study theoretical endgames: Rook endings, Bishop vs Knight.',
        'Practice pawn endgame precision — zugzwang and opposition.',
        'Learn to calculate endgame positions 10+ moves deep.',
      ] : score >= 50 ? [
        'Master King + Pawn vs King — the foundation of all endgames.',
        'Study Rook endgames — they\'re the most common at all levels.',
        'Learn the rule of the square for pawn races.',
      ] : [
        'Study Silman\'s Complete Endgame Course — chapter by chapter.',
        'Practice basic checkmates: K+Q, K+R vs lone King.',
        'Learn which endgames are drawn and which are wins — save half points.',
      ],
    },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      {/* Mode filter */}
      <div className="flex gap-2 flex-wrap">
        {MODES.map(m => (
          <button
            key={m}
            onClick={() => setActiveMode(m)}
            className={`px-4 py-2 rounded-lg text-[13px] font-semibold border cursor-pointer transition-all
              ${activeMode === m
                ? 'bg-[rgba(0,173,181,0.2)] border-[rgba(0,173,181,0.4)] text-white'
                : 'bg-transparent border-[#232c45] text-[#94a3b8] hover:text-white'
              }`}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Stockfish accuracy banner — shown while background analysis runs */}
      {isAnalyzingAccuracy && (() => {
        const pct = analyzeProgress.total > 0
          ? Math.round((analyzeProgress.done / analyzeProgress.total) * 100)
          : 0;
        return (
          <div className="flex flex-col gap-2 px-4 py-3 bg-[rgba(0,173,181,0.07)] border border-[rgba(0,173,181,0.22)] rounded-xl">
            {/* Top row: icon + text + counter */}
            <div className="flex items-center gap-3">
              <span className="text-[16px] leading-none flex-shrink-0" style={{ display: 'inline-block', animation: 'spin 1.5s linear infinite' }}>⚙️</span>
              <div className="flex flex-col flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-white">⚡ Stockfish is analyzing your games</span>
                  <span className="text-[12px] font-bold text-[#00adb5]">{analyzeProgress.done}/{analyzeProgress.total} games ({pct}%)</span>
                </div>
                <span className="text-[11px] text-[#64748b] mt-0.5">
                  Please wait for the analysis to finish for best results — accuracy scores update in real-time.
                </span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.07)] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#00adb5] to-[#22c55e] transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })()}

      {/* ── Performance Rating by Category chart ──────────────────────── */}
      {analysis && (
        <div className="glass-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h3 className="text-sm font-bold text-white">Performance Rating by Category</h3>
            {accuracyData?.overall != null && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[rgba(0,173,181,0.08)] border border-[rgba(0,173,181,0.22)] rounded-lg">
                <span className="text-[11px] text-[#64748b]">Avg Accuracy</span>
                <span className="text-[15px] font-black" style={{ color: '#00adb5' }}>{accuracyData.overall.toFixed(1)}%</span>
                <span className="text-[10px] text-[#475569]">· {accuracyData.sampleSize} games</span>
              </div>
            )}
          </div>

          {/* Scale header */}
          <div className="flex items-center mb-3 ml-[130px]">
            <span className="text-[11px] text-[#64748b] font-semibold">{baseRating}</span>
            <div className="flex-1" />
            <span className="text-[11px] text-[#64748b] font-semibold">{maxRating}</span>
          </div>

          <div className="flex flex-col gap-3">
            {CATEGORIES.map(({ key, label, icon, color }) => {
              const cat = analysis[key as keyof typeof analysis] as { score: number; label: string } | undefined;
              if (!cat || typeof cat !== 'object' || !('score' in cat)) return null;
              const score = cat.score; // 0-100
              const pct = Math.max(4, score); // min 4% to show bar

              return (
                <div key={key} className="flex items-center gap-3">
                  {/* Label */}
                  <div className="w-[120px] flex-shrink-0 text-right">
                    <span
                      className="text-[12px] font-semibold cursor-pointer hover:underline"
                      style={{ color }}
                      onClick={() => toggleSection(key)}
                    >
                      {icon} {label}
                    </span>
                  </div>
                  {/* Bar */}
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-[11px] font-bold text-[#94a3b8] w-9 text-right flex-shrink-0">
                      {score}%
                    </span>
                    <div className="flex-1 h-3 bg-[#1a2033] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}



      {/* ── Collapsible Category Sections ──────────────────────────────── */}
      {analysis && (
        <div className="flex flex-col gap-3">
          {CATEGORIES.map(({ key, label, icon, color, insight }) => {
            const cat = analysis[key as keyof typeof analysis] as { score: number; label: string } | undefined;
            if (!cat || typeof cat !== 'object' || !('score' in cat)) return null;
            const isOpen = openSections.has(key);
            const score = cat.score;
            const scoreLabel = score >= 80 ? '😄' : score >= 60 ? '😐' : '😟';

            return (
              <div key={key} className="glass-card overflow-hidden border border-[#232c45]">
                {/* Section header */}
                <button
                  onClick={() => toggleSection(key)}
                  className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base">{icon}</span>
                    <span className="text-[14px] font-bold text-white">{label}</span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: `${color}22`, color }}
                    >
                      {score}/100 · {cat.label}
                    </span>
                  </div>
                  <span className={`text-[#64748b] text-sm transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>›</span>
                </button>

                {/* Expanded content */}
                {isOpen && (
                  <div className="border-t border-[#232c45] px-5 pb-5 pt-4 flex flex-col gap-4">
                    {/* Your performance */}
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">{scoreLabel}</span>
                      <div>
                        <div className="text-[13px] font-bold text-white mb-1">Your performance</div>
                        <div className="text-[12px] text-[#94a3b8] leading-relaxed">{insight}</div>
                      </div>
                    </div>

                    {/* Opening specific: white/black + top openings */}
                    {key === 'opening' && analysis.openingStats.length > 0 && (
                      <div className="flex flex-col gap-2">
                        {/* White/black breakdown */}
                        <div className="grid grid-cols-2 gap-3 mb-2">
                          {[
                            { side: 'White', wr: whiteWr, games: whiteGames.length, icon: '⬜' },
                            { side: 'Black', wr: blackWr, games: blackGames.length, icon: '⬛' },
                          ].map(({ side, wr, games, icon }) => (
                            <div key={side} className="bg-[#0d1120] border border-[#232c45] rounded-xl p-3">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-sm">{icon}</span>
                                <span className="text-[12px] font-bold text-white">Opening with {side}</span>
                              </div>
                              <div className="text-[11px] text-[#64748b]">
                                {wr.toFixed(0)}% win rate · {games} games
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Top openings */}
                        <div className="text-[11px] font-bold text-[#475569] uppercase mb-1">Top Openings</div>
                        {analysis.openingStats.slice(0, 6).map(op => {
                          const wr = op.winRate * 100;
                          const opColor = wr >= 55 ? '#22c55e' : wr >= 45 ? '#f59e0b' : '#ef4444';
                          const opEmoji = wr >= 55 ? '😄' : wr >= 45 ? '😐' : '😟';
                          return (
                            <div key={op.name} className="flex items-center gap-3 py-2.5 border-b border-[#1a2033] last:border-0">
                              <span className="text-base flex-shrink-0">{opEmoji}</span>
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-semibold text-white truncate">{op.name}</div>
                                <div className="text-[10px] text-[#64748b]">
                                  {op.games}G · {op.wins}W · {op.draws}D · {op.losses}L
                                </div>
                              </div>
                              <span className="text-[13px] font-bold flex-shrink-0" style={{ color: opColor }}>
                                {wr.toFixed(0)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Advantage cap specific */}
                    {key === 'advCap' && advGames.length > 0 && (
                      <div className="bg-[#0d1120] border border-[#232c45] rounded-xl p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] text-[#94a3b8]">Games with advantage</span>
                          <span className="text-[13px] font-bold text-white">{advGames.length}</span>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[12px] text-[#94a3b8]">Converted to wins</span>
                          <span className="text-[13px] font-bold text-[#22c55e]">{advWon} ({advPct}%)</span>
                        </div>
                        <div className="h-2 bg-[#1a2033] rounded-full overflow-hidden mt-3">
                          <div
                            className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-[#22c55e] to-[#16a34a]"
                            style={{ width: `${advPct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* How to Improve — personalized per category */}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-[11px] font-bold text-[#475569] uppercase">
                        <span>💡</span> How to Improve
                      </div>
                      <div className="flex flex-col gap-2">
                        {(() => {
                          // ── Opening: per-opening personalized tips ──────── //
                          if (key === 'opening') {
                            const tips: { icon: string; text: string; color: string }[] = [];

                            // White/Black color tips
                            if (whiteWr < 45) tips.push({ icon: '⬜', color: '#ef4444', text: `Your White openings need work (${whiteWr.toFixed(0)}% win rate). Focus on learning a solid 1.e4 or 1.d4 system.` });
                            else if (whiteWr >= 60) tips.push({ icon: '⬜', color: '#22c55e', text: `Great with White pieces (${whiteWr.toFixed(0)}% win rate)! Keep your repertoire sharp.` });

                            if (blackWr < 45) tips.push({ icon: '⬛', color: '#ef4444', text: `Your Black openings are weak (${blackWr.toFixed(0)}% win rate). Pick one solid defense and study it deeply.` });
                            else if (blackWr >= 60) tips.push({ icon: '⬛', color: '#22c55e', text: `Solid with Black (${blackWr.toFixed(0)}% win rate)! Consider expanding to a second defense.` });

                            // Per-opening tips
                            analysis.openingStats.forEach(op => {
                              const wr = op.winRate * 100;
                              if (wr < 35 && op.games >= 2) {
                                tips.push({ icon: '😟', color: '#ef4444', text: `${op.name} is hurting you (${wr.toFixed(0)}% in ${op.games} games). Study the key ideas or consider switching to an alternative.` });
                              } else if (wr >= 65 && op.games >= 2) {
                                tips.push({ icon: '😄', color: '#22c55e', text: `${op.name} is your strength (${wr.toFixed(0)}% in ${op.games} games). Keep playing it and learn deeper lines.` });
                              } else if (wr >= 40 && wr < 55 && op.games >= 3) {
                                tips.push({ icon: '😐', color: '#f59e0b', text: `${op.name} is average (${wr.toFixed(0)}% in ${op.games} games). Study the typical plans and pawn structures.` });
                              }
                            });

                            if (tips.length === 0) tips.push({ icon: '📖', color: '#64748b', text: 'Play more games to get personalized opening insights.' });
                            return tips;
                          }

                          // ── Tactics: accuracy-based tips ─────────────────── //
                          if (key === 'tactics') {
                            const tips: { icon: string; text: string; color: string }[] = [];
                            const acc = accuracyData?.overall;
                            const mid = accuracyData?.middlegame;
                            if (acc != null && acc < 60) tips.push({ icon: '⚠️', color: '#ef4444', text: `Your overall accuracy is ${acc.toFixed(1)}% — solve 10+ puzzles daily to improve pattern recognition.` });
                            else if (acc != null && acc >= 80) tips.push({ icon: '✅', color: '#22c55e', text: `Strong accuracy at ${acc.toFixed(1)}%! Challenge yourself with harder puzzles (600+ above your rating).` });
                            if (mid != null && mid < 60) tips.push({ icon: '⚔️', color: '#ef4444', text: `Middlegame accuracy is ${mid.toFixed(1)}% — focus on tactical themes: pins, forks, discovered attacks.` });
                            else if (mid != null && mid >= 75) tips.push({ icon: '⚔️', color: '#22c55e', text: `Middlegame accuracy ${mid.toFixed(1)}% is great! Study complex multi-move combinations next.` });
                            if (tips.length === 0) tips.push({ icon: '⚔️', color: '#64748b', text: 'Play games with Chess.com accuracy enabled to get more detailed tactical insights.' });
                            return tips;
                          }

                          // ── Resourcefulness ───────────────────────────────── //
                          if (key === 'resourcefulness') {
                            const tips: { icon: string; text: string; color: string }[] = [];
                            const lossCount = filteredGames.filter(g => g.result === 'loss').length;
                            const drawCount = filteredGames.filter(g => g.result === 'draw').length;
                            if (score < 40) tips.push({ icon: '😟', color: '#ef4444', text: `You lose ${lossCount} games without converting chances. Practice not resigning — look for counterplay every move.` });
                            if (drawCount > 0 && score < 60) tips.push({ icon: '🤝', color: '#f59e0b', text: `${drawCount} draws in your recent games — sometimes saving half a point from a lost position is the right call.` });
                            if (score >= 70) tips.push({ icon: '💪', color: '#22c55e', text: `You show good fighting spirit! Study Tal and Kasparov comeback games to level up further.` });
                            if (tips.length === 0) tips.push({ icon: '💪', color: '#64748b', text: 'Keep fighting in every position — resourcefulness improves with experience.' });
                            return tips;
                          }

                          // ── Advantage Capitalization ──────────────────────── //
                          if (key === 'advCap') {
                            const tips: { icon: string; text: string; color: string }[] = [];
                            if (advGames.length === 0) {
                              tips.push({ icon: '🎯', color: '#64748b', text: 'Not enough data yet — play more games to measure your advantage conversion.' });
                            } else {
                              if (advPct < 50) tips.push({ icon: '😟', color: '#ef4444', text: `You\'re only converting ${advPct}% of your advantages. Practice endgame technique — simplify when ahead.` });
                              else if (advPct >= 75) tips.push({ icon: '😄', color: '#22c55e', text: `Excellent conversion rate (${advPct}%)! You know how to close out games.` });
                              if (advPct < 70) tips.push({ icon: '♟️', color: '#f59e0b', text: 'When winning, trade pieces (not pawns) to simplify into a technical endgame win.' });
                              tips.push({ icon: '♟️', color: '#64748b', text: 'Avoid unnecessary complications when you have a clear advantage — don\'t let opponents back in.' });
                            }
                            return tips;
                          }

                          // ── Time Management ───────────────────────────────── //
                          if (key === 'timeMgmt') {
                            const tips: { icon: string; text: string; color: string }[] = [];
                            const lostOnTime = filteredGames.filter(g => g.lostOnTime).length;
                            if (lostOnTime > 0) tips.push({ icon: '⏰', color: '#ef4444', text: `You lost ${lostOnTime} game${lostOnTime > 1 ? 's' : ''} on time. Don\'t spend too long on low-stakes moves — save time for critical decisions.` });
                            else tips.push({ icon: '✅', color: '#22c55e', text: 'No time losses detected — great clock management!' });
                            if (score < 60) tips.push({ icon: '⚡', color: '#f59e0b', text: 'Play faster in positions you know well — save your time for complex middlegame decisions.' });
                            if (score >= 80) tips.push({ icon: '⏱️', color: '#22c55e', text: 'Your time management is solid! Try longer time controls to deepen your calculation.' });
                            return tips;
                          }

                          // ── Endgame ───────────────────────────────────────── //
                          if (key === 'endgame') {
                            const tips: { icon: string; text: string; color: string }[] = [];
                            const es = analysis.endgameStats;

                            if (es.gameCount === 0) {
                              tips.push({ icon: '♜', color: '#64748b', text: 'Play more long games to get endgame insights. Try slower time controls.' });
                              return tips;
                            }

                            // Endgame vs overall win rate comparison
                            if (es.winRate < es.overallWinRate - 0.1) {
                              tips.push({ icon: '😟', color: '#ef4444', text: `Your endgame win rate (${(es.winRate*100).toFixed(0)}%) is lower than your overall (${(es.overallWinRate*100).toFixed(0)}%) — long games are your weak spot. Focus on K+P vs K and Rook endgames.` });
                            } else if (es.winRate > es.overallWinRate + 0.1) {
                              tips.push({ icon: '💪', color: '#22c55e', text: `Endgames are your strength! You win ${(es.winRate*100).toFixed(0)}% of long games vs ${(es.overallWinRate*100).toFixed(0)}% overall. Keep sharpening technique.` });
                            } else {
                              tips.push({ icon: '😐', color: '#f59e0b', text: `Your endgame performance (${(es.winRate*100).toFixed(0)}% win rate) is consistent with your overall play. Room to use endgames as an edge.` });
                            }

                            // Flagging in long games
                            if (es.lostOnTime > 1) {
                              tips.push({ icon: '⏰', color: '#ef4444', text: `You flagged in ${es.lostOnTime} long games — manage your clock better in the middlegame to arrive at endgames with enough time.` });
                            }

                            // Advantage conversion
                            if (es.advantageConversion < 0.55 && es.gameCount >= 5) {
                              tips.push({ icon: '🎯', color: '#f59e0b', text: `You only convert ${(es.advantageConversion*100).toFixed(0)}% of endgames where you had equal or better rating. Practice trading into clean winning endgames — don't complicate it.` });
                            } else if (es.advantageConversion >= 0.75 && es.gameCount >= 5) {
                              tips.push({ icon: '✅', color: '#22c55e', text: `Great conversion rate (${(es.advantageConversion*100).toFixed(0)}%) when you reach endgames with an advantage — you know how to close out games.` });
                            }

                            // Reach rate context
                            if (es.reachRate < 0.2) {
                              tips.push({ icon: '📊', color: '#64748b', text: `Only ${(es.reachRate*100).toFixed(0)}% of your games reach move 36+. Most games are decided in the opening/middlegame — focus there first.` });
                            }

                            // Draws insight
                            if (es.draws > 2 && es.draws / es.gameCount > 0.2) {
                              tips.push({ icon: '🤝', color: '#94a3b8', text: `${es.draws} of your long games are draws (${(es.draws/es.gameCount*100).toFixed(0)}%). Study which endgame positions are drawable and which should be won — claim every half-point wisely.` });
                            }

                            if (tips.length === 0) tips.push({ icon: '♜', color: '#64748b', text: 'Keep playing long games to build endgame experience.' });
                            return tips;
                          }

                          return [{ icon: '💡', color: '#64748b', text: 'Keep playing to get personalized improvement tips.' }];
                        })().map((tip, i) => (
                          <div key={i} className="flex items-start gap-2.5 bg-[#0d1120] border border-[#232c45] rounded-lg px-3 py-2.5">
                            <span className="text-[14px] flex-shrink-0 mt-0.5">{tip.icon}</span>
                            <span className="text-[12px] leading-relaxed" style={{ color: tip.color === '#22c55e' ? '#86efac' : tip.color === '#ef4444' ? '#fca5a5' : tip.color === '#f59e0b' ? '#fcd34d' : '#94a3b8' }}>{tip.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

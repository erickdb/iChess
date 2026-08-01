// extension/content.js — v1.6: Full Bug-Fix Pass

(function () {
  'use strict';

  console.log('[iChess Engine] Content Script v1.6 loaded on Chess.com');

  const ChessCtor = window.Chess || (typeof Chess !== 'undefined' ? Chess : null);

  let showOverlay     = true;
  let autoPlayEnabled = false;
  let brilliantHunter = false;
  let targetDepth     = 12;
  let mistakeInterval = 0;
  let mistakeSeverity = 'mistake';

  let stockfishWorker  = null;
  let lastEvaluatedFen = '';
  let isEvaluating     = false;
  let moveCounter      = 0;
  let mpvList          = [];
  let isExecutingMove  = false;
  let scanIntervalId   = null;
  let lastGameFenRoot  = '';    // BUG#2: detect game reset → reset moveCounter
  let hudNeedsUpdate   = true; // BUG#1: only rebuild HUD when settings actually change

  const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  // ── Context Guard ─────────────────────────────────────────────────────────
  function isContextValid() {
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function cleanupOnInvalidatedContext() {
    if (scanIntervalId) {
      clearInterval(scanIntervalId);
      scanIntervalId = null;
    }
    if (stockfishWorker) {
      try { stockfishWorker.terminate(); } catch { /* ignore */ }
      stockfishWorker = null;
    }
    const hud = document.getElementById('ichess-hud-status');
    if (hud) hud.remove();
    clearOverlay();
  }

  // ── Settings sync ─────────────────────────────────────────────────────────
  if (isContextValid()) {
    try {
      chrome.storage.local.get({
        showOverlay: true,
        autoPlay: false,
        brilliantHunter: false,
        depth: 12,
        mistakeInterval: 0,
        mistakeSeverity: 'mistake'
      }, (res) => {
        if (!isContextValid()) return;
        showOverlay     = res.showOverlay;
        autoPlayEnabled = res.autoPlay;
        brilliantHunter = res.brilliantHunter;
        targetDepth     = res.depth;
        mistakeInterval = res.mistakeInterval;
        mistakeSeverity = res.mistakeSeverity;
        hudNeedsUpdate  = true;
        updateHudStatus();
      });

      chrome.runtime.onMessage.addListener((msg) => {
        if (!isContextValid()) return;
        if (msg.type === 'ICHESS_SETTINGS_UPDATE' && msg.config) {
          showOverlay     = msg.config.showOverlay;
          autoPlayEnabled = msg.config.autoPlay;
          brilliantHunter = msg.config.brilliantHunter;
          targetDepth     = msg.config.depth;
          mistakeInterval = msg.config.mistakeInterval;
          mistakeSeverity = msg.config.mistakeSeverity;

          if (stockfishWorker) {
            stockfishWorker.postMessage(
              `setoption name MultiPV value ${brilliantHunter || mistakeInterval > 0 ? 5 : 2}`
            );
          }

          hudNeedsUpdate = true;
          updateHudStatus();
          if (!showOverlay) clearOverlay();

          // Depth changed — force re-evaluate current position
          lastEvaluatedFen = '';
        }
      });
    } catch {
      cleanupOnInvalidatedContext();
    }
  }

  // ── Stockfish Worker ──────────────────────────────────────────────────────
  function initWorker() {
    if (stockfishWorker) return;
    if (!isContextValid()) {
      cleanupOnInvalidatedContext();
      return;
    }

    try {
      const workerUrl = chrome.runtime.getURL('stockfish.js');
      stockfishWorker = new Worker(workerUrl);

      stockfishWorker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : e.data.toString();

        if (line.startsWith('info') && line.includes(' score ')) {
          parseMpvLine(line);
        } else if (line.startsWith('bestmove')) {
          isEvaluating = false;
          const parts = line.split(' ');
          const bestMove = parts[1];
          if (bestMove && bestMove !== '(none)') {
            processMoveSelection(bestMove);
          }
        }
      };

      stockfishWorker.onerror = (err) => {
        console.error('[iChess Engine] Worker error:', err);
        isEvaluating = false; // BUG#7: unstick on worker error
      };

      stockfishWorker.postMessage('uci');
      stockfishWorker.postMessage('setoption name Hash value 32');
      stockfishWorker.postMessage(
        `setoption name MultiPV value ${brilliantHunter || mistakeInterval > 0 ? 5 : 2}`
      );
      stockfishWorker.postMessage('isready');
      console.log('[iChess Engine] Stockfish Worker v1.6 Ready');
    } catch (err) {
      isEvaluating = false; // BUG#7: unstick on init fail
      if (err.message && err.message.includes('invalidated')) {
        cleanupOnInvalidatedContext();
        return;
      }
      console.error('[iChess Engine] Worker init failed:', err);
    }
  }

  // ── MultiPV Parser ────────────────────────────────────────────────────────
  function parseMpvLine(line) {
    const cpMatch   = line.match(/score cp (-?\d+)/);
    const mateMatch = line.match(/score mate (-?\d+)/);
    const pvMatch   = line.match(/pv\s((?:[a-h][1-8][a-h][1-8][qrbn]?\s*)+)/);
    const mpvMatch  = line.match(/multipv\s(\d+)/);

    if (!pvMatch || !mpvMatch) return;
    const rank    = parseInt(mpvMatch[1], 10);
    const pvMoves = pvMatch[1].trim().split(/\s+/);
    const cp = cpMatch
      ? parseInt(cpMatch[1], 10)
      : mateMatch
        ? (parseInt(mateMatch[1], 10) > 0 ? 10000 : -10000)
        : 0;

    mpvList[rank - 1] = { move: pvMoves[0], cp, pvArray: pvMoves };
  }

  // ── HUD — only rebuild when state changes (BUG#1 fix) ────────────────────
  function updateHudStatus() {
    if (!hudNeedsUpdate) return;
    hudNeedsUpdate = false;

    let hud = document.getElementById('ichess-hud-status');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'ichess-hud-status';
      document.body.appendChild(hud);
    }

    hud.className = brilliantHunter ? 'hud-brilliant' : '';

    let statusText = `Depth ${targetDepth}`;
    if (brilliantHunter) statusText += ' | 🔥 Brilliant Hunter';
    if (mistakeInterval > 0) statusText += ` | ⚠️ Mistake: 1/${mistakeInterval}`;
    if (autoPlayEnabled) statusText += ' | ⚡ Auto-Play';

    hud.innerHTML = `<div class="dot"></div><div>iChess: ${statusText}</div>`;
  }

  // ── FEN Extractor ─────────────────────────────────────────────────────────
  function extractFen() {
    const board = document.querySelector('wc-chess-board, chess-board, .board');
    if (!board) return null;

    const reactKey = Object.keys(board).find(
      k => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$')
    );
    if (reactKey && board[reactKey]) {
      const findFen = (obj, depth = 0) => {
        if (!obj || depth > 4) return null;
        if (typeof obj.getFen === 'function') return obj.getFen();
        if (typeof obj.fen === 'string') return obj.fen;
        for (const key of ['game', 'props', 'children', 'memoizedProps', 'stateNode']) {
          if (obj[key]) {
            const r = findFen(obj[key], depth + 1);
            if (r) return r;
          }
        }
        return null;
      };
      const fen = findFen(board[reactKey]);
      if (fen) return fen;
    }

    return board.getAttribute('data-fen') || null;
  }

  // ── Coordinate Calculator ─────────────────────────────────────────────────
  function getSquareCoordinates(board, sq) {
    if (!sq || sq.length < 2) return null;

    const rect     = board.getBoundingClientRect();
    const fileIdx  = sq.charCodeAt(0) - 97;
    const rankNum  = parseInt(sq[1], 10);

    const isFlipped = board.classList.contains('flipped') ||
                      board.getAttribute('facing') === 'b' ||
                      board.getAttribute('orientation') === 'black';

    const col = isFlipped ? (7 - fileIdx) : fileIdx;
    const row = isFlipped ? (rankNum - 1) : (8 - rankNum);

    const sw = rect.width / 8;
    const sh = rect.height / 8;

    return {
      x: rect.left + (col + 0.5) * sw,
      y: rect.top  + (row + 0.5) * sh,
      leftPct:   (col / 8) * 100,
      topPct:    (row / 8) * 100,
      widthPct:  12.5,
      heightPct: 12.5,
    };
  }

  // ── Overlay Renderer ──────────────────────────────────────────────────────
  function drawOverlay(fromSq, toSq, moveType = 'best', badgeText = '') {
    clearOverlay();
    if (!showOverlay) return;

    const board = document.querySelector('wc-chess-board, chess-board, .board');
    if (!board) return;

    const container = document.createElement('div');
    container.id = 'ichess-overlay-container';

    const fromCoords = getSquareCoordinates(board, fromSq);
    if (fromCoords) {
      const el = document.createElement('div');
      el.className = 'ichess-highlight-box ichess-highlight-from';
      el.style.cssText = `left:${fromCoords.leftPct}%;top:${fromCoords.topPct}%;width:${fromCoords.widthPct}%;height:${fromCoords.heightPct}%`;
      container.appendChild(el);
    }

    const toCoords = getSquareCoordinates(board, toSq);
    if (toCoords) {
      const cls = moveType === 'brilliant'
        ? 'ichess-highlight-brilliant'
        : moveType === 'mistake'
          ? (mistakeSeverity === 'blunder' ? 'ichess-highlight-blunder' : 'ichess-highlight-mistake')
          : 'ichess-highlight-to';

      const el = document.createElement('div');
      el.className = `ichess-highlight-box ${cls}`;
      el.style.cssText = `left:${toCoords.leftPct}%;top:${toCoords.topPct}%;width:${toCoords.widthPct}%;height:${toCoords.heightPct}%`;

      const badge = document.createElement('div');
      badge.className = `ichess-move-badge ${moveType}`;
      badge.innerText = badgeText || `${fromSq}→${toSq}`;
      el.appendChild(badge);
      container.appendChild(el);
    }

    board.appendChild(container);
  }

  function clearOverlay() {
    const el = document.getElementById('ichess-overlay-container');
    if (el) el.remove();
  }

  // ── Move Selection ────────────────────────────────────────────────────────
  function processMoveSelection(defaultBestMove) {
    moveCounter++;
    let selectedMove = defaultBestMove;
    let moveType     = 'best';
    let moveBadge    = '';

    const isMistakeTurn = mistakeInterval > 0 && (moveCounter % mistakeInterval === 0);

    if (isMistakeTurn) {
      const mm = selectMistakeMove(defaultBestMove);
      if (mm) {
        selectedMove = mm;
        moveType  = 'mistake';
        moveBadge = mistakeSeverity === 'blunder' ? '?? Blunder'
                  : mistakeSeverity === 'mistake'  ? '? Mistake'
                  : '?! Inaccuracy';
      }
    } else if (brilliantHunter) {
      const fen = extractFen();
      const b   = detectBrilliantSacrifice(fen, defaultBestMove);
      if (b.isSacrifice) {
        selectedMove = b.move;
        moveType     = 'brilliant';
        moveBadge    = '!! Brilliant';
      }
    }

    const fromSq = selectedMove.substring(0, 2);
    const toSq   = selectedMove.substring(2, 4);

    drawOverlay(fromSq, toSq, moveType, moveBadge);

    if (autoPlayEnabled && !isExecutingMove) {
      autoPlayMove(fromSq, toSq);
    }
  }

  // ── Brilliant Hunter ──────────────────────────────────────────────────────
  function detectBrilliantSacrifice(fen, defaultBest) {
    const valid = mpvList.filter(i => i && i.move && i.move.length >= 4);
    if (valid.length === 0) return { move: defaultBest, isSacrifice: false };

    const topCp = valid[0].cp;
    if (topCp < -100) return { move: defaultBest, isSacrifice: false };

    let game = null;
    if (ChessCtor && fen) {
      try { game = new ChessCtor(fen); } catch { game = null; }
    }

    for (const item of valid) {
      if (topCp - item.cp > 60)  continue;
      if (item.cp < -80)         continue;

      const uci  = item.move;
      const from = uci.substring(0, 2);
      const to   = uci.substring(2, 4);

      if (!game) continue;

      const piece = game.get(from);
      if (!piece || piece.type === 'k' || piece.type === 'p') continue;

      const aVal = PIECE_VALUES[piece.type] || 0;
      const tPc  = game.get(to);
      const tVal = tPc ? (PIECE_VALUES[tPc.type] || 0) : 0;

      if (tPc && tPc.color !== piece.color && (aVal - tVal >= 2)) {
        return { move: uci, isSacrifice: true };
      }

      if (!tPc) {
        try {
          const clone = new ChessCtor(game.fen());
          if (clone.move({ from, to, promotion: uci[4] ?? 'q' })) {
            const cheapRecap = clone.moves({ verbose: true }).some(
              om => om.to === to && (PIECE_VALUES[om.piece] || 0) < aVal
            );
            if (cheapRecap) return { move: uci, isSacrifice: true };
          }
        } catch { /* ignore */ }
      }
    }

    return { move: defaultBest, isSacrifice: false };
  }

  // ── Mistake Selector ──────────────────────────────────────────────────────
  function selectMistakeMove(defaultBest) {
    const valid = mpvList.filter(i => i && i.move && i.move.length >= 4);
    if (valid.length <= 1) return defaultBest;

    const topCp  = valid[0].cp;
    const target = mistakeSeverity === 'blunder' ? 450
                 : mistakeSeverity === 'mistake'  ? 250
                 : 120;

    for (let i = 1; i < valid.length; i++) {
      if (topCp - valid[i].cp >= target - 100) return valid[i].move;
    }

    return valid[1]?.move || defaultBest;
  }

  // ── Auto-Play — BUG#3 fix: safety reset on isExecutingMove ───────────────
  function autoPlayMove(fromSq, toSq) {
    const board = document.querySelector('wc-chess-board, chess-board, .board');
    if (!board) return;

    isExecutingMove = true;

    // Safety: always release the lock after max 3 seconds
    const safetyTimer = setTimeout(() => { isExecutingMove = false; }, 3000);

    // Method A: Direct React internal game object
    const reactKey = Object.keys(board).find(
      k => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$')
    );
    if (reactKey && board[reactKey]) {
      const findGameObj = (obj, d = 0) => {
        if (!obj || d > 4) return null;
        if (typeof obj.userMove === 'function' || typeof obj.move === 'function' || typeof obj.makeMove === 'function') return obj;
        for (const key of ['game', 'props', 'children', 'memoizedProps']) {
          if (obj[key]) { const r = findGameObj(obj[key], d + 1); if (r) return r; }
        }
        return null;
      };

      const gObj = findGameObj(board[reactKey]);
      if (gObj) {
        try {
          if (typeof gObj.userMove === 'function') {
            gObj.userMove(fromSq + toSq);
            clearTimeout(safetyTimer);
            isExecutingMove = false;
            return;
          } else if (typeof gObj.move === 'function') {
            gObj.move({ from: fromSq, to: toSq, promotion: 'q' });
            clearTimeout(safetyTimer);
            isExecutingMove = false;
            return;
          }
        } catch { /* fallback */ }
      }
    }

    // Method B: Pointer Event coordinate click
    const fromC = getSquareCoordinates(board, fromSq);
    const toC   = getSquareCoordinates(board, toSq);

    if (!fromC || !toC) {
      clearTimeout(safetyTimer);
      isExecutingMove = false;
      return;
    }

    const delay = Math.floor(Math.random() * 350) + 400;
    setTimeout(() => {
      dispatchClickAtCoords(fromC.x, fromC.y);
      setTimeout(() => {
        dispatchClickAtCoords(toC.x, toC.y);
        clearTimeout(safetyTimer);
        isExecutingMove = false;
      }, 150);
    }, delay);
  }

  function dispatchClickAtCoords(x, y) {
    const el   = document.elementFromPoint(x, y) || document.body;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown',    opts));
    el.dispatchEvent(new PointerEvent('pointerup',  opts));
    el.dispatchEvent(new MouseEvent('mouseup',      opts));
    el.dispatchEvent(new MouseEvent('click',        opts));
  }

  // ── Main Scan Loop ────────────────────────────────────────────────────────
  function scanBoard() {
    if (!isContextValid()) {
      cleanupOnInvalidatedContext();
      return;
    }

    initWorker();
    updateHudStatus(); // BUG#1: no-ops unless hudNeedsUpdate = true

    if (!stockfishWorker) return;

    const fen = extractFen();
    if (!fen || fen === lastEvaluatedFen || isEvaluating) return;

    // BUG#2: detect new game by checking if starting FEN root changed (piece placement part)
    const fenRoot = fen.split(' ')[0]; // piece placement only, ignore move counter
    if (lastGameFenRoot && fenRoot !== lastGameFenRoot && fen.includes('rnbqkbnr/pppppppp')) {
      // New game started — reset move counter
      moveCounter = 0;
      console.log('[iChess Engine] New game detected, move counter reset');
    }
    lastGameFenRoot = fenRoot;

    lastEvaluatedFen = fen;
    isEvaluating     = true;
    mpvList          = [];

    stockfishWorker.postMessage(`position fen ${fen}`);
    stockfishWorker.postMessage(`go depth ${targetDepth}`);
  }

  scanIntervalId = setInterval(scanBoard, 600);

})();

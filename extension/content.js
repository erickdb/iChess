// extension/content.js — v2.1: Blob Worker Security Fix & Scraped-DOM Precision Engine

(function () {
  'use strict';

  console.log('[iChess Engine] Content Script v2.1 (Blob Worker Security Fix) loaded on Chess.com');

  const ChessCtor = window.Chess || (typeof Chess !== 'undefined' ? Chess : null);

  let showOverlay          = true;
  let autoPlayEnabled      = false;
  let brilliantHunter      = false;
  let targetDepth          = 12;
  let mistakeInterval      = 0;
  let mistakeSeverity      = 'mistake';

  let stockfishWorker      = null;
  let isInitializingWorker = false;
  let lastEvaluatedFen     = '';
  let isEvaluating         = false;
  let moveCounter          = 0;
  let mpvList              = [];
  let isExecutingMove      = false;
  let scanIntervalId       = null;
  let lastGameFenRoot      = '';
  let hudNeedsUpdate       = true;

  const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  // Guard against extension context invalidation
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

  // Load and listen for settings changes
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
          lastEvaluatedFen = '';
        }
      });
    } catch {
      cleanupOnInvalidatedContext();
    }
  }

  // Stockfish Blob Worker (Fixes Chrome Cross-Origin Worker Security Error)
  async function initWorker() {
    if (stockfishWorker || isInitializingWorker) return;
    if (!isContextValid()) {
      cleanupOnInvalidatedContext();
      return;
    }

    isInitializingWorker = true;

    try {
      const workerUrl = chrome.runtime.getURL('stockfish.js');
      const response = await fetch(workerUrl);
      const scriptText = await response.text();

      const blob = new Blob([scriptText], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);

      stockfishWorker = new Worker(blobUrl);

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
        isEvaluating = false;
      };

      stockfishWorker.postMessage('uci');
      stockfishWorker.postMessage('setoption name Hash value 32');
      stockfishWorker.postMessage(
        `setoption name MultiPV value ${brilliantHunter || mistakeInterval > 0 ? 5 : 2}`
      );
      stockfishWorker.postMessage('isready');
      isInitializingWorker = false;
      console.log('[iChess Engine] Stockfish Blob Worker v2.1 Ready');
    } catch (err) {
      isInitializingWorker = false;
      isEvaluating = false;
      if (err.message && err.message.includes('invalidated')) {
        cleanupOnInvalidatedContext();
        return;
      }
      console.error('[iChess Engine] Worker init failed:', err);
    }
  }

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

  // Live HUD Status Bar
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

  // Target Chessboard Component Element
  function getBoardElement() {
    return document.querySelector('wc-chess-board, chess-board, .board');
  }

  // 100% SCRAPED DOM FEN EXTRACTOR
  function extractFenFromDom() {
    const board = getBoardElement();
    if (!board) return null;

    if (board.game) {
      if (typeof board.game.getFen === 'function') return board.game.getFen();
      if (typeof board.game.fen === 'string') return board.game.fen;
      if (typeof board.game.getFEN === 'function') return board.game.getFEN();
    }

    const pieces = board.querySelectorAll('.piece');
    if (!pieces || pieces.length === 0) return null;

    const grid = Array(8).fill(null).map(() => Array(8).fill(null));

    pieces.forEach(el => {
      const cls = el.className;
      let pieceChar = null;
      let colIdx = -1;
      let rowIdx = -1;

      const sqMatch = cls.match(/square-(\d)(\d)/) || cls.match(/sq-([a-h])([1-8])/) || cls.match(/square-([a-h])([1-8])/);
      if (sqMatch) {
        if (/^\d$/.test(sqMatch[1])) {
          colIdx = parseInt(sqMatch[1], 10) - 1;
          rowIdx = parseInt(sqMatch[2], 10) - 1;
        } else {
          colIdx = sqMatch[1].charCodeAt(0) - 97;
          rowIdx = parseInt(sqMatch[2], 10) - 1;
        }
      }

      const pMatch = cls.match(/\b([wb])([pnbrqk])\b/i);
      if (pMatch) {
        const color = pMatch[1].toLowerCase();
        const type  = pMatch[2].toLowerCase();
        pieceChar = color === 'w' ? type.toUpperCase() : type.toLowerCase();
      }

      if (colIdx >= 0 && colIdx < 8 && rowIdx >= 0 && rowIdx < 8 && pieceChar) {
        grid[7 - rowIdx][colIdx] = pieceChar;
      }
    });

    let fenRows = [];
    for (let r = 0; r < 8; r++) {
      let rowStr = '';
      let emptyCount = 0;
      for (let c = 0; c < 8; c++) {
        const p = grid[r][c];
        if (!p) {
          emptyCount++;
        } else {
          if (emptyCount > 0) {
            rowStr += emptyCount;
            emptyCount = 0;
          }
          rowStr += p;
        }
      }
      if (emptyCount > 0) rowStr += emptyCount;
      fenRows.push(rowStr);
    }

    let activeTurn = 'w';
    const moveNodes = document.querySelectorAll(
      '.white-moveNode, .black-moveNode, .move-node, [data-ply], .move-row .node'
    );
    if (moveNodes && moveNodes.length > 0) {
      activeTurn = (moveNodes.length % 2 === 1) ? 'b' : 'w';
    } else {
      const isFlipped = board.classList.contains('flipped') ||
                        board.getAttribute('facing') === 'b' ||
                        board.getAttribute('orientation') === 'black';
      activeTurn = isFlipped ? 'b' : 'w';
    }

    return `${fenRows.join('/')} ${activeTurn} KQkq - 0 1`;
  }

  // Exact Grid Mapping for Scraped Chess.com Squares
  function getSquareCoordinates(board, sq) {
    if (!sq || sq.length < 2) return null;

    const rect    = board.getBoundingClientRect();
    const fileIdx = sq.charCodeAt(0) - 97;
    const rankNum = parseInt(sq[1], 10);

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
      colNumber: fileIdx + 1,
      rowNumber: rankNum,
    };
  }

  // Draw Overlay Anchored inside Relative Board Container
  function drawOverlay(fromSq, toSq, moveType = 'best', badgeText = '') {
    clearOverlay();
    if (!showOverlay) return;

    const board = getBoardElement();
    if (!board) return;

    if (window.getComputedStyle(board).position === 'static') {
      board.style.position = 'relative';
    }

    const container = document.createElement('div');
    container.id = 'ichess-overlay-container';

    // Source Highlight (Cyan)
    const fromCoords = getSquareCoordinates(board, fromSq);
    if (fromCoords) {
      const el = document.createElement('div');
      el.className = 'ichess-highlight-box ichess-highlight-from';
      el.style.cssText = `left:${fromCoords.leftPct}%;top:${fromCoords.topPct}%;width:${fromCoords.widthPct}%;height:${fromCoords.heightPct}%`;
      container.appendChild(el);
    }

    // Target Highlight & Badges
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
      badge.innerText = badgeText || `${fromSq}➔${toSq}`;
      el.appendChild(badge);
      container.appendChild(el);
    }

    board.appendChild(container);
  }

  function clearOverlay() {
    const el = document.getElementById('ichess-overlay-container');
    if (el) el.remove();
  }

  // Move Selection & Triggering
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
      const fen = extractFenFromDom();
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

  // Brilliant Hunter Sacrifice Scanner
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

  // Mistake Selector
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

  // Live Auto-Play Dispatcher
  function autoPlayMove(fromSq, toSq) {
    const board = getBoardElement();
    if (!board) return;

    isExecutingMove = true;
    const safetyTimer = setTimeout(() => { isExecutingMove = false; }, 3000);

    const fromC = getSquareCoordinates(board, fromSq);
    const toC   = getSquareCoordinates(board, toSq);

    if (!fromC || !toC) {
      clearTimeout(safetyTimer);
      isExecutingMove = false;
      return;
    }

    if (board.game && typeof board.game.makeMove === 'function') {
      try {
        board.game.makeMove(fromSq + toSq);
        clearTimeout(safetyTimer);
        isExecutingMove = false;
        return;
      } catch { /* fallback */ }
    }

    const sourceEl = board.querySelector(`.piece.square-${fromC.colNumber}${fromC.rowNumber}, .square-${fromC.colNumber}${fromC.rowNumber}, .sq-${fromSq}`) ||
                     document.elementFromPoint(fromC.x, fromC.y);

    const targetEl = board.querySelector(`.square-${toC.colNumber}${toC.rowNumber}, .sq-${toSq}`) ||
                     document.elementFromPoint(toC.x, toC.y);

    const delay = Math.floor(Math.random() * 300) + 350;

    setTimeout(() => {
      dispatchEventsOn(sourceEl || document.elementFromPoint(fromC.x, fromC.y), fromC.x, fromC.y);

      setTimeout(() => {
        dispatchEventsOn(targetEl || document.elementFromPoint(toC.x, toC.y), toC.x, toC.y);
        clearTimeout(safetyTimer);
        isExecutingMove = false;
      }, 160);
    }, delay);
  }

  function dispatchEventsOn(el, x, y) {
    if (!el) return;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown',    opts));
    el.dispatchEvent(new PointerEvent('pointerup',  opts));
    el.dispatchEvent(new MouseEvent('mouseup',      opts));
    el.dispatchEvent(new MouseEvent('click',        opts));
  }

  // Main Scan Loop
  function scanBoard() {
    if (!isContextValid()) {
      cleanupOnInvalidatedContext();
      return;
    }

    initWorker();
    updateHudStatus();

    if (!stockfishWorker) return;

    const fen = extractFenFromDom();
    if (!fen || fen === lastEvaluatedFen || isEvaluating) return;

    const fenRoot = fen.split(' ')[0];
    if (lastGameFenRoot && fenRoot !== lastGameFenRoot && fen.includes('rnbqkbnr/pppppppp')) {
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

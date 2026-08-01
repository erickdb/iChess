// extension/content.js — v3.0: Dual-World Auto-Player & Instant Anti-Stuck Engine

(function () {
  'use strict';

  console.log('[iChess Engine] Content Script v3.0 (Anti-Stuck & High-Precision Auto-Player) initialized');

  let showOverlay          = true;
  let autoPlayEnabled      = false;
  let brilliantHunter      = false;
  let targetDepth          = 12;
  let mistakeInterval      = 0;
  let mistakeSeverity      = 'mistake';

  let stockfishWorker      = null;
  let isInitializingWorker = false;
  let lastEvaluatedFen     = '';
  let evaluatingFen        = '';
  let isEvaluating         = false;
  let moveCounter          = 0;
  let mpvList              = [];
  let isExecutingMove      = false;
  let scanIntervalId       = null;
  let lastGameFenRoot      = '';
  let hudNeedsUpdate       = true;
  let mainWorldFen         = null;
  let mainWorldFenTime     = 0;

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

  // Listen for messages from popup & main-world bridge
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

  // Window message listener for Main World bridge FEN and Move Results
  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'ICHESS_MAIN_WORLD_FEN' && event.data.fen) {
      mainWorldFen = event.data.fen;
      mainWorldFenTime = Date.now();
    }
  });

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
          const currentFen = extractFenFromDom();
          isEvaluating = false;

          // Discard stale bestmove if board state has already changed during calculation!
          if (currentFen && currentFen !== evaluatingFen) {
            console.log('[iChess Engine] Discarding stale bestmove because board state updated');
            clearOverlay();
            return;
          }

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
      console.log('[iChess Engine] Stockfish Blob Worker v3.0 Ready');
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

  // Detect Active Turn with Multi-Layer Accuracy
  function detectActiveTurn(board) {
    // 1. Check Highlighted Last-Move Squares on Board
    const highlights = board.querySelectorAll('.highlight, [class*="highlight-"]');
    if (highlights && highlights.length >= 2) {
      for (const hl of highlights) {
        const sqClassMatch = hl.className.match(/square-(\d)(\d)|sq-([a-h])([1-8])|square-([a-h])([1-8])/);
        if (sqClassMatch) {
          let sqSelector = '';
          if (/^\d$/.test(sqClassMatch[1])) {
            sqSelector = `.square-${sqClassMatch[1]}${sqClassMatch[2]}`;
          } else {
            sqSelector = `.sq-${sqClassMatch[1]}${sqClassMatch[2]}, .square-${sqClassMatch[1]}${sqClassMatch[2]}`;
          }
          const piece = board.querySelector(`.piece${sqSelector}, ${sqSelector} .piece`);
          if (piece) {
            const pClass = piece.className;
            // If the piece on the last move highlight is White, White just moved -> Black's turn!
            if (/\b(w[pnbrqk]|white)\b/i.test(pClass)) return 'b';
            // If Black, Black just moved -> White's turn!
            if (/\b(b[pnbrqk]|black)\b/i.test(pClass)) return 'w';
          }
        }
      }
    }

    // 2. Check Player Clock Turn Indicators
    const whiteClock = document.querySelector('.player-component.white .clock-player-turn, .clock-white.clock-player-turn, .player-tag.white.is-turn');
    const blackClock = document.querySelector('.player-component.black .clock-player-turn, .clock-black.clock-player-turn, .player-tag.black.is-turn');
    if (whiteClock) return 'w';
    if (blackClock) return 'b';

    // 3. Check Move List DOM Elements Count
    const moveNodes = document.querySelectorAll(
      '.white-moveNode, .black-moveNode, .move-node, wc-move-node, .move-row .node'
    );
    if (moveNodes && moveNodes.length > 0) {
      return (moveNodes.length % 2 === 1) ? 'b' : 'w';
    }

    const isFlipped = board.classList.contains('flipped') ||
                      board.getAttribute('facing') === 'b' ||
                      board.getAttribute('orientation') === 'black';
    return isFlipped ? 'b' : 'w';
  }

  // 100% SCRAPED DOM FEN EXTRACTOR
  function extractFenFromDom() {
    // Return fresh Main World FEN if available (less than 1.5s old)
    if (mainWorldFen && (Date.now() - mainWorldFenTime < 1500)) {
      return mainWorldFen;
    }

    const board = getBoardElement();
    if (!board) return null;

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

    const activeTurn = detectActiveTurn(board);
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

    const fromSq    = selectedMove.substring(0, 2);
    const toSq      = selectedMove.substring(2, 4);
    const promotion = selectedMove.length > 4 ? selectedMove[4] : undefined;

    drawOverlay(fromSq, toSq, moveType, moveBadge);

    if (autoPlayEnabled && !isExecutingMove) {
      autoPlayMove(fromSq, toSq, promotion);
    }
  }

  // Brilliant Hunter Sacrifice Scanner
  function detectBrilliantSacrifice(fen, defaultBest) {
    const valid = mpvList.filter(i => i && i.move && i.move.length >= 4);
    if (valid.length === 0) return { move: defaultBest, isSacrifice: false };

    const topCp = valid[0].cp;
    if (topCp < -100) return { move: defaultBest, isSacrifice: false };

    let game = null;
    const ChessCtor = window.Chess || (typeof Chess !== 'undefined' ? Chess : null);
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

  // High-Precision Dual-World Auto-Play Engine
  function autoPlayMove(fromSq, toSq, promotion) {
    const board = getBoardElement();
    if (!board) return;

    isExecutingMove = true;
    const safetyTimer = setTimeout(() => { isExecutingMove = false; }, 2500);

    // Step 1: Send move request to Main World controller for native execution
    window.postMessage({
      type: 'ICHESS_EXECUTE_MOVE',
      from: fromSq,
      to: toSq,
      promotion: promotion || 'q'
    }, '*');

    // Step 2: Fallback simulated DOM click events directly on board
    const fromC = getSquareCoordinates(board, fromSq);
    const toC   = getSquareCoordinates(board, toSq);

    if (!fromC || !toC) {
      clearTimeout(safetyTimer);
      isExecutingMove = false;
      return;
    }

    const randomDelay = Math.floor(Math.random() * 200) + 250;

    setTimeout(() => {
      // Fire click at source square
      dispatchClickSequence(board, fromC.x, fromC.y);

      setTimeout(() => {
        // Fire click at target square
        dispatchClickSequence(board, toC.x, toC.y);

        // Also attempt drag-and-drop sequence if click-click didn't trigger
        dispatchDragSequence(board, fromC.x, fromC.y, toC.x, toC.y);

        clearTimeout(safetyTimer);
        isExecutingMove = false;
        clearOverlay();
      }, 140);
    }, randomDelay);
  }

  function dispatchClickSequence(container, x, y) {
    const target = document.elementFromPoint(x, y) || container;
    const commonOpts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x,
      screenY: y,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    };

    target.dispatchEvent(new PointerEvent('pointerdown', commonOpts));
    target.dispatchEvent(new MouseEvent('mousedown',    commonOpts));
    target.dispatchEvent(new PointerEvent('pointerup',   commonOpts));
    target.dispatchEvent(new MouseEvent('mouseup',      commonOpts));
    target.dispatchEvent(new MouseEvent('click',        commonOpts));
  }

  function dispatchDragSequence(container, fx, fy, tx, ty) {
    const target = document.elementFromPoint(fx, fy) || container;
    const downOpts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: fx, clientY: fy, button: 0, buttons: 1, pointerId: 1, isPrimary: true };
    const moveOpts = { bubbles: true, cancelable: true, composed: true, view: window, clientX: tx, clientY: ty, button: 0, buttons: 1, pointerId: 1, isPrimary: true };
    const upOpts   = { bubbles: true, cancelable: true, composed: true, view: window, clientX: tx, clientY: ty, button: 0, buttons: 0, pointerId: 1, isPrimary: true };

    target.dispatchEvent(new PointerEvent('pointerdown', downOpts));
    target.dispatchEvent(new MouseEvent('mousedown', downOpts));

    document.dispatchEvent(new PointerEvent('pointermove', moveOpts));
    document.dispatchEvent(new MouseEvent('mousemove', moveOpts));

    document.dispatchEvent(new PointerEvent('pointerup', upOpts));
    document.dispatchEvent(new MouseEvent('mouseup', upOpts));
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
    if (!fen) return;

    // Reset game state on new match
    const fenRoot = fen.split(' ')[0];
    if (lastGameFenRoot && fenRoot !== lastGameFenRoot && fen.includes('rnbqkbnr/pppppppp')) {
      moveCounter = 0;
      clearOverlay();
      console.log('[iChess Engine] New game detected, move counter & overlay reset');
    }
    lastGameFenRoot = fenRoot;

    // If board position has changed, update immediately
    if (fen !== lastEvaluatedFen) {
      lastEvaluatedFen = fen;
      evaluatingFen    = fen;

      // Interrupt old Stockfish search if it's still running
      if (isEvaluating) {
        try { stockfishWorker.postMessage('stop'); } catch { /* ignore */ }
      }

      isEvaluating = true;
      mpvList      = [];
      clearOverlay();

      stockfishWorker.postMessage(`position fen ${fen}`);
      stockfishWorker.postMessage(`go depth ${targetDepth}`);
    }
  }

  scanIntervalId = setInterval(scanBoard, 400);

})();

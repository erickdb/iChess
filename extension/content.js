// extension/content.js — v5.1: Main-World Engine Bridge + Best Move Overlay

(function () {
  'use strict';

  // ── Debug flag — toggle from DevTools: __iChess.debug = true ─────────────
  window.__iChess = window.__iChess || { debug: false };
  const log  = (...a) => window.__iChess.debug && console.log(...a);
  const warn = (...a) => window.__iChess.debug && console.warn(...a);

  log('[iChess Engine] Content Script v5.1 (Main-World Engine Bridge) initialized');

  let showOverlay = true;
  let brilliantHunter = true;
  let targetDepth = 6;

  let isEngineReady = false;   // true once Stockfish confirms readyok
  let isInitSent = false;      // true once initEngine() has been called once
  let lastEvaluatedFen = '';
  let evaluatingFen = '';
  let pendingFen = '';          // FEN seen on previous scan (stability check)
  let isEvaluating = false;
  let stopFlushPending = false; // true = stop was sent, next bestmove is the flush — discard it
  let pendingEvalFen = null;    // queued FEN to evaluate after stop flush arrives
  let mpvList = [];
  let scanIntervalId = null;
  let lastGameFenRoot = '';
  let hudNeedsUpdate = true;
  let lastDrawnOverlay = null; // { fromSq, toSq, moveType, badgeText } for re-draw guard
  let isDragging = false;      // true while user is holding a piece
  let forceNextScan = false;   // true = skip stability check on next scan (after Force Rescan)

  const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

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
    isEngineReady = false;
    const hud = document.getElementById('ichess-hud-status');
    if (hud) hud.remove();
    clearOverlay();
  }

  // ── Drag Detection: freeze evaluation while user is holding a piece ──────────────────
  document.addEventListener('mousedown', (e) => {
    const board = getBoardElement();
    if (board && board.contains(e.target)) {
      isDragging = true;
    }
  }, { passive: true });

  // Release on mouseup or if cursor leaves window (e.g. drag off-screen)
  document.addEventListener('mouseup', () => { isDragging = false; }, { passive: true });
  document.addEventListener('mouseleave', () => { isDragging = false; }, { passive: true });

  // Touch support (mobile)
  document.addEventListener('touchstart', (e) => {
    const board = getBoardElement();
    if (board && board.contains(e.target)) isDragging = true;
  }, { passive: true });
  document.addEventListener('touchend', () => { isDragging = false; }, { passive: true });

  // ── Sanitize & Validate FEN string format ────────────────────────────────────────
  function sanitizeFen(fen) {
    if (!fen || typeof fen !== 'string') return fen;
    let cleaned = fen.replace(/\s+([wb])\s+(--|-)\s+/gi, ' $1 - ');

    const parts = cleaned.split(' ');
    if (parts.length < 2) return cleaned;

    const ranks = parts[0].split('/');
    if (ranks.length !== 8) return cleaned;

    for (let r = 0; r < 8; r++) {
      let count = 0;
      for (const ch of ranks[r]) {
        if (/\d/.test(ch)) count += parseInt(ch, 10);
        else count += 1;
      }
      if (count !== 8) return null;
    }

    return cleaned;
  }

  // Load saved settings & listen for messages from background
  if (isContextValid()) {
    try {
      chrome.storage.local.get({
        showOverlay: true,
        brilliantHunter: true,
        depth: 6
      }, (res) => {
        if (!isContextValid()) return;
        showOverlay = res.showOverlay;
        brilliantHunter = res.brilliantHunter;
        targetDepth = res.depth;
        hudNeedsUpdate = true;
        updateHudStatus();
        // Init engine via background
        initEngine();
      });

      chrome.runtime.onMessage.addListener((msg) => {
        if (!isContextValid()) return;

        // ── Settings update from popup ────────────────────────────────────────
        if (msg.type === 'ICHESS_SETTINGS_UPDATE' && msg.config) {
          showOverlay = msg.config.showOverlay;
          brilliantHunter = msg.config.brilliantHunter;
          targetDepth = msg.config.depth;

          if (isEngineReady) {
            sendEngineCmd(`setoption name MultiPV value ${brilliantHunter ? 5 : 2}`);
          }

          hudNeedsUpdate = true;
          updateHudStatus();
          syncPanelFromState();
          if (!showOverlay) clearOverlay();
          lastEvaluatedFen = '';
          scanBoard();
        } else if (msg.type === 'ICHESS_FORCE_RESCAN') {
          // Hard reset all eval state and force a fresh scan immediately
          log('[iChess Engine] ⚡ Force Rescan triggered');
          if (isEvaluating) sendEngineCmd('stop');
          isEvaluating     = false;
          stopFlushPending = false;
          pendingEvalFen   = null;
          lastEvaluatedFen = '';
          evaluatingFen    = '';
          pendingFen       = '';
          mpvList          = [];
          forceNextScan    = true; // skip stability check on next scan
          clearOverlay();
          setTimeout(scanBoard, 100);
        }
      });
    } catch {
      cleanupOnInvalidatedContext();
    }
  }

  // ── Engine Communication (via Main-World postMessage Bridge) ──────────────────

  function sendEngineCmd(cmd) {
    // Forward UCI command to Stockfish hosted in main-world.js
    window.postMessage({ type: 'ICHESS_SF_CMD', cmd }, '*');
  }

  function initEngine() {
    if (isInitSent || !isContextValid()) return;
    isInitSent = true; // prevent multiple init floods while Stockfish loads

    const sfUrl = chrome.runtime.getURL('stockfish.js');
    window.postMessage({ type: 'ICHESS_INIT_ENGINE', sfUrl }, '*');

    // Send initial UCI handshake — queued in main-world if Stockfish not ready yet
    sendEngineCmd('uci');
    sendEngineCmd('setoption name Hash value 32');
    sendEngineCmd(`setoption name MultiPV value ${brilliantHunter ? 5 : 2}`);
    sendEngineCmd('isready');

    log('[iChess Engine] Engine init sent — awaiting Stockfish confirmation...');
  }

  // Listen for Stockfish lines forwarded back from main-world.js
  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.source !== 'ichess-engine') return; // only our engine messages

    if (event.data.type === 'ICHESS_SF_LINE') {
      const line = event.data.line;
      // Mark engine ready once Stockfish confirms — triggers scan to start evaluating
      if (!isEngineReady && (line === 'uciok' || line === 'readyok')) {
        isEngineReady = true;
        log('[iChess Engine] Engine confirmed ready from Stockfish:', line);
      }
      handleStockfishLine(line);
    }
  });

  // ── Helper: kick off a fresh Stockfish search ─────────────────────────────
  function startEval(fen) {
    lastEvaluatedFen = fen;
    evaluatingFen    = fen;
    isEvaluating     = true;
    mpvList          = [];
    clearOverlay();
    sendEngineCmd(`position fen ${fen}`);
    sendEngineCmd(`go depth ${targetDepth}`);
    log(`[iChess Engine] ▶ Eval started depth=${targetDepth} | FEN:`, fen);
  }

  // Processes every line Stockfish sends (forwarded from main-world)
  function handleStockfishLine(line) {
    if (!line) return;

    if (line === 'uciok' || line === 'readyok') {
      log('[iChess Engine] Stockfish ready:', line);
      return;
    }

    if (line.startsWith('info') && line.includes(' score ')) {
      // Only accumulate info lines if they belong to the current active search
      if (!stopFlushPending) parseMpvLine(line);

    } else if (line.startsWith('bestmove')) {
      isEvaluating = false;

      // ── Stop-flush: this bestmove is the leftover from a stopped search ──
      // We already queued a new FEN → discard this result, start the real eval
      if (stopFlushPending) {
        stopFlushPending = false;
        const fen = pendingEvalFen;
        pendingEvalFen = null;
        if (fen) {
          log('[iChess Engine] ✓ Stop flush received — starting pending eval');
          startEval(fen);
        }
        return; // ← discard the stale bestmove
      }

      // ── Normal path: verify board hasn't drifted during long analysis ────
      const currentFen = getFenState();
      if (currentFen && currentFen.split(' ')[0] !== evaluatingFen.split(' ')[0]) {
        log('[iChess Engine] Discarding stale bestmove — board moved during analysis');
        clearOverlay();
        return;
      }

      const parts    = line.split(' ');
      const bestMove = parts[1];
      if (bestMove && bestMove !== '(none)') {
        log('[iChess Engine] ✓ Best move:', bestMove);
        processMoveSelection(bestMove);
      }
    }
  }

  function parseMpvLine(line) {
    const cpMatch = line.match(/score cp (-?\d+)/);
    const mateMatch = line.match(/score mate (-?\d+)/);
    const pvMatch = line.match(/pv\s((?:[a-h][1-8][a-h][1-8][qrbn]?\s*)+)/);
    const mpvMatch = line.match(/multipv\s(\d+)/);

    if (!pvMatch || !mpvMatch) return;
    const rank = parseInt(mpvMatch[1], 10);
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

      // Click → toggle the in-page settings panel (ignore if drag occurred)
      hud.addEventListener('click', () => {
        if (hud._ichessDragged && hud._ichessDragged()) return;
        const panel = document.getElementById('ichess-panel');
        if (!panel) {
          createSettingsPanel();
        } else {
          panel.style.display = (panel.style.display === 'none') ? '' : 'none';
        }
      });

      // HUD itself is draggable
      makeDraggable(hud, hud);
    }

    hud.className = brilliantHunter ? 'hud-brilliant' : '';
    let statusText = `Depth ${targetDepth}`;
    if (brilliantHunter) statusText += ' | 🔥 Brilliant Hunter';
    hud.innerHTML = `<div class="dot"></div><div>iChess: ${statusText}</div>`;
  }

  function getBoardElement() {
    return (
      document.querySelector('wc-chess-board') ||
      document.querySelector('chess-board') ||
      document.querySelector('.board') ||
      document.querySelector('[class*="board"]')
    );
  }

  function getFenState() {
    return sanitizeFen(extractFenFromDom());
  }

  // Strict Class-Based Square Parser for Chess.com DOM (Discards CSS translate transitions)
  function parseSquareFromElement(el, isFlipped) {
    const cls = el.className || '';

    if (cls.includes('ichess-') || cls.includes('dragging') || cls.includes('ghost')) return null;

    // Format A: square-0502 or square-52 (digits)
    const mDigits = cls.match(/square-(\d{2,4})/);
    if (mDigits) {
      const digits = mDigits[1];
      let colIdx = -1, rowIdx = -1;
      if (digits.length === 4) {
        colIdx = parseInt(digits.substring(0, 2), 10) - 1;
        rowIdx = parseInt(digits.substring(2, 4), 10) - 1;
      } else if (digits.length === 2) {
        colIdx = parseInt(digits[0], 10) - 1;
        rowIdx = parseInt(digits[1], 10) - 1;
      }
      if (colIdx >= 0 && colIdx < 8 && rowIdx >= 0 && rowIdx < 8) {
        return { colIdx, rowIdx };
      }
    }

    // Format B: sq-e2 or square-e2 (letters)
    const mLetter = cls.match(/(?:square|sq)-([a-h])([1-8])/);
    if (mLetter) {
      const colIdx = mLetter[1].charCodeAt(0) - 97;
      const rowIdx = parseInt(mLetter[2], 10) - 1;
      return { colIdx, rowIdx };
    }

    return null;
  }

  // Parse Piece Character (Explicit Mapping)
  function parsePieceCharFromElement(el) {
    const cls = el.className || '';

    if (/\b(wk|white-king)\b/i.test(cls)) return 'K';
    if (/\b(wq|white-queen)\b/i.test(cls)) return 'Q';
    if (/\b(wr|white-rook)\b/i.test(cls)) return 'R';
    if (/\b(wb|white-bishop)\b/i.test(cls)) return 'B';
    if (/\b(wn|white-knight)\b/i.test(cls)) return 'N';
    if (/\b(wp|white-pawn)\b/i.test(cls)) return 'P';

    if (/\b(bk|black-king)\b/i.test(cls)) return 'k';
    if (/\b(bq|black-queen)\b/i.test(cls)) return 'q';
    if (/\b(br|black-rook)\b/i.test(cls)) return 'r';
    if (/\b(bb|black-bishop)\b/i.test(cls)) return 'b';
    if (/\b(bn|black-knight)\b/i.test(cls)) return 'n';
    if (/\b(bp|black-pawn)\b/i.test(cls)) return 'p';

    return null;
  }

  // Multi-layer Active Turn Detector (Computer + Live Online Games)
  function detectActiveTurn(board) {
    // 1. Check Sidebar Move List (most reliable — works for both computer & live)
    const moveNodes = document.querySelectorAll(
      '.move-node, wc-move-node, [data-ply], .white-moveNode, .black-moveNode'
    );
    if (moveNodes && moveNodes.length > 0) {
      const lastNode = moveNodes[moveNodes.length - 1];
      const cls = (lastNode.className || '') + ' ' + (lastNode.getAttribute('class') || '');
      const parentCls = lastNode.parentElement ? lastNode.parentElement.className : '';

      if (cls.includes('white') || parentCls.includes('white') || lastNode.matches('.white-moveNode')) {
        return 'b';
      }
      if (cls.includes('black') || parentCls.includes('black') || lastNode.matches('.black-moveNode')) {
        return 'w';
      }

      const plyAttr = lastNode.getAttribute('data-ply');
      if (plyAttr) {
        const ply = parseInt(plyAttr, 10);
        return (ply % 2 === 1) ? 'b' : 'w';
      }

      return (moveNodes.length % 2 === 1) ? 'b' : 'w';
    }

    // 2. Live Online Game Clock — wc-clock-component (new Chess.com live UI)
    const activeClockEl = document.querySelector(
      'wc-clock-component.clock-bottom.clock-player-turn, ' +
      'wc-clock-component.clock-top.clock-player-turn'
    );
    if (activeClockEl) {
      const isFlipped = board.classList.contains('flipped') ||
        board.getAttribute('facing') === 'b' ||
        board.getAttribute('orientation') === 'black';
      const isBottom = activeClockEl.classList.contains('clock-bottom');
      // bottom clock = current player's clock
      // if board not flipped → white is bottom; if flipped → black is bottom
      if (isBottom) return isFlipped ? 'b' : 'w';
      return isFlipped ? 'w' : 'b';
    }

    // 3. is-your-turn attribute / class (live game indicator)
    const yourTurnEl = document.querySelector('[class*="is-your-turn"], .your-turn-indicator');
    if (yourTurnEl) {
      // figure out which color we are from the board orientation
      const isFlipped = board.classList.contains('flipped') ||
        board.getAttribute('facing') === 'b' ||
        board.getAttribute('orientation') === 'black';
      return isFlipped ? 'b' : 'w';
    }

    // 4. Classic Clock Turn Indicators (computer games)
    const whiteClock = document.querySelector(
      '.player-component.white .clock-player-turn, ' +
      '.clock-white.clock-player-turn, ' +
      '.player-tag.white.is-turn, ' +
      '.player-component.bottom.white .clock-player-turn'
    );
    const blackClock = document.querySelector(
      '.player-component.black .clock-player-turn, ' +
      '.clock-black.clock-player-turn, ' +
      '.player-tag.black.is-turn, ' +
      '.player-component.bottom.black .clock-player-turn'
    );
    if (whiteClock) return 'w';
    if (blackClock) return 'b';

    // 5. Fallback: board orientation
    const isFlipped = board.classList.contains('flipped') ||
      board.getAttribute('facing') === 'b' ||
      board.getAttribute('orientation') === 'black';
    return isFlipped ? 'b' : 'w';
  }

  // 100% PURE SCRAPED DOM FEN EXTRACTOR
  function extractFenFromDom() {
    const board = getBoardElement();
    if (!board) return null;

    const pieces = board.querySelectorAll('.piece');
    if (!pieces || pieces.length === 0) return null;

    const isFlipped = board.classList.contains('flipped') ||
      board.getAttribute('facing') === 'b' ||
      board.getAttribute('orientation') === 'black';

    const grid = Array(8).fill(null).map(() => Array(8).fill(null));

    pieces.forEach(el => {
      const sq = parseSquareFromElement(el, isFlipped);
      if (!sq) return;

      const pieceChar = parsePieceCharFromElement(el);
      if (pieceChar && sq.colIdx >= 0 && sq.colIdx < 8 && sq.rowIdx >= 0 && sq.rowIdx < 8) {
        grid[7 - sq.rowIdx][sq.colIdx] = pieceChar;
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

    // ── Castling Rights: infer from starting-square occupancy ─────────────────
    // grid[7] = rank 1 (white back rank), grid[0] = rank 8 (black back rank)
    // col 0=a, 4=e, 7=h
    // Strategy: if king AND rook are both still on their starting squares,
    // optimistically assume the castling right is still alive.
    // chess.js legality check in processMoveSelection is the safety net.
    let castling = '';
    if (grid[7][4] === 'K') {                    // white king on e1
      if (grid[7][7] === 'R') castling += 'K';  // rook on h1 → kingside
      if (grid[7][0] === 'R') castling += 'Q';  // rook on a1 → queenside
    }
    if (grid[0][4] === 'k') {                    // black king on e8
      if (grid[0][7] === 'r') castling += 'k';  // rook on h8 → kingside
      if (grid[0][0] === 'r') castling += 'q';  // rook on a8 → queenside
    }
    if (!castling) castling = '-';

    return `${fenRows.join('/')} ${activeTurn} ${castling} - 0 1`;
  }

  function getSquareCoordinates(board, sq) {
    if (!sq || sq.length < 2) return null;

    const rect = board.getBoundingClientRect();
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
      y: rect.top + (row + 0.5) * sh,
      leftPct: (col / 8) * 100,
      topPct: (row / 8) * 100,
      widthPct: 12.5,
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
      const cls = moveType === 'opponent'
        ? 'ichess-highlight-opponent'
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
    lastDrawnOverlay = { fromSq, toSq, moveType, badgeText };
    log(`[iChess Engine] Overlay drawn: ${fromSq}→${toSq} [${moveType}]`);
  }

  function clearOverlay() {
    const el = document.getElementById('ichess-overlay-container');
    if (el) el.remove();
    lastDrawnOverlay = null;
  }

  // ── Draggable Helper ─────────────────────────────────────────────────────
  // Makes any fixed element draggable. !important CSS is overridden via setProperty.
  function makeDraggable(el, handle) {
    let dragged = false;

    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragged = false;

      const rect = el.getBoundingClientRect();
      // Snap to left/top coords (overrides CSS right/bottom !important)
      el.style.setProperty('left',   rect.left + 'px', 'important');
      el.style.setProperty('top',    rect.top  + 'px', 'important');
      el.style.setProperty('right',  'auto',            'important');
      el.style.setProperty('bottom', 'auto',            'important');

      const ox = e.clientX - rect.left;
      const oy = e.clientY - rect.top;
      handle.style.cursor = 'grabbing';

      function onMove(ev) {
        dragged = true;
        const nx = Math.max(0, Math.min(ev.clientX - ox, window.innerWidth  - el.offsetWidth));
        const ny = Math.max(0, Math.min(ev.clientY - oy, window.innerHeight - el.offsetHeight));
        el.style.setProperty('left', nx + 'px', 'important');
        el.style.setProperty('top',  ny + 'px', 'important');
      }

      function onUp() {
        handle.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });

    // Expose dragged flag so click listeners can tell apart click vs drag-release
    el._ichessDragged = () => dragged;
  }

  // ── In-Page Settings Panel ────────────────────────────────────────────────
  function createSettingsPanel() {
    const existing = document.getElementById('ichess-panel');
    if (existing) { existing.style.display = ''; return; }

    const DEPTH_OPTS = [
      [2,'Casual (~800 ELO)'],[4,'Beginner (~1000 ELO)'],[6,'Club Player (~1350 ELO)'],
      [8,'Advanced Club (~1600 ELO)'],[10,'Expert (~1850 ELO)'],[12,'Candidate Master (~2100 ELO)'],
      [14,'FIDE Master (~2300 ELO)'],[16,"Int'l Master (~2450 ELO)"],[18,'Grandmaster (~2600 ELO)'],
      [20,'Super GM (~2800 ELO)'],[22,'Engine Elite (~3000 ELO)'],[24,'Max Depth (~3500 ELO)'],
    ];

    const panel = document.createElement('div');
    panel.id = 'ichess-panel';
    panel.innerHTML = `
      <div id="ichess-panel-header">
        <div class="ichess-panel-header-title">
          <span class="ichess-panel-title">i<span style="color:#00adb5">Chess</span> Control</span>
          <span class="ichess-panel-badge">ASSIST v5.0</span>
        </div>
        <button id="ichess-panel-min" title="Minimize">−</button>
      </div>
      <div id="ichess-panel-body">
        <button id="ichess-btn-rescan" class="ichess-btn-rescan">⚡ Force Rescan</button>
        <div class="ichess-row">
          <span class="ichess-row-label">Show Best Move Overlay</span>
          <label class="ichess-switch">
            <input type="checkbox" id="ichess-tog-overlay" ${showOverlay ? 'checked' : ''}>
            <span class="ichess-slider"></span>
          </label>
        </div>
        <div class="ichess-row ichess-brilliant-row">
          <div>
            <div style="font-weight:800;color:#ff4b4b;font-size:12px;">🔥 Brilliant Hunter</div>
            <div style="font-size:10px;color:#94a3b8;">Hunts for piece sacrifices (!!)</div>
          </div>
          <label class="ichess-switch">
            <input type="checkbox" id="ichess-tog-brilliant" ${brilliantHunter ? 'checked' : ''}>
            <span class="ichess-slider ichess-slider-red"></span>
          </label>
        </div>
        <div class="ichess-depth-section">
          <div class="ichess-label-title">Calculated Depth (Strength)</div>
          <select id="ichess-depth-sel">
            ${DEPTH_OPTS.map(([d, lbl]) =>
              `<option value="${d}" ${targetDepth === d ? 'selected' : ''}>Depth ${d < 10 ? '0' : ''}${d} — ${lbl}</option>`
            ).join('')}
          </select>
        </div>
        <div class="ichess-panel-footer">iChess Advanced Engine Assist</div>
      </div>
    `;

    document.body.appendChild(panel);

    // Position panel above the HUD pill
    const hud = document.getElementById('ichess-hud-status');
    if (hud) {
      const hr  = hud.getBoundingClientRect();
      const ph  = 350; // estimated panel height
      let   top = hr.top - ph - 8;
      let   left = hr.left;
      if (top < 8)  top  = hr.bottom + 8;
      left = Math.max(8, Math.min(left, window.innerWidth - 296));
      panel.style.setProperty('top',    top  + 'px', 'important');
      panel.style.setProperty('left',   left + 'px', 'important');
      panel.style.setProperty('right',  'auto',       'important');
      panel.style.setProperty('bottom', 'auto',       'important');
    }

    // Drag via header
    makeDraggable(panel, document.getElementById('ichess-panel-header'));

    // Minimize — hide panel; click HUD to restore
    document.getElementById('ichess-panel-min').addEventListener('click', (e) => {
      e.stopPropagation();
      panel.style.display = 'none';
    });

    // Force Rescan (mirrors the logic in the message handler)
    const btnRescan = document.getElementById('ichess-btn-rescan');
    btnRescan.addEventListener('click', () => {
      if (isEvaluating) sendEngineCmd('stop');
      isEvaluating = false; stopFlushPending = false; pendingEvalFen = null;
      lastEvaluatedFen = ''; evaluatingFen = ''; pendingFen = '';
      mpvList = []; forceNextScan = true;
      clearOverlay();
      btnRescan.textContent = '✓ Rescanning...';
      setTimeout(() => { if (btnRescan) btnRescan.textContent = '⚡ Force Rescan'; }, 1500);
      setTimeout(scanBoard, 100);
    });

    // Settings change handler — syncs directly into engine vars + chrome.storage
    function onSettingsChange() {
      showOverlay     = document.getElementById('ichess-tog-overlay').checked;
      brilliantHunter = document.getElementById('ichess-tog-brilliant').checked;
      targetDepth     = parseInt(document.getElementById('ichess-depth-sel').value, 10);
      if (isEngineReady) sendEngineCmd(`setoption name MultiPV value ${brilliantHunter ? 5 : 2}`);
      hudNeedsUpdate = true;
      updateHudStatus();
      if (!showOverlay) clearOverlay();
      lastEvaluatedFen = '';
      scanBoard();
      if (isContextValid()) chrome.storage.local.set({ showOverlay, brilliantHunter, depth: targetDepth });
    }

    document.getElementById('ichess-tog-overlay').addEventListener('change',  onSettingsChange);
    document.getElementById('ichess-tog-brilliant').addEventListener('change', onSettingsChange);
    document.getElementById('ichess-depth-sel').addEventListener('change',     onSettingsChange);
  }

  // Reflect engine state into panel UI (called after external settings update)
  function syncPanelFromState() {
    const ov = document.getElementById('ichess-tog-overlay');
    const br = document.getElementById('ichess-tog-brilliant');
    const dp = document.getElementById('ichess-depth-sel');
    if (ov) ov.checked  = showOverlay;
    if (br) br.checked  = brilliantHunter;
    if (dp) dp.value    = String(targetDepth);
  }

  // Move Selection & Overlay Drawing with Strict Legality Validation
  function processMoveSelection(defaultBestMove) {
    const fen = getFenState();
    if (!fen) return;

    const fromSq = defaultBestMove.substring(0, 2);
    const toSq = defaultBestMove.substring(2, 4);

    // Validate move legality against active FEN position using chess.js
    const ChessCtor = window.Chess || (typeof Chess !== 'undefined' ? Chess : null);
    if (ChessCtor && fen) {
      try {
        const tempGame = new ChessCtor(fen);
        const promo = defaultBestMove.length > 4 ? defaultBestMove[4] : 'q';
        const legalMove = tempGame.move({ from: fromSq, to: toSq, promotion: promo });
        if (!legalMove) {
          warn(`[iChess Engine] Discarding stale/illegal move ${defaultBestMove} for FEN: ${fen}`);
          clearOverlay();
          return;
        }
      } catch (e) {
        warn(`[iChess Engine] FEN validation exception for ${defaultBestMove} (stale response discarded):`, e.message);
        clearOverlay();
        return;
      }
    }

    let selectedMove = defaultBestMove;
    let moveType = 'best';
    let moveBadge = '';

    if (brilliantHunter) {
      const b = detectBrilliantSacrifice(fen, defaultBestMove);
      if (b.isSacrifice) {
        selectedMove = b.move;
        moveType = 'best';
        // no badge label — just plain green, no "Brilliant" text
      }
    }

    const finalFrom = selectedMove.substring(0, 2);
    const finalTo = selectedMove.substring(2, 4);

    // Detect if this is the player's turn or opponent's turn
    // Board not flipped = player is white; flipped = player is black
    const board = getBoardElement();
    const isFlipped = board && (
      board.classList.contains('flipped') ||
      board.getAttribute('facing') === 'b' ||
      board.getAttribute('orientation') === 'black'
    );
    const playerColor = isFlipped ? 'b' : 'w';
    const fenTurn = fen.split(' ')[1]; // 'w' or 'b'
    const isMyTurn = fenTurn === playerColor;

    if (!isMyTurn) {
      // Opponent's turn — dimmer overlay so it's less prominent
      drawOverlay(finalFrom, finalTo, moveType === 'brilliant' ? 'brilliant' : 'opponent', moveBadge);
    } else {
      drawOverlay(finalFrom, finalTo, moveType, moveBadge);
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
      if (topCp - item.cp > 60) continue;
      if (item.cp < -80) continue;

      const uci = item.move;
      const from = uci.substring(0, 2);
      const to = uci.substring(2, 4);

      if (!game) continue;

      const piece = game.get(from);
      if (!piece || piece.type === 'k' || piece.type === 'p') continue;

      const aVal = PIECE_VALUES[piece.type] || 0;
      const tPc = game.get(to);
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

  // Main Scan Loop
  function scanBoard() {
    if (!isContextValid()) {
      cleanupOnInvalidatedContext();
      return;
    }

    initEngine();
    updateHudStatus();

    if (!isEngineReady) return;

    // ── Freeze while user is dragging a piece ────────────────────────────────────────────────
    if (isDragging) return;

    const fen = getFenState();
    if (!fen) return;

    // ── Re-draw guard: overlay was removed by Chess.com DOM mutation ──────────────
    // If we have a known overlay but the container is gone, re-append it without re-evaluating
    if (lastDrawnOverlay && !document.getElementById('ichess-overlay-container')) {
      const { fromSq, toSq, moveType, badgeText } = lastDrawnOverlay;
      // Only re-draw if the position hasn't changed since last draw
      if (fen.split(' ')[0] === lastEvaluatedFen.split(' ')[0]) {
        drawOverlay(fromSq, toSq, moveType, badgeText);
        return; // overlay restored, skip re-evaluation
      }
    }

    // Reset overlay on new match
    const fenRoot = fen.split(' ')[0];
    if (lastGameFenRoot && fenRoot !== lastGameFenRoot && fen.includes('rnbqkbnr/pppppppp')) {
      clearOverlay();
      log('[iChess Engine] New game detected, overlay reset');
    }
    lastGameFenRoot = fenRoot;

    // ── Stability check: only evaluate FEN after it's been stable for 2 scans (~600ms) ────
    // Prevents triggering on intermediate DOM states during Chess.com move animations
    if (fen !== lastEvaluatedFen) {
      if (!forceNextScan && fen !== pendingFen) {
        // First time seeing this FEN — record it and wait for next scan to confirm
        pendingFen = fen;
        return;
      }
      // FEN is stable (seen twice) OR force flag is set — evaluate it
      pendingFen    = '';
      forceNextScan = false;
      log('[iChess Engine] Stable new FEN detected:', fen);

      if (isEvaluating) {
        // ── Stop-flush path: send stop, queue new FEN, wait for Stockfish's
        //    flush bestmove before starting the real eval ───────────────────
        sendEngineCmd('stop');
        stopFlushPending = true;
        isEvaluating    = false;
        pendingEvalFen  = fen;
        log('[iChess Engine] ⏸ Stopping current search — flush queued for new FEN');
        return;
      }

      if (stopFlushPending) {
        // Already waiting for a flush — just update the queued FEN to the latest
        pendingEvalFen = fen;
        log('[iChess Engine] Updated pending eval FEN (still awaiting flush)');
        return;
      }

      // Engine idle — start evaluation immediately
      startEval(fen);
    }
  }

  scanIntervalId = setInterval(scanBoard, 300);

})();

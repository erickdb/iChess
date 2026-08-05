// extension/content.js — v5.1: Main-World Engine Bridge + Best Move Overlay

(function () {
  'use strict';

  console.log('[iChess Engine] Content Script v5.1 (Main-World Engine Bridge) initialized');

  let showOverlay = true;
  let brilliantHunter = true;
  let targetDepth = 6;

  let isEngineReady = false;  // true once Stockfish confirms readyok
  let isInitSent = false;     // true once initEngine() has been called once
  let lastEvaluatedFen = '';
  let evaluatingFen = '';
  let pendingFen = '';         // FEN seen on previous scan (stability check)
  let isEvaluating = false;
  let mpvList = [];
  let scanIntervalId = null;
  let lastGameFenRoot = '';
  let hudNeedsUpdate = true;
  let lastDrawnOverlay = null; // { fromSq, toSq, moveType, badgeText } for re-draw guard
  let isDragging = false;      // true while user is holding a piece

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
          if (!showOverlay) clearOverlay();
          lastEvaluatedFen = '';
          scanBoard();
        } else if (msg.type === 'ICHESS_RESET_GAME') {
          console.log('[iChess Engine] Reset Game triggered');
          lastEvaluatedFen = '';
          isEvaluating = false;
          clearOverlay();
          window.postMessage({ type: 'ICHESS_MAIN_RESET_GAME' }, '*');
          setTimeout(scanBoard, 300);
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

    console.log('[iChess Engine] Engine init sent — awaiting Stockfish confirmation...');
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
        console.log('[iChess Engine] Engine confirmed ready from Stockfish:', line);
      }
      handleStockfishLine(line);
    }
  });

  // Processes every line Stockfish sends (forwarded from background)
  function handleStockfishLine(line) {
    if (!line) return;

    if (line === 'uciok' || line === 'readyok') {
      console.log('[iChess Engine] Stockfish ready:', line);
      return;
    }

    if (line.startsWith('info') && line.includes(' score ')) {
      parseMpvLine(line);
    } else if (line.startsWith('bestmove')) {
      const currentFen = getFenState();
      isEvaluating = false;

      // Discard if piece positions changed during analysis
      if (currentFen && currentFen.split(' ')[0] !== evaluatingFen.split(' ')[0]) {
        console.log('[iChess Engine] Discarding stale bestmove — board moved during analysis');
        clearOverlay();
        return;
      }

      const parts = line.split(' ');
      const bestMove = parts[1];
      if (bestMove && bestMove !== '(none)') {
        console.log('[iChess Engine] Stockfish recommended move:', bestMove);
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
    // Use '-' for castling rights — DOM can't track castling state
    // KQkq causes chess.js to throw when kings have moved from starting squares
    return `${fenRows.join('/')} ${activeTurn} - - 0 1`;
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
    console.log(`[iChess Engine] Overlay drawn: ${fromSq}→${toSq} [${moveType}]`);
  }

  function clearOverlay() {
    const el = document.getElementById('ichess-overlay-container');
    if (el) el.remove();
    lastDrawnOverlay = null;
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
          console.warn(`[iChess Engine] Discarding stale/illegal move ${defaultBestMove} for FEN: ${fen}`);
          clearOverlay();
          return;
        }
      } catch (e) {
        console.warn(`[iChess Engine] FEN validation exception for ${defaultBestMove} (stale response discarded):`, e.message);
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
      console.log('[iChess Engine] New game detected, overlay reset');
    }
    lastGameFenRoot = fenRoot;

    // ── Stability check: only evaluate FEN after it's been stable for 2 scans (~600ms) ────
    // Prevents triggering on intermediate DOM states during Chess.com move animations
    if (fen !== lastEvaluatedFen) {
      if (fen !== pendingFen) {
        // First time seeing this FEN — record it and wait for next scan to confirm
        pendingFen = fen;
        return;
      }
      // FEN is stable (seen twice) — evaluate it
      pendingFen = '';
      console.log('[iChess Engine] Evaluating new FEN position:', fen);
      lastEvaluatedFen = fen;
      evaluatingFen = fen;

      if (isEvaluating) {
        sendEngineCmd('stop');
      }

      isEvaluating = true;
      mpvList = [];
      clearOverlay();

      sendEngineCmd(`position fen ${fen}`);
      sendEngineCmd(`go depth ${targetDepth}`);
    }
  }

  scanIntervalId = setInterval(scanBoard, 300);

})();

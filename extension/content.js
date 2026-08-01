// extension/content.js — Advanced Engine Assistant with Math-Based Grid & Dual Execution

(function () {
  'use strict';

  console.log('[iChess Engine] Content Script v1.4 loaded on Chess.com');

  const ChessCtor = window.Chess || (typeof Chess !== 'undefined' ? Chess : null);

  let showOverlay     = true;
  let autoPlayEnabled = false;
  let brilliantHunter = false;
  let targetDepth     = 12;
  let mistakeInterval = 0;          // 0 = Disabled, 3 = Every 3 moves, etc.
  let mistakeSeverity = 'mistake';  // 'inaccuracy' | 'mistake' | 'blunder'

  let stockfishWorker  = null;
  let lastEvaluatedFen = '';
  let isEvaluating     = false;
  let moveCounter      = 0;         // Tracks game move count for mistake scheduling
  let mpvList          = [];
  let isExecutingMove  = false;

  const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const PIECE_NAMES_ID = { p: 'Pion', n: 'Kuda', b: 'Gajah', r: 'Benteng', q: 'Menteri' };

  // Sync settings from chrome storage or popup messaging
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get({
      showOverlay: true,
      autoPlay: false,
      brilliantHunter: false,
      depth: 12,
      mistakeInterval: 0,
      mistakeSeverity: 'mistake'
    }, (res) => {
      showOverlay     = res.showOverlay;
      autoPlayEnabled = res.autoPlay;
      brilliantHunter = res.brilliantHunter;
      targetDepth     = res.depth;
      mistakeInterval = res.mistakeInterval;
      mistakeSeverity = res.mistakeSeverity;
      updateHudStatus();
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'ICHESS_SETTINGS_UPDATE' && msg.config) {
        showOverlay     = msg.config.showOverlay;
        autoPlayEnabled = msg.config.autoPlay;
        brilliantHunter = msg.config.brilliantHunter;
        targetDepth     = msg.config.depth;
        mistakeInterval = msg.config.mistakeInterval;
        mistakeSeverity = msg.config.mistakeSeverity;

        if (stockfishWorker) {
          stockfishWorker.postMessage(`setoption name MultiPV value ${brilliantHunter || mistakeInterval > 0 ? 5 : 2}`);
        }

        updateHudStatus();
        if (!showOverlay) clearOverlay();
      }
    });
  }

  // Initialize Stockfish Web Worker
  function initWorker() {
    if (stockfishWorker) return;
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

      stockfishWorker.postMessage('uci');
      stockfishWorker.postMessage('setoption name Hash value 32');
      stockfishWorker.postMessage('setoption name MultiPV value 5');
      stockfishWorker.postMessage('isready');
      console.log('[iChess Engine] Stockfish Worker v1.4 Ready');
    } catch (err) {
      console.error('[iChess Engine] Worker init failed:', err);
    }
  }

  function parseMpvLine(line) {
    const cpMatch   = line.match(/score cp (-?\d+)/);
    const mateMatch = line.match(/score mate (-?\d+)/);
    const pvMatch   = line.match(/pv\s((?:[a-h][1-8][a-h][1-8][qrbn]?\s*)+)/);
    const mpvMatch  = line.match(/multipv\s(\d+)/);

    if (!pvMatch || !mpvMatch) return;
    const rank     = parseInt(mpvMatch[1], 10);
    const pvMoves  = pvMatch[1].trim().split(/\s+/);
    const cp = cpMatch
      ? parseInt(cpMatch[1], 10)
      : mateMatch
        ? (parseInt(mateMatch[1], 10) > 0 ? 10000 : -10000)
        : 0;

    mpvList[rank - 1] = { move: pvMoves[0], cp, pvArray: pvMoves };
  }

  // HUD Status Display on Chess.com Page
  function updateHudStatus() {
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

    hud.innerHTML = `
      <div class="dot"></div>
      <div>iChess: ${statusText}</div>
    `;
  }

  // Extract FEN from Chess.com DOM / React Props
  function extractFen() {
    const board = document.querySelector('wc-chess-board, chess-board, .board');
    if (!board) return null;

    // Search React fiber tree for game object
    const reactKey = Object.keys(board).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$'));
    if (reactKey && board[reactKey]) {
      const node = board[reactKey];

      // Recursive search for getFen function in React props
      const findFenInObject = (obj, depth = 0) => {
        if (!obj || depth > 4) return null;
        if (typeof obj.getFen === 'function') return obj.getFen();
        if (typeof obj.fen === 'string') return obj.fen;

        for (const key of ['game', 'props', 'children', 'memoizedProps', 'stateNode']) {
          if (obj[key]) {
            const res = findFenInObject(obj[key], depth + 1);
            if (res) return res;
          }
        }
        return null;
      };

      const fen = findFenInObject(node);
      if (fen) return fen;
    }

    const fenAttr = board.getAttribute('data-fen');
    if (fenAttr) return fenAttr;

    return null;
  }

  // Pure Math-Based 8x8 Grid Coordinate Calculation (Works on 100% Chess.com Layouts)
  function getSquareCoordinates(board, sq) {
    if (!sq || sq.length < 2) return null;

    const rect = board.getBoundingClientRect();
    const fileIdx = sq.charCodeAt(0) - 97; // 'a' -> 0, 'h' -> 7
    const rankNum = parseInt(sq[1], 10);   // 1 .. 8

    // Check board orientation (is Black on bottom?)
    const isFlipped = board.classList.contains('flipped') ||
                      board.getAttribute('facing') === 'b' ||
                      board.getAttribute('orientation') === 'black';

    const col = isFlipped ? (7 - fileIdx) : fileIdx;
    const row = isFlipped ? (rankNum - 1) : (8 - rankNum);

    const squareWidth  = rect.width / 8;
    const squareHeight = rect.height / 8;

    const x = rect.left + (col + 0.5) * squareWidth;
    const y = rect.top  + (row + 0.5) * squareHeight;

    const leftPct = (col / 8) * 100;
    const topPct  = (row / 8) * 100;

    return { x, y, leftPct, topPct, widthPct: 12.5, heightPct: 12.5 };
  }

  // Draw overlay highlights on Chess.com Board
  function drawOverlay(fromSq, toSq, moveType = 'best', badgeText = '') {
    clearOverlay();
    if (!showOverlay) return;

    const board = document.querySelector('wc-chess-board, chess-board, .board');
    if (!board) return;

    const container = document.createElement('div');
    container.id = 'ichess-overlay-container';

    // Source Highlight
    const fromCoords = getSquareCoordinates(board, fromSq);
    if (fromCoords) {
      const fromHighlight = document.createElement('div');
      fromHighlight.className = 'ichess-highlight-box ichess-highlight-from';
      fromHighlight.style.left   = `${fromCoords.leftPct}%`;
      fromHighlight.style.top    = `${fromCoords.topPct}%`;
      fromHighlight.style.width  = `${fromCoords.widthPct}%`;
      fromHighlight.style.height = `${fromCoords.heightPct}%`;
      container.appendChild(fromHighlight);
    }

    // Target Highlight & Custom Badges
    const toCoords = getSquareCoordinates(board, toSq);
    if (toCoords) {
      const toHighlight = document.createElement('div');
      const highlightCls = moveType === 'brilliant'
        ? 'ichess-highlight-brilliant'
        : moveType === 'mistake'
          ? (mistakeSeverity === 'blunder' ? 'ichess-highlight-blunder' : 'ichess-highlight-mistake')
          : 'ichess-highlight-to';

      toHighlight.className = `ichess-highlight-box ${highlightCls}`;
      toHighlight.style.left   = `${toCoords.leftPct}%`;
      toHighlight.style.top    = `${toCoords.topPct}%`;
      toHighlight.style.width  = `${toCoords.widthPct}%`;
      toHighlight.style.height = `${toCoords.heightPct}%`;

      const badge = document.createElement('div');
      badge.className = `ichess-move-badge ${moveType}`;
      badge.innerText = badgeText || `${fromSq} ➔ ${toSq}`;
      toHighlight.appendChild(badge);

      container.appendChild(toHighlight);
    }

    board.appendChild(container);
  }

  function clearOverlay() {
    const el = document.getElementById('ichess-overlay-container');
    if (el) el.remove();
  }

  // Process Move Selection: Best Move vs Brilliant Hunter vs Scheduled Mistake Generator
  function processMoveSelection(defaultBestMove) {
    moveCounter++;
    let selectedMove = defaultBestMove;
    let moveType = 'best';
    let moveBadge = '';

    const isMistakeTurn = mistakeInterval > 0 && (moveCounter % mistakeInterval === 0);

    if (isMistakeTurn) {
      const mistakeMove = selectMistakeMove(defaultBestMove);
      if (mistakeMove) {
        selectedMove = mistakeMove;
        moveType = 'mistake';
        moveBadge = mistakeSeverity === 'blunder' ? '?? Blunder' : mistakeSeverity === 'mistake' ? '? Mistake' : '?! Inaccuracy';
      }
    } else if (brilliantHunter) {
      const fen = extractFen();
      const brilliant = detectBrilliantSacrifice(fen, defaultBestMove);
      if (brilliant.isSacrifice) {
        selectedMove = brilliant.move;
        moveType = 'brilliant';
        moveBadge = '!! Brilliant';
      }
    }

    const fromSq = selectedMove.substring(0, 2);
    const toSq   = selectedMove.substring(2, 4);

    drawOverlay(fromSq, toSq, moveType, moveBadge);

    if (autoPlayEnabled && !isExecutingMove) {
      autoPlayMove(fromSq, toSq);
    }
  }

  // Exact Brilliant Hunter Algorithm
  function detectBrilliantSacrifice(fen, defaultBest) {
    const validItems = mpvList.filter(item => item && item.move && item.move.length >= 4);
    if (validItems.length === 0) return { move: defaultBest, isSacrifice: false };

    const topCp = validItems[0].cp;
    if (topCp < -100) return { move: defaultBest, isSacrifice: false };

    const MAX_CP_DELTA = 60;
    const MIN_CP_AFTER = -80;

    let game = null;
    if (ChessCtor && fen) {
      try { game = new ChessCtor(fen); } catch { game = null; }
    }

    for (const item of validItems) {
      const cpDelta = topCp - item.cp;
      if (cpDelta > MAX_CP_DELTA) continue;
      if (item.cp < MIN_CP_AFTER) continue;

      const uci  = item.move;
      const from = uci.substring(0, 2);
      const to   = uci.substring(2, 4);

      if (game) {
        const piece = game.get(from);
        if (!piece || piece.type === 'k' || piece.type === 'p') continue;

        const attackerVal = PIECE_VALUES[piece.type] || 0;
        const targetPiece = game.get(to);
        const targetVal   = targetPiece ? (PIECE_VALUES[targetPiece.type] || 0) : 0;

        if (targetPiece && targetPiece.color !== piece.color && (attackerVal - targetVal >= 2)) {
          return { move: uci, isSacrifice: true };
        }

        if (!targetPiece) {
          try {
            const clone = new ChessCtor(game.fen());
            const res = clone.move({ from, to, promotion: uci[4] ?? 'q' });
            if (res) {
              const oppMoves = clone.moves({ verbose: true });
              const canRecaptureCheaply = oppMoves.some(
                om => om.to === to && (PIECE_VALUES[om.piece] || 0) < attackerVal,
              );
              if (canRecaptureCheaply) {
                return { move: uci, isSacrifice: true };
              }
            }
          } catch { /* ignore */ }
        }
      }
    }

    return { move: defaultBest, isSacrifice: false };
  }

  // Select a suboptimal move for the Mistake Generator
  function selectMistakeMove(defaultBest) {
    const validItems = mpvList.filter(item => item && item.move && item.move.length >= 4);
    if (validItems.length <= 1) return defaultBest;

    const topCp = validItems[0].cp;
    const targetLoss = mistakeSeverity === 'blunder' ? 450 : mistakeSeverity === 'mistake' ? 250 : 120;

    for (let i = 1; i < validItems.length; i++) {
      const item = validItems[i];
      const loss = topCp - item.cp;
      if (loss >= targetLoss - 100) {
        return item.move;
      }
    }

    return validItems[1]?.move || defaultBest;
  }

  // Dual Execution: Try Direct React Game Move + Math-based Pointer Event Fallback
  function autoPlayMove(fromSq, toSq) {
    const board = document.querySelector('wc-chess-board, chess-board, .board');
    if (!board) return;

    isExecutingMove = true;

    // Method A: Direct Internal Game Object Execution (Instant & 100% Reliable)
    const reactKey = Object.keys(board).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$'));
    if (reactKey && board[reactKey]) {
      const findGameObj = (obj, depth = 0) => {
        if (!obj || depth > 4) return null;
        if (typeof obj.move === 'function' || typeof obj.userMove === 'function' || typeof obj.makeMove === 'function') return obj;
        for (const key of ['game', 'props', 'children', 'memoizedProps']) {
          if (obj[key]) {
            const res = findGameObj(obj[key], depth + 1);
            if (res) return res;
          }
        }
        return null;
      };

      const gameObj = findGameObj(board[reactKey]);
      if (gameObj) {
        try {
          if (typeof gameObj.userMove === 'function') {
            gameObj.userMove(fromSq + toSq);
            isExecutingMove = false;
            return;
          } else if (typeof gameObj.move === 'function') {
            gameObj.move({ from: fromSq, to: toSq, promotion: 'q' });
            isExecutingMove = false;
            return;
          }
        } catch (err) {
          console.log('[iChess Engine] Direct move fallback to pointer click...');
        }
      }
    }

    // Method B: Screen Coordinate Pointer Event Clicking
    const fromCoords = getSquareCoordinates(board, fromSq);
    const toCoords   = getSquareCoordinates(board, toSq);

    if (!fromCoords || !toCoords) {
      isExecutingMove = false;
      return;
    }

    // Human reaction delay (400ms - 750ms)
    const delay = Math.floor(Math.random() * 350) + 400;

    setTimeout(() => {
      dispatchClickAtCoords(fromCoords.x, fromCoords.y);
      setTimeout(() => {
        dispatchClickAtCoords(toCoords.x, toCoords.y);
        isExecutingMove = false;
      }, 150);
    }, delay);
  }

  function dispatchClickAtCoords(x, y) {
    const el = document.elementFromPoint(x, y) || document.body;

    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0,
      pointerId: 1,
      isPrimary: true
    };

    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }

  function scanBoard() {
    initWorker();
    updateHudStatus();

    const fen = extractFen();
    if (fen && fen !== lastEvaluatedFen && !isEvaluating) {
      lastEvaluatedFen = fen;
      isEvaluating = true;
      mpvList = [];
      stockfishWorker.postMessage(`position fen ${fen}`);
      stockfishWorker.postMessage(`go depth ${targetDepth}`);
    }
  }

  setInterval(scanBoard, 600);

})();

// extension/main-world.js — v4.0: Prototype Interceptor & Native Game Hook

(function () {
  'use strict';

  console.log('[iChess Main-World Engine] v4.0 Prototype Interceptor Initializing at document_start');

  window.__iChessBoardInstance = null;
  window.__iChessGameController = null;

  // 1. Hook customElements.define to catch wc-chess-board prototype upon registration
  const origDefine = window.customElements ? window.customElements.define.bind(window.customElements) : null;
  if (origDefine) {
    window.customElements.define = function (name, constructor, options) {
      if (name === 'wc-chess-board' || name === 'chess-board') {
        console.log('[iChess Main-World] Intercepted wc-chess-board customElement definition');
        const origConnected = constructor.prototype.connectedCallback;
        constructor.prototype.connectedCallback = function () {
          window.__iChessBoardInstance = this;
          if (this.game) window.__iChessGameController = this.game;
          console.log('[iChess Main-World] Captured active wc-chess-board instance & game controller');
          return origConnected ? origConnected.apply(this, arguments) : undefined;
        };
      }
      return origDefine(name, constructor, options);
    };
  }

  // Helper to retrieve active board element
  function getBoardElement() {
    return window.__iChessBoardInstance || document.querySelector('wc-chess-board, chess-board, .board');
  }

  // Helper to retrieve active game controller instance
  function getGameController() {
    if (window.__iChessGameController) return window.__iChessGameController;

    const board = getBoardElement();
    if (!board) return null;

    if (board.game) {
      window.__iChessGameController = board.game;
      return board.game;
    }
    if (board.controller) {
      window.__iChessGameController = board.controller;
      return board.controller;
    }

    // React Fiber & Props Traversal
    for (const key in board) {
      if (key.startsWith('__reactProps$') || key.startsWith('__reactFiber$')) {
        const val = board[key];
        if (val?.game) { window.__iChessGameController = val.game; return val.game; }
        if (val?.memoizedProps?.game) { window.__iChessGameController = val.memoizedProps.game; return val.memoizedProps.game; }
        if (val?.child?.memoizedProps?.game) { window.__iChessGameController = val.child.memoizedProps.game; return val.child.memoizedProps.game; }
        if (val?.return?.memoizedProps?.game) { window.__iChessGameController = val.return.memoizedProps.game; return val.return.memoizedProps.game; }
      }
    }

    if (window.chesscom?.game) { window.__iChessGameController = window.chesscom.game; return window.chesscom.game; }
    if (window.game) { window.__iChessGameController = window.game; return window.game; }

    return null;
  }

  // Listen for execution and reset requests from content script
  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'ICHESS_EXECUTE_MOVE') {
      const { from, to, promotion } = event.data;
      if (!from || !to) return;

      const board = getBoardElement();
      const game  = getGameController();
      let moveExecuted = false;

      // 1. Direct Native Method Call
      if (game) {
        const uci = from + to + (promotion || '');
        const obj = { from, to, promotion: promotion || 'q' };

        try {
          if (typeof game.makeMove === 'function') {
            game.makeMove(uci);
            moveExecuted = true;
          } else if (typeof game.move === 'function') {
            game.move(obj);
            moveExecuted = true;
          } else if (typeof game.playMove === 'function') {
            game.playMove(obj);
            moveExecuted = true;
          }
        } catch (err) {
          console.warn('[iChess Main-World] Native game move call error:', err);
        }
      }

      // 2. Direct Synthetic Pointer/Mouse Events on Board as Fallback
      if (!moveExecuted && board) {
        const fromCoords = getSqCoords(board, from);
        const toCoords   = getSqCoords(board, to);

        if (fromCoords && toCoords) {
          dispatchBoardClick(board, fromCoords.x, fromCoords.y);
          setTimeout(() => {
            dispatchBoardClick(board, toCoords.x, toCoords.y);
          }, 120);
        }
      }
    } else if (event.data.type === 'ICHESS_MAIN_RESET_GAME') {
      const rematchBtns = document.querySelectorAll(
        'button[data-cy="new-game-button"], .game-over-button, .ui_v5-button-component.ui_v5-button-primary, button.rematch-button, .game-controls-button'
      );
      rematchBtns.forEach(btn => {
        if (btn && typeof btn.click === 'function') {
          try { btn.click(); } catch { /* ignore */ }
        }
      });
    }
  });

  function getSqCoords(board, sq) {
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
      y: rect.top  + (row + 0.5) * sh
    };
  }

  function dispatchBoardClick(board, x, y) {
    const target = document.elementFromPoint(x, y) || board;
    const opts = {
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

    [target, board].forEach(el => {
      if (!el) return;
      try {
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown',    opts));
        el.dispatchEvent(new PointerEvent('pointerup',   opts));
        el.dispatchEvent(new MouseEvent('mouseup',      opts));
        el.dispatchEvent(new MouseEvent('click',        opts));
      } catch { /* ignore */ }
    });
  }

})();

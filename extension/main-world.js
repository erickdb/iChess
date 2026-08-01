// extension/main-world.js — v3.3: Main World Injection & Native Chess.com Game Controller

(function () {
  'use strict';

  console.log('[iChess Main-World Engine] v3.3 Main World Injector Active');

  function getBoardElement() {
    return document.querySelector('wc-chess-board, chess-board, .board');
  }

  function getGameController() {
    const board = getBoardElement();
    if (!board) return null;

    if (board.game) return board.game;
    if (board.controller) return board.controller;
    if (board._game) return board._game;

    // React Fiber & Props Traversal
    for (const key in board) {
      if (key.startsWith('__reactProps$') || key.startsWith('__reactFiber$')) {
        const val = board[key];
        if (val?.game) return val.game;
        if (val?.memoizedProps?.game) return val.memoizedProps.game;
        if (val?.child?.memoizedProps?.game) return val.child.memoizedProps.game;
        if (val?.return?.memoizedProps?.game) return val.return.memoizedProps.game;
      }
    }

    if (window.chesscom?.game) return window.chesscom.game;
    if (window.game) return window.game;

    return null;
  }

  // Native Move Execution & Simulated Click Handler
  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'ICHESS_EXECUTE_MOVE') {
      const { from, to, promotion } = event.data;
      if (!from || !to) return;

      const board = getBoardElement();
      const game  = getGameController();
      let moveExecuted = false;

      // 1. Try Native JS Game Controller Method
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
          console.warn('[iChess Main-World] Native game move error:', err);
        }
      }

      // 2. Dispatch Direct Native Pointer/Mouse Events on Board as Fallback
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

// extension/main-world.js — v3.2: Main World Bridge Controller for Chess.com

(function () {
  'use strict';

  console.log('[iChess Main-World Engine] Main world bridge v3.2 initialized on Chess.com');

  function getBoardElement() {
    return document.querySelector('wc-chess-board, chess-board, .board');
  }

  function getGameController() {
    const board = getBoardElement();
    if (!board) return null;

    if (board.game) return board.game;
    if (board.controller) return board.controller;
    if (board._game) return board._game;

    return null;
  }

  // Listen for execution and reset requests from content script
  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'ICHESS_EXECUTE_MOVE') {
      const { from, to, promotion } = event.data;
      if (!from || !to) return;

      const game = getGameController();
      let moveSuccess = false;

      if (game) {
        const moveUci = from + to + (promotion || '');
        const moveObj = { from, to, promotion: promotion || 'q' };

        try {
          if (typeof game.makeMove === 'function') {
            game.makeMove(moveUci);
            moveSuccess = true;
          } else if (typeof game.move === 'function') {
            game.move(moveObj);
            moveSuccess = true;
          } else if (typeof game.playMove === 'function') {
            game.playMove(moveObj);
            moveSuccess = true;
          }
        } catch (err) {
          console.warn('[iChess Main-World] game.makeMove call failed:', err);
        }
      }

      window.postMessage({
        type: 'ICHESS_MOVE_RESULT',
        success: moveSuccess,
        from,
        to
      }, '*');
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

})();

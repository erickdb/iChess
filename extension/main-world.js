// extension/main-world.js — Runs in Chess.com Main JS World
// Provides direct access to board.game controller for 100% accurate FEN and native move execution

(function () {
  'use strict';

  console.log('[iChess Main-World Engine] Main world bridge initialized on Chess.com');

  function getBoardElement() {
    return document.querySelector('wc-chess-board, chess-board, .board');
  }

  function getGameController() {
    const board = getBoardElement();
    if (!board) return null;
    return board.game || board.controller || null;
  }

  // Listen for move execution requests from isolated content script
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

        // Attempt 1: Direct game.makeMove / game.move / game.playMove API
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
          console.warn('[iChess Main-World] game.makeMove direct call failed, falling back...', err);
        }
      }

      // Send result back to content script
      window.postMessage({
        type: 'ICHESS_MOVE_RESULT',
        success: moveSuccess,
        from,
        to
      }, '*');
    }
  });

  // Periodically broadcast main world FEN if game object exists
  setInterval(() => {
    const game = getGameController();
    if (game) {
      let fen = null;
      try {
        if (typeof game.getFen === 'function') fen = game.getFen();
        else if (typeof game.fen === 'string') fen = game.fen;
        else if (typeof game.getFEN === 'function') fen = game.getFEN();
      } catch { /* ignore */ }

      if (fen) {
        window.postMessage({ type: 'ICHESS_MAIN_WORLD_FEN', fen }, '*');
      }
    }
  }, 300);

})();

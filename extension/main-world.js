// extension/main-world.js — v4.5: Direct Game Object Broadcaster

(function () {
  'use strict';

  console.log('[iChess Main-World Engine] v4.5 Main World Injector Initializing');

  window.__iChessBoardInstance = null;
  window.__iChessGameController = null;

  // Intercept customElement definition
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

  function getBoardElement() {
    return window.__iChessBoardInstance || document.querySelector('wc-chess-board, chess-board, .board');
  }

  function getGameController() {
    if (window.__iChessGameController) return window.__iChessGameController;

    const board = getBoardElement();
    if (!board) return null;

    if (board.game) { window.__iChessGameController = board.game; return board.game; }
    if (board.controller) { window.__iChessGameController = board.controller; return board.controller; }

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

  // Broadcast FEN safely from live game controller
  setInterval(() => {
    const game = getGameController();
    if (game) {
      let fen = null;
      try {
        if (typeof game.getFen === 'function') fen = game.getFen();
        else if (typeof game.fen === 'string') fen = game.fen;
        else if (typeof game.getFEN === 'function') fen = game.getFEN();
        else if (game.getFEN) fen = game.getFEN();
      } catch { /* ignore */ }

      if (fen) {
        window.postMessage({ type: 'ICHESS_GAME_CONTROLLER_FEN', fen }, '*');
      }
    }
  }, 250);

  // Listen for reset requests
  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'ICHESS_MAIN_RESET_GAME') {
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

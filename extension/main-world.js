// extension/main-world.js — v4.9: Prototype Interceptor & Reset Game Bridge

(function () {
  'use strict';

  console.log('[iChess Main-World Engine] v4.9 Main World Injector Initializing');

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

  // Listen for reset requests from content script
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

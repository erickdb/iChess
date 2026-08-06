// extension/main-world.js — v5.0: Board Interceptor + Stockfish Engine Host
// Runs in MAIN world (page context) — can host Stockfish worker without CSP issues

(function () {
  'use strict';

  // Shared debug flag with content.js — toggle: __iChess.debug = true
  window.__iChess = window.__iChess || { debug: false };
  const log   = (...a) => window.__iChess.debug && console.log(...a);
  const error = (...a) => window.__iChess.debug && console.error(...a);

  log('[iChess Main-World] v5.0 Initializing — Board Interceptor + Engine Host');

  window.__iChessBoardInstance = null;
  window.__iChessGameController = null;

  // ─── Board Interceptor ──────────────────────────────────────────────────────

  const origDefine = window.customElements ? window.customElements.define.bind(window.customElements) : null;
  if (origDefine) {
    window.customElements.define = function (name, constructor, options) {
      if (name === 'wc-chess-board' || name === 'chess-board') {
        log('[iChess Main-World] Intercepted wc-chess-board customElement definition');
        const origConnected = constructor.prototype.connectedCallback;
        constructor.prototype.connectedCallback = function () {
          window.__iChessBoardInstance = this;
          if (this.game) window.__iChessGameController = this.game;
          log('[iChess Main-World] Captured active wc-chess-board instance & game controller');
          return origConnected ? origConnected.apply(this, arguments) : undefined;
        };
      }
      return origDefine(name, constructor, options);
    };
  }

  // ─── Stockfish Engine Host ──────────────────────────────────────────────────
  // Hosted in MAIN world (chess.com origin) so workers are same-origin
  // Communication: window.postMessage ↔ content.js (isolated world)

  let sfWorker = null;
  let sfReady = false;
  let sfLoading = false;
  const cmdQueue = []; // buffer commands that arrive before Stockfish is ready

  function flushQueue() {
    while (cmdQueue.length > 0 && sfWorker) {
      sfWorker.postMessage(cmdQueue.shift());
    }
  }

  function initStockfish(sfUrl) {
    if (sfWorker || sfLoading) return;
    sfLoading = true;

    log('[iChess Main-World] Initializing Stockfish from:', sfUrl);

    // fetch+blob: blob:https://www.chess.com/... satisfies worker-src CSP
    fetch(sfUrl)
      .then(res => {
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        sfWorker = new Worker(blobUrl);
        let blobRevoked = false;

        sfWorker.onmessage = (e) => {
          const line = typeof e.data === 'string'
            ? e.data
            : (e.data?.data || e.data?.text || e.data?.line || e.data?.message || '');

          if (!line) return;

          // Revoke blob URL after worker confirms alive — safe at this point
          if (!blobRevoked && (line === 'uciok' || line === 'readyok')) {
            URL.revokeObjectURL(blobUrl);
            blobRevoked = true;
            sfReady = true;
            sfLoading = false;
            log('[iChess Main-World] Stockfish engine ready:', line);
          }

          // Forward every Stockfish line to content.js
          window.postMessage({ type: 'ICHESS_SF_LINE', line, source: 'ichess-engine' }, '*');
        };

        sfWorker.onerror = (err) => {
          error('[iChess Main-World] Stockfish worker error:', err.message);
          sfWorker = null;
          sfReady = false;
          sfLoading = false;
        };

        log('[iChess Main-World] Stockfish worker spawned — flushing', cmdQueue.length, 'queued commands');
        // Flush any UCI commands that arrived while we were loading
        flushQueue();
      })
      .catch(err => {
        error('[iChess Main-World] Failed to load Stockfish:', err);
        sfWorker = null;
        sfLoading = false;
      });
  }

  function sendToEngine(cmd) {
    if (sfWorker) {
      try {
        sfWorker.postMessage(cmd);
      } catch (e) {
        error('[iChess Main-World] sendToEngine error:', e);
      }
    } else {
      // Worker not ready yet — queue the command
      cmdQueue.push(cmd);
      log('[iChess Main-World] Engine loading, queued cmd:', cmd);
    }
  }

  // ─── Message Bridge ─────────────────────────────────────────────────────────

  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;

    // Guard: only handle messages from our content script (same window)
    const { type, source } = event.data;
    if (source === 'ichess-engine') return; // don't echo back our own messages

    switch (type) {
      // Content.js → MAIN: initialize Stockfish with the extension URL
      case 'ICHESS_INIT_ENGINE':
        initStockfish(event.data.sfUrl);
        break;

      // Content.js → MAIN: forward command to Stockfish
      case 'ICHESS_SF_CMD':
        sendToEngine(event.data.cmd);
        break;

      // Content.js → MAIN: reset game button click
      case 'ICHESS_MAIN_RESET_GAME': {
        const rematchBtns = document.querySelectorAll(
          'button[data-cy="new-game-button"], .game-over-button, .ui_v5-button-component.ui_v5-button-primary, button.rematch-button, .game-controls-button'
        );
        rematchBtns.forEach(btn => {
          if (btn && typeof btn.click === 'function') {
            try { btn.click(); } catch { /* ignore */ }
          }
        });
        break;
      }
    }
  });

})();

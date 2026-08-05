// extension/background.js — v5.0: Background Service Worker Engine Manager
// Runs in extension origin — can create Workers freely, no Chess.com CSP restriction

'use strict';

console.log('[iChess BG] Background service worker started');

let stockfishWorker = null;
let activeTabId = null;

// ─── Stockfish Engine ───────────────────────────────────────────────────────

function getEngine() {
  if (stockfishWorker) return stockfishWorker;

  try {
    // Background origin = chrome-extension://<id>/ — no CSP restrictions here
    const sfUrl = chrome.runtime.getURL('stockfish.js');
    stockfishWorker = new Worker(sfUrl);

    stockfishWorker.onmessage = (e) => {
      const line = typeof e.data === 'string'
        ? e.data
        : (e.data?.data || e.data?.text || e.data?.line || e.data?.message || '');

      if (!line) return;

      // Forward every Stockfish output line to the active chess.com tab
      if (activeTabId !== null) {
        chrome.tabs.sendMessage(activeTabId, {
          type: 'ICHESS_SF_LINE',
          line
        }).catch(() => {
          // Tab may have closed — reset
          activeTabId = null;
        });
      }
    };

    stockfishWorker.onerror = (err) => {
      console.error('[iChess BG] Stockfish worker error:', err.message);
      stockfishWorker = null; // allow re-init on next command
    };

    console.log('[iChess BG] Stockfish worker created successfully');
  } catch (err) {
    console.error('[iChess BG] Failed to create Stockfish worker:', err);
  }

  return stockfishWorker;
}

// ─── Message Handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender) => {
  // Content script → background: send command to Stockfish
  if (msg.type === 'ICHESS_SF_CMD') {
    const tabId = sender.tab?.id;
    if (tabId != null) activeTabId = tabId;

    const engine = getEngine();
    if (engine) {
      try {
        engine.postMessage(msg.cmd);
      } catch (err) {
        console.error('[iChess BG] postMessage failed:', err);
        stockfishWorker = null; // force re-init
      }
    }
    return false;
  }

  // Popup → background: relay settings update to tab
  if (msg.type === 'ICHESS_SETTINGS_UPDATE' || msg.type === 'ICHESS_RESET_GAME') {
    if (activeTabId !== null) {
      chrome.tabs.sendMessage(activeTabId, msg).catch(() => {});
    }
    return false;
  }
});

// Keep service worker alive while a chess.com tab is active
chrome.tabs.onActivated.addListener((info) => {
  chrome.tabs.get(info.tabId, (tab) => {
    if (tab?.url?.includes('chess.com')) {
      activeTabId = info.tabId;
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    activeTabId = null;
  }
});

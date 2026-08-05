// extension/popup.js — Manages settings and live synchronization with content script

document.addEventListener('DOMContentLoaded', async () => {
  const toggleOverlay    = document.getElementById('toggleOverlay');
  const toggleBrilliant  = document.getElementById('toggleBrilliant');
  const depthSelect      = document.getElementById('depthSelect');
  const btnResetGame     = document.getElementById('btnResetGame');

  const settings = await chrome.storage.local.get({
    showOverlay: true,
    brilliantHunter: true,
    depth: 6
  });

  toggleOverlay.checked   = settings.showOverlay;
  toggleBrilliant.checked = settings.brilliantHunter;
  depthSelect.value       = String(settings.depth);

  function sendTabMessage(msg) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {});
      }
    });
  }

  function syncSettings() {
    const config = {
      showOverlay: toggleOverlay.checked,
      brilliantHunter: toggleBrilliant.checked,
      depth: parseInt(depthSelect.value, 10)
    };

    chrome.storage.local.set(config);
    sendTabMessage({ type: 'ICHESS_SETTINGS_UPDATE', config });
  }

  toggleOverlay.addEventListener('change', syncSettings);
  toggleBrilliant.addEventListener('change', syncSettings);
  depthSelect.addEventListener('change', syncSettings);

  if (btnResetGame) {
    btnResetGame.addEventListener('click', () => {
      sendTabMessage({ type: 'ICHESS_RESET_GAME' });
      btnResetGame.innerText = '✅ Reset Done';
      setTimeout(() => { btnResetGame.innerText = '🔄 Reset Game / Rematch'; }, 1500);
    });
  }
});

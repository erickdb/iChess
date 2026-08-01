// extension/popup.js — Manages settings and live synchronization with content script

document.addEventListener('DOMContentLoaded', async () => {
  const toggleOverlay    = document.getElementById('toggleOverlay');
  const toggleAutoPlay   = document.getElementById('toggleAutoPlay');
  const toggleBrilliant  = document.getElementById('toggleBrilliant');
  const depthSelect      = document.getElementById('depthSelect');
  const mistakeInterval  = document.getElementById('mistakeInterval');
  const mistakeSeverity  = document.getElementById('mistakeSeverity');

  // Load saved settings
  const settings = await chrome.storage.local.get({
    showOverlay: true,
    autoPlay: false,
    brilliantHunter: false,
    depth: 12,
    mistakeInterval: 0,
    mistakeSeverity: 'mistake'
  });

  toggleOverlay.checked   = settings.showOverlay;
  toggleAutoPlay.checked  = settings.autoPlay;
  toggleBrilliant.checked = settings.brilliantHunter;
  depthSelect.value       = String(settings.depth);
  mistakeInterval.value   = String(settings.mistakeInterval);
  mistakeSeverity.value   = settings.mistakeSeverity;

  function syncSettings() {
    const config = {
      showOverlay: toggleOverlay.checked,
      autoPlay: toggleAutoPlay.checked,
      brilliantHunter: toggleBrilliant.checked,
      depth: parseInt(depthSelect.value, 10),
      mistakeInterval: parseInt(mistakeInterval.value, 10),
      mistakeSeverity: mistakeSeverity.value
    };

    chrome.storage.local.set(config);

    // Notify active tab on Chess.com
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'ICHESS_SETTINGS_UPDATE', config }).catch(() => {});
      }
    });
  }

  toggleOverlay.addEventListener('change', syncSettings);
  toggleAutoPlay.addEventListener('change', syncSettings);
  toggleBrilliant.addEventListener('change', syncSettings);
  depthSelect.addEventListener('change', syncSettings);
  mistakeInterval.addEventListener('change', syncSettings);
  mistakeSeverity.addEventListener('change', syncSettings);
});

/**
 * LinkedIn Rich Post — Popup Script
 *
 * Manages the enable/disable toggle and displays stats from the
 * content script via chrome.storage.local.
 */

(function () {
  'use strict';

  const toggle = document.getElementById('toggleEnabled');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const charCount = document.getElementById('charCount');

  // ─── Load current state ───
  chrome.storage.local.get(['lrpEnabled', 'lrpCharCount'], (result) => {
    const enabled = result.lrpEnabled !== false; // Default: enabled
    toggle.checked = enabled;
    updateStatusUI(enabled);

    // Character count
    if (typeof result.lrpCharCount === 'number') {
      charCount.textContent = result.lrpCharCount.toLocaleString();
    }
  });

  // ─── Toggle handler ───
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.local.set({ lrpEnabled: enabled });
    updateStatusUI(enabled);
  });

  // ─── Listen for live char count updates ───
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.lrpCharCount) {
      charCount.textContent =
        (changes.lrpCharCount.newValue || 0).toLocaleString();
    }
  });

  function updateStatusUI(enabled) {
    if (enabled) {
      statusDot.classList.remove('disabled');
      statusText.textContent = 'Active on LinkedIn';
    } else {
      statusDot.classList.add('disabled');
      statusText.textContent = 'Disabled';
    }
  }
})();

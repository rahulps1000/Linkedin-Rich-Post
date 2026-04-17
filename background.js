// Background service worker for LinkedIn Rich Post extension

// Set initial state on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ enabled: true });
  updateBadge(true);
});

// Listen for toggle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOGGLE_EXTENSION') {
    const enabled = message.enabled;
    chrome.storage.local.set({ enabled });
    updateBadge(enabled);

    // Notify all LinkedIn tabs
    chrome.tabs.query({ url: 'https://www.linkedin.com/*' }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_EXTENSION', enabled }).catch(() => {});
      });
    });

    sendResponse({ success: true });
  }

  if (message.type === 'GET_STATE') {
    chrome.storage.local.get('enabled', (data) => {
      sendResponse({ enabled: data.enabled !== false });
    });
    return true; // async response
  }
});

// Update badge text and color
function updateBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? 'ON' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({
    color: enabled ? '#0a66c2' : '#666666',
  });
  chrome.action.setBadgeTextColor({
    color: '#ffffff',
  });
}

// Restore badge on startup
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get('enabled', (data) => {
    updateBadge(data.enabled !== false);
  });
});

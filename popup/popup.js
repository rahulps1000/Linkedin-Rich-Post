// Popup script for LinkedIn Rich Post extension

const toggleSwitch = document.getElementById('toggleSwitch');
const statusText = document.getElementById('statusText');

// Load current state
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
  if (response) {
    const enabled = response.enabled !== false;
    toggleSwitch.checked = enabled;
    updateStatusUI(enabled);
  }
});

// Handle toggle
toggleSwitch.addEventListener('change', () => {
  const enabled = toggleSwitch.checked;
  chrome.runtime.sendMessage({ type: 'TOGGLE_EXTENSION', enabled });
  updateStatusUI(enabled);
});

function updateStatusUI(enabled) {
  statusText.textContent = enabled ? 'Active' : 'Disabled';
  statusText.classList.toggle('disabled', !enabled);
}

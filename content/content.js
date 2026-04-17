/**
 * LinkedIn Rich Post — Content Script
 *
 * Observes LinkedIn's DOM for text input areas (post composer, comments, DMs)
 * and injects a floating formatting toolbar that converts selected text to
 * Unicode-styled characters.
 *
 * LinkedIn DOM structure (April 2026):
 * - Post composer: inside Shadow DOM at #interop-outlet → .ql-editor[contenteditable="true"]
 * - Comments: .tiptap.ProseMirror[contenteditable="true"][role="textbox"]
 * - DMs: contenteditable div in messaging overlay
 */

(() => {
  'use strict';

  // ── State ───────────────────────────────────────────────────────

  let extensionEnabled = true;
  let activeEditor = null;
  let toolbar = null;
  let mainObserver = null;
  let shadowObservers = [];
  let scanInterval = null;

  // ── Initialization ──────────────────────────────────────────────

  function init() {
    console.log('[LRP] Initializing LinkedIn Rich Post...');

    chrome.storage.local.get('enabled', (data) => {
      extensionEnabled = data.enabled !== false;
      if (extensionEnabled) {
        activate();
      }
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'TOGGLE_EXTENSION') {
        extensionEnabled = message.enabled;
        if (extensionEnabled) {
          activate();
        } else {
          deactivate();
        }
      }
    });
  }

  function activate() {
    console.log('[LRP] Activating...');
    observeDOM();
    startPeriodicScan();
    listenForFocus();
  }

  function deactivate() {
    console.log('[LRP] Deactivating...');
    stopPeriodicScan();
    disconnectObservers();
    removeToolbar();
  }

  // ── Editor Detection ────────────────────────────────────────────

  /**
   * Check if an element is a LinkedIn text editor we want to enhance.
   */
  function isLinkedInEditor(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (el.getAttribute('contenteditable') !== 'true') return false;
    if (el.dataset.lrpIgnore) return false;

    // Positive signals
    const role = el.getAttribute('role');
    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
    const classList = el.className || '';

    // Post composer (Quill editor inside shadow DOM)
    if (classList.includes('ql-editor')) return true;

    // Comment editor (Tiptap/ProseMirror)
    if (classList.includes('ProseMirror')) return true;
    if (classList.includes('tiptap')) return true;

    // Generic textbox role with content-creation aria labels
    if (role === 'textbox') {
      if (ariaLabel.includes('editor') || ariaLabel.includes('content') ||
          ariaLabel.includes('comment') || ariaLabel.includes('message') ||
          ariaLabel.includes('post') || ariaLabel.includes('talk about')) {
        return true;
      }
    }

    // Messaging input
    if (classList.includes('msg-form__contenteditable')) return true;

    // Negative signals — skip search boxes, name fields, etc.
    if (ariaLabel.includes('search')) return false;
    if (el.closest && el.closest('[role="searchbox"], [role="combobox"], .search-global-typeahead')) return false;

    // Generic contenteditable with textbox role on LinkedIn — likely an editor
    if (role === 'textbox') return true;

    return false;
  }

  /**
   * Find all LinkedIn editors in a given root (document, shadow root, etc).
   */
  function findEditorsIn(root) {
    const results = [];
    if (!root) return results;

    try {
      // Look for contenteditable elements
      const candidates = root.querySelectorAll('[contenteditable="true"]');
      candidates.forEach((el) => {
        if (isLinkedInEditor(el)) results.push(el);
      });
    } catch (e) {}

    return results;
  }

  /**
   * Traverse into shadow DOMs to find editors.
   */
  function findEditorsDeep(root) {
    const results = findEditorsIn(root);

    // Find shadow hosts and recurse
    try {
      const allElements = root.querySelectorAll('*');
      for (const el of allElements) {
        if (el.shadowRoot) {
          const shadowEditors = findEditorsDeep(el.shadowRoot);
          results.push(...shadowEditors);
        }
      }
    } catch (e) {}

    return results;
  }

  /**
   * Full scan: find all editors across the entire document, including shadow DOMs.
   */
  function scanForEditors() {
    if (!extensionEnabled) return;

    const editors = findEditorsDeep(document);

    // Also specifically check #interop-outlet (LinkedIn's shadow DOM container)
    const interop = document.getElementById('interop-outlet');
    if (interop && interop.shadowRoot) {
      const interopEditors = findEditorsDeep(interop.shadowRoot);
      for (const ed of interopEditors) {
        if (!editors.includes(ed)) editors.push(ed);
      }
    }

    editors.forEach((editor) => attachToEditor(editor));
  }

  // ── DOM Observation ─────────────────────────────────────────────

  function observeDOM() {
    if (mainObserver) return;

    // Observe the main document for new nodes
    mainObserver = new MutationObserver(handleMutations);
    mainObserver.observe(document.body, { childList: true, subtree: true });

    // Also observe #interop-outlet shadow root if available
    observeInteropOutlet();
  }

  function observeInteropOutlet() {
    const interop = document.getElementById('interop-outlet');
    if (interop && interop.shadowRoot) {
      const obs = new MutationObserver(handleMutations);
      obs.observe(interop.shadowRoot, { childList: true, subtree: true });
      shadowObservers.push(obs);
      console.log('[LRP] Observing #interop-outlet shadow root');
    }
  }

  function handleMutations(mutations) {
    if (!extensionEnabled) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        // Direct check
        if (isLinkedInEditor(node)) {
          attachToEditor(node);
        }

        // Check children
        try {
          node.querySelectorAll('[contenteditable="true"]').forEach((el) => {
            if (isLinkedInEditor(el)) attachToEditor(el);
          });
        } catch (e) {}

        // If it has a shadow root, observe it and scan inside
        if (node.shadowRoot) {
          const obs = new MutationObserver(handleMutations);
          obs.observe(node.shadowRoot, { childList: true, subtree: true });
          shadowObservers.push(obs);
          findEditorsDeep(node.shadowRoot).forEach((ed) => attachToEditor(ed));
        }

        // Check if interop-outlet was just added
        if (node.id === 'interop-outlet' && node.shadowRoot) {
          observeInteropOutlet();
          findEditorsDeep(node.shadowRoot).forEach((ed) => attachToEditor(ed));
        }
      }
    }
  }

  function disconnectObservers() {
    if (mainObserver) {
      mainObserver.disconnect();
      mainObserver = null;
    }
    shadowObservers.forEach((obs) => obs.disconnect());
    shadowObservers = [];
  }

  // ── Periodic Scan ───────────────────────────────────────────────

  function startPeriodicScan() {
    if (scanInterval) return;
    scanForEditors();
    scanInterval = setInterval(scanForEditors, 2000);
  }

  function stopPeriodicScan() {
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
  }

  // ── Focus Listener ──────────────────────────────────────────────

  function listenForFocus() {
    // Capture phase so we catch events from shadow DOM that bubble
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('click', onDocClick, true);
  }

  function onFocusIn(e) {
    if (!extensionEnabled) return;
    const target = e.target;
    if (isLinkedInEditor(target)) {
      attachToEditor(target);
      activeEditor = target;
      showToolbar(target);
    }
  }

  function onDocClick(e) {
    if (!extensionEnabled) return;

    // Check composed path for events from shadow DOM
    const path = e.composedPath ? e.composedPath() : [e.target];
    for (const el of path) {
      if (el.nodeType === Node.ELEMENT_NODE && isLinkedInEditor(el)) {
        attachToEditor(el);
        activeEditor = el;
        showToolbar(el);
        return;
      }
    }
  }

  // ── Toolbar Attachment ──────────────────────────────────────────

  function attachToEditor(editor) {
    if (!editor || editor.dataset.lrpAttached) return;
    editor.dataset.lrpAttached = 'true';

    console.log('[LRP] ✓ Attached to editor:', {
      tag: editor.tagName,
      class: editor.className,
      ariaLabel: editor.getAttribute('aria-label'),
    });

    editor.addEventListener('focus', () => {
      if (!extensionEnabled) return;
      activeEditor = editor;
      showToolbar(editor);
    });

    editor.addEventListener('blur', () => {
      setTimeout(() => {
        if (toolbar && toolbar.contains(document.activeElement)) return;
        if (document.activeElement === editor) return;
        hideToolbar();
      }, 200);
    });

    editor.addEventListener('click', () => {
      if (!extensionEnabled) return;
      activeEditor = editor;
      if (!toolbar || !toolbar.classList.contains('lrp-visible')) {
        showToolbar(editor);
      }
    });

    // If already focused, show immediately
    if (document.activeElement === editor ||
        (editor.getRootNode() && editor.getRootNode().activeElement === editor)) {
      activeEditor = editor;
      showToolbar(editor);
    }
  }

  // ── Toolbar UI ──────────────────────────────────────────────────

  function createToolbar() {
    if (toolbar) return toolbar;

    toolbar = document.createElement('div');
    toolbar.className = 'lrp-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'LinkedIn Rich Post formatting');
    toolbar.dataset.lrpIgnore = 'true';

    // Prevent focus steal
    toolbar.addEventListener('mousedown', (e) => e.preventDefault());

    const buttons = [
      { id: 'bold',          label: '𝗕',  tooltip: 'Bold' },
      { id: 'italic',        label: '𝘐',  tooltip: 'Italic' },
      { id: 'bolditalic',    label: '𝘽𝙄', tooltip: 'Bold Italic' },
      { id: 'underline',     label: 'U̲',  tooltip: 'Underline' },
      { id: 'strikethrough', label: 'S̶',  tooltip: 'Strikethrough' },
      'divider',
      { id: 'mono',          label: '𝙼',  tooltip: 'Monospace' },
      'divider',
      { id: 'bullet',        tooltip: 'Bullet List',   svg: bulletListSVG() },
      { id: 'numbered',      tooltip: 'Numbered List', svg: numberedListSVG() },
      'divider',
      { id: 'strip',         label: 'T×', tooltip: 'Clear Formatting', className: 'lrp-strip' },
    ];

    buttons.forEach((btn) => {
      if (btn === 'divider') {
        const div = document.createElement('span');
        div.className = 'lrp-divider';
        toolbar.appendChild(div);
        return;
      }

      const el = document.createElement('button');
      el.className = 'lrp-btn' + (btn.className ? ' ' + btn.className : '');
      el.dataset.format = btn.id;
      el.dataset.tooltip = btn.tooltip;
      el.setAttribute('aria-label', btn.tooltip);
      el.setAttribute('type', 'button');
      el.tabIndex = -1;

      if (btn.svg) {
        el.innerHTML = btn.svg;
      } else {
        el.textContent = btn.label;
      }

      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleFormatClick(btn.id);
      });

      toolbar.appendChild(el);
    });

    // Inject into document body (NOT shadow DOM — toolbar stays in main DOM)
    document.body.appendChild(toolbar);

    // Inject toolbar styles inline (in case CSS file doesn't load in all contexts)
    injectToolbarStyles();

    return toolbar;
  }

  function injectToolbarStyles() {
    if (document.getElementById('lrp-injected-styles')) return;

    const style = document.createElement('style');
    style.id = 'lrp-injected-styles';
    style.textContent = `
      .lrp-toolbar {
        position: fixed !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        gap: 2px !important;
        padding: 4px 6px !important;
        background: #1b1f23 !important;
        border: 1px solid rgba(255,255,255,0.12) !important;
        border-radius: 10px !important;
        box-shadow: 0 4px 16px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.2) !important;
        opacity: 0 !important;
        transform: translateY(6px) !important;
        transition: opacity 0.2s ease, transform 0.2s ease !important;
        pointer-events: none !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        user-select: none !important;
      }
      .lrp-toolbar.lrp-visible {
        opacity: 1 !important;
        transform: translateY(0) !important;
        pointer-events: auto !important;
      }
      .lrp-divider {
        width: 1px !important;
        height: 20px !important;
        background: rgba(255,255,255,0.12) !important;
        margin: 0 3px !important;
        flex-shrink: 0 !important;
      }
      .lrp-btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 30px !important;
        height: 30px !important;
        border: none !important;
        border-radius: 6px !important;
        background: transparent !important;
        color: #c4c7cc !important;
        font-size: 14px !important;
        font-weight: 700 !important;
        cursor: pointer !important;
        transition: all 0.15s ease !important;
        line-height: 1 !important;
        padding: 0 !important;
        font-family: inherit !important;
      }
      .lrp-btn:hover {
        background: rgba(255,255,255,0.1) !important;
        color: #e8eaed !important;
      }
      .lrp-btn:active {
        background: rgba(255,255,255,0.15) !important;
        transform: scale(0.92) !important;
      }
      .lrp-btn.lrp-active {
        background: rgba(10,102,194,0.25) !important;
        color: #8ab4f8 !important;
      }
      .lrp-btn::after {
        content: attr(data-tooltip);
        position: absolute;
        bottom: calc(100% + 6px);
        left: 50%;
        transform: translateX(-50%) scale(0.9);
        padding: 4px 8px;
        background: #303437;
        color: #e8eaed;
        font-size: 11px;
        font-weight: 500;
        white-space: nowrap;
        border-radius: 5px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        opacity: 0;
        pointer-events: none;
        transition: all 0.15s ease;
      }
      .lrp-btn:hover::after {
        opacity: 1;
        transform: translateX(-50%) scale(1);
      }
      .lrp-btn svg {
        width: 16px !important;
        height: 16px !important;
        fill: currentColor !important;
      }
      .lrp-btn.lrp-strip {
        font-size: 12px !important;
        letter-spacing: -0.5px !important;
      }
    `;
    document.head.appendChild(style);
  }

  function showToolbar(editor) {
    createToolbar();
    positionToolbar(editor);
    toolbar.offsetHeight; // reflow
    toolbar.classList.add('lrp-visible');
  }

  function positionToolbar(editor) {
    if (!toolbar) return;

    const rect = editor.getBoundingClientRect();
    const toolbarHeight = 42;
    const toolbarWidth = 400;

    let top = rect.top - toolbarHeight - 8;
    let left = rect.left;

    // If above viewport, place below
    if (top < 8) {
      top = rect.bottom + 8;
    }

    // Clamp horizontally
    left = Math.max(8, Math.min(left, window.innerWidth - toolbarWidth - 12));

    toolbar.style.top = top + 'px';
    toolbar.style.left = left + 'px';
  }

  function hideToolbar() {
    if (toolbar) toolbar.classList.remove('lrp-visible');
  }

  function removeToolbar() {
    if (toolbar) {
      toolbar.remove();
      toolbar = null;
    }
    activeEditor = null;
  }

  // ── SVG Icons ───────────────────────────────────────────────────

  function bulletListSVG() {
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="4" cy="7" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="17" r="1.5"/>
      <rect x="8" y="6" width="13" height="2" rx="1"/><rect x="8" y="11" width="13" height="2" rx="1"/><rect x="8" y="16" width="13" height="2" rx="1"/>
    </svg>`;
  }

  function numberedListSVG() {
    return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <text x="2" y="9" font-size="7" font-weight="700" fill="currentColor" font-family="sans-serif">1</text>
      <text x="2" y="14.5" font-size="7" font-weight="700" fill="currentColor" font-family="sans-serif">2</text>
      <text x="2" y="20" font-size="7" font-weight="700" fill="currentColor" font-family="sans-serif">3</text>
      <rect x="10" y="6" width="11" height="2" rx="1"/><rect x="10" y="11" width="11" height="2" rx="1"/><rect x="10" y="16" width="11" height="2" rx="1"/>
    </svg>`;
  }

  // ── Format Handling ─────────────────────────────────────────────

  function handleFormatClick(formatId) {
    if (formatId === 'bullet' || formatId === 'numbered') {
      applyListFormat(formatId === 'bullet' ? 'bullet' : 'numbered');
    } else {
      applyFormat(formatId);
    }
  }

  function getSelectionInfo() {
    // Try the editor's own root for selection (works for shadow DOM)
    let selection = null;
    if (activeEditor) {
      const root = activeEditor.getRootNode();
      if (root && root.getSelection) {
        selection = root.getSelection();
      }
    }
    // Fallback to window selection
    if (!selection || selection.rangeCount === 0) {
      selection = window.getSelection();
    }
    if (!selection || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    if (!activeEditor) return null;
    if (!activeEditor.contains(range.commonAncestorContainer)) return null;

    const selectedText = selection.toString();
    if (!selectedText) return null;

    return { selection, range, selectedText };
  }

  function applyFormat(formatType) {
    const info = getSelectionInfo();
    if (!info) return;

    const { selection, range, selectedText } = info;
    let newText;

    switch (formatType) {
      case 'bold':
        newText = toggleCharMap(selectedText, UnicodeMaps.boldMap);
        break;
      case 'italic':
        newText = toggleCharMap(selectedText, UnicodeMaps.italicMap);
        break;
      case 'bolditalic':
        newText = toggleCharMap(selectedText, UnicodeMaps.boldItalicMap);
        break;
      case 'mono':
        newText = toggleCharMap(selectedText, UnicodeMaps.monoMap);
        break;
      case 'underline':
        newText = toggleCombining(selectedText, UnicodeMaps.UNDERLINE_CHAR);
        break;
      case 'strikethrough':
        newText = toggleCombining(selectedText, UnicodeMaps.STRIKETHROUGH_CHAR);
        break;
      case 'strip':
        newText = UnicodeMaps.stripFormatting(selectedText);
        break;
      default:
        return;
    }

    replaceSelection(range, selection, newText);
  }

  function toggleCharMap(text, charMap) {
    if (UnicodeMaps.hasStyle(text, charMap)) {
      return UnicodeMaps.stripFormatting(text);
    }
    const plain = UnicodeMaps.stripFormatting(text);
    return UnicodeMaps.convertText(plain, charMap);
  }

  function toggleCombining(text, combiningChar) {
    if (UnicodeMaps.hasCombining(text, combiningChar)) {
      return UnicodeMaps.removeCombining(text, combiningChar);
    }
    return UnicodeMaps.applyCombining(text, combiningChar);
  }

  function applyListFormat(listType) {
    const info = getSelectionInfo();
    if (!info) {
      insertAtCursor(listType === 'bullet' ? '• ' : '1. ');
      return;
    }

    const { selection, range, selectedText } = info;
    const lines = selectedText.split('\n');
    const formatted = lines.map((line, i) => {
      const cleaned = line.replace(/^(\d+\.\s|•\s)/, '');
      if (!cleaned.trim()) return cleaned;
      return listType === 'bullet' ? `• ${cleaned}` : `${i + 1}. ${cleaned}`;
    }).join('\n');

    replaceSelection(range, selection, formatted);
  }

  function replaceSelection(range, selection, newText) {
    if (!activeEditor) return;
    activeEditor.focus();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('insertText', false, newText);
    dispatchInputEvent(activeEditor);
  }

  function insertAtCursor(text) {
    if (!activeEditor) return;
    activeEditor.focus();
    document.execCommand('insertText', false, text);
    dispatchInputEvent(activeEditor);
  }

  function dispatchInputEvent(el) {
    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  }

  // ── Boot ────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

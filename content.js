/**
 * LinkedIn Rich Post — Content Script
 *
 * Detects LinkedIn's post composer modal/inline editor and replaces it
 * with a Quill.js rich text editor. Syncs content back to LinkedIn's
 * native editor so that the "Post" button works normally.
 */

(function () {
  "use strict";

  // ───────────────────────────────────────────────
  //  State
  // ───────────────────────────────────────────────
  let quillInstance = null;
  let observer = null;
  let isEnabled = true;
  let charCountInterval = null;

  // ───────────────────────────────────────────────
  //  Selectors — LinkedIn changes class names often,
  //  so we use multiple strategies.
  // ───────────────────────────────────────────────
  const COMPOSER_SELECTORS = [
    // The contenteditable div inside the share box modal
    ".ql-editor[data-placeholder]",
    ".share-creation-state__text-editor .ql-editor",
    'div[role="textbox"][contenteditable="true"][aria-label]',
    '.editor-content div[contenteditable="true"]',
    // Fallback: any contenteditable inside the share box
    '.share-box div[contenteditable="true"]',
    '.share-creation-state div[contenteditable="true"]',
  ];

  const MODAL_SELECTORS = [
    ".share-box--is-open",
    ".share-creation-state",
    'div[data-test-modal][role="dialog"]',
    ".artdeco-modal--layer-default",
  ];

  const POST_BUTTON_SELECTORS = [
    ".share-actions__primary-action",
    "button.share-actions__primary-action",
    'button[data-control-name="share.post"]',
  ];

  // ───────────────────────────────────────────────
  //  Utilities
  // ───────────────────────────────────────────────

  /**
   * Tries multiple selectors in order and returns the first match.
   */
  function queryFirst(selectors, root = document) {
    for (const selector of selectors) {
      try {
        const el = root.querySelector(selector);
        if (el) return el;
      } catch (_) {
        // Invalid selector — skip
      }
    }
    return null;
  }

  /**
   * Dispatches realistic input events so LinkedIn's React picks up changes.
   */
  function dispatchInputEvents(element) {
    const inputEvent = new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
    });
    element.dispatchEvent(inputEvent);

    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("keyup", { bubbles: true }));
  }

  /**
   * Convert Quill HTML content → LinkedIn-compatible text.
   * LinkedIn's native editor accepts basic HTML in contenteditable.
   * We keep <br>, <p>, <strong>, <em>, <u>, <ol>, <ul>, <li>.
   * Everything else is stripped.
   */
  function quillHtmlToLinkedIn(html) {
    // Create a temporary div to parse and clean the HTML
    const temp = document.createElement("div");
    temp.innerHTML = html;

    // LinkedIn understands basic tags, so we can pass most Quill output through.
    // We mainly need to ensure empty paragraphs become line breaks.
    const cleanedHtml = temp.innerHTML
      .replace(/<p><br\s*\/?><\/p>/gi, "<br>")
      .replace(/<p class="[^"]*"><br\s*\/?><\/p>/gi, "<br>")
      .replace(/<p>\s*<\/p>/gi, "<br>");

    return cleanedHtml;
  }

  /**
   * Unicode text formatting for bold/italic (used for plain-text fallback).
   * Maps normal ASCII letters to their Unicode bold/italic counterparts.
   */
  const BOLD_MAP = {};
  const ITALIC_MAP = {};
  const BOLD_ITALIC_MAP = {};

  // Build Unicode maps for A-Z, a-z
  (function buildUnicodeMaps() {
    const boldUpperStart = 0x1d400;
    const boldLowerStart = 0x1d41a;
    const italicUpperStart = 0x1d434;
    const italicLowerStart = 0x1d44e;
    const boldItalicUpperStart = 0x1d468;
    const boldItalicLowerStart = 0x1d482;

    for (let i = 0; i < 26; i++) {
      const upper = String.fromCharCode(65 + i);
      const lower = String.fromCharCode(97 + i);
      BOLD_MAP[upper] = String.fromCodePoint(boldUpperStart + i);
      BOLD_MAP[lower] = String.fromCodePoint(boldLowerStart + i);
      ITALIC_MAP[upper] = String.fromCodePoint(italicUpperStart + i);
      ITALIC_MAP[lower] = String.fromCodePoint(italicLowerStart + i);
      BOLD_ITALIC_MAP[upper] = String.fromCodePoint(boldItalicUpperStart + i);
      BOLD_ITALIC_MAP[lower] = String.fromCodePoint(boldItalicLowerStart + i);
    }

    // ── Fix Unicode holes ──
    // The Mathematical Italic block has a gap at U+1D455 (h).
    // The official substitute is U+210E (PLANCK CONSTANT ℎ).
    ITALIC_MAP["h"] = "\u210E";
  })();

  function toUnicodeBold(text) {
    return [...text].map((c) => BOLD_MAP[c] || c).join("");
  }

  function toUnicodeItalic(text) {
    return [...text].map((c) => ITALIC_MAP[c] || c).join("");
  }

  function toUnicodeBoldItalic(text) {
    return [...text].map((c) => BOLD_ITALIC_MAP[c] || c).join("");
  }

  /**
   * Convert Quill delta to plain text with Unicode formatting.
   * This is the most reliable way to post to LinkedIn since it strips
   * HTML and renders pure text — Unicode bold/italic survive.
   */
  function deltaToUnicodeText(delta) {
    if (!delta || !delta.ops) return "";

    let result = "";
    for (const op of delta.ops) {
      if (typeof op.insert !== "string") continue;

      const text = op.insert;
      const attrs = op.attributes || {};

      if (attrs.bold && attrs.italic) {
        result += toUnicodeBoldItalic(text);
      } else if (attrs.bold) {
        result += toUnicodeBold(text);
      } else if (attrs.italic) {
        result += toUnicodeItalic(text);
      } else {
        result += text;
      }
    }
    return result;
  }

  /**
   * Convert Quill delta to formatted plain text with list prefixes.
   */
  function deltaToFormattedText(delta) {
    if (!delta || !delta.ops) return "";

    let result = "";
    let listCounter = 0;
    let inOrderedList = false;
    let lineStart = true;

    for (const op of delta.ops) {
      if (typeof op.insert === "string") {
        const text = op.insert;
        const attrs = op.attributes || {};

        // Handle list formatting
        if (attrs.list === "ordered") {
          listCounter++;
          inOrderedList = true;
          result = result.replace(/\n$/, "");
          result += `\n${listCounter}. `;
          continue;
        } else if (attrs.list === "bullet") {
          inOrderedList = false;
          listCounter = 0;
          result = result.replace(/\n$/, "");
          result += "\n• ";
          continue;
        }

        if (text === "\n" && !attrs.list) {
          inOrderedList = false;
          listCounter = 0;
        }

        // Apply Unicode formatting
        if (attrs.bold && attrs.italic) {
          result += toUnicodeBoldItalic(text);
        } else if (attrs.bold) {
          result += toUnicodeBold(text);
        } else if (attrs.italic) {
          result += toUnicodeItalic(text);
        } else if (attrs.underline) {
          // Unicode underline: use combining underline character
          result += [...text].map((c) => c + "\u0332").join("");
        } else {
          result += text;
        }
      } else if (op.insert && op.insert.emoji) {
        result += op.insert.emoji;
      }
    }

    return result;
  }

  // ───────────────────────────────────────────────
  //  Emoji Picker (simple inline grid)
  // ───────────────────────────────────────────────
  const EMOJI_LIST = [
    "😀",
    "😃",
    "😄",
    "😁",
    "😆",
    "😅",
    "🤣",
    "😂",
    "🙂",
    "😊",
    "😇",
    "🥰",
    "😍",
    "🤩",
    "😘",
    "😗",
    "😋",
    "😛",
    "😜",
    "🤪",
    "😝",
    "🤑",
    "🤗",
    "🤭",
    "🤔",
    "🤐",
    "😐",
    "😑",
    "😶",
    "😏",
    "😒",
    "🙄",
    "👍",
    "👎",
    "👏",
    "🙌",
    "🤝",
    "💪",
    "🔥",
    "⭐",
    "❤️",
    "💯",
    "✅",
    "🎉",
    "🚀",
    "💡",
    "📌",
    "🏆",
    "👋",
    "✨",
    "💼",
    "📈",
    "🎯",
    "💬",
    "📢",
    "🌟",
  ];

  function createEmojiPicker(quill) {
    const picker = document.createElement("div");
    picker.className = "lrp-emoji-picker";
    picker.style.display = "none";

    const grid = document.createElement("div");
    grid.className = "lrp-emoji-grid";

    EMOJI_LIST.forEach((emoji) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lrp-emoji-btn";
      btn.textContent = emoji;
      btn.title = emoji;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const range = quill.getSelection(true);
        if (range) {
          quill.insertText(range.index, emoji);
          quill.setSelection(range.index + emoji.length);
        } else {
          quill.insertText(quill.getLength() - 1, emoji);
        }
        picker.style.display = "none";
      });
      grid.appendChild(btn);
    });

    picker.appendChild(grid);
    return picker;
  }

  // ───────────────────────────────────────────────
  //  Toolbar HTML
  // ───────────────────────────────────────────────
  function createToolbar() {
    const toolbar = document.createElement("div");
    toolbar.className = "lrp-toolbar";
    toolbar.id = "lrp-toolbar";

    const buttons = [
      { format: "bold", icon: "<strong>B</strong>", title: "Bold (Ctrl+B)" },
      { format: "italic", icon: "<em>I</em>", title: "Italic (Ctrl+I)" },
      { format: "underline", icon: "<u>U</u>", title: "Underline (Ctrl+U)" },
      { type: "separator" },
      { format: "list", value: "ordered", icon: "1.", title: "Numbered List" },
      { format: "list", value: "bullet", icon: "•", title: "Bullet List" },
      { type: "separator" },
      { format: "emoji", icon: "😊", title: "Insert Emoji" },
      { type: "separator" },
      { format: "clean", icon: "⊘", title: "Clear Formatting" },
    ];

    buttons.forEach((btn) => {
      if (btn.type === "separator") {
        const sep = document.createElement("span");
        sep.className = "lrp-toolbar-separator";
        toolbar.appendChild(sep);
        return;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "lrp-toolbar-btn";
      button.innerHTML = btn.icon;
      button.title = btn.title;
      button.dataset.format = btn.format;
      if (btn.value) button.dataset.value = btn.value;
      toolbar.appendChild(button);
    });

    return toolbar;
  }

  // ───────────────────────────────────────────────
  //  Core: Inject the rich text editor
  // ───────────────────────────────────────────────

  function injectEditor(linkedInEditor) {
    // Guard against double-injection
    if (document.getElementById("lrp-container")) return;
    if (!linkedInEditor) return;

    // Store reference to the original LinkedIn editor
    const originalEditor = linkedInEditor;

    // Find the parent that contains the editor
    const editorParent =
      originalEditor.closest(
        ".share-creation-state__text-editor, .editor-content, .share-box",
      ) || originalEditor.parentElement;

    if (!editorParent) return;

    // ─── Create wrapper ───
    const container = document.createElement("div");
    container.id = "lrp-container";
    container.className = "lrp-container";

    // Toolbar
    const toolbar = createToolbar();
    container.appendChild(toolbar);

    // Editor area
    const editorDiv = document.createElement("div");
    editorDiv.id = "lrp-editor";
    container.appendChild(editorDiv);

    // Character count
    const charCount = document.createElement("div");
    charCount.className = "lrp-char-count";
    charCount.textContent = "0 characters";
    container.appendChild(charCount);

    // Hide the original LinkedIn editor visually (keep in DOM for syncing)
    originalEditor.style.position = "absolute";
    originalEditor.style.opacity = "0";
    originalEditor.style.pointerEvents = "none";
    originalEditor.style.height = "0";
    originalEditor.style.overflow = "hidden";
    originalEditor.setAttribute("data-lrp-hidden", "true");

    // Insert our container before the original
    editorParent.insertBefore(container, originalEditor);

    // ─── Initialize Quill ───
    quillInstance = new Quill("#lrp-editor", {
      theme: null, // No theme — we handle all styling in content.css
      placeholder: "What do you want to talk about?",
      modules: {
        toolbar: false, // We use our custom toolbar
      },
      formats: ["bold", "italic", "underline", "list", "link"],
    });

    // ─── Emoji Picker ───
    const emojiPicker = createEmojiPicker(quillInstance);
    container.appendChild(emojiPicker);

    // ─── Toolbar event handling ───
    toolbar.addEventListener("click", (e) => {
      const btn = e.target.closest(".lrp-toolbar-btn");
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const format = btn.dataset.format;
      const value = btn.dataset.value;

      if (format === "emoji") {
        emojiPicker.style.display =
          emojiPicker.style.display === "none" ? "block" : "none";
        return;
      }

      if (format === "clean") {
        const range = quillInstance.getSelection();
        if (range) {
          if (range.length > 0) {
            quillInstance.removeFormat(range.index, range.length);
          }
        }
        return;
      }

      if (format === "list") {
        const range = quillInstance.getSelection();
        if (range) {
          const currentFormat = quillInstance.getFormat(range);
          quillInstance.format(
            "list",
            currentFormat.list === value ? false : value,
          );
        }
        return;
      }

      // Toggle inline format (bold, italic, underline)
      const range = quillInstance.getSelection();
      if (range) {
        const currentFormat = quillInstance.getFormat(range);
        quillInstance.format(format, !currentFormat[format]);
      }
    });

    // Close emoji picker on outside click
    document.addEventListener("click", (e) => {
      if (
        !e.target.closest(".lrp-emoji-picker") &&
        !e.target.closest('[data-format="emoji"]')
      ) {
        emojiPicker.style.display = "none";
      }
    });

    // ─── Sync content to LinkedIn's editor on every change ───
    quillInstance.on("text-change", () => {
      syncContentToLinkedIn(originalEditor);

      // Update character count
      const text = quillInstance.getText();
      const length = text.trim().length;
      charCount.textContent = `${length} character${length !== 1 ? "s" : ""}`;

      // Persist char count for popup (try-catch guards against
      // "Extension context invalidated" after extension reload)
      try {
        chrome.storage.local.set({ lrpCharCount: length });
      } catch (_) {}

      // Update active toolbar button states
      updateToolbarState();
    });

    // Update toolbar buttons on selection change
    quillInstance.on("selection-change", () => {
      updateToolbarState();
    });

    // ─── Focus the new editor ───
    setTimeout(() => {
      quillInstance.focus();
    }, 100);

    console.log(
      "[LinkedIn Rich Post] ✅ Rich text editor injected successfully.",
    );
  }

  /**
   * Highlight active formatting buttons in the toolbar.
   */
  function updateToolbarState() {
    if (!quillInstance) return;
    const range = quillInstance.getSelection();
    if (!range) return;

    const formats = quillInstance.getFormat(range);
    const toolbar = document.getElementById("lrp-toolbar");
    if (!toolbar) return;

    toolbar.querySelectorAll(".lrp-toolbar-btn").forEach((btn) => {
      const format = btn.dataset.format;
      const value = btn.dataset.value;

      if (format === "emoji" || format === "clean") return;

      if (format === "list") {
        btn.classList.toggle("active", formats.list === value);
      } else {
        btn.classList.toggle("active", !!formats[format]);
      }
    });
  }

  /**
   * Sync the Quill editor content into LinkedIn's native editor.
   *
   * Strategy:
   * 1. Get the Quill delta and convert to Unicode-formatted plain text.
   *    LinkedIn strips HTML on post, so Unicode bold/italic is the best
   *    way to preserve formatting.
   * 2. Set the inner text of LinkedIn's hidden contenteditable.
   * 3. Dispatch input events so React's synthetic event system picks it up.
   */
  function syncContentToLinkedIn(linkedInEditor) {
    if (!quillInstance || !linkedInEditor) return;

    const delta = quillInstance.getContents();
    const formattedText = deltaToFormattedText(delta);

    // Build LinkedIn-compatible HTML from the formatted text.
    // We do NOT touch focus here — that would steal it from Quill
    // and also confuse LinkedIn's internal React state.
    const lines = formattedText.split("\n");
    let html = "";
    lines.forEach((line) => {
      if (line.trim() === "") {
        html += "<p><br></p>";
      } else {
        html += "<p>" + escapeHtml(line) + "</p>";
      }
    });

    // Set content without focusing the hidden editor
    linkedInEditor.innerHTML = html;

    // Dispatch events so LinkedIn's React state picks up the change
    dispatchInputEvents(linkedInEditor);
  }

  /**
   * Escape HTML special characters for safe insertion.
   */
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // ───────────────────────────────────────────────
  //  Observer: Watch for LinkedIn's composer
  // ───────────────────────────────────────────────

  function findLinkedInEditor() {
    return queryFirst(COMPOSER_SELECTORS);
  }

  function isComposerOpen() {
    return !!queryFirst(MODAL_SELECTORS);
  }

  /**
   * Cleanup: remove our editor and restore LinkedIn's native one.
   */
  function cleanupEditor() {
    if (quillInstance) {
      quillInstance = null;
    }

    const container = document.getElementById("lrp-container");
    if (container) {
      container.remove();
    }

    // Restore any hidden LinkedIn editors
    document.querySelectorAll('[data-lrp-hidden="true"]').forEach((el) => {
      el.style.position = "";
      el.style.opacity = "";
      el.style.pointerEvents = "";
      el.style.height = "";
      el.style.overflow = "";
      el.removeAttribute("data-lrp-hidden");
    });
  }

  /**
   * Sets up a MutationObserver that watches for the LinkedIn post
   * composer appearing or disappearing in the DOM.
   */
  function startObserving() {
    if (observer) observer.disconnect();

    let debounceTimer = null;

    observer = new MutationObserver((mutations) => {
      // Debounce to avoid rapid-fire processing during React re-renders
      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(() => {
        if (!isEnabled) return;

        const composerExists = isComposerOpen();
        const ourEditorExists = !!document.getElementById("lrp-container");

        if (composerExists && !ourEditorExists) {
          // Composer appeared — inject our editor
          const linkedInEditor = findLinkedInEditor();
          if (linkedInEditor) {
            injectEditor(linkedInEditor);
          }
        } else if (!composerExists && ourEditorExists) {
          // Composer closed — clean up
          cleanupEditor();
        }
      }, 300);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    console.log("[LinkedIn Rich Post] 👁 MutationObserver started.");
  }

  /**
   * Intercept the Post button to do a final sync BEFORE the click fires.
   *
   * We use 'mousedown' (fires before 'click') so LinkedIn's own click
   * handler sees the updated content. We do NOT stop propagation or
   * re-dispatch — that caused an infinite loop previously.
   */
  function interceptPostButton() {
    document.addEventListener(
      "mousedown",
      (e) => {
        const postBtn = e.target.closest(POST_BUTTON_SELECTORS.join(", "));

        if (postBtn && quillInstance) {
          // Final sync before LinkedIn processes the click
          const linkedInEditor = document.querySelector(
            '[data-lrp-hidden="true"]',
          );
          if (linkedInEditor) {
            syncContentToLinkedIn(linkedInEditor);
          }
        }
      },
      true,
    ); // Capture phase = runs before LinkedIn's handlers
  }

  // ───────────────────────────────────────────────
  //  Init
  // ───────────────────────────────────────────────

  function init() {
    // Check if extension is enabled
    // try-catch guards against "Extension context invalidated" after reload
    try {
      chrome.storage.local.get(["lrpEnabled"], (result) => {
        isEnabled = result.lrpEnabled !== false; // Default to enabled

        if (isEnabled) {
          startObserving();
          interceptPostButton();
          console.log("[LinkedIn Rich Post] 🚀 Extension initialized.");
        } else {
          console.log("[LinkedIn Rich Post] ⏸ Extension is disabled.");
        }
      });
    } catch (_) {
      // Context invalidated — old script, just start with defaults
      startObserving();
      interceptPostButton();
    }

    // Listen for enable/disable toggle from popup
    try {
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.lrpEnabled) {
          isEnabled = changes.lrpEnabled.newValue;
          if (isEnabled) {
            startObserving();
            console.log("[LinkedIn Rich Post] ▶ Extension enabled.");
          } else {
            if (observer) observer.disconnect();
            cleanupEditor();
            console.log("[LinkedIn Rich Post] ⏸ Extension disabled.");
          }
        }
      });
    } catch (_) {
      // Context invalidated — ignore
    }
  }

  // Run when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

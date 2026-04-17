# LinkedIn Rich Post ✍️

> A Chrome extension that adds a **floating rich text toolbar** to LinkedIn — format your posts, comments, and DMs with **bold**, *italic*, <u>underline</u>, ~~strikethrough~~, `monospace`, and lists using Unicode characters that survive LinkedIn's formatting restrictions.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853)
![License](https://img.shields.io/badge/License-MIT-blue)
![No Build Step](https://img.shields.io/badge/Build-None%20Required-orange)

---

## ✨ Features

| Feature                       | Description                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| 🔤 **Bold**                   | Converts selected text to 𝗕𝗼𝗹𝗱 (Mathematical Sans-Serif Bold)                      |
| 🔤 **Italic**                 | Converts selected text to 𝘐𝘵𝘢𝘭𝘪𝘤 (Mathematical Sans-Serif Italic)                  |
| 🔤 **Bold Italic**            | Converts selected text to 𝘽𝙤𝙡𝙙 𝙄𝙩𝙖𝙡𝙞𝙘 (Mathematical Sans-Serif Bold Italic)       |
| 🔤 **Monospace**              | Converts selected text to 𝙼𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎 (Mathematical Monospace)                      |
| 🔡 **Underline**              | Applies U̲n̲d̲e̲r̲l̲i̲n̲e̲ using combining character (U+0332)                               |
| 🔡 **Strikethrough**          | Applies S̶t̶r̶i̶k̶e̶t̶h̶r̶o̶u̶g̶h̶ using combining character (U+0336)                       |
| 📝 **Bullet & Numbered Lists**| Prefixes selected lines with `•` or `1. 2. 3.`                                     |
| 🧹 **Clear Formatting**       | Strips all Unicode formatting back to plain ASCII                                   |
| ⚡ **Toggle On/Off**          | Enable or disable from the popup without uninstalling                                |
| 🌐 **Works Everywhere**       | Posts, comments, DMs — any LinkedIn text input area                                  |

---

## 📸 How It Works

1. **Open LinkedIn** and click into any text input — post composer, comment, or DM
2. A **floating formatting toolbar** appears above the editor
3. **Select text** and click a format button (or type first, then select & format)
4. The text is instantly converted to Unicode characters — **no HTML, no workarounds**
5. Click **Post** / **Comment** / **Send** — formatting is preserved as-is

### Why Unicode?

LinkedIn strips all HTML from posts. This extension bypasses that limitation by converting text to **Unicode Mathematical Alphanumeric Symbols**, which LinkedIn renders natively:

| Format        | Input   | Output  |
| ------------- | ------- | ------- |
| Bold          | `Hello` | 𝗛𝗲𝗹𝗹𝗼   |
| Italic        | `Hello` | 𝘏𝘦𝘭𝘭𝘰   |
| Bold Italic   | `Hello` | 𝙃𝙚𝙡𝙡𝙤   |
| Monospace     | `Hello` | 𝙷𝚎𝚕𝚕𝚘   |
| Underline     | `Hello` | H̲e̲l̲l̲o̲   |
| Strikethrough | `Hello` | H̶e̶l̶l̶o̶   |
| Bullet List   | —       | • Item  |
| Numbered List | —       | 1. Item |

---

## 🚀 Installation

### From Source (Developer Mode)

1. **Clone the repository**

   ```bash
   git clone https://github.com/rahulps1000/Linkedin-Rich-Post.git
   ```

2. **Open Chrome Extensions**
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode** (toggle in the top-right)

3. **Load the extension**
   - Click **"Load unpacked"**
   - Select the cloned `Linkedin-Rich-Post` folder

4. **Navigate to LinkedIn**
   - Go to [linkedin.com](https://www.linkedin.com/)
   - Click into any post composer, comment box, or DM — the toolbar appears automatically

---

## 📁 Project Structure

```
Linkedin-Rich-Post/
├── manifest.json              # Chrome Manifest V3 configuration
├── background.js              # Service worker — toggle state & badge management
├── content/
│   ├── content.js             # Core content script — editor detection, toolbar, formatting
│   ├── content.css            # Toolbar styles (fallback, also injected inline)
│   └── unicode-maps.js        # Unicode character mapping tables & conversion engine
├── popup/
│   ├── popup.html             # Extension popup UI
│   ├── popup.css              # Popup styles
│   └── popup.js               # Popup logic — toggle switch
├── icons/
│   ├── icon16.png             # Toolbar icon
│   ├── icon48.png             # Extensions page icon
│   └── icon128.png            # Chrome Web Store icon
├── LICENSE                    # MIT License
└── README.md
```

---

## 🏗️ Architecture

### Editor Detection

LinkedIn uses multiple editor implementations across its platform:

| Area             | Editor Type                          | Detection Strategy                        |
| ---------------- | ------------------------------------ | ----------------------------------------- |
| Post Composer    | Quill (`.ql-editor`) inside Shadow DOM (`#interop-outlet`) | Shadow DOM traversal + `MutationObserver` |
| Comments         | Tiptap/ProseMirror (`.ProseMirror`)  | Standard DOM query                        |
| Direct Messages  | Native `contenteditable`             | Class-based detection (`msg-form__*`)     |

The extension uses a **three-layer detection strategy**:

1. **`MutationObserver`** on `document.body` — catches dynamically created editors
2. **Shadow DOM observation** — watches `#interop-outlet` and any new shadow roots
3. **Periodic scan** (every 2s) — fallback for edge cases where mutation events are missed

### Floating Toolbar

When a LinkedIn editor receives focus, a floating toolbar appears above it:

```
┌─────────────────────────────────────────────────────┐
│  𝗕  │  𝘐  │  𝘽𝙄  │  U̲  │  S̶  │  𝙼  │  ≡  │  ≡  │  T×  │
│ Bold  Ital  B+I   Und  Strk  Mono  Bul   Num  Clear│
└─────────────────────────────────────────────────────┘
```

- Positioned via `getBoundingClientRect()` relative to the active editor
- Renders in the main DOM (not inside Shadow DOM) at `z-index: 2147483647`
- Prevents focus theft via `mousedown → preventDefault()`
- Auto-hides on blur with a 200ms delay (to allow toolbar clicks)

### Content Flow

```
User selects text → Clicks format button → Unicode conversion → document.execCommand('insertText')
                                                                          ↓
                                                                  Dispatches InputEvent
                                                                          ↓
                                                              LinkedIn React state syncs
```

The formatting is **non-destructive** — the same button toggles formatting on/off. Clicking "Bold" on already-bold text reverts it to plain ASCII.

---

## ⌨️ Keyboard Shortcuts

> **Note**: Keyboard shortcuts apply within LinkedIn's native editors. The toolbar buttons work with any text selection.

Select text, then click a toolbar button to apply/remove formatting.

---

## 🔧 Popup

Click the extension icon in Chrome's toolbar:

- **Toggle switch** — Enable or disable the toolbar globally
- **Status indicator** — Shows "Active" (green) or "Disabled"
- **Format preview** — Quick reference of available formats

Settings are persisted via `chrome.storage.local` and synced across all LinkedIn tabs.

---

## 🛠️ Tech Stack

| Component   | Technology                                     |
| ----------- | ---------------------------------------------- |
| Extension   | Chrome Manifest V3                             |
| Detection   | MutationObserver + Shadow DOM traversal        |
| Formatting  | Unicode Mathematical Alphanumeric Symbols      |
| UI          | Vanilla JS + CSS (inline injection for safety) |
| Storage     | `chrome.storage.local`                         |
| Build       | None — plain JavaScript, no bundler required   |

---

## ⚠️ Known Limitations

- **Unicode scope**: Bold, italic, bold-italic, and monospace mappings cover **A–Z, a–z, and 0–9** only. Punctuation, symbols, and non-Latin characters pass through unformatted.
- **Combining characters**: Underline (U+0332) and strikethrough (U+0336) may render inconsistently across platforms and fonts.
- **LinkedIn DOM changes**: LinkedIn frequently updates its class names and DOM structure. If the toolbar stops appearing, the detection selectors in `content.js` may need updating.
- **Extension reload**: After reloading the extension in `chrome://extensions/`, refresh the LinkedIn tab to re-inject the content script.

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made with ❤️ for better LinkedIn posts
</p>

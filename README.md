# LinkedIn Rich Post ✍️

> A Chrome extension that enhances LinkedIn's post composer with a rich text editor — supporting **bold**, *italic*, <u>underline</u>, lists, emojis, and more.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-34A853)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🔤 **Rich Text Formatting** | Bold, Italic, Underline with toolbar buttons or keyboard shortcuts |
| 📝 **Lists** | Bullet lists and numbered lists |
| 😊 **Emoji Picker** | Inline emoji grid with 56 commonly used emojis |
| 🔢 **Character Count** | Real-time character counter in the editor and popup |
| 🔄 **Unicode Formatting** | Converts bold/italic to Unicode characters (𝐁𝐨𝐥𝐝, 𝘐𝘵𝘢𝘭𝘪𝘤) so formatting persists after posting |
| 🌙 **Dark Mode** | Automatically adapts to your system's dark mode preference |
| ⚡ **Toggle On/Off** | Enable or disable the extension from the popup without uninstalling |
| 🧹 **Clear Formatting** | One-click button to strip all formatting from selected text |

---

## 📸 How It Works

1. **Open LinkedIn** and click "Start a post"
2. The native editor is **automatically replaced** with the rich text editor
3. Use the **toolbar** to format your text
4. Click **Post** — the content is synced to LinkedIn and posted normally

### Formatting Output

LinkedIn strips HTML from posts. To preserve formatting, this extension converts styled text to **Unicode Mathematical Alphanumeric Symbols**:

| Format | Input | Output |
|--------|-------|--------|
| Bold | `Hello` | `𝐇𝐞𝐥𝐥𝐨` |
| Italic | `Hello` | `𝘏𝘦𝘭𝘭𝘰` |
| Bold + Italic | `Hello` | `𝑯𝒆𝒍𝒍𝒐` |
| Underline | `Hello` | `H̲e̲l̲l̲o̲` |
| Bullet List | — | `• Item` |
| Numbered List | — | `1. Item` |

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
   - Go to [linkedin.com/feed](https://www.linkedin.com/feed/)
   - Click "Start a post" — the rich text editor will appear automatically

---

## 📁 Project Structure

```
Linkedin-Rich-Post/
├── manifest.json       # Chrome Extension Manifest V3 configuration
├── content.js          # Main content script — editor injection & syncing
├── content.css         # LinkedIn-matching styles & dark mode support
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic — toggle & character count
├── icons/
│   ├── icon16.png      # Toolbar icon
│   ├── icon48.png      # Extensions page icon
│   └── icon128.png     # Chrome Web Store icon
└── lib/
    ├── quill.min.js    # Vendored Quill.js 2.0.3 editor
    └── quill.snow.css  # Quill Snow theme (overridden by content.css)
```

---

## 🏗️ Architecture

### Composer Detection

LinkedIn is a React single-page application — DOM nodes are created and destroyed on navigation. A `MutationObserver` watches `document.body` for the post composer modal appearing, using multiple selector strategies for resilience:

```
.ql-editor[data-placeholder]
div[role="textbox"][contenteditable="true"][aria-label]
.share-creation-state div[contenteditable="true"]
```

### Editor Injection

When the composer is detected:
1. LinkedIn's native contenteditable div is **hidden** (kept in DOM for syncing)
2. A Quill.js editor with a custom toolbar is **injected** in its place
3. On every text change, content is converted to Unicode-formatted text and synced to the hidden LinkedIn editor
4. The `mousedown` event on the Post button triggers a final sync before LinkedIn's click handler fires

### Content Syncing

```
Quill Editor → Delta → Unicode Formatted Text → LinkedIn's Hidden Editor → Post
```

The sync uses `dispatchEvent` with `InputEvent` and `Event('change')` to notify LinkedIn's React internals that content has changed.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+U` | Underline |

These are handled natively by Quill.js.

---

## 🔧 Configuration

Click the extension icon in Chrome's toolbar to access the popup:

- **Toggle switch** — Enable or disable the rich text editor
- **Character count** — Shows the current character count of your draft
- **Status indicator** — Green dot when active, gray when disabled

Settings are persisted via `chrome.storage.local`.

---

## ⚠️ Known Limitations

- **LinkedIn DOM changes**: LinkedIn frequently updates its class names and DOM structure. If the editor stops injecting, the selectors in `content.js` (`COMPOSER_SELECTORS` / `MODAL_SELECTORS`) may need updating.
- **Unicode formatting scope**: Bold/italic Unicode mappings cover A-Z and a-z only. Digits, punctuation, and non-Latin characters pass through unformatted.
- **Post formatting**: LinkedIn's servers strip all HTML. The Unicode approach preserves bold/italic visually, but underline uses combining characters that may render inconsistently across platforms.
- **Extension reload**: After reloading the extension in `chrome://extensions`, refresh the LinkedIn tab to pick up the new content script.

---

## 🛠️ Tech Stack

- **Editor**: [Quill.js 2.0.3](https://quilljs.com/) — lightweight, zero-dependency rich text editor
- **Extension API**: Chrome Manifest V3 with content scripts
- **Styling**: Vanilla CSS with `!important` overrides for specificity
- **Storage**: `chrome.storage.local` for toggle state and character count
- **No bundler**: Plain JavaScript — no build step required

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

## 🙏 Acknowledgments

- [Quill.js](https://quilljs.com/) — the rich text editor powering this extension
- [LinkedIn](https://www.linkedin.com/) — the platform this extension enhances

---

<p align="center">
  Made with ❤️ for better LinkedIn posts
</p>

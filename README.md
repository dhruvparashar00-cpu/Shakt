# ⚡ Shakt - AI-Powered PDF Note Digitizer & Study Companion
**Built for Linux & Android (Android 11+)**

Shakt transforms any handwritten or scanned PDF notes into perfectly structured, searchable text while preserving diagrams with pixel-perfect accuracy. Features an intelligent AI study assistant for instant doubt solving, complete keyboard navigation, and a modern, accessible interface designed for focused learning.

---

## 🌟 Key Features

### 📄 Universal PDF Digitization
- **AI-Powered OCR**: Converts handwritten and printed notes from any language into searchable, editable text
- **Perfect Diagram Preservation**: Claude Vision detects exact bounding boxes for every sketch, circuit, diagram, graph, or formula
- **Smart Content Extraction**: Automatically slices diagrams from the original page and embeds them inline at full resolution
- **Multi-Language Support**: English, Hinglish, Hindi, and other languages - all handled seamlessly

### 🤖 Intelligent Study Assistant
- **Contextual Doubt Solving**: Ask questions about your notes; AI understands the exact content and diagrams you're viewing
- **One-Click Realisations**: Save important insights directly into your notes as highlighted callout cards
- **Diagram-Specific Help**: Click "Ask AI" on any diagram to discuss its components, forces, or concepts
- **Natural Language**: Ask in any language or mix (Hinglish, technical English, etc.)

### ✏️ Advanced Note Editor
- **No Stylus Required**: Full text editing with keyboard and mouse
- **Dynamic Text Formatting**: Adjust font sizes (Small, Normal, Large, Heading) per paragraph
- **Smart Spacing**: Control margins and add blank space anywhere; content reflows automatically
- **Insert Dividers**: Add text or space between any blocks; everything pushes down smoothly
- **Full Keyboard Navigation**: Complete control without touching the mouse

### 🎨 Modern, Accessible Interface
- **Welcoming Design**: Bright, warm color palette designed for long study sessions
- **Light Mode Default**: Easy on the eyes with optional dark mode
- **WCAG Compliant**: Screen reader support, proper ARIA labels, keyboard shortcuts
- **Responsive Layout**: 3-pane desktop view; touch-optimized mobile navigation on Android
- **Smooth Animations**: Polished transitions and feedback

### 💾 Smart Persistence
- **Auto-Resume**: Opens to the exact page you left off, even days later
- **Local Storage**: All notes saved in browser IndexedDB - no cloud required
- **Session Memory**: Remembers your PDFs, preferences, and API settings

### ⚡ Token & Cost Efficiency (Built-In)
- **Anthropic Prompt Caching**: System instructions cached with `cache_control: {"type": "ephemeral"}`, reducing costs by up to 90%
- **Vision Resolution Optimizer**: Downscales captures to 1568px at optimal quality, cutting token usage ~50%
- **Sliding Context Window**: Caps chat history to last 6 messages to prevent token bloat
- **Economy Mode**: Routes simple doubts to Haiku (10x cheaper) while preserving Sonnet for OCR
- **Live Token Tracker**: Real-time display of session usage and cache savings in the navbar

### ⌨️ Keyboard Shortcuts
- **Ctrl/Cmd + K**: Focus AI doubt input
- **Ctrl/Cmd + E**: Toggle edit mode
- **Ctrl/Cmd + O**: Open PDF file
- **Ctrl/Cmd + Enter**: Convert current page
- **← / →**: Navigate PDF pages
- **Escape**: Close dialogs
- **Ctrl/Cmd + /**: Show keyboard shortcuts help

---

## 🚀 Quick Start on Linux

From `/home/dhrpr/Vscode(projects)/Kalam/shakt`:

```bash
# 1. Start the server (Zero external npm packages required!)
node server.js
```

Or using the launcher:
```bash
./start-shakt.sh
```

Open your browser at `http://localhost:3000`.

---

## 📱 Using on Android (Phones & Tablets, Android 11 to Latest)

### Option 1: Instant PWA Install (Recommended)
1. Ensure your Android phone and Linux computer are on the same Wi-Fi network.
2. When `server.js` starts, it displays your network IP, e.g.:
   `http://192.168.1.XX:3000`
3. Open Chrome or Brave on your Android phone and go to that URL.
4. Tap the browser menu (⋮) -> **"Install app"** or **"Add to Home Screen"**.
5. Shakt will install as a standalone native-feeling app on your Android home screen with its own icon, splash screen, and full-screen view!

### Option 2: Native Android APK (Capacitor)
If you want to package a standalone `.apk`:
```bash
npm install -g @capacitor/cli @capacitor/core @capacitor/android
npx cap add android
npx cap copy
npx cap open android   # Builds APK in Android Studio
```

---

## 🔑 Setting Up Your Claude API Key

You can configure your API key in either of two easy ways:

1. **In-App (Recommended):** Click the **⚙️ Settings** icon in the top right of Shakt, paste your API key, and hit Save. It is securely saved in your local browser's IndexedDB.
2. **Via `.env` file:** Create a `.env` file in `/home/dhrpr/Vscode(projects)/Kalam/shakt/` with:
   ```env
   ANTHROPIC_API_KEY=your_key_here
   ```

---

## 📂 Project Architecture

```
/home/dhrpr/Vscode(projects)/Kalam/shakt/
├── server.js               # Zero-dependency local server & Claude proxy
├── package.json            # Project definition & scripts
├── capacitor.config.json   # Android packaging config
├── start-shakt.sh          # One-click launcher
├── .env.example            # Environment template
└── public/
    ├── index.html          # Main application HTML & responsive layout
    ├── manifest.json       # PWA manifest for Android installation
    ├── sw.js               # Service Worker for offline capability
    ├── css/
    │   └── styles.css      # Sleek Dark/Light theme & block styling
    ├── icons/
    │   ├── icon-192.svg    # Android app icon (192px)
    │   └── icon-512.svg    # Android splash icon (512px)
    └── js/
        ├── app.js          # Master controller & event bus
        ├── db.js           # IndexedDB persistence (PDFs, pages, doubts)
        ├── sample-data.js  # Preloaded sample note (Eng + Hinglish + Hindi)
        ├── pdf-viewer.js   # PDF.js rendering & canvas cropping engine
        ├── ai-converter.js # Claude Vision OCR & diagram detection
        ├── note-editor.js  # Dynamic space reflow & rich block editor
        └── ai-doubt.js     # Multilingual doubt solver & realisation saver
```

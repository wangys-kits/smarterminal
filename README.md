# Smarterminal

Modern, cross‑platform "intelligent terminal workspace" built with Electron. Current focus is a chat‑style terminal (notebook‑like cells) with per‑tab persistence, i18n, and basic process/output tooling. Classic xterm remains available alongside the chat surface.

## Core Highlights
- **Unified Command Workspace** — Chat-style cells, AI suggestions, quick execute, and tmux-backed multi-tab sessions stay in a single flow.
- **Context-Aware History** — Favorites, All, and Recycle views plus one-click rerun/Shift+Enter keep focus in-place while resurfacing past commands.
- **Rich Output & Preview** — Virtualized Out panels, copy-without-line-numbers, and the `/view` command render Markdown and common images inline.

## Key Features (Implemented)
- Chat‑style terminal (“notebook” cells)
  - Shift+Enter to run; Enter for newline; Ctrl+C to interrupt
  - Per‑cell output area with collapse, copy, re‑run, and timers
  - Convert between code and Markdown cells; inline Markdown editor (Shift+Enter to render)
  - Command queueing; interactive command heuristics and completion sentinels
- Tabs and Home view
  - Tabs persist as files under app data (`tabs/*.smt`) with title, favorite flag, description, and message state
  - Home screen shows Favorites / All / Recycle with previews; rename and Markdown description editing
- Terminal engine
  - Prefers `node-pty`; falls back to stdio `spawn` when PTY is unavailable
  - PTY/stdio aware stop/kill: Ctrl+C first, force kill for non‑responsive stdio shells
- tmux session manager
  - Local tabs try to launch tmux-backed shells for prompt persistence (falls back automatically when tmux is missing)
  - SSH tabs provision a remote tmux session, uploading the bundled binary when the server does not already have tmux
- Monitoring & logs
  - Lightweight per‑process monitor (CPU, memory, output rate, runtime); warnings are forwarded to renderer but UI indicators are minimal/disabled by default
  - Stream all command/terminal output to rotating log files under app data (`command-outputs/*.log`)
- i18n
  - Built‑in locales: `zh-CN`, `en`; instant UI switching in renderer

- Transfer drawer (scaffold)
  - Upload/download queue with pause/resume/cancel and conflict resolution UI (rename/overwrite/skip)
  - SFTP primitives wired in main process; SSH connect flow to be added

- Command palette (scaffold)
  - Modal with live filter and basic actions (e.g. Close Tab, Clear Terminal)
  - "Open SSH Session" command provisions a tmux-backed remote shell (requires optional `ssh2` and bundled tmux binaries)
  - Global shortcut not bound yet
- `/view` previews
  - `/view <file>` renders Markdown or image previews inside Out cells (local sessions only for now)
  - Graceful handling for unsupported types, missing files, size limits, and remote sessions

## Not Yet Implemented (Roadmap)
- SSH connection management UI and terminal sessions (foundation exists; no user‑visible connect flow yet)
- Full file explorer pane and CWD sync; current code includes basic fs ops and a transfer drawer UI only
- Auto‑update, credentials vault, port forwarding, and advanced SSH features from the original PRD

## Getting Started

### Prerequisites
- Node.js **18+** (Electron 29 compatibility)
- npm (ships with Node)

### Install Dependencies
```bash
npm install --cache ./node-cache
```
The project uses a local cache (`./node-cache`) to avoid permission issues and speed up re-installs.

### Run the App
```bash
npm start
```
This launches Electron with the main process at `app/main.js` and loads the renderer UI from `app/renderer/index.html`.

If the Electron binary download fails due to network restrictions, rerun `npm install --cache ./node-cache` or try:
```bash
npm_config_cache=./node-cache npm install
npx electron@29 .
```

### Optional: Native/SSH Modules
- PTY: `node-pty` is installed by default; if native build fails, the app automatically falls back to stdio mode.
- SSH/Tmux over SSH: remote terminals and the transfer manager rely on the optional `ssh2` dependency. Install it when you need SSH features:
  ```bash
  npm install --cache ./node-cache ssh2
  ```
  With `ssh2` available, the app can open tmux-backed SSH tabs from the command palette. A valid authentication method is still required (SSH agent, private key, or password).

### Bundled `tmux` Binaries
Local tabs prefer launching tmux. Provide platform binaries under `app/resources/tmux/`:

```
app/resources/tmux/
├── linux-x86_64/
│   └── tmux        # executable (optionally tmux.sha256)
└── linux-arm64/
    └── tmux
```

At runtime the binary is copied into `${userData}/tmux-bundled/…` and marked executable. Remote SSH sessions reuse the same assets—if the server does not have `tmux`, the binary is uploaded to `~/.smarterminal/bin/tmux` automatically.

## Usage Basics
- Create a new session tab from the home screen; double‑click the title to rename.
- Type commands in the composer; press Shift+Enter to execute, Enter for newline.
- Use Markdown cells for notes; Shift+Enter to render.
- Each run appears as a cell with output that you can collapse or copy.
- Sessions auto‑save; find them later under Home → Favorites/All/Recycle.
- Need a remote shell? Use the command palette's **Open SSH Session** action to start a tmux-backed SSH tab (requires optional `ssh2` and bundled tmux binaries).
- Want a quick preview? Run `/view README.md` (supports Markdown and common image formats during the first phase).

### Keyboard Shortcuts
- Shift+Enter: execute current composer content (command or Markdown)
- Enter: newline in composer; Ctrl+C: interrupt running command; Esc: clear composer/close modals
- Ctrl/Cmd+N: new tab; Ctrl/Cmd+W: close tab
- Ctrl+Tab / Ctrl+Shift+Tab: switch tabs; Ctrl/Cmd+1..9: jump to tab index
- F5: refresh files (when file area is visible)
  
Chat-terminal specific:
- When composer is unfocused: `C` code mode; `M` Markdown mode
- With a cell selected: `A` insert above; `B` insert below; double‑tap `D` delete cell
- With a cell selected: `M` to Markdown; `C` to code/start editing
- In composer: `Tab` open suggestions; `↑/↓` navigate; `Enter` accept

Note: A command palette modal exists but no global shortcut yet.

## npm Scripts

| Script | Description |
| ------ | ----------- |
| `npm start` | Launch Electron. DevTools open only when `NODE_ENV=development`. |
| `npm run pack` | Build unpackaged distributables (Electron Builder `--dir`). |
| `npm run dist` | Produce platform installers / artifacts via Electron Builder. |

These scripts rely on the Electron Builder configuration in `package.json` for macOS, Windows, and Linux targets.

## Project Structure
- `app/main.js` — Electron main process: window, IPC, PTY/stdio terminal lifecycle, process monitoring, output streaming, per‑tab persistence, basic fs ops, transfer manager scaffold
- `app/preload.js` — context‑isolated bridge exposing whitelisted APIs (`term.*`, `cmd.*`, `fs.*`, `tabs.*`, `tx.*`, `settings.*`, `session.*`)
- `app/renderer/` — Vanilla JS modules for chat‑style terminal, tabs/home, i18n, and minimal transfer UI; xterm is loaded via script tag
- `design-system/modern/` — CSS tokens and theme assets
- `docs/` — PRD/tech docs and UI references
- `node-cache/` — local npm cache directory (safe to delete)

### Settings (UI)
- Language and theme: live switch `zh-CN`/`en` and `dark`/`light`/`system`
- Fonts: per‑surface overrides for command and output areas (size/color), persisted in `localStorage`

## Data Locations
- Tabs/sessions: `${userData}/tabs/*.smt`
- Output logs: `${userData}/command-outputs/*.log`
  
On macOS, `${userData}` defaults to `~/Library/Application Support/SmartTerminal/`.

## Architecture Notes
- Renderer is sandboxed: `contextIsolation: true`, `sandbox: true`, no Node globals; strict CSP in `index.html`
- IPC is explicitly whitelisted in preload; request/response shape is `{ ok, data? , error? }`
- PTY first, stdio fallback: stop/force‑kill strategy differs per mode
- Per‑tab persistence uses JSON files under app data (`tabs/*.smt`), managed entirely in the main process
- Settings/session persisted via `electron-store`
 - File ops IPC: `fs.list|rename|delete|mkdir|createFile|copy` (local only)

## Packaging & Distribution
Electron Builder config is present. Current binaries focus on local development; some roadmap features (auto‑update, code signing) are not wired in the app code yet.

## Troubleshooting
- Electron download blocked — re‑run install with the bundled cache or use `npx electron@29 .`
- PTY build fails — the app will run in stdio mode; Ctrl+C and force‑kill logic is adjusted automatically
- Terminal shows no output in chat view — open DevTools and enable `window.setSmDebug(true)` to inspect sentinels/output

## Roadmap
- SSH sessions UI (connect, known‑hosts, credentials) and SFTP integration with the transfer drawer
- File explorer pane with path sync from active terminal (OSC‑based) and local fs operations
- Command palette global shortcut and extended actions; richer settings (theme/font/profile)
- Auto‑update and packaging polish

## License
MIT © Smarterminal contributors

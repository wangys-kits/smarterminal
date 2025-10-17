# Smarterminal

Modern, cross-platform terminal + file manager built with Electron. Smarterminal pairs a fast terminal, tabbed workspace, split layout, and file explorer in a single window with optional SSH integration.

## Key Features
- **Tabbed terminal workspaces** — create, activate, and close terminals with a single click.
- **Dual terminal modes** — classic xterm-based terminal plus an experimental chat-style shell surface.
- **Persistent layout** — resizable split between terminal and files, with ratios saved per user.
- **Rich file explorer** — current working directory browser with sorting, refresh, and path sync from the shell.
- **Optional SSH sessions** — connect to remote hosts (via `ssh2`) with host-key trust prompts and terminal streaming.
- **Modern styling** — tokenized design system and custom xterm theme for the “modern” visual identity.

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

### Optional: SSH Support
SSH features are disabled unless the `ssh2` runtime dependency can be resolved. Install the optional packages to enable the remote shell workflow:
```bash
npm install --cache ./node-cache ssh2 ssh2-sftp-client
```

## npm Scripts

| Script | Description |
| ------ | ----------- |
| `npm start` | Launch Electron in development mode with auto-opened DevTools. |
| `npm run pack` | Build unpackaged distributables (Electron Builder `--dir`). |
| `npm run dist` | Produce platform installers / artifacts via Electron Builder. |

These scripts rely on the Electron Builder configuration in `package.json` for macOS, Windows, and Linux targets.

## Project Structure
- `app/main.js` — Electron main process, IPC contracts, PTY and SSH lifecycle, secure window defaults.
- `app/preload.js` — context-isolated preload bridge exposing a whitelisted API to the renderer.
- `app/renderer/` — UI code (vanilla JS + modules) for tabs, terminals, chat mode, file explorer, and SSH modals.
- `design-system/modern/` — CSS variables, tokens, and xterm theme JSON for the “modern” skin.
- `docs/` — design references and mockups for future UI iterations.
- `node-cache/` — local npm cache directory (excluded from Git; safe to delete to reclaim space).

## Architecture Notes
- Terminals default to `node-pty` when available. In environments where native modules cannot build, the app gracefully degrades to a stdio shell with limited capabilities.
- Layout and session data are persisted with `electron-store` (`settings`, `session`, and `known_hosts` stores).
- IPC channels are explicitly whitelisted (`term.*`, `fs.*`, `ssh.*`, etc.). The renderer runs sandboxed with `contextIsolation` and no Node.js globals.
- SSH connections prompt for trust when a new host fingerprint is seen; persisted trust is stored in `known_hosts`.

## Packaging & Distribution
Electron Builder targets are defined in `package.json`:
- macOS: default category `public.app-category.developer-tools`
- Windows: NSIS installer (`build/icon.ico`)
- Linux: AppImage, DEB, and RPM packages

Use `npm run pack` for quick test builds or `npm run dist` for platform installers. Generated artifacts appear under the `dist/` directory (ignored by Git).

## Troubleshooting
- **Electron download blocked** — re-run install with the bundled cache or temporarily use `npx electron@29 .` which fetches binaries on demand.
- **Missing PTY features** — ensure `node-pty` compiled successfully; otherwise, the app switches to the basic stdio shell.
- **SSH button disabled** — install the optional `ssh2` and `ssh2-sftp-client` packages as described above.

## Roadmap
- Enforce trusted host fingerprints with a full known-hosts experience.
- Add transfer drawer with upload/download for local and SSH sessions.
- Implement a command palette (Cmd/Ctrl + K) for quick actions.
- Build a settings surface for theme, shell, and SSH preferences.

## License
MIT © Smarterminal contributors

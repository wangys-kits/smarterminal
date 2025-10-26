# Smarterminal Technical Design (Aligned to current code)

Scope: Reflects the implementation in `app/main.js` and `app/renderer/*`. The original Tech.md targeted a broader MVP (TypeScript/React, auto-update, SSH UI). This document narrows to what exists now, and annotates gaps.

## 0. Goals & Non-goals
- Goals (current): Chat-style terminal with per-tab persistence; robust command completion; PTY-first with stdio fallback; lightweight monitoring and output logs; i18n; basic fs/transfer scaffolding.
- Non-goals (current): SSH connect UI, full file explorer pane, auto-update, credentials vault, port-forwarding (kept as roadmap).

## 1. Architecture Overview
- Processes
  - Main (Node): app lifecycle, windowing, terminal lifecycle (PTY/stdio), process monitoring, output streaming, basic fs ops, transfer manager scaffold, per-tab persistence.
  - Preload: secure IPC bridge; `contextIsolation=true`, `sandbox=true`; whitelisted channels only.
  - Renderer (Web): vanilla ES modules for chat-style terminal, tabs/home, i18n, minimal transfer drawer. xterm is loaded through a script tag.
- Tech stack: Electron, xterm.js, node-pty, tree-kill, electron-store. No framework; no TypeScript.

### 1.1 Security Defaults (Electron)
- BrowserWindow: `contextIsolation=true`, `sandbox=true`, `nodeIntegration=false`; preload only; devtools only when `NODE_ENV=development`.
- IPC: request/response via preload; channels are explicitly whitelisted; all responses use `{ ok, data? , error? }`.
- CSP: `default-src 'self'`; `style-src 'self' 'unsafe-inline'`; `script-src 'self'`; no remote code.

### 1.2 High-level Modules (actual)
- Terminal lifecycle (main): PTY via `node-pty` when possible; stdio fallback `spawn`. Handles `term.spawn|write|resize|kill|forceKill` and forwards data/metrics/events.
- TmuxManager (main): copies bundled tmux binaries to a cache, ensures tmux exists locally or on SSH targets, and provisions tmux-backed sessions (local + remote).
- CommandExecutor (main): separate `cmd.*` multi-instance execution via shell `-c/-Command`; used for future workflows; not bound in chat terminal by default.
- ProcessMonitor (main): polls OS (`ps`/`wmic`) for CPU/mem; tracks output rate; emits `update`/`high-*` events.
- OutputStreamer (main): per-pty/command log writer under `command-outputs/`; pruning old logs.
- Tabs persistence (main): `tabs/*.smt` JSON files with metadata and serialized chat state; CRUD via `tabs.*` IPC.
- FileService (main): local `fs.list/rename/delete/mkdir/createFile`.
 - FileService (main): local `fs.list/rename/delete/mkdir/createFile/copy` (no remote FS yet).
- TransferManager (main): queue and SFTP read/write primitives; relies on `ssh2` connections stored in-memory (no public connect IPC yet).
- `/view` preview pipeline:
  - Renderer parses `/view <path>` commands, infers kind (Markdown vs image) and rejects unsupported extensions early.
  - Renderer invokes `window.sm.fs.readFile` with cwd + byte limit; main process enforces `MAX_VIEW_TEXT_BYTES_DEFAULT` (2 MB) / `MAX_VIEW_IMAGE_BYTES_DEFAULT` (6 MB) and returns metadata + content/base64.
  - Renderer renders Markdown via `MarkdownRenderer` or inlines a `data:` URI for images; remote/tmux-over-SSH sessions return “not supported” errors.
- I18n (renderer): simple runtime dictionary (`app/renderer/i18n.mjs`), locale detection + switching.
 - Settings & Theme (renderer): language and theme controls persisted in `localStorage`; theme toggled via `data-theme` attribute.
 - Command Palette (renderer): modal with fuzzy filter and basic actions; no global shortcut bound yet.

## 2. Data Models (actual JSON)
- Tab file (`.smt` under app data/tabs):
  ```json
  {
    "title": "string",
    "favorite": false,
    "description": "string",
    "customTitle": false,
    "deleted": false,
    "deletedAt": null,
    "state": { "messages": ["<html…>", "…"] },
    "createdAt": 1710000000000,
    "updatedAt": 1710000000000
  }
  ```
- Settings/session stores via `electron-store` (`settings.json`, `session.json`).

## 3. IPC Contracts (whitelist)
Renderer calls via `window.sm.*` (preload):
- `term.spawn|write|resize|kill|forceKill`
- `cmd.execute|write|kill` (+ events `evt.cmd.data|exit|metrics|warning`)
- `fs.list|rename|delete|mkdir|createFile|copy`
- `tabs.list|create|save|rename|delete`
- `tx.enqueue|list|control` (+ event `evt.tx`)
- `settings.get|set`, `session.load|save`, `app.openExternal`, `app.openDialog`

Main -> Renderer events:
- Terminal: `evt.term.data|exit|metrics|warning` (warning types currently: `high-cpu`, `high-memory`)
- Commands: `evt.cmd.data|exit|metrics|warning` (warning types currently: `high-cpu`, `high-memory`)
- Transfers: `evt.tx`
Note: renderer registers handlers for `warning` but does not show UI indicators by default. `long-running` / `high-output-rate` are computed in monitor but not forwarded.

## 4. Key Algorithms & Flows

### 4.1 Robust Command Completion (Chat Terminal)
- For non-interactive commands, append a unique sentinel to the command:
  - OSC 133 diagnostic (`ESC ]133;D;smrt:<id>;exit:%d BEL`) plus a plain text fallback `__SMRT_DONE__<id>__%d__` where `%d` is `$?`.
  - The renderer strips both forms from output and treats detection as completion.
- For interactive commands (ssh/telnet/*sql shells), detect readiness via “substantial output + prompt heuristics”, then finalize and return to input. If output grows large without a clear prompt, fall back to finalize after a safe threshold.
- Prompt detection: rolling buffer scanned for common prompt patterns; combined with length thresholds.

### 4.1.1 Output Cleaning & Trailing Output Window
- The renderer sanitizes terminal output before rendering cells:
  - Strips OSC sequences (e.g., title updates), common CSI cursor movements, BEL, and stray control bytes; converts CRLF to LF.
- Removes echoed command lines and trailing prompt lines; compacts 3+ newlines to 2.
- After completion is detected, a trailing buffer of ~5s is kept to append late-arriving chunks to the just‑finalized cell (covers shells that emit extra lines on prompt return).

### 4.1.2 Output Virtualization & Copy Behaviour
- Each Out cell can switch to a “virtual” mode (`.cell-output-virtual`) when output exceeds the auto-height threshold. The renderer keeps:
  - A spacer element whose height equals `lineCount * lineHeight`.
  - A viewport container that renders only the visible slice plus overscan lines; `transform: translateY` is adjusted by the measured top padding to avoid clipping.
  - Cached metrics (line height, padding, scrollTop) to minimize layout reflows.
- CSS adds explicit top/bottom padding and a right-side gutter so timers/scrollbars never overlay the last lines.
- Copy logic clones the selection, removes `.cell-output-line-number`, and serializes remaining text so multi-line copies omit line numbers but keep spacing.

### 4.2 PTY vs stdio Strategies
- PTY: send Ctrl+C to stop; wait briefly before forced finalize.
- stdio: adjust newline handling; prefer immediate `term.forceKill` to stop non-responsive trees; still send Ctrl+C opportunistically.
- tmux-local: `term.spawn` asks `TmuxManager` for a local tmux session (falls back to PTY if unavailable); renderer defaults to this mode on macOS/Linux.
- tmux-ssh: `term.spawn` establishes an SSH connection via `ssh2`, ensures tmux exists remotely (auto-uploading bundled binaries), then streams `tmux attach-session` through the IPC bridge.

### 4.3 Monitoring & Output Streaming
- ProcessMonitor samples CPU/mem via `ps` (Unix) or `wmic` (Windows) and derives output rate from recent chunks; emits warnings at thresholds.
- OutputStreamer writes headers/tails and appends chunks to `command-outputs/*.log`, with simple retention by count.
   - Retention: keep latest N (default 50) logs, delete older ones.

## 5. File/Transfer Details
- Local fs ops via Node `fs/promises`.
- TransferManager supports upload/download with resume and conflict policy (overwrite/skip/rename). SSH connections are assumed to be present in `SSH_CONNS` (internal only for now).

## 6. SSH & Known Hosts (status)
- Command palette exposes a minimal "Open SSH Session" flow that spawns tmux-backed shells (agent/private-key/password auth still relies on `ssh2`).
- Host-key verification UI and persisted connection management remain TODO; the internal `SSH_CONNS` map is still scoped to transfer manager tasks.

## 7. Settings & Session Persistence
- `electron-store` for `settings` and `session`; per-tab `.smt` files for chat state.
- Renderer keeps UI prefs (locale, theme) in `localStorage`.
 - Fonts: command/output font size and color stored in `localStorage`; applied as CSS custom properties.

## 8. i18n Strategy
- Lightweight dictionary module (`i18n.mjs`) with runtime switching; persisting locale to `localStorage`.

## 9. Error Handling & Warnings
- Main returns `{ ok: false, error }` on failures; renderer surfaces alerts/toasts (basic) and cell-level error styling.
- Process warnings: `high-cpu`, `high-memory`, `long-running`, `high-output-rate` forwarded to renderer.

## 10. Build & Packaging
- electron-builder config present in `package.json`; app binaries target dev/test. Auto-update not wired.

## 11. Open Items / Roadmap
- SSH connect flow + known hosts + credentials
- File explorer pane and CWD sync (OSC 7/133)
- Command palette and richer settings (theme/font/profile)
- Auto-update and signing pipeline
### 4.4 Suggestions & Path Completion
- Suggestions: lightweight, frequency-based list persisted in `localStorage`, filtered by input; rendered as dropdown (`Tab` to open; arrows to navigate; `Enter` to accept).
- Path completion: renderer queries `fs.list` for current/relative dir to offer completions; integrates with both composer and editable cells.

### 4.5 `/view` Preview Flow
1. **Parsing & guardrails（renderer）**
   - `/view <path>` 被识别为特殊命令，支持带引号路径并自动反转义。
   - 根据扩展名判断类型：Markdown（`.md` 等）与常见图片（png/jpg/gif/webp/bmp/svg）；无匹配时直接给出“不支持”提示。
   - 远程/SSH 会话目前不支持预览：检测到 `backendMode` 含 `ssh` 时，直接在单元格中渲染告警。
2. **读取文件（IPC）**
   - 渲染端调用 `window.sm.fs.readFile({ path, cwd, maxBytes, encoding })`。
   - 主进程根据类型设置阈值：文本 2 MB、图片 6 MB；返回 `{ path, size, mtime, encoding, mime, content }`。
3. **渲染结果**
   - Markdown：复用 `MarkdownRenderer`，保持与聊天区一致的排版。
   - 图片：将二进制转为 `data:` URI，在 Out 区域内嵌显示，并附带文件名/大小/更新时间。
   - 错误：包含缺失、超限、读取失败等情况，统一渲染为错误卡片，同时保留系统消息。
4. **历史复跑**
   - `/view` 命令同样进入历史记录；从历史卡片或单元格重跑时，沿用既有上下文并刷新预览，焦点保持在原位置。

# UI/UX Guidelines v2 — Smarterminal

Design intent: minimal, high-contrast, calm neutrals with a confident blue‑violet accent; soft layering, crisp typography, keyboard-first. Terminal is the hero; file pane is utility. Light and Dark parity. WCAG AA.

## 1. Visual Language
- Layout
  - Top tab strip; main split vertical (terminal top, files bottom); splitter with handle.
  - Cards on neutral background to create hierarchy without heavy borders.
- Color Tokens (semantic)
  - Accent gradient: indigo→blue (`#7C3AED → #2563EB`), hover shifts lighter.
  - Light: bg `#FAFBFC`, surface `#FFFFFF`, border `#E6E9EF`, text1 `#0B1220`, text2 `#5B6475`.
  - Dark: bg `#0B1220`, surface `#0F1422`, border `#1D2433`, text1 `#E8ECF2`, text2 `#A8B0BF`.
  - Status: info `#3B82F6`, success `#10B981`, warn `#F59E0B`, danger `#EF4444`.
- Type & Sizing
  - UI: 14px/20 line; headings 16–18px (weight emphasis); monospace 13px.
  - Base spacing: 8px grid; radii 8 (cards), 6 (inputs), 10 (toasts).
- Elevation
  - Shadow S: `0 1px 2px rgba(0,0,0,.06)`; M: `0 6px 18px rgba(0,0,0,.12)`; blur not overused.

## 2. Components (key)
- Tabs
  - Floating pills; active tab with subtle surface + gradient underline 2px; close on hover; scrollable if overflow; new-tab as ghost button.
- Splitter
  - 2px line + 16px handle (three dots). Double-click reset. Ratio per-window memory.
- Terminal Pane
  - Dark canvas even in Light UI; 8px inner padding; ghost toolbar (find/copy/paste) fades until hover.
  - Disconnected banner inline; Enter to reconnect emphasized.
- File Pane
  - Header: breadcrumb chips, scope badge (Local/Remote), actions (icon-first with tooltip). Sticky header.
  - Table: virtualized, zebra subtle; symlink glyph; sort on Name/Size/Modified.
- Transfers Drawer
  - Right side; item cards with name/path, pill status, animated progress, speed/ETA.
- Dialogs
  - KnownHosts: fingerprint SHA‑256 in monospaced block; primary “Trust & Update” strong; secondary “Once”.
- Settings
  - Two column IA; sticky Apply/Reset; toggles with clear states; restart-required badge.

## 3. Interaction
- CWD/Host switch prompt (toast): actions [Switch][Always][Never]; per-connection remember.
- Keyboard parity: all actions mapped; visible focus ring 2px.
- Drag & drop: highlight folder row; illegal drops shake and explain.

## 4. Terminal Themes (presets)
- Light UI + Dark terminal (default). Provide: One Dark, Dracula, Solarized Dark/Light, Minimal Light.

## 5. Copy & Microtext (EN/ZH)
- Disconnected: EN “Connection lost. Press Enter to reconnect.” / ZH “连接已断开。按回车重新连接。”
- CWD off: EN “Enable shell integration to sync file path automatically.” / ZH “启用 Shell 集成以自动同步文件路径。”


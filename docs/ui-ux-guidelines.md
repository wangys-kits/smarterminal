# UI/UX Guidelines

Scope: Design system and interaction patterns for Smarterminal MVP (per docs/product-requirements.md and docs/technical-design.md). Cross‑platform Electron app. Light/Dark themes; a11y AA; keyboard-first.

## 1. Foundations
- Platform & Layout
  - Min window: 960×600; resizable. Breakpoints: S≥960, M≥1280, L≥1600.
  - App shell: Top tab bar; main area split vertically (terminal top, files bottom); draggable splitter.
  - Density: default Comfortable; optional Compact toggle (rows/buttons −2px). 
- Grid & Spacing
  - Base unit: 4px; scale: 4,8,12,16,20,24,28,32,40,48.
  - Content gutters: 16px; pane padding: 12px; table row height: 28px (compact 24, comfortable 32).
- Radii & Elevation
  - Radius: 6px (controls), 10px (toasts), 4px (menus). 
  - Shadows: level1 `0 1px 2px rgba(0,0,0,.08)`, level2 `0 4px 12px rgba(0,0,0,.12)`.
- Typography
  - UI font: system stack `-apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, sans-serif`.
  - Monospace: `SF Mono, Menlo, Consolas, DejaVu Sans Mono, Fira Code, monospace`.
  - Sizes: UI 13–14px; Terminal default 13px; line-height 1.4; headings use weight not size where possible.
- Iconography
  - 16px (UI), 20px (toolbar), 12px (badges). Single-color, currentColor; use SVG sprites.
- Motion
  - Durations: 120–160ms micro; 200–240ms overlays; easing: `cubic-bezier(0.2, 0, 0, 1)`.
- Accessibility (WCAG AA)
  - Min contrast: 4.5:1 body, 3:1 large text/icons; focus ring 2px visible; tab order logical; ARIA roles on lists/menus.
  - Target sizes ≥ 32×32px; keyboard parity for all actions.

## 2. Theming & Tokens
- Semantic tokens (CSS variables)
```css
:root {
  /* Base */
  --bg: #ffffff; --bg-elev: #f6f7f9; --surface: #eef0f2; --border: #e1e4e8;
  --text-1: #111826; --text-2: #58657a; --text-3: #9aa4af;
  --accent: #2563eb; --accent-hover: #1d4ed8; --accent-ghost: rgba(37,99,235,.12);
  --info: #0ea5e9; --success: #10b981; --warning: #f59e0b; --danger: #ef4444;
  --focus: #22c55e; /* fallback to accent if prefers */
  --ring: 2px solid color-mix(in srgb, var(--accent) 60%, white);
  /* Controls */
  --btn-h: 28px; --toolbar-h: 36px; --tab-h: 36px; --splitter-w: 6px;
}
[data-theme="dark"] {
  --bg: #0f172a; --bg-elev: #111827; --surface: #1f2937; --border: #2b3645;
  --text-1: #f3f4f6; --text-2: #cfd6dd; --text-3: #9aa4af;
  --accent: #3b82f6; --accent-hover: #60a5fa; --accent-ghost: rgba(59,130,246,.18);
  --info: #38bdf8; --success: #34d399; --warning: #fbbf24; --danger: #f87171;
  --focus: #22d3ee;
}
```
- Usage
  - Prefer semantic tokens over raw colors; components expose `variant` props (`primary/secondary/subtle/danger`).
  - TrueColor terminal palette aligns with theme; provide presets (Solarized, One Dark, Dracula, Light).

## 3. App Shell Components
- Title/Tab Bar (top)
  - Height 36px; tabs left-aligned; new-tab `+` at right of the last tab.
  - Tab anatomy: icon (host type), label, close `×`. Active: accent underline 2px; hover: subtle bg.
  - Context menu: Close, Close Others, Close Right, Close All, Rename. Shortcuts displayed.
  - Roving tabindex for arrow navigation; Ctrl/Cmd+W closes focused tab.
- Splitter
  - 6px visible bar; 12px hit target (invisible padding); cursor `row-resize`.
  - Double-click resets to default ratio; tooltip shows current percentage; ratio persisted per window.
- Status micro-bar (optional)
  - Right side of toolbar: connection icon (state), transfer summary (n running), toggle for hidden files.

## 4. Terminal Pane (top)
- Content
  - xterm.js fills pane; padding 8px; background uses terminal theme; scrollback size user-defined.
  - Toolbar (inline ghost buttons): Find, Copy, Paste, Clear, Settings (opens Terminal settings).
- States
  - Disconnected SSH: inline banner with copyable error + action "Press Enter to reconnect".
  - CWD/Host switch toast: bottom-right, 8s timeout, actions [Switch][Always][Never].
- Context menu
  - Copy, Paste, Find…, Select All, Clear Scrollback, Open Settings.
- Accessibility
  - IME caret visible; focus ring when term is focusable; Esc returns focus from file pane to terminal.

## 5. File Pane (bottom)
- Header
  - Breadcrumb path (ellipsis middle on overflow), Refresh (F5), Upload, Download, Toggle hidden, Scope badge (Local/Remote).
- Table
  - Columns: Name (icon+text), Size, Modified, Type, Perm (read-only); sortable Name/Size/Modified.
  - Row height 28px; text truncation with ext preserved; multi-select (Shift/Ctrl/Cmd).
  - Virtualized list; incremental load for >10k entries; empty state with quick actions.
- Drag & Drop
  - Drag-over highlights drop target row/folder; show upload count/size hint; illegal drop -> shake + tooltip.
- Context menu
  - Open (enter/expand folder), Upload/Download, Rename, Delete, New File/Folder, Copy Path, Reveal in Finder/Explorer (local only).
  - Symlink: show link glyph; actions operate on link (default); extra action "Go to target".
- Errors
  - Read-only/perm: inline toast + badge on row; Disk full: preflight warning before download.

## 6. Transfers UI
- Access
  - Secondary panel toggled from file header (button: Transfers). Drawer from right (min 320px, max 480px).
- Rows
  - Fields: file name/path, direction, progress bar, speed, ETA, status icon, actions [Pause/Resume][Cancel].
  - Group by session/host; sort by start time desc. Completed collapse after 10min; clear-all button.
- Conflict dialog
  - Title: File exists. Options: Overwrite / Skip / Rename. Checkbox "Apply to all". Secondary note for invalid names (auto-normalize info).

## 7. Dialogs & Notifications
- KnownHosts Trust
  - Content: Host, Algo, SHA-256 fingerprint; prior fingerprint if mismatch; options: Trust & Update, Once, Cancel.
- Delete/Overwrite Confirm
  - Destructive emphasis; show count and first N names; checkbox "Don’t ask again (this session)".
- Port Binding Error
  - Message with current port; actions: Try Next Port / Edit Rules / Cancel.
- Toasts
  - Bottom-right; level color (info/success/warn/error); max 3 stacked; 8s auto-dismiss; keyboard focusable.

## 8. Settings IA
- Sections
  - Appearance (theme, fonts, density, terminal palettes)
  - Terminal (default shell, scrollback, encoding, TrueColor)
  - Connections (KnownHosts policy, Agent default, KeepAlive)
  - Transfers (downloads dir, ask each time, concurrency + adaptive, checksum)
  - Layout (split ratio defaults, show hidden)
  - Updates & Privacy (auto-update mode, Linux behavior, telemetry toggle, log level)
- Patterns
  - Left nav vertical; right pane forms; sticky footer with [Apply][Reset]. Changes apply immediately when safe; some flagged “Restart required”.

## 9. Keyboard & Shortcuts
- Global/Tab
  - New Tab Cmd/Ctrl+T; Close Tab Cmd/Ctrl+W; Next/Prev Tab Ctrl+Tab / Shift+Ctrl+Tab; Rename Cmd/Ctrl+R.
- Focus & Panes
  - Terminal↔Files Alt+↑/Alt+↓; Esc focuses terminal.
- Files
  - Refresh F5; Upload Cmd/Ctrl+U; Download Cmd/Ctrl+D; Enter open; Delete delete; F2 rename.
- Terminal
  - Find Cmd/Ctrl+F; Copy Cmd/Ctrl+C (when selection); Paste Cmd/Ctrl+V; Clear Ctrl+L.

## 10. Accessibility & i18n
- Focus
  - 2px outer ring; color uses `--focus`; avoid relying on color alone for states (icons/labels).
- Screen readers
  - Tabs: `role=tablist` + roving tabindex; Tables: `role=grid`; Toasters: `aria-live=polite`.
- i18n
  - Text expansion +30%; avoid clipped labels; show shortcuts in menus (localized). Date/size localized.

## 11. Component States
- Buttons: default/hover/active/disabled/keyboard-focus.
- Inputs: placeholder/helper/error states; error color uses `--danger`.
- Menus: hover + focus + checked (for toggles).
- Tabs: normal/hover/active/dragging/unread (optional dot for events).
- Table rows: normal/hover/selected/drag-over/disabled.

## 12. Terminal Themes (presets)
- Light: base on One Light; Dark: One Dark / Dracula; User can pick, saved per profile.
- Palette mapping to xterm: `foreground`, `background`, `cursor`, `selection`, 16 ANSI colors; TrueColor enabled.

## 13. Resizing & Performance
- Splitter throttling at 60Hz; xterm relayout debounced (50ms) to avoid jank.
- Virtual list row recycling; column resize disabled when >10k items.
- Avoid expensive shadows in lists; prefer flat surfaces.

## 14. Error/Empty States Copy (examples)
- SSH disconnected: "Connection lost. Press Enter to reconnect or edit connection settings."
- CWD sync off: "Could not detect current directory. Enable shell integration to sync files automatically."
- WSL unreachable: "WSL path is not available. Ensure the distro is running and accessible via \\wsl$."
- Empty folder: "This folder is empty." Actions: [Upload][New File][New Folder].

## 15. Naming & Icons
- Host types: local (computer), ssh (server), wsl (tux), warning (triangle), success (check), danger (trash), transfer (arrow up/down).
- File icons by type (folder/file/link); do not load external icon themes; keep minimal.

## 16. Implementation Notes
- CSS-in-JS or CSS modules both fine; expose tokens as CSS variables at root and `data-theme` switch.
- High DPI: use vector SVG; hint 1px borders use color blending to avoid blurriness.
- System integration: respect OS accent when possible (optional setting).


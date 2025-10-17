# Eclipse Workbench Refined Spec (Clean Sheet inspired)

Reference: Eclipse 2020-era light theme (Clean Sheet). Goal: replicate familiar workbench structure and visual density while fitting Smarterminal's scope.

## 1. Workbench Layout
- Menubar (28px): File, Edit, View, Terminal, Transfers, Window, Help
- Toolbar/Trimbar (36px): left tool icons (16px), separators, right-aligned Quick Access field; overflow chevron optional
- Part Stacks (Views)
  - Terminal (top) with editor-like tabs (flat, bold active label, 2px blue underline)
  - Files (bottom) with title bar and per-view toolbar (Upload/Download/Refresh/Hidden)
- Sashes: 1px divider + hover handle; double-click reset
- Status Bar (28px): connection state, transfer summary, encoding, cols×rows, quick hints

## 2. Visual Tokens
- Light
  - Menubar/Toolbar: #ECEFF4; Borders: #D7DDE8; Surface: #FFFFFF; Content bg: #FFFFFF
  - Accent: #3272D9 (active) / #5AA9FF (focus ring)
  - Text: #1B2330 primary / #5B6475 secondary
- Dark (optional parity)
  - Menubar/Toolbar: #2B303B; Borders: #3A4250; Surface: #1E2430; Content bg: #1E2230
  - Accent: #5AA9FF; Text: #E8ECF2 / #A8B0BF
- Shadows: none or very subtle; gradients avoided (flat e4 style)
- Radii: tabs 4px, inputs 6px, view cards 6px
- Sizing: UI 14px; monospace 13px; toolbar button 28×24; tab height 28px

## 3. Components
- Menus: top-level with mnemonic underlines, separators; keyboard shortcuts aligned right
- Toolbar icons: single-color glyphs; pressed=darken 8%; disabled=opacity .45
- Tabs: rect pills; close button on hover; context menu: Close / Close Others / Close Right / Close All / Rename
- View title bar: icon+title left; view menu (▾) right + inline actions
- Tables: zebra .5 shade; header separators; sort indicators ▲▼; selection fill accent 12%
- Quick Access: right input (⌘/Ctrl+K focus) with suggestions; executes commands/hosts/paths
- Status bar: left message area; right indicators (host, transfers, encoding, size)

## 4. Interactions
- Shortcuts: F5 refresh, F2 rename, Del delete, Enter open, Ctrl/Cmd+T new tab, Ctrl/Cmd+W close
- Drag & drop: folder row highlight; illegal drop tooltip
- CWD/Host toast: bottom-right; Eclipse style balloon; actions Switch/Always/Never

## 5. A11y/i18n
- AA contrast; 2px focus rings; ARIA roles; +30% text expansion resilience


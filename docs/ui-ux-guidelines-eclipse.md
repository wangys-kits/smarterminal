# UI/UX Guidelines — Eclipse-inspired Workbench

Goal: Bring Eclipse IDE (e4) workbench familiarity: menu bar + toolbars (trim bars), editor-style tabs, view title bars, sash splitters, status bar. Keep our product scope (terminal on top, files at bottom), but align visuals and interactions to Eclipse.

## 1. Workbench Structure
- Menubar (top): File, Edit, View, Terminal, Transfers, Window, Help
- Toolbar (below menubar): icon actions (New Tab, Connect, Upload, Download, Refresh, Find), Quick Access field at right
- Perspective switcher (right of toolbar): compact icons (Terminal, Files)
- Part stacks (views):
  - Terminal view (top): title bar with icon + title + view menu (▾); editor-style tab strip for sessions
  - Files view (bottom): title bar + actions (New Folder, Upload, Toggle Hidden)
- Sash splitters: 1px line with grippy; double-click reset; Eclipse-like hover handle
- Status bar (bottom): connection status, transfers summary, message area

## 2. Visual Tokens
- Light theme
  - Menubar/toolbar: #ECEFF4; borders #D7DDE8; surface #FFFFFF; content bg #FFFFFF
  - Text primary #1B2330; secondary #5B6475
  - Accent (selection/active): #3272D9 (Eclipse blue); focus ring #5AA9FF
- Dark theme
  - Menubar/toolbar: #2B303B; borders #3A4250; surface #1E2430; content bg #1E2230
  - Text primary #E8ECF2; secondary #A8B0BF; accent: #5AA9FF
- Iconography: 16/20px mono-color with subtle blue tint on active; classic Eclipse glyph simplicity
- Typography: 14px UI; 13px monospace (Fira Code optional), line-height 1.4

## 3. Components
- Editor Tabs (top of Terminal view)
  - Flat rectangles; active tab label bold; active underline 2px accent; close button visible on hover
- View Title Bar
  - Left: icon + title; Right: view menu (▾) + per-view actions; background matches toolbar (slightly darker than content)
- Toolbar Buttons
  - Square 28px, minimal borders; pressed state darkens; disabled lowers contrast
- Quick Access
  - Right-aligned search field (Cmd/Ctrl+K focus); suggests commands/hosts; arrow navigate; Enter to execute
- Tables
  - Subtle zebra; header separators; selection uses accent background at 10–14% opacity

## 4. Interaction & Shortcuts
- Close/Close Others/Close Right on tab context menu (Eclipse pattern)
- Quick Access focus: Cmd/Ctrl+K; Esc to clear; F2 rename; Delete remove; F5 refresh
- Toasts: bottom right; status bar shows last message (Eclipse-like)

## 5. A11y & i18n
- WCAG AA; focus ring 2px; ARIA roles for tabs/grids/menus; locale-safe labels; dates and sizes localized


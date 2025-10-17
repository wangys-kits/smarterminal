# Modern Internet Design Guidelines — Smarterminal

Direction: contemporary, premium, minimal. Neutral layers, rich micro-contrast, brand-blue accent, soft depth (shadow S/M), rounded 12. Keyboard-first; editor-grade usability.

## 1. Tokens
- Colors (Light)
  - bg `#F7F8FA`, surface `#FFFFFF`, surface-2 `#F2F4F7`, border `#E6EAF0`
  - text-1 `#0B1220`, text-2 `#5B6475`, text-3 `#9AA4AF`
  - brand `#2563EB`, brand-2 `#7C3AED` (gradient optional), focus `#22D3EE`
  - info `#3B82F6`, success `#10B981`, warn `#F59E0B`, danger `#EF4444`
- Colors (Dark)
  - bg `#0B1220`, surface `#111827`, surface-2 `#141B2A`, border `#1F2937`
  - text-1 `#E8ECF2`, text-2 `#A8B0BF`, text-3 `#7C8599`
  - brand `#3B82F6`, focus `#22D3EE`
- Spacing & Radii: 8px grid; radius 12 (cards), 8 (inputs), 6 (tabs);
- Type: UI 14/20, headings 16/22, monospace 13/18 (Fira Code optional)
- Elevation: S `0 1px 2px rgba(0,0,0,.06)`, M `0 8px 24px rgba(0,0,0,.12)`

## 2. App Shell
- Top app bar: brand at left (icon+name), global actions at right (New Tab, Settings, Profile)
- Tabs: floating pills; active subtle surface + brand underline 2px; overflow scroll; close on hover
- Splitter: 2px line + 16px handle; double-click reset; per-window ratio memory
- Status strip: bottom micro bar for connection/encoding/size/transfer summary

## 3. Terminal Pane
- Dark canvas even in light theme; 8px inner padding; ghost toolbar (Find/Copy/Paste) fades until hover
- Disconnected banner inline; Enter to reconnect; short error copy
- Search panel slides from top inside terminal; Cmd/Ctrl+F

## 4. File Pane
- Header: breadcrumb chips + inline editable path; scope badge (Local/Remote)
- Actions: Upload, Download, Refresh, Hidden toggle; icon-first with tooltip
- Table: virtualized; columns Name/Size/Modified/Type/Perm; row height 28; zebra 3%; selection tint brand@10%
- Empty state: friendly copy + primary actions; drag&drop hint

## 5. Transfers Drawer
- Right drawer 360px; card rows with name/path, progress, speed, ETA; actions [Pause/Resume][Cancel]
- Gradient progress (brand→brand-2), paused dims 40%

## 6. Command Bar
- Global overlay (Cmd/Ctrl+K): fuzzy search commands/hosts/paths; quick hints; keyboard-first

## 7. Accessibility & i18n
- WCAG AA; 2px focus ring; ARIA roles for tablist, grid, menus; +30% text expansion readiness

## 8. Micro Interactions
- Easing `cubic-bezier(0.22, 1, 0.36, 1)`; 160–200ms; toasts stack ≤3 at BR; 8s auto-dismiss


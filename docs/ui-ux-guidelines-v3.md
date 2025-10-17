# UI/UX Guidelines v3 — Smarterminal (Flagship)

Design north star: tech-forward, editor‑grade usability, flagship internet brand polish. Minimal chrome, glass layering, neon accent (indigo→cyan), pristine typography, motion restraint. Terminal is hero; files are power tools.

## 1. Brand & Visual Language
- Accent: gradient indigo→electric cyan (`#6D28D9 → #22D3EE`), used as underline, progress, focus, selection.
- Neutrals (Light): bg `#F9FAFB`, surface `#FFFFFF`, surface-2 `#F3F4F6`, border `#E5E7EB`, text-1 `#0B1220`, text-2 `#5B6475`.
- Neutrals (Dark): bg `#0B1220`, surface `#0F1422`, surface-2 `#131A2E`, border `#1E2638`, text-1 `#E8ECF2`, text-2 `#A8B0BF`.
- Elevation: frosted glass overlays (blur 8–12, 10–20% white/black tint), shadow subtle.
- Grid: 8px base; radius: 12 (cards), 8 (inputs), 10 (toasts), 6 (tabs).
- Typography: UI 14/20, titles 16/22, monospace 13/18 (Fira Code optional ligatures).

## 2. Interaction Tenets
- Keyboard‑first: every action has shortcut; command palette (Cmd/Ctrl+K) exposes all operations.
- Zero‑clutter: ghost toolbars; show on hover/focus; contextual bulk action bar appears only on multi‑select.
- Predictable edits: inline rename with select‑stem behavior; conflict dialog gives smart suggestions.
- Performance: virtual lists, debounce resize, avoid heavy shadows.

## 3. Components (Flagship Styling)
- Tabs: floating pills; active has neon gradient underline; hover shows close; scrollable; new tab is hollow pill.
- Splitter: 2px line + glass handle (3 dots); double‑click reset; ratio per window.
- Terminal: dark canvas, 8px padding; ghost toolbar (Find/Copy/Paste); banner for reconnect; IME friendly.
- File Header: breadcrumb chips + editable path field toggle; scope badge (Local/Remote) with subtle glow.
- File Table: zebra minimal; icons monochrome; selection tinted with accent alpha; multi‑select shows bulk bar.
- Transfers: right drawer; card rows with gradient progress; speed/ETA styled as microtext.
- Dialogs: glass card with strong primary and clear secondary; monospace blocks for hashes.

## 4. Editing Usability Patterns
- Inline rename: select basename without extension first; F2 to rename; Enter to commit; Esc to cancel.
- Bulk action bar: appears at bottom when ≥2 rows selected; actions: Download, Upload (if local), Rename, Move, Delete; session‑scoped "Don’t ask again" toggle for destructive.
- Command palette: Cmd/Ctrl+K; fuzzy search across commands, hosts, paths; arrow navigation; shows shortcuts.
- Conflict dialog (pro): side‑by‑side meta (size/mtime) + suggested safe name (`name (2).ext`, hashed if too long/invalid).

## 5. Motion & Feedback
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)` (springy) for tabs/toasts; 160–220ms.
- Progress: gradient sweep for active tasks; paused dims to 40%.
- Focus: 2px neon ring (cyan) with 1px inner overlay; accessible on dark and light.

## 6. A11y & i18n
- WCAG AA; focus management for overlays; ARIA roles for tabs/menus/grids; i18n safe text expansion +30%.

Note: v3 refines v2 visuals without changing feature scope; command palette surfaces existing operations.

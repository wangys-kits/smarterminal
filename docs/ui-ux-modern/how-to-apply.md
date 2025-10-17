# How to Apply the Modern Theme

- CSS tokens: import `design-system/modern/tokens.css` in renderer and switch dark chrome by toggling `data-theme="dark"` on `<html>`.
- Terminal (xterm): load `design-system/modern/xterm-theme.json` and map to xterm options:

JavaScript example
```js
import theme from '../../design-system/modern/xterm-theme.json';
const term = new Terminal({
  theme: {
    foreground: theme.foreground,
    background: theme.background,
    cursor: theme.cursor,
    selectionBackground: theme.selectionBackground,
    black: theme.black,
    red: theme.red,
    green: theme.green,
    yellow: theme.yellow,
    blue: theme.blue,
    magenta: theme.magenta,
    cyan: theme.cyan,
    white: theme.white,
    brightBlack: theme.brightBlack,
    brightRed: theme.brightRed,
    brightGreen: theme.brightGreen,
    brightYellow: theme.brightYellow,
    brightBlue: theme.brightBlue,
    brightMagenta: theme.brightMagenta,
    brightCyan: theme.brightCyan,
    brightWhite: theme.brightWhite
  }
});
```

- Components: use CSS variables (`--surface`, `--border`, `--radius-card`) for cards, and `--brand` as accent underline for active tabs.
- Focus: apply `.sm-focus` to ensure visible 2px cyan ring.

Notes
- Terminal keeps dark canvas even under light UI chrome per PRD.
- Respect WCAG AA contrast; avoid lowering text opacity below 70% for body text.

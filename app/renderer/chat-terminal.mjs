/* Chat-style Terminal Module - Claude Code inspired */

import { MarkdownRenderer } from './chat-terminal-markdown.mjs';
import { CommandSuggestions } from './chat-terminal-suggestions.mjs';
import { CellManager } from './chat-terminal-cells.mjs';
import { PathCompleter } from './chat-terminal-path-completer.mjs';
import i18n from './i18n.mjs';

export const INTERACTIVE_SENTINEL = '__SMRT_INTERACTIVE_DONE__';
const COMMAND_DONE_SENTINEL_PREFIX = '__SMRT_DONE__';
const MAX_COMMAND_HISTORY = 500;

const EXTENSION_LANGUAGE_MAP = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  json5: 'json',
  py: 'python',
  pyw: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  cs: 'csharp',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cxx: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  php: 'php',
  rb: 'ruby',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'css',
  less: 'css',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  sql: 'sql',
  md: 'markdown'
};

const JAVASCRIPT_PATTERNS = [
  { regex: /\/\/[^\n]*/g, token: 'comment' },
  { regex: /\/\*[\s\S]*?\*\//g, token: 'comment' },
  { regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, token: 'string' },
  { regex: /\b(?:const|let|var|function|return|if|else|switch|case|break|continue|class|extends|new|try|catch|finally|throw|import|from|export|default|async|await|yield|of|in)\b/g, token: 'keyword' },
  { regex: /\b(?:true|false|null|undefined|NaN|Infinity)\b/g, token: 'literal' },
  { regex: /\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?\b/g, token: 'number' }
];

const PYTHON_PATTERNS = [
  { regex: /#[^\n]*/g, token: 'comment' },
  { regex: /"""[\s\S]*?"""|'''[\s\S]*?'''/g, token: 'string' },
  { regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, token: 'string' },
  { regex: /\b(?:def|class|return|if|elif|else|for|while|try|except|finally|raise|with|as|from|import|pass|break|continue|lambda|yield|async|await|True|False|None)\b/g, token: 'keyword' },
  { regex: /\b\d+(?:\.\d+)?\b/g, token: 'number' }
];

const C_LIKE_PATTERNS = [
  { regex: /\/\/[^\n]*/g, token: 'comment' },
  { regex: /\/\*[\s\S]*?\*\//g, token: 'comment' },
  { regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, token: 'string' },
  { regex: /\b(?:class|struct|enum|return|if|else|for|while|switch|case|break|continue|typedef|const|static|public|private|protected|import|package|try|catch|finally|throw|throws|new|using|namespace|template|func|defer|go|select|interface|impl)\b/g, token: 'keyword' },
  { regex: /\b(?:true|false|null|nullptr)\b/g, token: 'literal' },
  { regex: /\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?\b/g, token: 'number' }
];

const SHELL_PATTERNS = [
  { regex: /#[^\n]*/g, token: 'comment' },
  { regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, token: 'string' },
  { regex: /\b(?:if|then|fi|elif|else|for|while|do|done|case|esac|function|select|in)\b/g, token: 'keyword' },
  { regex: /\$[A-Za-z_][A-Za-z0-9_]*|\$\{[^}]+\}/g, token: 'property' }
];

const JSON_PATTERNS = [
  { regex: /"(?:\\.|[^"\\])*"(?=\s*:)/g, token: 'property' },
  { regex: /"(?:\\.|[^"\\])*"/g, token: 'string' },
  { regex: /\b(?:true|false|null)\b/g, token: 'literal' },
  { regex: /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, token: 'number' }
];

const YAML_PATTERNS = [
  { regex: /#[^\n]*/g, token: 'comment' },
  { regex: /(^(?:\s*[-\w\.]+))(?=\s*:)/gm, token: 'yaml-key' },
  { regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, token: 'string' },
  { regex: /\b(?:true|false|null|~)\b/gi, token: 'literal' },
  { regex: /-?\d+(?:\.\d+)?/g, token: 'number' }
];

const HTML_PATTERNS = [
  { regex: /<\/?[A-Za-z][^>]*?>/g, token: 'tag' },
  { regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, token: 'string' }
];

const CSS_PATTERNS = [
  { regex: /\/\*[\s\S]*?\*\//g, token: 'comment' },
  { regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, token: 'string' },
  { regex: /\b[\d\.]+(?:px|rem|em|vh|vw|%)\b/g, token: 'number' },
  { regex: /#[0-9a-fA-F]{3,8}\b/g, token: 'number' },
  { regex: /\b[a-z-]+(?=\s*:)/g, token: 'property' },
  { regex: /\b(?:var|calc|clamp|rgb|rgba|hsl|hsla)\b/g, token: 'function' }
];

const SQL_PATTERNS = [
  { regex: /--[^\n]*/g, token: 'comment' },
  { regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, token: 'string' },
  { regex: /\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP|BY|ORDER|LIMIT|AND|OR|NOT|NULL|AS|ON|DISTINCT|CREATE|TABLE|PRIMARY|KEY|FOREIGN|DROP|ALTER)\b/gi, token: 'sql-keyword' },
  { regex: /-?\d+(?:\.\d+)?/g, token: 'number' }
];

const RUBY_PATTERNS = [
  { regex: /#[^\n]*/g, token: 'comment' },
  { regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, token: 'string' },
  { regex: /\b(?:def|class|module|return|if|elsif|else|end|begin|rescue|ensure|case|when|while|until|for|yield|self|super|true|false|nil)\b/g, token: 'keyword' },
  { regex: /\b\d+(?:\.\d+)?\b/g, token: 'number' }
];

const TOML_PATTERNS = [
  { regex: /#[^\n]*/g, token: 'comment' },
  { regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, token: 'string' },
  { regex: /\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})?)?\b/g, token: 'literal' },
  { regex: /\b\d+(?:\.\d+)?\b/g, token: 'number' },
  { regex: /(^\s*[A-Za-z0-9_\-\.]+)(?=\s*=)/gm, token: 'property' }
];

const INI_PATTERNS = [
  { regex: /;[^\n]*/g, token: 'comment' },
  { regex: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, token: 'string' },
  { regex: /(^\s*[A-Za-z0-9_\-\.]+)(?=\s*=)/gm, token: 'property' }
];

const MARKDOWN_PATTERNS = [
  { regex: /^\s{0,3}#{1,6}.*/gm, token: 'keyword' },
  { regex: /`[^`]+`/g, token: 'string' },
  { regex: /\*\*[^*]+\*\*|__[^_]+__/g, token: 'literal' }
];

const SYNTAX_SPECS = {
  javascript: { aliases: ['typescript', 'jsx', 'tsx'], patterns: JAVASCRIPT_PATTERNS },
  python: { patterns: PYTHON_PATTERNS },
  go: { patterns: C_LIKE_PATTERNS },
  rust: { patterns: C_LIKE_PATTERNS },
  java: { patterns: C_LIKE_PATTERNS },
  php: { patterns: C_LIKE_PATTERNS },
  c: { patterns: C_LIKE_PATTERNS },
  cpp: { aliases: ['c++'], patterns: C_LIKE_PATTERNS },
  csharp: { aliases: ['cs'], patterns: C_LIKE_PATTERNS },
  swift: { patterns: C_LIKE_PATTERNS },
  kotlin: { patterns: C_LIKE_PATTERNS },
  ruby: { patterns: RUBY_PATTERNS },
  json: { patterns: JSON_PATTERNS },
  yaml: { aliases: ['yml'], patterns: YAML_PATTERNS },
  bash: { aliases: ['shell', 'sh', 'zsh', 'fish'], patterns: SHELL_PATTERNS },
  html: { patterns: HTML_PATTERNS },
  css: { patterns: CSS_PATTERNS },
  sql: { patterns: SQL_PATTERNS },
  toml: { patterns: TOML_PATTERNS },
  ini: { patterns: INI_PATTERNS },
  markdown: { aliases: ['md'], patterns: MARKDOWN_PATTERNS }
};


export class ChatTerminal {
  static VIEW_MAX_TEXT_BYTES = 2 * 1024 * 1024;
  static VIEW_MAX_IMAGE_BYTES = 6 * 1024 * 1024;
  static bindExecuteButton(button) {
    if (ChatTerminal.executeButton !== button) {
      if (ChatTerminal.executeButton && ChatTerminal._executeClickHandler) {
        ChatTerminal.executeButton.removeEventListener('click', ChatTerminal._executeClickHandler);
      }
      ChatTerminal.executeButton = button || null;
      if (ChatTerminal.executeButton) {
        ChatTerminal._executeClickHandler = (event) => {
          event.preventDefault();
          const inst = ChatTerminal.activeInstance;
          if (!inst || !inst.isActive || inst.isRestarting || inst.isCommandRunning || !inst.terminalReady) return;
          inst.executeCommand();
        };
        ChatTerminal.executeButton.addEventListener('click', ChatTerminal._executeClickHandler);
      } else {
        ChatTerminal._executeClickHandler = null;
      }
    }
    ChatTerminal.updateExecuteButtonState();
  }

  static updateExecuteButtonState() {
    const button = ChatTerminal.executeButton;
    if (!button) return;
    const inst = ChatTerminal.activeInstance;
    const shouldDisable = !inst || !inst.isActive || inst.isRestarting || inst.isCommandRunning || !inst.terminalReady || inst.input?.disabled;
    button.disabled = shouldDisable;
  }

  constructor(container, inputEl, messagesEl, statusEl, executeButton = null) {
    this.container = container;
    this.input = inputEl;
    this.messages = messagesEl;
    this.statusEl = statusEl;
    this.executeButton = executeButton || document.getElementById('commandExecuteBtn') || null;
    ChatTerminal.bindExecuteButton(this.executeButton);
    this.history = [];
    this.historyIndex = -1;
    this.historyDraft = '';
    this.currentCommand = null;
    this.lastCommand = null;
    this.writer = null;
    this.messageHistory = [];
    this.isCommandRunning = false;
    this.commandBusyWarningShown = false;
    this.isRestarting = false;
    this.inputMode = 'code';
    this.inputWrapper = this.input.closest('.command-input-wrapper');
    this.savedInputMode = 'code';
    this.commandQueue = [];
    this.selectedCell = null;
    this.composerSelected = false;
    this.lastDeleteKeyTime = 0;
    this.handleGlobalKeydown = this.handleGlobalKeydown.bind(this);
    this.handleWindowResize = () => this.positionSuggestionsDropdown();
    this.changeHandler = null;
    this.changeDebounce = null;
    this.isActive = false;
    this.getTabState = null;  // Function to get current tab state
    this.onCommandRunningChange = null; // Callback for tab-level command status
    this.terminalReady = false;  // PTY is ready to accept commands
    // Host (renderer) may provide a direct persist callback to force an
    // immediate save of this tab's state. We keep it optional to avoid
    // tight coupling; when undefined we fall back to debounced saves.
    this.requestPersist = null;

    // Double Tab detection for command suggestions
    this.lastTabTime = 0;
    this.tabTimeout = 500; // 500ms window for double Tab

    // Initialize modules
    this.markdownRenderer = new MarkdownRenderer();
    this.suggestions = new CommandSuggestions();
    this.cellManager = new CellManager(this);
    this.pathCompleter = new PathCompleter();

    // Line number gutter for current textarea input
    try {
      this.inputLineNumbersEl = document.getElementById('inputLineNumbers');
    } catch (_) { this.inputLineNumbersEl = null; }

    // Expose cell manager properties for backward compatibility
    this.cellCounter = 1;
    this.cellIdCounter = 1;
    this.savedCellCounter = 1;
    this.pendingDeletionCells = new Set();

    this.setupInputHandlers();
    this.setupAutoResize();
    this.setupSelectionHandlers();
    if (!ChatTerminal._copyListenerRegistered) {
      ChatTerminal._copyListenerRegistered = true;
      ChatTerminal._copyListener = (event) => {
        const inst = ChatTerminal.activeInstance;
        if (inst) inst.handleOutputCopy(event);
      };
      document.addEventListener('copy', ChatTerminal._copyListener);
    }
    window.addEventListener('resize', this.handleWindowResize);
    this.setInputMode('code', { silent: true });
    this.handleDocumentClick = (event) => {
      if (!this.isActive) return;
      if (this.inputWrapper && this.inputWrapper.contains(event.target)) return;
      if (this.container && this.container.contains(event.target)) return;
      this.clearComposerSelection();
    };
    document.addEventListener('mousedown', this.handleDocumentClick);
    if (this.container) {
      this.container.addEventListener('scroll', this.handleWindowResize);
    }

    this.commandSentinelCounter = 0;
    // Track interactive SSH session target (best-effort)
    this.pendingSshTarget = null; // { host, user, port }
    this.activeSshTarget = null;  // becomes non-null once remote shell prompt is detected

    // Debug logging toggle: enable by running in DevTools
    //   localStorage.setItem('sm.debugTerm', '1');  // enable
    //   localStorage.removeItem('sm.debugTerm');    // disable
    this.debugEnabled = false;
    try {
      this.debugEnabled = Boolean(
        (window && window.localStorage && window.localStorage.getItem('sm.debugTerm')) ||
        (window && window.smDebugTerm)
      );
    } catch (_) {}
    try {
      // Provide a simple runtime toggle without reload
      if (typeof window !== 'undefined') {
        window.setSmDebug = (on) => {
          try { if (on) localStorage.setItem('sm.debugTerm', '1'); else localStorage.removeItem('sm.debugTerm'); } catch (_) {}
          window.smDebugTerm = !!on;
          this.debugEnabled = !!on;
          console.log(this._debugPrefix(), 'debug', on ? 'enabled' : 'disabled');
        };
      }
    } catch (_) {}
    this._debugPrefix = () => {
      const ts = new Date().toISOString().split('T')[1].replace('Z','');
      return `[chat-term ${ts}]`;
    };
    this.dbg = (...args) => { if (this.debugEnabled) console.log(this._debugPrefix(), ...args); };
    if (this.debugEnabled) {
      try { console.log(this._debugPrefix(), 'debug enabled'); } catch (_) {}
    }
    // Throttle and cap output rendering to prevent UI freezes on large streams
    this._pendingRender = false;
    this._pendingRAF = null;
    this._pendingTO = null;
    this._lastRenderTS = 0;
    this._displayCap = 50000;   // 50 KB tail for DOM update (reduced)
    this._bufferCap = 256000;   // keep at most 256 KB per command (reduced)
    this._flushFallbackMs = 250; // rAF fallback flush interval (slightly slower to reduce churn)
    this._minRenderIntervalMs = 120; // throttle paints to ~8 FPS under heavy streams
    // Rendering safety thresholds: when exceeded, fall back to simple text rendering (no per-line DOM)
    this._largeRenderLimit = 20000; // bytes (very low to always prefer lightweight rendering)
    this._lineRenderLimit = 200;    // lines (very low)
    // Visual wrapping: insert soft line breaks into extremely long single lines to avoid layout thrash
    this._maxVisualLineLen = 128;   // characters per visual line (aggressive soft-wrap)
    // Coalesced rendering: accumulate bytes and only paint when threshold or newline
    this._accBytesSincePaint = 0;
    this._renderByteThreshold = 16384; // paint after ~16KB or newline
    this._outputIsSanitized = false; // whether output buffer stores pre-cleaned text
    // Initialize line-number gutter for empty input
    try { this.updateInputLineNumbers(); } catch (_) {}

    // Virtualized output tracking (VSCode-style large buffer handling)
    this.virtualOutputs = new WeakMap();
    this._virtualAutoHeightThreshold = 1200; // px before enabling internal scroll
    this._virtualBufferLines = 120; // overscan lines rendered around viewport
    this.syntaxConfigCache = new Map();

    ChatTerminal.updateExecuteButtonState();
  }

  // Best-effort platform detection to avoid hard IPC dependency
  async getPlatformSafe() {
    try {
      if (window?.sm?.app?.getPlatform) {
        const res = await window.sm.app.getPlatform();
        if (res?.ok && res.data) return res.data;
      }
    } catch (_) { /* ignore */ }
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
    if (/Windows/i.test(ua)) return 'win32';
    if (/Mac OS X|Macintosh/i.test(ua)) return 'darwin';
    if (/Linux|X11/i.test(ua)) return 'linux';
    return 'linux';
  }

  insertSiblingCommandCell(referenceCell, position = 'after') {
    if (!referenceCell || !referenceCell.parentNode) return null;
    const options = position === 'before'
      ? { insertBefore: referenceCell, startEditing: true }
      : { insertAfter: referenceCell, startEditing: true };
    return this.addUserMessage('', options);
  }

  convertSelectedCellToMarkdown() {
    const cell = this.selectedCell;
    if (!cell) return;

    if (cell.classList.contains('markdown-cell')) {
      if (!cell.__editing) {
        this.startMarkdownEdit(cell);
      }
      return;
    }

    const context = cell.__smrtContext;
    const source = context?.commandPre?.textContent ?? '';
    const newCell = this.addMarkdownCell(source, {
      replace: cell,
      allowEmpty: true,
      startEditing: true
    });
    if (newCell) {
      this.selectedCell = newCell;
    }
  }

  convertSelectedCellToCode() {
    const cell = this.selectedCell;
    if (!cell) return;

    if (cell.classList.contains('markdown-cell')) {
      const markdown = cell.dataset.markdown ||
        cell.querySelector('.cell-content')?.textContent ||
        '';
      this.addUserMessage(markdown, {
        replace: cell,
        startEditing: true
      });
      return;
    }

    const context = cell.__smrtContext;
    if (context && !context.editing) {
      this.startCommandEdit(context);
    }
  }

  applyExecutionIndex(cellContext, executionIndex) {
    this.cellManager.applyExecutionIndex(cellContext, executionIndex);
  }

  setupInputHandlers() {
    // Handle Enter vs Shift+Enter
    this.input.addEventListener('keydown', (e) => {
      if (!this.isActive) return;
      // Check if suggestions are visible
      const suggestionsEl = document.getElementById('commandSuggestions');
      const suggestionsVisible = suggestionsEl && !suggestionsEl.classList.contains('hidden');

      // Handle Ctrl+C to send interrupt signal
      if (e.key === 'c' && e.ctrlKey) {
        e.preventDefault();
        this.sendInterruptSignal();
        return;
      }

      if (e.key === 'Enter') {
        // If suggestions are visible and Enter (without Shift), accept suggestion
        if (suggestionsVisible && !e.shiftKey) {
          e.preventDefault();
          this.selectHighlightedSuggestion();
          return;
        }

        if (e.shiftKey) {
          // Shift+Enter: execute command/markdown
          e.preventDefault();
          this.executeCommand();
        }
        // Plain Enter falls through to default Newline behaviour
      } else if (e.key === 'ArrowUp') {
        // If suggestions are visible, navigate suggestions
        if (suggestionsVisible) {
          e.preventDefault();
          this.navigateSuggestions(-1);
          return;
        }

        e.preventDefault();
        this.navigateHistory(-1);
      } else if (e.key === 'ArrowDown') {
        // If suggestions are visible, navigate suggestions
        if (suggestionsVisible) {
          e.preventDefault();
          this.navigateSuggestions(1);
          return;
        }

        e.preventDefault();
        this.navigateHistory(1);
      } else if (e.key === 'Tab') {
        // If suggestions are visible, select highlighted item
        if (suggestionsVisible) {
          e.preventDefault();
          this.selectHighlightedSuggestion();
          return;
        }

        if (this.inputMode === 'code') {
          // Tab key: smart context detection for path completion or command suggestions
          e.preventDefault();
          this.handleTabCompletion();
        }
      } else if (e.key === 'Escape') {
        // If suggestions are visible, just hide them
        if (suggestionsVisible) {
          e.preventDefault();
          this.hideSuggestions();
          return;
        }

        // Otherwise clear input
        this.input.value = '';
        this.input.rows = 1;
        this.updateInputLineNumbers();
      }
    });

    this.input.addEventListener('focus', () => {
      if (!this.isActive) return;
      this.clearComposerSelection();
      // Clear any selected cell when input gains focus
      this.clearCellSelection();
    });

    // Setup click outside handler for suggestions
    this.setupSuggestionsClickOutside();

    if (this.inputWrapper) {
      this.inputWrapper.addEventListener('mousedown', (event) => {
        if (!this.isActive) return;
        if (this.input && (event.target === this.input || this.input.contains(event.target))) {
          this.clearComposerSelection();
          return;
        }
        if (this.input) {
          this.input.blur();
        }
        this.selectComposer();
      });
    }

    // Handle input for command suggestions
    this.input.addEventListener('input', (e) => {
      if (!this.isActive) return;
      // Hide suggestions when input content changes
      this.hideSuggestions();
      this.handleCommandSuggestions(e.target.value);
      ChatTerminal.updateExecuteButtonState();
    });
  }

  setupSuggestionsClickOutside() {
    // Global click handler to hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.isActive) return;

      const suggestionsEl = document.getElementById('commandSuggestions');
      if (!suggestionsEl || suggestionsEl.classList.contains('hidden')) return;

      // Check if click is inside suggestions dropdown or input
      const clickedInsideSuggestions = suggestionsEl.contains(e.target);
      const clickedInsideInput = this.input && this.input.contains(e.target);

      // Hide suggestions if clicked outside
      if (!clickedInsideSuggestions && !clickedInsideInput) {
        this.hideSuggestions();
      }
    });
  }

  setupAutoResize() {
    // Auto-resize textarea as user types
    this.input.addEventListener('input', () => {
      if (!this.isActive) return;
      this.input.rows = 1; // Reset to measure scrollHeight
      const lines = Math.min(10, Math.ceil(this.input.scrollHeight / 24));
      this.input.rows = Math.max(1, lines);
      this.positionSuggestionsDropdown();
      this.updateInputLineNumbers();
      ChatTerminal.updateExecuteButtonState();
    });
  }

  setupSelectionHandlers() {
    if (this.messages) {
      this.messages.addEventListener('click', (e) => {
        if (!this.isActive) return;
        const cell = e.target.closest('.notebook-cell');
        if (!cell) return;

        // Clear composer selection and blur input to ensure mutual exclusivity
        this.clearComposerSelection();
        if (this.input && document.activeElement === this.input) {
          this.input.blur();
        }

        this.selectCell(cell);
      });
    }

    window.addEventListener('keydown', this.handleGlobalKeydown);
    // Paste handler: when pasting file(s) after copying from Finder/Explorer,
    // insert their absolute paths. Trigger if looks like /upload OR the clipboard
    // clearly contains files/URLs (prevents pasting file-icon images into editor).
    this.input.addEventListener('paste', (e) => {
      try {
        const dt = e.clipboardData;
        if (!dt) return; // no data, fall through

        const types = Array.from(dt.types || []);
        const current = (this.input?.value || '').trimStart();
        const looksLikeUpload = current.startsWith('/upload');
        const hasFilesType = types.includes('Files');
        const hasUriList = types.includes('text/uri-list');
        const hasPublicFileUrl = types.includes('public.file-url');
        const hasFileItems = Array.from(dt.items || []).some(it => it && it.kind === 'file');

        // Only intercept if user intent looks like upload OR clipboard clearly has files
        if (!looksLikeUpload && !hasFilesType && !hasUriList && !hasPublicFileUrl && !hasFileItems) return;

        const fileUrls = [];
        if (hasUriList) {
          const uriList = dt.getData('text/uri-list') || '';
          // text/uri-list may contain comments starting with '#', and multiple lines
          uriList.split(/\r?\n/).forEach(line => {
            const s = line.trim();
            if (!s || s.startsWith('#')) return;
            if (/^file:\/\//i.test(s)) fileUrls.push(s);
          });
        }

        if (hasPublicFileUrl) {
          const s = (dt.getData('public.file-url') || '').trim();
          if (s) fileUrls.push(s);
        }

        // Fallbacks
        let plain = '';
        const hasPlain = types.includes('text/plain');
        if (!fileUrls.length && hasPlain) {
          plain = dt.getData('text/plain') || '';
          const trimmed = plain.trim();
          if (/^file:\/\//i.test(trimmed)) {
            fileUrls.push(trimmed);
          }
        }

        const toPaths = (urls) => {
          const out = [];
          for (const u of urls) {
            try {
              const urlObj = new URL(u);
              if (urlObj.protocol !== 'file:') continue;
              // Decode percent-encoding; macOS/Linux paths start with '/'
              let p = decodeURIComponent(urlObj.pathname || '');
              // On Windows, url.pathname may start with '/C:/' — strip leading slash
              if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
              out.push(p);
            } catch (_) {
              // Not a valid URL. Ignore.
            }
          }
          return out;
        };

        let paths = toPaths(fileUrls);

        // Also check DataTransfer.files (Electron may expose .path)
        if (!paths.length && dt.files && dt.files.length) {
          paths = Array.from(dt.files)
            .map(f => (f && (f.path || f.name)) ? (f.path || f.name) : '')
            .filter(Boolean);
        }

        // As a last resort, if plain text looks like an absolute path, use it.
        if (!paths.length && plain) {
          const t = plain.trim();
          const isAbsUnix = t.startsWith('/');
          const isAbsWin = /^[A-Za-z]:[\\/]/.test(t) || t.startsWith('\\\\');
          if (isAbsUnix || isAbsWin) paths = [t];
        }

        // If no paths yet, try IPC clipboard helper (Electron) as a last resort
        if (!paths.length && (looksLikeUpload || hasFilesType || hasUriList || hasPublicFileUrl || hasFileItems)) {
          try {
            // Prevent default while we fetch asynchronously to avoid image insertion
            e.preventDefault();
            if (window?.sm?.clip?.getFilePaths) {
              window.sm.clip.getFilePaths().then(res => {
                const list = (res && res.ok && Array.isArray(res.data)) ? res.data : [];
                if (!list.length) return;
                const needsQuoting = (s) => /\s|["'`$&|;<>()\\]/.test(s);
                const singleQuote = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
                const joined = list.map(p => needsQuoting(p) ? singleQuote(p) : p).join(' ');
                const el = this.input;
                const start = el.selectionStart ?? el.value.length;
                const end = el.selectionEnd ?? el.value.length;
                const before = el.value.slice(0, start);
                const after = el.value.slice(end);
                el.value = before + joined + after;
                const cursor = (before + joined).length;
                el.setSelectionRange(cursor, cursor);
                el.dispatchEvent(new Event('input'));
              }).catch(() => {});
              return;
            }
          } catch (_) {}
        }

        if (!paths.length) return; // let default paste proceed

        // We will insert our synthesized text and prevent the default paste.
        e.preventDefault();

        const needsQuoting = (s) => /\s|["'`$&|;<>()\\]/.test(s);
        const singleQuote = (s) => "'" + s.replace(/'/g, "'\\''") + "'";

        const joined = paths.map(p => needsQuoting(p) ? singleQuote(p) : p).join(' ');

        // Insert at cursor position
        const el = this.input;
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        const before = el.value.slice(0, start);
        const after = el.value.slice(end);
        el.value = before + joined + after;
        const cursor = (before + joined).length;
        el.setSelectionRange(cursor, cursor);

        // Ensure UI reacts to change
        el.dispatchEvent(new Event('input'));
      } catch (_) {
        // If anything goes wrong, fall back to default paste behavior.
      }
    });
  }

  handleGlobalKeydown(e) {
    if (!this.isActive) return;
    const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
    if (!key) return;

    const target = e.target;
    const targetIsEditable = target && (
      ['INPUT', 'TEXTAREA'].includes(target.tagName) ||
      target.isContentEditable ||
      target.closest?.('.markdown-editor')
    );

    if (key === 'escape') {
      if (this.selectedCell) {
        this.clearCellSelection();
        return;
      }
      if (target === this.input) {
        this.input.blur();
        this.selectComposer();
        return;
      }
    }

    if (targetIsEditable) {
      if (target === this.input) {
        return;
      }
      return;
    }

    if (!e.ctrlKey && !e.metaKey && !e.altKey && this.composerSelected && !this.selectedCell) {
      if (key === 'c') {
        e.preventDefault();
        this.setInputMode('code');
        return;
      }
      if (key === 'm') {
        e.preventDefault();
        this.setInputMode('markdown');
        return;
      }
    }

    if (!this.selectedCell) return;
    // Allow Ctrl+C to stop the running command for the selected cell; otherwise ignore
    if (e.ctrlKey && !e.metaKey && !e.altKey && key === 'c') {
      const ctx = this.selectedCell.__smrtContext || null;
      const isCurrentRunning = this.isCommandRunning && this.currentCommand?.cellContext === ctx;
      if (isCurrentRunning) {
        e.preventDefault();
        this.handleStopRequest(ctx);
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (key === 'd') {
      e.preventDefault();
      const now = Date.now();
      if (now - this.lastDeleteKeyTime < 400) {
        this.deleteSelectedCell();
        this.lastDeleteKeyTime = 0;
      } else {
        this.lastDeleteKeyTime = now;
      }
      return;
    }

    if (key === 'a') {
      e.preventDefault();
      this.insertSiblingCommandCell(this.selectedCell, 'before');
      return;
    }

    if (key === 'b') {
      e.preventDefault();
      this.insertSiblingCommandCell(this.selectedCell, 'after');
      return;
    }

    if (key === 'm') {
      e.preventDefault();
      this.convertSelectedCellToMarkdown();
      return;
    }

    if (key === 'c') {
      e.preventDefault();
      const cell = this.selectedCell;
      if (!cell) return;
      if (cell.classList.contains('markdown-cell')) {
        this.convertSelectedCellToCode();
      } else {
        const context = cell.__smrtContext;
        if (context && !context.editing) {
          this.startCommandEdit(context);
        }
      }
    }
  }

  handleCommandSuggestions(_input) {
    // Legacy slash-command suggestions removed; ensure dropdown stays hidden
    this.hideSuggestions();
  }

  async sendInterruptSignal() {
    // 使用 PTY 模式发送中断信号（Ctrl+C）
    this.dbg('sendInterruptSignal called', { hasCurrentCommand: !!this.currentCommand });

    if (this.currentCommand && this.currentCommand.ptyId) {
      const ptyId = this.currentCommand.ptyId;
      this.dbg('Sending Ctrl+C to PTY:', ptyId);

      try {
        // 发送 Ctrl+C (ASCII 3) 到 PTY
        const result = await sm.term.write({ ptyId, data: '\x03' });
        this.dbg('Ctrl+C sent:', result);
      } catch (err) {
        this.dbg('Failed to send Ctrl+C:', err);
      }
    } else {
      this.dbg('No PTY to send interrupt to');
    }
  }

  async executeCommand() {
    const rawInput = this.input.value;
    const trimmedInput = rawInput.trim();

    if (this.isCommandRunning) {
      if (this.activeCommandAcceptsInteractiveInput()) {
        if (!rawInput) return;
        this.sendInteractiveInput(rawInput);
        return;
      }
      if (!trimmedInput) return;
    } else if (!trimmedInput) {
      return;
    }

    if (this.inputMode === 'markdown') {
      const markdownContent = rawInput.replace(/\r\n/g, '\n');
      this.addMarkdownCell(markdownContent);
      this.input.value = '';
      this.input.rows = 1;
      this.updateInputLineNumbers();
      this.hideSuggestions();
      this.input.focus();
      this.scrollToBottom();
      return;
    }

    // Terminal ready check removed - each tab's terminal is always ready after initialization

    const command = trimmedInput;

    // Check if this is a file transfer command
    const transferCommand = this.parseTransferCommand(command);
    if (transferCommand) {
      // Handle file transfer command
      await this.handleTransferCommand(transferCommand);
      return;
    }

    const viewCommand = this.parseViewCommand(command);
    if (viewCommand) {
      await this.handleViewCommand(command, viewCommand);
      this.input.value = '';
      this.input.rows = 1;
      this.updateInputLineNumbers();
      this.hideSuggestions();
      this.input.focus();
      return;
    }

    // Add to per-tab history (code mode only)
    this.recordCommandHistory(command);

    // Update command statistics for smart suggestions
    this.updateCommandStats(command);

    // Display user command message but do NOT enter edit mode.
    // For freshly executed commands, we want to keep focus in the composer
    // and immediately run the command; editing the just-added cell is noisy
    // (and races with run state toggling).
    const cellContext = this.addUserMessage(command, { startEditing: false, selectCell: false });

    // Clear input
    this.input.value = '';
    this.input.rows = 1;
    this.updateInputLineNumbers();
    this.input.focus();

    // Hide command suggestions if visible
    const suggestionsEl = document.getElementById('commandSuggestions');
    if (suggestionsEl) {
      suggestionsEl.classList.add('hidden');
    }

    this.runShellCommand(command, cellContext);
  }

  activeCommandAcceptsInteractiveInput() {
    const cmd = this.currentCommand;
    if (!cmd) return false;
    if (cmd.isInteractive) return true;
    if (cmd.altScreenActive) return true;
    if (cmd.syncOutputActive) return true;
    return false;
  }

  navigateHistory(direction) {
    if (this.inputMode !== 'code' || this.history.length === 0) return;

    if (!Number.isFinite(this.historyIndex)) {
      this.historyIndex = this.history.length;
    }

    const atNewestEntry = this.historyIndex >= this.history.length;
    if (direction < 0 && atNewestEntry) {
      // Save current draft before moving into history
      this.historyDraft = this.input.value;
    }

    const nextIndex = Math.max(-1, Math.min(this.history.length, this.historyIndex + direction));
    this.historyIndex = nextIndex;

    if (this.historyIndex >= 0 && this.historyIndex < this.history.length) {
      this.input.value = this.history[this.historyIndex];
    } else {
      // Restore draft (or fallback to empty string) when leaving history
      this.historyIndex = this.history.length;
      this.input.value = this.historyDraft || '';
    }

    // Trigger resize and keep caret at end
    this.input.dispatchEvent(new Event('input'));
    try {
      const len = this.input.value.length;
      this.input.setSelectionRange(len, len);
    } catch (_) {
      // Ignore selection errors (e.g., on unsupported inputs)
    }
  }

  recordCommandHistory(command) {
    if (typeof command !== 'string') return;
    const normalized = command.trim();
    if (!normalized) return;

    this.history.push(command);
    if (this.history.length > MAX_COMMAND_HISTORY) {
      const excess = this.history.length - MAX_COMMAND_HISTORY;
      this.history.splice(0, excess);
    }
    this.historyIndex = this.history.length;
    this.historyDraft = '';
    this.markDirty();
  }

  navigateSuggestions(direction) {
    const suggestionsList = document.getElementById('suggestionsList');
    if (!suggestionsList) return;

    const suggestionItems = suggestionsList.querySelectorAll('.suggestion-item');
    if (suggestionItems.length === 0) return;

    // Find currently highlighted item
    let currentIndex = -1;
    for (let i = 0; i < suggestionItems.length; i++) {
      if (suggestionItems[i].classList.contains('selected')) {
        currentIndex = i;
        suggestionItems[i].classList.remove('selected');
        break;
      }
    }

    // Calculate new index
    let newIndex = currentIndex + direction;

    // Handle wrapping
    if (newIndex < 0) {
      newIndex = suggestionItems.length - 1; // Wrap to last item
    } else if (newIndex >= suggestionItems.length) {
      newIndex = 0; // Wrap to first item
    }

    // Highlight new item
    if (suggestionItems[newIndex]) {
      suggestionItems[newIndex].classList.add('selected');
      // Scroll to ensure the selected item is visible
      suggestionItems[newIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  selectHighlightedSuggestion() {
    const suggestionsList = document.getElementById('suggestionsList');
    if (!suggestionsList) return;

    const selectedSuggestion = suggestionsList.querySelector('.suggestion-item.selected');
    if (selectedSuggestion) {
      // Trigger click event on the selected suggestion
      selectedSuggestion.click();
    } else {
      // If no suggestion is highlighted, select the first one
      const firstSuggestion = suggestionsList.querySelector('.suggestion-item');
      if (firstSuggestion) {
        firstSuggestion.click();
      }
    }
  }

  addUserMessage(command, options = {}) {
    const {
      insertBefore = null,
      insertAfter = null,
      replace = null,
      startEditing = false,
      selectCell: shouldSelectCell = true
    } = options || {};

    const { cellEl, cellContext } = this.cellManager.createCommandCell(command, options);

    this.attachCommandEditing(cellContext);
    this.attachOutputCollapseHandlers(cellContext);
    this.attachControlHandlers(cellContext);

    const parent = this.messages;
    if (replace && replace.parentNode === parent) {
      parent.insertBefore(cellEl, replace);
      replace.remove();
    } else if (insertBefore && insertBefore.parentNode === parent) {
      parent.insertBefore(cellEl, insertBefore);
    } else if (insertAfter && insertAfter.parentNode === parent) {
      parent.insertBefore(cellEl, insertAfter.nextSibling);
    } else {
      parent.appendChild(cellEl);
    }

    if (shouldSelectCell) {
      this.selectCell(cellEl);
    }
    this.updateInputAffordances();

    // Check if this is part of a rerun operation
    const isRerun = cellContext?.fromRerun || false;

    if (!insertBefore && !replace && !insertAfter) {
      // Only scroll for new commands, not reruns
      if (!isRerun) {
        this.scrollToBottom();
      }
    } else if (typeof cellEl.scrollIntoView === 'function' && !isRerun) {
      // Only scroll into view for non-rerun operations
      cellEl.scrollIntoView({ block: 'center', inline: 'nearest' });
    }

    if (startEditing) {
      this.startCommandEdit(cellContext);
    }

    this.updateCollapseState(cellContext);
    this.updateControlButtonStates(cellContext);
    // Ensure the command cell shows line numbers like output does
    try { this.updateCellInputLineNumbers(cellContext); } catch (_) {}
    this.markDirty();

    return cellContext;
  }

  // Update the line-number gutter for the main textarea input
  updateInputLineNumbers() {
    const gutter = this.inputLineNumbersEl;
    const input = this.input;
    if (!gutter || !input) return;
    const value = typeof input.value === 'string' ? input.value : '';
    const count = Math.max(1, value.split('\n').length);
    // Minimize DOM churn: rebuild simple list each time (inputs are small)
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= count; i += 1) {
      const div = document.createElement('div');
      div.className = 'gutter-line';
      div.textContent = String(i);
      frag.appendChild(div);
    }
    gutter.innerHTML = '';
    gutter.appendChild(frag);
  }

  // Update the line-number gutter for a history command cell
  updateCellInputLineNumbers(cellContext) {
    const ctx = cellContext || null;
    if (!ctx || !ctx.commandPre || !ctx.commandGutter) return;
    const text = ctx.commandPre.textContent || '';
    const count = Math.max(1, text.split('\n').length);
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= count; i += 1) {
      const div = document.createElement('div');
      div.className = 'gutter-line';
      div.textContent = String(i);
      frag.appendChild(div);
    }
    ctx.commandGutter.innerHTML = '';
    ctx.commandGutter.appendChild(frag);
  }

  addMarkdownCell(markdownText, options = {}) {
    const {
      insertBefore = null,
      insertAfter = null,
      replace = null,
      allowEmpty = false,
      startEditing = false,
      fromRerun = false
    } = options || {};

    const result = this.cellManager.createMarkdownCell(markdownText, options);
    if (!result) return null;

    const { cellEl, content } = result;
    const normalized = cellEl.dataset.markdown;
    content.innerHTML = this.markdownRenderer.renderMarkdown(normalized);
    this.setupMarkdownEditing(cellEl, normalized);

    const parent = this.messages;
    if (replace && replace.parentNode === parent) {
      parent.insertBefore(cellEl, replace);
      replace.remove();
    } else if (insertBefore && insertBefore.parentNode === parent) {
      parent.insertBefore(cellEl, insertBefore);
    } else if (insertAfter && insertAfter.parentNode === parent) {
      parent.insertBefore(cellEl, insertAfter.nextSibling);
    } else {
      parent.appendChild(cellEl);
    }

    this.selectCell(cellEl);

    if (!insertBefore && !replace && !insertAfter) {
      if (!fromRerun) {
        this.scrollToBottom();
      }
    } else if (typeof cellEl.scrollIntoView === 'function' && !fromRerun) {
      cellEl.scrollIntoView({ block: 'center', inline: 'nearest' });
    }

    if (startEditing) {
      this.startMarkdownEdit(cellEl);
    }

    this.markDirty();
    return cellEl;
  }

  attachCommandEditing(cellContext) {
    const editor = cellContext?.commandPre;
    if (!editor) return;

    editor.contentEditable = 'true';
    if (!cellContext.editing) {
      editor.classList.remove('editing');
    }
    if (cellContext.execButton) {
      cellContext.execButton.disabled = false;
    }

    if (editor.__smrtDblHandler) {
      editor.removeEventListener('dblclick', editor.__smrtDblHandler);
      editor.__smrtDblHandler = null;
    }

    if (!editor.__smrtEditHandlers) {
      const keyHandler = (e) => {
        const suggestionsEl = document.getElementById('commandSuggestions');
        const suggestionsVisible = suggestionsEl && !suggestionsEl.classList.contains('hidden');

        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault();
          const newCommand = editor.textContent.trim();
          this.finishCommandEdit(cellContext, newCommand, true);
        } else if (e.key === 'Tab') {
          // Tab completion in cell editor
          e.preventDefault();

          // If suggestions are visible, select current item
          if (suggestionsVisible) {
            this.selectCurrentCellSuggestion(editor, cellContext);
          } else {
            this.handleCellTabCompletion(editor, cellContext);
          }
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          // Navigate suggestions if visible
          if (suggestionsVisible) {
            e.preventDefault();
            this.navigateCellSuggestions(e.key === 'ArrowDown' ? 1 : -1);
          }
        } else if (e.key === 'Escape') {
          // Hide suggestions if visible
          if (suggestionsVisible) {
            e.preventDefault();
            this.hideSuggestions();
          }
        }
      };

      const inputHandler = () => {
        // Hide suggestions when cell editor content changes
        this.hideSuggestions();
        // Update per-line numbers in the gutter
        try { this.updateCellInputLineNumbers(cellContext); } catch (_) {}
      };

      // Paste handler for contentEditable command editor (history cell).
      // Paste of files: insert absolute paths instead of rich content/image.
      const pasteHandler = (e) => {
        try {
          const dt = e.clipboardData;
          if (!dt) return;

          const types = Array.from(dt.types || []);
          // Trigger if upload intent or clipboard clearly has files
          const looksLikeUpload = cellContext?.cellEl?.classList?.contains('mode-upload') ||
            (editor.textContent || '').trimStart().startsWith('/upload');
          const hasFilesType = types.includes('Files');
          const hasUriList = types.includes('text/uri-list');
          const hasPublicFileUrl = types.includes('public.file-url');
          const hasFileItems = Array.from(dt.items || []).some(it => it && it.kind === 'file');
          if (!looksLikeUpload && !hasFilesType && !hasUriList && !hasPublicFileUrl && !hasFileItems) return;

          const fileUrls = [];
          let plain = '';

          if (hasUriList) {
            const uriList = dt.getData('text/uri-list') || '';
            uriList.split(/\r?\n/).forEach(line => {
              const s = (line || '').trim();
              if (!s || s.startsWith('#')) return;
              if (/^file:\/\//i.test(s)) fileUrls.push(s);
            });
          }

          if (hasPublicFileUrl) {
            const s = (dt.getData('public.file-url') || '').trim();
            if (s) fileUrls.push(s);
          }

          if (!fileUrls.length && types.includes('text/plain')) {
            plain = dt.getData('text/plain') || '';
            const t = plain.trim();
            if (/^file:\/\//i.test(t)) fileUrls.push(t);
          }

          const toPaths = (urls) => {
            const out = [];
            for (const u of urls) {
              try {
                const urlObj = new URL(u);
                if (urlObj.protocol !== 'file:') continue;
                let p = decodeURIComponent(urlObj.pathname || '');
                if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
                out.push(p);
              } catch (_) {}
            }
            return out;
          };

          let paths = toPaths(fileUrls);

          if (!paths.length && dt.files && dt.files.length) {
            paths = Array.from(dt.files)
              .map(f => (f && (f.path || f.name)) ? (f.path || f.name) : '')
              .filter(Boolean);
          }

          if (!paths.length && plain) {
            const t = plain.trim();
            const isAbsUnix = t.startsWith('/');
            const isAbsWin = /^[A-Za-z]:[\\/]/.test(t) || t.startsWith('\\\\');
            if (isAbsUnix || isAbsWin) paths = [t];
          }

          // As a last resort, ask main process clipboard
          const selectionBounds = this.getSelectionBoundsInContentEditable(editor);

          if (!paths.length && (looksLikeUpload || hasFilesType || hasUriList || hasPublicFileUrl || hasFileItems)) {
            e.preventDefault();
            if (window?.sm?.clip?.getFilePaths) {
              window.sm.clip.getFilePaths().then(res => {
                const list = (res && res.ok && Array.isArray(res.data)) ? res.data : [];
                if (!list.length) return;
                const needsQuoting = (s) => /\s|["'`$&|;<>()\\]/.test(s);
                const singleQuote = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
                const joined = list.map(p => needsQuoting(p) ? singleQuote(p) : p).join(' ');
                this.replaceSelectionInContentEditable(editor, joined, selectionBounds);
              }).catch(() => {});
              return;
            }
          }

          if (!paths.length) return; // fall back to default paste

          e.preventDefault();

          const needsQuoting = (s) => /\s|["'`$&|;<>()\\]/.test(s);
          const singleQuote = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
          const joined = paths.map(p => needsQuoting(p) ? singleQuote(p) : p).join(' ');

          // Insert into contentEditable at caret
          this.replaceSelectionInContentEditable(editor, joined, selectionBounds);
        } catch (_) {
          // swallow and allow default
        }
      };

      const blurHandler = () => {
        const newCommand = editor.textContent.trim();
        this.finishCommandEdit(cellContext, newCommand, false);
      };

      const focusHandler = () => {
        cellContext.editing = true;
        editor.classList.add('editing');
        this.selectCell(cellContext.cellEl);
      };

      editor.__smrtEditHandlers = { keyHandler, inputHandler, pasteHandler, blurHandler, focusHandler };
      editor.addEventListener('keydown', keyHandler);
      editor.addEventListener('input', inputHandler);
      editor.addEventListener('paste', pasteHandler);
      editor.addEventListener('blur', blurHandler);
      editor.addEventListener('focus', focusHandler);
    }

    if (cellContext.execButton && !cellContext.execButton.__smrtClickHandler) {
      const runHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.isCommandRunning && this.currentCommand?.cellContext === cellContext) return;
        const newCommand = editor.textContent.trim();
        if (!newCommand) return;
        if (cellContext.commandPre) {
          this.focusCommandEditor(cellContext, { preventScroll: true, collapseToEnd: true });
        }
        this.finishCommandEdit(cellContext, newCommand, true);
      };
      cellContext.execButton.__smrtClickHandler = runHandler;
      cellContext.execButton.addEventListener('click', runHandler);
    }
  }

  startCommandEdit(cellContext) {
    if (!cellContext) return;
    const editor = cellContext.commandPre;
    if (!editor) return;

    this.attachCommandEditing(cellContext);
    this.selectCell(cellContext.cellEl);
    editor.classList.add('editing');

    cellContext.editing = true;
    this.focusCommandEditor(cellContext);
  }

  focusCommandEditor(cellContext, options = {}) {
    const editor = cellContext?.commandPre;
    if (!editor) return;
    const { collapseToEnd = true, preventScroll = true } = options || {};

    const placeCaret = () => {
      if (!document.contains(editor)) {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(placeCaret);
        }
        return;
      }

      try {
        editor.focus({ preventScroll });
      } catch (_) {
        try { editor.focus(); } catch (_) {}
      }

      if (!collapseToEnd) return;

      try {
        const sel = window.getSelection?.();
        if (sel) {
          sel.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(editor);
          range.collapse(false);
          sel.addRange(range);
        }
      } catch (err) {
        this.dbg?.('focusCommandEditor selection error', err);
      }
    };

    placeCaret();
  }

  finishCommandEdit(cellContext, newCommand, shouldRun) {
    const editor = cellContext?.commandPre;
    if (!editor) return;

    editor.classList.remove('editing');
    cellContext.editing = false;

    cellContext.command = newCommand;
    cellContext.syntaxMode = this.detectSyntaxMode(newCommand);
    editor.textContent = newCommand;

    if (shouldRun && newCommand) {
      cellContext.resumeEditingAfterRun = true;
      this.clearComposerSelection();
      if (cellContext?.cellEl) {
        this.selectCell(cellContext.cellEl, { preventScroll: true });
      }
      this.disableCommandEditing(cellContext, { preserveFocus: true });

      // Intercept transfer commands when re-running an edited cell
      const transferCmd = this.parseTransferCommand(newCommand);
      if (transferCmd) {
        // Mark mode on the existing cell and execute transfer in-place
        cellContext.cellEl.classList.remove('mode-command', 'mode-upload', 'mode-download');
        cellContext.cellEl.classList.add(`mode-${transferCmd.type}`);
        if (transferCmd.type === 'upload') {
          this.executeUploadCommand(transferCmd.sourcePath, transferCmd.targetPath, cellContext);
        } else {
          this.executeDownloadCommand(transferCmd.sourcePath, transferCmd.targetPath, cellContext);
        }
        return;
      }

      const viewCmd = this.parseViewCommand(newCommand);
      if (viewCmd && viewCmd.path) {
        this.handleViewCommand(newCommand, viewCmd, cellContext);
        return;
      }

      this.recordCommandHistory(newCommand);
      this.updateCommandStats(newCommand);
      this.runShellCommand(newCommand, cellContext, { fromRerun: true });
      return;
    }

    this.restoreCommandEditing(cellContext);
    this.markDirty();
  }

  disableCommandEditing(cellContext, options = {}) {
    const editor = cellContext?.commandPre;
    if (!editor) return;

    editor.contentEditable = 'false';
    editor.classList.remove('editing');
    cellContext.editing = false;

    const preserveFocus = Boolean(options?.preserveFocus);
    if (!preserveFocus && typeof document !== 'undefined' && document.activeElement === editor) {
      editor.blur();
    }
  }

  restoreCommandEditing(cellContext) {
    const editor = cellContext?.commandPre;
    if (!editor) return;

    editor.contentEditable = 'true';
    if (!cellContext.editing) {
      editor.classList.remove('editing');
    }
  }

  attachOutputCollapseHandlers(cellContext) {
    const outputRow = cellContext?.outputRow;
    const outputPrompt = cellContext?.outputPrompt;
    if (!outputRow || !outputPrompt) return;

    outputPrompt.classList.add('toggleable');

    const collapseHandler = (e) => {
      if (cellContext.outputContent && cellContext.outputContent.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      this.toggleOutputCollapse(cellContext);
    };

    if (outputRow.__smrtCollapseHandler) {
      outputRow.removeEventListener('dblclick', outputRow.__smrtCollapseHandler);
    }
    if (outputPrompt.__smrtCollapseHandler) {
      outputPrompt.removeEventListener('dblclick', outputPrompt.__smrtCollapseHandler);
    }

    outputRow.__smrtCollapseHandler = collapseHandler;
    outputPrompt.__smrtCollapseHandler = collapseHandler;

    outputRow.addEventListener('dblclick', collapseHandler);
    outputPrompt.addEventListener('dblclick', collapseHandler);
  }

  attachControlHandlers(cellContext) {
    if (!cellContext) return;
    const { stopButton, copyButton, followButton } = cellContext;

    if (stopButton) {
      if (stopButton.__smrtClickHandler) {
        stopButton.removeEventListener('click', stopButton.__smrtClickHandler);
      }
      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleStopRequest(cellContext);
      };
      stopButton.__smrtClickHandler = handler;
      stopButton.addEventListener('click', handler);
    }

    if (copyButton) {
      if (copyButton.__smrtClickHandler) {
        copyButton.removeEventListener('click', copyButton.__smrtClickHandler);
      }
      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.copyCellOutput(cellContext);
      };
      copyButton.__smrtClickHandler = handler;
      copyButton.addEventListener('click', handler);
    }

    if (followButton) {
      if (followButton.__smrtClickHandler) {
        followButton.removeEventListener('click', followButton.__smrtClickHandler);
      }
      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        cellContext.autoFollow = !cellContext.autoFollow;
        followButton.classList.toggle('active', !!cellContext.autoFollow);
        // If enabling follow while collapsed and has output, jump to bottom immediately
        if (cellContext.autoFollow && cellContext.collapsed) {
          const preEl = this.currentCommand?.cellContext === cellContext
            ? this.currentCommand?.outputPre
            : (cellContext.outputContent?.querySelector('.cell-output-text') || null);
          if (preEl && typeof preEl.scrollHeight === 'number') {
            preEl.scrollTop = preEl.scrollHeight - preEl.clientHeight;
          }
        }
      };
      followButton.__smrtClickHandler = handler;
      followButton.addEventListener('click', handler);
    }
  }

  handleStopRequest(cellContext) {
    if (!cellContext) {
      this.dbg('handleStopRequest: no cellContext');
      return;
    }

    this.dbg('handleStopRequest', {
      isCommandRunning: this.isCommandRunning,
      hasCurrentCommand: !!this.currentCommand,
      contextMatch: this.currentCommand?.cellContext === cellContext,
      currentCellId: this.currentCommand?.cellContext?.cellId,
      requestCellId: cellContext?.cellId
    });

    if (this.isCommandRunning && this.currentCommand?.cellContext === cellContext) {
      this.dbg('Stopping command');

      // Clear any existing termination timer
      if (this.currentCommand.terminationTimer) {
        clearTimeout(this.currentCommand.terminationTimer);
        this.currentCommand.terminationTimer = null;
      }

      // Get tab state to check mode
      const tabState = typeof this.getTabState === 'function' ? this.getTabState() : null;
      const mode = tabState?.mode || 'pty';

      if (mode === 'pty') {
        // PTY mode: graceful stop; keep UI running until我们确认提示符返回
        this.dbg('PTY mode: Sending Ctrl+C');
        this.sendInterruptSignal();

        const startTs = Date.now();
        const MAX_WAIT = 5000;
        const CHECK_EVERY = 150;
        const pollForPrompt = async () => {
          const cmd = this.currentCommand;
          if (!cmd || !this.isCommandRunning || cmd.cellContext !== cellContext) return; // 已被其他路径结束
          const hasPrompt = this.detectShellPrompt(cmd.promptBuffer);
          if (hasPrompt) {
            this.dbg('Prompt detected after stop; finalizing');
            try { this._renderCurrentCommandOutput(cellContext, false); } catch (_) {}
            this.finalizeCommandOutput();
            return;
          }
          if (Date.now() - startTs > MAX_WAIT) {
            this.dbg('Stop wait timeout; try another Ctrl+C then finalize UI');
            try {
              this.sendInterruptSignal();
              const ptyId = cmd?.ptyId; if (ptyId) { try { await sm.term.write({ ptyId, data: '\r' }); } catch (_) {} }
            } catch (_) {}
            try { this._renderCurrentCommandOutput(cellContext, false); } catch (_) {}
            this.finalizeCommandOutput();
            return;
          }
          setTimeout(pollForPrompt, CHECK_EVERY);
        };
        setTimeout(pollForPrompt, CHECK_EVERY);
      } else {
        // stdio mode: Ctrl+C doesn't work reliably, force kill immediately
        this.dbg('stdio mode: Force killing PTY');

        // Mark command as stopped to prevent further output processing
        if (this.currentCommand) {
          this.currentCommand.stopped = true;
        }

        // Send Ctrl+C anyway (might help in some cases)
        this.sendInterruptSignal();

        // Immediately force kill the PTY to stop all child processes
        if (this.currentCommand.ptyId) {
          try {
            sm.term.forceKill({ ptyId: this.currentCommand.ptyId });
          } catch (err) {
            this.dbg('Force kill failed:', err);
          }
        }

        // Immediately finalize the command (don't wait)
        this.dbg('Immediately finalizing after force kill');
        this.finalizeCommandOutput();
        this.setCommandRunning(false, cellContext);
        this.currentCommand = null;
        this.processCommandQueue();
      }
    } else {
      this.dbg('Stop request ignored - conditions not met');
    }
  }

  async copyCellOutput(cellContext) {
    if (!cellContext?.outputContent) return;
    const outputEl = cellContext.outputContent.querySelector('.cell-output-text');
    const text = outputEl ? outputEl.dataset.rawOutput || outputEl.textContent || '' : '';
    if (!text) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch (err) {
      console.warn('[ChatTerminal] Clipboard API failed, using fallback copy.', err);
    }

    const temp = document.createElement('textarea');
    temp.style.position = 'fixed';
    temp.style.top = '-9999px';
    temp.style.left = '-9999px';
    temp.value = text;
    document.body.appendChild(temp);
    temp.focus();
    temp.select();
    try {
      document.execCommand('copy');
    } catch (fallbackErr) {
      console.warn('[ChatTerminal] Fallback copy failed.', fallbackErr);
    }
    document.body.removeChild(temp);
  }

  updateControlButtonStates(cellContext) {
    if (!cellContext) return;
    const stopButton = cellContext.stopButton;
    const copyButton = cellContext.copyButton;
    const followButton = cellContext.followButton;
    const controlRow = cellContext.controlRow;
    const execButton = cellContext.execButton;

    const isRunning = this.isCommandRunning && this.currentCommand?.cellContext === cellContext;
    const hasOutput = !!cellContext.outputContent?.querySelector('.cell-output-text');
    const isCollapsed = !!cellContext.collapsed;
    const isViewMode = !!cellContext.cellEl?.classList?.contains('mode-view');

    if (stopButton) {
      stopButton.disabled = !isRunning || isViewMode;
      stopButton.classList.toggle('active', isRunning && !isViewMode);
    }
    if (copyButton) {
      copyButton.disabled = !hasOutput;
      copyButton.classList.toggle('active', hasOutput);
    }
    if (followButton) {
      const visible = isRunning && isCollapsed;
      followButton.classList.toggle('hidden', !visible);
      followButton.disabled = !visible;
      followButton.classList.toggle('active', !!cellContext.autoFollow);
    }
    if (controlRow) {
      controlRow.classList.toggle('is-running', isRunning);
      if (isViewMode) {
        controlRow.style.display = 'none';
      } else {
        controlRow.style.removeProperty('display');
      }
    }
    if (execButton) {
      execButton.disabled = isRunning;
    }
  }

  selectCell(cellEl, options = {}) {
    if (!cellEl) return;
    if (this.selectedCell === cellEl) return;

    const { preventScroll = false } = options;

    this.clearComposerSelection();

    // Clear previous selection - remove 'selected' class from all cells first
    if (this.messages) {
      const allCells = this.messages.querySelectorAll('.notebook-cell.selected');
      allCells.forEach(cell => {
        cell.classList.remove('selected');
      });
    }

    // Then update the tracked selected cell
    if (this.selectedCell) {
      this.selectedCell.classList.remove('selected');
    }

    this.selectedCell = cellEl;
    this.selectedCell.classList.add('selected');

    // If preventScroll is true, ensure the cell doesn't scroll into view
    // This is useful for rerun operations where we want to stay in place
    if (preventScroll) {
      // Store current scroll position
      const container = this.container;
      if (container) {
        const scrollTop = container.scrollTop;
        // Restore scroll position after any potential scroll from selection
        requestAnimationFrame(() => {
          container.scrollTop = scrollTop;
        });
      }
    }
  }

  clearCellSelection() {
    if (this.selectedCell) {
      this.selectedCell.classList.remove('selected');
      this.selectedCell = null;
    }
  }

  findOutputAncestor(node) {
    if (!node) return null;
    if (node.nodeType === Node.ELEMENT_NODE) {
      return node.closest('.cell-output-text');
    }
    if (node.parentElement) {
      return node.parentElement.closest('.cell-output-text');
    }
    return null;
  }

  handleOutputCopy(event) {
    if (!this.isActive) return;
    if (!event || !event.clipboardData) return;
    const selection = typeof window !== 'undefined' ? window.getSelection?.() : null;
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const parts = [];
    for (let i = 0; i < selection.rangeCount; i += 1) {
      const range = selection.getRangeAt(i);
      const ancestor = this.findOutputAncestor(range.commonAncestorContainer) ||
        this.findOutputAncestor(range.startContainer) ||
        this.findOutputAncestor(range.endContainer);
      if (!ancestor || !this.messages || !this.messages.contains(ancestor)) continue;

      const fragment = range.cloneContents();
      if (!fragment) continue;
      if (typeof fragment.querySelectorAll === 'function') {
        fragment.querySelectorAll('.cell-output-line-number').forEach((el) => el.remove());
      }
      const text = fragment.textContent;
      if (text && text.trim().length > 0) {
        parts.push(text);
      }
    }

    if (!parts.length) return;

    event.preventDefault();
    const payload = parts.join('\n');
    try {
      event.clipboardData.setData('text/plain', payload);
    } catch (_) {}
  }

  setComposerSelected(isSelected) {
    this.composerSelected = Boolean(isSelected);
    if (this.inputWrapper) {
      this.inputWrapper.classList.toggle('composer-selected', this.composerSelected);
    }
  }

  selectComposer() {
    this.clearCellSelection();
    this.setComposerSelected(true);
  }

  clearComposerSelection() {
    this.setComposerSelected(false);
  }

  deleteSelectedCell() {
    const cell = this.selectedCell;
    if (!cell) return;

    const context = cell.__smrtContext;
    if (context) {
      // Remove pending queue entries
      this.commandQueue = this.commandQueue.filter(item => item.cellContext !== context);
    }

    if (this.currentCommand && context && this.currentCommand.cellContext === context) {
      this.pendingDeletionCells.add(cell);
      this.sendInterruptSignal();
      return;
    }

    this.removeCellElement(cell);
  }

  removeCellElement(cell, options = {}) {
    if (!cell) return;
    const { preserveScroll = true } = options || {};
    if (this.pendingDeletionCells?.has(cell)) {
      this.pendingDeletionCells.delete(cell);
    }
    if (cell === this.selectedCell) {
      this.selectedCell = null;
    }
    const container = this.container || null;
    const prevScrollTop = preserveScroll && container ? container.scrollTop : null;
    this.cellManager.removeCellElement(cell);
    if (preserveScroll && container && prevScrollTop != null) {
      // Restore prior scroll position to avoid jumping to bottom
      requestAnimationFrame(() => { container.scrollTop = prevScrollTop; });
    } else {
      this.scrollToBottom();
    }
  }

  setupMarkdownEditing(cellEl, markdownText) {
    if (!cellEl) return;
    cellEl.dataset.markdown = markdownText;
    const content = cellEl.querySelector('.cell-content');
    if (!content) return;

    const existing = content.__smrtEditHandler;
    if (existing) {
      content.removeEventListener('dblclick', existing);
    }

    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.startMarkdownEdit(cellEl);
    };

    content.__smrtEditHandler = handler;
    content.addEventListener('dblclick', handler);
  }

  startMarkdownEdit(cellEl) {
    if (!cellEl || cellEl.__editing) return;
    const container = cellEl.querySelector('.cell-content');
    if (!container) return;

    this.selectCell(cellEl);
    cellEl.__editing = true;
    const raw = cellEl.dataset.markdown || '';
    const previousMaxWidth = container.style.maxWidth || '';
    const originalRect = container.getBoundingClientRect();
    const originalHeight = originalRect.height;

    if (container.__smrtEditHandler) {
      container.removeEventListener('dblclick', container.__smrtEditHandler);
    }

    container.classList.add('markdown-editing');
    container.classList.remove('markdown-content');
    container.innerHTML = '';

    const textarea = document.createElement('textarea');
    textarea.className = 'markdown-editor';
    textarea.value = raw;
    container.appendChild(textarea);
    const commandContainer = this.inputWrapper?.querySelector('.command-input-container');
    const commandWidth = commandContainer?.getBoundingClientRect().width;
    if (Number.isFinite(commandWidth) && commandWidth > 0) {
      textarea.style.width = `${commandWidth}px`;
      container.style.maxWidth = `${commandWidth}px`;
    } else if (Number.isFinite(originalRect.width) && originalRect.width > 0) {
      textarea.style.width = `${originalRect.width}px`;
      container.style.maxWidth = `${originalRect.width}px`;
    } else {
      container.style.maxWidth = previousMaxWidth;
    }
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const computeMetrics = () => {
      const computed = window.getComputedStyle(textarea);
      let lineHeight = parseFloat(computed.lineHeight);
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        const fontSize = parseFloat(computed.fontSize);
        lineHeight = Number.isFinite(fontSize) ? fontSize * 1.4 : 18;
      }
      const paddingY = parseFloat(computed.paddingTop || 0) + parseFloat(computed.paddingBottom || 0);
      const borderY = parseFloat(computed.borderTopWidth || 0) + parseFloat(computed.borderBottomWidth || 0);
      return { lineHeight, paddingY, borderY };
    };

    const { lineHeight, paddingY, borderY } = computeMetrics();
    const maxHeight = lineHeight * 10 + paddingY + borderY;
    const baseHeight = originalHeight > 0 ? originalHeight : textarea.scrollHeight + borderY;
    const minHeight = Math.min(baseHeight, maxHeight);

    const adjustHeight = () => {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight + borderY;
      const nextHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
      textarea.style.height = `${nextHeight}px`;
    };

    textarea.style.maxHeight = `${maxHeight}px`;
    textarea.style.minHeight = `${minHeight}px`;
    requestAnimationFrame(adjustHeight);
    textarea.addEventListener('input', adjustHeight);

    const finish = (shouldRender) => {
      textarea.removeEventListener('input', adjustHeight);
      const newValue = textarea.value;
      cellEl.dataset.markdown = newValue;
      container.classList.remove('markdown-editing');
      container.classList.add('markdown-content');
      container.innerHTML = this.markdownRenderer.renderMarkdown(newValue);
      cellEl.__editing = false;
      if (previousMaxWidth) {
        container.style.maxWidth = previousMaxWidth;
      } else {
        container.style.removeProperty('max-width');
      }
      this.setupMarkdownEditing(cellEl, newValue);
    };

    const keyHandler = (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        finish(true);
      }
    };

    const blurHandler = () => finish(false);

    textarea.addEventListener('keydown', keyHandler);
    textarea.addEventListener('blur', blurHandler);
  }

  addLoadingMessage(cellContext) {
    if (!cellContext) return null;
    const { outputRow, outputBody, outputTimer } = cellContext;
    if (!outputRow || !outputBody) return null;

    outputRow.classList.remove('hidden');
    outputRow.classList.remove('has-error');
    outputBody.innerHTML = '';
    if (outputTimer) {
      outputTimer.classList.add('hidden');
      outputTimer.textContent = '00:00:00';
    }

    const loadingEl = document.createElement('div');
    loadingEl.className = 'cell-output-loading';
    loadingEl.innerHTML = `
      <div class="loading-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span>Executing...</span>
    `;

    outputBody.appendChild(loadingEl);

    // Don't auto-scroll for rerun commands
    const fromRerun = Boolean(cellContext?.fromRerun);
    if (!fromRerun) {
      if (this.isNearBottom()) this.scrollToBottom();
    }

    this.updateControlButtonStates(cellContext);
    return loadingEl;
  }

  removeLoadingMessage(loadingEl) {
    if (loadingEl && loadingEl.parentNode) {
      loadingEl.parentNode.removeChild(loadingEl);
    }
  }

  resetCellTimer(cellContext) {
    if (!cellContext) return;
    if (cellContext.timerInterval) {
      window.clearInterval(cellContext.timerInterval);
      cellContext.timerInterval = null;
    }
    cellContext.timerStart = null;
    if (cellContext.cellEl) {
      delete cellContext.cellEl.dataset.timerStart;
      delete cellContext.cellEl.dataset.timerRunning;
    }
    if (cellContext.outputTimer) {
      cellContext.outputTimer.textContent = '00:00:00';
      cellContext.outputTimer.classList.add('hidden');
    }
  }

  startCellTimer(cellContext, startTimestamp = null) {
    if (!cellContext) return;
    if (cellContext.timerInterval) {
      window.clearInterval(cellContext.timerInterval);
      cellContext.timerInterval = null;
    }
    const numericStart = Number(startTimestamp);
    const startTime = Number.isFinite(numericStart) ? numericStart : Date.now();
    cellContext.timerStart = startTime;
    if (cellContext.cellEl) {
      cellContext.cellEl.dataset.timerStart = String(startTime);
      cellContext.cellEl.dataset.timerRunning = '1';
    }
    const updateTimer = () => {
      if (!cellContext.outputTimer) return;
      const now = Date.now();
      const formatted = this.formatDuration(now - startTime);
      cellContext.outputTimer.textContent = formatted;
    };
    if (cellContext.outputTimer) {
      cellContext.outputTimer.classList.remove('hidden');
    }
    updateTimer();
    cellContext.timerInterval = window.setInterval(() => {
      if (!cellContext.timerStart) {
        this.stopCellTimer(cellContext);
        return;
      }
      updateTimer();
    }, 1000);
  }

  stopCellTimer(cellContext) {
    if (!cellContext) return;
    if (cellContext.timerInterval) {
      window.clearInterval(cellContext.timerInterval);
      cellContext.timerInterval = null;
    }
    const startTime = cellContext.timerStart;
    const hasStart = Number.isFinite(startTime);
    const elapsed = hasStart ? Date.now() - startTime : null;
    cellContext.timerStart = null;
    if (cellContext.cellEl) {
      delete cellContext.cellEl.dataset.timerStart;
      delete cellContext.cellEl.dataset.timerRunning;
    }
    if (cellContext.outputTimer) {
      cellContext.outputTimer.classList.remove('hidden');
      if (hasStart) {
        cellContext.outputTimer.textContent = this.formatDuration(elapsed);
      }
    }
  }

  formatDuration(ms) {
    const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
    const totalSeconds = Math.floor(safeMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const two = (value) => String(value).padStart(2, '0');
    return `${two(hours)}:${two(minutes)}:${two(seconds)}`;
  }

  formatFileSize(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value < 0) return '';
    if (this.pathCompleter && typeof this.pathCompleter.formatSize === 'function') {
      return this.pathCompleter.formatSize(value);
    }
    if (value < 1024) return `${value}B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)}KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)}MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }

  runShellCommand(command, cellContext, { fromRerun = false } = {}) {
    // Safety: if someone calls runShellCommand with a transfer command, route it
    const t = this.parseTransferCommand(command);
    if (t) {
      // When called from rerun with an existing cell, run in place; otherwise create a new cell
      if (cellContext) {
        cellContext.cellEl.classList.remove('mode-command', 'mode-upload', 'mode-download', 'mode-view');
        cellContext.cellEl.classList.add(`mode-${t.type}`);
        if (t.type === 'upload') {
          this.executeUploadCommand(t.sourcePath, t.targetPath, cellContext);
        } else {
          this.executeDownloadCommand(t.sourcePath, t.targetPath, cellContext);
        }
      } else {
        this.handleTransferCommand(t);
      }
      return;
    }
    if (!cellContext) {
      cellContext = this.addUserMessage(command);
    }

    // Store fromRerun flag in cellContext for later use
    cellContext.fromRerun = fromRerun;
    this.dbg('runShellCommand', { command, fromRerun });

    // For rerun commands, prevent scroll when selecting the cell
    this.selectCell(cellContext.cellEl, { preventScroll: fromRerun });

    cellContext.command = command;
    cellContext.syntaxMode = this.detectSyntaxMode(command);
    if (cellContext.commandPre) {
      cellContext.commandPre.textContent = command;
    }

    if (cellContext.outputRow) {
      cellContext.outputRow.classList.remove('hidden');
    }
    if (cellContext.outputBody) {
      cellContext.outputBody.innerHTML = '<div class="queued-message">Waiting for previous command…</div>';
    }
    this.resetCellTimer(cellContext);
    if (cellContext.outputPrompt) {
      cellContext.outputPrompt.textContent = 'Out [*]:';
    }
    if (cellContext.inputPrompt) {
      cellContext.inputPrompt.textContent = 'In [*]:';
    }
    if (cellContext.controlPrompt) {
      cellContext.controlPrompt.textContent = 'Ctl [*]:';
    }

    this.commandQueue.push({ command, cellContext, fromRerun });
    this.updateControlButtonStates(cellContext);
    this.processCommandQueue();
  }

  processCommandQueue() {
    if (this.isCommandRunning) return;
    this.lastCommand = null;
    const next = this.commandQueue.shift();
    if (!next) return;
    this.startQueuedCommand(next);
  }

  async startQueuedCommand({ command, cellContext, fromRerun = false }) {
    if (!cellContext) return;

    if (cellContext.collapsed) {
      cellContext.collapsed = false;
      this.updateCollapseState(cellContext);
    }

    const executionIndex = this.cellCounter++;
    this.applyExecutionIndex(cellContext, executionIndex);

    this.lastCommand = { command, cellContext, fromRerun };

    const loadingEl = this.addLoadingMessage(cellContext);
    this.updateControlButtonStates(cellContext);

    try {
      // Check if terminal is ready before executing command
      if (!this.terminalReady) {
        throw new Error('Terminal is not ready yet. Please wait for initialization to complete.');
      }

      // 获取当前 Tab 的状态
      const tabState = typeof this.getTabState === 'function' ? this.getTabState() : null;
      const ptyId = tabState?.ptyId;
      const backendMode = (tabState && (tabState.backendMode || tabState.mode)) || 'pty';

      if (!ptyId) {
        throw new Error('No PTY available for this tab');
      }

      this.dbg('Executing command with PTY mode:', { ptyId, command });

      // 检测是否为交互式命令（基于命令字符串的“显式判断”）
      const isInteractiveCommand = /^\s*(ssh|telnet|nc|netcat|mysql|psql|mongo|redis-cli|python|node|irb|rails\s+console)\s+/i.test(command);

      // If this is an ssh command, try to capture the target for later SCP fallback
      if (/^\s*ssh\s+/i.test(command)) {
        this.pendingSshTarget = this.parseSshTarget(command);
        this.dbg('ssh pending target:', this.pendingSshTarget);
      }

      // 生成 sentinel ID（用于检测命令完成）
      const sentinelId = this.createCommandSentinelId();

      // 为命令添加 sentinel（交互式命令除外）
      const commandWithSentinel = this.appendCommandSentinel(command, sentinelId);

      // 存储当前命令信息
      this.currentCommand = {
        ptyId,
        command,
        output: '',
        startTime: Date.now(),
        loadingEl,
        cellContext,
        outputPre: null,
        exitCode: null,
        fromRerun,
        // 是否交互式：初始为“显式判断”（命令本身），后续可能被运行时启发式提升为 true
        isInteractive: isInteractiveCommand,
        // 标记交互式来源：显式/启发式
        isInteractiveExplicit: isInteractiveCommand,
        isInteractiveHeuristic: false,
        sentinelId: isInteractiveCommand ? null : sentinelId,
        promptBuffer: '',
        sentinelCaptured: false,
        altScreenActive: false,
        syncOutputActive: false,
        tuiSuppressedBytes: 0,
        tuiSuppressedShown: false,
        backendMode,
        disableAltScreenSuppression: typeof backendMode === 'string' && backendMode.startsWith('tmux')
      };

      if (cellContext?.outputPrompt) {
        cellContext.outputPrompt.textContent = 'Out [*]:';
      }
      this.setCommandRunning(true, cellContext);
      this.commandBusyWarningShown = false;

      this.updateControlButtonStates(cellContext);

      // 通过 PTY 写入命令
      const writeResult = await sm.term.write({ ptyId, data: commandWithSentinel + '\r' });
      if (!writeResult.ok) {
        throw new Error(writeResult.error || 'Failed to write command to PTY');
      }

      this.dbg('Command written to PTY:', { ptyId, isInteractive: isInteractiveCommand });

    } catch (error) {
      this.removeLoadingMessage(loadingEl);
      this.renderCellOutput(cellContext, `Failed to execute: ${error.message}`, { isError: true });
      this.currentCommand = null;
      this.lastCommand = null;
      this.setCommandRunning(false, cellContext);
      this.processCommandQueue();
    }

    // Only scroll to bottom for new commands, not reruns
    if (!fromRerun) {
      this.scrollToBottom();
    }
  }

  parseSshTarget(cmd) {
    try {
      const s = String(cmd || '');
      // crude tokenization
      const tokens = s.split(/\s+/).slice(1); // remove 'ssh'
      let user = null, host = null, port = null;
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t === '-p' && tokens[i+1]) { port = tokens[i+1]; i++; continue; }
        if (t.startsWith('-p') && t.length > 2) { port = t.slice(2); continue; }
        if (!t.startsWith('-')) {
          // first non-flag token is usually target
          const m = t.match(/^([^@]+)@(.+)$/);
          if (m) { user = m[1]; host = m[2]; }
          else { host = t; }
          break;
        }
      }
      if (!host) return null;
      return { user, host, port };
    } catch (_) { return null; }
  }

  // If the terminal backend is stdio (no PTY), tweak certain commands for better UX.
  adaptCommandForEnvironment(raw) {
    const input = String(raw || '');
    let out = input;
    try {
      const tab = typeof this.getTabState === 'function' ? this.getTabState() : null;
      const mode = tab?.mode || 'pty';

      // Check if it's an ssh invocation
      const m = input.match(/^\s*ssh(\s+)([\s\S]*)$/);
      if (m) {
        const rest = m[2] || '';
        const hasT = /(^|\s)-t{1,2}(\s|$)/.test(rest);

        // For stdio mode (no PTY), force remote TTY allocation
        if (mode !== 'pty') {
          const injected = hasT ? rest : `-tt ${rest}`;
          out = `TERM=xterm-256color ssh ${injected}`;
          this.dbg('adapt ssh for stdio ->', out);
        } else {
          // For PTY mode, also add -tt if not present to ensure proper TTY allocation
          if (!hasT) {
            out = `ssh -tt ${rest}`;
            this.dbg('adapt ssh for pty (add -tt) ->', out);
          }
        }
      }
    } catch (e) {
      // best-effort adaptation, ignore errors
    }
    return out;
  }

  toggleOutputCollapse(cellContext) {
    if (!cellContext || !cellContext.outputRow) return;
    cellContext.collapsed = !cellContext.collapsed;
    this.updateCollapseState(cellContext);
    this.updateControlButtonStates(cellContext);
    // Persist immediately so collapse/expand survives app crashes or
    // quick quits; still markDirty to keep other listeners informed.
    try { if (typeof this.requestPersist === 'function') this.requestPersist(); } catch (_) {}
    this.markDirty();
  }

  updateCollapseState(cellContext) {
    if (!cellContext || !cellContext.outputRow) return;
    const collapsed = !!cellContext.collapsed;
    cellContext.outputRow.classList.toggle('collapsed', collapsed);
    if (cellContext.cellEl) {
      cellContext.cellEl.dataset.outputCollapsed = collapsed ? '1' : '0';
    }
    if (cellContext.outputRow) {
      cellContext.outputRow.dataset.collapsed = collapsed ? '1' : '0';
    }

    const outputEl = cellContext.outputContent?.querySelector('.cell-output-text');
    if (outputEl && outputEl.dataset.virtualized === '1') {
      const state = this.virtualOutputs.get(outputEl);
      this.updateVirtualAutoSize(outputEl, state);
      this.updateVirtualViewport(outputEl, { force: true });
    }
  }

  rehydrateCells() {
    this.cellManager.rehydrateCells(this.messages);

    // Sync counters
    this.cellIdCounter = this.cellManager.cellIdCounter;
    this.cellCounter = this.cellManager.cellCounter;

    // Reattach handlers for all cells
    const cells = this.messages.querySelectorAll('.notebook-cell');
    cells.forEach((cellEl) => {
      const isMarkdown = cellEl.classList.contains('markdown-cell');
      if (isMarkdown) {
        this.setupMarkdownEditing(cellEl, cellEl.dataset.markdown || '');
        return;
      }

      const cellContext = cellEl.__smrtContext;
      if (cellContext) {
        this.attachCommandEditing(cellContext);
        this.attachOutputCollapseHandlers(cellContext);
        this.attachControlHandlers(cellContext);
        this.updateCollapseState(cellContext);
        this.updateControlButtonStates(cellContext);
        cellContext.syntaxMode = this.detectSyntaxMode(cellContext.command || '');
        this.ensureVirtualOutput(cellContext);
      }
    });
  }

  setInputMode(mode, { silent = false } = {}) {
    const normalizedMode = mode === 'markdown' ? 'markdown' : 'code';

    if (normalizedMode === 'markdown' && this.isCommandRunning) {
      if (!silent) {
        this.addSystemMessage('Finish running command before switching to Markdown mode', '⚠️');
      }
      return;
    }

    if (this.inputMode === normalizedMode) {
      if (normalizedMode !== 'code') {
        this.hideSuggestions();
      }
      this.updateInputAffordances();
      if (!silent) this.focus();
      return;
    }

    this.inputMode = normalizedMode;

    this.updateInputAffordances();

    if (normalizedMode !== 'code') {
      this.hideSuggestions();
    }

    if (!silent) this.focus();
    this.markDirty();
  }

  renderCellOutput(cellContext, text, { isError = false } = {}) {
    const safeText = typeof text === 'string' ? text : String(text ?? '');

    if (!cellContext || !cellContext.outputRow || !cellContext.outputContent) {
      if (isError) {
        this.addErrorMessage(safeText);
      } else {
        this.addSystemMessage(safeText || '(no output)');
      }
      return null;
    }

    cellContext.outputRow.classList.remove('hidden');
    cellContext.outputRow.classList.toggle('has-error', !!isError);
    if (cellContext.outputBody) {
      cellContext.outputBody.innerHTML = '';
    }

    const pre = this.createVirtualOutputElement();
    const syntaxMode = cellContext.syntaxMode || '';
    pre.dataset.syntaxMode = syntaxMode;
    this.updateOutputPreText(pre, safeText || (isError ? 'Error' : '(command executed, no output)'), { language: syntaxMode });

    if (cellContext.outputBody) {
      cellContext.outputBody.appendChild(pre);
    } else {
      cellContext.outputContent?.appendChild(pre);
    }

    // Don't auto-scroll for rerun commands
    const fromRerun = Boolean(cellContext?.fromRerun);
    if (!fromRerun) {
      this.scrollToBottom();
    }

    this.updateControlButtonStates(cellContext);
    this.markDirty();

    return pre;
  }

  updateOutputPreText(preEl, text, options = {}) {
    if (!preEl) return;
    const normalized = typeof text === 'string' ? text : String(text ?? '');
    // Always write content; even if cleaned text is identical, the raw stream may still be progressing
    // and users expect visible activity. textContent updates are cheap enough.
    preEl.dataset.rawOutput = normalized;
    if (options.language) {
      preEl.dataset.syntaxMode = options.language;
    }
    const syntaxMode = options.language || preEl.dataset.syntaxMode || '';

    if (preEl.dataset.virtualized === '1') {
      this.updateVirtualOutputText(preEl, normalized, { language: syntaxMode });
      return;
    }

    const lines = normalized ? normalized.split('\n') : [''];
    preEl.innerHTML = this.renderOutputLines(lines, 0, syntaxMode);
  }

  createVirtualOutputElement() {
    const container = document.createElement('div');
    container.className = 'cell-output-text cell-output-virtual';
    container.dataset.virtualized = '1';

    const spacer = document.createElement('div');
    spacer.className = 'cell-output-virtual-spacer';
    container.appendChild(spacer);

    const viewport = document.createElement('div');
    viewport.className = 'cell-output-virtual-viewport';
    container.appendChild(viewport);

    const state = {
      spacerEl: spacer,
      viewportEl: viewport,
      lines: [''],
      text: '',
      lineHeight: 0,
      renderStart: 0,
      renderEnd: 0,
      lastScrollTop: -1,
      lastClientHeight: -1,
      pendingFrame: null,
      resizeObserver: null,
      highlightLang: null
    };

    this.virtualOutputs.set(container, state);

    const onScroll = () => {
      this.updateVirtualViewport(container);
    };
    state.scrollHandler = onScroll;
    container.__smrtVirtualScrollHandler = onScroll;
    container.addEventListener('scroll', onScroll);

    if (typeof ResizeObserver !== 'undefined') {
      try {
        state.resizeObserver = new ResizeObserver(() => {
          this.refreshVirtualMetrics(container);
          this.updateVirtualViewport(container, { force: true });
        });
        state.resizeObserver.observe(container);
        container.__smrtVirtualResizeObserver = state.resizeObserver;
      } catch (_) {
        state.resizeObserver = null;
      }
    }

    // Ensure initial metrics are available once element is in DOM
    requestAnimationFrame(() => {
      this.refreshVirtualMetrics(container);
      this.updateVirtualViewport(container, { force: true });
    });

    return container;
  }

  refreshVirtualMetrics(el) {
    const state = this.virtualOutputs.get(el);
    if (!state) return;
    let lineHeight = 0;
    try {
      const style = window.getComputedStyle(el);
      lineHeight = parseFloat(style.lineHeight || '');
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        const fontSize = parseFloat(style.fontSize || '');
        if (Number.isFinite(fontSize) && fontSize > 0) {
          lineHeight = fontSize * 1.5;
        }
      }
    } catch (_) {
      /* ignore */
    }
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
      lineHeight = 20;
    }
    state.lineHeight = lineHeight;
  }

  updateVirtualOutputText(el, text, { language = null } = {}) {
    const state = this.virtualOutputs.get(el);
    if (!state) return;

    state.text = text || '';
    state.lines = state.text ? state.text.split('\n') : [''];
    el.dataset.syntaxMode = language || '';

    this.updateVirtualSpacer(el, state);
    this.updateVirtualViewport(el, { force: true });
  }

  updateVirtualSpacer(el, state) {
    if (!state) return;
    if (!state.lineHeight || state.lineHeight <= 0) {
      this.refreshVirtualMetrics(el);
    }
    const lineHeight = state.lineHeight || 20;
    const totalLines = Math.max(1, state.lines.length);
    const viewportPadding = this.getVirtualContainerPadding(el);
    state.paddingTop = viewportPadding.top;
    state.paddingBottom = viewportPadding.bottom;
    const totalHeight = totalLines * lineHeight;
    state.spacerEl.style.height = `${totalHeight}px`;
    this.updateVirtualAutoSize(el, state);
  }

  updateVirtualViewport(el, { force = false } = {}) {
    const state = this.virtualOutputs.get(el);
    if (!state) return;

    if (!state.lineHeight || state.lineHeight <= 0) {
      this.refreshVirtualMetrics(el);
    }
    const lineHeight = state.lineHeight || 20;
    const scrollTop = el.scrollTop;
    const clientHeight = el.clientHeight || 0;
    const paddingTop = state.paddingTop || 0;
    const paddingBottom = state.paddingBottom || 0;

    const overscan = Math.max(0, this._virtualBufferLines || 0) * lineHeight;
    const totalLines = Math.max(1, state.lines.length);
    const visibleHeight = Math.max(0, clientHeight - paddingTop - paddingBottom);
    const contentScrollTop = Math.max(0, scrollTop - paddingTop);
    const totalHeight = totalLines * lineHeight;

    const startPx = Math.max(0, contentScrollTop - overscan);
    const endPx = Math.min(totalHeight, contentScrollTop + visibleHeight + overscan);
    const startLine = Math.max(0, Math.floor(startPx / lineHeight));
    const endLine = Math.min(totalLines, Math.ceil(endPx / lineHeight));

    if (!force &&
        state.renderStart === startLine &&
        state.renderEnd === endLine &&
        state.lastScrollTop === scrollTop &&
        state.lastClientHeight === clientHeight) {
      return;
    }

    state.renderStart = startLine;
    state.renderEnd = endLine;
    state.lastScrollTop = scrollTop;
    state.lastClientHeight = clientHeight;

    const lines = state.lines.slice(startLine, endLine);
    const translateY = paddingTop + (startLine * lineHeight);
    state.viewportEl.style.transform = `translateY(${translateY}px)`;
    const language = el.dataset.syntaxMode || '';
    state.viewportEl.innerHTML = this.renderOutputLines(lines, startLine, language);
    this.updateVirtualSpacer(el, state);
  }

  updateVirtualAutoSize(el, state) {
    if (!state) return;
    const lineHeight = state.lineHeight || 20;
    const totalLines = Math.max(1, state.lines.length);
    const totalHeight = totalLines * lineHeight;

    // Auto-expand small outputs to avoid unnecessary scrollbars
    const threshold = Math.max(200, this._virtualAutoHeightThreshold || 0);
    const isCollapsed = el.closest('.cell-row.cell-output.collapsed');

    if (isCollapsed) {
      el.style.height = '';
      el.style.maxHeight = '';
      el.dataset.virtualOverflow = '1';
      return;
    }

    if (totalHeight <= threshold) {
      el.style.height = `${totalHeight}px`;
      el.style.maxHeight = `${totalHeight}px`;
      el.dataset.virtualOverflow = '0';
    } else {
      el.style.height = '';
      el.style.maxHeight = 'var(--cell-output-max-height, 65vh)';
      el.dataset.virtualOverflow = '1';
    }
  }

  getVirtualContainerPadding(el) {
    if (!el || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
      return { top: 0, bottom: 0 };
    }
    try {
      const style = window.getComputedStyle(el);
      const parsePadding = (prop) => {
        const raw = style.getPropertyValue(prop);
        const value = parseFloat(raw);
        return Number.isFinite(value) ? value : 0;
      };
      return {
        top: parsePadding('padding-top'),
        bottom: parsePadding('padding-bottom')
      };
    } catch (_) {
      return { top: 0, bottom: 0 };
    }
  }

  renderOutputLines(lines, offset, language) {
    const spec = this.resolveSyntaxSpec(language);
    const parts = [];
    for (let i = 0; i < lines.length; i += 1) {
      const raw = typeof lines[i] === 'string' ? lines[i] : '';
      const lineNumber = offset + i + 1;
      let content;
      if (spec) {
        content = this.highlightLineWithSpec(raw, spec);
      } else {
        content = raw ? this.escapeHtml(raw) : '';
      }
      if (!content) content = '&nbsp;';
      parts.push(`<div class="cell-output-line"><span class="cell-output-line-number">${lineNumber}</span><span class="cell-output-line-text">${content}</span></div>`);
    }
    if (!parts.length) {
      parts.push(`<div class="cell-output-line"><span class="cell-output-line-number">${offset + 1}</span><span class="cell-output-line-text">&nbsp;</span></div>`);
    }
    return parts.join('');
  }

  getFileNameFromPath(input) {
    if (!input || typeof input !== 'string') return '';
    const normalized = input.replace(/\\+/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    if (!segments.length) return normalized.trim();
    return segments[segments.length - 1];
  }

  resolveSyntaxSpec(language) {
    if (!language) return null;
    const key = String(language).toLowerCase();
    if (this.syntaxConfigCache.has(key)) {
      return this.syntaxConfigCache.get(key);
    }
    let spec = SYNTAX_SPECS[key] || null;
    if (!spec) {
      spec = Object.keys(SYNTAX_SPECS).find((name) => {
        const cfg = SYNTAX_SPECS[name];
        return Array.isArray(cfg.aliases) && cfg.aliases.includes(key);
      });
      spec = spec ? SYNTAX_SPECS[spec] : null;
    }
    this.syntaxConfigCache.set(key, spec || null);
    return spec || null;
  }

  highlightLineWithSpec(line, spec) {
    const source = typeof line === 'string' ? line : '';
    if (!source) {
      return '';
    }

    const matches = [];
    if (Array.isArray(spec.patterns)) {
      spec.patterns.forEach((pattern, order) => {
        if (!pattern || !pattern.regex) return;
        const base = pattern.regex;
        const flags = base.flags.includes('g') ? base.flags : `${base.flags}g`;
        const regex = new RegExp(base.source, flags);
        let match;
        while ((match = regex.exec(source)) !== null) {
          const text = match[0];
          if (!text) {
            if (regex.lastIndex === match.index) regex.lastIndex += 1;
            continue;
          }
          let start = match.index;
          let end = start + text.length;
          if (pattern.onMatch) {
            const transformed = pattern.onMatch({ match, start, end, text });
            if (!transformed) {
              if (regex.lastIndex === match.index) regex.lastIndex += 1;
              continue;
            }
            start = transformed.start;
            end = transformed.end;
          }
          matches.push({ start, end, token: pattern.token, order });
          if (regex.lastIndex === match.index) regex.lastIndex += 1;
        }
      });
    }

    if (!matches.length) {
      return this.escapeHtml(source);
    }

    matches.sort((a, b) => (a.start - b.start) || (a.order - b.order));
    const merged = [];
    matches.forEach((m) => {
      if (merged.some(existing => !(m.end <= existing.start || m.start >= existing.end))) {
        return;
      }
      merged.push(m);
    });

    let cursor = 0;
    let output = '';
    merged.forEach((m) => {
      if (m.start > cursor) {
        output += this.escapeHtml(source.slice(cursor, m.start));
      }
      const segment = source.slice(m.start, m.end);
      const tokenClass = m.token ? ` ${m.token}` : '';
      output += `<span class="token${tokenClass}">${this.escapeHtml(segment)}</span>`;
      cursor = m.end;
    });
    if (cursor < source.length) {
      output += this.escapeHtml(source.slice(cursor));
    }
    return output || '';
  }

  detectSyntaxMode(command) {
    const tokens = this.tokenizeCommand(command);
    if (!tokens.length) return null;
    const base = tokens[0].toLowerCase();
    const catLike = new Set(['cat', 'bat', 'type', 'less', 'more', 'tail', 'head']);
    if (catLike.has(base)) {
      const path = this.extractFirstPath(tokens.slice(1));
      if (path) {
        return this.languageFromExtension(path);
      }
    }
    return null;
  }

  tokenizeCommand(command) {
    if (!command) return [];
    const tokens = [];
    let current = '';
    let quote = null;
    let escape = false;
    const input = String(command);
    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      if (escape) {
        current += ch;
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (quote) {
        if (ch === quote) {
          quote = null;
          continue;
        }
        current += ch;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (/\s/.test(ch)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }
      current += ch;
    }
    if (current) tokens.push(current);
    return tokens;
  }

  extractFirstPath(args) {
    if (!Array.isArray(args)) return null;
    for (const arg of args) {
      if (!arg) continue;
      if (arg.startsWith('-')) continue;
      return arg;
    }
    return null;
  }

  languageFromExtension(path) {
    if (!path) return null;
    const normalized = path.replace(/\\\\/g, '/');
    const segments = normalized.split('/');
    const file = segments.pop() || '';
    const idx = file.lastIndexOf('.');
    if (idx <= 0 || idx === file.length - 1) return null;
    const ext = file.slice(idx + 1).toLowerCase();
    return EXTENSION_LANGUAGE_MAP[ext] || null;
  }

  ensureVirtualOutput(cellContext) {
    if (!cellContext) return;
    const host = cellContext.outputBody || cellContext.outputContent;
    if (!host) return;
    const existing = host.querySelector('.cell-output-text');
    if (!existing) return;

    if (existing.dataset.virtualized === '1') {
      if (!this.virtualOutputs.has(existing)) {
        this.rebindVirtualOutput(existing);
      }
      return;
    }

    const rawText = existing.dataset.rawOutput || existing.textContent || '';
    const replacement = this.createVirtualOutputElement();
    replacement.dataset.syntaxMode = cellContext?.syntaxMode || '';
    this.updateOutputPreText(replacement, rawText, { language: replacement.dataset.syntaxMode });
    existing.replaceWith(replacement);

    if (this.currentCommand && this.currentCommand.outputPre === existing) {
      this.currentCommand.outputPre = replacement;
    }
    if (this.lastFinalizedCommand && this.lastFinalizedCommand.outputPre === existing) {
      this.lastFinalizedCommand.outputPre = replacement;
    }
  }

  rebindVirtualOutput(el) {
    if (!el) return;
    const spacer = el.querySelector('.cell-output-virtual-spacer');
    const viewport = el.querySelector('.cell-output-virtual-viewport');
    if (!spacer || !viewport) {
      // Fallback: recreate from scratch
      const rawText = el.dataset.rawOutput || el.textContent || '';
      const replacement = this.createVirtualOutputElement();
      replacement.dataset.syntaxMode = el.dataset.syntaxMode || '';
      this.updateOutputPreText(replacement, rawText, { language: replacement.dataset.syntaxMode });
      el.replaceWith(replacement);
      return;
    }

    const state = {
      spacerEl: spacer,
      viewportEl: viewport,
      lines: [],
      text: '',
      lineHeight: 0,
      renderStart: 0,
      renderEnd: 0,
      lastScrollTop: -1,
      lastClientHeight: -1,
      pendingFrame: null,
      resizeObserver: null
    };

    const raw = el.dataset.rawOutput || '';
    state.text = raw;
    state.lines = raw ? raw.split('\n') : [''];
    this.virtualOutputs.set(el, state);

    const onScroll = () => {
      this.updateVirtualViewport(el);
    };
    if (el.__smrtVirtualScrollHandler) {
      try { el.removeEventListener('scroll', el.__smrtVirtualScrollHandler); } catch (_) {}
    }
    state.scrollHandler = onScroll;
    el.__smrtVirtualScrollHandler = onScroll;
    el.addEventListener('scroll', onScroll);

    if (el.__smrtVirtualResizeObserver) {
      try { el.__smrtVirtualResizeObserver.disconnect(); } catch (_) {}
      el.__smrtVirtualResizeObserver = null;
    }

    if (typeof ResizeObserver !== 'undefined') {
      try {
        state.resizeObserver = new ResizeObserver(() => {
          this.refreshVirtualMetrics(el);
          this.updateVirtualViewport(el, { force: true });
        });
        state.resizeObserver.observe(el);
        el.__smrtVirtualResizeObserver = state.resizeObserver;
      } catch (_) {
        state.resizeObserver = null;
      }
    }

    requestAnimationFrame(() => {
      this.refreshVirtualMetrics(el);
      this.updateVirtualViewport(el, { force: true });
    });
  }


  renderMarkdown(markdownText) {
    return this.markdownRenderer.renderMarkdown(markdownText);
  }

  renderMarkdownInline(text) {
    return this.markdownRenderer.renderMarkdownInline(text);
  }

  updateInputPrompt() {
    if (!this.input) return;
    const container = this.input.closest('.command-input-container');
    const promptEl = container?.querySelector('.prompt-symbol');
    if (promptEl) {
      promptEl.textContent = 'In [ ]:';
    }
  }

  updateInputAffordances() {
    if (!this.input) {
      ChatTerminal.updateExecuteButtonState();
      return;
    }

    if (!this.isActive) {
      ChatTerminal.updateExecuteButtonState();
      return;
    }

    if (this.isRestarting) {
      const placeholder = i18n?.t?.('input.restart', '会话正在重启，请稍候…') || '会话正在重启，请稍候…';
      this.input.disabled = true;
      this.input.placeholder = placeholder;
      this.input.title = placeholder;
      ChatTerminal.updateExecuteButtonState();
      return;
    }

    if (!this.terminalReady) {
      this.input.disabled = true;
      this.input.placeholder = 'Terminal is initializing...';
      this.input.title = 'Please wait for terminal to be ready';
      ChatTerminal.updateExecuteButtonState();
      return;
    }

    this.input.disabled = false;

    if (this.inputMode === 'markdown') {
      this.input.placeholder = 'Write Markdown (Shift+Enter to render • Enter for newline)';
      this.input.title = 'Markdown 模式：输入 Markdown 内容，按 Shift+Enter 渲染。使用 C 切换回命令模式。';
    } else {
      this.input.placeholder = 'Type a command (Shift+Enter to run • Enter for newline)';
      this.input.title = '命令模式：输入指令并按 Shift+Enter 执行。使用 M 切换到 Markdown 模式。';
    }

    this.updateInputPrompt();
    ChatTerminal.updateExecuteButtonState();
  }

  // Fast pre-cleaning of control/ANSI/OSC for display buffer to reduce render work
  preCleanChunk(chunk) {
    if (!chunk) return '';
    try {
      let t = String(chunk);
      // Normalize CRLF/CR to \n
      t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // Apply backspaces/DEL before stripping control chars, to preserve intended edits
      // Example: "d\bdocker ps" should become "docker ps" instead of "ddocker ps"
      {
        let out = '';
        for (let i = 0; i < t.length; i++) {
          const code = t.charCodeAt(i);
          if (code === 0x08 /* \b */ || code === 0x7f /* DEL */) {
            if (out.length) out = out.slice(0, -1);
          } else {
            out += t[i];
          }
        }
        t = out;
      }
      // Remove OSC sequences: ESC ] ... (BEL or ST)
      t = t.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '');
      // Remove ANSI/CSI sequences (colors, cursor moves, etc.)
      const ansi = /(?:\u001b\[|\u009b)[0-?]*[ -\/]*[@-~]|\u001b[ -\/]*[\d@-~<>=?]/g;
      t = t.replace(ansi, '');
      // Remove DCS-style sequences ESC P ... ESC \\
      t = t.replace(/\u001b[PX^_][\s\S]*?\u001b\\/g, '');
      // Remove control chars except newline
      t = t.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, (ch) => (ch === '\n' ? '\n' : ''));
      return t;
    } catch (_) {
      return typeof chunk === 'string' ? chunk : String(chunk ?? '');
    }
  }

  // Compute the cleaned text used for DOM display, capped to a tail slice
  getDisplayCleanOutput(output, command) {
    try {
      let truncated = false;
      let slice = typeof output === 'string' ? output : String(output ?? '');
      if (slice.length > this._displayCap) {
        truncated = true;
        slice = slice.slice(-this._displayCap);
      }
      // Always run the full cleaner here so we can remove echoed commands/prompts
      // even if the buffer is already sanitized by preCleanChunk.
      let clean = this.cleanTerminalOutput(slice, command);
      // Soft-wrap very long single lines to avoid expensive layout on huge unbroken lines
      if (this._maxVisualLineLen && this._maxVisualLineLen > 0) {
        try {
          const parts = clean.split('\n');
          for (let i = 0; i < parts.length; i += 1) {
            const line = parts[i];
            if (line && line.length > this._maxVisualLineLen) {
              const chunks = [];
              for (let j = 0; j < line.length; j += this._maxVisualLineLen) {
                chunks.push(line.slice(j, j + this._maxVisualLineLen));
              }
              parts[i] = chunks.join('\n');
            }
          }
          clean = parts.join('\n');
        } catch (_) { /* ignore wrapping errors */ }
      }
      if (truncated) clean = '\u2026 truncated \u2026\n' + clean; // leading hint
      return clean;
    } catch (_) {
      return '';
    }
  }

  // Render the current command's output immediately (single DOM update)
  _renderCurrentCommandOutput(cellContext, fromRerun) {
    if (!this.currentCommand) return;
    const cleanOutput = this.getDisplayCleanOutput(this.currentCommand.output, this.currentCommand.command);
    if (!this.currentCommand.outputPre) {
      const preEl = this.renderCellOutput(cellContext, cleanOutput);
      this.currentCommand.outputPre = preEl;
      if (!cellContext?.collapsed && !fromRerun) {
        if (this.isNearBottom()) this.scrollToBottom();
      }
    } else {
      const preEl = this.currentCommand.outputPre;
      const syntaxMode = cellContext?.syntaxMode || '';
      preEl.dataset.syntaxMode = syntaxMode;
      let prevScrollTop = 0;
      if (cellContext?.collapsed) prevScrollTop = preEl.scrollTop;
      this.updateOutputPreText(preEl, cleanOutput, { language: syntaxMode });
      if (cellContext?.collapsed) {
        if (cellContext.autoFollow) {
          preEl.scrollTop = preEl.scrollHeight - preEl.clientHeight;
        } else {
          preEl.scrollTop = prevScrollTop;
        }
      } else if (!fromRerun) {
        if (this.isNearBottom()) this.scrollToBottom();
      }
      this.updateControlButtonStates(cellContext);
    }
  }

  isNearBottom(pixels = 200) {
    try {
      const c = this.container;
      if (!c) return false;
      const delta = (c.scrollHeight - c.clientHeight - c.scrollTop);
      return delta <= pixels;
    } catch (_) { return false; }
  }

  // Schedule a render on the next animation frame (coalesces bursts)
  _scheduleOutputRender(cellContext, fromRerun) {
    if (this._pendingRender) return;
    this._pendingRender = true;
    const flush = () => {
      if (!this._pendingRender) return;
      this._pendingRender = false;
      if (this._pendingRAF) { cancelAnimationFrame?.(this._pendingRAF); this._pendingRAF = null; }
      if (this._pendingTO) { clearTimeout(this._pendingTO); this._pendingTO = null; }
      this._lastRenderTS = Date.now();
      try { this._renderCurrentCommandOutput(cellContext, fromRerun); } catch (_) {}
      // Reset accumulated byte counter after a paint
      this._accBytesSincePaint = 0;
    };
    // Throttle: if last paint was too recent, delay to respect min interval
    const since = Date.now() - (this._lastRenderTS || 0);
    const needDelay = Number.isFinite(this._minRenderIntervalMs) && since < this._minRenderIntervalMs;
    if (needDelay) {
      const delay = Math.max(0, this._minRenderIntervalMs - since);
      this._pendingTO = setTimeout(flush, delay);
      return;
    }
    // Prefer rAF for visible, smooth paints
    if (typeof requestAnimationFrame === 'function' && !document.hidden) {
      this._pendingRAF = requestAnimationFrame(flush);
    }
    // Always arm a fallback timeout, in case rAF is throttled/hidden
    this._pendingTO = setTimeout(flush, this._flushFallbackMs);
  }

  handleTerminalOutput(data) {
    const hasQueuedCommands = this.commandQueue.length > 0;
    // If there's no current command, decide whether the chunk belongs to trailing output
    // or we should immediately start the next queued command.
    if (!this.currentCommand) {
      const canAppendToLast =
        !hasQueuedCommands &&
        this.lastFinalizedCommand &&
        this.lastFinalizedCommand.outputPre;

      if (canAppendToLast) {
        const timeSinceFinalize = Date.now() - (this.lastFinalizedCommand.finalizeTime || 0);
        // Allow 5 seconds buffer to receive trailing output after finalization
        // This handles cases where commands continue producing output after prompt detection
        if (timeSinceFinalize < 5000) {
          this.dbg('Appending trailing output to finalized command', { bytes: data.length });
          this.lastFinalizedCommand.output += data;
          const cleanTail = this.getDisplayCleanOutput(
            this.lastFinalizedCommand.output,
            this.lastFinalizedCommand.command
          );
          const tailLang = this.lastFinalizedCommand.syntaxMode || this.lastFinalizedCommand?.cellContext?.syntaxMode || '';
          this.updateOutputPreText(this.lastFinalizedCommand.outputPre, cleanTail, { language: tailLang });

          // Update the cell context if available
          if (this.lastFinalizedCommand.cellContext) {
            const cellContext = this.lastFinalizedCommand.cellContext;
            if (cellContext.outputRow) {
              cellContext.outputRow.classList.remove('hidden');
            }
            this.updateControlButtonStates(cellContext);
          }
          return;
        }
      }

      if (hasQueuedCommands && !this.isCommandRunning) {
        this.processCommandQueue();
      }
      // If still no current command, return early
      if (!this.currentCommand) {
        return;
      }
    }

    const rawChunk = (typeof data === 'string' ? data : '');
    this.dbg('data chunk', { bytes: rawChunk.length });
    if (this.debugEnabled && rawChunk) {
      this.dbg('chunk preview', this.formatDebugPreview(rawChunk));
    }
    // Decide whether to suppress output during alt-screen/sync-output
    const disableAltScreenSuppression = Boolean(this.currentCommand?.disableAltScreenSuppression);
    let displayChunk = '';
    if (rawChunk) {
      // Always sanitize chunks so interactive programs remain visible in the transcript
      displayChunk = this.preCleanChunk(rawChunk);
      this.currentCommand.output += displayChunk;
      this._outputIsSanitized = true;
      // Reset suppressed byte tracking since we now stream the actual content
      if (this.currentCommand.tuiSuppressedBytes) {
        this.currentCommand.tuiSuppressedBytes = 0;
      }
    }
    // Cap buffer to avoid unbounded growth
    if (this.currentCommand.output.length > this._bufferCap) {
      this.currentCommand.output = this.currentCommand.output.slice(-this._bufferCap);
    }
    const cellContext = this.currentCommand.cellContext;
    if (cellContext?.outputPrompt) {
      const idx = cellContext.outputPrompt.dataset.index;
      cellContext.outputPrompt.textContent = this.isCommandRunning ? 'Out [*]:' : `Out [${idx}]:`;
    }
    if (typeof this.currentCommand.promptBuffer !== 'string') {
      this.currentCommand.promptBuffer = '';
    }
    // Keep prompt buffer lightweight (sanitized) to aid prompt detection when not suppressed
    if (displayChunk) {
      this.currentCommand.promptBuffer += displayChunk;
    }

    // Removed 2s timeout to allow commands to run indefinitely until completion
    // Commands will now wait for actual completion or error, not timeout prematurely

    // Check if this is an interactive command
    const isInteractiveCommand = this.currentCommand.isInteractive || false;

    const sentinelTriggered = this.stripCommandSentinel();
    if (sentinelTriggered) {
      this.dbg('sentinel detected', {
        id: this.currentCommand?.sentinelId,
        exit: this.currentCommand?.exitCode
      });
    }
    if (this.currentCommand.promptBuffer.length > 4000) {
      this.currentCommand.promptBuffer = this.currentCommand.promptBuffer.slice(-4000);
    }

    // Check if this is a rerun command
    const fromRerun = this.currentCommand.fromRerun || false;

    // Runtime interactive detection: alt-screen, bracketed paste, hidden cursor, synchronized output
    if (!isInteractiveCommand) {
      const chunk = typeof data === 'string' ? data : '';
      const looksInteractive = /\x1b\[\?1049[h|l]|\x1b\[\?47[h|l]|\x1b\[\?2004h|\x1b\[\?2026h|\x1b\[\?25l|--\s*More\s*--|Press\s+(enter|return)\s+to\s+continue/i.test(chunk);
      if (looksInteractive) {
        // Mark as interactive but do NOT finalize immediately; keep streaming until prompt/exit
        this.dbg('interactive patterns detected; switching current command to interactive (streaming)');
        this.currentCommand.isInteractive = true;
        this.currentCommand.isInteractiveHeuristic = true;
      }
      if (!this.currentCommand.isInteractive) {
        const sanitizedChunk = (displayChunk || '').replace(/\r/g, '');
        const bufferTail = (this.currentCommand.promptBuffer || '').slice(-200);
        const promptPattern = /(?:password|passphrase|passcode|otp|pin|verification\s+code|username)\s*[:：]\s*$/i;
        const confirmPattern = /(?:\benter\s+(?:password|passphrase|pin|otp)\b|\bpress\s+(?:enter|return)\b|\b(?:yes\/no|y\/n)\b|\bcontinue\?\s*)$/i;
        if (promptPattern.test(sanitizedChunk) || promptPattern.test(bufferTail) ||
            confirmPattern.test(sanitizedChunk) || confirmPattern.test(bufferTail)) {
          this.dbg('prompt patterns detected; enabling interactive input');
          this.currentCommand.isInteractive = true;
          this.currentCommand.isInteractiveHeuristic = true;
        }
      }
    }

    if (!this.currentCommand.outputPre) {
      this.removeLoadingMessage(this.currentCommand.loadingEl);
    }
    // Coalesced, capped rendering: only schedule when we have a newline or enough data
    try {
      const chunkStr = typeof data === 'string' ? data : '';
      this._accBytesSincePaint += chunkStr.length;
      const hasNewline = /\n|\r/.test(chunkStr);
      const largeBurst = this._accBytesSincePaint >= (this._renderByteThreshold || 4096);
      if (hasNewline || largeBurst) {
        this._scheduleOutputRender(cellContext, fromRerun);
      }
    } catch (_) {
      // Fallback: always render if detection fails
      this._scheduleOutputRender(cellContext, fromRerun);
    }

    if (sentinelTriggered) {
      // Ensure the latest chunk is painted before finalizing
      try { this._renderCurrentCommandOutput(cellContext, fromRerun); } catch (_) {}
      this.finalizeCommandOutput();
      return;
    }

    // Track alt-screen/sync-output toggles to avoid false prompt detection
    try {
      if (!disableAltScreenSuppression) {
        const chunk = typeof data === 'string' ? data : '';
        if (!this.currentCommand.altScreenActive) this.currentCommand.altScreenActive = false;
        if (!this.currentCommand.syncOutputActive) this.currentCommand.syncOutputActive = false;
        if (/\x1b\[\?1049h|\x1b\[\?47h/.test(chunk)) this.currentCommand.altScreenActive = true;
        if (/\x1b\[\?1049l|\x1b\[\?47l/.test(chunk)) this.currentCommand.altScreenActive = false;
        if (/\x1b\[\?2026h/.test(chunk)) this.currentCommand.syncOutputActive = true;
        if (/\x1b\[\?2026l/.test(chunk)) this.currentCommand.syncOutputActive = false;
      } else {
        this.currentCommand.altScreenActive = false;
        this.currentCommand.syncOutputActive = false;
      }
    } catch (_) {}

    // For interactive commands, finalize after seeing substantial output AND detecting a prompt
    // and only when not in alt-screen/sync-output modes
    // This allows the user to interact with the remote shell
    // Check for both output length and prompt detection to ensure connection is established
    if (isInteractiveCommand) {
      // For SSH and similar commands, wait for both:
      // 1. Substantial output (connection messages)
      // 2. A prompt pattern (remote shell ready)
      const hasSubstantialOutput = this.currentCommand.output.length > 100;
      const hasPrompt = this.detectShellPrompt(this.currentCommand.promptBuffer);

      const inAlt = !!this.currentCommand.altScreenActive || !!this.currentCommand.syncOutputActive;
      if (hasSubstantialOutput && hasPrompt && !inAlt) {
        this.dbg('interactive command ready: output + prompt detected');
        if (this.pendingSshTarget) {
          this.activeSshTarget = this.pendingSshTarget;
          this.dbg('ssh active target set:', this.activeSshTarget);
          try {
            if (this.pathCompleter && typeof this.pathCompleter.setRemoteContext === 'function') {
              this.pathCompleter.setRemoteContext({ type: 'ssh', target: this.activeSshTarget });
            }
          } catch (_) {}
        }
        this.finalizeCommandOutput();
        return;
      }

      // Fallback: if we have a lot of output but no clear prompt, finalize anyway
      // 仅对“显式交互式命令”（如 ssh 等）启用，以避免对启发式判定的命令（如 codex resume）误判终止
      if (this.currentCommand.output.length > 500) {
        const explicit = !!this.currentCommand.isInteractiveExplicit;
        if (!inAlt && explicit) {
          this.dbg('interactive command: substantial output, finalizing');
          this.finalizeCommandOutput();
          return;
        }
      }
    }

    // For non-interactive commands, detect when the shell prompt returns
    if (!isInteractiveCommand && !this.currentCommand?.altScreenActive && !this.currentCommand?.syncOutputActive) {
      const isSecondary = this.detectSecondaryPrompt(this.currentCommand.promptBuffer);
      const isPrimary = !isSecondary && this.detectShellPrompt(this.currentCommand.promptBuffer);
      if (isSecondary && !this.currentCommand._sentCancelForSecondary) {
        // The shell is waiting for continuation (e.g., unmatched quotes). Abort to restore state.
        this.dbg('secondary prompt detected (unmatched quotes/continuation) — sending Ctrl+C');
        this.currentCommand._sentCancelForSecondary = true;
        try { sm.term.write({ ptyId: this.currentCommand.ptyId, data: '\x03' }); } catch (_) {}
      } else if (isPrimary) {
        this.dbg('prompt detected');
        try { this._renderCurrentCommandOutput(cellContext, fromRerun); } catch (_) {}
        this.finalizeCommandOutput();
      }
  }
  }

  handlePromptReady() {
    // Only finalize when we truly see a primary prompt for the current command.
    // Renderer may call this on heuristics (e.g. ESC[?2004l), which can arrive
    // before the actual command output. Guard with prompt detection and alt-screen state.
    if (!this.isCommandRunning || !this.currentCommand) return;
    if (this.currentCommand.altScreenActive || this.currentCommand.syncOutputActive) return;
    const buf = this.currentCommand.promptBuffer || '';
    const isSecondary = this.detectSecondaryPrompt(buf);
    const isPrimary = !isSecondary && this.detectShellPrompt(buf);
    if (isPrimary) {
      this.finalizeCommandOutput();
    } else if (this.debugEnabled) {
      this.dbg('handlePromptReady ignored: no primary prompt yet');
    }
  }

  finalizeCommandOutput() {
    if (!this.currentCommand) return;

    // Clear termination timer if it exists
    if (this.currentCommand.terminationTimer) {
      clearTimeout(this.currentCommand.terminationTimer);
      this.currentCommand.terminationTimer = null;
    }

    this.stripCommandSentinel();

    const { output, command, cellContext, exitCode, outputPre, _secondaryDetected } = this.currentCommand;
    this.dbg('finalize', { exitCode, outputBytes: output?.length || 0 });

    // Store reference to finalized command for trailing output
    this.lastFinalizedCommand = {
      output,
      command,
      outputPre,
      cellContext,
      finalizeTime: Date.now(),
      syntaxMode: cellContext?.syntaxMode || ''
    };

    let cleanOutput = this.cleanTerminalOutput(output, command);
    if (_secondaryDetected) {
      const note = '\n[terminated] Detected continuation prompt (likely unmatched quotes). Sent Ctrl+C to restore shell.\n';
      cleanOutput = cleanOutput ? (cleanOutput + note) : note;
    }
    if (cellContext?.outputPrompt) {
      cellContext.outputPrompt.textContent = `Out [${cellContext.outputPrompt.dataset.index}]:`;
    }
    const exitCodeKnown = Number.isInteger(exitCode);
    // Only trust real exit code; text heuristics cause false positives
    const isError = exitCodeKnown ? exitCode !== 0 : false;

    if (cellContext?.outputPrompt) {
      const idx = cellContext.outputPrompt.dataset.index;
      cellContext.outputPrompt.textContent = `Out [${idx}]:`;
    }

    if (this.currentCommand.outputPre) {
      const preEl = this.currentCommand.outputPre;
      let prevScrollTop = 0;
      if (cellContext?.collapsed) {
        prevScrollTop = preEl.scrollTop;
        const isAtBottom = Math.abs(preEl.scrollHeight - preEl.clientHeight - preEl.scrollTop) < 4;
        preEl.dataset.autoScroll = isAtBottom ? '1' : '0';
      }
      const syntaxMode = cellContext?.syntaxMode || '';
      preEl.dataset.syntaxMode = syntaxMode;
      this.updateOutputPreText(preEl, cleanOutput, { language: syntaxMode });
      if (cellContext?.collapsed) {
        if (cellContext.autoFollow || preEl.dataset.autoScroll === '1') {
          preEl.scrollTop = preEl.scrollHeight - preEl.clientHeight;
        } else {
          preEl.scrollTop = prevScrollTop;
        }
      }
      if (cellContext?.outputRow) {
        cellContext.outputRow.classList.toggle('has-error', isError);
      }
      if (cellContext) {
        this.updateControlButtonStates(cellContext);
      }
    } else {
      // Fallback: if no output element was created (no output received), create one now
      this.removeLoadingMessage(this.currentCommand.loadingEl);
      this.currentCommand.outputPre = this.renderCellOutput(cellContext, cleanOutput, { isError });
    }

    if (cellContext) {
      cellContext.exitCode = exitCodeKnown ? exitCode : null;
      if (cellContext.cellEl) {
        if (exitCodeKnown) {
          cellContext.cellEl.dataset.exitCode = String(exitCode);
        } else {
          delete cellContext.cellEl.dataset.exitCode;
        }
      }
    }

    this.setCommandRunning(false, cellContext);
    this.currentCommand = null;
    this.lastCommand = null;
    this.commandBusyWarningShown = false;
    this.saveMessageHistory();
    this.processCommandQueue();
  }

  // Detect whether the shell shows a primary prompt (ready) or a secondary/continuation prompt (e.g., unmatched quotes)
  // Returns true for primary prompt only; helper detectSecondaryPrompt() handles continuation prompts
  detectShellPrompt(buffer) {
    if (!buffer) return false;

    // Strip ANSI escape sequences and control characters except newlines
    const sanitized = buffer
      .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
      .replace(/\r/g, '')
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, (ch) => (ch === '\n' ? '\n' : ''));

    if (!sanitized) return false;

    const lines = sanitized.split('\n');
    let lastLineRaw = '';
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const candidate = lines[i];
      if (candidate && candidate.trim().length > 0) {
        lastLineRaw = candidate;
        break;
      }
    }
    if (!lastLineRaw) return false;

    // Remove trailing whitespace but keep internal spacing for prompt matching
    const lastLine = lastLineRaw.replace(/\s+$/, '');
    if (!lastLine) return false;

    // Common prompt shapes across shells (bash/zsh/fish/powershell)
    const promptPatterns = [
      /^(?:\[.*\]\s*)?(?:[A-Za-z0-9_.\-]+@)?[A-Za-z0-9_.\-:\/~\[\]{}()\\ ]*[#$%❯»>]$/,
      /^(?:PS )?[A-Za-z]:\\.*>$/,
      /^[A-Za-z0-9_.\-:\/~\[\]{}()\\ ]*λ$/,
      /^(?:╰─|└─|┴─|┘─).*[❯➜➤➟▶▸▹]$/
    ];

    if (promptPatterns.some((pattern) => pattern.test(lastLine))) {
      return true;
    }

    // Fallback detection for prompts ending with common indicator symbols
    const promptIndicators = /[#$%❯»➜➤➟▶▸▹⟫⟩λƒ›❮❯]$/; // exclude bare '>' to avoid matching PS2
    if (promptIndicators.test(lastLine)) {
      return true;
    }

    // Handle prompts that end with indicator followed by a space (e.g., "➜ ") but avoid bare "> "
    if (/[#$%❯»➜➤➟▶▸▹⟫⟩]\s*$/.test(lastLine)) {
      return true;
    }

    return false;
  }

  // Secondary/continuation prompt detection (bash/zsh typical PS2: "> ", "quote>", "dquote>", "heredoc>")
  detectSecondaryPrompt(buffer) {
    if (!buffer) return false;
    const sanitized = buffer
      .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '')
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
      .replace(/\r/g, '')
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, (ch) => (ch === '\n' ? '\n' : ''));
    if (!sanitized) return false;
    const lines = sanitized.split('\n');
    let last = '';
    for (let i = lines.length - 1; i >= 0; i--) {
      const s = lines[i];
      if (s && s.trim().length > 0) { last = s; break; }
    }
    if (!last) return false;
    const trimmed = last.trim();
    if (trimmed === '>') return true; // very common PS2
    if (/\b(?:quote|dquote|bquote|heredoc)>\s*$/.test(trimmed)) return true;
    return false;
  }

  setCommandRunning(isRunning, cellContext = null) {
    this.isCommandRunning = isRunning;
    if (this.input) {
      this.input.classList.toggle('command-input-busy', isRunning);
    }
    if (this.statusEl) {
      this.statusEl.textContent = isRunning ? 'Running…' : '';
    }

    if (ChatTerminal.activeInstance === this) {
      ChatTerminal.updateExecuteButtonState();
    }

    const ctx = cellContext || this.currentCommand?.cellContext;
    if (ctx) {
      if (ctx.commandPre) {
        if (isRunning) {
          this.disableCommandEditing(ctx, { preserveFocus: Boolean(ctx?.fromRerun) });
        } else {
          this.restoreCommandEditing(ctx);
        }
      }
      if (isRunning) {
        const ctxTimerStart = Number(ctx.timerStart);
        const resumeStart = Number.isFinite(this.currentCommand?.startTime)
          ? this.currentCommand.startTime
          : (Number.isFinite(ctxTimerStart) ? ctxTimerStart : Date.now());
        this.startCellTimer(ctx, resumeStart);
      } else {
        this.stopCellTimer(ctx);
      }
    }
    if (ctx?.outputPrompt) {
      const idx = ctx.outputPrompt.dataset.index;
      ctx.outputPrompt.textContent = isRunning ? 'Out [*]:' : `Out [${idx}]:`;
    }
    if (ctx?.controlPrompt) {
      const idx = ctx.controlPrompt.dataset.index;
      ctx.controlPrompt.textContent = isRunning ? 'Ctl [*]:' : (idx ? `Ctl [${idx}]:` : 'Ctl [ ]:');
    }
    let removedDueToPendingDeletion = false;
    if (ctx) {
      this.updateControlButtonStates(ctx);
      if (!isRunning && ctx.cellEl && this.pendingDeletionCells?.has(ctx.cellEl)) {
        this.removeCellElement(ctx.cellEl, { preserveScroll: true });
        removedDueToPendingDeletion = true;
      }
    }

    // Check if this command was a rerun from history
    const fromRerun = Boolean(ctx?.fromRerun);

    if (!isRunning) {
      const restoreEditor = fromRerun || Boolean(ctx?.resumeEditingAfterRun);
      if (restoreEditor && ctx?.cellEl) {
        this.selectCell(ctx.cellEl, { preventScroll: true });
        this.focusCommandEditor(ctx, { preventScroll: true, collapseToEnd: true });
      } else if (!fromRerun) {
        this.input?.focus();
      }
      if (ctx) ctx.resumeEditingAfterRun = false;
    }

    // For rerun commands, don't scroll at all - stay in current position
    // For new commands, scroll to bottom
    if (!ctx?.collapsed && !fromRerun && !removedDueToPendingDeletion) {
      this.scrollToBottom();
    }

    if (typeof this.onCommandRunningChange === 'function') {
      try {
        this.onCommandRunningChange({ isRunning, cellContext: ctx });
      } catch (err) {
        console.error('[chat-terminal] onCommandRunningChange error:', err);
      }
    }
  }

  setRestarting(isRestarting) {
    const next = Boolean(isRestarting);
    if (this.isRestarting === next) return;
    this.isRestarting = next;
    if (ChatTerminal.activeInstance === this) {
      ChatTerminal.updateExecuteButtonState();
    }
    if (this.isActive) {
      this.updateInputAffordances();
    }
  }

  sendInteractiveInput(rawInput) {
    if (!this.writer) {
      this.addErrorMessage('No active terminal connection');
      return;
    }

    // Hide suggestions if they are open
    const suggestionsEl = document.getElementById('commandSuggestions');
    if (suggestionsEl) {
      suggestionsEl.classList.add('hidden');
    }

    const trimmed = typeof rawInput === 'string' ? rawInput.trim() : '';
    if (trimmed) {
      this.recordCommandHistory(trimmed);
      this.updateCommandStats(trimmed);
    }

    const payload = rawInput.replace(/\r?\n/g, '\r');
    this.writer(payload + '\r');

    // Clear input box
    this.input.value = '';
    this.input.rows = 1;
    this.updateInputLineNumbers();
    this.commandBusyWarningShown = false;
    this.input.focus();
    this.scrollToBottom();
  }

  /**
   * Parse transfer command (/upload or /download)
   * @param {string} input - Command input
   * @returns {Object|null} - Transfer command object or null
   */
  parseTransferCommand(input) {
    const trimmed = input.trim();

    // Check for upload command: /upload <source> [target]
    if (trimmed.startsWith('/upload ')) {
      const args = trimmed.slice(8).trim().split(/\s+/);
      if (args.length === 0 || !args[0]) {
        return null;
      }
      return {
        type: 'upload',
        sourcePath: args[0],
        targetPath: args[1] || null
      };
    }

    // Check for download command: /download <source> [target]
    if (trimmed.startsWith('/download ')) {
      const args = trimmed.slice(10).trim().split(/\s+/);
      if (args.length === 0 || !args[0]) {
        return null;
      }
      return {
        type: 'download',
        sourcePath: args[0],
        targetPath: args[1] || null
      };
    }

    return null;
  }

  parseViewCommand(input) {
    if (typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed.toLowerCase().startsWith('/view')) return null;
    const rawArgument = trimmed.slice(5).trim();
    return {
      rawArgument,
      path: this.normalizeViewPathArgument(rawArgument)
    };
  }

  normalizeViewPathArgument(arg) {
    if (typeof arg !== 'string') return '';
    const trimmed = arg.trim();
    if (!trimmed) return '';
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      const inner = trimmed.slice(1, -1);
      return inner.replace(/\\(["'\\])/g, '$1').trim();
    }
    return trimmed;
  }

  detectViewKind(filePath) {
    if (!filePath || typeof filePath !== 'string') return null;
    const lower = filePath.toLowerCase();
    if (/(\.md|\.mdown|\.markdown|\.mkd|\.mdtxt|\.mdtext)$/i.test(lower)) {
      return 'markdown';
    }
    if (/(\.png|\.jpe?g|\.gif|\.bmp|\.webp|\.svg)$/i.test(lower)) {
      return 'image';
    }
    return null;
  }

  /**
   * Detect command mode based on input
   * @param {string} commandText - Command text
   * @returns {string} - Mode: 'command', 'markdown', 'upload', 'download'
   */
  detectCommandMode(commandText) {
    const trimmed = commandText.trim();

    if (trimmed.startsWith('/upload ')) return 'upload';
    if (trimmed.startsWith('/download ')) return 'download';
    if (trimmed.startsWith('/view ')) return 'view';
    if (trimmed.startsWith('#') || trimmed.includes('```')) return 'markdown';

    return 'command';
  }

  /**
   * Handle transfer command execution
   * @param {Object} transferCmd - Transfer command object
   */
  async handleTransferCommand(transferCmd) {
    const { type, sourcePath, targetPath } = transferCmd;

    // Add to history
    const originalCommand = type === 'upload'
      ? `/upload ${sourcePath}${targetPath ? ' ' + targetPath : ''}`
      : `/download ${sourcePath}${targetPath ? ' ' + targetPath : ''}`;

    this.recordCommandHistory(originalCommand);

    // Create cell context with transfer mode
    // For transfers, also avoid forcing edit mode on the created cell.
    const cellContext = this.addUserMessage(originalCommand, { startEditing: false, selectCell: false });

    // Mark the cell with transfer mode
    if (cellContext && cellContext.cellEl) {
      cellContext.cellEl.classList.add(`mode-${type}`);
      cellContext.transferMode = type;
    }

    // Clear input
    this.input.value = '';
    this.input.rows = 1;
    this.updateInputLineNumbers();
    this.input.focus();

    // Hide command suggestions
    const suggestionsEl = document.getElementById('commandSuggestions');
    if (suggestionsEl) {
      suggestionsEl.classList.add('hidden');
    }

    // Execute transfer
    try {
      if (type === 'upload') {
        await this.executeUploadCommand(sourcePath, targetPath, cellContext);
      } else if (type === 'download') {
        await this.executeDownloadCommand(sourcePath, targetPath, cellContext);
      }
    } catch (err) {
      console.error(`[transfer] ${type} failed:`, err);
      this.renderCellOutput(cellContext, `Error: ${err.message}`, { isError: true });
    }
  }

  async handleViewCommand(rawCommand, viewInfo, existingContext = null) {
    const resolvedPathInput = viewInfo?.path;
    if (!resolvedPathInput) {
      this.addSystemMessage(i18n.t('command.view.missingPath', '请提供要预览的文件路径'), '⚠️');
      return;
    }

    const viewKind = this.detectViewKind(resolvedPathInput);
    if (!viewKind) {
      this.addSystemMessage(i18n.t('command.view.unsupported', '暂不支持预览该类型文件'), '⚠️');
      return;
    }

    if (!window?.sm?.fs?.readFile) {
      this.addSystemMessage(i18n.t('command.view.notAvailable', '当前版本暂不支持 /view 功能'), '⚠️');
      return;
    }

    const tabState = typeof this.getTabState === 'function' ? this.getTabState() : null;
    const backendMode = (tabState && (tabState.backendMode || tabState.mode)) || 'pty';
    const isRemote = typeof backendMode === 'string' && backendMode.includes('ssh');
    if (isRemote) {
      let tempContext = existingContext;
      if (!tempContext) {
        tempContext = this.addUserMessage(rawCommand, { startEditing: false, selectCell: false });
      }
      if (tempContext) {
        tempContext.cellEl?.classList.add('mode-view');
        const execIndex = this.cellCounter++;
        this.applyExecutionIndex(tempContext, execIndex);
        this.renderViewError(tempContext, {
          code: 'REMOTE_UNSUPPORTED',
          message: i18n.t('command.view.remoteUnsupported', '远程会话暂不支持 /view 预览'),
          meta: { path: resolvedPathInput }
        }, resolvedPathInput);
        this.updateControlButtonStates(tempContext);
      } else {
        this.addSystemMessage(i18n.t('command.view.remoteUnsupported', '远程会话暂不支持 /view 预览'), '⚠️');
      }
      return;
    }

    const isRerun = Boolean(existingContext);
    if (!isRerun) {
      this.recordCommandHistory(rawCommand);
      this.updateCommandStats(rawCommand);
    }

    let cellContext = existingContext;
    if (!cellContext) {
      cellContext = this.addUserMessage(rawCommand, { startEditing: false, selectCell: false });
    }
    if (!cellContext) return;

    if (cellContext.cellEl) {
      cellContext.cellEl.classList.remove('mode-command', 'mode-upload', 'mode-download');
      cellContext.cellEl.classList.add('mode-view');
    }
    cellContext.viewMeta = { path: resolvedPathInput, kind: viewKind };

    const executionIndex = this.cellCounter++;
    this.applyExecutionIndex(cellContext, executionIndex);

    const loadingEl = this.addLoadingMessage(cellContext);
    if (loadingEl && typeof loadingEl.querySelector === 'function') {
      const textNode = loadingEl.querySelector('span');
      if (textNode) {
        textNode.textContent = i18n.t('command.view.loading', '正在加载预览…');
      }
    }

    try {
      const cwd = tabState?.cwd || this.pathCompleter?.currentDir || '';
      const maxBytes = viewKind === 'image'
        ? ChatTerminal.VIEW_MAX_IMAGE_BYTES
        : ChatTerminal.VIEW_MAX_TEXT_BYTES;

      const readRes = await window.sm.fs.readFile({
        path: resolvedPathInput,
        cwd,
        maxBytes,
        encoding: viewKind === 'image' ? null : 'utf8'
      });

      if (!readRes?.ok) {
        const err = new Error(readRes?.error || 'READ_FAILED');
        err.code = readRes?.error;
        err.meta = readRes?.data || null;
        throw err;
      }

      const data = readRes.data || {};
      this.renderViewPreview(cellContext, {
        requestedPath: resolvedPathInput,
        resolvedPath: data.path || resolvedPathInput,
        content: data.content || '',
        size: data.size ?? null,
        mtime: data.mtime ?? null,
        kind: viewKind,
        mime: data.mime || null,
        encoding: data.encoding || (viewKind === 'image' ? 'base64' : 'utf8')
      });
    } catch (err) {
      this.renderViewError(cellContext, err, resolvedPathInput);
    } finally {
      if (loadingEl) this.removeLoadingMessage(loadingEl);
      if (isRerun) {
        this.restoreCommandEditing(cellContext);
        this.focusCommandEditor(cellContext, { preventScroll: true, collapseToEnd: true });
        this.clearComposerSelection();
      }
      this.updateControlButtonStates(cellContext);
      if (cellContext) cellContext.resumeEditingAfterRun = false;
      this.markDirty();
    }
  }

  renderViewPreview(cellContext, payload) {
    if (!cellContext?.outputRow || !cellContext.outputBody) return;
    const {
      requestedPath,
      resolvedPath,
      content,
      size,
      kind,
      mime
    } = payload || {};

    const displayName = this.getFileNameFromPath(resolvedPath || requestedPath) ||
      requestedPath || resolvedPath || '(file)';
    const sizeLabel = typeof size === 'number' && size >= 0
      ? this.formatFileSize(size)
      : '';
    const kindLabel = kind === 'image'
      ? i18n.t('command.view.kind.image', '图像')
      : i18n.t('command.view.kind.markdown', 'Markdown');
    const metaParts = [];
    if (kindLabel) metaParts.push(kindLabel);
    if (sizeLabel) metaParts.push(sizeLabel);
    if (mime && kind === 'image') metaParts.push(mime);

    const metaHtml = metaParts.length
      ? `<span class="view-preview-meta">${this.escapeHtml(metaParts.join(' • '))}</span>`
      : '';

    let bodyInner = '';
    if (kind === 'image') {
      bodyInner = `<img src="${content}" alt="${this.escapeHtml(displayName)}" loading="lazy" />`;
    } else {
      const markdown = typeof content === 'string' ? content.replace(/\r\n/g, '\n') : '';
      bodyInner = `<div class="view-preview-markdown">${this.markdownRenderer.renderMarkdown(markdown)}</div>`;
    }

    cellContext.outputRow.classList.remove('hidden');
    const resolvedDisplay = resolvedPath && resolvedPath !== displayName
      ? `<div class="view-preview-meta">${this.escapeHtml(resolvedPath)}</div>`
      : '';

    if (cellContext.outputBody) {
      cellContext.outputBody.innerHTML = `
        <div class="view-preview">
          <div class="view-preview-header">
            <span class="view-preview-filename">${this.escapeHtml(displayName)}</span>
            ${metaHtml}
          </div>
          ${resolvedDisplay}
          <div class="view-preview-body">${bodyInner}</div>
        </div>
      `;
    }
    if (cellContext.outputTimer) {
      cellContext.outputTimer.classList.add('hidden');
      cellContext.outputTimer.textContent = '00:00:00';
    }
    this.scrollToBottom();
  }

  renderViewError(cellContext, error, requestedPath) {
    if (!cellContext?.outputRow || !cellContext.outputBody) return;
    const code = error?.code || '';
    const meta = error?.meta || {};
    const resolvedPath = meta.path || requestedPath || '';
    let message = error?.message || meta.message || String(error || '');
    if (code === 'FILE_TOO_LARGE') {
      const limit = typeof meta.limit === 'number' ? this.formatFileSize(meta.limit) : '';
      const actual = typeof meta.size === 'number' ? this.formatFileSize(meta.size) : '';
      message = i18n.t('command.view.tooLarge', '文件过大，无法预览（限制 {{limit}}，实际 {{size}}）', {
        limit,
        size: actual
      });
    } else if (code === 'ENOENT') {
      message = i18n.t('command.view.notFound', '未找到文件：{{path}}', { path: requestedPath || '' });
    } else if (message === 'READ_FAILED') {
      message = i18n.t('command.view.readFailed', '读取文件失败');
    }

    cellContext.outputRow.classList.remove('hidden');
    const displayName = this.getFileNameFromPath(resolvedPath) || resolvedPath || '(file)';
    const pathLine = resolvedPath
      ? `<div class="view-preview-meta">${this.escapeHtml(resolvedPath)}</div>`
      : '';
    cellContext.outputBody.innerHTML = `
      <div class="view-preview">
        <div class="view-preview-header">
          <span class="view-preview-filename">${this.escapeHtml(displayName)}</span>
        </div>
        ${pathLine}
        <div class="view-preview-error">${this.escapeHtml(message)}</div>
      </div>
    `;
    if (cellContext.outputTimer) {
      cellContext.outputTimer.classList.add('hidden');
      cellContext.outputTimer.textContent = '00:00:00';
    }
  }

  /**
   * Execute upload command
   * @param {string} sourcePath - Local source path
   * @param {string} targetPath - Remote target path (optional)
   * @param {Object} cellContext - Cell context
   */
  async executeUploadCommand(sourcePath, targetPath, cellContext) {
    const executionIndex = this.cellCounter++;
    this.applyExecutionIndex(cellContext, executionIndex);

    // Show loading message
    const loadingEl = this.addLoadingMessage(cellContext);
    // Mark cell busy to align with normal command lifecycle
    this.setCommandRunning(true, cellContext);

    try {
      // Get tab state to determine if we're connected to SSH
      const tabState = typeof this.getTabState === 'function' ? this.getTabState() : null;
      const mode = tabState?.mode || 'pty';
      const cwd = tabState?.cwd || '~';

      // Determine if we have an SSH context (explicit SSH tab or active interactive SSH)
      const sshTarget = (mode === 'ssh')
        ? (tabState?.sshTarget || this.activeSshTarget || null)
        : (this.activeSshTarget || null);

      // Determine effective target path
      let effectiveTarget = targetPath;
      if (!effectiveTarget) {
        // If this is a remote upload, default to '.' (remote home)
        // Otherwise use local cwd
        effectiveTarget = sshTarget ? '.' : cwd;
      }
      if (sshTarget) {
        // Local -> Remote via scp (best-effort until SFTP pipeline is wired)
        this.renderCellOutput(cellContext, 'Uploading to remote server...', { isError: false });
        try {
          const platform = await this.getPlatformSafe();
          const q = (p) => {
            const s = String(p);
            if (platform === 'win32') return `'${s.replace(/'/g, "''")}'`;
            return `'${s.replace(/'/g, "'\\''")}'`;
          };
          const { user, host, port } = sshTarget;
          const remoteSpec = `${user ? user + '@' : ''}${host}:${effectiveTarget || '.'}`;
          const pOpt = port ? `-P ${port}` : '';
          const scpCmd = `scp -q ${pOpt} ${q(sourcePath)} ${q(remoteSpec)}`.replace(/\s+/g, ' ').trim();
          const commandId = `scp_${Date.now()}`;
          const execRes = await window.sm.cmd.execute({ commandId, command: scpCmd, cwd: undefined });
          if (!execRes?.ok) throw new Error(execRes?.error || 'EXEC_FAILED');
          await new Promise((resolve, reject) => {
            const onExit = (m) => {
              if (m?.commandId !== commandId) return;
              window.sm.cmd.onExit(() => {});
              if (m.code === 0) resolve(0); else reject(new Error('SCP_FAILED'));
            };
            window.sm.cmd.onExit(onExit);
          });
          this.renderCellOutput(cellContext, `✓ File uploaded successfully\nSource: ${sourcePath}\nTarget: ${remoteSpec}`, { isError: false });
        } catch (e) {
          this.renderCellOutput(cellContext, `✗ Upload failed: ${e?.message || e}\nSource: ${sourcePath}\nTarget: ${effectiveTarget}`, { isError: true });
        }
      } else {
        // Local upload: local -> local (copy)
        this.renderCellOutput(cellContext, 'Copying file locally...', { isError: false });

        let usedFallback = false;
        try {
          // Preferred fast path via IPC
          const result = await window.sm.fs.copy({ sourcePath, targetPath: effectiveTarget });
          if (result?.ok) {
            this.renderCellOutput(cellContext, `✓ File copied successfully\nSource: ${sourcePath}\nTarget: ${result.data.targetPath}`, { isError: false });
            return;
          }
          // If failed without handler, fall through to shell fallback
          if (result?.error && String(result.error).includes("No handler registered for 'fs.copy'")) {
            usedFallback = true;
          } else {
            throw new Error(result?.error || 'COPY_FAILED');
          }
        } catch (err) {
          const msg = String(err?.message || err || '');
          if (msg.includes("No handler registered for 'fs.copy'")) {
            usedFallback = true;
          } else if (!msg) {
            usedFallback = true;
          } else {
            // Non-handler errors: still try fallback as best-effort
            usedFallback = true;
          }
        }

        if (usedFallback) {
          // Fallback: copy via shell command for compatibility
          try {
            const platform = await this.getPlatformSafe();
            const q = (p) => {
              const s = String(p);
              if (platform === 'win32') return `'${s.replace(/'/g, "''")}'`;
              return `'${s.replace(/'/g, "'\\''")}'`;
            };
            let cmd;
            if (platform === 'win32') {
              // Use PowerShell for robust path handling
              cmd = `powershell -NoProfile -NonInteractive -Command "Copy-Item -LiteralPath ${q(sourcePath)} -Destination ${q(effectiveTarget)} -Force"`;
            } else {
              // macOS/Linux
              cmd = `cp -f ${q(sourcePath)} ${q(effectiveTarget)}`;
            }
            const commandId = `copy_${Date.now()}`;
            const execRes = await window.sm.cmd.execute({ commandId, command: cmd, cwd: undefined });
            if (!execRes?.ok) throw new Error(execRes?.error || 'EXEC_FAILED');
            // Wait for exit event
            await new Promise((resolve, reject) => {
              const onExit = (m) => {
                if (m?.commandId !== commandId) return;
                window.sm.cmd.onExit(() => {}); // no-op detach; handler cleanup managed globally
                if (m.code === 0) resolve(0); else reject(new Error('SHELL_COPY_FAILED'));
              };
              window.sm.cmd.onExit(onExit);
            });
            this.renderCellOutput(cellContext, `✓ File copied successfully\nSource: ${sourcePath}\nTarget: ${effectiveTarget}`, { isError: false });
          } catch (fallbackErr) {
            this.renderCellOutput(cellContext, `✗ Copy failed: ${fallbackErr?.message || fallbackErr}\nSource: ${sourcePath}\nTarget: ${effectiveTarget}`, { isError: true });
          }
        }
      }
    } catch (err) {
      this.renderCellOutput(cellContext, `Upload failed: ${err.message}`, { isError: true });
    } finally {
      this.removeLoadingMessage(loadingEl);
      // Ensure UI state is reset so subsequent commands can run normally
      this.setCommandRunning(false, cellContext);
    }
  }

  /**
   * Execute download command
   * @param {string} sourcePath - Remote source path
   * @param {string} targetPath - Local target path (optional)
   * @param {Object} cellContext - Cell context
   */
  async executeDownloadCommand(sourcePath, targetPath, cellContext) {
    const executionIndex = this.cellCounter++;
    this.applyExecutionIndex(cellContext, executionIndex);

    // Show loading message
    const loadingEl = this.addLoadingMessage(cellContext);
    this.setCommandRunning(true, cellContext);

    try {
      // Get tab state to determine if we're connected to SSH
      const tabState = typeof this.getTabState === 'function' ? this.getTabState() : null;
      const mode = tabState?.mode || 'pty';
      const cwd = tabState?.cwd || '~';

      // Determine effective target path
      let effectiveTarget = targetPath;
      if (!effectiveTarget) {
        // If no target specified, default to system Downloads directory
        try {
          const s = await window.sm.settings.get();
          const dl = s?.ok && s.data?.downloadsDir ? s.data.downloadsDir : null;
          effectiveTarget = dl || cwd; // fallback to cwd if not available
        } catch (_) {
          effectiveTarget = cwd;
        }
      }

      const sshTarget = (mode === 'ssh') ? (tabState?.sshTarget || this.activeSshTarget || null) : (this.activeSshTarget || null);
      if (sshTarget) {
        // Remote -> local via scp (best-effort until SFTP pipeline is wired)
        this.renderCellOutput(cellContext, 'Downloading from remote server...', { isError: false });
        try {
          const platform = await this.getPlatformSafe();
          const q = (p) => {
            const s = String(p);
            if (platform === 'win32') return `'${s.replace(/'/g, "''")}'`;
            return `'${s.replace(/'/g, "'\\''")}'`;
          };
          const { user, host, port } = sshTarget;
          const remoteSpec = `${user ? user + '@' : ''}${host}:${sourcePath}`;
          const pOpt = port ? `-P ${port}` : '';
          const scpCmd = `scp -q ${pOpt} ${q(remoteSpec)} ${q(effectiveTarget)}`.replace(/\s+/g, ' ').trim();
          const commandId = `scp_${Date.now()}`;
          const execRes = await window.sm.cmd.execute({ commandId, command: scpCmd, cwd: undefined });
          if (!execRes?.ok) throw new Error(execRes?.error || 'EXEC_FAILED');
          await new Promise((resolve, reject) => {
            const onExit = (m) => {
              if (m?.commandId !== commandId) return;
              window.sm.cmd.onExit(() => {});
              if (m.code === 0) resolve(0); else reject(new Error('SCP_FAILED'));
            };
            window.sm.cmd.onExit(onExit);
          });
          this.renderCellOutput(cellContext, `✓ File copied successfully\nSource: ${sourcePath}\nTarget: ${effectiveTarget}`, { isError: false });
        } catch (e) {
          this.renderCellOutput(cellContext, `✗ Download failed: ${e?.message || e}\nSource: ${sourcePath}\nTarget: ${effectiveTarget}`, { isError: true });
        }
      } else {
        // Local download: local -> local (copy)
        this.renderCellOutput(cellContext, 'Copying file locally...', { isError: false });

        let usedFallback = false;
        try {
          const result = await window.sm.fs.copy({ sourcePath, targetPath: effectiveTarget });
          if (result?.ok) {
            this.renderCellOutput(cellContext, `✓ File copied successfully\nSource: ${sourcePath}\nTarget: ${result.data.targetPath}`, { isError: false });
            return;
          }
          if (result?.error && String(result.error).includes("No handler registered for 'fs.copy'")) {
            usedFallback = true;
          } else {
            throw new Error(result?.error || 'COPY_FAILED');
          }
        } catch (err) {
          const msg = String(err?.message || err || '');
          if (msg.includes("No handler registered for 'fs.copy'")) {
            usedFallback = true;
          } else {
            usedFallback = true; // best-effort
          }
        }

        if (usedFallback) {
          try {
            const platform = await this.getPlatformSafe();
            const q = (p) => {
              const s = String(p);
              if (platform === 'win32') return `'${s.replace(/'/g, "''")}'`;
              return `'${s.replace(/'/g, "'\\''")}'`;
            };
            let cmd;
            if (platform === 'win32') {
              cmd = `powershell -NoProfile -NonInteractive -Command "Copy-Item -LiteralPath ${q(sourcePath)} -Destination ${q(effectiveTarget)} -Force"`;
            } else {
              cmd = `cp -f ${q(sourcePath)} ${q(effectiveTarget)}`;
            }
            const commandId = `copy_${Date.now()}`;
            const execRes = await window.sm.cmd.execute({ commandId, command: cmd, cwd: undefined });
            if (!execRes?.ok) throw new Error(execRes?.error || 'EXEC_FAILED');
            await new Promise((resolve, reject) => {
              const onExit = (m) => {
                if (m?.commandId !== commandId) return;
                window.sm.cmd.onExit(() => {});
                if (m.code === 0) resolve(0); else reject(new Error('SHELL_COPY_FAILED'));
              };
              window.sm.cmd.onExit(onExit);
            });
            this.renderCellOutput(cellContext, `✓ File copied successfully\nSource: ${sourcePath}\nTarget: ${effectiveTarget}`, { isError: false });
    } catch (fallbackErr) {
      this.renderCellOutput(cellContext, `✗ Copy failed: ${fallbackErr?.message || fallbackErr}\nSource: ${sourcePath}\nTarget: ${effectiveTarget}`, { isError: true });
    }
      }
    }
  } catch (err) {
    this.renderCellOutput(cellContext, `Download failed: ${err.message}`, { isError: true });
  } finally {
    this.removeLoadingMessage(loadingEl);
    this.setCommandRunning(false, cellContext);
  }
  }

  cleanTerminalOutput(output, command) {
    let clean = output;

    if (this.debugEnabled) {
      this.dbg('cleanTerminalOutput start', {
        len: typeof clean === 'string' ? clean.length : 0,
        preview: this.formatDebugPreview(clean),
        command: this.formatDebugPreview(command, 80)
      });
    }

    // Normalize newlines early so line-based regex with /m works with CR-only outputs
    if (clean && typeof clean === 'string') {
      clean = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    // Apply "editing" control characters before stripping them, so we don't lose intent.
    // Most notably, handle backspace (\b, 0x08) and DEL (0x7f) which some shells emit
    // as the line editor corrects input. Without this, sequences like "d\bdocker ps"
    // turn into "ddocker ps" after we strip control chars.
    const applyBackspaces = (s) => {
      if (!s || typeof s !== 'string') return s;
      let out = '';
      for (let i = 0; i < s.length; i++) {
        const ch = s.charCodeAt(i);
        if (ch === 0x08 /* \b */ || ch === 0x7f /* DEL */) {
          // Remove the last code unit if present
          if (out.length) out = out.slice(0, -1);
        } else {
          out += s[i];
        }
      }
      return out;
    };

    clean = applyBackspaces(clean);

    // Step 1: Remove OSC (Operating System Command) sequences first
    // These include window title updates like: ESC ]0;title BEL
    clean = clean.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '');

    // Step 2: Remove the command echo line
    const escapedCmd = this.escapeRegExp(command);
    // Avoid passing empty flags string to RegExp (Safari/WebKit can throw "missing /")
    clean = clean.replace(new RegExp(`^${escapedCmd}\\s*\\n`), '');
    // Remove prompt-prefixed command echoes (e.g., "user@host:~# cmd")
    clean = clean.replace(new RegExp(`^[^\\n]*[#$%>❯»]\\s*${escapedCmd}(?:\\s.*)?\\n?`, 'gm'), '');

    // Step 3: Remove ALL ANSI escape sequences (colors, cursor movements, etc.)
    // This must be done BEFORE trying to match prompts
    const ansiEscapePattern = /(?:\u001b\[|\u009b)[0-?]*[ -\/]*[@-~]|\u001b[ -\/]*[\d@-~<>=?]/g;
    clean = clean.replace(ansiEscapePattern, '');
    // Remove OSC/DCS style sequences that use ST terminators (e.g. ESC P ... ESC \)
    clean = clean.replace(/\u001b[PX^_][\s\S]*?\u001b\\/g, '');

    // Step 4: Remove control characters (we already applied backspaces above)
    clean = clean.replace(/([\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f])+/g, '');
    clean = clean.replace(/\x00/g, '');
    clean = clean.replace(/\x07/g, '');

    // Step 5: Remove shell prompts (now without ANSI codes)
    // Match patterns like: user@host:path# or user@host:path$
    // After ANSI removal, prompts look like: root@OPS-4722:/opt#
    clean = clean.replace(/^[^\n]*[@:].*?[#$%>❯»]\s*$/gm, '');
    clean = clean.replace(/[^\n]*[@:].*?[#$%>❯»]\s*$/, '');

    // Step 6: Remove any remaining prompt-like patterns
    clean = clean.replace(/^.*[#$%>❯»]\s*$/gm, '');
    clean = clean.replace(/.*[#$%>❯»]\s*$/, '');

    // Remove prompt-prefixed command echoes emitted after redraws
    const promptCommandPattern = new RegExp(
      `^(?:[^\n]*[#$%>❯»]\s*)?${escapedCmd}(?:\s.*)?$`,
      'gm'
    );
    clean = clean.replace(promptCommandPattern, '');

    // Step 7: Clean up whitespace
    clean = clean.replace(/\n{3,}/g, '\n\n');
    clean = clean.trim();

    // Step 7.5: Collapse consecutive duplicate lines caused by terminal redraws
    if (clean) {
      const lines = clean.split('\n');
      const deduped = [];
      for (const line of lines) {
        if (deduped.length === 0 || deduped[deduped.length - 1] !== line) {
          deduped.push(line);
        }
      }
      clean = deduped.join('\n');
    }

    // Step 8: If everything was removed but we had output, show placeholder
    if (!clean && output && output.length > 0) {
      return '';  // Return empty string for commands with no visible output (like cd)
    }

    if (this.debugEnabled) {
      this.dbg('cleanTerminalOutput end', {
        len: typeof clean === 'string' ? clean.length : 0,
        preview: this.formatDebugPreview(clean)
      });
    }

    return clean || '';
  }

  // Helper function to escape special regex characters
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  formatDebugPreview(value, limit = 160) {
    if (value === undefined) return '(undefined)';
    if (value === null) return '(null)';
    const str = typeof value === 'string' ? value : String(value);
    const truncated = str.length > limit ? str.slice(0, limit) + '...' : str;
    return truncated
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');
  }

  addOutputMessage(output, isError = false) {
    this.renderCellOutput(null, output, { isError });
    this.markDirty();
  }

  addErrorMessage(message) {
    const messageEl = document.createElement('div');
    messageEl.className = 'output-message error';

    messageEl.innerHTML = `
      <div class="message-content">
        <div style="margin-bottom: 4px; color: var(--color-error); font-weight: 500;">❌ Error</div>
        <pre>${this.escapeHtml(message)}</pre>
      </div>
    `;

    this.messages.appendChild(messageEl);
    this.scrollToBottom();
    this.markDirty();
  }

  addSystemMessage(text, icon = 'ℹ️') {
    const messageEl = document.createElement('div');
    messageEl.className = 'system-message';

    messageEl.innerHTML = `
      <div class="message-icon">${icon}</div>
      <div class="message-content">
        <div class="message-text">${this.escapeHtml(text)}</div>
      </div>
    `;

    this.messages.appendChild(messageEl);
    this.scrollToBottom();
    this.markDirty();
  }

  clearHistory() {
    // Keep welcome message, clear everything else
    const welcome = this.messages.querySelector('.system-message');
    this.messages.innerHTML = '';
    if (welcome) {
      this.messages.appendChild(welcome);
    }
    this.resetCellCounters();
    this.savedInputMode = this.inputMode;
    this.commandQueue = [];
    this.currentCommand = null;
    this.clearCellSelection();
    this.updateInputAffordances();
    this.scrollToBottom();
  }

  scrollToBottom() {
    if (!this.container) return;

    // Check if we're in a rerun operation - if so, don't scroll
    // Check both currentCommand and selectedCell's context
    const fromRerunCommand = this.currentCommand?.fromRerun || false;
    const fromRerunCell = this.selectedCell?.__smrtContext?.fromRerun || false;
    const fromRerun = fromRerunCommand || fromRerunCell;

    this.dbg('scrollToBottom called', {
      fromRerun,
      fromRerunCommand,
      fromRerunCell,
      hasCurrentCommand: !!this.currentCommand,
      hasSelectedCell: !!this.selectedCell
    });

    if (fromRerun) {
      this.dbg('scrollToBottom blocked for rerun');
      return;
    }

    const performScroll = () => {
      try {
        this.dbg('scrollToBottom executing scroll');
        this.container.scrollTop = this.container.scrollHeight;
        const lastMessage = this.messages?.lastElementChild;
        if (lastMessage && typeof lastMessage.scrollIntoView === 'function') {
          lastMessage.scrollIntoView({ block: 'end', inline: 'nearest' });
        }
        const inputWrapper = this.input?.closest('.command-input-wrapper');
        if (inputWrapper && typeof inputWrapper.scrollIntoView === 'function') {
          inputWrapper.scrollIntoView({ block: 'end', inline: 'nearest' });
        }
      } catch (err) {
        console.warn('[ChatTerminal] Failed to scroll:', err);
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(performScroll);
    } else {
      performScroll();
    }
  }

  setWriter(writer) {
    this.writer = writer;
  }

  // Save current messages to history
  saveMessageHistory() {
    // Clone all message elements and store them
    this.messageHistory = [];
    const messages = this.messages.children;
    for (let i = 0; i < messages.length; i++) {
      this.messageHistory.push(messages[i].outerHTML);
    }
    this.savedCellCounter = this.cellCounter;
    this.savedInputMode = this.inputMode;
  }

  // Restore messages from history
  restoreMessageHistory() {
    // Clear current messages
    this.messages.innerHTML = '';
    
    // Restore saved messages
    for (let i = 0; i < this.messageHistory.length; i++) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = this.messageHistory[i];
      this.messages.appendChild(tempDiv.firstChild);
    }
    
    this.rehydrateCells();
    this.cellCounter = this.savedCellCounter || 1;
    this.setInputMode(this.savedInputMode || 'code', { silent: true });
    this.updateInputAffordances();
    this.rebindLiveReferences();
    this.scrollToBottom();
  }

  rebindLiveReferences() {
    const resolveCellById = (cellId) => {
      if (!cellId || !this.messages) return null;
      return this.messages.querySelector(`.notebook-cell[data-cell-id="${cellId}"]`);
    };

    if (this.selectedCell) {
      const selectedId = this.selectedCell.dataset?.cellId;
      const mapped = resolveCellById(selectedId);
      this.selectedCell = mapped || null;
      if (this.selectedCell) {
        this.selectedCell.classList.add('selected');
      }
    }

    if (this.pendingDeletionCells && this.pendingDeletionCells.size > 0) {
      const nextPending = new Set();
      this.pendingDeletionCells.forEach((cell) => {
        if (!cell) return;
        const cellId = cell.dataset?.cellId;
        const mapped = resolveCellById(cellId);
        if (mapped) nextPending.add(mapped);
      });
      this.pendingDeletionCells = nextPending;
    }

    if (this.currentCommand?.cellContext) {
      const originalContext = this.currentCommand.cellContext;
      const cellId = originalContext.cellId ||
        originalContext.cellEl?.dataset?.cellId ||
        null;
      let cellEl = resolveCellById(cellId);
      if (!cellEl && originalContext?.cellEl) {
        try {
          this.messages.appendChild(originalContext.cellEl);
          this.rehydrateCells();
        } catch (err) {
          console.warn('[ChatTerminal] Failed to reattach running cell:', err);
        }
        cellEl = resolveCellById(cellId);
      }

      const newContext = cellEl?.__smrtContext || null;
      if (!cellEl || !newContext) {
        // Fall back to original context to avoid losing command progress
        if (originalContext?.cellEl && originalContext.cellEl.parentNode !== this.messages) {
          this.messages.appendChild(originalContext.cellEl);
        }
        this.currentCommand.cellContext = originalContext;
        if (this.isCommandRunning) {
          this.setCommandRunning(true, originalContext);
        }
        return;
      }

      this.currentCommand.cellContext = newContext;
      const outputPre = newContext.outputBody?.querySelector('.cell-output-text') ||
        newContext.outputContent?.querySelector('.cell-output-text') ||
        null;
      this.currentCommand.outputPre = outputPre;
      const loadingEl = newContext.outputBody?.querySelector('.cell-output-loading') || null;
      this.currentCommand.loadingEl = loadingEl;
      if (this.isCommandRunning) {
        this.setCommandRunning(true, newContext);
      }
    }
  }

  // Clear all messages
  clearMessages() {
    this.messages.innerHTML = '';
    this.messageHistory = [];
    this.resetCellCounters();
    this.savedInputMode = this.inputMode;
    this.commandQueue = [];
    this.currentCommand = null;
    this.clearCellSelection();
    this.historyDraft = '';
    this.historyIndex = Array.isArray(this.history) ? this.history.length : 0;
    this.updateInputAffordances();
  }

  resetCellCounters() {
    this.cellCounter = 1;
    this.savedCellCounter = 1;
    this.cellIdCounter = 1;
    this.cellManager.cellCounter = 1;
    this.cellManager.savedCellCounter = 1;
    this.cellManager.cellIdCounter = 1;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  focus() {
    this.input.focus();
  }

  setActive(isActive) {
    const nextState = Boolean(isActive);
    if (this.isActive === nextState) return;
    this.isActive = nextState;
    if (this.isActive) {
      ChatTerminal.activeInstance = this;
      this.selectComposer();
      this.updateInputAffordances();
      this.positionSuggestionsDropdown();
    } else {
      this.clearComposerSelection();
      this.clearCellSelection();
      this.hideSuggestions();
      if (ChatTerminal.activeInstance === this) {
        ChatTerminal.activeInstance = null;
      }
    }
    ChatTerminal.updateExecuteButtonState();
  }

  // Helper function to escape shell commands to prevent issues with special characters
  // This sends commands as-is without automatic quoting
  escapeShellCommand(command) {
    // For empty commands, return an empty string
    if (!command) return '';

    // Return the command as-is without any automatic quoting or escaping
    // This allows users to control their own quoting
    return command;
  }

  createCommandSentinelId() {
    this.commandSentinelCounter = (this.commandSentinelCounter + 1) % Number.MAX_SAFE_INTEGER;
    const timePart = Date.now().toString(36);
    const counterPart = this.commandSentinelCounter.toString(36).padStart(4, '0');
    const randomPart = Math.random().toString(36).slice(2, 6);
    return `${timePart}${counterPart}${randomPart}`;
  }

  appendCommandSentinel(command, sentinelId) {
    // We emit TWO sentinels:
    // 1) OSC 133;D sequence (understood by most terminals and not visible)
    // 2) A plain-text fallback like: "__SMRT_DONE__<id>__<code>__"
    //    so completion still works if OSC is stripped by the shell/theme.
    const base = typeof command === 'string' ? command : '';

    // Check if this is an interactive command (ssh, telnet, etc.) that won't return to local shell
    const isInteractiveCommand = /^\s*(ssh|telnet|nc|netcat|mysql|psql|mongo|redis-cli|python|node|irb|rails\s+console)\s+/i.test(base);

    // For interactive commands, don't append sentinel as they won't execute it
    if (isInteractiveCommand) {
      this.dbg('interactive command detected, skipping sentinel');
      return base;
    }

    // Don't append visible sentinels - rely on prompt detection instead
    // Sentinel commands cause echo problems in PTY mode
    return base;
  }

  stripCommandSentinel() {
    if (!this.currentCommand || !this.currentCommand.sentinelId) {
      return false;
    }

    const sentinelId = this.currentCommand.sentinelId;
    let found = false;
    let exitCode = null;

    const applyPattern = (patternSource, label = 'pattern') => {
      const regex = new RegExp(patternSource, 'g');
      let localFound = false;
      this.currentCommand.output = this.currentCommand.output.replace(regex, (match, code) => {
        localFound = true;
        found = true;
        const parsed = Number.parseInt(code, 10);
        if (Number.isFinite(parsed)) {
          exitCode = parsed;
        }
        return '';
      });
      if (localFound && typeof this.currentCommand.promptBuffer === 'string') {
        const promptRegex = new RegExp(patternSource, 'g');
        this.currentCommand.promptBuffer = this.currentCommand.promptBuffer.replace(promptRegex, '');
      }
      if (localFound) this.dbg('sentinel match via', label, 'exit=', exitCode);
    };

    const escapedId = this.escapeRegExp(sentinelId);
    applyPattern(`\\x1b\\]133;D;smrt:${escapedId};exit:([0-9]+)\\x07`, 'osc133D');
    applyPattern(`${this.escapeRegExp(COMMAND_DONE_SENTINEL_PREFIX)}${escapedId}__([0-9]+)__\\s*`, 'plain');

    if (found) {
      if (exitCode !== null) {
        this.currentCommand.exitCode = exitCode;
      }
      this.currentCommand.sentinelCaptured = true;
    }

    return found;
  }

  // ============ Smart Command Suggestions (Feature 6 & 8) ============

  updateCommandStats(command) {
    this.suggestions.updateCommandStats(command);
  }

  updateDirectoryContext(cwd) {
    this.suggestions.updateDirectoryContext(cwd);
    // Also update path completer's current directory
    if (this.pathCompleter) {
      this.pathCompleter.updateCurrentDirectory(cwd);
    }
  }

  getSuggestions(input) {
    return this.suggestions.getSuggestions(input);
  }

  // ============ Tab Completion (Path + Command Suggestions) ============

  /**
   * Handle Tab key: smart context detection
   * Single Tab: Path completion only
   * Double Tab (within 500ms): Command suggestions
   */
  async handleTabCompletion() {
    if (this.inputMode !== 'code') {
      this.hideSuggestions();
      return;
    }

    const now = Date.now();
    const isDoubleTab = (now - this.lastTabTime) < this.tabTimeout;
    this.lastTabTime = now;

    // Double Tab: show command suggestions
    if (isDoubleTab) {
      this.showSmartSuggestions();
      return;
    }

    // Single Tab: try path completion only
    const input = this.input.value;
    const cursorPos = this.input.selectionStart;

    console.log('[Tab] Input:', input, 'Cursor:', cursorPos);

    // 1. Detect path context
    const pathContext = this.pathCompleter.detectPathContext(input, cursorPos);
    console.log('[Tab] Path context:', pathContext);

    // If in an interactive SSH session, let path completer query remote fs
    try {
      const tabState = typeof this.getTabState === 'function' ? this.getTabState() : null;
      const sshTarget = this.activeSshTarget || (tabState && tabState.sshTarget) || null;
      if (this.pathCompleter && typeof this.pathCompleter.setRemoteContext === 'function') {
        this.pathCompleter.setRemoteContext(sshTarget ? { type: 'ssh', target: sshTarget } : null);
      }
    } catch (_) {}

    if (pathContext) {
      // 2. Try path completion
      try {
        const completions = await this.pathCompleter.getCompletions(pathContext);
        console.log('[Tab] Completions:', completions.length, completions);

        if (completions.length > 0) {
          // Has matches: show path completions
          this.renderPathCompletions(completions, pathContext);
          return;
        }
        // No matches: do nothing (wait for double Tab for command suggestions)
      } catch (err) {
        console.warn('[ChatTerminal] Path completion failed:', err);
        // Do nothing on error
      }
    }

    // Single Tab with no path context: do nothing
    // User needs to press Tab again (double Tab) to see command suggestions
  }

  /**
   * Handle Tab completion in cell editor (history command editing)
   * Same logic as main input: Single Tab for path, Double Tab for suggestions
   */
  async handleCellTabCompletion(editor, cellContext) {
    const now = Date.now();
    const isDoubleTab = (now - this.lastTabTime) < this.tabTimeout;
    this.lastTabTime = now;

    // Double Tab: show command suggestions
    if (isDoubleTab) {
      const input = editor.textContent || '';
      const suggestions = this.getSuggestions(input);

      if (suggestions.length > 0) {
        this.renderCellSuggestions(editor, suggestions, cellContext);
      }
      return;
    }

    // Single Tab: try path completion
    const input = editor.textContent || '';
    const cursorPos = this.getCursorPositionInContentEditable(editor);

    // Detect path context
    const pathContext = this.pathCompleter.detectPathContext(input, cursorPos);

    if (pathContext) {
      try {
        const completions = await this.pathCompleter.getCompletions(pathContext);

        if (completions.length > 0) {
          this.renderCellPathCompletions(editor, completions, pathContext, cellContext);
          return;
        }
      } catch (err) {
        console.warn('[ChatTerminal] Cell path completion failed:', err);
      }
    }
  }

  /**
   * Get cursor position in contentEditable element
   */
  getCursorPositionInContentEditable(element) {
    let caretPos = 0;
    const sel = window.getSelection();

    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(element);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      caretPos = preCaretRange.toString().length;
    }

    return caretPos;
  }

  getSelectionBoundsInContentEditable(element) {
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) {
      const pos = this.getCursorPositionInContentEditable(element);
      return { start: pos, end: pos };
    }
    const range = sel.getRangeAt(0);
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) {
      const pos = this.getCursorPositionInContentEditable(element);
      return { start: pos, end: pos };
    }
    const startRange = range.cloneRange();
    startRange.selectNodeContents(element);
    startRange.setEnd(range.startContainer, range.startOffset);
    const start = startRange.toString().length;

    const endRange = range.cloneRange();
    endRange.selectNodeContents(element);
    endRange.setEnd(range.endContainer, range.endOffset);
    const end = endRange.toString().length;

    return { start, end };
  }

  /**
   * Set cursor position in contentEditable element
   */
  setCursorPositionInContentEditable(element, position) {
    const range = document.createRange();
    const sel = window.getSelection();

    let currentPos = 0;
    let found = false;

    const walk = (node) => {
      if (found) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const length = node.textContent.length;
        if (currentPos + length >= position) {
          range.setStart(node, position - currentPos);
          range.collapse(true);
          found = true;
          return;
        }
        currentPos += length;
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i]);
          if (found) return;
        }
      }
    };

    walk(element);

    if (found) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  replaceSelectionInContentEditable(element, text, bounds = null) {
    if (!element) return;
    const content = element.textContent || '';
    const selection = bounds || this.getSelectionBoundsInContentEditable(element);
    const start = Math.max(0, Math.min(selection.start, content.length));
    const end = Math.max(start, Math.min(selection.end, content.length));
    const before = content.slice(0, start);
    const after = content.slice(end);
    element.textContent = before + text + after;
    this.setCursorPositionInContentEditable(element, before.length + text.length);
    if (typeof element.dispatchEvent === 'function') {
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /**
   * Render path completions for cell editor
   */
  renderCellPathCompletions(editor, completions, pathContext, cellContext) {
    const suggestionsEl = document.getElementById('commandSuggestions');
    const suggestionsList = document.getElementById('suggestionsList');

    if (!suggestionsEl || !suggestionsList) return;

    suggestionsEl.classList.remove('position-above', 'position-below');
    suggestionsList.innerHTML = '';

    // Add path completion items
    completions.forEach((entry, index) => {
      const item = document.createElement('div');
      item.className = 'suggestion-item path-completion';
      if (index === 0) item.classList.add('selected');

      const icon = this.pathCompleter.getIcon(entry);
      const size = entry.type === 'file' ? this.pathCompleter.formatSize(entry.size) : '';

      item.innerHTML = `
        <div class="suggestion-content">
          <div class="suggestion-command">
            <span class="path-icon">${icon}</span>
            ${this.escapeHtml(entry.name)}${entry.type === 'dir' ? '/' : ''}
          </div>
          ${size ? `<div class="suggestion-description">${size}</div>` : ''}
        </div>
      `;

      // Click handler
      item.addEventListener('click', () => {
        this.applyCellPathCompletion(editor, pathContext, entry);
      });

      suggestionsList.appendChild(item);
    });

    // Show dropdown
    suggestionsEl.style.visibility = 'hidden';
    suggestionsEl.classList.remove('hidden');
    this.positionCellSuggestionsDropdown(editor);
    suggestionsEl.style.visibility = '';
  }

  /**
   * Apply path completion to cell editor
   */
  applyCellPathCompletion(editor, pathContext, entry) {
    const input = editor.textContent || '';
    const cursorPos = this.getCursorPositionInContentEditable(editor);

    const result = this.pathCompleter.applyCompletion(
      input,
      cursorPos,
      pathContext,
      entry
    );

    editor.textContent = result.value;
    this.setCursorPositionInContentEditable(editor, result.cursorPos);
    editor.focus();

    // Hide suggestions
    this.hideSuggestions();
  }

  /**
   * Render command suggestions for cell editor
   */
  renderCellSuggestions(editor, suggestions, cellContext) {
    const suggestionsEl = document.getElementById('commandSuggestions');
    const suggestionsList = document.getElementById('suggestionsList');

    if (!suggestionsEl || !suggestionsList) return;

    suggestionsEl.classList.remove('position-above', 'position-below');
    suggestionsList.innerHTML = '';

    suggestions.forEach((suggestion, index) => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      if (index === 0) item.classList.add('selected');

      item.innerHTML = `
        <span class="suggestion-icon">${suggestion.icon || '⏱️'}</span>
        <div class="suggestion-content">
          <div class="suggestion-command">${this.escapeHtml(suggestion.command)}</div>
          ${suggestion.description ? `<div class="suggestion-description">${this.escapeHtml(suggestion.description)}</div>` : ''}
        </div>
        ${suggestion.stars ? `<div class="suggestion-meta"><span class="suggestion-stars">${suggestion.stars}</span></div>` : ''}
      `;

      // Click handler
      item.addEventListener('click', () => {
        editor.textContent = suggestion.command;
        this.setCursorPositionInContentEditable(editor, suggestion.command.length);
        editor.focus();
        this.hideSuggestions();
      });

      suggestionsList.appendChild(item);
    });

    // Show dropdown
    suggestionsEl.style.visibility = 'hidden';
    suggestionsEl.classList.remove('hidden');
    this.positionCellSuggestionsDropdown(editor);
    suggestionsEl.style.visibility = '';
  }

  /**
   * Position suggestions dropdown relative to cell editor
   * Smart positioning: place below if space available, otherwise above
   */
  positionCellSuggestionsDropdown(editor) {
    const suggestionsEl = document.getElementById('commandSuggestions');
    if (!suggestionsEl || suggestionsEl.classList.contains('hidden')) return;
    if (!editor) return;

    const margin = 12;
    const editorRect = editor.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const spaceBelow = Math.max(0, viewportHeight - editorRect.bottom - margin);
    const spaceAbove = Math.max(0, editorRect.top - margin);

    // Reset max height to measure natural height
    suggestionsEl.style.maxHeight = '';
    const suggestionHeight = suggestionsEl.offsetHeight || 0;

    // Decide placement: prefer below, but use above if more space there
    let placeBelow = spaceBelow >= suggestionHeight || spaceBelow >= spaceAbove;
    if (spaceBelow === 0 && spaceAbove === 0) {
      placeBelow = true;
    }

    const availableSpace = placeBelow ? spaceBelow : spaceAbove;
    const fallbackMaxHeight = 240;
    const maxHeight = availableSpace > 0
      ? Math.max(120, Math.floor(availableSpace))
      : fallbackMaxHeight;
    suggestionsEl.style.maxHeight = `${maxHeight}px`;

    // Apply positioning classes
    suggestionsEl.classList.remove('position-above', 'position-below');
    if (placeBelow) {
      suggestionsEl.classList.add('position-below');
    } else {
      suggestionsEl.classList.add('position-above');
    }

    // Position relative to viewport (fixed positioning)
    const left = editorRect.left;
    const width = editorRect.width;

    suggestionsEl.style.left = `${left}px`;
    suggestionsEl.style.width = `${Math.max(300, width)}px`;
    suggestionsEl.style.right = 'auto'; // Clear right positioning

    if (placeBelow) {
      const top = editorRect.bottom + 4;
      suggestionsEl.style.top = `${top}px`;
      suggestionsEl.style.bottom = 'auto';
    } else {
      const bottom = viewportHeight - editorRect.top + 4;
      suggestionsEl.style.bottom = `${bottom}px`;
      suggestionsEl.style.top = 'auto';
    }
  }

  /**
   * Render path completions in dropdown
   */
  renderPathCompletions(completions, pathContext) {
    const suggestionsEl = document.getElementById('commandSuggestions');
    const suggestionsList = document.getElementById('suggestionsList');

    if (!suggestionsEl || !suggestionsList) return;

    suggestionsEl.classList.remove('position-above', 'position-below');
    suggestionsList.innerHTML = '';

    // Add path completion items
    completions.forEach((entry, index) => {
      const item = document.createElement('div');
      item.className = 'suggestion-item path-completion';
      if (index === 0) item.classList.add('selected');

      const icon = this.pathCompleter.getIcon(entry);
      const size = entry.type === 'file' ? this.pathCompleter.formatSize(entry.size) : '';

      item.innerHTML = `
        <div class="suggestion-content">
          <div class="suggestion-command">
            <span class="path-icon">${icon}</span>
            ${this.escapeHtml(entry.name)}${entry.type === 'dir' ? '/' : ''}
          </div>
          ${size ? `<div class="suggestion-description">${size}</div>` : ''}
        </div>
      `;

      // Click handler
      item.addEventListener('click', () => {
        this.applyPathCompletion(pathContext, entry);
      });

      suggestionsList.appendChild(item);
    });

    // Show dropdown
    suggestionsEl.style.visibility = 'hidden';
    suggestionsEl.classList.remove('hidden');
    this.positionSuggestionsDropdown();
    suggestionsEl.style.visibility = '';
  }

  /**
   * Apply path completion to input
   */
  applyPathCompletion(pathContext, entry) {
    const result = this.pathCompleter.applyCompletion(
      this.input.value,
      this.input.selectionStart,
      pathContext,
      entry
    );

    this.input.value = result.value;
    this.input.setSelectionRange(result.cursorPos, result.cursorPos);
    this.input.focus();

    // Hide suggestions
    this.hideSuggestions();

    // Trigger resize
    this.input.dispatchEvent(new Event('input'));
  }

  // Show smart suggestions in a dropdown
  showSmartSuggestions() {
    if (this.inputMode !== 'code') {
      this.hideSuggestions();
      return;
    }

    const input = this.input.value;
    const suggestions = this.getSuggestions(input);

    if (suggestions.length === 0) {
      this.hideSuggestions();
      return;
    }

    this.renderSuggestions(suggestions);
  }

  positionSuggestionsDropdown() {
    const suggestionsEl = document.getElementById('commandSuggestions');
    if (!suggestionsEl || suggestionsEl.classList.contains('hidden')) return;
    if (!this.input) return;

    const inputRect = this.input.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    // Position directly below input, matching its width
    const left = inputRect.left;
    const top = inputRect.bottom + 4;
    const width = inputRect.width;

    suggestionsEl.style.left = `${left}px`;
    suggestionsEl.style.top = `${top}px`;
    suggestionsEl.style.width = `${width}px`;
    suggestionsEl.style.bottom = 'auto';
    suggestionsEl.style.right = 'auto';

    // Calculate max height based on available space
    const spaceBelow = Math.max(0, viewportHeight - inputRect.bottom - 16);
    const maxHeight = Math.min(400, Math.max(120, spaceBelow));
    suggestionsEl.style.maxHeight = `${maxHeight}px`;

    suggestionsEl.classList.remove('position-above', 'position-below');
    suggestionsEl.classList.add('position-below');
  }

  // Render suggestions dropdown
  renderSuggestions(suggestions) {
    const suggestionsEl = document.getElementById('commandSuggestions');
    const suggestionsList = document.getElementById('suggestionsList');

    if (!suggestionsEl || !suggestionsList) return;
    suggestionsEl.classList.remove('position-above', 'position-below');

    // Clear previous suggestions
    suggestionsList.innerHTML = '';

    // Add new suggestions
    suggestions.forEach((suggestion, index) => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      if (index === 0) item.classList.add('selected'); // Highlight first item

      const now = Date.now();
      const lastUsedText = suggestion.lastUsed
        ? this.formatRelativeTime(now - suggestion.lastUsed)
        : '';

      const stars = suggestion.count
        ? '★'.repeat(Math.min(5, Math.ceil(suggestion.count / 2)))
        : '';

      item.innerHTML = `
        <div class="suggestion-content">
          <div class="suggestion-command">${this.escapeHtml(suggestion.cmd)}</div>
          <div class="suggestion-description">${this.escapeHtml(suggestion.desc || '')}</div>
        </div>
        <div class="suggestion-meta">
          ${stars ? `<span class="suggestion-stars">${stars}</span>` : ''}
          ${lastUsedText ? `<span class="suggestion-time">${lastUsedText}</span>` : ''}
        </div>
      `;

      // Add click handler to insert command
      item.addEventListener('click', () => {
        this.input.value = suggestion.cmd;
        this.input.focus();

        // Move cursor to appropriate position (e.g., inside quotes for commit messages)
        if (suggestion.cmd.includes('""')) {
          const cursorPos = suggestion.cmd.indexOf('""') + 1;
          this.input.setSelectionRange(cursorPos, cursorPos);
        } else if (suggestion.cmd.endsWith(' ')) {
          this.input.setSelectionRange(suggestion.cmd.length, suggestion.cmd.length);
        }

        suggestionsEl.classList.add('hidden');
      });

      suggestionsList.appendChild(item);
    });

    // Show suggestions
    suggestionsEl.style.visibility = 'hidden';
    suggestionsEl.classList.remove('hidden');
    this.positionSuggestionsDropdown();
    suggestionsEl.style.visibility = '';
  }

  // Hide suggestions dropdown
  hideSuggestions() {
    const suggestionsEl = document.getElementById('commandSuggestions');
    if (suggestionsEl) {
      suggestionsEl.classList.add('hidden');
      suggestionsEl.classList.remove('position-above', 'position-below');
      suggestionsEl.style.maxHeight = '';
      suggestionsEl.style.visibility = '';
    }
  }

  // Navigate cell suggestions (for cell editor)
  navigateCellSuggestions(direction) {
    const suggestionsList = document.getElementById('suggestionsList');
    if (!suggestionsList) return;

    const suggestionItems = suggestionsList.querySelectorAll('.suggestion-item');
    if (suggestionItems.length === 0) return;

    // Find currently highlighted item
    let currentIndex = -1;
    for (let i = 0; i < suggestionItems.length; i++) {
      if (suggestionItems[i].classList.contains('selected')) {
        currentIndex = i;
        suggestionItems[i].classList.remove('selected');
        break;
      }
    }

    // Calculate new index
    let newIndex = currentIndex + direction;

    // Handle wrapping
    if (newIndex < 0) {
      newIndex = suggestionItems.length - 1; // Wrap to last item
    } else if (newIndex >= suggestionItems.length) {
      newIndex = 0; // Wrap to first item
    }

    // Highlight new item
    if (suggestionItems[newIndex]) {
      suggestionItems[newIndex].classList.add('selected');
      // Scroll to ensure the selected item is visible
      suggestionItems[newIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // Select current cell suggestion (for cell editor)
  selectCurrentCellSuggestion(editor, cellContext) {
    const suggestionsList = document.getElementById('suggestionsList');
    if (!suggestionsList) return;

    const selectedSuggestion = suggestionsList.querySelector('.suggestion-item.selected');
    if (selectedSuggestion) {
      // Trigger click event on the selected suggestion
      selectedSuggestion.click();
    } else {
      // If no suggestion is highlighted, select the first one
      const firstSuggestion = suggestionsList.querySelector('.suggestion-item');
      if (firstSuggestion) {
        firstSuggestion.click();
      }
    }
  }

  formatRelativeTime(ms) {
    return this.suggestions.formatRelativeTime(ms);
  }

  markDirty() {
    if (typeof this.changeHandler !== 'function') return;
    if (this.changeDebounce) {
      clearTimeout(this.changeDebounce);
    }
    this.changeDebounce = setTimeout(() => {
      this.changeDebounce = null;
      try {
        this.changeHandler();
      } catch (err) {
        console.error('[ChatTerminal] change handler error:', err);
      }
    }, 150);
  }

  setChangeHandler(handler) {
    this.changeHandler = typeof handler === 'function' ? handler : null;
  }

  serializeState() {
    const messages = [];
    const nodes = this.messages?.children || [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node && node.outerHTML) {
        messages.push(node.outerHTML);
      }
    }
    const historySnapshot = Array.isArray(this.history)
      ? this.history.slice(-MAX_COMMAND_HISTORY)
      : [];
    const clampedHistoryIndex = Math.max(
      -1,
      Math.min(historySnapshot.length, Number.isFinite(this.historyIndex) ? this.historyIndex : historySnapshot.length)
    );
    return {
      messages,
      cellCounter: this.cellCounter,
      savedCellCounter: this.savedCellCounter,
      cellIdCounter: this.cellIdCounter,
      inputMode: this.inputMode,
      savedInputMode: this.savedInputMode,
      history: historySnapshot,
      historyIndex: clampedHistoryIndex
    };
  }

  loadSerializedState(state) {
    if (!state || typeof state !== 'object') return;
    const messages = Array.isArray(state.messages) ? state.messages : [];
    this.messageHistory = messages.slice();
    const rawHistory = Array.isArray(state.history)
      ? state.history.filter((cmd) => typeof cmd === 'string' && cmd.trim())
      : [];
    const historySlice = rawHistory.slice(-MAX_COMMAND_HISTORY);
    this.history = historySlice;
    const storedIndex = Number.isFinite(state.historyIndex)
      ? Math.trunc(state.historyIndex)
      : historySlice.length;
    this.historyIndex = Math.max(-1, Math.min(historySlice.length, storedIndex));
    this.historyDraft = '';
    this.savedCellCounter = Number.isFinite(state.savedCellCounter)
      ? state.savedCellCounter
      : (Number.isFinite(state.cellCounter) ? state.cellCounter : 1);
    this.cellCounter = Number.isFinite(state.cellCounter)
      ? state.cellCounter
      : (this.savedCellCounter || 1);
    this.cellIdCounter = Number.isFinite(state.cellIdCounter) ? state.cellIdCounter : 1;
    this.savedInputMode = state.savedInputMode || state.inputMode || 'code';
    this.inputMode = 'code';
    this.restoreMessageHistory();
    this.setInputMode(this.savedInputMode || 'code', { silent: true });
  }
}

ChatTerminal.executeButton = null;
ChatTerminal._executeClickHandler = null;
ChatTerminal.activeInstance = null;
ChatTerminal._copyListenerRegistered = false;
ChatTerminal._copyListener = null;

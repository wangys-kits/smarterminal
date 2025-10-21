/* Chat-style Terminal Module - Claude Code inspired */

import { MarkdownRenderer } from './chat-terminal-markdown.mjs';
import { CommandSuggestions } from './chat-terminal-suggestions.mjs';
import { CellManager } from './chat-terminal-cells.mjs';
import { PathCompleter } from './chat-terminal-path-completer.mjs';

export const INTERACTIVE_SENTINEL = '__SMRT_INTERACTIVE_DONE__';
const COMMAND_DONE_SENTINEL_PREFIX = '__SMRT_DONE__';

export class ChatTerminal {
  constructor(container, inputEl, messagesEl, statusEl) {
    this.container = container;
    this.input = inputEl;
    this.messages = messagesEl;
    this.statusEl = statusEl;
    this.history = [];
    this.historyIndex = -1;
    this.currentCommand = null;
    this.writer = null;
    this.messageHistory = [];
    this.isCommandRunning = false;
    this.commandBusyWarningShown = false;
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
    this.terminalReady = false;  // PTY is ready to accept commands

    // Double Tab detection for command suggestions
    this.lastTabTime = 0;
    this.tabTimeout = 500; // 500ms window for double Tab

    // Initialize modules
    this.markdownRenderer = new MarkdownRenderer();
    this.suggestions = new CommandSuggestions();
    this.cellManager = new CellManager(this);
    this.pathCompleter = new PathCompleter();

    // Expose cell manager properties for backward compatibility
    this.cellCounter = 1;
    this.cellIdCounter = 1;
    this.savedCellCounter = 1;
    this.pendingDeletionCells = new Set();

    this.setupInputHandlers();
    this.setupAutoResize();
    this.setupSelectionHandlers();
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
    if (this.isCommandRunning) {
      const interactiveInput = this.input.value;
      if (!interactiveInput) return;
      this.sendInteractiveInput(interactiveInput);
      return;
    }

    const rawInput = this.input.value;
    const trimmedInput = rawInput.trim();
    if (!trimmedInput) return;

    if (this.inputMode === 'markdown') {
      const markdownContent = rawInput.replace(/\r\n/g, '\n');
      this.addMarkdownCell(markdownContent);
      this.input.value = '';
      this.input.rows = 1;
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

    // Add to history (code mode only)
    this.history.push(command);
    this.historyIndex = this.history.length;

    // Update command statistics for smart suggestions
    this.updateCommandStats(command);

    // Display user command message and capture cell context
    const cellContext = this.addUserMessage(command, { startEditing: true });

    // Clear input
    this.input.value = '';
    this.input.rows = 1;
    this.input.focus();

    // Hide command suggestions if visible
    const suggestionsEl = document.getElementById('commandSuggestions');
    if (suggestionsEl) {
      suggestionsEl.classList.add('hidden');
    }

    this.runShellCommand(command, cellContext);
  }

  navigateHistory(direction) {
    if (this.inputMode !== 'code' || this.history.length === 0) return;

    this.historyIndex = Math.max(-1, Math.min(this.history.length, this.historyIndex + direction));

    if (this.historyIndex >= 0 && this.historyIndex < this.history.length) {
      this.input.value = this.history[this.historyIndex];
    } else {
      this.input.value = '';
    }

    // Trigger resize
    this.input.dispatchEvent(new Event('input'));
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
      startEditing = false
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

    this.selectCell(cellEl);
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
    this.markDirty();

    return cellContext;
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
          if (!paths.length && (looksLikeUpload || hasFilesType || hasUriList || hasPublicFileUrl || hasFileItems)) {
            e.preventDefault();
            if (window?.sm?.clip?.getFilePaths) {
              window.sm.clip.getFilePaths().then(res => {
                const list = (res && res.ok && Array.isArray(res.data)) ? res.data : [];
                if (!list.length) return;
                const needsQuoting = (s) => /\s|["'`$&|;<>()\\]/.test(s);
                const singleQuote = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
                const joined = list.map(p => needsQuoting(p) ? singleQuote(p) : p).join(' ');
                const input = editor.textContent || '';
                const pos = this.getCursorPositionInContentEditable(editor);
                const before = input.slice(0, pos);
                const after = input.slice(pos);
                editor.textContent = before + joined + after;
                this.setCursorPositionInContentEditable(editor, (before + joined).length);
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
          const input = editor.textContent || '';
          const pos = this.getCursorPositionInContentEditable(editor);
          const before = input.slice(0, pos);
          const after = input.slice(pos);
          editor.textContent = before + joined + after;
          this.setCursorPositionInContentEditable(editor, (before + joined).length);
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
  }

  startCommandEdit(cellContext) {
    if (!cellContext) return;
    const editor = cellContext.commandPre;
    if (!editor) return;

    this.attachCommandEditing(cellContext);
    this.selectCell(cellContext.cellEl);
    editor.classList.add('editing');

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.addRange(range);
    }

    cellContext.editing = true;
    editor.focus();
  }

  finishCommandEdit(cellContext, newCommand, shouldRun) {
    const editor = cellContext?.commandPre;
    if (!editor) return;

    editor.classList.remove('editing');
    cellContext.editing = false;

    cellContext.command = newCommand;
    editor.textContent = newCommand;

    if (shouldRun && newCommand) {
      this.disableCommandEditing(cellContext);

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

      this.updateCommandStats(newCommand);
      this.runShellCommand(newCommand, cellContext, { fromRerun: true });
      return;
    }

    this.restoreCommandEditing(cellContext);
    this.markDirty();
  }

  disableCommandEditing(cellContext) {
    const editor = cellContext?.commandPre;
    if (!editor) return;

    editor.contentEditable = 'false';
    editor.classList.remove('editing');
    cellContext.editing = false;

    if (typeof document !== 'undefined' && document.activeElement === editor) {
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
    const { stopButton, copyButton } = cellContext;

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
        // PTY mode: Send Ctrl+C and wait for response
        this.dbg('PTY mode: Sending Ctrl+C');
        this.sendInterruptSignal();

        // Wait 1 second for the command to respond to Ctrl+C
        this.currentCommand.terminationTimer = setTimeout(() => {
          if (this.currentCommand && this.isCommandRunning) {
            this.dbg('Command did not respond to Ctrl+C, force finalizing');
            this.finalizeCommandOutput();
            this.setCommandRunning(false, cellContext);
            this.currentCommand = null;
            this.processCommandQueue();
          }
        }, 1000);
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
    const text = outputEl ? outputEl.textContent || '' : '';
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
    const controlRow = cellContext.controlRow;

    const isRunning = this.isCommandRunning && this.currentCommand?.cellContext === cellContext;
    const hasOutput = !!cellContext.outputContent?.querySelector('.cell-output-text');

    if (stopButton) {
      stopButton.disabled = !isRunning;
      stopButton.classList.toggle('active', isRunning);
    }
    if (copyButton) {
      copyButton.disabled = !hasOutput;
      copyButton.classList.toggle('active', hasOutput);
    }
    if (controlRow) {
      controlRow.classList.toggle('is-running', isRunning);
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

  removeCellElement(cell) {
    if (!cell) return;
    if (this.pendingDeletionCells?.has(cell)) {
      this.pendingDeletionCells.delete(cell);
    }
    if (cell === this.selectedCell) {
      this.selectedCell = null;
    }
    this.cellManager.removeCellElement(cell);
    this.scrollToBottom();
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
    const fromRerun = this.currentCommand?.fromRerun || false;
    if (!fromRerun) {
      this.scrollToBottom();
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

  runShellCommand(command, cellContext, { fromRerun = false } = {}) {
    // Safety: if someone calls runShellCommand with a transfer command, route it
    const t = this.parseTransferCommand(command);
    if (t) {
      // When called from rerun with an existing cell, run in place; otherwise create a new cell
      if (cellContext) {
        cellContext.cellEl.classList.remove('mode-command', 'mode-upload', 'mode-download');
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

      if (!ptyId) {
        throw new Error('No PTY available for this tab');
      }

      this.dbg('Executing command with PTY mode:', { ptyId, command });

      // 检测是否为交互式命令
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
        isInteractive: isInteractiveCommand,
        sentinelId: isInteractiveCommand ? null : sentinelId,
        promptBuffer: '',
        sentinelCaptured: false
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
  }

  updateCollapseState(cellContext) {
    if (!cellContext || !cellContext.outputRow) return;
    const collapsed = !!cellContext.collapsed;
    cellContext.outputRow.classList.toggle('collapsed', collapsed);
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

    const pre = document.createElement('pre');
    pre.className = 'cell-output-text';
    pre.textContent = safeText || (isError ? 'Error' : '(command executed, no output)');

    if (cellContext.outputBody) {
      cellContext.outputBody.appendChild(pre);
    } else {
      cellContext.outputContent?.appendChild(pre);
    }

    // Don't auto-scroll for rerun commands
    const fromRerun = this.currentCommand?.fromRerun || false;
    if (!fromRerun) {
      this.scrollToBottom();
    }

    this.updateControlButtonStates(cellContext);
    this.markDirty();

    return pre;
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
    if (!this.input) return;

    // Disable input if terminal is not ready
    if (!this.terminalReady) {
      this.input.disabled = true;
      this.input.placeholder = 'Terminal is initializing...';
      this.input.title = 'Please wait for terminal to be ready';
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
  }

  handleTerminalOutput(data) {
    // If there's no current command but there are queued commands, start processing
    if (!this.currentCommand) {
      // Check if we have a recently finalized command that might still receive output
      if (this.lastFinalizedCommand && this.lastFinalizedCommand.outputPre) {
        const timeSinceFinalize = Date.now() - (this.lastFinalizedCommand.finalizeTime || 0);
        // Allow 5 seconds buffer to receive trailing output after finalization
        // This handles cases where commands continue producing output after prompt detection
        if (timeSinceFinalize < 5000) {
          this.dbg('Appending trailing output to finalized command', { bytes: data.length });
          this.lastFinalizedCommand.output += data;
          const cleanOutput = this.cleanTerminalOutput(
            this.lastFinalizedCommand.output,
            this.lastFinalizedCommand.command
          );
          this.lastFinalizedCommand.outputPre.textContent = cleanOutput;

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

      if (this.commandQueue.length > 0 && !this.isCommandRunning) {
        this.processCommandQueue();
      }
      // If still no current command, return early
      if (!this.currentCommand) {
        return;
      }
    }

    this.dbg('data chunk', { bytes: (typeof data === 'string' ? data.length : 0) });
    // No noDataFallbackTimer to clear - removed timeout logic
    this.currentCommand.output += data;
    const cellContext = this.currentCommand.cellContext;
    if (cellContext?.outputPrompt) {
      const idx = cellContext.outputPrompt.dataset.index;
      cellContext.outputPrompt.textContent = this.isCommandRunning ? 'Out [*]:' : `Out [${idx}]:`;
    }
    if (typeof this.currentCommand.promptBuffer !== 'string') {
      this.currentCommand.promptBuffer = '';
    }
    this.currentCommand.promptBuffer += data;

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

    const cleanOutput = this.cleanTerminalOutput(this.currentCommand.output, this.currentCommand.command);

    // Check if this is a rerun command
    const fromRerun = this.currentCommand.fromRerun || false;

    if (!this.currentCommand.outputPre) {
      this.removeLoadingMessage(this.currentCommand.loadingEl);
      const preEl = this.renderCellOutput(cellContext, cleanOutput);
      this.currentCommand.outputPre = preEl;
      if (!cellContext?.collapsed && !fromRerun) {
        this.scrollToBottom();
      }
    } else if (this.currentCommand.outputPre) {
      const preEl = this.currentCommand.outputPre;
      let prevScrollTop = 0;
      if (cellContext?.collapsed) {
        prevScrollTop = preEl.scrollTop;
      }
      preEl.textContent = cleanOutput;
      if (cellContext?.collapsed) {
        preEl.scrollTop = prevScrollTop;
      } else if (!fromRerun) {
        this.scrollToBottom();
      }
      this.updateControlButtonStates(cellContext);
    }

    if (sentinelTriggered) {
      // No timeout timers to clear - removed timeout logic
      this.finalizeCommandOutput();
      return;
    }

    // For interactive commands, finalize after seeing substantial output AND detecting a prompt
    // This allows the user to interact with the remote shell
    // Check for both output length and prompt detection to ensure connection is established
    if (isInteractiveCommand) {
      // For SSH and similar commands, wait for both:
      // 1. Substantial output (connection messages)
      // 2. A prompt pattern (remote shell ready)
      const hasSubstantialOutput = this.currentCommand.output.length > 100;
      const hasPrompt = this.detectShellPrompt(this.currentCommand.promptBuffer);

      if (hasSubstantialOutput && hasPrompt) {
        this.dbg('interactive command ready: output + prompt detected');
        if (this.pendingSshTarget) {
          this.activeSshTarget = this.pendingSshTarget;
          this.dbg('ssh active target set:', this.activeSshTarget);
        }
        this.finalizeCommandOutput();
        return;
      }

      // Fallback: if we have a lot of output but no clear prompt, finalize anyway
      // This handles cases where the remote prompt pattern is unusual
      if (this.currentCommand.output.length > 500) {
        this.dbg('interactive command: substantial output, finalizing');
        this.finalizeCommandOutput();
        return;
      }
    }

    // For non-interactive commands, detect when the shell prompt returns
    if (!isInteractiveCommand && this.detectShellPrompt(this.currentCommand.promptBuffer)) {
      this.dbg('prompt detected');
      // No timeout timers to clear - removed timeout logic
      this.finalizeCommandOutput();
    }
  }

  handlePromptReady() {
    if (!this.isCommandRunning || !this.currentCommand) {
      return;
    }
    this.finalizeCommandOutput();
  }

  finalizeCommandOutput() {
    if (!this.currentCommand) return;

    // Clear termination timer if it exists
    if (this.currentCommand.terminationTimer) {
      clearTimeout(this.currentCommand.terminationTimer);
      this.currentCommand.terminationTimer = null;
    }

    this.stripCommandSentinel();

    const { output, command, cellContext, exitCode, outputPre } = this.currentCommand;
    this.dbg('finalize', { exitCode, outputBytes: output?.length || 0 });

    // Store reference to finalized command for trailing output
    this.lastFinalizedCommand = {
      output,
      command,
      outputPre,
      finalizeTime: Date.now()
    };

    const cleanOutput = this.cleanTerminalOutput(output, command);
    if (cellContext?.outputPrompt) {
      cellContext.outputPrompt.textContent = `Out [${cellContext.outputPrompt.dataset.index}]:`;
    }
    const exitCodeKnown = Number.isInteger(exitCode);
    const cleanLower = cleanOutput.toLowerCase();
    const heuristicError = cleanLower.includes('error') ||
                    cleanLower.includes('command not found');
    const isError = exitCodeKnown ? exitCode !== 0 : heuristicError;

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
      preEl.textContent = cleanOutput;
      if (cellContext?.collapsed) {
        if (preEl.dataset.autoScroll === '1') {
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
    this.commandBusyWarningShown = false;
    this.saveMessageHistory();
    this.processCommandQueue();
  }

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
    const promptIndicators = /[#$%❯»➜➤➟▶▸▹⟫⟩λƒ>‹›❮❯]$/;
    if (promptIndicators.test(lastLine)) {
      return true;
    }

    // Handle prompts that end with indicator followed by a space (e.g., "➜ ")
    if (/[#$%❯»➜➤➟▶▸▹⟫⟩>]\s*$/.test(lastLine)) {
      return true;
    }

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

    const ctx = cellContext || this.currentCommand?.cellContext;
    if (ctx) {
      if (ctx.commandPre) {
        if (isRunning) {
          this.disableCommandEditing(ctx);
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
    if (ctx) {
      this.updateControlButtonStates(ctx);
      if (!isRunning && ctx.cellEl && this.pendingDeletionCells?.has(ctx.cellEl)) {
        this.removeCellElement(ctx.cellEl);
      }
    }

    // Check if this command was a rerun from history
    const fromRerun = this.currentCommand?.fromRerun || false;

    if (!isRunning) {
      // For rerun commands, keep focus on the cell instead of moving to input
      if (!fromRerun) {
        this.input?.focus();
      }
    }

    // For rerun commands, don't scroll at all - stay in current position
    // For new commands, scroll to bottom
    if (!ctx?.collapsed && !fromRerun) {
      this.scrollToBottom();
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

    const payload = rawInput.replace(/\r?\n/g, '\r');
    this.writer(payload + '\r');

    // Clear input box
    this.input.value = '';
    this.input.rows = 1;
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

  /**
   * Detect command mode based on input
   * @param {string} commandText - Command text
   * @returns {string} - Mode: 'command', 'markdown', 'upload', 'download'
   */
  detectCommandMode(commandText) {
    const trimmed = commandText.trim();

    if (trimmed.startsWith('/upload ')) return 'upload';
    if (trimmed.startsWith('/download ')) return 'download';
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

    this.history.push(originalCommand);
    this.historyIndex = this.history.length;

    // Create cell context with transfer mode
    const cellContext = this.addUserMessage(originalCommand, { startEditing: true });

    // Mark the cell with transfer mode
    if (cellContext && cellContext.cellEl) {
      cellContext.cellEl.classList.add(`mode-${type}`);
      cellContext.transferMode = type;
    }

    // Clear input
    this.input.value = '';
    this.input.rows = 1;
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

    // Normalize newlines early so line-based regex with /m works with CR-only outputs
    if (clean && typeof clean === 'string') {
      clean = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    }

    // Step 1: Remove OSC (Operating System Command) sequences first
    // These include window title updates like: ESC ]0;title BEL
    clean = clean.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '');

    // Step 2: Remove the command echo line
    const escapedCmd = this.escapeRegExp(command);
    clean = clean.replace(new RegExp(`^${escapedCmd}\\s*\\n`, ''), '');

    // Step 3: Remove ALL ANSI escape sequences (colors, cursor movements, etc.)
    // This must be done BEFORE trying to match prompts
    clean = clean.replace(/\x1b\[[0-9;]*m/g, '');  // SGR (colors)
    clean = clean.replace(/\x1b\[[0-9;]*[ABCDEFGHJKSTfimnsulh]/g, '');  // CSI
    clean = clean.replace(/\x1b[()=<>]/g, '');
    clean = clean.replace(/\x1b\[[\?#][0-9;]*[a-z]/gi, '');
    clean = clean.replace(/\x1b[PX^_][\s\S]*?\x1b\\/g, '');

    // Step 4: Remove control characters
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

    // Step 7: Clean up whitespace
    clean = clean.replace(/\n{3,}/g, '\n\n');
    clean = clean.trim();

    // Step 8: If everything was removed but we had output, show placeholder
    if (!clean && output && output.length > 0) {
      return '';  // Return empty string for commands with no visible output (like cd)
    }

    return clean || '';
  }

  // Helper function to escape special regex characters
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      this.selectComposer();
      this.updateInputAffordances();
      this.positionSuggestionsDropdown();
    } else {
      this.clearComposerSelection();
      this.clearCellSelection();
      this.hideSuggestions();
    }
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
    return {
      messages,
      cellCounter: this.cellCounter,
      savedCellCounter: this.savedCellCounter,
      cellIdCounter: this.cellIdCounter,
      inputMode: this.inputMode,
      savedInputMode: this.savedInputMode
    };
  }

  loadSerializedState(state) {
    if (!state || typeof state !== 'object') return;
    const messages = Array.isArray(state.messages) ? state.messages : [];
    this.messageHistory = messages.slice();
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

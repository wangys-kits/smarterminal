/* Chat-style Terminal Module - Claude Code inspired */

import { MarkdownRenderer } from './chat-terminal-markdown.mjs';
import { CommandSuggestions } from './chat-terminal-suggestions.mjs';
import { CellManager } from './chat-terminal-cells.mjs';

export const INTERACTIVE_SENTINEL = '__SMRT_INTERACTIVE_DONE__';

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

    // Initialize modules
    this.markdownRenderer = new MarkdownRenderer();
    this.suggestions = new CommandSuggestions();
    this.cellManager = new CellManager(this);

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
        if (this.inputMode === 'code') {
          // Tab key triggers suggestions in code mode
          e.preventDefault();
          this.showSmartSuggestions();
        }
      } else if (e.key === 'Escape') {
        this.input.value = '';
        this.input.rows = 1;
        // Hide command suggestions if visible
        const suggestions = document.getElementById('commandSuggestions');
        if (suggestions) {
          suggestions.classList.add('hidden');
        }
      }
    });

    this.input.addEventListener('focus', () => {
      if (!this.isActive) return;
      this.clearComposerSelection();
    });

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
      this.handleCommandSuggestions(e.target.value);
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
        this.clearComposerSelection();
        this.selectCell(cell);
      });
    }

    window.addEventListener('keydown', this.handleGlobalKeydown);
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

  sendInterruptSignal() {
    // Send Ctrl+C (SIGINT) to the terminal
    if (this.writer) {
      // Send the interrupt character (Ctrl+C = \x03)
      this.writer('\x03');
    } else {
      this.addErrorMessage('No active terminal connection');
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

    // Check if terminal is ready before executing command
    if (this.getTabState) {
      const tab = this.getTabState();
      if (tab && !tab.terminalReady) {
        console.warn('[terminal] Terminal not ready yet, please wait');
        // Show a temporary warning in the status area if available
        if (this.statusEl) {
          const originalText = this.statusEl.textContent;
          this.statusEl.textContent = 'Terminal is initializing, please wait...';
          this.statusEl.style.color = 'var(--color-warning, orange)';
          setTimeout(() => {
            this.statusEl.textContent = originalText;
            this.statusEl.style.color = '';
          }, 2000);
        }
        return;
      }
    }

    const command = trimmedInput;

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

    if (!insertBefore && !replace && !insertAfter) {
      this.scrollToBottom();
    } else if (typeof cellEl.scrollIntoView === 'function') {
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
      startEditing = false
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
      this.scrollToBottom();
    } else if (typeof cellEl.scrollIntoView === 'function') {
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
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault();
          const newCommand = editor.textContent.trim();
          this.finishCommandEdit(cellContext, newCommand, true);
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

      editor.__smrtEditHandlers = { keyHandler, blurHandler, focusHandler };
      editor.addEventListener('keydown', keyHandler);
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
    if (!cellContext) return;
    if (this.isCommandRunning && this.currentCommand?.cellContext === cellContext) {
      this.sendInterruptSignal();
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

  selectCell(cellEl) {
    if (!cellEl) return;
    if (this.selectedCell === cellEl) return;

    this.clearComposerSelection();
    if (this.selectedCell) {
      this.selectedCell.classList.remove('selected');
    }
    this.selectedCell = cellEl;
    this.selectedCell.classList.add('selected');
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
    this.scrollToBottom();
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
    if (!cellContext) {
      cellContext = this.addUserMessage(command);
    }

    this.selectCell(cellContext.cellEl);

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

    this.commandQueue.push({ command, cellContext });
    this.updateControlButtonStates(cellContext);
    this.processCommandQueue();
  }

  processCommandQueue() {
    if (this.isCommandRunning) return;
    const next = this.commandQueue.shift();
    if (!next) return;
    this.startQueuedCommand(next);
  }

  startQueuedCommand({ command, cellContext }) {
    if (!cellContext) return;

    if (cellContext.collapsed) {
      cellContext.collapsed = false;
      this.updateCollapseState(cellContext);
    }

    const executionIndex = this.cellCounter++;
    this.applyExecutionIndex(cellContext, executionIndex);

    const loadingEl = this.addLoadingMessage(cellContext);
    this.updateControlButtonStates(cellContext);

    if (!this.writer) {
      this.removeLoadingMessage(loadingEl);
      this.renderCellOutput(cellContext, 'No active terminal connection', { isError: true });
      if (cellContext.outputPrompt) {
        const idx = cellContext.outputPrompt.dataset.index;
        cellContext.outputPrompt.textContent = `Out [${idx}]:`;
      }
      this.restoreCommandEditing(cellContext);
      this.processCommandQueue();
      return;
    }

    try {
      this.currentCommand = {
        command,
        output: '',
        startTime: Date.now(),
        loadingEl,
        promptBuffer: '',
        cellContext,
        outputPre: null
      };

      const escapedCommand = this.escapeShellCommand(command);
      if (cellContext?.outputPrompt) {
        cellContext.outputPrompt.textContent = 'Out [*]:';
      }
      this.setCommandRunning(true, cellContext);
      this.commandBusyWarningShown = false;
      this.writer(escapedCommand + '\r');
      this.updateControlButtonStates(cellContext);
    } catch (error) {
      this.removeLoadingMessage(loadingEl);
      this.renderCellOutput(cellContext, `Failed to execute: ${error.message}`, { isError: true });
      this.currentCommand = null;
      this.setCommandRunning(false, cellContext);
      this.processCommandQueue();
    }

    this.scrollToBottom();
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
    this.scrollToBottom();
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
    if (!this.currentCommand) {
      return;
    }

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
    if (this.currentCommand.promptBuffer.length > 4000) {
      this.currentCommand.promptBuffer = this.currentCommand.promptBuffer.slice(-4000);
    }

    const cleanOutput = this.cleanTerminalOutput(this.currentCommand.output, this.currentCommand.command);

    if (!this.currentCommand.outputPre) {
      this.removeLoadingMessage(this.currentCommand.loadingEl);
      const preEl = this.renderCellOutput(cellContext, cleanOutput);
      this.currentCommand.outputPre = preEl;
      if (!cellContext?.collapsed) {
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
      } else {
        this.scrollToBottom();
      }
      this.updateControlButtonStates(cellContext);
    }

    // Detect when the shell prompt returns to mark the command as complete
    if (this.detectShellPrompt(this.currentCommand.promptBuffer)) {
      this.finalizeCommandOutput();
    }
  }

  finalizeCommandOutput() {
    if (!this.currentCommand) return;

    const { output, command, cellContext } = this.currentCommand;

    const cleanOutput = this.cleanTerminalOutput(output, command);
    if (cellContext?.outputPrompt) {
      cellContext.outputPrompt.textContent = `Out [${cellContext.outputPrompt.dataset.index}]:`;
    }
    const isError = cleanOutput.toLowerCase().includes('error') ||
                    cleanOutput.toLowerCase().includes('command not found');

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
    const lastLineRaw = lines[lines.length - 1] || '';
    if (!lastLineRaw) return false;

    // Remove trailing whitespace but keep internal spacing for prompt matching
    const lastLine = lastLineRaw.replace(/\s+$/, '');
    if (!lastLine) return false;

    // Common prompt shapes across shells (bash/zsh/fish/powershell)
    const promptPatterns = [
      /^(?:\[.*\]\s*)?(?:[A-Za-z0-9_.\-]+@)?[A-Za-z0-9_.\-:\/~\[\]{}()\\ ]*[#$%❯»>]$/,
      /^(?:PS )?[A-Za-z]:\\.*>$/,
      /^[A-Za-z0-9_.\-:\/~\[\]{}()\\ ]*λ$/
    ];

    return promptPatterns.some((pattern) => pattern.test(lastLine));
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

    if (!isRunning) {
      this.input?.focus();
    }
    if (!ctx?.collapsed) {
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

  cleanTerminalOutput(output, command) {
    let clean = output;

    // Remove the command echo more carefully
    // The command may appear with or without the leading characters we typed
    // Try to find and remove the command echo wherever it appears at the start
    const escapedCmd = this.escapeRegExp(command);

    // Try multiple patterns for command echo removal:
    // 1. Exact command followed by newline
    const exactPattern = new RegExp(`^${escapedCmd}\\s*\\r?\\n`, '');
    clean = clean.replace(exactPattern, '');

    // 2. Command that may have been echoed character by character (remove duplicates)
    // This handles cases where each character is echoed as typed
    const charByCharPattern = new RegExp(`^[^\\n]*${escapedCmd}[^\\n]*\\r?\\n`, '');
    if (clean === output) { // Only try this if first pattern didn't match
      clean = clean.replace(charByCharPattern, '');
    }

    // Strip OSC (Operating System Command) sequences such as window-title updates.
    // These are not rendered in the chat view and only add noise (e.g. ESC ]2;... BEL).
    clean = clean.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, '');

    // Remove various ANSI escape sequences more carefully
    // CSI sequences (Control Sequence Introducer) - keep most but remove cursor movements
    clean = clean.replace(/\x1b\[[0-9;]*[ABCDEFGHJKSTfimnsulh]/g, '');

    // Other escape sequences
    clean = clean.replace(/\x1b[()=<>]/g, '');
    clean = clean.replace(/\x1b\[[\?#][0-9;]*[a-z]/gi, '');
    clean = clean.replace(/\x1b[PX^_][\s\S]*?\x1b\\/g, '');

    // Remove remaining control characters (but be more careful)
    // Only remove isolated control characters, not those that are part of valid sequences
    clean = clean.replace(/([\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f])+/g, '');

    // Remove null bytes
    clean = clean.replace(/\x00/g, '');

    // Remove BEL characters
    clean = clean.replace(/\x07/g, '');

    // Remove shell prompts at the end (more careful pattern)
    // This matches common prompt patterns like $, #, >, %, ❯, », followed by optional spaces at the end
    // Also handle prompts with user@host format
    clean = clean.replace(/^.*[\$>#%❯»]\s*$/gm, ''); // Remove lines that are just prompts
    clean = clean.replace(/[\$>#%❯»]\s*$/, ''); // Remove trailing prompt

    // Remove carriage returns but preserve line feeds for proper line breaks
    clean = clean.replace(/\r\n/g, '\n'); // Convert CRLF to LF
    clean = clean.replace(/\r/g, '');     // Remove any remaining CR

    // Remove excessive blank lines (more than 2 consecutive newlines)
    clean = clean.replace(/\n{3,}/g, '\n\n');

    // Trim whitespace but preserve internal structure
    clean = clean.trim();

    // If we have actual content (not just whitespace), return it
    if (clean.length > 0) {
      return clean;
    }

    // If original output had content but cleaning removed it all,
    // it likely means the command produced no visible output
    // Check if there was any actual data
    if (output && output.length > 10) { // If we had substantial data that got cleaned away
      // The output might have been just control sequences and prompts
      // Return a message indicating command executed but no output
      return '(command executed, no output)';
    }

    // Return the cleaned output, or "(no output)" if it's truly empty
    return clean || '(no output)';
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

    const performScroll = () => {
      try {
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

  // ============ Smart Command Suggestions (Feature 6 & 8) ============

  updateCommandStats(command) {
    this.suggestions.updateCommandStats(command);
  }

  updateDirectoryContext(cwd) {
    this.suggestions.updateDirectoryContext(cwd);
  }

  getSuggestions(input) {
    return this.suggestions.getSuggestions(input);
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

    const margin = 12;
    const inputRect = this.input.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const spaceBelow = Math.max(0, viewportHeight - inputRect.bottom - margin);
    const spaceAbove = Math.max(0, inputRect.top - margin);

    suggestionsEl.style.maxHeight = '';
    const suggestionHeight = suggestionsEl.offsetHeight || 0;

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

    suggestionsEl.classList.remove('position-above', 'position-below');
    if (placeBelow) {
      suggestionsEl.classList.add('position-below');
    } else {
      suggestionsEl.classList.add('position-above');
    }
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

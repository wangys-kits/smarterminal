/* Cell management for ChatTerminal */

import { i18n } from './i18n.mjs';

export class CellManager {
  constructor(chatTerminal) {
    this.chatTerminal = chatTerminal;
    this.cellIdCounter = 1;
    this.cellCounter = 1;
    this.savedCellCounter = 1;
    this.pendingDeletionCells = new Set();
  }

  applyExecutionIndex(cellContext, executionIndex) {
    if (!cellContext) return;
    const indexString = typeof executionIndex === 'number' && Number.isFinite(executionIndex)
      ? String(executionIndex)
      : '';

    cellContext.executionIndex = executionIndex;

    if (cellContext.cellEl) {
      cellContext.cellEl.dataset.executionIndex = indexString;
    }
    if (cellContext.inputPrompt) {
      cellContext.inputPrompt.textContent = executionIndex
        ? `In [${executionIndex}]:`
        : 'In [ ]:';
    }
    if (cellContext.outputPrompt) {
      cellContext.outputPrompt.dataset.index = indexString;
      cellContext.outputPrompt.textContent = executionIndex
        ? `Out [${executionIndex}]:`
        : 'Out [ ]:';
    }
    if (cellContext.controlPrompt) {
      cellContext.controlPrompt.dataset.index = indexString;
      cellContext.controlPrompt.textContent = executionIndex
        ? `Ctl [${executionIndex}]:`
        : 'Ctl [ ]:';
    }
  }

  /**
   * Detect command mode based on command text
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

  createCommandCell(command, options = {}) {
    const {
      insertBefore = null,
      insertAfter = null,
      replace = null,
      startEditing = false
    } = options || {};

    const normalizedCommand = typeof command === 'string' ? command : '';

    // Detect command mode
    const mode = this.detectCommandMode(normalizedCommand);

    const cellEl = document.createElement('div');
    cellEl.className = 'notebook-cell';
    const cellId = this.cellIdCounter++;
    cellEl.dataset.cellId = cellId;
    cellEl.dataset.executionIndex = '';
    cellEl.dataset.outputCollapsed = '0';

    // Add mode class to cell
    cellEl.classList.add(`mode-${mode}`);

    const inputRow = document.createElement('div');
    inputRow.className = 'cell-row cell-input';

    const inputPrompt = document.createElement('div');
    inputPrompt.className = 'cell-prompt';
    inputPrompt.textContent = 'In [ ]:';

    const inputContent = document.createElement('div');
    inputContent.className = 'cell-content';

    // Editor area with a dedicated line-number gutter and the editable pre
    const editorWrapper = document.createElement('div');
    editorWrapper.className = 'cell-input-editor';

    const commandGutter = document.createElement('div');
    commandGutter.className = 'code-gutter cell-input-gutter';
    commandGutter.setAttribute('aria-hidden', 'true');

    const commandPre = document.createElement('pre');
    commandPre.className = 'cell-input-text';
    commandPre.contentEditable = 'true';
    commandPre.textContent = normalizedCommand;
    // Show a hint when the editor is empty to improve affordance
    try {
      const placeholder = i18n.t('cell.input.placeholder', '输入命令，Shift+Enter 执行');
      commandPre.setAttribute('data-placeholder', placeholder);
      commandPre.setAttribute('aria-label', i18n.t('cell.input.ariaLabel', '命令编辑框'));
      commandPre.setAttribute('role', 'textbox');
    } catch (_) { /* best-effort */ }

    const cellContext = {
      cellEl,
      cellId,
      command: normalizedCommand,
      commandPre,
      commandGutter,
      inputPrompt,
      outputRow: null,
      outputContent: null,
      outputPrompt: null,
      controlPrompt: null,
      executionIndex: null,
      collapsed: false,
      editing: false
    };

    editorWrapper.append(commandGutter, commandPre);
    inputContent.appendChild(editorWrapper);
    inputRow.append(inputPrompt, inputContent);

    const outputRow = document.createElement('div');
    outputRow.className = 'cell-row cell-output hidden';
    outputRow.dataset.collapsed = '0';

    const outputPrompt = document.createElement('div');
    outputPrompt.className = 'cell-prompt';
    outputPrompt.dataset.index = '';
    outputPrompt.textContent = 'Out [ ]:';

    const outputContent = document.createElement('div');
    outputContent.className = 'cell-content';

    const outputBody = document.createElement('div');
    outputBody.className = 'cell-output-body';

    const outputTimer = document.createElement('div');
    outputTimer.className = 'cell-output-timer hidden';
    outputTimer.textContent = '00:00:00';

    outputContent.append(outputBody, outputTimer);
    outputRow.append(outputPrompt, outputContent);

    // Build control row (Stop / Copy). We always create it and use CSS to hide in
    // upload/download modes, so that switching modes later will automatically show/hide.
    const controlRow = document.createElement('div');
    controlRow.className = 'cell-row cell-controls';

    const controlPrompt = document.createElement('div');
    controlPrompt.className = 'cell-prompt';
    controlPrompt.dataset.index = '';
    controlPrompt.textContent = 'Ctl [ ]:';

    const controlContent = document.createElement('div');
    controlContent.className = 'cell-content cell-controls-content';

    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'cell-control-btn control-stop';
    stopBtn.dataset.action = 'stop';
    stopBtn.disabled = true;
    stopBtn.textContent = i18n.t('cell.control.stop', 'Stop');
    stopBtn.title = i18n.t('cell.control.stop.title', 'Stop current command (Ctrl+C)');

    const followBtn = document.createElement('button');
    followBtn.type = 'button';
    followBtn.className = 'cell-control-btn control-follow';
    followBtn.dataset.action = 'follow';
    followBtn.disabled = true;
    followBtn.textContent = i18n.t('cell.control.follow', 'Follow');
    followBtn.title = i18n.t('cell.control.follow.title', 'Auto-scroll to bottom while running and collapsed');
    followBtn.classList.add('hidden');

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'cell-control-btn control-copy';
    copyBtn.dataset.action = 'copy';
    copyBtn.disabled = true;
    copyBtn.textContent = i18n.t('cell.control.copy', 'Copy');
    copyBtn.title = i18n.t('cell.control.copy.title', 'Copy output content');

    controlContent.append(stopBtn, copyBtn, followBtn);
    controlRow.append(controlPrompt, controlContent);

    // Append rows; controlRow will be hidden via CSS for upload/download modes
    cellEl.append(inputRow, outputRow, controlRow);

    cellContext.outputRow = outputRow;
    cellContext.outputContent = outputContent;
    cellContext.outputPrompt = outputPrompt;
    cellContext.outputBody = outputBody;
    cellContext.outputTimer = outputTimer;
    cellContext.timerInterval = null;
    cellContext.timerStart = null;
    cellContext.controlRow = controlRow;
    cellContext.controlPrompt = controlPrompt;
    cellContext.stopButton = stopBtn;
    cellContext.followButton = followBtn;
    cellContext.copyButton = copyBtn;
    cellContext.autoFollow = false;

    cellEl.__smrtContext = cellContext;

    return { cellEl, cellContext };
  }

  createMarkdownCell(markdownText, options = {}) {
    const {
      insertBefore = null,
      insertAfter = null,
      replace = null,
      allowEmpty = false,
      startEditing = false
    } = options || {};

    const normalized = typeof markdownText === 'string'
      ? markdownText.replace(/\r\n/g, '\n')
      : '';
    const trimmed = normalized.trim();
    if (!allowEmpty && !trimmed) return null;

    const cellEl = document.createElement('div');
    cellEl.className = 'notebook-cell markdown-cell';

    // Add markdown mode class
    cellEl.classList.add('mode-markdown');

    const cellId = this.cellIdCounter++;
    cellEl.dataset.cellId = cellId;
    cellEl.dataset.executionIndex = '';

    const row = document.createElement('div');
    row.className = 'cell-row cell-markdown';

    const prompt = document.createElement('div');
    prompt.className = 'cell-prompt';
    prompt.textContent = 'Markdown';

    const content = document.createElement('div');
    content.className = 'cell-content markdown-content';

    row.append(prompt, content);
    cellEl.append(row);
    cellEl.dataset.markdown = normalized;

    return { cellEl, content };
  }

  removeCellElement(cell) {
    if (!cell) return;
    if (this.pendingDeletionCells?.has(cell)) {
      this.pendingDeletionCells.delete(cell);
    }
    const context = cell.__smrtContext;
    if (context && this.chatTerminal) {
      this.chatTerminal.resetCellTimer(context);
    }
    cell.remove();
  }

  rehydrateCells(messagesContainer) {
    const cells = messagesContainer.querySelectorAll('.notebook-cell');
    let maxCellId = this.cellIdCounter;
    let maxExecutionIndex = this.cellCounter - 1;

    cells.forEach((cellEl) => {
      const isMarkdown = cellEl.classList.contains('markdown-cell');
      if (isMarkdown) {
        const cellIdRaw = parseInt(cellEl.dataset.cellId, 10);
        let cellIdVal = Number.isFinite(cellIdRaw) ? cellIdRaw : this.cellIdCounter++;
        if (!Number.isFinite(cellIdRaw)) {
          cellEl.dataset.cellId = String(cellIdVal);
        }
        const execRaw = parseInt(cellEl.dataset.executionIndex, 10);
        if (Number.isFinite(execRaw)) {
          maxExecutionIndex = Math.max(maxExecutionIndex, execRaw);
        }
        maxCellId = Math.max(maxCellId, cellIdVal);

        if (!cellEl.dataset.markdown) {
          const text = cellEl.querySelector('.cell-content')?.textContent || '';
          cellEl.dataset.markdown = text;
        }
        return;
      }

      const cellIdRaw = parseInt(cellEl.dataset.cellId, 10);
      const cellId = Number.isFinite(cellIdRaw) ? cellIdRaw : this.cellIdCounter++;
      if (!Number.isFinite(cellIdRaw)) {
        cellEl.dataset.cellId = String(cellId);
      }
      maxCellId = Math.max(maxCellId, cellId);

      const execRaw = parseInt(cellEl.dataset.executionIndex, 10);
      if (Number.isFinite(execRaw)) {
        maxExecutionIndex = Math.max(maxExecutionIndex, execRaw);
      }

      let commandPre = cellEl.querySelector('.cell-input-text');
      if (commandPre) {
        commandPre.contentEditable = 'true';
        // Ensure placeholder hint exists on legacy cells as well
        try {
          const placeholder = i18n.t('cell.input.placeholder', '输入命令，Shift+Enter 执行');
          commandPre.setAttribute('data-placeholder', placeholder);
          commandPre.setAttribute('aria-label', i18n.t('cell.input.ariaLabel', '命令编辑框'));
          commandPre.setAttribute('role', 'textbox');
        } catch (_) { /* best-effort */ }
      }
      // Ensure legacy cells also get the editor wrapper and gutter
      let commandGutter = null;
      try {
        const parent = commandPre?.parentElement;
        const hasWrapper = parent && parent.classList.contains('cell-input-editor');
        if (!hasWrapper && commandPre) {
          const inputContent = cellEl.querySelector('.cell-row.cell-input .cell-content');
          const wrapper = document.createElement('div');
          wrapper.className = 'cell-input-editor';
          const gutter = document.createElement('div');
          gutter.className = 'code-gutter cell-input-gutter';
          gutter.setAttribute('aria-hidden', 'true');
          // Move the commandPre into wrapper
          wrapper.append(gutter, commandPre);
          if (inputContent) {
            // If commandPre was already inside inputContent, remove it to avoid duplicate
            if (commandPre.parentNode && commandPre.parentNode !== wrapper) {
              try { commandPre.parentNode.removeChild(commandPre); } catch (_) {}
            }
            inputContent.appendChild(wrapper);
          }
          commandGutter = gutter;
        } else {
          commandGutter = cellEl.querySelector('.cell-input-gutter');
        }
      } catch (_) { /* best-effort */ }

      const command = commandPre ? commandPre.textContent : '';
      const outputRow = cellEl.querySelector('.cell-row.cell-output');
      const outputContent = outputRow ? outputRow.querySelector('.cell-content') : null;
      let outputBody = outputContent ? outputContent.querySelector('.cell-output-body') : null;
      let outputTimer = outputContent ? outputContent.querySelector('.cell-output-timer') : null;
      const outputPrompt = outputRow ? outputRow.querySelector('.cell-prompt') : null;

      if (outputContent && !outputBody) {
        const existingChildren = Array.from(outputContent.childNodes);
        outputBody = document.createElement('div');
        outputBody.className = 'cell-output-body';
        existingChildren.forEach((child) => {
          if (child === outputTimer) return;
          outputBody.appendChild(child);
        });
        outputContent.appendChild(outputBody);
      }

      if (outputContent && !outputTimer) {
        outputTimer = document.createElement('div');
        outputTimer.className = 'cell-output-timer hidden';
        outputTimer.textContent = '00:00:00';
        outputContent.appendChild(outputTimer);
      }

      if (outputTimer) {
        if (!outputTimer.textContent) {
          outputTimer.textContent = '00:00:00';
        }
        const hasExistingOutput = !!outputBody && outputBody.childNodes.length > 0;
        if (hasExistingOutput) {
          outputTimer.classList.remove('hidden');
        }
      }

      const inputPrompt = cellEl.querySelector('.cell-row.cell-input .cell-prompt') || null;
      const controlRow = cellEl.querySelector('.cell-row.cell-controls');
      const controlPrompt = controlRow?.querySelector('.cell-prompt') || null;
      const stopButton = controlRow?.querySelector('.control-stop') || null;
      const followButton = controlRow?.querySelector('.control-follow') || null;
      const copyButton = controlRow?.querySelector('.control-copy') || null;

      const cellContext = {
        cellEl,
        cellId,
        executionIndex: Number.isFinite(execRaw) ? execRaw : null,
        command,
        commandPre,
        inputPrompt,
        outputRow,
        outputContent,
        outputPrompt,
        outputBody,
        outputTimer,
        controlRow,
        controlPrompt,
        stopButton,
        followButton,
        copyButton,
        commandGutter,
        collapsed: (cellEl.dataset.outputCollapsed === '1') ||
          (outputRow?.dataset?.collapsed === '1') ||
          outputRow?.classList.contains('collapsed') || false,
        editing: false,
        timerInterval: null,
        timerStart: null,
        autoFollow: false
      };

      cellEl.dataset.outputCollapsed = cellContext.collapsed ? '1' : '0';
      if (outputRow) {
        outputRow.dataset.collapsed = cellContext.collapsed ? '1' : '0';
      }

      if (Number.isFinite(execRaw)) {
        this.applyExecutionIndex(cellContext, execRaw);
      } else {
        this.applyExecutionIndex(cellContext, null);
      }

      cellEl.__smrtContext = cellContext;
      // Populate line numbers for existing cells
      try { this.chatTerminal?.updateCellInputLineNumbers(cellContext); } catch (_) {}
    });

    this.cellIdCounter = Math.max(this.cellIdCounter, maxCellId + 1);
    this.cellCounter = Math.max(this.cellCounter, maxExecutionIndex + 1);
  }
}

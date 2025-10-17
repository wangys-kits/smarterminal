/* Chat-style Terminal Module - Claude Code inspired */

export class ChatTerminal {
  constructor(container, inputEl, messagesEl, statusEl) {
    this.container = container;
    this.input = inputEl;
    this.messages = messagesEl;
    this.statusEl = statusEl;
    this.history = [];
    this.historyIndex = -1;
    this.currentCommand = null;
    this.writer = null; // Will be set from outside

    this.setupInputHandlers();
    this.setupAutoResize();
  }

  setupInputHandlers() {
    // Handle Enter vs Shift+Enter
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          // Shift+Enter: allow default newline behavior
          return;
        } else {
          // Enter: execute command
          e.preventDefault();
          this.executeCommand();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.navigateHistory(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.navigateHistory(1);
      } else if (e.key === 'Escape') {
        this.input.value = '';
        this.input.rows = 1;
      }
    });
  }

  setupAutoResize() {
    // Auto-resize textarea as user types
    this.input.addEventListener('input', () => {
      this.input.rows = 1; // Reset to measure scrollHeight
      const lines = Math.min(10, Math.ceil(this.input.scrollHeight / 24));
      this.input.rows = Math.max(1, lines);
    });
  }

  async executeCommand() {
    const command = this.input.value.trim();
    if (!command) return;

    // Add to history
    this.history.push(command);
    this.historyIndex = this.history.length;

    // Display user command message
    this.addUserMessage(command);

    // Clear input
    this.input.value = '';
    this.input.rows = 1;
    this.input.focus();

    // Show loading indicator
    const loadingId = this.addLoadingMessage();

    // Execute command via writer
    if (this.writer) {
      try {
        this.currentCommand = {
          command,
          output: '',
          startTime: Date.now(),
          loadingId
        };

        // Send command to PTY
        this.writer(command + '\r');
      } catch (error) {
        this.removeLoadingMessage(loadingId);
        this.addErrorMessage(`Failed to execute: ${error.message}`);
        this.currentCommand = null;
      }
    } else {
      this.removeLoadingMessage(loadingId);
      this.addErrorMessage('No active terminal connection');
      this.currentCommand = null;
    }

    // Scroll to bottom
    this.scrollToBottom();
  }

  navigateHistory(direction) {
    if (this.history.length === 0) return;

    this.historyIndex = Math.max(-1, Math.min(this.history.length, this.historyIndex + direction));

    if (this.historyIndex >= 0 && this.historyIndex < this.history.length) {
      this.input.value = this.history[this.historyIndex];
    } else {
      this.input.value = '';
    }

    // Trigger resize
    this.input.dispatchEvent(new Event('input'));
  }

  addUserMessage(command) {
    const messageEl = document.createElement('div');
    messageEl.className = 'user-message';

    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });

    messageEl.innerHTML = `
      <div class="message-content">
        <div class="message-header">
          <span>💻 You</span>
          <span class="message-time">${timestamp}</span>
        </div>
        <pre class="command-text">${this.escapeHtml(command)}</pre>
      </div>
    `;

    this.messages.appendChild(messageEl);
    this.scrollToBottom();
  }

  addLoadingMessage() {
    const id = `loading-${Date.now()}`;
    const messageEl = document.createElement('div');
    messageEl.className = 'loading-message';
    messageEl.id = id;

    messageEl.innerHTML = `
      <div class="message-content">
        <div class="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <span style="margin-left: 8px; color: var(--text-tertiary); font-size: var(--font-size-sm);">Executing...</span>
      </div>
    `;

    this.messages.appendChild(messageEl);
    this.scrollToBottom();
    return id;
  }

  removeLoadingMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  handleTerminalOutput(data) {
    if (!this.currentCommand) return;

    this.currentCommand.output += data;

    // Clear any existing timer
    if (this.currentCommand.updateTimer) {
      clearTimeout(this.currentCommand.updateTimer);
    }

    // Debounce output finalization - wait for output to stabilize
    this.currentCommand.updateTimer = setTimeout(() => {
      this.finalizeCommandOutput();
    }, 500); // Wait 500ms after last output
  }

  finalizeCommandOutput() {
    if (!this.currentCommand) return;

    clearTimeout(this.currentCommand.updateTimer);

    const { output, loadingId, command } = this.currentCommand;

    // Remove loading message
    this.removeLoadingMessage(loadingId);

    // Clean output (remove command echo and control characters)
    const cleanOutput = this.cleanTerminalOutput(output, command);

    // Determine if error (heuristic: non-zero exit, or contains "error")
    const isError = cleanOutput.toLowerCase().includes('error') ||
                    cleanOutput.toLowerCase().includes('command not found');

    // Add output message
    this.addOutputMessage(cleanOutput, isError);

    this.currentCommand = null;
    this.scrollToBottom();
  }

  cleanTerminalOutput(output, command) {
    // Remove the command echo
    let clean = output.replace(command, '');

    // Remove ANSI escape codes (basic cleanup)
    clean = clean.replace(/\x1b\[[0-9;]*m/g, '');

    // Remove carriage returns
    clean = clean.replace(/\r/g, '');

    // Remove trailing prompts (simple heuristic)
    clean = clean.replace(/[\$>#]\s*$/, '');

    // Trim whitespace
    clean = clean.trim();

    return clean || '(no output)';
  }

  addOutputMessage(output, isError = false) {
    const messageEl = document.createElement('div');
    messageEl.className = 'output-message' + (isError ? ' error' : '');

    messageEl.innerHTML = `
      <pre>${this.escapeHtml(output)}</pre>
    `;

    this.messages.appendChild(messageEl);
    this.scrollToBottom();
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
  }

  clearHistory() {
    // Keep welcome message, clear everything else
    const welcome = this.messages.querySelector('.system-message');
    this.messages.innerHTML = '';
    if (welcome) {
      this.messages.appendChild(welcome);
    }
    this.scrollToBottom();
  }

  scrollToBottom() {
    // Smooth scroll to bottom
    this.container.scrollTop = this.container.scrollHeight;
  }

  setWriter(writer) {
    this.writer = writer;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  focus() {
    this.input.focus();
  }
}

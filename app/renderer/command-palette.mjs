/* Command Palette Module */

import i18n from './i18n.mjs';

export class CommandPalette {
  constructor() {
    this.modal = document.getElementById('commandPalette');
    this.input = document.getElementById('commandPaletteInput');
    this.results = document.getElementById('commandPaletteResults');
    this.selectedIndex = 0;
    this.filteredCommands = [];

    this.commands = [];
    this.setupEventListeners();
    i18n.onChange(() => this.updateLocale());
  }

  registerCommands(commands) {
    this.commands = commands;
    if (this.modal && !this.modal.classList.contains('hidden')) {
      this.filterCommands(this.input.value || '', { preserveSelection: true });
    }
  }

  setupEventListeners() {
    // Input change
    this.input.addEventListener('input', (e) => {
      this.filterCommands(e.target.value);
    });

    // Keyboard navigation
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = Math.min(this.filteredCommands.length - 1, this.selectedIndex + 1);
        this.render();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        this.render();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.filteredCommands[this.selectedIndex]) {
          this.executeCommand(this.filteredCommands[this.selectedIndex]);
        }
      }
    });

    // Click outside to close
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal || e.target.classList.contains('modal-backdrop')) {
        this.hide();
      }
    });
  }

  show() {
    this.modal.classList.remove('hidden');
    this.input.value = '';
    this.input.focus();
    this.filterCommands('');
  }

  hide() {
    this.modal.classList.add('hidden');
  }

  filterCommands(query, options = {}) {
    const { preserveSelection = false } = options;
    const previousCommand = preserveSelection ? this.filteredCommands[this.selectedIndex] : null;
    const lower = (query || '').toLowerCase();
    this.filteredCommands = this.commands.filter(cmd => {
      const name = this.getCommandName(cmd).toLowerCase();
      const desc = this.getCommandDescription(cmd).toLowerCase();
      const tagMatch = cmd.tags && cmd.tags.some(tag => tag.toLowerCase().includes(lower));
      return name.includes(lower) || desc.includes(lower) || tagMatch;
    });
    if (preserveSelection && previousCommand) {
      const newIndex = this.filteredCommands.findIndex(cmd => cmd.id === previousCommand.id);
      this.selectedIndex = newIndex >= 0 ? newIndex : 0;
    } else {
      this.selectedIndex = 0;
    }
    this.render();
  }

  render() {
    this.results.innerHTML = '';

    if (this.filteredCommands.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'command-palette-empty';
      empty.textContent = i18n.t('commandPalette.empty', 'No commands found');
      this.results.appendChild(empty);
      return;
    }

    this.filteredCommands.forEach((cmd, index) => {
      const name = this.getCommandName(cmd);
      const desc = this.getCommandDescription(cmd);
      const item = document.createElement('div');
      item.className = 'command-palette-item' + (index === this.selectedIndex ? ' selected' : '');

      item.innerHTML = `
        <div class="command-icon">${cmd.icon || '⚡'}</div>
        <div class="command-details">
          <div class="command-name">${name}</div>
          <div class="command-description">${desc}</div>
        </div>
        ${cmd.shortcut ? `<div class="command-shortcut"><kbd>${cmd.shortcut}</kbd></div>` : ''}
      `;

      item.onclick = () => this.executeCommand(cmd);

      this.results.appendChild(item);
    });

    // Scroll selected item into view
    const selectedItem = this.results.children[this.selectedIndex];
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  executeCommand(cmd) {
    if (cmd && cmd.action) {
      cmd.action();
      this.hide();
    }
  }

  updateLocale() {
    // Reapply filter so rendered text uses latest translations
    this.filterCommands(this.input.value || '', { preserveSelection: true });
  }

  getCommandName(cmd) {
    if (cmd.nameKey) {
      return i18n.t(cmd.nameKey, cmd.name || '');
    }
    return cmd.name || '';
  }

  getCommandDescription(cmd) {
    if (cmd.descriptionKey) {
      return i18n.t(cmd.descriptionKey, cmd.description || '');
    }
    return cmd.description || '';
  }
}

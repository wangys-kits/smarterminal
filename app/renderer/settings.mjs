/* Settings Page Logic */

import i18n from './i18n.mjs';

class SettingsManager {
  constructor() {
    this.currentTheme = this.detectTheme();
    this.init();
  }

  init() {
    // Initialize theme
    this.applyTheme(this.currentTheme);

    // Apply saved font settings on startup
    this.applySavedFontSettings();

    // Setup event listeners
    this.setupLanguageListeners();
    this.setupThemeListeners();
    this.setupNavigationListeners();
    this.setupFontListeners();
    this.setupTransfersListeners();

    // Set initial values
    this.updateLanguageSelection();
    this.updateThemeSelection();
    this.loadFontSettings();
    this.loadTransfersSettings();

    // Listen for system theme changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (this.currentTheme === 'system') {
          this.applyTheme('system');
        }
      });
    }
  }

  detectTheme() {
    const saved = localStorage.getItem('smarterminal_theme');
    return saved || 'system';
  }

  setupLanguageListeners() {
    document.querySelectorAll('input[name="language"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const locale = e.target.value;
        i18n.setLocale(locale);
        this.updateUI();
      });
    });
  }

  setupThemeListeners() {
    document.querySelectorAll('input[name="theme"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const theme = e.target.value;
        this.setTheme(theme);
      });
    });
  }

  setupNavigationListeners() {
    const settingsBtn = document.getElementById('homeSettingsBtn');
    const backBtn = document.getElementById('settingsBackBtn');
    const homeView = document.getElementById('homeView');
    const settingsView = document.getElementById('settingsView');
    const allConversationsView = document.getElementById('allConversationsView');
    const recycleBinView = document.getElementById('recycleBinView');
    const workspaceView = document.getElementById('split');
    const appTitle = document.querySelector('.app-title');

    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        homeView?.classList.add('hidden');
        allConversationsView?.classList.add('hidden');
        recycleBinView?.classList.add('hidden');
        workspaceView?.classList.add('hidden');
        settingsView?.classList.remove('hidden');
      });
    }

    if (backBtn) {
      backBtn.addEventListener('click', () => {
        settingsView?.classList.add('hidden');
        homeView?.classList.remove('hidden');
      });
    }

    // Close settings when clicking app logo
    if (appTitle) {
      appTitle.addEventListener('click', () => {
        if (settingsView && !settingsView.classList.contains('hidden')) {
          settingsView.classList.add('hidden');
          homeView?.classList.remove('hidden');
        }
        if (allConversationsView && !allConversationsView.classList.contains('hidden')) {
          allConversationsView.classList.add('hidden');
          homeView?.classList.remove('hidden');
        }
        if (recycleBinView && !recycleBinView.classList.contains('hidden')) {
          recycleBinView.classList.add('hidden');
          homeView?.classList.remove('hidden');
        }
      });
    }
  }

  setTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('smarterminal_theme', theme);
    this.applyTheme(theme);
    this.updateThemeSelection();
  }

  applyTheme(theme) {
    const root = document.documentElement;

    let effectiveTheme = theme;
    if (theme === 'system') {
      effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    root.setAttribute('data-theme', effectiveTheme);
  }

  updateLanguageSelection() {
    const currentLocale = i18n.currentLocale;
    document.querySelectorAll('input[name="language"]').forEach(radio => {
      radio.checked = radio.value === currentLocale;
    });
  }

  updateThemeSelection() {
    document.querySelectorAll('input[name="theme"]').forEach(radio => {
      radio.checked = radio.value === this.currentTheme;
    });
  }

  updateUI() {
    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = i18n.t(key);
    });
  }

  setupFontListeners() {
    const applyBtn = document.getElementById('applyFontBtn');
    const resetBtn = document.getElementById('resetFontBtn');

    // Setup spinner buttons
    document.querySelectorAll('.settings-spinner-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (!input) return;

        const min = parseInt(input.getAttribute('min')) || 10;
        const max = parseInt(input.getAttribute('max')) || 24;
        let value = parseInt(input.value) || 14;

        if (btn.classList.contains('settings-spinner-up')) {
          value = Math.min(max, value + 1);
        } else if (btn.classList.contains('settings-spinner-down')) {
          value = Math.max(min, value - 1);
        }

        input.value = value;

        // Update button states
        this.updateSpinnerButtonStates(input);
      });
    });

    // Setup input change listeners to update button states
    const commandFontSize = document.getElementById('commandFontSize');
    const outputFontSize = document.getElementById('outputFontSize');

    if (commandFontSize) {
      commandFontSize.addEventListener('input', () => {
        this.updateSpinnerButtonStates(commandFontSize);
      });
      this.updateSpinnerButtonStates(commandFontSize);
    }

    if (outputFontSize) {
      outputFontSize.addEventListener('input', () => {
        this.updateSpinnerButtonStates(outputFontSize);
      });
      this.updateSpinnerButtonStates(outputFontSize);
    }

    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        this.applyFontSettings();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.resetFontSettings();
      });
    }
  }

  updateSpinnerButtonStates(input) {
    const targetId = input.id;
    const min = parseInt(input.getAttribute('min')) || 10;
    const max = parseInt(input.getAttribute('max')) || 24;
    const value = parseInt(input.value) || 14;

    const upBtn = document.querySelector(`.settings-spinner-up[data-target="${targetId}"]`);
    const downBtn = document.querySelector(`.settings-spinner-down[data-target="${targetId}"]`);

    if (upBtn) {
      upBtn.disabled = value >= max;
    }
    if (downBtn) {
      downBtn.disabled = value <= min;
    }
  }

  loadFontSettings() {
    const settings = this.getFontSettings();

    const commandFontSize = document.getElementById('commandFontSize');
    const commandFontColor = document.getElementById('commandFontColor');
    const outputFontSize = document.getElementById('outputFontSize');
    const outputFontColor = document.getElementById('outputFontColor');

    if (commandFontSize) {
      commandFontSize.value = settings.commandFontSize;
      this.updateSpinnerButtonStates(commandFontSize);
    }
    if (commandFontColor) commandFontColor.value = settings.commandFontColor;
    if (outputFontSize) {
      outputFontSize.value = settings.outputFontSize;
      this.updateSpinnerButtonStates(outputFontSize);
    }
    if (outputFontColor) outputFontColor.value = settings.outputFontColor;
  }

  getFontSettings() {
    return {
      commandFontSize: localStorage.getItem('smarterminal_commandFontSize') || '14',
      commandFontColor: localStorage.getItem('smarterminal_commandFontColor') || '#e8eaed',
      outputFontSize: localStorage.getItem('smarterminal_outputFontSize') || '13',
      outputFontColor: localStorage.getItem('smarterminal_outputFontColor') || '#c5c8c6'
    };
  }

  applyFontSettings() {
    const commandFontSize = document.getElementById('commandFontSize').value;
    const commandFontColor = document.getElementById('commandFontColor').value;
    const outputFontSize = document.getElementById('outputFontSize').value;
    const outputFontColor = document.getElementById('outputFontColor').value;

    // Save to localStorage
    localStorage.setItem('smarterminal_commandFontSize', commandFontSize);
    localStorage.setItem('smarterminal_commandFontColor', commandFontColor);
    localStorage.setItem('smarterminal_outputFontSize', outputFontSize);
    localStorage.setItem('smarterminal_outputFontColor', outputFontColor);

    // Apply to CSS custom properties
    const root = document.documentElement;
    root.style.setProperty('--command-font-size', `${commandFontSize}px`);
    root.style.setProperty('--command-font-color', commandFontColor);
    root.style.setProperty('--output-font-size', `${outputFontSize}px`);
    root.style.setProperty('--output-font-color', outputFontColor);

    // Show feedback
    this.showFontAppliedFeedback();
  }

  resetFontSettings() {
    // Reset to defaults
    const defaults = {
      commandFontSize: '14',
      commandFontColor: '#e8eaed',
      outputFontSize: '13',
      outputFontColor: '#c5c8c6'
    };

    // Update inputs
    const commandFontSize = document.getElementById('commandFontSize');
    const outputFontSize = document.getElementById('outputFontSize');

    commandFontSize.value = defaults.commandFontSize;
    document.getElementById('commandFontColor').value = defaults.commandFontColor;
    outputFontSize.value = defaults.outputFontSize;
    document.getElementById('outputFontColor').value = defaults.outputFontColor;

    // Update spinner button states
    this.updateSpinnerButtonStates(commandFontSize);
    this.updateSpinnerButtonStates(outputFontSize);

    // Remove from localStorage
    localStorage.removeItem('smarterminal_commandFontSize');
    localStorage.removeItem('smarterminal_commandFontColor');
    localStorage.removeItem('smarterminal_outputFontSize');
    localStorage.removeItem('smarterminal_outputFontColor');

    // Apply defaults
    const root = document.documentElement;
    root.style.setProperty('--command-font-size', `${defaults.commandFontSize}px`);
    root.style.setProperty('--command-font-color', defaults.commandFontColor);
    root.style.setProperty('--output-font-size', `${defaults.outputFontSize}px`);
    root.style.setProperty('--output-font-color', defaults.outputFontColor);

    // Show feedback
    this.showFontResetFeedback();
  }

  showFontAppliedFeedback() {
    const applyBtn = document.getElementById('applyFontBtn');
    if (applyBtn) {
      const originalText = applyBtn.textContent;
      const feedbackText = i18n.currentLocale === 'zh-CN' ? '✓ 已应用' : '✓ Applied';
      applyBtn.textContent = feedbackText;
      applyBtn.disabled = true;
      setTimeout(() => {
        applyBtn.textContent = originalText;
        applyBtn.disabled = false;
      }, 1500);
    }
  }

  showFontResetFeedback() {
    const resetBtn = document.getElementById('resetFontBtn');
    if (resetBtn) {
      const originalText = resetBtn.textContent;
      const feedbackText = i18n.currentLocale === 'zh-CN' ? '✓ 已重置' : '✓ Reset';
      resetBtn.textContent = feedbackText;
      resetBtn.disabled = true;
      setTimeout(() => {
        resetBtn.textContent = originalText;
        resetBtn.disabled = false;
      }, 1500);
    }
  }

  applySavedFontSettings() {
    const settings = this.getFontSettings();
    const root = document.documentElement;

    // Apply saved font settings to CSS custom properties
    root.style.setProperty('--command-font-size', `${settings.commandFontSize}px`);
    root.style.setProperty('--command-font-color', settings.commandFontColor);
    root.style.setProperty('--output-font-size', `${settings.outputFontSize}px`);
    root.style.setProperty('--output-font-color', settings.outputFontColor);
  }

  // ---------------- Transfers (Downloads dir) ----------------
  async loadTransfersSettings() {
    try {
      const res = await window.sm.settings.get();
      const dir = res?.ok ? (res.data?.downloadsDir || '') : '';
      const input = document.getElementById('downloadsDirInput');
      if (input) input.value = dir;
    } catch (err) {
      console.warn('[settings] Failed to load downloadsDir:', err);
    }
  }

  setupTransfersListeners() {
    const chooseBtn = document.getElementById('chooseDownloadsDirBtn');
    const saveBtn = document.getElementById('saveTransfersBtn');
    const resetBtn = document.getElementById('resetDownloadsDirBtn');
    const input = document.getElementById('downloadsDirInput');

    if (chooseBtn) {
      chooseBtn.addEventListener('click', async () => {
        try {
          const current = input?.value || '';
          const picked = await window.sm.dialog.openDirectory({ defaultPath: current || undefined });
          if (picked?.ok && picked.data) {
            if (input) input.value = picked.data;
          }
        } catch (err) {
          console.warn('[settings] choose downloads dir failed:', err);
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        try {
          const value = input?.value?.trim();
          if (!value) return;
          const res = await window.sm.settings.set({ downloadsDir: value });
          // quick feedback
          const original = saveBtn.textContent;
          saveBtn.textContent = (i18n.currentLocale === 'zh-CN' ? '✓ 已保存' : '✓ Saved');
          saveBtn.disabled = true;
          setTimeout(() => { saveBtn.textContent = original; saveBtn.disabled = false; }, 1200);
        } catch (err) {
          console.error('[settings] save downloadsDir failed:', err);
          alert('保存失败：' + (err?.message || err));
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        try {
          // Query system default downloads directory
          const res = await window.sm.app.getDownloadsDir();
          const dir = res?.ok && res.data ? res.data : '';
          if (input) input.value = dir;
        } catch (err) {
          console.warn('[settings] reset downloads dir failed:', err);
        }
      });
    }
  }
}

// Initialize settings when DOM is ready
let settingsManager;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    settingsManager = new SettingsManager();
  });
} else {
  settingsManager = new SettingsManager();
}

export default SettingsManager;

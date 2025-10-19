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

    // Setup event listeners
    this.setupLanguageListeners();
    this.setupThemeListeners();
    this.setupNavigationListeners();

    // Set initial values
    this.updateLanguageSelection();
    this.updateThemeSelection();

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
    const appTitle = document.querySelector('.app-title');

    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        homeView?.classList.add('hidden');
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

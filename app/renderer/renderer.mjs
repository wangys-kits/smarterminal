/* Renderer bootstrap: tabs, xterm, split, file listing (ESM) */
// Note: xterm.js uses UMD format, Terminal is available on window object after loading
const Terminal = window.Terminal;
import { ChatTerminal, INTERACTIVE_SENTINEL } from './chat-terminal.mjs';
import { MarkdownRenderer } from './chat-terminal-markdown.mjs';
import i18n from './i18n.mjs';
import './settings.mjs';

const sm = window.sm;
const markdownRenderer = new MarkdownRenderer();

// DOM
const tabsEl = document.getElementById('tabs');
const termEl = document.getElementById('term');
const chatContainer = document.getElementById('chatContainer');
const chatMessages = document.getElementById('chatMessages');
const chatTitle = document.getElementById('chatTitle');
const chatTitleDisplay = document.getElementById('chatTitleDisplay');
const chatTitleText = document.getElementById('chatTitleText');
const chatTitleHint = document.getElementById('chatTitleHint');
const chatTitleEditor = document.getElementById('chatTitleEditor');
const chatTitleInput = document.getElementById('chatTitleInput');
const chatDescription = document.getElementById('chatDescription');
const chatDescriptionBody = document.getElementById('chatDescriptionBody');
const chatDescriptionEmpty = document.getElementById('chatDescriptionEmpty');
const chatDescriptionEditor = document.getElementById('chatDescriptionEditor');
const chatDescriptionInput = document.getElementById('chatDescriptionInput');
const chatDescriptionTitleEl = document.getElementById('chatDescriptionTitle');
const chatDescriptionHint = document.getElementById('chatDescriptionHint');
const scrollControls = document.getElementById('chatScrollControls');
const scrollToTopBtn = document.getElementById('scrollToTopBtn');
const scrollToBottomBtn = document.getElementById('scrollToBottomBtn');
const commandInput = document.getElementById('commandInput');
const commandInputWrapper = document.querySelector('.command-input-wrapper');
const chatContextMenu = document.getElementById('chatContextMenu');
const txCloseBtn = document.getElementById('txCloseBtn');
const homeView = document.getElementById('homeView');
const workspaceView = document.getElementById('split');
const appTitle = document.querySelector('.app-title');
const homeFavoritesList = document.getElementById('homeFavoritesList');
const homeFavoritesEmpty = document.getElementById('homeFavoritesEmpty');
const homeAllList = document.getElementById('homeAllList');
const homeAllEmpty = document.getElementById('homeAllEmpty');
const homeFavoritesIndicators = document.getElementById('homeFavoritesIndicators');
const homeAllIndicators = document.getElementById('homeAllIndicators');
const homeRecycleList = document.getElementById('homeRecycleList');
const homeRecycleEmpty = document.getElementById('homeRecycleEmpty');
const homeRecycleClearBtn = document.getElementById('homeRecycleClear');
const homeRecycleIndicators = document.getElementById('homeRecycleIndicators');
const homeNewTabButtons = document.querySelectorAll('[data-action="new-tab"]');
const homeScrollButtons = document.querySelectorAll('[data-scroll-target]');
const confirmModal = document.getElementById('confirmModal');
const confirmModalTitle = document.getElementById('confirmModalTitle');
const confirmModalMessage = document.getElementById('confirmModalMessage');
const confirmModalCancel = document.getElementById('confirmModalCancel');
const confirmModalOk = document.getElementById('confirmModalOk');

function getDefaultTabTitle() {
  return i18n.t('tab.untitled', '未命名');
}

function getDefaultTabTitleDisplay() {
  return i18n.t('tab.untitledDisplay', '未命名对话');
}

function getChatTitleHintText() {
  return i18n.t('chat.title.hint', '双击重命名 • Enter 保存');
}

function getChatDescriptionHintText() {
  return i18n.t('chat.description.hint', '双击编辑 • Shift+Enter 保存');
}

function getChatDescriptionEmptyText() {
  return i18n.t('chat.description.empty', '暂无说明，双击此处添加。');
}

function getChatDescriptionPlaceholder() {
  return i18n.t('chat.description.placeholder', '使用 Markdown 描述这个对话的目的、上下文或使用方式...');
}

function getChatTitlePlaceholder() {
  return i18n.t('chat.title.placeholder', '输入对话名称');
}

function getConfirmDefaultMessage() {
  return i18n.t('modal.confirm.defaultMessage', '确定要执行此操作吗？');
}

function applyLocaleText() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    if (!el.dataset.i18nOriginal) {
      el.dataset.i18nOriginal = el.textContent || '';
    }
    el.textContent = i18n.t(key, el.dataset.i18nOriginal);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key) return;
    if (!el.dataset.i18nPlaceholderOriginal) {
      el.dataset.i18nPlaceholderOriginal = el.getAttribute('placeholder') || '';
    }
    const translated = i18n.t(key, el.dataset.i18nPlaceholderOriginal);
    if ('placeholder' in el) {
      el.placeholder = translated;
    } else {
      el.setAttribute('placeholder', translated);
    }
  });

  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (!key) return;
    if (!el.dataset.i18nTitleOriginal) {
      el.dataset.i18nTitleOriginal = el.getAttribute('title') || '';
    }
    const translated = i18n.t(key, el.dataset.i18nTitleOriginal);
    el.setAttribute('title', translated);
  });
}

function applyLocaleTextAndRefresh() {
  applyLocaleText();
  renderTitleForTab(getActiveTab());
  renderDescriptionForTab(getActiveTab());
  renderHome();
}

if (appTitle) {
  appTitle.addEventListener('click', () => showHome());
}

homeNewTabButtons.forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    addNewTab();
  });
});

homeScrollButtons.forEach((button) => {
  button.addEventListener('click', (event) => {
    const targetSelector = button.getAttribute('data-scroll-target');
    if (!targetSelector) return;
    const target = document.querySelector(targetSelector);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

if (homeRecycleClearBtn) {
  homeRecycleClearBtn.addEventListener('click', async () => {
    const confirmed = await requestConfirmation({
      title: i18n.t('home.recycle.confirmTitle', '清空回收站'),
      message: i18n.t('home.recycle.confirmMessage', '确定要清空回收站吗？此操作无法撤销。'),
      confirmText: i18n.t('home.recycle.confirmAction', '清空'),
      cancelText: i18n.t('modal.confirm.cancel', '取消')
    });
    if (!confirmed) return;
    try {
      const trashItems = state.savedTabs.filter(tab => tab.deleted);
      for (const item of trashItems) {
        await sm.tabs.remove({ fileName: item.fileName });
      }
      state.savedTabs = state.savedTabs.filter(tab => !tab.deleted);
      pagination.recycle = 0;
      renderHome();
      scheduleScrollUpdate();
    } catch (err) {
      console.error('[recycle] Failed to clear recycle bin:', err);
      alert('清空回收站失败：' + (err?.message || err));
    }
  });
}


if (chatTitle) {
  chatTitle.addEventListener('dblclick', () => enterTitleEditMode());
}
if (chatTitleInput) {
  chatTitleInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveTitleChanges().catch((err) => console.error('[title] Save failed:', err));
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      exitTitleEditMode({ discard: true });
    }
  });
  chatTitleInput.addEventListener('blur', () => {
    if (isEditingTitle) {
      exitTitleEditMode({ discard: true });
    }
  });
}

if (chatDescription) {
  chatDescription.addEventListener('dblclick', (event) => {
    event.stopPropagation();
    enterDescriptionEditMode();
  });
}
if (chatDescriptionBody) {
  chatDescriptionBody.addEventListener('dblclick', (event) => {
    event.stopPropagation();
    enterDescriptionEditMode();
  });
}
if (chatDescriptionEmpty) {
  chatDescriptionEmpty.addEventListener('dblclick', (event) => {
    event.stopPropagation();
    enterDescriptionEditMode();
  });
}
if (chatDescriptionInput) {
  chatDescriptionInput.addEventListener('keydown', (event) => {
    const isSaveCombo = event.key === 'Enter' && event.shiftKey;
    if (isSaveCombo) {
      event.preventDefault();
      saveDescriptionChanges().catch((err) => console.error('[description] Save failed:', err));
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      exitDescriptionEditMode({ discard: true });
    }
  });
  chatDescriptionInput.addEventListener('blur', () => {
    if (isEditingDescription) {
      exitDescriptionEditMode({ discard: true });
    }
  });
}

if (scrollToTopBtn) {
  scrollToTopBtn.addEventListener('click', () => smoothScrollTo(chatContainer, 0));
}
if (scrollToBottomBtn) {
  scrollToBottomBtn.addEventListener('click', () => smoothScrollTo(chatContainer, chatContainer.scrollHeight));
}
if (chatContainer) {
  chatContainer.addEventListener('scroll', () => updateScrollControlsVisibility());
}

let state = {
  splitRatio: 0.5, // Changed from 0.6 to 0.5 for more balanced split (50/50)
  tabs: [], // {id,title,fileName,ptyId,cwd,term,chatTerm,write,resize,saveTimer}
  activeId: null,
  useChatMode: true, // Changed to true for default chat mode
  showHome: true,
  savedTabs: []
};
let selection = new Set();
let sessionState = {};
let sessionSaveTimer = null;
let isEditingDescription = false;
let isEditingTitle = false;
let scrollState = {
  atTop: true,
  atBottom: true
};

const TAB_SAVE_DELAY = 250;
const SESSION_SAVE_DELAY = 250;
const HOME_PREVIEW_LIMIT = 4;
const SCROLL_EDGE_THRESHOLD = 16;
const HOME_PAGE_SIZE = 6;
const HOME_SWIPE_THRESHOLD = 30;
const HOME_PAGE_COOLDOWN = 420;
const pagination = {
  favorites: 0,
  all: 0,
  recycle: 0
};
const pagerIndicators = {
  favorites: homeFavoritesIndicators,
  all: homeAllIndicators,
  recycle: homeRecycleIndicators
};
const pagerSwipeTargets = {
  favorites: homeFavoritesList,
  all: homeAllList,
  recycle: homeRecycleList
};
const pageChangeTimestamps = {
  favorites: 0,
  all: 0,
  recycle: 0
};
const HOME_ICONS = {
  favoriteFilled: '<svg class="home-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
  favoriteOutline: '<svg class="home-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M12 3.5l2.2 4.81 5.3.46-4.06 3.52 1.25 5.16L12 14.9l-4.69 2.55 1.25-5.16-4.06-3.52 5.3-.46z"/></svg>',
  open: '<svg class="home-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M8 5h11v11M19 5l-9.5 9.5M13 5H5v14h14 v-8"/></svg>',
  delete: '<svg class="home-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M7 7l10 10M17 7L7 17"/></svg>',
  restore: '<svg class="home-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M12 5a7 7 0 017 7m0 0h-3m3 0-2.5-2.5M12 19a7 7 0 01-7-7m0 0h3M5 12l2.5 2.5"/></svg>'
};

function setFavoriteButtonVisual(button, isFavorite) {
  if (!button) return;
  const active = Boolean(isFavorite);
  button.classList.toggle('is-active', active);
  button.innerHTML = active ? HOME_ICONS.favoriteFilled : HOME_ICONS.favoriteOutline;
  const label = active
    ? i18n.t('home.favorite.remove', '取消收藏')
    : i18n.t('home.favorite.add', '设为收藏');
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function setFavoriteIndicatorVisual(element, isFavorite) {
  if (!element) return;
  const active = Boolean(isFavorite);
  element.classList.toggle('is-active', active);
  element.textContent = active ? '★' : '☆';
}

attachPagerSwipe(pagerSwipeTargets.favorites, 'favorites');
attachPagerSwipe(pagerSwipeTargets.all, 'all');
attachPagerSwipe(pagerSwipeTargets.recycle, 'recycle');

async function requestConfirmation(options = {}) {
  const message = typeof options.message === 'string'
    ? options.message
    : getConfirmDefaultMessage();
  const title = typeof options.title === 'string'
    ? options.title
    : i18n.t('modal.confirm.title', '请确认');
  const confirmLabel = typeof options.confirmText === 'string'
    ? options.confirmText
    : i18n.t('modal.confirm.ok', '确定');
  const cancelLabel = typeof options.cancelText === 'string'
    ? options.cancelText
    : i18n.t('modal.confirm.cancel', '取消');

  if (!confirmModal || !confirmModalOk || !confirmModalCancel || !confirmModalTitle || !confirmModalMessage) {
    return Promise.resolve(window.confirm(message));
  }

  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const backdrop = confirmModal.querySelector('.modal-backdrop');
    const dialog = confirmModal.querySelector('.modal-dialog');

    const cleanup = () => {
      confirmModal.classList.add('hidden');
      confirmModalOk.removeEventListener('click', handleConfirm);
      confirmModalCancel.removeEventListener('click', handleCancel);
      if (backdrop) backdrop.removeEventListener('click', handleCancel);
      document.removeEventListener('keydown', handleKeydown, true);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };

    const settle = (result) => {
      cleanup();
      resolve(result);
    };

    const handleConfirm = (event) => {
      event.preventDefault();
      settle(true);
    };

    const handleCancel = (event) => {
      event.preventDefault();
      settle(false);
    };

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        settle(false);
      } else if (event.key === 'Enter') {
        const tag = event.target?.tagName;
        if (tag !== 'TEXTAREA' && tag !== 'A') {
          event.preventDefault();
          settle(true);
        }
      } else if (event.key === 'Tab' && dialog) {
        // Trap focus inside dialog
        const focusable = dialog.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
        const focusableItems = Array.from(focusable).filter(el => el instanceof HTMLElement && !el.hasAttribute('disabled') && !el.classList.contains('hidden'));
        if (focusableItems.length === 0) return;
        const first = focusableItems[0];
        const last = focusableItems[focusableItems.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    confirmModalTitle.textContent = title;
    confirmModalMessage.textContent = message;
    confirmModalOk.textContent = confirmLabel;
    confirmModalCancel.textContent = cancelLabel;

    confirmModal.classList.remove('hidden');
    window.requestAnimationFrame(() => confirmModalOk.focus());

    confirmModalOk.addEventListener('click', handleConfirm);
    confirmModalCancel.addEventListener('click', handleCancel);
    if (backdrop) backdrop.addEventListener('click', handleCancel);
    document.addEventListener('keydown', handleKeydown, true);
  });
}

function smoothScrollTo(container, top) {
  if (!container) return;
  container.scrollTo({ top, behavior: 'smooth' });
}

function attachPagerSwipe(container, key) {
  if (!container || !pagination.hasOwnProperty(key)) return;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let startScrollTop = 0;

  const resetPointer = () => {
    pointerId = null;
    startX = 0;
    startY = 0;
    startScrollTop = 0;
  };

  const handlePointerEnd = (event) => {
    if (pointerId === null || event.pointerId !== pointerId) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    try {
      container.releasePointerCapture(pointerId);
    } catch (_) {
      // ignore
    }
    resetPointer();
    if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
    if (Math.abs(deltaX) < HOME_SWIPE_THRESHOLD) return;
    changePage(key, deltaX < 0 ? 1 : -1);
  };

  container.addEventListener('pointerdown', (event) => {
    if (event.target?.closest('.home-card-actions, .home-card-delete, .home-card')) {
      return;
    }
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startScrollTop = container.scrollTop;
    try {
      container.setPointerCapture(pointerId);
    } catch (_) {
      // ignore
    }
  });

  container.addEventListener('pointerup', handlePointerEnd);
  container.addEventListener('pointercancel', handlePointerEnd);
  container.addEventListener('pointerleave', (event) => {
    if (pointerId === null || event.pointerId !== pointerId) return;
    if (Math.abs(container.scrollTop - startScrollTop) > 12) {
      resetPointer();
      return;
    }
    try {
      container.releasePointerCapture(pointerId);
    } catch (_) {
      // ignore
    }
    resetPointer();
  });

  const wheelHandler = (event) => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    if (Math.abs(event.deltaX) < HOME_SWIPE_THRESHOLD) return;
    const changed = changePage(key, event.deltaX > 0 ? 1 : -1);
    if (changed) {
      event.preventDefault();
    }
  };

  try {
    container.addEventListener('wheel', wheelHandler, { passive: false });
  } catch (_) {
    container.addEventListener('wheel', wheelHandler);
  }
}

function updateScrollControlsVisibility() {
  if (!scrollControls || !chatContainer) return;

  const hasActiveTab = !state.showHome && Boolean(getActiveTab()) && !isEditingDescription;
  const availableScroll = chatContainer.scrollHeight - chatContainer.clientHeight;

  if (!hasActiveTab || availableScroll <= SCROLL_EDGE_THRESHOLD) {
    scrollControls.classList.add('hidden');
    scrollState.atTop = true;
    scrollState.atBottom = true;
    if (scrollToTopBtn) scrollToTopBtn.classList.add('disabled');
    if (scrollToBottomBtn) scrollToBottomBtn.classList.add('disabled');
    return;
  }

  const atTop = chatContainer.scrollTop <= SCROLL_EDGE_THRESHOLD;
  const atBottom = chatContainer.scrollTop >= availableScroll - SCROLL_EDGE_THRESHOLD;

  scrollControls.classList.remove('hidden');
  if (scrollToTopBtn) scrollToTopBtn.classList.toggle('disabled', atTop);
  if (scrollToBottomBtn) scrollToBottomBtn.classList.toggle('disabled', atBottom);
  scrollState = { atTop, atBottom };
}

function scheduleScrollUpdate() {
  if (typeof window === 'undefined') return;
  window.requestAnimationFrame(() => updateScrollControlsVisibility());
}

function getItemsForKey(key) {
  const saved = Array.isArray(state.savedTabs) ? state.savedTabs : [];
  switch (key) {
    case 'favorites':
      return saved.filter(tab => !tab.deleted && tab.favorite);
    case 'all':
      return saved.filter(tab => !tab.deleted);
    case 'recycle':
      return saved.filter(tab => tab.deleted);
    default:
      return [];
  }
}

function ensurePaginationBounds(key, count) {
  if (!pagination.hasOwnProperty(key)) return 0;
  const totalPages = count === 0 ? 0 : Math.ceil(count / HOME_PAGE_SIZE);
  if (totalPages === 0) {
    pagination[key] = 0;
  } else if (pagination[key] >= totalPages) {
    pagination[key] = totalPages - 1;
  } else if (pagination[key] < 0) {
    pagination[key] = 0;
  }
  return totalPages;
}

function updatePagerIndicators(key, totalPages) {
  const container = pagerIndicators[key];
  if (!container) return;
  const current = pagination[key];
  container.innerHTML = '';
  if (!totalPages || totalPages <= 1) {
    container.classList?.add('hidden');
    return;
  }
  container.classList?.remove('hidden');
  for (let i = 0; i < totalPages; i += 1) {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'home-page-indicator';
    if (i === current) {
      dot.classList.add('active');
      dot.setAttribute('aria-current', 'true');
    }
    dot.setAttribute('aria-label', `第 ${i + 1} 页`);
    dot.addEventListener('click', () => setPage(key, i, { enforceCooldown: false }));
    container.appendChild(dot);
  }
}

function triggerPageAnimation(key, direction) {
  const target = pagerSwipeTargets[key];
  if (!target) return;
  target.dataset.pageDirection = direction === 'prev' ? 'prev' : 'next';
  target.classList.remove('home-page-transition');
  void target.offsetWidth; // force repaint
  target.classList.add('home-page-transition');
  setTimeout(() => {
    target.classList.remove('home-page-transition');
  }, HOME_PAGE_COOLDOWN);
}

function changePage(key, delta) {
  if (!pagination.hasOwnProperty(key)) return false;
  return setPage(key, pagination[key] + delta, { enforceCooldown: true });
}

function setPage(key, page, options = {}) {
  if (!pagination.hasOwnProperty(key)) return;
  const { enforceCooldown = false } = options;
  const now = Date.now();
  if (enforceCooldown && now - pageChangeTimestamps[key] < HOME_PAGE_COOLDOWN) {
    return false;
  }
  const previous = pagination[key];
  const items = getItemsForKey(key);
  const totalPages = items.length === 0 ? 0 : Math.ceil(items.length / HOME_PAGE_SIZE);
  if (totalPages <= 1) return false;
  const bounded = Math.max(0, Math.min(totalPages - 1, page));
  if (bounded === previous) return false;
  pagination[key] = bounded;
  pageChangeTimestamps[key] = now;
  renderHome();
  const direction = bounded > previous ? 'next' : 'prev';
  triggerPageAnimation(key, direction);
  return true;
}

function renderMarkdownFragment(markdown) {
  if (typeof markdown !== 'string') return '';
  const trimmed = markdown.trim();
  if (!trimmed) return '';
  try {
    return markdownRenderer.renderMarkdown(trimmed);
  } catch (err) {
    console.error('[markdown] Failed to render description:', err);
    const fallback = document.createElement('div');
    fallback.textContent = trimmed;
    return fallback.innerHTML;
  }
}

function sanitizeTabTitle(title) {
  if (typeof title !== 'string') return getDefaultTabTitle();
  const trimmed = title.trim();
  if (!trimmed) return getDefaultTabTitle();
  // Limit to 50 characters
  return trimmed.length > 50 ? trimmed.substring(0, 50) : trimmed;
}

function updateSavedTabMeta(fileName, patch = {}) {
  if (!fileName) return;
  if (!Array.isArray(state.savedTabs)) {
    state.savedTabs = [];
  }
  let entry = state.savedTabs.find(item => item.fileName === fileName);
  if (!entry) {
    entry = {
      fileName,
      title: patch.title || 'Chat',
      favorite: typeof patch.favorite === 'boolean' ? patch.favorite : false,
      description: typeof patch.description === 'string' ? patch.description : '',
      customTitle: typeof patch.customTitle === 'boolean' ? patch.customTitle : false,
      deleted: Boolean(patch.deleted),
      deletedAt: patch.deletedAt || null,
      state: patch.state ?? null,
      createdAt: patch.createdAt || Date.now(),
      updatedAt: patch.updatedAt || Date.now()
    };
    state.savedTabs.push(entry);
  } else {
    if ('title' in patch) entry.title = patch.title;
    if ('favorite' in patch) entry.favorite = Boolean(patch.favorite);
    if ('description' in patch) entry.description = typeof patch.description === 'string' ? patch.description : '';
    if ('customTitle' in patch) entry.customTitle = Boolean(patch.customTitle);
    if ('deleted' in patch) entry.deleted = Boolean(patch.deleted);
    if ('deletedAt' in patch) entry.deletedAt = patch.deletedAt || null;
    if ('state' in patch) entry.state = patch.state ?? null;
    if ('createdAt' in patch) entry.createdAt = patch.createdAt;
    if ('updatedAt' in patch) entry.updatedAt = patch.updatedAt;
    if (typeof entry.description !== 'string') {
      entry.description = '';
    }
    if (typeof entry.customTitle !== 'boolean') {
      entry.customTitle = false;
    }
  }
}

function getActiveTab() {
  return state.tabs.find(x => x.id === state.activeId) || null;
}

async function persistTab(tab) {
  if (!tab?.fileName || !tab?.chatTerm) return false;
  try {
    const serialized = tab.chatTerm.serializeState();
    const res = await sm.tabs.save({
      fileName: tab.fileName,
      title: tab.title,
      state: serialized,
      favorite: tab.favorite,
      description: typeof tab.description === 'string' ? tab.description : '',
      customTitle: Boolean(tab.customTitle)
    });
    const payload = res?.data || {};
    const normalizedFavorite = typeof payload.favorite === 'boolean' ? payload.favorite : tab.favorite;
    const normalizedDescription = typeof payload.description === 'string'
      ? payload.description
      : (typeof tab.description === 'string' ? tab.description : '');
    const normalizedCustomTitle = typeof payload.customTitle === 'boolean'
      ? payload.customTitle
      : Boolean(tab.customTitle);
    const normalizedDeleted = Boolean(payload.deleted);
    const normalizedDeletedAt = normalizedDeleted ? (payload.deletedAt || tab.deletedAt || null) : null;
    tab.favorite = normalizedFavorite;
    tab.description = normalizedDescription;
    tab.customTitle = normalizedCustomTitle;
    tab.deleted = normalizedDeleted;
    tab.deletedAt = normalizedDeletedAt;
    updateSavedTabMeta(tab.fileName, {
      title: tab.title,
      favorite: normalizedFavorite,
      description: normalizedDescription,
      customTitle: normalizedCustomTitle,
      deleted: normalizedDeleted,
      deletedAt: normalizedDeletedAt,
      state: serialized,
      updatedAt: payload.updatedAt || Date.now()
    });
    renderHome();
    return true;
  } catch (err) {
    console.error('[tabs] Failed to save tab:', err);
    return false;
  }
}

function scheduleTabSave(tab) {
  if (!tab) return;
  if (tab.saveTimer) {
    clearTimeout(tab.saveTimer);
  }
  tab.saveTimer = setTimeout(() => {
    tab.saveTimer = null;
    persistTab(tab);
  }, TAB_SAVE_DELAY);
}

async function renameTabFile(tab, newTitle) {
  if (!tab) return;
  const safeTitle = sanitizeTabTitle(newTitle);
  if (safeTitle === tab.title) return;
  try {
    if (tab.saveTimer) {
      clearTimeout(tab.saveTimer);
      tab.saveTimer = null;
    }
    const res = await sm.tabs.rename({ fileName: tab.fileName, newTitle: safeTitle });
    if (!res?.ok) {
      alert('Failed to rename tab: ' + (res?.error || 'unknown error'));
      return;
    }
    tab.fileName = res.data.fileName || tab.fileName;
    tab.title = res.data.title || safeTitle;
    tab.customTitle = Boolean(res.data.customTitle ?? true);
    renderTabs();
    renderTitleForTab(tab);
    updateSavedTabMeta(tab.fileName, {
      title: tab.title,
      favorite: tab.favorite,
      description: tab.description,
      customTitle: tab.customTitle,
      updatedAt: Date.now()
    });
    renderHome();
    scheduleTabSave(tab);
    persistOpenTabs();
    refreshSavedTabsList().catch(() => {});
  } catch (err) {
    console.error('[tabs] Failed to rename tab:', err);
    alert('Failed to rename tab: ' + err.message);
  }
}

function scheduleSessionSave() {
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
  }
  sessionSaveTimer = setTimeout(() => {
    sessionSaveTimer = null;
    try {
      sm.session.save(sessionState || {}).catch((err) => {
        console.error('[session] Failed to save state:', err);
      });
    } catch (err) {
      console.error('[session] Failed to schedule save:', err);
    }
  }, SESSION_SAVE_DELAY);
}

function persistOpenTabs() {
  const openFiles = state.tabs
    .map(t => t.fileName)
    .filter(Boolean);
  sessionState.openTabs = openFiles;
  scheduleSessionSave();
}

function showHome(options = {}) {
  const { persistSession = true } = options;
  if (!state.showHome) {
    const currentTab = state.tabs.find(x => x.id === state.activeId);
    if (currentTab?.chatTerm) {
      currentTab.chatTerm.saveMessageHistory();
      scheduleTabSave(currentTab);
    }
  }

  state.showHome = true;
  if (homeView) {
    homeView.classList.remove('hidden');
    homeView.scrollTop = 0;
  }
  if (homeView && workspaceView) {
    workspaceView.classList.add('hidden');
  }

  if (persistSession) {
    sessionState.activeTab = null;
    scheduleSessionSave();
  }

  if (appTitle) {
    appTitle.classList.add('home-active');
  }

  exitTitleEditMode({ discard: true });
  exitDescriptionEditMode({ discard: true });
  renderTitleForTab(null);
  renderDescriptionForTab(null);
  renderTabs();
  renderHome();
  syncChatTermActivity(null);
  scheduleScrollUpdate();
}

function hideHome() {
  if (!state.showHome) return;
  state.showHome = false;
  if (homeView) {
    homeView.classList.add('hidden');
  }
  if (homeView && workspaceView) {
    workspaceView.classList.remove('hidden');
  }
  if (appTitle) {
    appTitle.classList.remove('home-active');
  }
  renderTitleForTab(getActiveTab());
  renderDescriptionForTab(getActiveTab());
  renderTabs();
  scheduleScrollUpdate();
}

function renderTitleForTab(tab) {
  if (!chatTitle || !chatTitleText) return;

  const hasTab = Boolean(tab);
  chatTitle?.classList.toggle('hidden', !hasTab);

  if (!hasTab) {
    chatTitleText.textContent = getDefaultTabTitleDisplay();
    if (chatTitleHint) {
      chatTitleHint.textContent = getChatTitleHintText();
    }
    return;
  }

  if (!isEditingTitle) {
    chatTitleText.textContent = tab.title || getDefaultTabTitleDisplay();
    chatTitle?.classList.remove('editing');
    if (chatTitleDisplay) chatTitleDisplay.classList.remove('hidden');
    if (chatTitleEditor) chatTitleEditor.classList.add('hidden');
  }
  if (chatTitleHint) {
    chatTitleHint.textContent = getChatTitleHintText();
  }

  scheduleScrollUpdate();
}

function renderDescriptionForTab(tab) {
  if (!chatDescription || !chatDescriptionBody) return;

  if (chatDescriptionHint) {
    chatDescriptionHint.textContent = getChatDescriptionHintText();
  }

  const hasTab = Boolean(tab);
  chatDescription.classList.toggle('hidden', !hasTab);
  if (scrollControls) {
    scrollControls.classList.toggle('hidden', !hasTab);
  }

  if (!hasTab) {
    if (chatDescriptionEditor) {
      chatDescriptionEditor.classList.add('hidden');
    }
    if (chatDescriptionBody) {
      chatDescriptionBody.classList.remove('hidden');
    }
    if (chatDescriptionEmpty) {
      chatDescriptionEmpty.classList.remove('hidden');
      chatDescriptionEmpty.textContent = getChatDescriptionEmptyText();
    }
    chatDescription.classList.add('is-empty');
    isEditingDescription = false;
    return;
  }

  const description = typeof tab.description === 'string' ? tab.description.trim() : '';
  const html = description ? renderMarkdownFragment(description) : '';

  if (!isEditingDescription) {
    chatDescriptionBody.innerHTML = '';
    if (description && html) {
      chatDescriptionBody.innerHTML = html;
      if (chatDescriptionEmpty) {
        chatDescriptionEmpty.classList.add('hidden');
      }
      chatDescription.classList.remove('is-empty');
    } else {
      if (chatDescriptionEmpty && !chatDescriptionBody.contains(chatDescriptionEmpty)) {
        chatDescriptionBody.appendChild(chatDescriptionEmpty);
      }
      if (chatDescriptionEmpty) {
        chatDescriptionEmpty.textContent = getChatDescriptionEmptyText();
        chatDescriptionEmpty.classList.remove('hidden');
      }
      chatDescription.classList.add('is-empty');
    }
  }

  scheduleScrollUpdate();
}

function enterTitleEditMode() {
  if (isEditingTitle) return;
  const activeTab = getActiveTab();
  if (!activeTab || !chatTitleDisplay || !chatTitleEditor || !chatTitleInput) return;

  isEditingTitle = true;
  chatTitle?.classList.add('editing');
  chatTitleDisplay.classList.add('hidden');
  chatTitleEditor.classList.remove('hidden');
  const current = activeTab.title || '';
  chatTitleInput.value = current;
  chatTitleInput.placeholder = getChatTitlePlaceholder();
  setTimeout(() => {
    chatTitleInput.focus();
    chatTitleInput.select();
  }, 0);
}

function exitTitleEditMode({ discard = false } = {}) {
  if (!isEditingTitle) return;
  isEditingTitle = false;
  chatTitle?.classList.remove('editing');
  if (chatTitleEditor) {
    chatTitleEditor.classList.add('hidden');
  }
  if (chatTitleDisplay) {
    chatTitleDisplay.classList.remove('hidden');
  }
  if (discard) {
    const currentTab = getActiveTab();
    renderTitleForTab(currentTab);
  }
}

async function saveTitleChanges() {
  const activeTab = getActiveTab();
  if (!activeTab || !chatTitleInput) {
    exitTitleEditMode({ discard: true });
    return;
  }

  const rawValue = chatTitleInput.value || '';
  const trimmed = rawValue.trim();
  if (!trimmed) {
    alert(i18n.t('chat.title.emptyError', '对话名称不能为空'));
    return;
  }

  const safeTitle = sanitizeTabTitle(rawValue);

  if (safeTitle === activeTab.title) {
    exitTitleEditMode({ discard: true });
    return;
  }

  const previousTitle = activeTab.title;
  await renameTabFile(activeTab, safeTitle);

  if (activeTab.title !== safeTitle) {
    // Rename failed; keep editor open for retry
    chatTitleInput.value = activeTab.title || previousTitle || '';
    chatTitleInput.focus();
    chatTitleInput.select();
    return;
  }

  exitTitleEditMode();
  renderTitleForTab(activeTab);
  renderTabs();
  renderHome();
  scheduleScrollUpdate();
}

function enterDescriptionEditMode() {
  if (isEditingDescription) return;
  const activeTab = getActiveTab();
  if (!activeTab || !chatDescriptionEditor || !chatDescriptionInput || !chatDescriptionBody) return;

  isEditingDescription = true;
  chatDescription?.classList.add('editing');
  updateScrollControlsVisibility();
  chatDescriptionEditor.classList.remove('hidden');
  chatDescriptionBody.classList.add('hidden');
  const current = typeof activeTab.description === 'string' ? activeTab.description : '';
  chatDescriptionInput.value = current;
  chatDescriptionInput.placeholder = getChatDescriptionPlaceholder();
  setTimeout(() => {
    chatDescriptionInput.focus();
    chatDescriptionInput.setSelectionRange(current.length, current.length);
  }, 0);
}

function exitDescriptionEditMode({ discard = false } = {}) {
  if (!isEditingDescription) return;
  isEditingDescription = false;
  chatDescription?.classList.remove('editing');
  updateScrollControlsVisibility();
  if (chatDescriptionEditor) {
    chatDescriptionEditor.classList.add('hidden');
  }
  if (chatDescriptionBody) {
    chatDescriptionBody.classList.remove('hidden');
  }
  if (discard) {
    renderDescriptionForTab(getActiveTab());
  }
}

async function saveDescriptionChanges() {
  const activeTab = getActiveTab();
  if (!activeTab || !chatDescriptionInput) {
    exitDescriptionEditMode({ discard: true });
    return;
  }
  const value = chatDescriptionInput.value.replace(/\r\n/g, '\n');
  const normalized = value.trim() ? value.trim() : '';
  activeTab.description = normalized;
  updateSavedTabMeta(activeTab.fileName, {
    description: normalized,
    title: activeTab.title,
    favorite: activeTab.favorite,
    customTitle: activeTab.customTitle,
    updatedAt: Date.now()
  });
  exitDescriptionEditMode();
  renderDescriptionForTab(activeTab);
  if (activeTab.chatTerm) {
    activeTab.chatTerm.saveMessageHistory();
  }
  if (activeTab.saveTimer) {
    clearTimeout(activeTab.saveTimer);
    activeTab.saveTimer = null;
  }
  try {
    await persistTab(activeTab);
  } catch (err) {
    console.error('[description] Failed to persist description:', err);
  }
  renderHome();
  scheduleScrollUpdate();
}

async function refreshSavedTabsList() {
  try {
    const res = await sm.tabs.list();
    if (res?.ok && Array.isArray(res.data)) {
      state.savedTabs = res.data.map(item => ({
        ...item,
        favorite: Boolean(item.favorite),
        description: typeof item.description === 'string' ? item.description : '',
        customTitle: typeof item.customTitle === 'boolean'
          ? item.customTitle
          : Boolean(item.title && !/^Chat-\d+$/i.test(item.title)),
        deleted: Boolean(item.deleted),
        deletedAt: item.deletedAt || null
      }));
    } else {
      state.savedTabs = [];
    }
  } catch (err) {
    console.error('[tabs] Failed to list saved tabs:', err);
    state.savedTabs = [];
  }
  renderHome();
  return state.savedTabs;
}

function renderHome() {
  if (!homeView) return;

  const favorites = getItemsForKey('favorites');
  const all = getItemsForKey('all');
  const trashTabs = getItemsForKey('recycle');

  populateHomeList(homeFavoritesList, favorites, { allowDelete: false, pageKey: 'favorites' });
  populateHomeList(homeAllList, all, { allowDelete: true, pageKey: 'all' });
  populateRecycleList(homeRecycleList, trashTabs);

  if (homeFavoritesEmpty) {
    homeFavoritesEmpty.classList.toggle('hidden', favorites.length > 0);
  }
  if (homeAllEmpty) {
    homeAllEmpty.classList.toggle('hidden', all.length > 0);
  }
  if (homeRecycleEmpty) {
    homeRecycleEmpty.classList.toggle('hidden', trashTabs.length > 0);
  }
  if (homeRecycleClearBtn) {
    homeRecycleClearBtn.disabled = trashTabs.length === 0;
  }

  scheduleScrollUpdate();
}

function populateHomeList(container, items, { allowDelete = false, pageKey } = {}) {
  if (!container) return;
  const key = pageKey || 'all';
  const sorted = sortTabsForDisplay(items);
  const totalPages = ensurePaginationBounds(key, sorted.length);
  const startIndex = totalPages === 0 ? 0 : pagination[key] * HOME_PAGE_SIZE;
  const pageItems = totalPages === 0 ? [] : sorted.slice(startIndex, startIndex + HOME_PAGE_SIZE);
  container.innerHTML = '';
  for (const meta of pageItems) {
    container.appendChild(createHomeCard(meta, { allowDelete }));
  }
  updatePagerIndicators(key, totalPages);
}

function populateRecycleList(container, items) {
  if (!container) return;
  const key = 'recycle';
  const sorted = sortTabsForDisplay(items);
  const totalPages = ensurePaginationBounds(key, sorted.length);
  const startIndex = totalPages === 0 ? 0 : pagination[key] * HOME_PAGE_SIZE;
  const pageItems = totalPages === 0 ? [] : sorted.slice(startIndex, startIndex + HOME_PAGE_SIZE);
  container.innerHTML = '';
  for (const meta of pageItems) {
    container.appendChild(createRecycleCard(meta));
  }
  updatePagerIndicators(key, totalPages);
}

function sortTabsForDisplay(items = []) {
  return [...items].sort((a, b) => {
    const aTime = a?.updatedAt || a?.createdAt || 0;
    const bTime = b?.updatedAt || b?.createdAt || 0;
    return bTime - aTime;
  });
}

function createHomeCard(meta, { allowDelete = false } = {}) {
  const card = document.createElement('article');
  card.className = 'home-card';
  card.classList.add('home-card-compact');
  if (meta?.fileName) {
    card.dataset.fileName = meta.fileName;
  }

  if (allowDelete) {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'home-card-delete';
    deleteBtn.innerHTML = HOME_ICONS.delete;
    const deleteLabel = i18n.t('home.delete.confirmTitle', '删除对话');
    deleteBtn.setAttribute('aria-label', deleteLabel);
    deleteBtn.setAttribute('title', deleteLabel);
    deleteBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        const confirmed = await requestConfirmation({
          title: i18n.t('home.delete.confirmTitle', '删除对话'),
          message: i18n.t('home.delete.confirmMessage', '确定要删除该对话吗？删除后可在回收站中查看并可清空。'),
          confirmText: i18n.t('home.delete.confirmAction', '删除'),
          cancelText: i18n.t('modal.confirm.cancel', '取消')
        });
        if (!confirmed) return;
        await trashConversation(meta?.fileName);
      } catch (err) {
        console.error('[home] Failed to delete conversation:', err);
      }
    });
    card.appendChild(deleteBtn);
  }

  const header = document.createElement('div');
  header.className = 'home-card-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'home-card-title-row';

  const favoriteIndicator = document.createElement('span');
  favoriteIndicator.className = 'home-card-favorite-indicator';
  favoriteIndicator.setAttribute('aria-hidden', 'true');
  setFavoriteIndicatorVisual(favoriteIndicator, meta?.favorite);

  const titleEl = document.createElement('span');
  titleEl.className = 'home-card-title';
  titleEl.textContent = meta?.title || getDefaultTabTitleDisplay();
  titleRow.append(favoriteIndicator, titleEl);
  header.appendChild(titleRow);

  const metaLine = document.createElement('div');
  metaLine.className = 'home-card-meta';
  const ts = meta?.updatedAt || meta?.createdAt;
  metaLine.textContent = ts ? `更新：${formatTimestamp(ts)}` : '更新：尚无记录';
  header.appendChild(metaLine);

  const preview = document.createElement('div');
  preview.className = 'home-card-preview';
  const previewContent = document.createElement('div');
  previewContent.className = 'home-card-preview-content';
  const descriptionText = typeof meta?.description === 'string' ? meta.description.trim() : '';
  if (descriptionText) {
    const descriptionSection = document.createElement('div');
    descriptionSection.className = 'home-card-description';
    descriptionSection.innerHTML = renderMarkdownFragment(descriptionText);
    previewContent.appendChild(descriptionSection);
  }
  const previewStream = document.createElement('div');
  previewStream.className = 'home-card-preview-stream';
  renderHomePreview(previewStream, meta);
  previewContent.appendChild(previewStream);
  preview.appendChild(previewContent);

  const footer = document.createElement('div');
  footer.className = 'home-card-footer';

  const actions = document.createElement('div');
  actions.className = 'home-card-actions';
  const favBtn = document.createElement('button');
  favBtn.className = 'home-action-btn favorite';
  favBtn.type = 'button';
  setFavoriteButtonVisual(favBtn, meta?.favorite);
  favBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const targetValue = !meta?.favorite;
    const previousFavorite = Boolean(meta?.favorite);
    setFavoriteButtonVisual(favBtn, targetValue);
    setFavoriteIndicatorVisual(favoriteIndicator, targetValue);
    const openTab = state.tabs.find(t => t.fileName === meta?.fileName);
    const promise = openTab
      ? toggleFavoriteForTab(openTab, targetValue)
      : toggleFavoriteForSaved(meta, targetValue);
    if (promise && typeof promise.catch === 'function') {
      promise.catch(() => {
        setFavoriteButtonVisual(favBtn, previousFavorite);
        setFavoriteIndicatorVisual(favoriteIndicator, previousFavorite);
      });
    }
  });
  actions.appendChild(favBtn);
  const openBtn = document.createElement('button');
  openBtn.className = 'home-action-btn open';
  openBtn.type = 'button';
  openBtn.innerHTML = HOME_ICONS.open;
  openBtn.setAttribute('aria-label', '打开对话');
  openBtn.setAttribute('title', '打开对话');
  openBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    openConversation(meta?.fileName);
  });
  actions.appendChild(openBtn);
  const tag = document.createElement('span');
  tag.className = 'home-card-tag';
  tag.textContent = meta?.fileName || '';
  footer.append(tag, actions);

  card.append(header, preview, footer);

  const isInteractiveTarget = (target) => {
    if (!target) return false;
    return Boolean(target.closest('.home-card-actions, .home-card-delete'));
  };

  let clickTimer = null;
  let clickCount = 0;

  card.addEventListener('click', (event) => {
    if (isInteractiveTarget(event.target)) {
      return;
    }
    clickCount++;

    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }

    clickTimer = window.setTimeout(() => {
      if (clickCount === 1) {
        openConversation(meta?.fileName);
      }
      clickCount = 0;
      clickTimer = null;
    }, 250);
  });

  card.addEventListener('dblclick', (event) => {
    if (isInteractiveTarget(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    // Clear the single click timer
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    clickCount = 0;

    openConversation(meta?.fileName);
  });

  card.setAttribute('tabindex', '0');
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openConversation(meta?.fileName);
    }
  });

  return card;
}

function renderHomePreview(container, meta, limit = HOME_PREVIEW_LIMIT) {
  if (!container) return;
  container.innerHTML = '';

  const messages = meta?.state?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'home-card-preview-empty';
    placeholder.textContent = '（暂无内容）';
    container.appendChild(placeholder);
    return;
  }

  const template = document.createElement('template');
  let rendered = 0;
  const maxCount = Number.isFinite(limit) && limit > 0 ? limit : Infinity;

  for (const html of messages) {
    if (rendered >= maxCount) break;
    if (typeof html !== 'string' || !html) continue;

    template.innerHTML = html;
    const element = template.content.firstElementChild;
    if (!element) continue;

    if (element.classList?.contains('notebook-cell')) {
      element.classList.remove('selected');
      element.classList.add('home-preview-cell');
    }

    container.appendChild(element);
    template.innerHTML = '';
    rendered += 1;
  }

  if (rendered === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'home-card-preview-empty';
    placeholder.textContent = '（暂无内容）';
    container.appendChild(placeholder);
  }
}

function createRecycleCard(meta) {
  const card = document.createElement('article');
  card.className = 'home-card';
  card.classList.add('recycle-card');
  if (meta?.fileName) {
    card.dataset.fileName = meta.fileName;
  }

  const header = document.createElement('div');
  header.className = 'home-card-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'home-card-title-row';
  const recycleIndicator = document.createElement('span');
  recycleIndicator.className = 'home-card-favorite-indicator recycle';
  recycleIndicator.textContent = '🗑';
  recycleIndicator.setAttribute('aria-hidden', 'true');
  const titleEl = document.createElement('div');
  titleEl.className = 'home-card-title';
    titleEl.textContent = meta?.title || getDefaultTabTitleDisplay();
  titleRow.append(recycleIndicator, titleEl);
  header.appendChild(titleRow);

  const metaLine = document.createElement('div');
  metaLine.className = 'home-card-meta';
  const ts = meta?.deletedAt || meta?.updatedAt || meta?.createdAt;
  metaLine.textContent = ts ? `删除时间：${formatTimestamp(ts)}` : '删除时间未知';
  header.appendChild(metaLine);

  const descriptionText = typeof meta?.description === 'string' ? meta.description.trim() : '';
  const preview = document.createElement('div');
  preview.className = 'home-card-preview';
  const previewContent = document.createElement('div');
  previewContent.className = 'home-card-preview-content';
  if (descriptionText) {
    const descriptionSection = document.createElement('div');
    descriptionSection.className = 'home-card-description';
    descriptionSection.innerHTML = renderMarkdownFragment(descriptionText);
    previewContent.appendChild(descriptionSection);
  }
  const previewStream = document.createElement('div');
  previewStream.className = 'home-card-preview-stream';
  renderHomePreview(previewStream, meta);
  previewContent.appendChild(previewStream);
  preview.appendChild(previewContent);

  const footer = document.createElement('div');
  footer.className = 'home-card-footer';

  const actions = document.createElement('div');
  actions.className = 'home-card-actions';
  const restoreBtn = document.createElement('button');
  restoreBtn.className = 'home-action-btn restore';
  restoreBtn.type = 'button';
  restoreBtn.innerHTML = HOME_ICONS.restore;
  restoreBtn.setAttribute('aria-label', '恢复对话');
  restoreBtn.setAttribute('title', '恢复对话');
  restoreBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    restoreConversation(meta?.fileName);
  });
  actions.appendChild(restoreBtn);

  const tag = document.createElement('span');
  tag.className = 'home-card-tag';
  tag.textContent = meta?.fileName || '';
  footer.append(tag, actions);

  card.append(header, preview, footer);
  return card;
}

function formatTimestamp(ms) {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function openConversation(fileName) {
  if (!fileName) return;
  const existing = state.tabs.find(t => t.fileName === fileName);
  if (existing) {
    setActiveTab(existing.id);
    return;
  }

  const meta = (state.savedTabs || []).find(t => t.fileName === fileName);
  if (!meta) {
    alert('未找到对应的对话记录');
    return;
  }
  if (meta.deleted) {
    alert('该对话已被移至回收站，无法打开。');
    return;
  }

  try {
    await addNewTab({
      fileName: meta.fileName,
      title: meta.title,
      state: meta.state || null,
      favorite: meta.favorite || false,
      description: typeof meta.description === 'string' ? meta.description : '',
      customTitle: typeof meta.customTitle === 'boolean' ? meta.customTitle : true
    });
  } catch (err) {
    console.error('[home] Failed to open conversation:', err);
    alert('无法打开对话：' + (err?.message || err));
  }
}

async function toggleFavoriteForTab(tab, desiredFavorite) {
  if (!tab) return;
  const next = Boolean(desiredFavorite);
  if (tab.favorite === next) return;
  if (tab.saveTimer) {
    clearTimeout(tab.saveTimer);
    tab.saveTimer = null;
  }
  const previous = tab.favorite;
  tab.favorite = next;
  try {
    const persisted = await persistTab(tab);
    if (!persisted) {
      throw new Error('Failed to persist favorite flag for active tab');
    }
    await refreshSavedTabsList();
    renderTabs();
  } catch (err) {
    tab.favorite = previous;
    console.error('[tabs] Failed to update favorite for active tab:', err);
    alert('更新收藏状态失败：' + (err?.message || err));
    renderTabs();
    renderHome();
  }
}

async function toggleFavoriteForSaved(meta, desiredFavorite) {
  if (!meta) return;
  const next = Boolean(desiredFavorite);
  if (meta.favorite === next) return;

  const payload = {
    fileName: meta.fileName,
    title: meta.title,
    state: meta.state || null,
    favorite: next,
    description: typeof meta.description === 'string' ? meta.description : '',
    customTitle: typeof meta.customTitle === 'boolean' ? meta.customTitle : true
  };

  try {
    const res = await sm.tabs.save(payload);
    const normalizedFavorite = typeof res?.data?.favorite === 'boolean' ? res.data.favorite : next;
    const normalizedDescription = typeof res?.data?.description === 'string'
      ? res.data.description
      : (typeof meta.description === 'string' ? meta.description : '');
    const normalizedCustomTitle = typeof res?.data?.customTitle === 'boolean'
      ? res.data.customTitle
      : (typeof meta.customTitle === 'boolean' ? meta.customTitle : true);
    meta.favorite = normalizedFavorite;
    meta.description = normalizedDescription;
    meta.customTitle = normalizedCustomTitle;
    if (res?.data?.updatedAt) {
      meta.updatedAt = res.data.updatedAt;
    } else {
      meta.updatedAt = Date.now();
    }
    updateSavedTabMeta(meta.fileName, {
      favorite: normalizedFavorite,
      description: normalizedDescription,
      customTitle: normalizedCustomTitle,
      updatedAt: meta.updatedAt
    });
    await refreshSavedTabsList();
    renderTabs();
  } catch (err) {
    console.error('[tabs] Failed to update favorite for saved tab:', err);
    alert('更新收藏状态失败：' + (err?.message || err));
  }
}

async function trashConversation(fileName) {
  if (!fileName) return;
  try {
    const meta = state.savedTabs.find(tab => tab.fileName === fileName);
    const deletedAt = Date.now();

    // Check if the conversation is currently open
    const openTabs = state.tabs.filter(tab => tab.fileName === fileName);
    const isCurrentlyOpen = openTabs.some(tab => tab.id === state.activeId);

    const payload = {
      fileName,
      title: meta?.title || 'Chat',
      state: meta?.state || null,
      favorite: false,
      description: typeof meta?.description === 'string' ? meta.description : '',
      customTitle: typeof meta?.customTitle === 'boolean' ? meta.customTitle : false,
      deleted: true,
      deletedAt
    };
    const res = await sm.tabs.save(payload);
    if (!res?.ok) {
      alert('移动到回收站失败：' + (res?.error || '未知错误'));
      return;
    }
    if (meta) {
      meta.deleted = true;
      meta.deletedAt = deletedAt;
      meta.favorite = false;
      updateSavedTabMeta(fileName, {
        deleted: true,
        deletedAt,
        favorite: false,
        updatedAt: deletedAt
      });
    }

    // Close all open tabs with this fileName
    openTabs.forEach(tab => {
      tab.favorite = false;
      tab.deleted = true;
      tab.deletedAt = deletedAt;
    });
    await Promise.all(openTabs.map(tab => closeTab(tab.id)));

    // If the deleted conversation was currently open, return to home
    if (isCurrentlyOpen || state.tabs.length === 0) {
      showHome();
    }

    pagination.recycle = 0;
    await refreshSavedTabsList();
    scheduleScrollUpdate();
  } catch (err) {
    console.error('[trash] Failed to move conversation to recycle bin:', err);
    alert('移动到回收站失败：' + (err?.message || err));
  }
}

async function restoreConversation(fileName) {
  if (!fileName) return;
  try {
    const meta = state.savedTabs.find(tab => tab.fileName === fileName);
    if (!meta) {
      alert('未找到该对话，无法恢复。');
      return;
    }
    const payload = {
      fileName,
      title: meta.title || 'Chat',
      state: meta.state || null,
      favorite: Boolean(meta.favorite),
      description: typeof meta.description === 'string' ? meta.description : '',
      customTitle: typeof meta.customTitle === 'boolean' ? meta.customTitle : false,
      deleted: false,
      deletedAt: null
    };
    const res = await sm.tabs.save(payload);
    if (!res?.ok) {
      alert('恢复对话失败：' + (res?.error || '未知错误'));
      return;
    }
    const normalizedFavorite = typeof res?.data?.favorite === 'boolean' ? res.data.favorite : Boolean(meta.favorite);
    const normalizedDescription = typeof res?.data?.description === 'string'
      ? res.data.description
      : (typeof meta.description === 'string' ? meta.description : '');
    const normalizedCustomTitle = typeof res?.data?.customTitle === 'boolean'
      ? res.data.customTitle
      : Boolean(meta.customTitle);
    const normalizedDeleted = Boolean(res?.data?.deleted);
    const normalizedDeletedAt = normalizedDeleted ? (res?.data?.deletedAt || null) : null;
    meta.favorite = normalizedFavorite;
    meta.description = normalizedDescription;
    meta.customTitle = normalizedCustomTitle;
    meta.deleted = normalizedDeleted;
    meta.deletedAt = normalizedDeletedAt;
    updateSavedTabMeta(fileName, {
      deleted: normalizedDeleted,
      deletedAt: normalizedDeletedAt,
      favorite: normalizedFavorite,
      description: normalizedDescription,
      customTitle: normalizedCustomTitle,
      updatedAt: res?.data?.updatedAt || Date.now()
    });
    const openTabs = state.tabs.filter(tab => tab.fileName === fileName);
    openTabs.forEach(tab => {
      tab.deleted = normalizedDeleted;
      tab.deletedAt = normalizedDeletedAt;
      tab.favorite = normalizedFavorite;
      tab.description = normalizedDescription;
      tab.customTitle = normalizedCustomTitle;
    });
    if (openTabs.length > 0) {
      renderTabs();
    }
    await refreshSavedTabsList();
  } catch (err) {
    console.error('[trash] Failed to restore conversation:', err);
    alert('恢复对话失败：' + (err?.message || err));
  }
}

function switchToTerminalMode() {
  if (!state.useChatMode) return;
  const currentTab = state.tabs.find(x => x.id === state.activeId);
  if (currentTab?.chatTerm) {
    currentTab.chatTerm.saveMessageHistory();
  }
  state.useChatMode = false;
  setActiveTab(state.activeId);
}
window.switchToTerminalMode = switchToTerminalMode;

function switchToChatMode() {
  if (state.useChatMode) return;
  state.useChatMode = true;
  setActiveTab(state.activeId);
}
window.switchToChatMode = switchToChatMode;

async function init() {
  applyLocaleTextAndRefresh();

  const s = await sm.settings.get();
  if (s.ok && s.data.splitRatio) state.splitRatio = s.data.splitRatio;
  applySplitRatio();
  setupChatContextMenu();
  try {
    const sessionRes = await sm.session.load();
    sessionState = sessionRes?.ok && sessionRes.data ? { ...sessionRes.data } : {};
  } catch (err) {
    console.error('[session] Failed to load session state:', err);
    sessionState = {};
  }

  let savedMeta = [];
  try {
    savedMeta = await refreshSavedTabsList();
  } catch (err) {
    console.error('[tabs] Failed to load saved tabs:', err);
  }

  const requestedOpen = Array.isArray(sessionState.openTabs) ? [...sessionState.openTabs] : [];
  const activeFile = sessionState.activeTab;
  if (activeFile) {
    const activeIndex = requestedOpen.indexOf(activeFile);
    if (activeIndex >= 0) {
      requestedOpen.splice(activeIndex, 1);
      requestedOpen.push(activeFile);
    }
  }
  const savedMap = new Map((savedMeta || []).map(entry => [entry.fileName, entry]));
  let openedCount = 0;

  for (const fileName of requestedOpen) {
    const meta = savedMap.get(fileName);
    if (!meta || meta.deleted) continue;
    await addNewTab({
      fileName: meta.fileName,
      title: meta.title,
      state: meta.state || null,
      favorite: meta.favorite || false,
      description: typeof meta.description === 'string' ? meta.description : '',
      customTitle: typeof meta.customTitle === 'boolean' ? meta.customTitle : true
    });
    openedCount += 1;
  }

  // Initialize tab scrolling
  initTabScrolling();

  if (openedCount === 0) {
    state.activeId = null;
    renderTabs();
    showHome();
    sessionState.activeTab = null;
    persistOpenTabs();
  } else {
    if (activeFile) {
      const activeTab = state.tabs.find(t => t.fileName === activeFile);
      if (activeTab) {
        state.activeId = activeTab.id;
      }
    }
    showHome({ persistSession: false });
  }

  scheduleScrollUpdate();
}

function setupChatContextMenu() {
  if (!chatContainer || !chatContextMenu) return;

  // Show context menu on right click
  chatContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    
    // Hide file context menu if visible
    const fileContextMenu = document.getElementById('fileContextMenu');
    if (fileContextMenu) {
      fileContextMenu.classList.add('hidden');
    }
    
    // Position and show chat context menu
    const x = e.clientX;
    const y = e.clientY;
    
    chatContextMenu.style.left = `${x}px`;
    chatContextMenu.style.top = `${y}px`;
    chatContextMenu.classList.remove('hidden');
  });

  // Hide context menu when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!chatContextMenu.contains(e.target)) {
      chatContextMenu.classList.add('hidden');
    }
  });

  // Handle context menu actions
  chatContextMenu.addEventListener('click', (e) => {
    const action = e.target.closest('.context-menu-item')?.dataset.action;
    if (!action) return;

    switch (action) {
      case 'copy':
        copySelectedText();
        break;
      case 'selectAll':
        selectAllText();
        break;
    }
    
    chatContextMenu.classList.add('hidden');
  });
}

function copySelectedText() {
  try {
    // Try to use the modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      const selectedText = window.getSelection().toString();
      if (selectedText) {
        navigator.clipboard.writeText(selectedText);
        return;
      }
    }
    
    // Fallback to document.execCommand
    document.execCommand('copy');
  } catch (err) {
    console.error('Failed to copy text: ', err);
  }
}

function selectAllText() {
  try {
    // Create a range that selects all text in chat messages
    const range = document.createRange();
    range.selectNodeContents(chatMessages);
    
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (err) {
    console.error('Failed to select all text: ', err);
    
    // Fallback to document.execCommand
    try {
      chatMessages.focus();
      document.execCommand('selectAll', false, null);
    } catch (fallbackErr) {
      console.error('Fallback select all also failed: ', fallbackErr);
    }
  }
}

function applySplitRatio() {
  document.documentElement.style.setProperty('--splitter', '6px');
  const split = document.getElementById('split');
  const topPct = Math.round(state.splitRatio * 100);
  split.style.gridTemplateRows = `${topPct}% var(--splitter) ${100 - topPct}%`;
  sm.settings.set({ splitRatio: state.splitRatio });
}

function renderTabs() {
  if (!tabsEl) return;

  tabsEl.innerHTML = '';

  state.tabs.forEach((t, index) => {
    const isActive = !state.showHome && t.id === state.activeId;
    const tab = document.createElement('div');
    tab.className = 'tab' + (isActive ? ' active' : '');
    tab.onclick = () => setActiveTab(t.id);
    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title';
    titleEl.textContent = t.title || `Chat-${index + 1}`;
    titleEl.title = titleEl.textContent;
    tab.appendChild(titleEl);
    tab.ondblclick = async (e) => {
      e.stopPropagation();
      const currentTitle = t.title || 'Chat';
      const input = prompt('Rename tab', currentTitle);
      if (input && sanitizeTabTitle(input) !== currentTitle) {
        await renameTabFile(t, input);
      }
    };
    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '×';
    close.onclick = (e) => { e.stopPropagation(); closeTab(t.id); };
    tab.appendChild(close);
    tabsEl.appendChild(tab);
  });

  // Update scroll buttons visibility after DOM update
  requestAnimationFrame(() => {
    updateTabScrollButtons();
  });
}

function updateTabScrollButtons() {
  const scrollContainer = document.querySelector('.tabs-scroll-container');
  const scrollLeftBtn = document.getElementById('tabScrollLeft');
  const scrollRightBtn = document.getElementById('tabScrollRight');

  if (!scrollContainer || !scrollLeftBtn || !scrollRightBtn) {
    console.log('[tab-scroll] Missing elements:', { scrollContainer: !!scrollContainer, scrollLeftBtn: !!scrollLeftBtn, scrollRightBtn: !!scrollRightBtn });
    return;
  }

  const hasOverflow = scrollContainer.scrollWidth > scrollContainer.clientWidth;
  const isAtStart = scrollContainer.scrollLeft <= 1;
  const isAtEnd = scrollContainer.scrollLeft + scrollContainer.clientWidth >= scrollContainer.scrollWidth - 1;

  console.log('[tab-scroll] Update buttons:', {
    scrollWidth: scrollContainer.scrollWidth,
    clientWidth: scrollContainer.clientWidth,
    scrollLeft: scrollContainer.scrollLeft,
    hasOverflow,
    isAtStart,
    isAtEnd
  });

  if (hasOverflow) {
    scrollLeftBtn.classList.toggle('visible', !isAtStart);
    scrollRightBtn.classList.toggle('visible', !isAtEnd);
  } else {
    scrollLeftBtn.classList.remove('visible');
    scrollRightBtn.classList.remove('visible');
  }
}

function initTabScrolling() {
  const scrollContainer = document.querySelector('.tabs-scroll-container');
  const scrollLeftBtn = document.getElementById('tabScrollLeft');
  const scrollRightBtn = document.getElementById('tabScrollRight');

  if (!scrollContainer || !scrollLeftBtn || !scrollRightBtn) {
    console.log('[tab-scroll] Init failed - missing elements');
    return;
  }

  const scrollAmount = 200;

  scrollLeftBtn.addEventListener('click', () => {
    console.log('[tab-scroll] Left button clicked');
    scrollContainer.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    setTimeout(updateTabScrollButtons, 100);
  });

  scrollRightBtn.addEventListener('click', () => {
    console.log('[tab-scroll] Right button clicked');
    scrollContainer.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    setTimeout(updateTabScrollButtons, 100);
  });

  scrollContainer.addEventListener('scroll', updateTabScrollButtons);
  window.addEventListener('resize', updateTabScrollButtons);

  console.log('[tab-scroll] Initialized successfully');
}

async function loadXtermTheme() {
  try {
    const resp = await fetch('../../design-system/modern/xterm-theme.json');
    return await resp.json();
  } catch { return {}; }
}

async function addNewTab(options = {}) {
  const {
    fileName: existingFileName = null,
    title: providedTitle = null,
    state: savedState = null,
    favorite: initialFavorite = false,
    description: initialDescription = '',
    customTitle: initialCustomTitle = Boolean(providedTitle)
  } = options || {};

  const activeTab = state.tabs.find(x => x.id === state.activeId);
  if (activeTab?.chatTerm) {
    activeTab.chatTerm.saveMessageHistory();
  }

  const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const term = new Terminal({
  cursorBlink: true,
  scrollback: 10000, // Increase scrollback buffer
  fontSize: 14,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  letterSpacing: 0,
  lineHeight: 1,
  allowTransparency: false,
  theme: {
    ...await loadXtermTheme(),
    foreground: '#E8ECF2',
    background: '#0B1220'
  }
});

  // Initialize chat terminal
  const chatTerm = new ChatTerminal(chatContainer, commandInput, chatMessages, null);

  // Clear chat messages for new tab
  let restored = false;
  if (savedState) {
    chatTerm.loadSerializedState(savedState);
    restored = true;
  } else {
    chatTerm.clearMessages();
    chatTerm.saveMessageHistory();
  }

  const spawnRes = await sm.term.spawn({ tabId: id, cols: 120, rows: 30, preferUTF8: true });
  if (!spawnRes.ok) { alert('Failed to spawn terminal: ' + spawnRes.error); return; }
  const { ptyId } = spawnRes.data;
  const writer = (d) => sm.term.write({ ptyId, data: d });
  const resizer = (c, r) => sm.term.resize({ ptyId, cols: c, rows: r });

  // Connect chat terminal to writer
  chatTerm.setWriter(writer);

  // Set tab state getter for terminal readiness check
  chatTerm.getTabState = () => state.tabs.find(t => t.id === id);

  // Connect xterm to writer
  term.onData(data => writer(data));

  // Handle data from PTY - send to both xterm and chat terminal
  sm.term.onData(m => {
    if (m.ptyId === ptyId) {
      handleTermData(id, term, chatTerm, m.data);
    }
  });

  // SSH shell also emits via same event channel since main relays as evt.term.data
  const home = await detectHome();
  const defaultTitle = getDefaultTabTitle();
  let effectiveTitle = providedTitle != null ? sanitizeTabTitle(providedTitle) : defaultTitle;
  if (!effectiveTitle) {
    effectiveTitle = defaultTitle;
  }
  let fileName = existingFileName;
  if (!fileName) {
    const createRes = await sm.tabs.create({ title: effectiveTitle });
    if (!createRes?.ok) {
      alert('Failed to create tab file: ' + (createRes?.error || 'unknown error'));
      return;
    }
    fileName = createRes.data.fileName;
    effectiveTitle = createRes.data.title || effectiveTitle;
    updateSavedTabMeta(fileName, {
      title: effectiveTitle,
      favorite: Boolean(initialFavorite),
      description: typeof initialDescription === 'string' ? initialDescription : '',
      customTitle: Boolean(initialCustomTitle),
      deleted: false,
      deletedAt: null,
      state: savedState || null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  const tabEntry = {
    id,
    title: effectiveTitle,
    fileName,
    ptyId,
    cwd: home,
    term,
    chatTerm,
    write: writer,
    resize: resizer,
    saveTimer: null,
    favorite: Boolean(initialFavorite),
    description: typeof initialDescription === 'string' ? initialDescription : '',
    customTitle: Boolean(initialCustomTitle),
    deleted: false,
    deletedAt: null,
    terminalReady: true  // Mark as ready immediately after PTY spawn
  };

  chatTerm.setChangeHandler(() => {
    scheduleTabSave(tabEntry);
    scheduleScrollUpdate();
  });

  state.tabs.push(tabEntry);
  setActiveTab(id, { skipSave: true });
  renderTabs();

  if (!restored) {
    scheduleTabSave(tabEntry);
  }

  updateCurrentPathDisplay();
  persistOpenTabs();
  scheduleScrollUpdate();
}

async function detectHome() {
  // Detect platform using navigator (browser-safe)
  const isWindows = navigator.platform.toLowerCase().includes('win');
  // For Unix-like systems, we don't know the actual home directory yet
  // We'll let the shell tell us the current directory
  return isWindows ? 'C:/' : '/';
}

function syncChatTermActivity(activeId = null) {
  const effectiveId = !state.showHome && activeId ? activeId : null;
  state.tabs.forEach((tab) => {
    if (!tab.chatTerm || typeof tab.chatTerm.setActive !== 'function') return;
    tab.chatTerm.setActive(tab.id === effectiveId);
  });
}

function setActiveTab(id, { skipSave = false } = {}) {
  // Save current tab's chat history before switching
  const currentTab = state.tabs.find(x => x.id === state.activeId);
  if (!skipSave && currentTab?.chatTerm) {
    if (!currentTab.chatTerm.isCommandRunning) {
      currentTab.chatTerm.saveMessageHistory();
      scheduleTabSave(currentTab);
    } else {
      console.debug('[tabs] Skip saving chat history while command running');
    }
  }

  exitDescriptionEditMode({ discard: true });

  state.activeId = id;
  const t = state.tabs.find(x => x.id === id);
  if (!t) {
    syncChatTermActivity(null);
    sessionState.activeTab = null;
    scheduleSessionSave();
    renderTitleForTab(null);
    renderDescriptionForTab(null);
    return;
  }

  sessionState.activeTab = t.fileName || null;
  scheduleSessionSave();
  hideHome();

  syncChatTermActivity(t.id);

  if (t.chatTerm) {
    t.chatTerm.restoreMessageHistory();
  }

  renderTitleForTab(t);
  renderDescriptionForTab(t);

  // Update connection status
  // Update current path in chat input with just directory name
  updateCurrentPathDisplay();

  // Switch terminal UI based on mode
  if (state.useChatMode) {
    // Show chat terminal, hide xterm
    chatContainer.style.display = 'flex';
    chatContainer.style.flex = '';
    chatContainer.classList.remove('interactive-overlay');
    termEl.style.display = 'none';
    termEl.style.flex = '';
    if (commandInputWrapper) commandInputWrapper.style.display = 'block';

    if (t.chatTerm) {
      t.chatTerm.focus();
    }
  } else {
    // Terminal-focused view but keep chat history visible in a compact pane
    chatContainer.style.display = 'flex';
    chatContainer.style.flex = '0 0 220px';
    chatContainer.classList.add('interactive-overlay');
    termEl.style.display = 'block';
    termEl.style.flex = '1 1 auto';
    if (commandInputWrapper) commandInputWrapper.style.display = 'none';

    // Reattach xterm
    while (termEl.firstChild) termEl.removeChild(termEl.firstChild);
    t.term.open(termEl);
    t.term.focus();
    fitTerminalToPane();
  }

  renderTabs();
  scheduleScrollUpdate();
}

async function closeTab(id) {
  const i = state.tabs.findIndex(x => x.id === id);
  if (i >= 0) {
    const t = state.tabs[i];
    try {
      await persistTab(t);
    } catch (err) {
      console.error('[tabs] Failed to persist tab before closing:', err);
    }
    updateSavedTabMeta(t.fileName, {
      title: t.title,
      favorite: Boolean(t.favorite),
      description: typeof t.description === 'string' ? t.description : '',
      updatedAt: Date.now()
    });
    sm.term.kill({ ptyId: t.ptyId });
    t.term.dispose();
    if (t.saveTimer) {
      clearTimeout(t.saveTimer);
      t.saveTimer = null;
    }
    state.tabs.splice(i, 1);
    const nextTab = state.tabs[i] || state.tabs[i - 1] || state.tabs[0] || null;
    state.activeId = nextTab ? nextTab.id : null;
    renderTabs();
    if (state.activeId) {
      setActiveTab(state.activeId);
    } else {
      sessionState.activeTab = null;
      scheduleSessionSave();
      updateCurrentPathDisplay();
      showHome();
    }
    persistOpenTabs();
    try {
      await refreshSavedTabsList();
    } catch (_) {
      // Already logged inside refreshSavedTabsList
    }
    scheduleScrollUpdate();
  }
}

function fitTerminalToPane() {
  const rect = termEl.getBoundingClientRect();
  const cols = Math.max(40, Math.floor(rect.width / 8));
  const rows = Math.max(10, Math.floor(rect.height / 18));
  const t = state.tabs.find(x => x.id === state.activeId);
  if (t) (t.resize ? t.resize(cols, rows) : sm.term.resize({ ptyId: t.ptyId, cols, rows }));
}


function human(n) { if (n < 1024) return `${n} B`; const u=['KB','MB','GB','TB']; let i=-1; do { n/=1024; i++; } while(n>=1024&&i<u.length-1); return `${n.toFixed(1)} ${u[i]}`; }


window.addEventListener('resize', () => fitTerminalToPane());


function handleTermData(tabId, term, chatTerm, data) {
  // Handle CWD updates
  const idx = data.indexOf('SM_CWD:');
  if (idx >= 0) {
    const line = data.slice(idx).split('\n')[0];
    const v = line.replace(/^SM_CWD:/, '').trim();

    // Update tab's current working directory and title
    const tab = state.tabs.find(t => t.id === tabId);
    if (tab) {
      // Mark terminal as ready when we receive first CWD update
      if (!tab.terminalReady) {
        tab.terminalReady = true;
        console.log(`[terminal] Tab ${tabId} terminal is now ready`);
      }

      tab.cwd = v;
      if (!tab.customTitle) {
        tab.title = getDirName(v);
        updateSavedTabMeta(tab.fileName, {
          title: tab.title,
          favorite: tab.favorite,
          description: tab.description,
          customTitle: false,
          updatedAt: Date.now()
        });
      }

      // Update directory context for smart suggestions
      if (tab.chatTerm) {
        tab.chatTerm.updateDirectoryContext(v);
      }

      // Update current path display if this is the active tab
      if (tab.id === state.activeId) {
        updateCurrentPathDisplay();
      }

      renderTabs();
      if (tab.id === state.activeId) {
        renderTitleForTab(tab);
      }
    }

    // Remove CWD data from what's displayed to avoid showing it in terminal
    data = data.replace(/\r?\n?SM_CWD:.*\r?\n?/, '');
  }

  // Detect interactive sentinel to return to chat mode automatically
  if (data && data.includes(INTERACTIVE_SENTINEL)) {
    if (!state.useChatMode && typeof window.switchToChatMode === 'function') {
      window.switchToChatMode();
      if (chatTerm) {
        chatTerm.addSystemMessage('Interactive session ended. Returned to chat view.', 'ℹ️');
      }
    }
    const sentinelPattern = new RegExp(`\\r?\\n?${INTERACTIVE_SENTINEL}\\r?\\n?`, 'g');
    data = data.replace(sentinelPattern, '\n');
  }

  // Ensure we have a string to work with even if data is empty
  if (!data) {
    data = '';
  }

  term.write(data);

  // Auto scroll to bottom
  try {
    term.scrollToBottom();
  } catch (e) {
    // Fallback: manually scroll to bottom using DOM if xterm.js method fails
    const viewport = termEl.querySelector('.xterm-viewport');
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }

  // Send to chat terminal if in chat mode
  if (state.useChatMode && chatTerm) {
    if (state.activeId === tabId) {
      chatTerm.handleTerminalOutput(data);
    } else {
      const activeTab = getActiveTab();
      const activeTerm = activeTab?.chatTerm;
      if (activeTerm) {
        activeTerm.saveMessageHistory();
      }
      chatTerm.restoreMessageHistory();
      chatTerm.handleTerminalOutput(data);
      chatTerm.saveMessageHistory();
      if (activeTerm) {
        activeTerm.restoreMessageHistory();
      }
    }
  }

  scheduleScrollUpdate();
}

// ============ Keyboard Shortcuts ============
window.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

  // Global shortcuts (work anywhere except in input fields)
  const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
  const activeTab = state.tabs.find(t => t.id === state.activeId);

  // Ctrl/Cmd+N: New Tab
  if (ctrlOrCmd && e.key === 'n' && !inInput) {
    e.preventDefault();
    addNewTab();
    return;
  }

  // Ctrl/Cmd+W: Close Tab
  if (ctrlOrCmd && e.key === 'w' && !inInput) {
    e.preventDefault();
    if (state.activeId) closeTab(state.activeId);
    return;
  }

  // Ctrl+Tab / Ctrl+Shift+Tab: Switch Tabs
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault();
    const currentIdx = state.tabs.findIndex(t => t.id === state.activeId);
    if (currentIdx < 0) return;
    let nextIdx;
    if (e.shiftKey) {
      nextIdx = currentIdx === 0 ? state.tabs.length - 1 : currentIdx - 1;
    } else {
      nextIdx = currentIdx === state.tabs.length - 1 ? 0 : currentIdx + 1;
    }
    if (state.tabs[nextIdx]) setActiveTab(state.tabs[nextIdx].id);
    return;
  }

  // Ctrl+1, Ctrl+2, Ctrl+3... : Switch to specific tab (1-9)
  // Cmd+1, Cmd+2, Cmd+3... on Mac
  if (ctrlOrCmd && /^[1-9]$/.test(e.key) && !inInput) {
    e.preventDefault();
    const tabIndex = parseInt(e.key, 10) - 1;
    if (state.tabs[tabIndex]) {
      setActiveTab(state.tabs[tabIndex].id);
    }
    return;
  }

  // F5: Refresh files
  if (e.key === 'F5' && !inInput) {
    e.preventDefault();
    refreshFiles();
    return;
  }

  // Ctrl/Cmd+,: Settings (placeholder)
  if (ctrlOrCmd && e.key === ',' && !inInput) {
    e.preventDefault();
    alert('Settings page coming soon!');
    return;
  }

  // F2: Rename file
  if (e.key === 'F2' && !inInput) {
    e.preventDefault();
    if (selection.size !== 1) {
      alert('Select exactly one file to rename');
      return;
    }
    const name = Array.from(selection)[0];
    const t = state.tabs.find(x => x.id === state.activeId);
    if (!t) return;

    const newName = prompt('Enter new name:', name);
    if (!newName || newName === name) return;

    const oldPath = normalizePath(t.cwd, name);
    const newPath = normalizePath(t.cwd, newName);
    (async () => {
      const res = await sm.fs.rename({ oldPath, newPath });
      if (!res.ok) alert(`Rename failed: ${res.error}`);
      else { selection.clear(); refreshFiles(); }
    })();
    return;
  }

  // Delete: Delete file/folder
  if (e.key === 'Delete' && !inInput) {
    e.preventDefault();
    if (selection.size === 0) {
      alert('Select files to delete');
      return;
    }

    const targets = Array.from(selection);
    requestConfirmation({
      title: '删除文件',
      message: `Delete ${targets.length} item(s)?`,
      confirmText: '删除',
      cancelText: '取消'
    }).then(async (confirmed) => {
      if (!confirmed) return;
      const t = state.tabs.find(x => x.id === state.activeId);
      if (!t) return;

      for (const name of targets) {
        const fullPath = normalizePath(t.cwd, name);
        const row = Array.from(fileTbody.children).find(r => r.dataset.name === name);
        const isDir = row && row.dataset.type === 'dir';

        const res = await sm.fs.delete({ path: fullPath, isDir });
        if (!res.ok) alert(`Delete ${name} failed: ${res.error}`);
      }
      selection.clear();
      refreshFiles();
    });
    return;
  }
});

init();

function normalizePath(base, name) {
  const sep = base.includes('\\') ? '\\' : '/';
  const b = base.replace(/[\\/]+$/, '');
  return (b + sep + name).replace(/[\\/]+/g, sep);
}

// Extract directory name from path (similar to basename in Unix)
function getDirName(path) {
  if (!path) return '';

  // Remove trailing slashes
  path = path.replace(/[\\/]+$/, '');

  // Handle root directory cases
  if (path === '/' || path === '' || /^[A-Za-z]:\\?$/.test(path)) {
    return path === '/' ? '/' : (path || '~');
  }

  // Split path and get last component
  const parts = path.split(/[\\/]+/);
  return parts[parts.length - 1] || '~';
}

// Function to get current directory name for active tab
function getCurrentDirName() {
  const activeTab = state.tabs.find(t => t.id === state.activeId);
  if (activeTab && activeTab.cwd) {
    return getDirName(activeTab.cwd);
  }
  return '~';
}

// Function to update the current path display with just the directory name
function updateCurrentPathDisplay() {
  const currentPath = document.getElementById('currentPath');
  if (currentPath) {
    currentPath.textContent = getCurrentDirName();
  }
}

function parentPath(p) {
  const isWin = p.includes('\\');
  const parts = p.split(isWin ? /\\+/ : /\/+/, );
  if (parts.length <= 1) return p;
  parts.pop();
  let joined = parts.join(isWin ? '\\' : '/');
  if (!joined) joined = isWin ? 'C:\\' : '/';
  return joined;
}
const txDrawer = document.getElementById('txDrawer');
const txList = document.getElementById('txList');
const txCount = document.getElementById('txCount');

sm.tx.on((msg)=> { if (msg.type==='progress' || msg.type==='done' || msg.type==='error' || msg.type==='paused' || msg.type==='resumed') refreshTransfers(); });

function toggleTx(show) { txDrawer.classList.toggle('hidden', !show); }

// Transfer drawer close button
txCloseBtn.onclick = () => toggleTx(false);

async function refreshTransfers() {
  const res = await sm.tx.list(); if (!res.ok) return;
  const list = res.data;
  txList.innerHTML = '';
  txCount.textContent = `${list.filter(x=>x.state==='running').length} running`;
  for (const t of list.slice(-50)) {
    const el = document.createElement('div'); el.className='transfer-item';

    // Transfer info
    const info = document.createElement('div'); info.className='transfer-info';
    const name = document.createElement('div'); name.className='transfer-name';
    name.textContent = `${t.kind} ${t.localPath || ''} ${t.kind==='upload'?'→':'←'} ${t.remotePath || ''}`;
    name.title = name.textContent;

    const status = document.createElement('div'); status.className='transfer-status';
    status.textContent = t.state;
    if (t.state === 'completed') status.style.color = 'var(--color-success)';
    else if (t.state === 'failed') status.style.color = 'var(--color-error)';
    else if (t.state === 'running') status.style.color = 'var(--color-accent)';
    else if (t.state === 'paused') status.style.color = 'var(--color-warning)';

    info.append(name, status);

    // Transfer metadata
    const meta = document.createElement('div');
    meta.style.fontSize = 'var(--font-size-xs)';
    meta.style.color = 'var(--text-tertiary)';
    meta.style.marginTop = 'var(--space-xs)';
    if (t.total) {
      const pct = Math.min(100, Math.round(((t.transferred||0)/t.total)*100));
      meta.textContent = `${human(t.transferred||0)} / ${human(t.total)} (${pct}%)`;
    } else if (t.error) {
      meta.textContent = t.error;
      meta.style.color = 'var(--color-error)';
    }

    // Progress bar
    const progContainer = document.createElement('div'); progContainer.className='transfer-progress';
    const progBar = document.createElement('div'); progBar.className='transfer-progress-bar';
    const pct = t.total ? Math.min(100, Math.round(((t.transferred||0)/t.total)*100)) : 0;
    progBar.style.width = pct + '%';
    progContainer.appendChild(progBar);

    // Control buttons
    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = 'var(--space-xs)';
    controls.style.marginTop = 'var(--space-xs)';

    if (t.state === 'running') {
      const pauseBtn = document.createElement('button');
      pauseBtn.className = 'btn-secondary';
      pauseBtn.textContent = 'Pause';
      pauseBtn.style.fontSize = 'var(--font-size-xs)';
      pauseBtn.style.height = '20px';
      pauseBtn.style.padding = '0 var(--space-sm)';
      pauseBtn.onclick = async () => {
        await sm.tx.control({ taskId: t.id, action: 'pause' });
        refreshTransfers();
      };
      controls.appendChild(pauseBtn);

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn-secondary';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.fontSize = 'var(--font-size-xs)';
      cancelBtn.style.height = '20px';
      cancelBtn.style.padding = '0 var(--space-sm)';
      cancelBtn.onclick = async () => {
        await sm.tx.control({ taskId: t.id, action: 'cancel' });
        refreshTransfers();
      };
      controls.appendChild(cancelBtn);
    }

    if (t.state === 'queued') {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn-secondary';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.fontSize = 'var(--font-size-xs)';
      cancelBtn.style.height = '20px';
      cancelBtn.style.padding = '0 var(--space-sm)';
      cancelBtn.onclick = async () => {
        await sm.tx.control({ taskId: t.id, action: 'cancel' });
        refreshTransfers();
      };
      controls.appendChild(cancelBtn);
    }

    if (t.state === 'paused') {
      const resumeBtn = document.createElement('button');
      resumeBtn.className = 'btn-primary';
      resumeBtn.textContent = 'Resume';
      resumeBtn.style.fontSize = 'var(--font-size-xs)';
      resumeBtn.style.height = '20px';
      resumeBtn.style.padding = '0 var(--space-sm)';
      resumeBtn.onclick = async () => {
        await sm.tx.control({ taskId: t.id, action: 'resume' });
        refreshTransfers();
      };
      controls.appendChild(resumeBtn);

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn-secondary';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.fontSize = 'var(--font-size-xs)';
      cancelBtn.style.height = '20px';
      cancelBtn.style.padding = '0 var(--space-sm)';
      cancelBtn.onclick = async () => {
        await sm.tx.control({ taskId: t.id, action: 'cancel' });
        refreshTransfers();
      };
      controls.appendChild(cancelBtn);
    }

    if (t.state === 'failed') {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'btn-primary';
      retryBtn.textContent = 'Retry';
      retryBtn.style.fontSize = 'var(--font-size-xs)';
      retryBtn.style.height = '20px';
      retryBtn.style.padding = '0 var(--space-sm)';
      retryBtn.onclick = async () => {
        // Re-enqueue the task
        const newTask = { ...t };
        delete newTask.id;
        delete newTask.state;
        delete newTask.error;
        delete newTask.attempts;
        await sm.tx.enqueue(newTask);
        refreshTransfers();
      };
      controls.appendChild(retryBtn);
    }

    el.append(info, meta, progContainer, controls);
    txList.appendChild(el);
  }
}
// ============ Command Palette ============
import { CommandPalette } from './command-palette.mjs';

const commandPalette = new CommandPalette();

// Register commands
commandPalette.registerCommands([
  { id: 'closeTab', icon: '✕', name: 'Close Tab', description: 'Close current tab', tags: ['terminal'], action: () => { if (state.activeId) closeTab(state.activeId); } },
  { id: 'clearTerminal', icon: '🧹', name: 'Clear Terminal', description: 'Clear terminal screen', tags: ['terminal'], action: () => { const t = state.tabs.find(x => x.id === state.activeId); if (t && t.write) t.write('clear\r'); } }
]);

// Update translations when locale changes
i18n.onChange(() => {
  applyLocaleTextAndRefresh();
});

// Add shortcuts to keyboard handler
window.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
  const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

  // Ctrl+C: Copy selected text (when text is selected, but not in command input)
  if (e.ctrlKey && e.key === 'c') {
    // If we're in the command input (textarea), let the chat terminal handle it
    if (e.target.id === 'commandInput') {
      // Let the event propagate to chat-terminal.mjs handler
      return;
    }

    // Otherwise, handle copy if text is selected
    const selectedText = window.getSelection().toString();
    if (selectedText) {
      e.preventDefault();
      copySelectedText();
      return;
    }
  }

  // Ctrl+A: Select all text in chat
  if (e.ctrlKey && e.key === 'a') {
    // Only trigger select all if we're in the chat area
    if (chatContainer.contains(e.target) && !inInput) {
      e.preventDefault();
      selectAllText();
      return;
    }
  }

  // ESC: Close command palette
  if (e.key === 'Escape') {
    if (!commandPalette.modal.classList.contains('hidden')) {
      commandPalette.hide();
      e.preventDefault();
      return;
    }
  }
}, true); // Use capture phase to intercept before other handlers


// ============ File Conflict Resolution ============
const conflictModal = document.getElementById('conflictModal');
const conflictText = document.getElementById('conflictText');
const conflictFileName = document.getElementById('conflictFileName');
const conflictCancel = document.getElementById('conflictCancel');
const conflictRename = document.getElementById('conflictRename');
const conflictOverwrite = document.getElementById('conflictOverwrite');

let pendingConflict = null;

// Show conflict resolution dialog
function showConflictDialog(task, existingPath) {
  const fileName = existingPath.split(/[\\/]/).pop();
  conflictText.textContent = `A file named "${fileName}" already exists at the destination. What would you like to do?`;
  conflictFileName.value = fileName;
  
  pendingConflict = { task, existingPath, fileName };
  conflictModal.classList.remove('hidden');
  setTimeout(() => conflictFileName.focus(), 100);
}

// Close conflict modal
function closeConflictModal() {
  conflictModal.classList.add('hidden');
  pendingConflict = null;
}

// Handle conflict resolution
conflictCancel.onclick = () => {
  if (pendingConflict) {
    // Cancel the transfer
    sm.tx.control({ taskId: pendingConflict.task.id, action: 'cancel' });
  }
  closeConflictModal();
};

conflictRename.onclick = () => {
  if (pendingConflict) {
    const newName = conflictFileName.value.trim();
    if (!newName || newName === pendingConflict.fileName) {
      alert('Please provide a different file name');
      return;
    }
    
    // Update task with new name
    const t = pendingConflict.task;
    const oldPath = t.kind === 'upload' ? t.remotePath : t.localPath;
    const dir = oldPath.substring(0, oldPath.lastIndexOf(/[\\/]/.test(oldPath) ? /[\\/]/ : '/'));
    const newPath = `${dir}/${newName}`;
    
    if (t.kind === 'upload') {
      t.remotePath = newPath;
    } else {
      t.localPath = newPath;
    }
    
    // Resume transfer with new path
    sm.tx.control({ taskId: t.id, action: 'resume' });
  }
  closeConflictModal();
};

conflictOverwrite.onclick = () => {
  if (pendingConflict) {
    // Set policy to overwrite and resume
    const t = pendingConflict.task;
    t.policy = 'overwrite';
    sm.tx.control({ taskId: t.id, action: 'resume' });
  }
  closeConflictModal();
};

// Close modal on backdrop click
conflictModal.addEventListener('click', (e) => {
  if (e.target === conflictModal || e.target.classList.contains('modal-backdrop')) {
    conflictCancel.click();
  }
});

// ESC to close conflict modal
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !conflictModal.classList.contains('hidden')) {
    e.preventDefault();
    conflictCancel.click();
  }
}, true);

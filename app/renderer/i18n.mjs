/* i18n Translation System */

const translations = {
  'zh-CN': {
    // App Title
    'app.title': 'SmartTerminal',
    'app.subtitle': '智能终端工作台',

    // Home Page
    'home.intro.kicker': '智能终端工作台',
    'home.intro.subtitle': '让命令行与结构化笔记在一个界面内协同，保持专注与节奏。',
    'home.action.newChat': '开始新的对话',
    'home.action.browseAll': '浏览全部对话',
    'home.action.settings': '打开设置',
    'home.action.clearTrash': '清空回收站',
    'home.action.allConversations': '全部对话',
    'home.action.recycleBin': '回收站',

    // Tabs
    'tab.untitled': '未命名',
    'tab.untitledDisplay': '未命名对话',

    // Chat Detail
    'chat.title.hint': '双击重命名 • Enter 保存',
    'chat.title.placeholder': '输入对话名称',
    'chat.description.title': '对话说明',
    'chat.description.hint': '双击编辑 • Shift+Enter 保存',
    'chat.description.empty': '暂无说明，双击此处添加。',
    'chat.description.placeholder': '使用 Markdown 描述这个对话的目的、上下文或使用方式...',
    'chat.scroll.top': '回到顶部',
    'chat.scroll.bottom': '滚动到底',
    'chat.title.emptyError': '对话名称不能为空',

    // Modal
    'modal.confirm.title': '请确认',
    'modal.confirm.ok': '确定',
    'modal.confirm.cancel': '取消',
    'modal.confirm.defaultMessage': '确定要执行此操作吗？',

    // Home Confirmations
    'home.recycle.confirmTitle': '清空回收站',
    'home.recycle.confirmMessage': '确定要清空回收站吗？此操作无法撤销。',
    'home.recycle.confirmAction': '清空',
    'home.delete.confirmTitle': '删除对话',
    'home.delete.confirmMessage': '确定要删除该对话吗？删除后可在回收站中查看并可清空。',
    'home.delete.confirmAction': '删除',
    'home.favorite.add': '设为收藏',
    'home.favorite.remove': '取消收藏',

    // Features
    'feature.coreWorkspace': '统一命令工作台',
    'feature.coreWorkspace.desc': 'AI提示、快捷执行与多标签终端融为一体',
    'feature.sessionHistory': '上下文历史管理',
    'feature.sessionHistory.desc': '历史卡片、收藏与回收站让常用命令随取随用',
    'feature.richPreview': '丰富回显与预览',
    'feature.richPreview.desc': '结构化Out区域，/view即时预览Markdown与图片',

    // Sections
    'section.favorites': '收藏的对话',
    'section.favorites.hint': '重要会话快速访问，高频任务一键恢复',
    'section.favorites.empty': '暂无收藏的对话。',
    'section.all': '全部对话',
    'section.all.hint': '所有会话历史，随时恢复工作上下文',
    'section.all.empty': '还没有保存的对话，点击"开始新的对话"开启第一步。',
    'section.trash': '回收站',
    'section.trash.hint': '临时保留的对话可随时恢复或清理',
    'section.trash.empty': '回收站为空。',

    // Settings
    'settings.title': '设置',
    'settings.language': '语言',
    'settings.language.zh': '中文',
    'settings.language.en': 'English',
    'settings.theme': '主题',
    'settings.theme.light': '亮色',
    'settings.theme.dark': '暗色',
    'settings.theme.system': '跟随系统',
    'settings.font': '字体',
    'settings.font.command': '命令行字体',
    'settings.font.output': '回显字体',
    'settings.font.size': '字体大小',
    'settings.font.color': '字体颜色',
    'settings.font.apply': '应用',
    'settings.font.reset': '重置',
    'settings.back': '返回首页',
    // Transfers
    'settings.transfers': '文件传输',
    'settings.transfers.downloads': '下载',
    'settings.transfers.downloadsDir': '下载保存目录',
    'settings.transfers.choose': '选择…',
    'settings.transfers.hint': '默认保存到系统下载文件夹，可在此处修改。',
    'settings.transfers.downloadsDir.placeholder': '~/Downloads',
    'settings.save': '保存',
    'settings.reset': '恢复默认',

    // Buttons
    'button.newTab': '新建对话',
    'button.restore': '恢复',
    'button.delete': '删除',
    'button.deletePermanently': '永久删除',

    // Input
    'input.tabName': '输入对话名称',
    'input.command': '输入命令并按 Shift+Enter...',
    'input.restart': '会话正在重启，请稍候…',
    'input.description': '添加描述（支持 Markdown）...',

    // Execute button
    'command.execute.title': '执行命令',
    'command.execute.aria': '执行当前命令',
    'command.execute.short': '执行',
    'command.view.missingPath': '请提供要预览的文件路径',
    'command.view.unsupported': '暂不支持预览该类型文件',
    'command.view.remoteUnsupported': '远程会话暂不支持 /view 预览',
    'command.view.loading': '正在加载预览…',
    'command.view.tooLarge': '文件过大，无法预览（限制 {{limit}}，实际 {{size}}）',
    'command.view.notFound': '未找到文件：{{path}}',
    'command.view.readFailed': '读取文件失败',
    'command.view.notAvailable': '当前版本暂不支持 /view 功能',
    'command.view.kind.image': '图像',
    'command.view.kind.markdown': 'Markdown',

    // Session restart
    'session.restart.inProgress': '正在重启会话…',

    // Cell Input
    'cell.input.placeholder': '输入命令，Shift+Enter 执行',
    'cell.input.ariaLabel': '命令编辑框',

    // Messages
    'message.terminalInit': 'Terminal正在初始化，请稍候...',
    'message.tabClosed': '标签页已关闭',
    'message.saved': '已保存',

    // Cell Controls
    'cell.control.stop': '停止',
    'cell.control.stop.title': '停止当前命令 (Ctrl+C)',
    'cell.control.copy': '复制',
    'cell.control.copy.title': '复制输出内容',
    'cell.control.follow': '自动滚动',
    'cell.control.follow.title': '执行中且折叠时，自动将回显滚动到底部',

    // Aria Labels
    'aria.scrollLeft': '向左滚动标签页',
    'aria.scrollRight': '向右滚动标签页',
    'aria.newTab': '新建对话',
    'aria.closeTab': '关闭标签页',
    'aria.settings': '设置',

    // Command Suggestions
    'suggestions.title': '智能建议',
    'suggestions.hint': '↑↓ 导航 • Enter 选择 • Esc 关闭',

    // Command Palette
    'commandPalette.placeholder': '输入命令...',
    'commandPalette.hint': '↑↓ 导航 • Enter 执行 • Esc 关闭',
    'commandPalette.empty': '未找到匹配的命令',
    'commandPalette.closeTab.name': '关闭标签页',
    'commandPalette.closeTab.description': '关闭当前标签页',
    'commandPalette.clearTerminal.name': '清空终端',
    'commandPalette.clearTerminal.description': '清空当前终端屏幕',
    'commandPalette.openSshTmux.name': '打开 SSH 会话',
    'commandPalette.openSshTmux.description': '启动一个基于 tmux 的 SSH 终端',

    // Context Menus
    'context.copy': '复制',
    'context.selectAll': '全选',
    'context.rename': '重命名',
    'context.delete': '删除',
    'context.newFolder': '新建文件夹',
    'context.newFile': '新建文件',
    'context.copyPath': '复制路径',
    'context.refresh': '刷新',

    // Transfers Drawer
    'transfers.drawerTitle': '文件传输',
    'transfers.countActive': '{{count}} 个活动任务',
    'transfers.close': '关闭',
    'transfers.kind.upload': '上传',
    'transfers.kind.download': '下载',
    'transfers.state.running': '进行中',
    'transfers.state.completed': '已完成',
    'transfers.state.failed': '失败',
    'transfers.state.paused': '已暂停',
    'transfers.state.queued': '排队中',
    'transfers.button.pause': '暂停',
    'transfers.button.cancel': '取消',
    'transfers.button.resume': '继续',
    'transfers.button.retry': '重试',

    // Conflict Modal
    'conflict.title': '文件已存在',
    'conflict.description': '名为“{{fileName}}”的文件已存在于目标位置。请选择操作方式。',
    'conflict.fieldLabel': '文件名',
    'conflict.noteLabel': '提示：',
    'conflict.note': '选择“覆盖”将替换现有文件；使用“重命名”可保留两个文件。',
    'conflict.cancel': '取消',
    'conflict.rename': '重命名',
    'conflict.overwrite': '覆盖',
    'conflict.error.differentName': '请使用不同的文件名'
  },

  'en': {
    // App Title
    'app.title': 'SmartTerminal',
    'app.subtitle': 'Intelligent Terminal Workspace',

    // Home Page
    'home.intro.kicker': 'INTELLIGENT TERMINAL WORKSPACE',
    'home.intro.subtitle': 'Seamlessly combine command-line and structured notes in one interface, stay focused and productive.',
    'home.action.newChat': 'Start New Session',
    'home.action.browseAll': 'Browse All Sessions',
    'home.action.settings': 'Open Settings',
    'home.action.clearTrash': 'Empty Trash',
    'home.action.allConversations': 'All Conversations',
    'home.action.recycleBin': 'Recycle Bin',

    // Tabs
    'tab.untitled': 'Untitled',
    'tab.untitledDisplay': 'Untitled',

    // Chat Detail
    'chat.title.hint': 'Double-click to rename • Enter to save',
    'chat.title.placeholder': 'Enter session name',
    'chat.description.title': 'Session Notes',
    'chat.description.hint': 'Double-click to edit • Shift+Enter to save',
    'chat.description.empty': 'No notes yet. Double-click here to add one.',
    'chat.description.placeholder': 'Use Markdown to capture the purpose, context, or usage for this session...',
    'chat.scroll.top': 'Scroll to top',
    'chat.scroll.bottom': 'Scroll to bottom',
    'chat.title.emptyError': 'Session name cannot be empty',

    // Modal
    'modal.confirm.title': 'Please Confirm',
    'modal.confirm.ok': 'Confirm',
    'modal.confirm.cancel': 'Cancel',
    'modal.confirm.defaultMessage': 'Are you sure you want to continue?',

    // Home Confirmations
    'home.recycle.confirmTitle': 'Empty Trash',
    'home.recycle.confirmMessage': 'Empty the trash? This action cannot be undone.',
    'home.recycle.confirmAction': 'Empty',
    'home.delete.confirmTitle': 'Delete Session',
    'home.delete.confirmMessage': 'Delete this session? You can still find it in Trash until you clear it.',
    'home.delete.confirmAction': 'Delete',
    'home.favorite.add': 'Add to favorites',
    'home.favorite.remove': 'Remove favorite',

    // Features
    'feature.coreWorkspace': 'Unified Command Workspace',
    'feature.coreWorkspace.desc': 'AI suggestions, quick execution, and multi-tab terminals in one place',
    'feature.sessionHistory': 'Contextual History Management',
    'feature.sessionHistory.desc': 'History cards, favorites, and trash keep common commands at hand',
    'feature.richPreview': 'Rich Output & Preview',
    'feature.richPreview.desc': 'Structured Out area plus /view previews for Markdown and images',

    // Sections
    'section.favorites': 'Favorites',
    'section.favorites.hint': 'Quick access to important sessions, restore frequently-used tasks instantly',
    'section.favorites.empty': 'No favorite sessions yet.',
    'section.all': 'All Sessions',
    'section.all.hint': 'Complete session history, restore your work context anytime',
    'section.all.empty': 'No saved sessions yet. Click "Start New Session" to begin.',
    'section.trash': 'Trash',
    'section.trash.hint': 'Temporarily stored sessions, restore or clean up anytime',
    'section.trash.empty': 'Trash is empty.',

    // Settings
    'settings.title': 'Settings',
    'settings.language': 'Language',
    'settings.language.zh': '中文',
    'settings.language.en': 'English',
    'settings.theme': 'Theme',
    'settings.theme.light': 'Light',
    'settings.theme.dark': 'Dark',
    'settings.theme.system': 'System',
    'settings.font': 'Font',
    'settings.font.command': 'Command Font',
    'settings.font.output': 'Output Font',
    'settings.font.size': 'Font Size',
    'settings.font.color': 'Font Color',
    'settings.font.apply': 'Apply',
    'settings.font.reset': 'Reset',
    'settings.back': 'Back to Home',
    // Transfers
    'settings.transfers': 'Transfers',
    'settings.transfers.downloads': 'Downloads',
    'settings.transfers.downloadsDir': 'Save To',
    'settings.transfers.choose': 'Choose…',
    'settings.transfers.hint': 'Default to system Downloads folder. You can change it here.',
    'settings.transfers.downloadsDir.placeholder': 'e.g., ~/Downloads',
    'settings.save': 'Save',
    'settings.reset': 'Reset to Default',

    // Buttons
    'button.newTab': 'New Session',
    'button.restore': 'Restore',
    'button.delete': 'Delete',
    'button.deletePermanently': 'Delete Permanently',

    // Input
    'input.tabName': 'Enter session name',
    'input.command': 'Type a command and press Shift+Enter...',
    'input.restart': 'Session is restarting… please wait',
    'input.description': 'Add description (Markdown supported)...',

    // Execute button
    'command.execute.title': 'Run command',
    'command.execute.aria': 'Run the current command',
    'command.execute.short': 'Run',
    'command.view.missingPath': 'Provide a file path to preview',
    'command.view.unsupported': 'Preview is not available for this file type yet',
    'command.view.remoteUnsupported': 'Preview is not available while connected over SSH yet',
    'command.view.loading': 'Loading preview…',
    'command.view.tooLarge': 'File is too large to preview (limit {{limit}}, actual {{size}})',
    'command.view.notFound': 'File not found: {{path}}',
    'command.view.readFailed': 'Failed to read the file',
    'command.view.notAvailable': 'The /view preview feature is not available in this build',
    'command.view.kind.image': 'Image',
    'command.view.kind.markdown': 'Markdown',

    // Session restart
    'session.restart.inProgress': 'Restarting session…',

    // Cell Input
    'cell.input.placeholder': 'Type a command, Shift+Enter to run',
    'cell.input.ariaLabel': 'Command editor',

    // Messages
    'message.terminalInit': 'Terminal is initializing, please wait...',
    'message.tabClosed': 'Tab closed',
    'message.saved': 'Saved',

    // Cell Controls
    'cell.control.stop': 'Stop',
    'cell.control.stop.title': 'Stop current command (Ctrl+C)',
    'cell.control.copy': 'Copy',
    'cell.control.copy.title': 'Copy output content',
    'cell.control.follow': 'Follow',
    'cell.control.follow.title': 'Auto-scroll to bottom while running and collapsed',

    // Aria Labels
    'aria.scrollLeft': 'Scroll tabs left',
    'aria.scrollRight': 'Scroll tabs right',
    'aria.newTab': 'New session',
    'aria.closeTab': 'Close tab',
    'aria.settings': 'Settings',

    // Command Suggestions
    'suggestions.title': 'Suggestions',
    'suggestions.hint': '↑↓ Navigate • Enter Select • Esc Close',

    // Command Palette
    'commandPalette.placeholder': 'Type a command...',
    'commandPalette.hint': '↑↓ Navigate • Enter Execute • Esc Close',
    'commandPalette.empty': 'No commands found',
    'commandPalette.closeTab.name': 'Close Tab',
    'commandPalette.closeTab.description': 'Close current tab',
    'commandPalette.clearTerminal.name': 'Clear Terminal',
    'commandPalette.clearTerminal.description': 'Clear terminal screen',
    'commandPalette.openSshTmux.name': 'Open SSH Session',
    'commandPalette.openSshTmux.description': 'Start a tmux-backed SSH terminal',

    // Context Menus
    'context.copy': 'Copy',
    'context.selectAll': 'Select All',
    'context.rename': 'Rename',
    'context.delete': 'Delete',
    'context.newFolder': 'New Folder',
    'context.newFile': 'New File',
    'context.copyPath': 'Copy Path',
    'context.refresh': 'Refresh',

    // Transfers Drawer
    'transfers.drawerTitle': 'File Transfers',
    'transfers.countActive': '{{count}} active',
    'transfers.close': 'Close',
    'transfers.kind.upload': 'Upload',
    'transfers.kind.download': 'Download',
    'transfers.state.running': 'Running',
    'transfers.state.completed': 'Completed',
    'transfers.state.failed': 'Failed',
    'transfers.state.paused': 'Paused',
    'transfers.state.queued': 'Queued',
    'transfers.button.pause': 'Pause',
    'transfers.button.cancel': 'Cancel',
    'transfers.button.resume': 'Resume',
    'transfers.button.retry': 'Retry',

    // Conflict Modal
    'conflict.title': 'File Already Exists',
    'conflict.description': 'A file named "{{fileName}}" already exists at the destination. What would you like to do?',
    'conflict.fieldLabel': 'File Name',
    'conflict.noteLabel': 'Note:',
    'conflict.note': 'Choosing "Overwrite" will replace the existing file. Use "Rename" to keep both files.',
    'conflict.cancel': 'Cancel',
    'conflict.rename': 'Rename',
    'conflict.overwrite': 'Overwrite',
    'conflict.error.differentName': 'Please provide a different file name'
  }
};

class I18n {
  constructor() {
    this.currentLocale = this.detectLocale();
    this.listeners = [];
    document.documentElement.lang = this.currentLocale;
  }

  detectLocale() {
    // Check saved preference
    const saved = localStorage.getItem('smarterminal_locale');
    if (saved && translations[saved]) {
      return saved;
    }

    // Detect from browser
    const browserLang = navigator.language || navigator.userLanguage;
    if (browserLang.startsWith('zh')) {
      return 'zh-CN';
    }
    return 'en';
  }

  setLocale(locale) {
    if (!translations[locale]) {
      console.warn(`Locale ${locale} not found, falling back to en`);
      locale = 'en';
    }

    this.currentLocale = locale;
    localStorage.setItem('smarterminal_locale', locale);

    // Notify listeners
    this.listeners.forEach(listener => listener(locale));

    // Update HTML lang attribute
    document.documentElement.lang = locale;
  }

  t(key, fallback = key, params) {
    const translation = translations[this.currentLocale]?.[key];
    const template = translation !== undefined ? translation : fallback;
    if (typeof template === 'string' && params && typeof params === 'object') {
      return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
        return Object.prototype.hasOwnProperty.call(params, name) ? params[name] : '';
      });
    }
    return template;
  }

  onChange(listener) {
    this.listeners.push(listener);
  }

  getAvailableLocales() {
    return Object.keys(translations);
  }
}

export const i18n = new I18n();
export default i18n;

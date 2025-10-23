// Electron main process. Minimal secure defaults + IPC whitelist.
const { app, BrowserWindow, ipcMain, shell, dialog, clipboard, crashReporter, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const Store = require('electron-store');
let pty = null;
try { pty = require('node-pty'); } catch (e) {
  console.warn('[main] node-pty not available, falling back to stdio shell (limited):', e?.message || e);
}
const { spawn } = require('child_process');
const kill = require('tree-kill');
const ProcessMonitor = require('./process-monitor');
const OutputStreamer = require('./output-streamer');
const CommandExecutor = require('./command-executor');
const { FileLogger } = require('./logger');

const TAB_DIR_NAME = 'tabs';
const TAB_EXTENSION = '.smt';
const fsp = fs.promises;

function findExecutable(candidate) {
  if (!candidate) return null;
  const hasPathSeparator = candidate.includes(path.sep) || candidate.includes('/');
  if (hasPathSeparator) {
    return fs.existsSync(candidate) ? candidate : null;
  }

  const pathEnv = process.env.PATH || '';
  const segments = pathEnv.split(path.delimiter).filter(Boolean);
  const tryNames = [candidate];
  if (process.platform === 'win32') {
    const pathext = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
      .split(';')
      .filter(Boolean);
    for (const ext of pathext) {
      const upper = ext.toUpperCase();
      if (!candidate.toUpperCase().endsWith(upper)) {
        tryNames.push(candidate + ext.toLowerCase());
      }
    }
  }
  for (const dir of segments) {
    for (const name of tryNames) {
      const full = path.join(dir, name);
      if (fs.existsSync(full)) {
        return full;
      }
    }
  }
  return null;
}

function resolveShellExecutable(explicit) {
  if (process.platform === 'win32') {
    const candidates = [
      explicit,
      process.env.COMSPEC,
      'powershell.exe',
      'pwsh.exe',
      'cmd.exe'
    ];
    for (const candidate of candidates) {
      const resolved = findExecutable(candidate);
      if (resolved) return resolved;
    }
    return null;
  }

  const candidates = [
    explicit,
    process.env.SHELL,
    '/bin/zsh',
    '/usr/bin/zsh',
    '/bin/bash',
    '/usr/bin/bash',
    '/bin/sh',
    '/usr/bin/sh'
  ];
  for (const candidate of candidates) {
    const resolved = findExecutable(candidate);
    if (resolved) return resolved;
  }
  return null;
}

// Persistent settings/session
const settings = new Store({ name: 'settings', defaults: { splitRatio: 0.6, searchLimitLines: 20000 } });
const sessionStore = new Store({ name: 'session', defaults: { windows: [] } });

const isMac = process.platform === 'darwin';

function buildAppMenu() {
  try {
    const logDir = () => {
      const dir = path.join(app.getPath('userData'), 'logs');
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    };
    const template = [
      ...(isMac ? [{
        label: app.name || 'SmartTerminal',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ]
      }] : []),
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
          { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' },
          { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        role: 'window',
        submenu: [ { role: 'minimize' }, { role: 'close' } ]
      },
      {
        role: 'help',
        submenu: [
          { label: '打开日志文件夹…', click: () => shell.openPath(logDir()) },
          { label: '复制日志目录路径', click: () => clipboard.writeText(logDir()) },
        ]
      }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  } catch (e) {
    console.warn('[menu] failed to build menu:', e?.message || e);
  }
}

/** @type {Map<string, import('node-pty').IPty>} */
const PTYS = new Map();
/** @type {Map<string, any>} */
const SSH_CONNS = new Map();
/** @type {Map<string, ProcessMonitor>} */
const MONITORS = new Map();
/** @type {Map<string, OutputStreamer>} */
const STREAMERS = new Map();
/** @type {CommandExecutor} */
let commandExecutor = null;

// Lightweight app-level metrics sampling (uses Electron app.getAppMetrics)
let APP_METRICS_TIMER = null;
let APP_METRICS_STREAM = null;
let LOGGER = null;
let EVENT_LOOP_TIMER = null;
let EVENT_LOOP_HIST = null;
function startAppMetricsSampling() {
  try {
    const metricsDir = path.join(app.getPath('userData'), 'metrics');
    fs.mkdirSync(metricsDir, { recursive: true });
    const file = path.join(metricsDir, 'app-metrics.csv');
    const exists = fs.existsSync(file);
    APP_METRICS_STREAM = fs.createWriteStream(file, { flags: 'a' });
    if (!exists) {
      APP_METRICS_STREAM.write('timestamp,total_cpu,main_cpu,renderers_cpu,gpu_cpu,proc_count,total_working_set_mb\n');
    }
  } catch (e) {
    console.warn('[metrics] failed to init stream', e?.message || e);
    APP_METRICS_STREAM = null;
  }
  if (APP_METRICS_TIMER) return;
  APP_METRICS_TIMER = setInterval(() => {
    try {
      const entries = app.getAppMetrics ? app.getAppMetrics() : [];
      let ts = Date.now();
      let totalCpu = 0, mainCpu = 0, renderCpu = 0, gpuCpu = 0, count = 0, totalWS = 0;
      for (const m of entries) {
        const cpu = m?.cpu?.percentCPUUsage || 0;
        const ws = m?.memory?.workingSetSize || 0;
        totalCpu += cpu; totalWS += ws; count++;
        const type = (m?.type || '').toLowerCase();
        if (type === 'browser') mainCpu += cpu;
        else if (type === 'renderer') renderCpu += cpu;
        else if (type === 'gpu') gpuCpu += cpu;
      }
      const line = `${ts},${totalCpu.toFixed(2)},${mainCpu.toFixed(2)},${renderCpu.toFixed(2)},${gpuCpu.toFixed(2)},${count},${(totalWS/1048576).toFixed(2)}\n`;
      if (APP_METRICS_STREAM) APP_METRICS_STREAM.write(line);
    } catch (e) {
      // ignore sampling errors
    }
  }, 1000);
}
function stopAppMetricsSampling() {
  if (APP_METRICS_TIMER) { clearInterval(APP_METRICS_TIMER); APP_METRICS_TIMER = null; }
  try { if (APP_METRICS_STREAM) { APP_METRICS_STREAM.end(); APP_METRICS_STREAM = null; } } catch (_) {}
}

function setupCrashAndDiagnostics() {
  try {
    // Start crash reporter (no upload; dumps stored locally)
    crashReporter.start({
      productName: 'SmartTerminal',
      companyName: 'SmartTerminal',
      submitURL: 'https://invalid.local',
      uploadToServer: false,
      compress: true,
      ignoreSystemCrashHandler: false,
      rateLimit: true,
    });
  } catch (e) {
    console.warn('[crashReporter] start failed:', e?.message || e);
  }

  // Init structured logger
  try {
    LOGGER = new FileLogger({ getUserData: () => app.getPath('userData'), product: 'SmartTerminal' });
    LOGGER.info('logger.init', { version: app.getVersion?.() || '0', electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node });
  } catch (e) {
    console.warn('[logger] init failed:', e?.message || e);
  }

  // Wire console to also write into file (non-intrusive)
  const _log = console.log.bind(console);
  const _warn = console.warn.bind(console);
  const _err = console.error.bind(console);
  console.log = (...args) => { try { LOGGER && LOGGER.info(args.join(' ')); } catch(_){}; _log(...args); };
  console.warn = (...args) => { try { LOGGER && LOGGER.warn(args.join(' ')); } catch(_){}; _warn(...args); };
  console.error = (...args) => { try { LOGGER && LOGGER.error(args.join(' ')); } catch(_){}; _err(...args); };

  // Process-level error handlers
  process.on('uncaughtException', (err) => {
    const meta = { type: 'uncaughtException', name: err?.name, message: err?.message, stack: String(err?.stack || '') };
    try { LOGGER && LOGGER.error('process.uncaughtException', meta); } catch(_){}
    _err('[uncaughtException]', err);
  });
  process.on('unhandledRejection', (reason, promise) => {
    const meta = { type: 'unhandledRejection', reason: String(reason), stack: reason && reason.stack ? String(reason.stack) : '' };
    try { LOGGER && LOGGER.error('process.unhandledRejection', meta); } catch(_){}
    _err('[unhandledRejection]', reason);
  });

  // WebContents / app crash watchers
  app.on('web-contents-created', (_e, wc) => {
    wc.on('render-process-gone', (_event, details) => {
      try { LOGGER && LOGGER.error('renderer.gone', { ...details, url: wc.getURL?.() || '' }); } catch(_){}
    });
    wc.on('unresponsive', () => {
      try { LOGGER && LOGGER.warn('renderer.unresponsive', { url: wc.getURL?.() || '' }); } catch(_){}
    });
    wc.on('responsive', () => {
      try { LOGGER && LOGGER.info('renderer.responsive', { url: wc.getURL?.() || '' }); } catch(_){}
    });
    wc.on('crashed', (_event, killed) => {
      try { LOGGER && LOGGER.error('renderer.crashed', { killed, url: wc.getURL?.() || '' }); } catch(_){}
    });
    wc.on('console-message', (_event, level, message, line, sourceId) => {
      // Forward renderer console messages to logs (level: 0 log, 1 warn, 2 error)
      const meta = { level, line, sourceId, url: wc.getURL?.() || '' };
      try {
        if (level === 2) LOGGER && LOGGER.error(`renderer.console: ${message}`, meta);
        else if (level === 1) LOGGER && LOGGER.warn(`renderer.console: ${message}`, meta);
        else LOGGER && LOGGER.info(`renderer.console: ${message}`, meta);
      } catch(_){}
    });
  });
  app.on('render-process-gone', (_e, wc, details) => {
    try { LOGGER && LOGGER.error('app.render-process-gone', { ...details, url: wc?.getURL?.() || '' }); } catch(_){}
  });
  app.on('child-process-gone', (_e, details) => {
    try { LOGGER && LOGGER.error('app.child-process-gone', details); } catch(_){}
  });
  app.on('gpu-process-crashed', (_e, killed) => {
    try { LOGGER && LOGGER.error('app.gpu-process-crashed', { killed }); } catch(_){}
  });

  // Monitor event loop delay to catch stalls
  try {
    const { monitorEventLoopDelay } = require('perf_hooks');
    EVENT_LOOP_HIST = monitorEventLoopDelay({ resolution: 20 });
    EVENT_LOOP_HIST.enable();
    EVENT_LOOP_TIMER = setInterval(() => {
      const mean = EVENT_LOOP_HIST.mean / 1e6; // to ms
      const max = EVENT_LOOP_HIST.max / 1e6;
      const p99 = EVENT_LOOP_HIST.percentiles ? (EVENT_LOOP_HIST.percentiles.get ? EVENT_LOOP_HIST.percentiles.get(99) : 0) : 0;
      if (LOGGER) LOGGER.debug('eventloop.delay', { mean_ms: +mean.toFixed(2), max_ms: +max.toFixed(2), p99_ns: p99 || undefined });
      if (max > 200) { // 200ms stall threshold
        LOGGER && LOGGER.warn('eventloop.stall', { max_ms: +max.toFixed(2) });
      }
      EVENT_LOOP_HIST.reset();
    }, 2000);
  } catch (e) {
    console.warn('[perf] monitorEventLoopDelay not available:', e?.message || e);
  }
}

function teardownDiagnostics() {
  try { if (EVENT_LOOP_TIMER) clearInterval(EVENT_LOOP_TIMER); } catch(_){}
  EVENT_LOOP_TIMER = null;
  try { if (EVENT_LOOP_HIST) EVENT_LOOP_HIST.disable(); } catch(_){}
  EVENT_LOOP_HIST = null;
}


function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#F7F8FA',
    // Use app icon for Windows/Linux window (macOS ignores this option)
    icon: path.join(__dirname, 'assets', 'app-icon.png'),
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: false
    }
  });

  win.once('ready-to-show', () => win.show());

  const startUrl = new URL(`file://${path.join(__dirname, 'renderer', 'index.html')}`);
  win.loadURL(startUrl.toString());

  // Open devtools in development mode only
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  // Surface renderer crashes for this window
  try {
    win.webContents.on('render-process-gone', (_e, details) => { LOGGER && LOGGER.error('win.render-process-gone', { ...details }); });
    win.on('unresponsive', () => { LOGGER && LOGGER.warn('win.unresponsive', {}); });
    win.on('responsive', () => { LOGGER && LOGGER.info('win.responsive', {}); });
  } catch (_) {}

  return win;
}

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.whenReady().then(() => {
  // Note: Setting Dock icon at runtime will bypass macOS' squircle mask and
  // show a raw square in the Dock. Now that the .icns is fixed, we avoid
  // overriding it. You can re-enable by setting SMARTTERM_FORCE_DOCK_ICON=1.
  try {
    if (process.env.SMARTTERM_FORCE_DOCK_ICON === '1' && isMac && app?.dock?.setIcon) {
      const dockPng = path.join(__dirname, 'assets', 'app-icon.png');
      if (fs.existsSync(dockPng)) app.dock.setIcon(dockPng);
    }
  } catch (e) {
    console.warn('[main] failed to optionally set dock icon:', e?.message || e);
  }

  setupCrashAndDiagnostics();
  buildAppMenu();
  // 初始化命令执行器
  commandExecutor = new CommandExecutor();

  registerTabHandlers();
  createWindow();
  // start app-level metrics sampling
  startAppMetricsSampling();
  // Log key diagnostic paths for support
  try {
    const crashDir = app.getPath('crashDumps');
    const logDir = path.join(app.getPath('userData'), 'logs');
    LOGGER && LOGGER.info('diagnostic.paths', { crashDir, logDir, userData: app.getPath('userData') });
  } catch (_) {}
});

// 应用退出时清理所有进程
app.on('before-quit', async () => {
  if (commandExecutor) {
    await commandExecutor.cleanup();
  }
  stopAppMetricsSampling();
  teardownDiagnostics();
});

// IPC contracts (whitelist)
// Terminal spawn
ipcMain.handle('term.spawn', (event, args) => {
  const { tabId, shellName, cwd, cols, rows, encoding, preferUTF8 } = args || {};

  // Resolve default shell per platform
  const shellExe = resolveShellExecutable(shellName);
  if (!shellExe) {
    return { ok: false, error: 'NO_COMPATIBLE_SHELL_FOUND' };
  }

  const env = { ...process.env };
  if (preferUTF8 && process.platform === 'win32') {
    // Hint for UTF-8 on Windows; we do not force chcp.
    env.LC_ALL = 'C.UTF-8';
    env.LANG = 'C.UTF-8';
  }
  // Ensure PATH is sane when launched from Finder (limited env)
  if (process.platform === 'darwin') {
    try {
      const extraPaths = ['/usr/local/bin', '/usr/local/sbin', '/opt/homebrew/bin', '/opt/homebrew/sbin'];
      const pathParts = (env.PATH || '').split(path.delimiter).filter(Boolean);
      for (const p of extraPaths) { if (!pathParts.includes(p) && fs.existsSync(p)) pathParts.unshift(p); }
      for (const p of ['/usr/bin','/bin','/usr/sbin','/sbin']) { if (!pathParts.includes(p)) pathParts.push(p); }
      env.PATH = pathParts.join(path.delimiter);
    } catch (_) {}
  }

  const ptyId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let proc;
  try {
    try { LOGGER && LOGGER.info('term.spawn', { ptyId, shell: shellExe, cwd: cwd || os.homedir(), cols: cols || 120, rows: rows || 30 }); } catch(_){}
    if (pty) {
      // Preferred PTY: use a login shell so PATH from ~/.zprofile and ~/.zshrc is loaded
      const spawnArgsPty = [];
      try {
        const lower = (shellExe || '').toLowerCase();
        if (lower.includes('zsh') || lower.includes('bash')) {
          spawnArgsPty.push('-l');
        }
      } catch (_) {}

      proc = pty.spawn(shellExe, spawnArgsPty, {
        name: 'xterm-256color',
        cols: cols || 120,
        rows: rows || 30,
        cwd: cwd || os.homedir(),
        env
      });
      PTYS.set(ptyId, proc);

      // 创建输出流和监控器
      const streamer = new OutputStreamer(ptyId);
      streamer.open();
      STREAMERS.set(ptyId, streamer);

      const monitor = new ProcessMonitor(ptyId, proc.pid);
      MONITORS.set(ptyId, monitor);
      monitor.start();

      // 监听监控事件并转发给渲染进程
      monitor.on('update', (metrics) => {
        try {
          event.sender.send('evt.term.metrics', { ptyId, metrics });
        } catch (_) {}
      });

      monitor.on('high-cpu', (metrics) => {
        try {
          LOGGER && LOGGER.warn('term.high-cpu', { ptyId, cpu: metrics.cpuUsage, mem: metrics.memoryUsage });
          event.sender.send('evt.term.warning', { ptyId, type: 'high-cpu', message: 'High CPU usage detected', metrics });
        } catch (_) {}
      });

      monitor.on('high-memory', (metrics) => {
        try {
          LOGGER && LOGGER.warn('term.high-memory', { ptyId, cpu: metrics.cpuUsage, mem: metrics.memoryUsage });
          event.sender.send('evt.term.warning', { ptyId, type: 'high-memory', message: 'High memory usage detected', metrics });
        } catch (_) {}
      });

      // Unresponsive monitoring removed

      proc.onData(data => {
        try {
          // 记录输出到监控器
          monitor.recordOutput(data.length);

          // 流式写入文件
          streamer.write(data);

          // 发送给渲染进程
          event.sender.send('evt.term.data', { ptyId, data });
        } catch (_) {}
      });

      proc.onExit(e => {
        try {
          LOGGER && LOGGER.info('term.exit', { ptyId, code: e.exitCode, signal: e.signal });
          // 停止监控和流
          const mon = MONITORS.get(ptyId);
          if (mon) {
            mon.stop();
            MONITORS.delete(ptyId);
          }

          const str = STREAMERS.get(ptyId);
          if (str) {
            str.close();
            STREAMERS.delete(ptyId);
          }

          event.sender.send('evt.term.exit', { ptyId, code: e.exitCode, signal: e.signal });
        } catch (_) {}
        PTYS.delete(ptyId);
      });
    } else {
      // Fallback strategy without node-pty: spawn the resolved login shell via pipes.
      // Use the same shell as resolveShellExecutable() to respect user's default (zsh on macOS).
      let sh = shellExe;
      let spawnArgs = [];
      if (process.platform === 'win32') {
        spawnArgs = ['-NoLogo'];
      } else {
        // Ensure PATH contains common Homebrew/user locations when launched from Finder
        try {
          const extraPaths = ['/usr/local/bin', '/usr/local/sbin', '/opt/homebrew/bin', '/opt/homebrew/sbin'];
          const pathParts = (env.PATH || '').split(path.delimiter).filter(Boolean);
          for (const p of extraPaths) { if (!pathParts.includes(p) && fs.existsSync(p)) pathParts.unshift(p); }
          // Also guarantee core system paths are present at the end
          for (const p of ['/usr/bin','/bin','/usr/sbin','/sbin']) { if (!pathParts.includes(p)) pathParts.push(p); }
          env.PATH = pathParts.join(path.delimiter);
        } catch (_) {}

        // If resolution failed for some reason, fall back in preferred order
        if (!sh) sh = findExecutable('/bin/zsh') || findExecutable('/usr/bin/zsh');
        if (!sh) sh = findExecutable('/bin/bash') || findExecutable('/usr/bin/bash');
        if (!sh) sh = findExecutable('/bin/sh') || findExecutable('/usr/bin/sh');
        // Interactivity: prefer login shells so user env (PATH, aliases) is loaded
        if (sh && sh.includes('zsh')) spawnArgs = ['-l'];
        else if (sh && sh.includes('bash')) spawnArgs = ['-l'];
        else spawnArgs = ['-i'];
        env.PS1 = env.PS1 || '';
        env.TERM = env.TERM || 'xterm-256color';
      }
      try { LOGGER && LOGGER.info('term.spawn.fallback', { shell: sh, args: spawnArgs }); } catch(_){}
      proc = spawn(sh, spawnArgs, { cwd: cwd || os.homedir(), env });
      PTYS.set(ptyId, proc);

      // 创建输出流和监控器（stdio 模式）
      const streamer = new OutputStreamer(ptyId);
      streamer.open();
      STREAMERS.set(ptyId, streamer);

      const monitor = new ProcessMonitor(ptyId, proc.pid);
      MONITORS.set(ptyId, monitor);
      monitor.start();

      // 监听监控事件并转发给渲染进程
      monitor.on('update', (metrics) => {
        try {
          event.sender.send('evt.term.metrics', { ptyId, metrics });
        } catch (_) {}
      });

      monitor.on('high-cpu', (metrics) => {
        try {
          LOGGER && LOGGER.warn('term.high-cpu', { ptyId, cpu: metrics.cpuUsage, mem: metrics.memoryUsage });
          event.sender.send('evt.term.warning', { ptyId, type: 'high-cpu', message: 'High CPU usage detected', metrics });
        } catch (_) {}
      });

      monitor.on('high-memory', (metrics) => {
        try {
          LOGGER && LOGGER.warn('term.high-memory', { ptyId, cpu: metrics.cpuUsage, mem: metrics.memoryUsage });
          event.sender.send('evt.term.warning', { ptyId, type: 'high-memory', message: 'High memory usage detected', metrics });
        } catch (_) {}
      });

      // Unresponsive monitoring removed

      proc.stdout.on('data', buf => {
        try {
          const data = buf.toString('utf8');
          monitor.recordOutput(data.length);
          streamer.write(data);
          event.sender.send('evt.term.data', { ptyId, data });
        } catch (_) {}
      });

      proc.stderr.on('data', buf => {
        try {
          const data = buf.toString('utf8');
          monitor.recordOutput(data.length);
          streamer.write(data);
          event.sender.send('evt.term.data', { ptyId, data });
        } catch (_) {}
      });

      proc.on('close', code => {
        try {
          // 停止监控和流
          const mon = MONITORS.get(ptyId);
          if (mon) {
            mon.stop();
            MONITORS.delete(ptyId);
          }

          const str = STREAMERS.get(ptyId);
          if (str) {
            str.close();
            STREAMERS.delete(ptyId);
          }

          event.sender.send('evt.term.exit', { ptyId, code });
        } catch (_) {}
        PTYS.delete(ptyId);
      });
    }
  } catch (err) {
    console.error('[term.spawn] Failed to launch shell:', err);
    return { ok: false, error: String(err?.message || err) };
  }

  return { ok: true, data: { ptyId, mode: pty ? 'pty' : 'stdio' } };
});

ipcMain.handle('term.write', (_e, { ptyId, data }) => {
  const p = PTYS.get(ptyId);
  if (!p) return { ok: false, error: 'PTY_NOT_FOUND' };
  // If we are using real PTY, write as-is. If we are on fallback stdio shell,
  // translate carriage return to newline so non-tty shells actually execute.
  if (p.write) {
    p.write(data);
  } else if (p.stdin) {
    const payload = typeof data === 'string' ? data.replace(/\r/g, '\n') : data;
    try { p.stdin.write(payload); } catch (_) {}
  }
  return { ok: true };
});

// Clipboard helpers: best-effort extraction of file paths copied from Finder/Explorer
ipcMain.handle('clipboard.readFilePaths', () => {
  try {
    const types = clipboard.availableFormats() || [];
    const urls = [];

    // text/uri-list may contain multiple lines
    if (types.includes('text/uri-list')) {
      const s = clipboard.read('text/uri-list') || '';
      s.split(/\r?\n/).forEach(line => {
        const t = (line || '').trim();
        if (!t || t.startsWith('#')) return;
        if (/^file:\/\//i.test(t)) urls.push(t);
      });
    }

    // macOS public.file-url (single URL)
    if (types.includes('public.file-url')) {
      // Try textual first, then raw buffer as UTF-8
      let s = clipboard.read('public.file-url');
      if (!s) {
        try { s = clipboard.readBuffer('public.file-url').toString('utf8'); } catch (_) { s = ''; }
      }
      s = (s || '').trim();
      if (s) urls.push(s);
    }

    const paths = [];
    for (const u of urls) {
      try {
        const urlObj = new URL(u);
        if (urlObj.protocol !== 'file:') continue;
        let p = decodeURIComponent(urlObj.pathname || '');
        if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
        paths.push(p);
      } catch (_) {}
    }

    // As fallback, if clipboard plain text looks like an absolute path
    if (paths.length === 0) {
      const plain = (clipboard.readText() || '').trim();
      const isAbsUnix = plain.startsWith('/');
      const isAbsWin = /^[A-Za-z]:[\\/]/.test(plain) || plain.startsWith('\\\\');
      if (isAbsUnix || isAbsWin) paths.push(plain);
    }

    return { ok: true, data: paths };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('term.resize', (_e, { ptyId, cols, rows }) => {
  const p = PTYS.get(ptyId);
  if (!p) return { ok: false, error: 'PTY_NOT_FOUND' };
  if (p.resize) p.resize(Math.max(20, cols || 120), Math.max(5, rows || 30));
  return { ok: true };
});

ipcMain.handle('term.kill', (_e, { ptyId }) => {
  const p = PTYS.get(ptyId);
  if (p) {
    try { p.kill ? p.kill() : p.stdin.end(); } catch (_) {}
    PTYS.delete(ptyId);
  }
  return { ok: true };
});

// Force kill a process by ptyId (legacy - for PTY/stdio shells)
ipcMain.handle('term.forceKill', (_e, { ptyId }) => {
  const p = PTYS.get(ptyId);
  if (p) {
    try {
      // For PTY mode, use the built-in kill method
      if (p.kill && typeof p.kill === 'function') {
        console.log('[term.forceKill] Using PTY kill for:', ptyId);
        p.kill('SIGKILL');
      } else if (p.pid) {
        // For stdio mode, use tree-kill to kill the entire process tree
        console.log('[term.forceKill] Using tree-kill for pid:', p.pid, 'ptyId:', ptyId);

        // Immediately kill the entire process tree with SIGKILL
        kill(p.pid, 'SIGKILL', (err) => {
          if (err) {
            console.warn('[term.forceKill] tree-kill failed:', err);
            // Fallback: direct kill
            try {
              process.kill(p.pid, 'SIGKILL');
            } catch (killErr) {
              console.warn('[term.forceKill] Direct kill also failed:', killErr);
            }
          } else {
            console.log('[term.forceKill] Successfully killed process tree for pid:', p.pid);
          }
        });

        // Also try to close stdin immediately
        try {
          if (p.stdin && typeof p.stdin.end === 'function') {
            p.stdin.end();
          }
        } catch (err) {
          console.warn('[term.forceKill] Failed to close stdin:', err);
        }
      } else {
        // Fallback: close stdin
        console.log('[term.forceKill] No pid available, closing stdin for:', ptyId);
        try {
          if (p.stdin && typeof p.stdin.end === 'function') {
            p.stdin.end();
          }
        } catch (err) {
          console.warn('[term.forceKill] Failed to close stdin:', err);
        }
      }
    } catch (err) {
      console.warn('[term.forceKill] Failed to kill process:', err);
    }

    // Clean up monitors and streamers
    const mon = MONITORS.get(ptyId);
    if (mon) {
      mon.stop();
      MONITORS.delete(ptyId);
    }

    const str = STREAMERS.get(ptyId);
    if (str) {
      str.close();
      STREAMERS.delete(ptyId);
    }

    // Remove the process from the map after attempting to kill it
    PTYS.delete(ptyId);
  }
  return { ok: true };
});

// Execute command (new multi-instance mode)
ipcMain.handle('cmd.execute', (event, { commandId, command, cwd }) => {
  if (!commandExecutor) {
    return { ok: false, error: 'CommandExecutor not initialized' };
  }

  try {
    // Avoid logging full command to protect sensitive args; log only the first token and length
    try {
      const preview = (command || '').toString().trim();
      const firstToken = preview.split(/\s+/)[0] || '';
      LOGGER && LOGGER.info('cmd.execute', { commandId, cwd, cmd: firstToken, length: preview.length });
    } catch(_){}
    const result = commandExecutor.executeCommand(commandId, command, { cwd });

    // 创建输出流和监控器
    const streamer = new OutputStreamer(commandId);
    streamer.open();
    STREAMERS.set(commandId, streamer);

    const monitor = new ProcessMonitor(commandId, result.pid);
    MONITORS.set(commandId, monitor);
    monitor.start();

    // 监听监控事件并转发给渲染进程
    monitor.on('update', (metrics) => {
      try {
        event.sender.send('evt.cmd.metrics', { commandId, metrics });
      } catch (_) {}
    });

    monitor.on('high-cpu', (metrics) => {
      try {
        LOGGER && LOGGER.warn('cmd.high-cpu', { commandId, cpu: metrics.cpuUsage, mem: metrics.memoryUsage });
        event.sender.send('evt.cmd.warning', { commandId, type: 'high-cpu', message: 'High CPU usage detected', metrics });
      } catch (_) {}
    });

    monitor.on('high-memory', (metrics) => {
      try {
        LOGGER && LOGGER.warn('cmd.high-memory', { commandId, cpu: metrics.cpuUsage, mem: metrics.memoryUsage });
        event.sender.send('evt.cmd.warning', { commandId, type: 'high-memory', message: 'High memory usage detected', metrics });
      } catch (_) {}
    });

    monitor.on('unresponsive', (metrics) => {
      try {
        event.sender.send('evt.cmd.warning', {
          commandId,
          type: 'unresponsive',
          message: 'Command appears unresponsive',
          metrics
        });
      } catch (_) {}
    });

    // 监听输出
    result.stdout.on('data', (data) => {
      try {
        const dataStr = data.toString('utf8');
        monitor.recordOutput(dataStr.length);
        streamer.write(dataStr);
        event.sender.send('evt.cmd.data', { commandId, data: dataStr, stream: 'stdout' });
      } catch (_) {}
    });

    result.stderr.on('data', (data) => {
      try {
        const dataStr = data.toString('utf8');
        monitor.recordOutput(dataStr.length);
        streamer.write(dataStr);
        event.sender.send('evt.cmd.data', { commandId, data: dataStr, stream: 'stderr' });
      } catch (_) {}
    });

    // 使用 onExit 方法注册退出处理器
    result.onExit((code, signal) => {
      try {
        console.log('[cmd.execute] Process exited:', { commandId, code, signal });
        LOGGER && LOGGER.info('cmd.exit', { commandId, code, signal });

        // 停止监控和流
        const mon = MONITORS.get(commandId);
        if (mon) {
          mon.stop();
          MONITORS.delete(commandId);
        }

        const str = STREAMERS.get(commandId);
        if (str) {
          str.close();
          STREAMERS.delete(commandId);
        }

        // 通知渲染进程命令已完成
        event.sender.send('evt.cmd.exit', { commandId, code: code || 0 });
      } catch (err) {
        console.error('[cmd.execute] Exit handler error:', err);
      }
    });

    return { ok: true, data: { commandId, pid: result.pid } };
  } catch (err) {
    console.error('[cmd.execute] Failed:', err);
    return { ok: false, error: String(err?.message || err) };
  }
});

// Kill command (new multi-instance mode)
ipcMain.handle('cmd.kill', async (_e, { commandId }) => {
  if (!commandExecutor) {
    return { ok: false, error: 'CommandExecutor not initialized' };
  }

  try {
    console.log('[cmd.kill] Killing command:', commandId);
    LOGGER && LOGGER.info('cmd.kill', { commandId });
    await commandExecutor.killCommand(commandId);

    // 清理监控器和输出流
    const mon = MONITORS.get(commandId);
    if (mon) {
      mon.stop();
      MONITORS.delete(commandId);
    }

    const str = STREAMERS.get(commandId);
    if (str) {
      str.close();
      STREAMERS.delete(commandId);
    }

    return { ok: true };
  } catch (err) {
    console.error('[cmd.kill] Failed:', err);
    return { ok: false, error: String(err?.message || err) };
  }
});

// Write to command stdin
ipcMain.handle('cmd.write', (_e, { commandId, data }) => {
  if (!commandExecutor) {
    return { ok: false, error: 'CommandExecutor not initialized' };
  }

  const processInfo = commandExecutor.processes.get(commandId);
  if (!processInfo) {
    return { ok: false, error: 'Command not found' };
  }

  try {
    processInfo.proc.stdin.write(data);
    return { ok: true };
  } catch (err) {
    console.error('[cmd.write] Failed:', err);
    return { ok: false, error: String(err?.message || err) };
  }
});

// File system listing (local)
ipcMain.handle('fs.list', async (_e, { path: dir }) => {
  try {
    const names = await fs.promises.readdir(dir, { withFileTypes: true });
    const rows = await Promise.all(names.map(async d => {
      const p = path.join(dir, d.name);
      let st; try { st = await fs.promises.lstat(p); } catch { st = null; }
      return {
        name: d.name,
        type: st && st.isSymbolicLink() ? 'symlink' : (d.isDirectory() ? 'dir' : 'file'),
        size: st ? st.size : 0,
        mtime: st ? st.mtimeMs : 0,
        mode: st ? st.mode : 0
      };
    }));
    return { ok: true, data: rows };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// Settings / session
ipcMain.handle('settings.get', () => {
  // Ensure a sensible default downloads directory exists in settings
  // Lazily populate from Electron to avoid early getPath timing issues
  try {
    const current = settings.store || {};
    if (!current.downloadsDir) {
      const dl = app.getPath('downloads');
      if (dl && typeof dl === 'string') {
        settings.set({ downloadsDir: dl });
      } else {
        // Fallback: ~/Downloads (best-effort)
        const fallback = path.join(os.homedir(), 'Downloads');
        settings.set({ downloadsDir: fallback });
      }
    }
  } catch (_) { /* ignore */ }
  return ({ ok: true, data: settings.store });
});
ipcMain.handle('settings.set', (_e, partial) => {
  settings.set(partial || {});
  return { ok: true, data: settings.store };
});

ipcMain.handle('session.load', () => ({ ok: true, data: sessionStore.store }));
ipcMain.handle('session.save', (_e, s) => { sessionStore.set(s || {}); return { ok: true }; });

ipcMain.handle('app.getHomeDir', () => ({ ok: true, data: os.homedir() }));
ipcMain.handle('app.getDownloadsDir', () => {
  try {
    const p = app.getPath('downloads');
    return { ok: true, data: p };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});
ipcMain.handle('app.getLogDir', () => {
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    return { ok: true, data: dir };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});
ipcMain.handle('app.openLogsDir', () => {
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});
ipcMain.handle('app.getPlatform', () => ({ ok: true, data: process.platform }));
ipcMain.handle('app.openExternal', (_e, url) => { shell.openExternal(url); return { ok: true }; });
ipcMain.handle('app.openDialog', async (_e, { type, options }) => {
  try {
    if (type === 'openFile') {
      const ret = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], ...(options||{}) });
      return { ok: true, data: ret.filePaths || [] };
    }
    if (type === 'openDirectory') {
      const ret = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], ...(options||{}) });
      return { ok: true, data: ret.filePaths?.[0] || null };
    }
    if (type === 'saveFile') {
      const ret = await dialog.showSaveDialog(options||{});
      return { ok: true, data: ret.filePath || null };
    }
    return { ok: false, error: 'UNSUPPORTED_DIALOG_TYPE' };
  } catch (e) { return { ok: false, error: String(e?.message||e) }; }
});

// ---------------- Transfer Manager (SFTP/local) ----------------
class TransferManager {
  constructor() {
    this.tasks = new Map();
    this.queue = [];
    this.running = 0; this.max = 3;
  }
  enqueue(task) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    task.id = id; task.state = 'queued'; task.attempts = 0; this.tasks.set(id, task); this.queue.push(task); this.pump();
    return id;
  }
  list() { return Array.from(this.tasks.values()); }
  control({ taskId, action }) {
    const t = this.tasks.get(taskId); if (!t) return;
    if (action === 'cancel' && t._cancel) t._cancel('user');
    if (action === 'pause' && t.state === 'running' && t._pause) {
      t._pause();
      t.state = 'paused';
      this.running--;
      sendTx({ type: 'paused', taskId });
      this.pump();
    }
    if (action === 'resume' && t.state === 'paused') {
      t.state = 'queued';
      this.queue.unshift(t); // Priority: resume tasks go to front
      sendTx({ type: 'resumed', taskId });
      this.pump();
    }
  }
  async pump() {
    while (this.running < this.max && this.queue.length) {
      const t = this.queue.shift();
      this.running++; t.state='running';
      this.runTask(t).catch(()=>{}).finally(()=>{ this.running--; this.pump(); });
    }
  }
  async runTask(t) {
    t.attempts++;
    try {
      if (t.kind === 'upload') await this.upload(t); else await this.download(t);
      t.state = 'completed';
      sendTx({ type:'done', taskId: t.id });
    } catch (e) {
      t.state='failed'; t.error=String(e?.message||e); sendTx({ type:'error', taskId: t.id, error: t.error });
    }
  }
  async getSftp(connId) {
    return await new Promise((resolve, reject) => {
      const c = SSH_CONNS.get(connId); if (!c) return reject(new Error('SSH_NOT_FOUND'));
      c.sftp((err, sftp) => err ? reject(err) : resolve(sftp));
    });
  }
  async upload(t) {
    const sftp = await this.getSftp(t.connId);
    const fsPromises = fs.promises;
    const st = await fsPromises.stat(t.localPath);
    if (st.isDirectory()) throw new Error('DIR_UPLOAD_NOT_SUPPORTED_IN_ONE_TASK');
    let remoteExists = await new Promise(res => sftp.stat(t.remotePath, (e, st)=> res(!e && st)));
    if (remoteExists && t.policy === 'skip') return;
    if (remoteExists && t.policy === 'rename') {
      const { dir, base, ext } = parseName(t.remotePath);
      let n=1, rp; do { rp = path.join(dir, `${base} (${n})${ext}`); n++; } while(await existsSftp(sftp, rp));
      t.remotePath = rp; remoteExists=false;
    }
    const offset = remoteExists ? await new Promise(res=> sftp.stat(t.remotePath, (e,st)=> res(e?0:st.size||0))) : 0;
    await new Promise((resolve, reject) => {
      let canceled=false, paused=false;
      t._cancel=(why)=>{ canceled=true; reject(new Error('CANCELED')); };
      t._pause=()=>{ paused=true; };
      const rs = fs.createReadStream(t.localPath, { start: offset });
      sftp.open(t.remotePath, offset? 'r+':'w', (e, fd) => {
        if (e) { rs.destroy(); return reject(e); }
        let pos = offset; const total = st.size; sendTx({ type:'progress', taskId:t.id, transferred: pos, total });
        rs.on('data', (chunk)=>{
          if (paused || canceled) { rs.destroy(); sftp.close(fd,()=>{}); return resolve(); }
          rs.pause();
          sftp.write(fd, chunk, 0, chunk.length, pos, (err)=>{
            if (err) { rs.destroy(); sftp.close(fd,()=>{}); return reject(err); }
            pos += chunk.length; t.transferred=pos; t.total=total; sendTx({ type:'progress', taskId:t.id, transferred: pos, total });
            if (!paused && !canceled) rs.resume();
          });
        });
        rs.on('error', (err)=>{ sftp.close(fd,()=>{}); reject(err); });
        rs.on('end', ()=>{ sftp.close(fd, (err)=> err?reject(err):resolve()); });
      });
    });
  }
  async download(t) {
    const sftp = await this.getSftp(t.connId);
    await fs.promises.mkdir(path.dirname(t.localPath), { recursive: true });
    const remoteStat = await new Promise((resolve,reject)=> sftp.stat(t.remotePath, (e,st)=> e?reject(e):resolve(st)));
    const existsLocal = await fs.promises.stat(t.localPath).then(()=>true).catch(()=>false);
    if (existsLocal && t.policy === 'skip') return;
    let offset = 0;
    if (existsLocal) {
      if (t.policy === 'rename') {
        const { dir, base, ext } = parseName(t.localPath);
        let n=1, lp; do { lp = path.join(dir, `${base} (${n})${ext}`); n++; } while(await existsLocalFs(lp));
        t.localPath = lp; offset = 0;
      } else {
        const st = await fs.promises.stat(t.localPath);
        if (st.size < remoteStat.size) offset = st.size;
      }
    }
    await new Promise((resolve,reject)=>{
      let canceled=false, paused=false;
      t._cancel=(why)=>{ canceled=true; reject(new Error('CANCELED')); };
      t._pause=()=>{ paused=true; };
      sftp.open(t.remotePath, 'r', (e, fd)=>{
        if (e) return reject(e);
        const ws = fs.createWriteStream(t.localPath, { flags: offset? 'r+':'w', start: offset });
        let pos = offset; const total = remoteStat.size; t.transferred=pos; t.total=total; sendTx({ type:'progress', taskId:t.id, transferred: pos, total });
        const CHUNK = 64*1024; // 64k
        function readNext() {
          if (paused || canceled) { ws.destroy(); sftp.close(fd,()=>{}); return resolve(); }
          const len = Math.min(CHUNK, total - pos);
          if (len <= 0) { ws.end(()=>{ sftp.close(fd,()=>resolve()); }); return; }
          const buf = Buffer.allocUnsafe(len);
          sftp.read(fd, buf, 0, len, pos, (err, bytes, b)=>{
            if (err) { ws.destroy(); sftp.close(fd,()=>{}); return reject(err); }
            pos += bytes; t.transferred=pos; t.total=total; ws.write(b.slice(0, bytes), ()=>{ sendTx({ type:'progress', taskId:t.id, transferred: pos, total }); readNext(); });
          });
        }
        readNext();
      });
    });
  }
}

function parseName(pth) {
  const dir = path.dirname(pth);
  const baseFull = path.basename(pth);
  const i = baseFull.lastIndexOf('.');
  const base = i>0 ? baseFull.slice(0,i) : baseFull;
  const ext = i>0 ? baseFull.slice(i) : '';
  return { dir, base, ext };
}
async function existsSftp(sftp, p) { return await new Promise(res=> sftp.stat(p, e=> res(!e))); }
async function existsLocalFs(p) { try { await fs.promises.stat(p); return true; } catch { return false; } }

const TX = new TransferManager();

function sendTx(msg) {
  BrowserWindow.getAllWindows().forEach(w => { try { w.webContents.send('evt.tx', msg); } catch(_){} });
}

ipcMain.handle('tx.enqueue', (_e, task) => { const id = TX.enqueue(task); return { ok: true, data: { taskId: id } }; });
ipcMain.handle('tx.list', () => ({ ok: true, data: TX.list() }));
ipcMain.handle('tx.control', (_e, p) => { TX.control(p); return { ok: true }; });

let tabsHandlersRegistered = false;

function ensureTabsDir() {
  const dir = path.join(app.getPath('userData'), TAB_DIR_NAME);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function tabFilePath(fileName) {
  return path.join(ensureTabsDir(), fileName);
}

function sanitizeTitle(title) {
  if (typeof title !== 'string') return 'Chat';
  const trimmed = title.trim();
  return trimmed.length ? trimmed : 'Chat';
}

function formatTimestampForFile(date = new Date()) {
  const pad = (value, length = 2) => String(value).padStart(length, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const millis = pad(date.getMilliseconds(), 3);
  return `${year}${month}${day}${hours}${minutes}${seconds}${millis}`;
}

async function generateFileName() {
  const timestamp = formatTimestampForFile();
  const randomSegment = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `${timestamp}-${randomSegment}${TAB_EXTENSION}`;
}

function registerTabHandlers() {
  if (tabsHandlersRegistered) return;
  tabsHandlersRegistered = true;

  ipcMain.handle('tabs.list', async () => {
    try {
      const dir = ensureTabsDir();
      const entries = await fsp.readdir(dir);
      const result = [];
      for (const name of entries) {
        if (!name.endsWith(TAB_EXTENSION)) continue;
        const filePath = path.join(dir, name);
        try {
          const content = await fsp.readFile(filePath, 'utf8');
          const parsed = JSON.parse(content);
          let stats = null;
          try { stats = fs.statSync(filePath); } catch (_) { stats = null; }
          result.push({
            fileName: name,
            title: sanitizeTitle(parsed.title),
            favorite: Boolean(parsed.favorite),
            description: typeof parsed.description === 'string' ? parsed.description : '',
            customTitle: Boolean(parsed.customTitle),
            deleted: Boolean(parsed.deleted),
            deletedAt: parsed.deletedAt || null,
            state: parsed.state || null,
            createdAt: parsed.createdAt || stats?.birthtimeMs || Date.now(),
            updatedAt: parsed.updatedAt || stats?.mtimeMs || parsed.createdAt || Date.now()
          });
        } catch (err) {
          console.warn('[tabs] Failed to read', name, err);
        }
      }
      result.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      return { ok: true, data: result };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle('tabs.create', async (_event, { title }) => {
    try {
      const safeTitle = sanitizeTitle(title);
      const payload = {
        title: safeTitle,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        favorite: false,
        customTitle: false,
        description: '',
        deleted: false,
        deletedAt: null,
        state: null
      };
      ensureTabsDir();
      let lastError = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const fileName = await generateFileName();
        const filePath = tabFilePath(fileName);
        try {
          await fsp.writeFile(filePath, JSON.stringify(payload, null, 2), { encoding: 'utf8', flag: 'wx' });
          return { ok: true, data: { fileName, title: safeTitle, favorite: false, description: '', customTitle: false, createdAt: payload.createdAt, updatedAt: payload.updatedAt } };
        } catch (err) {
          if (err?.code === 'EEXIST') {
            lastError = err;
            continue;
          }
          throw err;
        }
      }
      throw lastError || new Error('Failed to allocate unique tab file name');
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle('tabs.save', async (_event, { fileName, title, state, favorite, description, customTitle, deleted, deletedAt }) => {
    try {
      const safeTitle = sanitizeTitle(title);
      const filePath = tabFilePath(fileName);
      let previous = {};
      try {
        const existing = await fsp.readFile(filePath, 'utf8');
        previous = JSON.parse(existing);
      } catch (_) {
        previous = {};
      }
      const nextDeleted = typeof deleted === 'boolean'
        ? deleted
        : (typeof previous.deleted === 'boolean' ? previous.deleted : false);
      const nextDeletedAt = nextDeleted
        ? (Number.isFinite(deletedAt) ? deletedAt : (previous.deletedAt || Date.now()))
        : null;
      const payload = {
        title: safeTitle,
        createdAt: previous.createdAt || Date.now(),
        updatedAt: Date.now(),
        favorite: typeof favorite === 'boolean' ? favorite : Boolean(previous.favorite),
        customTitle: typeof customTitle === 'boolean' ? customTitle : Boolean(previous.customTitle),
        description: typeof description === 'string' ? description : (typeof previous.description === 'string' ? previous.description : ''),
        deleted: nextDeleted,
        deletedAt: nextDeletedAt,
        state: state !== undefined ? state : (previous.state || null)
      };
      await fsp.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
      return { ok: true, data: { updatedAt: payload.updatedAt, favorite: payload.favorite, description: payload.description, customTitle: payload.customTitle, deleted: payload.deleted, deletedAt: payload.deletedAt } };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle('tabs.rename', async (_event, { fileName, newTitle }) => {
    try {
      const safeTitle = sanitizeTitle(newTitle);
      const filePath = tabFilePath(fileName);
      const content = await fsp.readFile(filePath, 'utf8');
      const parsed = JSON.parse(content);
      parsed.title = safeTitle;
      parsed.customTitle = true;
      parsed.updatedAt = Date.now();
      await fsp.writeFile(filePath, JSON.stringify(parsed, null, 2), 'utf8');
      return {
        ok: true,
        data: {
          fileName,
          title: safeTitle,
          favorite: Boolean(parsed.favorite),
          customTitle: true
        }
      };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle('tabs.delete', async (_event, { fileName }) => {
    try {
      await fsp.unlink(tabFilePath(fileName));
      return { ok: true };
    } catch (err) {
      if (err && err.code === 'ENOENT') return { ok: true };
      return { ok: false, error: String(err?.message || err) };
    }
  });
}

// ---------------- File Operations ----------------
ipcMain.handle('fs.rename', async (_e, { oldPath, newPath }) => {
  try {
    await fs.promises.rename(oldPath, newPath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

// Logging controls and renderer error intake
ipcMain.handle('log.getLevel', () => {
  try { return { ok: true, data: LOGGER ? LOGGER.level : (process.env.SM_LOG_LEVEL || 'info') }; } catch (e) { return { ok:false, error:String(e?.message||e) }; }
});
ipcMain.handle('log.setLevel', (_e, level) => {
  try { if (LOGGER) LOGGER.level = String(level || 'info'); return { ok: true, data: LOGGER.level }; } catch (e) { return { ok:false, error:String(e?.message||e) }; }
});
ipcMain.handle('log.rendererError', (_e, payload) => {
  try { LOGGER && LOGGER.error('renderer.error', payload || {}); return { ok: true }; } catch (e) { return { ok:false, error:String(e?.message||e) }; }
});

ipcMain.handle('fs.delete', async (_e, { path: targetPath }) => {
  try {
    const stat = await fs.promises.lstat(targetPath);
    if (stat.isDirectory()) {
      await fs.promises.rmdir(targetPath, { recursive: true });
    } else {
      await fs.promises.unlink(targetPath);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('fs.mkdir', async (_e, { path: dirPath }) => {
  try {
    await fs.promises.mkdir(dirPath, { recursive: false });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('fs.createFile', async (_e, { path: filePath }) => {
  try {
    await fs.promises.writeFile(filePath, '', { flag: 'wx' });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

// File copy handler (for local file transfer)
ipcMain.handle('fs.copy', async (_e, { sourcePath, targetPath }) => {
  try {
    // Check if source exists
    await fs.promises.access(sourcePath, fs.constants.R_OK);

    // Determine if target is a directory
    let actualTargetPath = targetPath;
    try {
      const targetStat = await fs.promises.stat(targetPath);
      if (targetStat.isDirectory()) {
        // Target is a directory, append source filename
        const fileName = path.basename(sourcePath);
        actualTargetPath = path.join(targetPath, fileName);
      }
    } catch (err) {
      // Target doesn't exist or is not accessible, use as-is
    }

    // Copy the file
    await fs.promises.copyFile(sourcePath, actualTargetPath);

    return {
      ok: true,
      data: {
        sourcePath,
        targetPath: actualTargetPath
      }
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

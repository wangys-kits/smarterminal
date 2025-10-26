// Preload: expose safe IPC bridges
const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

contextBridge.exposeInMainWorld('sm', {
  term: {
    spawn: (args) => invoke('term.spawn', args),
    write: (args) => invoke('term.write', args),
    resize: (args) => invoke('term.resize', args),
    kill: (args) => invoke('term.kill', args),
    forceKill: (args) => invoke('term.forceKill', args),
    destroyTmuxSession: (args) => invoke('tmux.destroyDetached', args),
    onData: (cb) => ipcRenderer.on('evt.term.data', (_e, m) => cb(m)),
    onExit: (cb) => ipcRenderer.on('evt.term.exit', (_e, m) => cb(m)),
    onMetrics: (cb) => ipcRenderer.on('evt.term.metrics', (_e, m) => cb(m)),
    onWarning: (cb) => ipcRenderer.on('evt.term.warning', (_e, m) => cb(m))
  },
  cmd: {
    execute: (args) => invoke('cmd.execute', args),
    kill: (args) => invoke('cmd.kill', args),
    write: (args) => invoke('cmd.write', args),
    onData: (cb) => ipcRenderer.on('evt.cmd.data', (_e, m) => cb(m)),
    onExit: (cb) => ipcRenderer.on('evt.cmd.exit', (_e, m) => cb(m)),
    onMetrics: (cb) => ipcRenderer.on('evt.cmd.metrics', (_e, m) => cb(m)),
    onWarning: (cb) => ipcRenderer.on('evt.cmd.warning', (_e, m) => cb(m))
  },
  fs: {
    list: (args) => invoke('fs.list', args),
    rename: (args) => invoke('fs.rename', args),
    delete: (args) => invoke('fs.delete', args),
    mkdir: (args) => invoke('fs.mkdir', args),
    createFile: (args) => invoke('fs.createFile', args),
    copy: (args) => invoke('fs.copy', args),
    readFile: (args) => invoke('fs.readFile', args)
  },
  settings: { get: () => invoke('settings.get'), set: (p) => invoke('settings.set', p) },
  session: { load: () => invoke('session.load'), save: (s) => invoke('session.save', s) },
  app: {
    getHomeDir: () => invoke('app.getHomeDir'),
    getDownloadsDir: () => invoke('app.getDownloadsDir'),
    getLogDir: () => invoke('app.getLogDir'),
    openLogsDir: () => invoke('app.openLogsDir'),
    getPlatform: () => invoke('app.getPlatform'),
    openExternal: (url) => invoke('app.openExternal', url)
  }
  , tabs: {
    list: () => invoke('tabs.list'),
    create: (payload) => invoke('tabs.create', payload),
    save: (payload) => invoke('tabs.save', payload),
    rename: (payload) => invoke('tabs.rename', payload),
    remove: (payload) => invoke('tabs.delete', payload)
  }
  , tx: {
    enqueue: (t) => invoke('tx.enqueue', t),
    list: () => invoke('tx.list'),
    control: (p) => invoke('tx.control', p),
    on: (cb) => ipcRenderer.on('evt.tx', (_e, m) => cb(m))
  }
  , dialog: {
    openFile: (options) => invoke('app.openDialog', { type:'openFile', options }),
    openDirectory: (options) => invoke('app.openDialog', { type:'openDirectory', options }),
    saveFile: (options) => invoke('app.openDialog', { type:'saveFile', options })
  }
  , clip: {
    getFilePaths: () => invoke('clipboard.readFilePaths')
  }
});

// Capture renderer crash info for diagnostics
try {
  window.addEventListener('error', (e) => {
    try {
      invoke('log.rendererError', {
        type: 'error',
        message: String(e?.message || ''),
        source: String(e?.filename || ''),
        lineno: e?.lineno || 0,
        colno: e?.colno || 0,
        stack: e?.error && e.error.stack ? String(e.error.stack) : ''
      });
    } catch (_) {}
  });
  window.addEventListener('unhandledrejection', (e) => {
    try {
      const reason = e?.reason;
      invoke('log.rendererError', {
        type: 'unhandledrejection',
        message: reason && reason.message ? String(reason.message) : String(reason),
        stack: reason && reason.stack ? String(reason.stack) : ''
      });
    } catch (_) {}
  });
} catch (_) {}

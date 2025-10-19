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
    onData: (cb) => ipcRenderer.on('evt.term.data', (_e, m) => cb(m)),
    onExit: (cb) => ipcRenderer.on('evt.term.exit', (_e, m) => cb(m))
  },
  fs: {
    list: (args) => invoke('fs.list', args),
    rename: (args) => invoke('fs.rename', args),
    delete: (args) => invoke('fs.delete', args),
    mkdir: (args) => invoke('fs.mkdir', args),
    createFile: (args) => invoke('fs.createFile', args)
  },
  settings: { get: () => invoke('settings.get'), set: (p) => invoke('settings.set', p) },
  session: { load: () => invoke('session.load'), save: (s) => invoke('session.save', s) },
  openExternal: (url) => invoke('app.openExternal', url)
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
});

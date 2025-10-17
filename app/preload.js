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
  , ssh: {
    available: () => invoke('ssh.available'),
    connect: (p) => invoke('ssh.connect', p),
    disconnect: (p) => invoke('ssh.disconnect', p),
    openShell: (p) => invoke('ssh.openShell', p),
    writeShell: (p) => invoke('ssh.writeShell', p),
    resizeShell: (p) => invoke('ssh.resizeShell', p),
    sftpList: (p) => invoke('ssh.sftpList', p),
    rename: (p) => invoke('ssh.rename', p),
    delete: (p) => invoke('ssh.delete', p),
    mkdir: (p) => invoke('ssh.mkdir', p),
    createFile: (p) => invoke('ssh.createFile', p),
    trustHost: (p) => invoke('ssh.trustHost', p),
    onHostkey: (cb) => ipcRenderer.on('evt.ssh.hostkey', (_e, m) => cb(m))
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

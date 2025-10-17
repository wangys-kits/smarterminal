// Electron main process. Minimal secure defaults + IPC whitelist.
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Store = require('electron-store');
let pty = null;
try { pty = require('node-pty'); } catch (e) {
  console.warn('[main] node-pty not available, falling back to stdio shell (limited):', e?.message || e);
}
const { spawn } = require('child_process');

// Persistent settings/session
const settings = new Store({ name: 'settings', defaults: { splitRatio: 0.6, searchLimitLines: 20000 } });
const sessionStore = new Store({ name: 'session', defaults: { windows: [] } });
const knownHostsStore = new Store({ name: 'known_hosts', defaults: { entries: {} } });

const isMac = process.platform === 'darwin';

/** @type {Map<string, import('node-pty').IPty>} */
const PTYS = new Map();
/** @type {Map<string, any>} */
const SSH_CONNS = new Map();
/** @type {Map<string, any>} */
const SSH_SHELLS = new Map();
/** @type {Map<string, string>} */
const TRUST_ONCE = new Map();
/** @type {Map<string, string>} */
const LAST_FP = new Map();

let ssh2 = null;
try { ssh2 = require('ssh2'); } catch (_) {}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#F7F8FA',
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

  // Optional: Open devtools during early development
  win.webContents.openDevTools({ mode: 'detach' });

  return win;
}

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.whenReady().then(createWindow);

// IPC contracts (whitelist)
// Terminal spawn
ipcMain.handle('term.spawn', (event, args) => {
  const { tabId, shellName, cwd, cols, rows, encoding, preferUTF8 } = args || {};

  // Resolve default shell per platform
  let shellExe = shellName;
  if (!shellExe) {
    if (process.platform === 'win32') {
      // Prefer PowerShell
      shellExe = process.env.COMSPEC || 'C\\\\Windows\\\\System32\\\\\WindowsPowerShell\\\\v1.0\\\\\powershell.exe';
    } else {
      shellExe = process.env.SHELL || '/bin/zsh';
    }
  }

  const env = { ...process.env };
  if (preferUTF8 && process.platform === 'win32') {
    // Hint for UTF-8 on Windows; we do not force chcp.
    env.LC_ALL = 'C.UTF-8';
    env.LANG = 'C.UTF-8';
  }

  const ptyId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let proc;
  if (pty) {
    // Preferred PTY
    proc = pty.spawn(shellExe, [], {
      name: 'xterm-color',
      cols: cols || 120,
      rows: rows || 30,
      cwd: cwd || os.homedir(),
      env
    });
    PTYS.set(ptyId, proc);
    proc.onData(data => { try { event.sender.send('evt.term.data', { ptyId, data }); } catch (_) {} });
    proc.onExit(e => { try { event.sender.send('evt.term.exit', { ptyId, code: e.exitCode, signal: e.signal }); } catch (_) {} PTYS.delete(ptyId); });
  } else {
    // Fallback stdio shell (limited; no TTY features)
    const sh = process.platform === 'win32' ? (shellExe || 'powershell.exe') : (shellExe || '/bin/bash');
    const args = process.platform === 'win32' ? ['-NoLogo'] : ['-i'];
    proc = spawn(sh, args, { cwd: cwd || os.homedir(), env });
    PTYS.set(ptyId, proc);
    proc.stdout.on('data', buf => { try { event.sender.send('evt.term.data', { ptyId, data: buf.toString('utf8') }); } catch (_) {} });
    proc.stderr.on('data', buf => { try { event.sender.send('evt.term.data', { ptyId, data: buf.toString('utf8') }); } catch (_) {} });
    proc.on('close', code => { try { event.sender.send('evt.term.exit', { ptyId, code }); } catch (_) {} PTYS.delete(ptyId); });
  }

  return { ok: true, data: { ptyId } };
});

ipcMain.handle('term.write', (_e, { ptyId, data }) => {
  const p = PTYS.get(ptyId);
  if (!p) return { ok: false, error: 'PTY_NOT_FOUND' };
  if (p.write) p.write(data); else if (p.stdin) p.stdin.write(data);
  return { ok: true };
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
ipcMain.handle('settings.get', () => ({ ok: true, data: settings.store }));
ipcMain.handle('settings.set', (_e, partial) => {
  settings.set(partial || {});
  return { ok: true, data: settings.store };
});

ipcMain.handle('session.load', () => ({ ok: true, data: sessionStore.store }));
ipcMain.handle('session.save', (_e, s) => { sessionStore.set(s || {}); return { ok: true }; });

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

// ---------------- SSH (optional if deps available) ----------------
ipcMain.handle('ssh.available', () => ({ ok: true, data: Boolean(ssh2) }));

ipcMain.handle('ssh.connect', async (event, { host, port, username, password, agentForward, privateKeyPath, passphrase }) => {
  if (!ssh2) return { ok: false, error: 'SSH_MODULE_NOT_INSTALLED' };
  const Client = ssh2.Client;
  const conn = new Client();
  const connId = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const key = `${host}:${port || 22}`;
  const known = knownHostsStore.get(`entries.${key}`);

  return await new Promise((resolve) => {
    conn.on('ready', () => { SSH_CONNS.set(connId, conn); resolve({ ok: true, data: { connId } }); });
    conn.on('error', (err) => {
      const fp = LAST_FP.get(key);
      if (fp) {
        const status = known ? (known === fp ? 'match' : 'mismatch') : 'unknown';
        try { event.sender.send('evt.ssh.hostkey', { host, port: port || 22, fingerprint: fp, known, status }); } catch(_){}
      }
      resolve({ ok: false, error: String(err && err.message || err) });
    });
    try {
      let privateKey;
      if (privateKeyPath) {
        try { privateKey = fs.readFileSync(privateKeyPath, 'utf8'); } catch(e) { /* ignore */ }
      }
      conn.connect({
        host,
        port: port || 22,
        username,
        password,
        privateKey,
        passphrase,
        tryKeyboard: false,
        agent: (process.env.SSH_AUTH_SOCK && agentForward) ? process.env.SSH_AUTH_SOCK : undefined,
        hostHash: 'sha256',
        hostVerifier: (hash) => {
          LAST_FP.set(key, hash);
          // accept if stored match or trusted once matches
          if (known && known === hash) return true;
          const once = TRUST_ONCE.get(key);
          if (once && once === hash) return true;
          return false; // trigger error, renderer will prompt
        },
        algorithms: { serverHostKey: ['ssh-ed25519','ecdsa-sha2-nistp256','rsa-sha2-256','rsa-sha2-512'] }
      });
    } catch (e) { resolve({ ok: false, error: String(e?.message || e) }); }
  });
});

ipcMain.handle('ssh.disconnect', (_e, { connId }) => {
  const c = SSH_CONNS.get(connId);
  if (c) { try { c.end(); } catch(_){} SSH_CONNS.delete(connId); }
  return { ok: true };
});

ipcMain.handle('ssh.openShell', async (event, { connId, cols, rows }) => {
  const c = SSH_CONNS.get(connId);
  if (!c) return { ok: false, error: 'SSH_NOT_FOUND' };
  const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  return await new Promise((resolve) => {
    c.shell({ cols: cols || 120, rows: rows || 30, term: 'xterm-256color' }, (err, stream) => {
      if (err || !stream) return resolve({ ok: false, error: String(err && err.message || err) });
      SSH_SHELLS.set(id, { connId, stream });
      stream.on('data', (d) => { try { event.sender.send('evt.term.data', { ptyId: id, data: d.toString('utf8') }); } catch(_){} });
      stream.on('close', () => { try { event.sender.send('evt.term.exit', { ptyId: id, code: 0 }); } catch(_){} SSH_SHELLS.delete(id); });
      resolve({ ok: true, data: { ptyId: id } });
    });
  });
});

ipcMain.handle('ssh.resizeShell', (_e, { ptyId, cols, rows }) => {
  const sh = SSH_SHELLS.get(ptyId);
  if (!sh) return { ok: false, error: 'SSH_SHELL_NOT_FOUND' };
  try { sh.stream.setWindow(rows || 30, cols || 120, 600, 800); } catch(_){}
  return { ok: true };
});

ipcMain.handle('ssh.writeShell', (_e, { ptyId, data }) => {
  const sh = SSH_SHELLS.get(ptyId);
  if (!sh) return { ok: false, error: 'SSH_SHELL_NOT_FOUND' };
  try { sh.stream.write(data); } catch(_){}
  return { ok: true };
});

ipcMain.handle('ssh.sftpList', async (_e, { connId, path: dir }) => {
  const c = SSH_CONNS.get(connId);
  if (!c) return { ok: false, error: 'SSH_NOT_FOUND' };
  return await new Promise((resolve) => {
    c.sftp((err, sftp) => {
      if (err || !sftp) return resolve({ ok: false, error: String(err?.message || err) });
      sftp.readdir(dir, (e, list) => {
        if (e) return resolve({ ok: false, error: String(e?.message || e) });
        const data = (list || []).map(e => ({ name: e.filename, type: e.longname.startsWith('d') ? 'dir' : (e.longname.startsWith('l') ? 'symlink' : 'file'), size: e.attrs?.size || 0, mtime: e.attrs?.mtime ? e.attrs.mtime*1000 : 0, mode: e.attrs?.mode || 0 }));
        resolve({ ok: true, data });
      });
    });
  });
});

ipcMain.handle('ssh.trustHost', (_e, { host, port, fingerprint, mode }) => {
  const key = `${host}:${port || 22}`;
  if (mode === 'once') TRUST_ONCE.set(key, fingerprint);
  else if (mode === 'persist') {
    knownHostsStore.set(`entries.${key}`, fingerprint);
    TRUST_ONCE.delete(key);
  }
  return { ok: true };
});

// ---------------- File Operations ----------------
ipcMain.handle('fs.rename', async (_e, { oldPath, newPath }) => {
  try {
    await fs.promises.rename(oldPath, newPath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
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

// SSH/SFTP file operations
ipcMain.handle('ssh.rename', async (_e, { connId, oldPath, newPath }) => {
  const c = SSH_CONNS.get(connId);
  if (!c) return { ok: false, error: 'SSH_NOT_FOUND' };
  return await new Promise((resolve) => {
    c.sftp((err, sftp) => {
      if (err || !sftp) return resolve({ ok: false, error: String(err?.message || err) });
      sftp.rename(oldPath, newPath, (e) => {
        if (e) return resolve({ ok: false, error: String(e?.message || e) });
        resolve({ ok: true });
      });
    });
  });
});

ipcMain.handle('ssh.delete', async (_e, { connId, path: targetPath, isDir }) => {
  const c = SSH_CONNS.get(connId);
  if (!c) return { ok: false, error: 'SSH_NOT_FOUND' };
  return await new Promise((resolve) => {
    c.sftp((err, sftp) => {
      if (err || !sftp) return resolve({ ok: false, error: String(err?.message || err) });
      const fn = isDir ? sftp.rmdir.bind(sftp) : sftp.unlink.bind(sftp);
      fn(targetPath, (e) => {
        if (e) return resolve({ ok: false, error: String(e?.message || e) });
        resolve({ ok: true });
      });
    });
  });
});

ipcMain.handle('ssh.mkdir', async (_e, { connId, path: dirPath }) => {
  const c = SSH_CONNS.get(connId);
  if (!c) return { ok: false, error: 'SSH_NOT_FOUND' };
  return await new Promise((resolve) => {
    c.sftp((err, sftp) => {
      if (err || !sftp) return resolve({ ok: false, error: String(err?.message || err) });
      sftp.mkdir(dirPath, (e) => {
        if (e) return resolve({ ok: false, error: String(e?.message || e) });
        resolve({ ok: true });
      });
    });
  });
});

ipcMain.handle('ssh.createFile', async (_e, { connId, path: filePath }) => {
  const c = SSH_CONNS.get(connId);
  if (!c) return { ok: false, error: 'SSH_NOT_FOUND' };
  return await new Promise((resolve) => {
    c.sftp((err, sftp) => {
      if (err || !sftp) return resolve({ ok: false, error: String(err?.message || err) });
      sftp.open(filePath, 'wx', (e, handle) => {
        if (e) return resolve({ ok: false, error: String(e?.message || e) });
        sftp.close(handle, (ce) => {
          if (ce) return resolve({ ok: false, error: String(ce?.message || ce) });
          resolve({ ok: true });
        });
      });
    });
  });
});

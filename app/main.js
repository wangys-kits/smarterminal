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

/** @type {Map<string, import('node-pty').IPty>} */
const PTYS = new Map();
/** @type {Map<string, any>} */
const SSH_CONNS = new Map();


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

  // Open devtools in development mode only
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  return win;
}

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.whenReady().then(() => {
  registerTabHandlers();
  createWindow();
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

  const ptyId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let proc;
  try {
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
      // Fallback strategy without node-pty:
      // 1) Try to wrap the shell with 'script' to simulate a TTY; this gives
      //    us interactive behavior without node-pty.
      // 2) If 'script' is unavailable, fall back to bash/sh reading from stdin.
      let spawned = false;
      if (process.platform !== 'win32') {
        const scriptExe = findExecutable('/usr/bin/script') || findExecutable('/bin/script') || findExecutable('script');
        const bashExe = findExecutable('/bin/bash') || findExecutable('/usr/bin/bash') || shellExe;
        if (scriptExe && bashExe) {
          try {
            // -q: quiet, /dev/null: skip transcript file
            proc = spawn(scriptExe, ['-q', '/dev/null', bashExe, '-i'], { cwd: cwd || os.homedir(), env });
            spawned = true;
          } catch (_) { spawned = false; }
        }
      }

      if (!spawned) {
        // Fallback stdio shell (limited; no TTY features). Prefer a shell that reads stdin.
        let sh = shellExe;
        let spawnArgs = [];
        if (process.platform === 'win32') {
          spawnArgs = ['-NoLogo'];
        } else {
          const bash = findExecutable('/bin/bash') || findExecutable('/usr/bin/bash');
          const shBin = findExecutable('/bin/sh') || findExecutable('/usr/bin/sh');
          if (bash) { sh = bash; spawnArgs = ['-s']; }
          else if (shBin) { sh = shBin; spawnArgs = ['-s']; }
          else { sh = shellExe; spawnArgs = ['-s']; }
          env.PS1 = '';
        }
        proc = spawn(sh, spawnArgs, { cwd: cwd || os.homedir(), env });
      }
      PTYS.set(ptyId, proc);
      proc.stdout.on('data', buf => { try { event.sender.send('evt.term.data', { ptyId, data: buf.toString('utf8') }); } catch (_) {} });
      proc.stderr.on('data', buf => { try { event.sender.send('evt.term.data', { ptyId, data: buf.toString('utf8') }); } catch (_) {} });
      proc.on('close', code => { try { event.sender.send('evt.term.exit', { ptyId, code }); } catch (_) {} PTYS.delete(ptyId); });
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
  const dir = ensureTabsDir();
  let base = formatTimestampForFile();
  let fileName = `${base}${TAB_EXTENSION}`;
  let counter = 1;
  while (fs.existsSync(path.join(dir, fileName))) {
    fileName = `${base}-${counter}${TAB_EXTENSION}`;
    counter += 1;
    if (counter > 999) {
      base = formatTimestampForFile(new Date());
      fileName = `${base}${TAB_EXTENSION}`;
      counter = 1;
    }
  }
  return fileName;
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
      const fileName = await generateFileName();
      const filePath = tabFilePath(fileName);
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
      await fsp.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
      return { ok: true, data: { fileName, title: safeTitle, favorite: false, description: '', customTitle: false, createdAt: payload.createdAt, updatedAt: payload.updatedAt } };
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

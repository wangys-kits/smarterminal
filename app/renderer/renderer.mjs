/* Renderer bootstrap: tabs, xterm, split, file listing (ESM) */
// Note: xterm.js uses UMD format, Terminal is available on window object after loading
const Terminal = window.Terminal;
import { ChatTerminal } from './chat-terminal.mjs';

const sm = window.sm;

// DOM
const tabsEl = document.getElementById('tabs');
const termEl = document.getElementById('term');
const chatContainer = document.getElementById('chatContainer');
const chatMessages = document.getElementById('chatMessages');
const commandInput = document.getElementById('commandInput');
const cwdLabel = document.getElementById('cwdLabel');
const fileTbody = document.getElementById('fileTbody');
const divider = document.getElementById('divider');
const uploadBtn = document.getElementById('uploadBtn');
const txCloseBtn = document.getElementById('txCloseBtn');
const connectModal = document.getElementById('connectModal');
const sshHost = document.getElementById('sshHost');
const sshPort = document.getElementById('sshPort');
const sshUser = document.getElementById('sshUser');
const sshPass = document.getElementById('sshPass');
const sshKeyPath = document.getElementById('sshKeyPath');
const sshKeyPass = document.getElementById('sshKeyPass');
const sshKeyBrowse = document.getElementById('sshKeyBrowse');
const sshCancel = document.getElementById('sshCancel');
const sshConnect = document.getElementById('sshConnect');
const sshAgentFwd = document.getElementById('sshAgentFwd');
// hostkey modal
const hostkeyModal = document.getElementById('hostkeyModal');
const hkText = document.getElementById('hkText');
const hkFp = document.getElementById('hkFp');
const hkCancel = document.getElementById('hkCancel');
const hkOnce = document.getElementById('hkOnce');
const hkPersist = document.getElementById('hkPersist');

let lastConnect = null; // remember current connect attempt {host,port,username,password}

let state = {
  splitRatio: 0.6,
  tabs: [], // {id,title,ptyId,cwd,term,chatTerm,type,connId}
  activeId: null,
  filePanelCollapsed: false,
  filePanelPreviousRatio: 0.6,
  useChatMode: false // Toggle between xterm.js and chat-style terminal
};
let sshAvailable = false;
let selection = new Set();

async function init() {
  const s = await sm.settings.get();
  if (s.ok && s.data.splitRatio) state.splitRatio = s.data.splitRatio;
  if (s.ok && s.data.filePanelCollapsed !== undefined) state.filePanelCollapsed = s.data.filePanelCollapsed;
  applySplitRatio();
  setupFilePanelToggle();
  await addNewTab('local');
  try { const a = await sm.ssh.available(); sshAvailable = !!(a.ok && a.data); } catch { sshAvailable = false; }
}

function applySplitRatio() {
  document.documentElement.style.setProperty('--splitter', '6px');
  const split = document.getElementById('split');
  const topPct = Math.round(state.splitRatio * 100);
  split.style.gridTemplateRows = `${topPct}% var(--splitter) ${100 - topPct}%`;
  sm.settings.set({ splitRatio: state.splitRatio });
}

function renderTabs() {
  tabsEl.innerHTML = '';
  state.tabs.forEach(t => {
    const tab = document.createElement('div');
    tab.className = 'tab' + (t.id === state.activeId ? ' active' : '');
    tab.onclick = () => setActiveTab(t.id);
    tab.textContent = t.title || 'local';
    const close = document.createElement('span'); close.className = 'close'; close.textContent = ' ×';
    close.onclick = (e) => { e.stopPropagation(); closeTab(t.id); };
    tab.appendChild(close);
    tabsEl.appendChild(tab);
  });
  const add = document.createElement('div'); add.className = 'tab new-tab'; add.textContent = '+ New Tab'; add.onclick = () => addNewTab('local'); tabsEl.appendChild(add);
}

async function loadXtermTheme() {
  try {
    const resp = await fetch('../../design-system/modern/xterm-theme.json');
    return await resp.json();
  } catch { return {}; }
}

async function addNewTab(type, ssh = null) {
  const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const term = new Terminal({ cursorBlink: true, theme: await loadXtermTheme() });

  // Initialize chat terminal
  const chatTerm = new ChatTerminal(chatContainer, commandInput, chatMessages, null);

  let ptyId, writer, resizer;
  if (type === 'ssh' && ssh) {
    const open = await sm.ssh.openShell({ connId: ssh.connId, cols: 120, rows: 30 });
    if (!open.ok) { alert('SSH shell error: ' + open.error); return; }
    ptyId = open.data.ptyId;
    writer = (d) => sm.ssh.writeShell({ ptyId, data: d });
    resizer = (c,r) => sm.ssh.resizeShell({ ptyId, cols:c, rows:r });
  } else {
    const spawnRes = await sm.term.spawn({ tabId: id, cols: 120, rows: 30, preferUTF8: true });
    if (!spawnRes.ok) { alert('Failed to spawn terminal: ' + spawnRes.error); return; }
    ptyId = spawnRes.data.ptyId;
    writer = (d) => sm.term.write({ ptyId, data: d });
    resizer = (c,r) => sm.term.resize({ ptyId, cols:c, rows:r });
  }

  // Connect chat terminal to writer
  chatTerm.setWriter(writer);

  // Connect xterm to writer
  term.onData(data => writer(data));

  // Handle data from PTY - send to both xterm and chat terminal
  sm.term.onData(m => {
    if (m.ptyId === ptyId) {
      handleTermData(id, term, chatTerm, m.data);
    }
  });

  // SSH shell also emits via same event channel since main relays as evt.term.data
  sm.term.onExit(m => {
    if (m.ptyId === ptyId) {
      term.write(`\r\n[process exited ${m.code}]\r\n`);
      chatTerm.addSystemMessage(`Process exited with code ${m.code}`, '🛑');
    }
  });

  const home = type === 'ssh' ? '/' : await detectHome();
  state.tabs.push({
    id,
    title: type === 'ssh' ? (ssh.label || ssh.host || 'ssh') : 'local',
    ptyId,
    cwd: home,
    term,
    chatTerm,
    type,
    connId: ssh?.connId,
    write: writer,
    resize: resizer
  });
  setActiveTab(id);
  renderTabs();

  // Initial CWD probe so file pane shows something without manual click
  setTimeout(() => writer('printf \"\\nSM_CWD:%s\\n\" \"$PWD\"\r'), 50);
}

async function detectHome() {
  // Detect platform using navigator (browser-safe)
  const isWindows = navigator.platform.toLowerCase().includes('win');
  return isWindows ? 'C:/' : '/';
}

function setActiveTab(id) {
  state.activeId = id;
  const t = state.tabs.find(x => x.id === id);
  if (!t) return;
  cwdLabel.textContent = t.cwd || '';

  // Update connection status
  updateConnectionStatus(t.type, t.title);

  // Update current path in chat input
  const currentPath = document.getElementById('currentPath');
  if (currentPath) currentPath.textContent = t.cwd || '~';

  // Switch terminal UI based on mode
  if (state.useChatMode) {
    // Show chat terminal, hide xterm
    chatContainer.style.display = 'flex';
    termEl.style.display = 'none';
    document.querySelector('.command-input-wrapper').style.display = 'block';

    // Clear and prepare chat terminal - don't show welcome on every tab switch
    if (t.chatTerm) {
      t.chatTerm.focus();
    }
  } else {
    // Show xterm, hide chat terminal
    chatContainer.style.display = 'none';
    termEl.style.display = 'block';
    document.querySelector('.command-input-wrapper').style.display = 'none';

    // Reattach xterm
    while (termEl.firstChild) termEl.removeChild(termEl.firstChild);
    t.term.open(termEl);
    t.term.focus();
    fitTerminalToPane();
  }

  renderTabs();
  refreshFiles();
}

function closeTab(id) {
  const i = state.tabs.findIndex(x => x.id === id);
  if (i >= 0) {
    const t = state.tabs[i];
    sm.term.kill({ ptyId: t.ptyId });
    t.term.dispose();
    state.tabs.splice(i, 1);
    if (state.activeId === id) state.activeId = state.tabs[0]?.id || null;
    renderTabs(); if (state.activeId) setActiveTab(state.activeId);
  }
}

function fitTerminalToPane() {
  const rect = termEl.getBoundingClientRect();
  const cols = Math.max(40, Math.floor(rect.width / 8));
  const rows = Math.max(10, Math.floor(rect.height / 18));
  const t = state.tabs.find(x => x.id === state.activeId);
  if (t) (t.resize ? t.resize(cols, rows) : sm.term.resize({ ptyId: t.ptyId, cols, rows }));
}

async function refreshFiles() {
  const t = state.tabs.find(x => x.id === state.activeId);
  if (!t || !t.cwd) return;
  cwdLabel.textContent = t.cwd;
  const res = t.type === 'ssh' && t.connId ? await sm.ssh.sftpList({ connId: t.connId, path: t.cwd }) : await sm.fs.list({ path: t.cwd });
  fileTbody.innerHTML = '';
  if (!res.ok) { const r = document.createElement('div'); r.className='file-row'; r.textContent = 'Error: ' + res.error; fileTbody.appendChild(r); return; }
  const rows = res.data;
  rows.sort((a,b)=> a.type===b.type ? a.name.localeCompare(b.name) : (a.type==='dir'?-1:1));
  for (const r of rows) {
    const row = document.createElement('div'); row.className='file-row'; row.dataset.name = r.name; row.dataset.type = r.type;
    const name = document.createElement('div'); name.className='col-name'; name.textContent = r.name + (r.type==='dir'?'/':(r.type==='symlink'?' →':''));
    const size = document.createElement('div'); size.className='col-size'; size.textContent = r.type==='file'? human(r.size) : '—';
    const mt = document.createElement('div'); mt.className='col-modified'; mt.textContent = r.mtime ? new Date(r.mtime).toLocaleString() : '';
    const type = document.createElement('div'); type.className='col-type'; type.textContent = r.type;
    row.append(name,size,mt,type); fileTbody.appendChild(row);
    row.ondblclick = () => onRowOpen(r);
    row.onclick = (e) => { onRowSelect(row, e); };
  }
}

function human(n) { if (n < 1024) return `${n} B`; const u=['KB','MB','GB','TB']; let i=-1; do { n/=1024; i++; } while(n>=1024&&i<u.length-1); return `${n.toFixed(1)} ${u[i]}`; }

// Divider drag
let drag=false, startY=0, startRatio=state.splitRatio;
divider.addEventListener('mousedown', (e)=>{ drag=true; startY=e.clientY; startRatio=state.splitRatio; document.body.style.cursor='row-resize'; });
window.addEventListener('mouseup', ()=>{ drag=false; document.body.style.cursor=''; });
window.addEventListener('mousemove', (e)=>{
  if (!drag) return; const h = window.innerHeight - (56 + 40); const dy = e.clientY - startY; const delta = dy / h; state.splitRatio = Math.max(0.2, Math.min(0.85, startRatio + delta)); applySplitRatio(); fitTerminalToPane(); });

window.addEventListener('resize', () => fitTerminalToPane());

function updateCwd(tabId, cwd) {
  const t = state.tabs.find(x => x.id === tabId); if (!t) return;
  t.cwd = cwd; if (t.id === state.activeId) { cwdLabel.textContent = cwd; refreshFiles(); }
}

function handleTermData(tabId, term, chatTerm, data) {
  term.write(data);

  // Send to chat terminal if in chat mode
  if (state.useChatMode && chatTerm) {
    chatTerm.handleTerminalOutput(data);
  }

  // Handle CWD updates
  const idx = data.indexOf('SM_CWD:');
  if (idx >= 0) {
    const line = data.slice(idx).split('\n')[0];
    const v = line.replace(/^SM_CWD:/, '').trim();
    if (v) updateCwd(tabId, v);
  }
}

// Connect modal
connectModal.addEventListener('click', (e) => {
  if (e.target === connectModal || e.target.classList.contains('modal-backdrop')) {
    connectModal.classList.add('hidden');
  }
});

document.getElementById('sshCancel').onclick = () => {
  console.log('[ui] cancel connect');
  connectModal.classList.add('hidden');
};

document.getElementById('sshConnect').onclick = async () => {
  console.log('[ui] connect clicked');
  const host = sshHost.value.trim(); const port = parseInt(sshPort.value,10)||22; const username = sshUser.value.trim(); const password = sshPass.value;
  if (!host || !username) { alert('Host and user required'); return; }
  lastConnect = { host, port, username, password, agentForward: !!sshAgentFwd.checked, privateKeyPath: sshKeyPath.value.trim(), passphrase: sshKeyPass.value };
  if (!sshAvailable) { alert('SSH library not available. Run: npm i ssh2'); return; }
  const res = await sm.ssh.connect(lastConnect);
  if (!res.ok) { alert('SSH error: ' + res.error); return; }
  connectModal.classList.add('hidden');
  await addNewTab('ssh', { connId: res.data.connId, host, label: host });
};

// Delegation fallback in case direct handlers didn't bind
connectModal.addEventListener('click', async (e) => {
  const id = e.target && e.target.id;
  if (id === 'sshCancel') { console.log('[ui] cancel via delegate'); connectModal.classList.add('hidden'); }
  if (id === 'sshConnect') { console.log('[ui] connect via delegate'); await document.getElementById('sshConnect').onclick(); }
});

// ============ Keyboard Shortcuts ============
window.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

  // ESC to close modal
  if (e.key === 'Escape') {
    if (!connectModal.classList.contains('hidden')) {
      connectModal.classList.add('hidden');
      e.preventDefault();
      return;
    }
    if (!hostkeyModal.classList.contains('hidden')) {
      hostkeyModal.classList.add('hidden');
      e.preventDefault();
      return;
    }
  }

  // Global shortcuts (work anywhere except in input fields)
  const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

  // Ctrl/Cmd+T: New Tab
  if (ctrlOrCmd && e.key === 't' && !inInput) {
    e.preventDefault();
    addNewTab('local');
    return;
  }

  // Ctrl/Cmd+W: Close Tab
  if (ctrlOrCmd && e.key === 'w' && !inInput) {
    e.preventDefault();
    if (state.activeId) closeTab(state.activeId);
    return;
  }

  // Ctrl/Cmd+Shift+C: SSH Connect
  if (ctrlOrCmd && e.shiftKey && e.key === 'C' && !inInput) {
    e.preventDefault();
    connectModal.classList.remove('hidden');
    document.getElementById('sshHint').classList.toggle('hidden', sshAvailable);
    setTimeout(() => sshHost.focus(), 100);
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

  // F5: Refresh files
  if (e.key === 'F5' && !inInput) {
    e.preventDefault();
    refreshFiles();
    return;
  }

  // Ctrl/Cmd+U: Upload
  if (ctrlOrCmd && e.key === 'u' && !inInput) {
    e.preventDefault();
    const t = state.tabs.find(x => x.id === state.activeId);
    if (t && t.type === 'ssh') uploadBtn.click();
    return;
  }

  // Ctrl/Cmd+D: Download
  if (ctrlOrCmd && e.key === 'd' && !inInput) {
    e.preventDefault();
    const t = state.tabs.find(x => x.id === state.activeId);
    if (t && t.type === 'ssh' && selection.size > 0) downloadBtn.click();
    return;
  }

  // Ctrl/Cmd+L: Clear terminal (send clear command)
  if (ctrlOrCmd && e.key === 'l' && !inInput) {
    e.preventDefault();
    const t = state.tabs.find(x => x.id === state.activeId);
    if (t && t.write) t.write('clear\r');
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
    const isSSH = t.type === 'ssh';

    (async () => {
      const res = isSSH
        ? await sm.ssh.rename({ connId: t.connId, oldPath, newPath })
        : await sm.fs.rename({ oldPath, newPath });
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

    const confirm = window.confirm(`Delete ${selection.size} item(s)?`);
    if (!confirm) return;

    const t = state.tabs.find(x => x.id === state.activeId);
    if (!t) return;

    const isSSH = t.type === 'ssh';

    (async () => {
      for (const name of selection) {
        const fullPath = normalizePath(t.cwd, name);
        // Find the row to get the type
        const row = Array.from(fileTbody.children).find(r => r.dataset.name === name);
        const isDir = row && row.dataset.type === 'dir';

        const res = isSSH
          ? await sm.ssh.delete({ connId: t.connId, path: fullPath, isDir })
          : await sm.fs.delete({ path: fullPath });
        if (!res.ok) alert(`Delete ${name} failed: ${res.error}`);
      }
      selection.clear();
      refreshFiles();
    })();
    return;
  }
});

// Hostkey events
sm.ssh.onHostkey(({ host, port, fingerprint, known, status }) => {
  console.log('[ssh] hostkey event', { host, port, fingerprint, known, status });
  if (!lastConnect || lastConnect.host !== host || (lastConnect.port||22) !== (port||22)) return;
  const title = status === 'mismatch' ? 'Host key changed' : 'First time connecting to this host';
  hkText.textContent = `${title}. Host: ${host}:${port || 22}`;
  hkFp.textContent = `SHA-256: ${fingerprint}`;
  hostkeyModal.classList.remove('hidden');
  hkCancel.onclick = () => { hostkeyModal.classList.add('hidden'); };
  hkOnce.onclick = async () => {
    console.log('[ssh] trust once clicked');
    await sm.ssh.trustHost({ host, port, fingerprint, mode: 'once' });
    hostkeyModal.classList.add('hidden');
    const res = await sm.ssh.connect(lastConnect);
    if (!res.ok) { alert('SSH error: ' + res.error); return; }
    connectModal.classList.add('hidden');
    await addNewTab('ssh', { connId: res.data.connId, host, label: host });
  };
  hkPersist.onclick = async () => {
    console.log('[ssh] trust persist clicked');
    await sm.ssh.trustHost({ host, port, fingerprint, mode: 'persist' });
    hostkeyModal.classList.add('hidden');
    const res = await sm.ssh.connect(lastConnect);
    if (!res.ok) { alert('SSH error: ' + res.error); return; }
    connectModal.classList.add('hidden');
    await addNewTab('ssh', { connId: res.data.connId, host, label: host });
  };
});

// Fallback: delegate clicks inside hostkey modal
hostkeyModal && hostkeyModal.addEventListener('click', async (e) => {
  const id = e.target && e.target.id;
  if (!id) return;
  if (id === 'hkCancel') { hostkeyModal.classList.add('hidden'); }
  if ((id === 'hkOnce' || id === 'hkPersist') && lastConnect && hkFp.textContent) {
    const fp = hkFp.textContent.replace(/^SHA-256:\s*/, '').trim();
    const host = lastConnect.host; const port = lastConnect.port||22;
    const mode = id === 'hkOnce' ? 'once' : 'persist';
    try {
      await sm.ssh.trustHost({ host, port, fingerprint: fp, mode });
      hostkeyModal.classList.add('hidden');
      const res = await sm.ssh.connect(lastConnect);
      if (!res.ok) { alert('SSH error: ' + res.error); return; }
      connectModal.classList.add('hidden');
      await addNewTab('ssh', { connId: res.data.connId, host, label: host });
    } catch (err) { console.error(err); }
  }
});

init();

function normalizePath(base, name) {
  const sep = base.includes('\\') ? '\\' : '/';
  const b = base.replace(/[\\/]+$/, '');
  return (b + sep + name).replace(/[\\/]+/g, sep);
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

function onRowOpen(row) {
  const t = state.tabs.find(x => x.id === state.activeId); if (!t) return;
  if (row.type === 'dir') {
    const next = normalizePath(t.cwd, row.name);
    t.cwd = next; cwdLabel.textContent = next; refreshFiles();
    // attempt to cd in shell for consistency
    t.write && t.write(`cd ${JSON.stringify(next)}\r`);
    setTimeout(()=> t.write && t.write('printf "\nSM_CWD:%s\n" "$PWD"\r'), 10);
  }
}

// Drag-drop upload
fileTbody.addEventListener('dragover', (e)=>{ e.preventDefault(); });
fileTbody.addEventListener('drop', async (e)=>{
  e.preventDefault();
  const t = state.tabs.find(x => x.id === state.activeId); if (!t || t.type !== 'ssh') return;
  const items = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
  for (const f of items) {
    if (!f.path) continue;
    const name = f.path.split(/\\\\|\//).pop();
    const remotePath = normalizePath(t.cwd, name);
    await sm.tx.enqueue({ kind:'upload', connId: t.connId, localPath: f.path, remotePath, policy:'rename' });
  }
  toggleTx(true); refreshTransfers();
});

function onRowSelect(row, e) {
  const name = row.dataset.name; const key = name;
  if (!e.ctrlKey && !e.metaKey) { selection.clear(); Array.from(fileTbody.children).forEach(c=> c.classList.remove('selected')); }
  if (selection.has(key)) { selection.delete(key); row.classList.remove('selected'); }
  else { selection.add(key); row.classList.add('selected'); }
}

// Download button
const downloadBtn = { click: async () => {
  const t = state.tabs.find(x => x.id === state.activeId); if (!t) return;
  if (t.type !== 'ssh') { alert('Download currently supports SSH remote only'); return; }
  if (!selection.size) { alert('Select files to download'); return; }
  const dest = await sm.dialog.openDirectory({ title: 'Select download directory' });
  if (!dest.ok || !dest.data) return;
  for (const name of selection) {
    const remotePath = normalizePath(t.cwd, name);
    const localPath = normalizePath(dest.data, name);
    await sm.tx.enqueue({ kind:'download', connId: t.connId, remotePath, localPath, policy:'rename' });
  }
  toggleTx(true);
  refreshTransfers();
}};

// Upload button - trigger file upload dialog
uploadBtn.onclick = async () => {
  const t = state.tabs.find(x => x.id === state.activeId); if (!t) return;
  if (t.type !== 'ssh') { alert('Upload currently supports SSH remote only'); return; }
  const files = await sm.dialog.openFile({ title: 'Select files to upload' });
  if (!files.ok) return; const list = files.data || [];
  for (const fp of list) {
    const name = fp.split(/\\\\|\//).pop();
    const remotePath = normalizePath(t.cwd, name);
    await sm.tx.enqueue({ kind:'upload', connId: t.connId, localPath: fp, remotePath, policy:'rename' });
  }
  toggleTx(true);
  refreshTransfers();
};

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
sshKeyBrowse.onclick = async () => {
  const ret = await sm.dialog.openFile({ title: 'Select private key' });
  if (ret.ok && ret.data && ret.data[0]) sshKeyPath.value = ret.data[0];
};

// Terminal mode toggle
const terminalModeToggle = document.getElementById('terminalModeToggle');
const terminalModeIcon = document.getElementById('terminalModeIcon');

if (terminalModeToggle) {
  terminalModeToggle.onclick = () => {
    state.useChatMode = !state.useChatMode;
    terminalModeIcon.textContent = state.useChatMode ? '🖥️' : '💬';
    terminalModeToggle.title = state.useChatMode ? 'Switch to Classic Terminal' : 'Switch to Chat Terminal';

    // Switch active tab's display mode
    if (state.activeId) {
      setActiveTab(state.activeId);
    }
  };
}

// Update connection status indicator
function updateConnectionStatus(type, label) {
  const statusDot = document.querySelector('#connectionStatus .status-dot');
  const statusText = document.querySelector('#connectionStatus .status-text');
  const scopeBadge = document.getElementById('scopeBadge');

  if (statusDot) {
    statusDot.className = 'status-dot';
    statusDot.classList.add(type === 'ssh' ? 'ssh' : 'local');
  }
  if (statusText) {
    statusText.textContent = label || (type === 'ssh' ? 'SSH' : 'Local');
  }
  if (scopeBadge) {
    scopeBadge.className = 'scope-badge';
    scopeBadge.classList.add(type === 'ssh' ? 'ssh' : 'local');
    scopeBadge.textContent = type === 'ssh' ? 'SSH' : 'Local';
  }
}

// File Panel Toggle
function setupFilePanelToggle() {
  const toggleBtn = document.getElementById('filePanelToggle');
  const splitEl = document.getElementById('split');

  if (!toggleBtn) return;

  // Apply initial state
  if (state.filePanelCollapsed) {
    splitEl.classList.add('file-panel-collapsed');
    toggleBtn.classList.add('collapsed');
  }

  toggleBtn.onclick = () => {
    state.filePanelCollapsed = !state.filePanelCollapsed;

    if (state.filePanelCollapsed) {
      // Collapse: save current ratio and collapse
      state.filePanelPreviousRatio = state.splitRatio;
      splitEl.classList.add('file-panel-collapsed');
      toggleBtn.classList.add('collapsed');
    } else {
      // Expand: restore previous ratio
      state.splitRatio = state.filePanelPreviousRatio || 0.6;
      splitEl.classList.remove('file-panel-collapsed');
      toggleBtn.classList.remove('collapsed');
      applySplitRatio();
      fitTerminalToPane();
    }

    // Save state
    sm.settings.set({
      filePanelCollapsed: state.filePanelCollapsed,
      splitRatio: state.splitRatio
    });
  };
}

// ============ File Operations ============
const fileContextMenu = document.getElementById('fileContextMenu');
let contextMenuTarget = null;

// Show context menu
fileTbody.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const row = e.target.closest('.file-row') || e.target.closest('[data-name]');
  if (!row) return;

  contextMenuTarget = {
    name: row.dataset.name,
    type: row.dataset.type
  };

  // Position menu at cursor
  fileContextMenu.style.left = `${e.clientX}px`;
  fileContextMenu.style.top = `${e.clientY}px`;
  fileContextMenu.classList.remove('hidden');
});

// Hide context menu on click outside
document.addEventListener('click', () => {
  fileContextMenu.classList.add('hidden');
});

// Handle context menu actions
fileContextMenu.addEventListener('click', async (e) => {
  const item = e.target.closest('.context-menu-item');
  if (!item || !contextMenuTarget) return;

  const action = item.dataset.action;
  const t = state.tabs.find(x => x.id === state.activeId);
  if (!t) return;

  const fullPath = normalizePath(t.cwd, contextMenuTarget.name);
  const isSSH = t.type === 'ssh';

  try {
    switch (action) {
      case 'rename': {
        const newName = prompt('Enter new name:', contextMenuTarget.name);
        if (!newName || newName === contextMenuTarget.name) break;
        const newPath = normalizePath(t.cwd, newName);
        const res = isSSH
          ? await sm.ssh.rename({ connId: t.connId, oldPath: fullPath, newPath })
          : await sm.fs.rename({ oldPath: fullPath, newPath });
        if (!res.ok) alert(`Rename failed: ${res.error}`);
        else refreshFiles();
        break;
      }
      case 'delete': {
        const confirm = window.confirm(`Delete "${contextMenuTarget.name}"?`);
        if (!confirm) break;
        const res = isSSH
          ? await sm.ssh.delete({ connId: t.connId, path: fullPath, isDir: contextMenuTarget.type === 'dir' })
          : await sm.fs.delete({ path: fullPath });
        if (!res.ok) alert(`Delete failed: ${res.error}`);
        else refreshFiles();
        break;
      }
      case 'newFolder': {
        const name = prompt('Enter folder name:');
        if (!name) break;
        const path = normalizePath(t.cwd, name);
        const res = isSSH
          ? await sm.ssh.mkdir({ connId: t.connId, path })
          : await sm.fs.mkdir({ path });
        if (!res.ok) alert(`Create folder failed: ${res.error}`);
        else refreshFiles();
        break;
      }
      case 'newFile': {
        const name = prompt('Enter file name:');
        if (!name) break;
        const path = normalizePath(t.cwd, name);
        const res = isSSH
          ? await sm.ssh.createFile({ connId: t.connId, path })
          : await sm.fs.createFile({ path });
        if (!res.ok) alert(`Create file failed: ${res.error}`);
        else refreshFiles();
        break;
      }
      case 'copyPath': {
        try {
          await navigator.clipboard.writeText(fullPath);
        } catch {
          prompt('Copy path:', fullPath);
        }
        break;
      }
      case 'refresh': {
        refreshFiles();
        break;
      }
    }
  } catch (error) {
    alert(`Operation failed: ${error.message}`);
  }

  fileContextMenu.classList.add('hidden');
});


// ============ Command Palette ============
import { CommandPalette } from './command-palette.mjs';

const commandPalette = new CommandPalette();

// Register commands
commandPalette.registerCommands([
  { id: 'newTab', icon: '📄', name: 'New Tab', description: 'Open a new local terminal tab', shortcut: 'Ctrl+T', tags: ['terminal'], action: () => addNewTab('local') },
  { id: 'closeTab', icon: '✕', name: 'Close Tab', description: 'Close current tab', shortcut: 'Ctrl+W', tags: ['terminal'], action: () => { if (state.activeId) closeTab(state.activeId); } },
  { id: 'sshConnect', icon: '🔐', name: 'SSH Connect', description: 'Connect to a remote server via SSH', shortcut: 'Ctrl+Shift+C', tags: ['ssh', 'connect'], action: () => { connectModal.classList.remove('hidden'); setTimeout(() => sshHost.focus(), 100); } },
  { id: 'refreshFiles', icon: '🔄', name: 'Refresh Files', description: 'Refresh file explorer', shortcut: 'F5', tags: ['files'], action: refreshFiles },
  { id: 'newFolder', icon: '📁', name: 'New Folder', description: 'Create a new folder in current directory', tags: ['files', 'create'], action: () => { document.querySelector('[data-action="newFolder"]')?.click(); } },
  { id: 'newFile', icon: '📝', name: 'New File', description: 'Create a new file in current directory', tags: ['files', 'create'], action: () => { document.querySelector('[data-action="newFile"]')?.click(); } },
  { id: 'clearTerminal', icon: '🧹', name: 'Clear Terminal', description: 'Clear terminal screen', shortcut: 'Ctrl+L', tags: ['terminal'], action: () => { const t = state.tabs.find(x => x.id === state.activeId); if (t && t.write) t.write('clear\r'); } },
  { id: 'toggleFilePanel', icon: '📂', name: 'Toggle File Panel', description: 'Show/hide file explorer panel', tags: ['ui'], action: () => { document.getElementById('filePanelToggle')?.click(); } },
  { id: 'showShortcuts', icon: '⌨️', name: 'Keyboard Shortcuts', description: 'Show all keyboard shortcuts', shortcut: 'F1', tags: ['help'], action: () => { shortcutsModal.classList.remove('hidden'); } },
  { id: 'switchTerminalMode', icon: '💬', name: 'Toggle Terminal Mode', description: 'Switch between chat and classic terminal', tags: ['terminal', 'ui'], action: () => { document.getElementById('terminalModeToggle')?.click(); } }
]);

// ============ Keyboard Shortcuts Help ============
const shortcutsModal = document.getElementById('shortcutsModal');
const shortcutsClose = document.getElementById('shortcutsClose');

if (shortcutsClose) {
  shortcutsClose.onclick = () => {
    shortcutsModal.classList.add('hidden');
  };
}

shortcutsModal.addEventListener('click', (e) => {
  if (e.target === shortcutsModal || e.target.classList.contains('modal-backdrop')) {
    shortcutsModal.classList.add('hidden');
  }
});

// Add shortcuts to keyboard handler
window.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
  const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

  // Ctrl/Cmd+K: Command Palette
  if (ctrlOrCmd && e.key === 'k' && !inInput) {
    e.preventDefault();
    commandPalette.show();
    return;
  }

  // F1: Keyboard Shortcuts
  if (e.key === 'F1' && !inInput) {
    e.preventDefault();
    shortcutsModal.classList.remove('hidden');
    return;
  }

  // ESC: Close command palette and shortcuts
  if (e.key === 'Escape') {
    if (!commandPalette.modal.classList.contains('hidden')) {
      commandPalette.hide();
      e.preventDefault();
      return;
    }
    if (!shortcutsModal.classList.contains('hidden')) {
      shortcutsModal.classList.add('hidden');
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

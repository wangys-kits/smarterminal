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
const chatContextMenu = document.getElementById('chatContextMenu');
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
  splitRatio: 0.5, // Changed from 0.6 to 0.5 for more balanced split (50/50)
  tabs: [], // {id,title,ptyId,cwd,term,chatTerm,type,connId}
  activeId: null,
  useChatMode: true // Changed to true for default chat mode
};
let sshAvailable = false;
let selection = new Set();

async function init() {
  const s = await sm.settings.get();
  if (s.ok && s.data.splitRatio) state.splitRatio = s.data.splitRatio;
  applySplitRatio();
  setupChatContextMenu();
  await addNewTab('local');
  try { const a = await sm.ssh.available(); sshAvailable = !!(a.ok && a.data); } catch { sshAvailable = false; }
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
  
  // Clear chat messages for new tab and add welcome message
  chatTerm.clearMessages();
  addWelcomeMessage(chatMessages);

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
  const initialTitle = type === 'ssh' ? (ssh.label || ssh.host || getDirName(home)) : getDirName(home);
  state.tabs.push({
    id,
    title: initialTitle,
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

  // Initial CWD probe so tab title shows current directory without manual click
  // Add slight delay to ensure shell is ready
  setTimeout(() => {
    try {
      writer('printf "\\nSM_CWD:%s\\n" "$PWD"\r');
    } catch (e) {
      console.warn('Failed to send CWD probe:', e);
    }
  }, 100);
}

async function detectHome() {
  // Detect platform using navigator (browser-safe)
  const isWindows = navigator.platform.toLowerCase().includes('win');
  return isWindows ? 'C:/' : '/';
}

function addWelcomeMessage(messagesEl) {
  // Add welcome message to chat
  const welcomeMsg = document.createElement('div');
  welcomeMsg.className = 'system-message';
  welcomeMsg.innerHTML = `
    <div class="message-icon">🚀</div>
    <div class="message-content">
      <div class="message-text">Welcome to Smarterminal</div>
      <div class="message-hint">
        Type a command below •
        <kbd>Ctrl+Space</kbd> Suggestions •
        <kbd>Ctrl+L</kbd> Clear •
        <kbd>Ctrl+K</kbd> Export
      </div>
    </div>
  `;
  messagesEl.appendChild(welcomeMsg);
}

function setActiveTab(id) {
  // Save current tab's chat history before switching
  const currentTab = state.tabs.find(x => x.id === state.activeId);
  if (currentTab && currentTab.chatTerm && state.useChatMode) {
    currentTab.chatTerm.saveMessageHistory();
  }

  state.activeId = id;
  const t = state.tabs.find(x => x.id === id);
  if (!t) return;

  // Update connection status
  updateConnectionStatus(t.type, t.title);

  // Update current path in chat input with just directory name
  updateCurrentPathDisplay();

  // Switch terminal UI based on mode
  if (state.useChatMode) {
    // Show chat terminal, hide xterm
    chatContainer.style.display = 'flex';
    termEl.style.display = 'none';
    document.querySelector('.command-input-wrapper').style.display = 'block';

    // Restore chat messages for this tab
    if (t.chatTerm) {
      t.chatTerm.restoreMessageHistory();
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


function human(n) { if (n < 1024) return `${n} B`; const u=['KB','MB','GB','TB']; let i=-1; do { n/=1024; i++; } while(n>=1024&&i<u.length-1); return `${n.toFixed(1)} ${u[i]}`; }


window.addEventListener('resize', () => fitTerminalToPane());


function handleTermData(tabId, term, chatTerm, data) {
  // Debug logging to see what raw terminal data we're receiving
  console.log('[DEBUG] Raw terminal data received:', JSON.stringify(data));
  console.log('[DEBUG] Data length:', data ? data.length : 0);
  console.log('[DEBUG] Tab ID:', tabId);
  console.log('[DEBUG] Chat mode:', state.useChatMode);

  // Handle CWD updates
  const idx = data.indexOf('SM_CWD:');
  if (idx >= 0) {
    const line = data.slice(idx).split('\n')[0];
    const v = line.replace(/^SM_CWD:/, '').trim();

    // Update tab's current working directory and title
    const tab = state.tabs.find(t => t.id === tabId);
    if (tab) {
      tab.cwd = v;
      tab.title = getDirName(v);

      // Update current path display if this is the active tab
      if (tab.id === state.activeId) {
        updateCurrentPathDisplay();
      }

      renderTabs();
    }

    // Remove CWD data from what's displayed to avoid showing it in terminal
    data = data.replace(/\r?\n?SM_CWD:.*\r?\n?/, '');
    console.log('[DEBUG] Data after CWD removal:', JSON.stringify(data));
  }

  // Even if there's no data left after CWD processing, still process it
  // to ensure we don't miss important empty responses
  if (!data) {
    console.log('[DEBUG] No data to process, but still sending to terminals');
    data = ''; // Ensure we have a string to work with
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
    console.log('[DEBUG] Sending data to chat terminal');
    chatTerm.handleTerminalOutput(data);
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




// ============ Command Palette ============
import { CommandPalette } from './command-palette.mjs';

const commandPalette = new CommandPalette();

// Register commands
commandPalette.registerCommands([
  { id: 'newTab', icon: '📄', name: 'New Tab', description: 'Open a new local terminal tab', shortcut: 'Ctrl+T', tags: ['terminal'], action: () => addNewTab('local') },
  { id: 'closeTab', icon: '✕', name: 'Close Tab', description: 'Close current tab', shortcut: 'Ctrl+W', tags: ['terminal'], action: () => { if (state.activeId) closeTab(state.activeId); } },
  { id: 'sshConnect', icon: '🔐', name: 'SSH Connect', description: 'Connect to a remote server via SSH', shortcut: 'Ctrl+Shift+C', tags: ['ssh', 'connect'], action: () => { connectModal.classList.remove('hidden'); setTimeout(() => sshHost.focus(), 100); } },
  { id: 'clearTerminal', icon: '🧹', name: 'Clear Terminal', description: 'Clear terminal screen', shortcut: 'Ctrl+L', tags: ['terminal'], action: () => { const t = state.tabs.find(x => x.id === state.activeId); if (t && t.write) t.write('clear\r'); } }
]);

// Add shortcuts to keyboard handler
window.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
  const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';

  // Ctrl+C: Copy selected text (when text is selected)
  if (e.ctrlKey && e.key === 'c') {
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

  // Ctrl/Cmd+K: Command Palette
  if (ctrlOrCmd && e.key === 'k' && !inInput) {
    e.preventDefault();
    commandPalette.show();
    return;
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

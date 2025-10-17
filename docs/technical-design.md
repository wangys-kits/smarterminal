# Smarterminal Technical Design (Tech.md)

> Scope: Implements the final MVP PRD. Focus on architecture, module contracts, security, IPC, data models, platform specifics, and key algorithms (CWD sync, SFTP resume, port-forwarding). No project management content.

## 0. Goals & Non-goals
- Goals: Cross-platform Electron app providing terminal (PTY+xterm.js), SSH/SFTP, file manager tied to active terminal CWD, manual refresh, upload/download with resume, multi-tabs/windows, port/agent forwarding, persistent sessions, i18n, auto-update (Win/mac), Linux "check for update".
- Non-goals: Plugins, editor, advanced permissions (chmod/chown), extra protocols (S3/FTP), terminal split panes, collaboration.

## 1. Architecture Overview
- Processes
  - Main (Node): app lifecycle, windows, auto-update, SSH/SFTP, credentials, filesystem, settings, logging.
  - Renderer (Web): UI (tabs, terminal, file explorer, transfers, settings), i18n, state.
  - Preload: secure IPC bridges; contextIsolation=true; nodeIntegration=false; sandboxed renderer.
- Tech stack: Electron + TypeScript, React (or Vue) in renderer, xterm.js, node-pty, ssh2, ssh2-sftp-client, keytar, zod for validation.

### 1.1 Security Defaults (Electron)
- BrowserWindow: contextIsolation=true, sandbox=true, disable remote module, nodeIntegration=false, webSecurity=true.
- IPC: request/response only via preload; whitelist channels; payload validated (zod); timeouts.
- CSP: default-src 'self'; block inline scripts (use sha256 for preload injections if needed).
- File scheme: restrict to app resources and user-selected directories.

### 1.2 High-level Modules
- ConnectionManager (main): manages SSH connections, known-hosts verification, keepalive, agent/port forwarding, ProxyJump.
- TerminalManager (main+renderer): spawns PTY (node-pty); profiles, encoding; bridges data to xterm.js; search add-on in renderer.
- CwdHostSync (renderer helper + shell integration): consumes OSC 7/OSC 133 to infer host and cwd; prompts user to switch file view; fallback manual switch.
- FileService (main): local fs and SFTP list/read/write/delete/rename/mkdir; symlink aware; remote path semantics.
- TransferManager (main): queue + workers; upload/download; resume; concurrency control; progress events; failure retry.
- PortForwardManager (main): local/remote/dynamic SOCKS; conflict detection; rebind on reconnect.
- CredentialVault (main): keytar first; fallback encrypted vault with master password (AES-256-GCM, scrypt KDF); ephemeral “session-only” option.
- SettingsStore (main): typed settings persisted in JSON (electron-store-like) or SQLite; schema migration with zod.
- SessionStore (main): tabs/windows/session state persist/restore; scrolling history size; split ratio per window.
- Updater (main): electron-updater (Win/mac); Linux opens release URL.
- I18n (renderer): i18next (or equivalent), locale switching at runtime; some settings require restart (flagged).

## 2. Data Models (TypeScript)
```ts
// ids
type Id = string; // uuid

// Credentials & hosts
export type AuthMethod =
  | { type: 'password'; username: string; passwordRef: string /* vault key */ }
  | { type: 'key'; username: string; privateKeyRef: string; passphraseRef?: string }
  | { type: 'agent'; username: string };

export type HostConfig = {
  id: Id;
  label?: string;               // default tab name from Host/Hostname if missing
  host: string;                  // Hostname or alias
  port: number;                  // default 22
  auth: AuthMethod;
  proxyJump?: string;            // user@jump:port
  proxyCommand?: string;         // advanced
  knownHostsPolicy?: 'strict'|'accept-once'|'off'; // default strict
  forwardAgent?: boolean;        // default false
  forwards?: PortForwardRule[];  // optional
};

export type PortForwardRule =
  | { id: Id; kind: 'local'; localAddr: string; localPort: number; remoteAddr: string; remotePort: number }
  | { id: Id; kind: 'remote'; remoteAddr: string; remotePort: number; localAddr: string; localPort: number }
  | { id: Id; kind: 'dynamic'; localAddr: string; localPort: number }; // SOCKS5

export type KnownHostEntry = {
  hostPattern: string; // may be hashed
  algo: 'ssh-ed25519'|'ecdsa-sha2-nistp256'|'rsa-sha2-256'|'rsa-sha2-512';
  fingerprintSHA256: string; // base64
  source: 'system'|'app';
};

// Terminal profile
export type TerminalProfile = {
  shell: 'zsh'|'bash'|'fish'|'powershell'|'cmd'|'wsl';
  args?: string[];
  env?: Record<string,string>;
  encoding: 'utf8'|'system';
  scrollback: number; // lines
  fontFamily?: string; fontSize?: number; theme?: string; trueColor?: boolean;
  preferUTF8?: boolean; // Windows hint
};

// Tabs & sessions
export type TabState = {
  id: Id;
  type: 'local'|'ssh';
  hostId?: Id;            // for ssh tabs
  title?: string;         // user override
  cwd?: string;           // last known cwd
  terminalProfile: TerminalProfile;
  scrollbackSnapshot?: string; // optional serialized buffer (size-limited)
};

export type WindowState = {
  id: Id;
  tabs: TabState[];
  activeTabId?: Id;
  splitRatio?: number; // 0..1, terminal vs file pane
};

// Transfers
export type TransferTask = {
  id: Id;
  kind: 'upload'|'download';
  state: 'queued'|'running'|'paused'|'failed'|'completed';
  localPath: string;
  remotePath: string;
  isDir: boolean;
  size?: number;                // bytes
  offset?: number;              // resume position
  checksum?: { algo: 'sha256'; value?: string; verified?: boolean };
  attempts: number;
  startedAt?: number; finishedAt?: number;
  error?: string;
  policy?: 'overwrite'|'skip'|'rename';
};

export type Settings = {
  locale: 'en'|'zh';
  downloadsDir: string;
  askDownloadDirEachTime: boolean;
  showHiddenFiles: boolean;
  splitRatioDefault: number; // default per app
  searchLimitLines: number;  // xterm search window
  transfer: { concurrency: number; adaptive: boolean; checksumEnabled: boolean };
  ssh: { keepAliveSec: number; retries: number; agentForwardDefault: boolean };
  updates: { auto: boolean; channel?: 'latest'|'beta'; linuxMode: 'open-url'|'appimage-selfupdate' };
};
```

## 3. IPC Contracts (whitelist)
- Channel naming: `app.<domain>.<action>`; all payloads validated with zod.
- Async request/response; main returns `{ ok: true, data } | { ok: false, error }`.

Examples
```ts
// Renderer -> Main
'app.host.list'                // () => HostConfig[]
'app.host.save'                // (HostConfig) => HostConfig
'app.host.delete'              // ({id}) => void

'app.session.load'             // () => WindowState[]
'app.session.save'             // (WindowState[]) => void

'app.ssh.connect'              // ({tabId, hostId}) => { connId }
'app.ssh.disconnect'           // ({connId}) => void
'app.ssh.status'               // ({connId}) => { state }

'app.term.spawn'               // ({tabId, profile, cwd?}) => { ptyId }
'app.term.write'               // ({ptyId, data})
'app.term.resize'              // ({ptyId, cols, rows})
'app.term.dispose'             // ({ptyId})

'app.fs.list'                  // ({scope:'local'|'remote', connId?, path}) => DirEntry[]
'app.fs.ops'                   // ({op:'rename'|'delete'|'mkdir'|'touch', scope, connId?, path, to?})

'app.tx.enqueue'               // (TransferTask) => { taskId }
'app.tx.control'               // ({taskId, action:'pause'|'resume'|'cancel'})
'app.tx.list'                  // () => TransferTask[]

'app.settings.get'             // () => Settings
'app.settings.set'             // (partial Settings) => Settings

// Main -> Renderer events
'evt.term.data'                // ({ptyId, data})
'evt.term.osc'                 // ({ptyId, osc: {type:'cwd'|'host', value}})
'evt.ssh.state'                // ({connId, state:'connecting'|'ready'|'closed'|'error', error?})
'evt.tx.progress'              // ({taskId, bytes, bps, eta})
```

## 4. Key Algorithms & Flows

### 4.1 Host & CWD Sync (OSC 7 / OSC 133)
- Preferred: shell integration emits OSC sequences on prompt updates.
  - OSC 7 (cwd): `\x1b]7;file://<host>/<url-encoded-path>\x07`
  - OSC 133 (prompt markers): used to improve reliability across shells.
- Fallback (opt-in): heuristic parsing of typical `user@host:~/path$` prompts; disabled by default.
- Renderer flow:
  1) xterm parses OSC => emits `evt.term.osc`.
  2) CwdHostSync debounces and compares with current file pane context.
  3) Show toast: "Switch to <host>:<cwd>?" with [Switch][Always][Never].
  4) Persist per-connection preference.

Shell snippets (installed per user opt-in)
```bash
# bash
__smarterminal_osc7() { printf "\033]7;file://%s%s\007" "${HOSTNAME}" "$(python3 - <<'PY'\nimport os,urllib.parse;print(urllib.parse.quote(os.getcwd()))\nPY)"; }
PROMPT_COMMAND="__smarterminal_osc7;$PROMPT_COMMAND"

# zsh
function precmd() { printf "\033]7;file://%s%s\007" "$HOST" "$(python3 - <<'PY'\nimport os,urllib.parse;print(urllib.parse.quote(os.getcwd()))\nPY)"; }

# fish
function __sm_osc7 --on-event fish_prompt; printf "\x1b]7;file://%s%s\x07" (hostname) (python3 -c 'import os,urllib.parse as u;print(u.quote(os.getcwd()))'); end
```
(Windows PowerShell emits the same OSC via `Write-Host -NoNewline "`e]7;file://$env:COMPUTERNAME$pwd`a"`; ConPTY supports it on Win10+.)

### 4.2 SFTP Capability Probe & Resume
- Capability probe (per connection):
  1) Create temp file in remote home; open with flags `r+` and attempt `write` at offset 1.
  2) If error indicates unsupported random write/seek, mark `resume=false` and delete temp.
- Upload resume:
  1) Stat remote path; if exists and policy==rename => compute new name; if skip => complete.
  2) If overwrite => start from 0; else if resume supported => set `offset=min(localSize,remoteSize)`.
  3) Create read stream from local with `{ start: offset }`.
  4) Open remote with flags:
     - overwrite: `w`
     - resume: `r+` (create if missing: `a+` then `r+`)
  5) Pipe with backpressure, write chunks with explicit position (ssh2 `sftp.write(fd, buffer, 0, len, pos, cb)`).
  6) On complete, optionally run checksum verify (remote `sha256sum`/`shasum -a 256`).
- Download resume:
  1) Stat local path; if exists and policy==rename/skip => handle accordingly.
  2) If resume => `offset = localSize` (if remoteSize>=localSize), open remote read with position, local write with `{ flags:'r+', start: offset }`.
- Degrade: if probe says `resume=false`, always full transfer.

### 4.3 Conflict-safe Renaming
- Pattern: `name (n).ext` with normalization:
  - Replace illegal chars on Windows `< > : " / \ | ? *` with `_`.
  - Trim trailing dots/spaces; enforce total path length limit (260 legacy, 32k with prefix) — use short hash suffix when truncating.

### 4.4 Adaptive Concurrency
- Target default=3 concurrent tasks.
- Adjust window size based on recent throughput/error rate:
  - If avg bps < threshold for 3 samples and error rate high -> reduce by 1 (min 1).
  - If high bps and low error -> increase by 1 (max 6).

### 4.5 Port Forwarding & Agent Forwarding
- Local forward: `conn.forwardIn(localAddr, localPort)` with conflict retry up to +5 ports.
- Remote forward: `conn.forwardOut` + server-side `tcpip-forward` (ssh2 API `forwardOut/forwardIn` per direction).
- Dynamic: spawn local SOCKS5 server bound to `localAddr:localPort`; register with connection.
- Reconnect: on SSH `ready` event, recreate forwards in deterministic order; on error emit to UI and optionally backoff.

### 4.6 KeepAlive & Reconnect Hints
- KeepAlive: default interval 20s; send `global-requests keepalive@openssh.com` or `TCP keepalive` via ssh2 config; retries=3.
- Reconnect by user: terminal shows hint; hitting Enter triggers `app.ssh.connect` with last HostConfig.

## 5. File Service Details
- Local: Node fs/promises; manual refresh only; dotfiles shown when enabled.
- Remote (SFTP): `ssh2-sftp-client` for high-level ops; fallback to raw `sftp` for resume (write with offset).
- Listing: collect `type`, `size`, `mtime`, `mode`, `isSymlink`; resolve link target lazily (on demand) to avoid latency.
- Deletion: default confirmation; remote `rm`/`rmdir` recursive implemented as traversal with safeguards.
- Path mapping:
  - WSL: `\\wsl$\<distro>\` (if possible); errors show hint to enable WSL integration.
  - POSIX: normalize `/` separators; Windows local: backslashes for UI but normalize internally.

## 6. Known Hosts & Host Key Verification
- Load system `~/.ssh/known_hosts` (hashed hosts supported) + app-level `known_hosts` (in app data dir).
- Compute SHA-256 fingerprints (base64) and display; MD5 disabled.
- Reject deprecated algorithms (dss, rsa-sha1).
- Mismatch flow: block connection; prompt with fingerprint diff; options: "Once" / "Trust & Update" / "Cancel"; audit log minimal metadata.

## 7. Credentials Vault
- Primary: keytar (Keychain/Credential Manager/libsecret).
- Fallback: encrypted JSON vault stored under app data dir.
  - KDF: scrypt(N=2^15, r=8, p=1), salt=16B random.
  - AEAD: AES-256-GCM, iv=12B random, tag=16B; secret derived from master password.
  - Lock timeout: default 10 min idle; memory zeroization best-effort.
- Session-only: in-memory only; survives until app quit.

## 8. Settings & Session Persistence
- Settings: JSON file with schema version; zod validated; on invalid, backup and reset to defaults.
- Session: per-window tabs, active tab, split ratio; rolling snapshot of terminal scrollback (size-limited, e.g., 1MB per tab compressed) optional.

## 9. Auto Update Strategy
- Win/mac: electron-updater with differential packages; background download; user confirm install.
- Linux: renderer invokes `openExternal(releaseUrl)`; AppImage mode (opt-in): enable nsis/AppImage updater self-update; DEB/RPM show apt/yum instructions; enterprise can disable checks.

## 10. I18n Strategy
- i18next with language packs `resources/i18n/{en,zh}.json`.
- Instant switch for renderer UI; items requiring restart marked with a badge.

## 11. Logging & Telemetry
- Levels: error, warn, info, debug (user switchable). Default info.
- Exclude terminal data and user commands. Include only metadata (bytes, durations, errors).
- Redaction: hostnames optional; credentials always redacted.
- Log bundling: zip logs + env summary for support.

## 12. Error Taxonomy
- E_CONN (connectivity), E_AUTH (auth), E_HOSTKEY (fingerprint), E_PERM (permission), E_DISK (space/quota), E_SFTP_CAP (resume unsupported), E_TIMEOUT, E_ABORT.
- User guidance strings mapped to i18n.

## 13. Directory Layout (proposal)
```
smarterminal/
  app/
    main/                 # Electron main process
      index.ts
      ipc/
        hosts.ts
        session.ts
        ssh.ts
        terminal.ts
        files.ts
        transfers.ts
        settings.ts
      services/
        connection-manager.ts
        port-forward-manager.ts
        credential-vault.ts
        file-service.ts
        transfer-manager.ts
        known-hosts.ts
        updater.ts
        logging.ts
        settings-store.ts
        session-store.ts
      platform/
        windows.ts
        linux.ts
        darwin.ts
    preload/
      index.ts
      bridges/
        hosts.ts
        session.ts
        ssh.ts
        terminal.ts
        files.ts
        transfers.ts
        settings.ts
    renderer/
      index.html
      main.tsx
      components/
      views/
      state/
      i18n/
    resources/
      shell-integration/
        bash.sh
        zsh.zsh
        fish.fish
        powershell.ps1
      i18n/
        en.json
        zh.json
      icons/
  build/
  package.json
```

## 14. Pseudocode Snippets

### 14.1 SSH Connect with KnownHosts
```ts
async function connect(host: HostConfig): Promise<ConnHandle> {
  const keyCheck = await knownHosts.getVerifier(host.host);
  const conn = new Client();
  return await new Promise((resolve, reject) => {
    conn.on('fingerprint', (fp) => {/* ssh2 doesn't emit this; we compute from hostkey in 'hostkey' event */});
    conn.on('ready', () => resolve({ id: uuid(), conn }));
    conn.on('error', reject);
    conn.connect({
      host: host.host,
      port: host.port || 22,
      username: getUsername(host),
      password: getPassword(host),
      privateKey: getKey(host),
      agent: host.forwardAgent ? process.env.SSH_AUTH_SOCK : undefined,
      keepaliveInterval: settings.ssh.keepAliveSec * 1000,
      algorithms: { serverHostKey: ['ssh-ed25519','ecdsa-sha2-nistp256','rsa-sha2-256','rsa-sha2-512'] },
      hostVerifier: (hash) => keyCheck(hash) // hash is SHA256 base64
    });
  });
}
```

### 14.2 SFTP Probe & Upload Resume
```ts
async function probeResume(conn: Client): Promise<boolean> {
  const sftp = await getSftp(conn);
  const tmp = `/tmp/.sm_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await sftpWriteFile(sftp, tmp, Buffer.from([0]));
  try {
    const fd = await sftpOpen(sftp, tmp, 'r+');
    await sftpWriteAt(sftp, fd, Buffer.from([1]), 1); // position 1
    await sftpClose(sftp, fd);
    return true;
  } catch { return false; }
  finally { try { await sftpUnlink(sftp, tmp); } catch {} }
}

async function uploadWithResume(conn: Client, local: string, remote: string, policy: Policy) {
  const sftp = await getSftp(conn);
  const st = await statRemoteIfExists(sftp, remote);
  const lstat = await fsStat(local);
  let offset = 0;
  if (st) {
    if (policy === 'skip') return 'skipped';
    if (policy === 'rename') remote = await nextName(remote);
    else if (policy === 'overwrite') offset = 0;
    else if (policy === 'resume' && st.size < lstat.size && capabilities.resume) offset = st.size;
  }
  // open remote
  const fd = await sftpOpen(sftp, remote, offset ? 'r+' : 'w');
  const rs = fs.createReadStream(local, { start: offset });
  let pos = offset;
  for await (const chunk of rs) {
    await sftpWriteAt(sftp, fd, chunk, pos);
    pos += chunk.length; reportProgress(pos, lstat.size);
  }
  await sftpClose(sftp, fd);
}
```

### 14.3 Port Forward Conflict Retry
```ts
async function bindLocalForward(conn, rule) {
  for (let i=0;i<5;i++) {
    try { await conn.forwardIn(rule.localAddr, rule.localPort); return rule.localPort; }
    catch (e) { if (e.code==='EADDRINUSE') rule.localPort++; else throw e; }
  }
  throw new Error('PORT_CONFLICT');
}
```

## 15. Platform Specifics
- Windows
  - ConPTY via node-pty; prefer UTF-8; do not force `chcp 65001`.
  - WSL detection for profile `wsl`; map file paths via `\\wsl$`.
- macOS/Linux
  - LANG/LC_ALL can be set for UTF-8 if needed; IME supported by xterm.js.

## 16. UX Notes (tech-bound)
- File pane switch: toast with [Switch][Always][Never]; per-connection preference persisted.
- Remote “Open in system file manager” replaced with “Copy remote path”.
- Delete/overwrite confirmation with "Don’t ask again (this session)".

## 17. Build & Packaging
- electron-builder configs:
  - mac: dmg + notarization; win: nsis + auto-update; linux: AppImage + deb + rpm (no auto-update except AppImage opt-in).
- Code signing: mac Developer ID, win code-sign cert.

## 18. QA Hooks (dev aids)
- Mock SFTP server toggle (local container) to simulate resume unsupported.
- Network throttle/testing flags per transfer worker.

## 19. Open Items (tracked in code comments)
- Heuristic prompt parser rules (disabled by default) — keep behind feature flag.
- Scrollback snapshot serialization size cap tuning.
- SOCKS dynamic forward: auth none; future option for username/password.


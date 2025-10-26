const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

let ssh2 = null;
try {
  ssh2 = require('ssh2');
} catch (err) {
  ssh2 = null;
}

/**
 * Lightweight logger adapter. Falls back to console.* if no structured logger
 * is provided.
 */
function makeLogger(logger) {
  const fallback = {
    info: console.log.bind(console, '[tmux]'),
    warn: console.warn.bind(console, '[tmux]'),
    error: console.error.bind(console, '[tmux]'),
    debug: (...args) => {
      if (process.env.SMARTERMINAL_DEBUG_TMUX) {
        console.log('[tmux:debug]', ...args);
      }
    }
  };
  if (!logger) return fallback;
  return {
    info: logger.info ? logger.info.bind(logger) : fallback.info,
    warn: logger.warn ? logger.warn.bind(logger) : fallback.warn,
    error: logger.error ? logger.error.bind(logger) : fallback.error,
    debug: logger.debug ? logger.debug.bind(logger) : fallback.debug
  };
}

function normalizeArch(input) {
  const arch = (input || os.arch() || '').toLowerCase();
  if (arch === 'x64' || arch === 'amd64') return 'x86_64';
  if (arch === 'arm64' || arch === 'aarch64') return 'arm64';
  return arch;
}

function shellQuote(str) {
  return `'${String(str).replace(/'/g, `'\\''`)}'`;
}

function isExecutable(filePath) {
  try {
    const st = fs.statSync(filePath);
    if (!st.isFile()) return false;
    if (st.size === 0) return false;
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
  return p;
}

function readChecksumFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (!content) return null;
    const token = content.split(/\s+/)[0];
    return token && token.length > 16 ? token : null;
  } catch {
    return null;
  }
}

async function copyFileIfChanged(src, dest) {
  try {
    const [srcStat, destStat] = await Promise.allSettled([fsp.stat(src), fsp.stat(dest)]);
    const needCopy = srcStat.status !== 'fulfilled' ||
      destStat.status !== 'fulfilled' ||
      srcStat.value.size !== destStat.value.size ||
      srcStat.value.mtimeMs > destStat.value.mtimeMs;
    if (needCopy) {
      await ensureDir(path.dirname(dest));
      await fsp.copyFile(src, dest);
      await fsp.chmod(dest, 0o755);
    }
    return dest;
  } catch (err) {
    throw new Error(`Failed to copy tmux binary: ${err.message || err}`);
  }
}

async function collectStream(stream) {
  return await new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    stream.on('data', chunk => { out += chunk.toString(); });
    stream.stderr?.on('data', chunk => { err += chunk.toString(); });
    stream.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(err || out || `Command failed with code ${code}`));
    });
    stream.on('error', reject);
  });
}

class TmuxManager {
  /**
   * @param {{ appRoot?: string, userDataDir?: string, logger?: any }} param0
   */
  constructor({ appRoot, userDataDir, logger } = {}) {
    this.appRoot = appRoot || path.resolve(__dirname);
    this.userDataDir = userDataDir || path.join(os.tmpdir(), 'smarterminal');
    this.cacheDir = path.join(this.userDataDir, 'tmux-bundled');
    this.logger = makeLogger(logger);
    this.manifest = this.loadManifest();
    /** @type {Map<string, any>} */
    this.sessions = new Map();
  }

  loadManifest() {
    try {
      const file = path.join(this.appRoot, 'resources', 'tmux', 'manifest.json');
      const raw = fs.readFileSync(file, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      this.logger.warn('Failed to load tmux manifest, bundled binaries disabled:', err?.message || err);
      return {};
    }
  }

  resolveBundledRelative(platform, arch) {
    const manifestPlatform = this.manifest?.[platform];
    if (!manifestPlatform) return null;
    const entry = manifestPlatform[arch];
    if (!entry || !entry.relativePath) return null;
    return entry;
  }

  async prepareBundledBinary(platform, arch) {
    const entry = this.resolveBundledRelative(platform, arch);
    if (!entry) return null;
    const src = path.join(this.appRoot, 'resources', 'tmux', entry.relativePath);
    if (!fs.existsSync(src)) {
      this.logger.warn('Bundled tmux binary missing:', src);
      return null;
    }
    const dest = path.join(this.cacheDir, platform, arch, 'tmux');
    await copyFileIfChanged(src, dest);
    const checksumFile = entry.checksumFile ? path.join(this.appRoot, 'resources', 'tmux', entry.checksumFile) : null;
    const checksum = checksumFile && fs.existsSync(checksumFile) ? readChecksumFile(checksumFile) : null;
    return { path: dest, checksum, source: 'bundled' };
  }

  async detectSystemTmux() {
    const candidates = ['tmux'];
    const envPath = process.env.PATH || '';
    const fallbackDirs = [
      '/usr/local/bin',
      '/usr/local/sbin',
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin'
    ];
    const searchDirs = [];
    for (const dir of envPath.split(path.delimiter)) {
      if (dir && !searchDirs.includes(dir)) searchDirs.push(dir);
    }
    for (const dir of fallbackDirs) {
      if (!searchDirs.includes(dir)) searchDirs.push(dir);
    }
    for (const dir of searchDirs) {
      try {
        if (!dir) continue;
        if (!fs.existsSync(dir)) continue;
        for (const name of candidates) {
          const full = path.join(dir, name);
          if (isExecutable(full)) {
            return { path: full, source: 'system' };
          }
        }
      } catch (_) {
        continue;
      }
    }
    return null;
  }

  /**
   * Ensure tmux exists on local machine. Returns { path, source }.
   */
  async ensureLocalTmux({ preferBundled = false } = {}) {
    const platform = process.platform;
    if (platform === 'win32') {
      throw new Error('tmux is not supported on Windows hosts');
    }
    const arch = normalizeArch();
    if (!preferBundled) {
      const sys = await this.detectSystemTmux();
      if (sys) {
        try {
          this.verifyLocalTmuxBinary(sys.path);
          return sys;
        } catch (err) {
          this.logger.warn('System tmux verification failed, ignoring candidate', { path: sys.path, error: err?.message || err });
        }
      }
    }
    const manifestPlatform = platform === 'darwin' ? 'darwin' : platform;
    const bundled = await this.prepareBundledBinary(manifestPlatform, arch);
    if (bundled && isExecutable(bundled.path)) {
      try {
        this.verifyLocalTmuxBinary(bundled.path);
      } catch (err) {
        this.logger.warn('Bundled tmux failed verification', { path: bundled.path, error: err?.message || err });
        throw new Error('Bundled tmux binary is not executable on this platform.');
      }
      return bundled;
    }
    throw new Error('No tmux binary available locally – install tmux or provide a bundled build.');
  }

  /**
   * Create a local tmux session and attach via node-pty.
   */
  async createLocalSession({ sessionName, cols = 120, rows = 30, cwd, env }) {
    const tmuxInfo = await this.ensureLocalTmux();
    const existed = this.checkLocalSessionExists(tmuxInfo.path, sessionName);
    const nodePty = this.requireNodePty();
    const tmuxArgs = existed
      ? ['attach-session', '-t', sessionName]
      : ['new-session', '-s', sessionName];
    const ptyProc = nodePty.spawn(tmuxInfo.path, tmuxArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: cwd || os.homedir(),
      env: { ...process.env, ...env }
    });

    const session = {
      type: 'local',
      sessionName,
      cols,
      rows,
      tmuxPath: tmuxInfo.path,
      proc: ptyProc,
      source: tmuxInfo.source,
      reused: existed
    };
    this.sessions.set(sessionName, session);
    if (ptyProc && typeof ptyProc.onExit === 'function') {
      ptyProc.onExit(() => {
        this.sessions.delete(sessionName);
      });
    }
    return session;
  }

  checkLocalSessionExists(tmuxPath, sessionName) {
    if (!sessionName) return false;
    try {
      const result = spawnSync(tmuxPath, ['has-session', '-t', sessionName], { stdio: 'ignore' });
      return typeof result.status === 'number' ? result.status === 0 : false;
    } catch (err) {
      this.logger.debug('Failed to query local tmux session existence', err?.message || err);
      return false;
    }
  }

  requireNodePty() {
    try {
      // This assumes node-pty already optional-required in main.js.
      // Requiring again reuses cache.
      return require('node-pty');
    } catch (err) {
      throw new Error('node-pty is required for local tmux sessions.');
    }
  }

  async establishSshConnection(target) {
    if (!ssh2) {
      throw new Error('ssh2 module is not available. Install optional dependency "ssh2".');
    }
    const Client = ssh2.Client;
    const conn = new Client();

    const connectionConfig = {
      host: target.host,
      port: target.port || 22,
      username: target.username,
      readyTimeout: target.readyTimeout || 20000,
      keepaliveInterval: target.keepaliveInterval || 10000,
      keepaliveCountMax: target.keepaliveCountMax || 3
    };

    if (target.privateKey) {
      connectionConfig.privateKey = target.privateKey;
      if (target.passphrase) connectionConfig.passphrase = target.passphrase;
    } else if (target.agent) {
      connectionConfig.agent = target.agent;
      if (target.agentForward) connectionConfig.agentForward = true;
    } else if (target.password) {
      connectionConfig.password = target.password;
    } else {
      const agentSock = process.env.SSH_AUTH_SOCK;
      if (agentSock) {
        connectionConfig.agent = agentSock;
        connectionConfig.agentForward = target?.agentForward ?? true;
      } else {
        throw new Error('No authentication method provided for SSH connection');
      }
    }

    await new Promise((resolve, reject) => {
      conn.once('ready', resolve);
      conn.once('error', reject);
      conn.connect(connectionConfig);
    });

    return conn;
  }

  async runRemoteCommand(conn, command, options = {}) {
    return await new Promise((resolve, reject) => {
      conn.exec(command, options, (err, stream) => {
        if (err) return reject(err);
        let stdout = '';
        let stderr = '';
        stream.on('data', (data) => { stdout += data.toString(); });
        stream.stderr.on('data', (data) => { stderr += data.toString(); });
        stream.on('close', (code) => {
          if (code === 0) resolve(stdout.trim());
          else reject(new Error(stderr || stdout || `Command failed: ${command}`));
        });
        stream.on('error', reject);
      });
    });
  }

  async ensureRemoteTmux(conn, target) {
    const existing = await this.runRemoteCommand(conn, 'command -v tmux || true');
    if (existing) {
      return { path: existing.split(/\s+/)[0], source: 'remote-system' };
    }

    const archRaw = await this.runRemoteCommand(conn, 'uname -m');
    const arch = normalizeArch(archRaw);
    const bundled = await this.prepareBundledBinary('linux', arch);
    if (!bundled || !isExecutable(bundled.path)) {
      throw new Error(`Remote host missing tmux and no bundled binary for arch "${arch}"`);
    }

    const remoteBase = target.remoteInstallBase || '~/.smarterminal/bin';
    const remotePath = `${remoteBase}/tmux`;
    await this.runRemoteCommand(conn, `mkdir -p ${remoteBase}`);

    await new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        const writeStream = sftp.createWriteStream(remotePath, { mode: 0o755 });
        const readStream = fs.createReadStream(bundled.path);
        readStream.pipe(writeStream);
        writeStream.on('close', () => resolve());
        writeStream.on('error', reject);
        readStream.on('error', reject);
        writeStream.on('close', () => {
          try { sftp.end(); } catch (_) {}
        });
      });
    });

    if (bundled.checksum) {
      const checkCmd = `cd ${remoteBase} && printf '%s  tmux\\n' ${shellQuote(bundled.checksum)} | sha256sum -c -`;
      try {
        await this.runRemoteCommand(conn, checkCmd);
      } catch (err) {
        this.logger.warn('Remote checksum validation failed (continuing):', err?.message || err);
      }
    }

    return { path: remotePath, source: 'uploaded' };
  }

  generateSessionName() {
    return `smrt_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`;
  }

  async createRemoteSession({ target, cols = 120, rows = 30, sessionName }) {
    if (!target || !target.host || !target.username) {
      throw new Error('Remote session requires host and username in target.');
    }
    const conn = await this.establishSshConnection(target);
    const tmuxInfo = await this.ensureRemoteTmux(conn, target);

    const name = sessionName || this.generateSessionName();
    const tmuxSocket = target.tmuxSocket || 'smarterminal';
    const envPrefix = target.prependPath ? `PATH=${target.prependPath}:$PATH ` : '';
    const baseCmd = `${envPrefix}${tmuxInfo.path} -L ${tmuxSocket}`;
    let sessionExists = true;
    try {
      await this.runRemoteCommand(conn, `${baseCmd} has-session -t ${name}`);
    } catch (_) {
      sessionExists = false;
    }
    if (!sessionExists) {
      await this.runRemoteCommand(conn, `${baseCmd} new-session -d -s ${name} -x ${cols} -y ${rows}`);
    }

    const attachCmd = `${baseCmd} attach-session -t ${name}`;
    const stream = await new Promise((resolve, reject) => {
      conn.exec(attachCmd, { pty: { term: 'xterm-256color', cols, rows } }, (err, execStream) => {
        if (err) return reject(err);
        resolve(execStream);
      });
    });

    const session = {
      type: 'ssh',
      sessionName: name,
      tmuxSocket,
      tmuxPath: tmuxInfo.path,
      source: tmuxInfo.source,
      conn,
      stream,
      cols,
      rows,
      target,
      reused: sessionExists
    };
    this.sessions.set(name, session);

    stream.on('close', () => {
      this.sessions.delete(name);
      try { conn.end(); } catch (_) {}
    });
    stream.on('error', (err) => {
      this.logger.warn('Remote tmux stream error:', err?.message || err);
    });

    return session;
  }

  /**
   * Fetch session by name.
   */
  getSession(sessionName) {
    return this.sessions.get(sessionName);
  }

  async resizeSession(sessionName, cols, rows) {
    const session = this.sessions.get(sessionName);
    if (!session) return false;
    session.cols = cols;
    session.rows = rows;
    if (session.type === 'local') {
      if (session.proc?.resize) {
        session.proc.resize(cols, rows);
        return true;
      }
      return false;
    }
    if (session.type === 'ssh') {
      if (session.stream?.setWindow) {
        try {
          session.stream.setWindow(rows, cols, rows * 8, cols * 8);
          return true;
        } catch (err) {
          this.logger.warn('Failed to resize remote tmux session:', err?.message || err);
        }
      }
    }
    return false;
  }

  async destroySession(sessionName, options = {}) {
    const session = this.sessions.get(sessionName);
    if (!session) return;
    this.sessions.delete(sessionName);
    if (session.type === 'local') {
      try { session.proc?.kill?.(); } catch (_) {}
    } else if (session.type === 'ssh') {
      const keepRemote = options.keepRemote ?? options.keepAlive ?? false;
      try {
        if (!keepRemote) {
          const cmd = `${session.tmuxPath} -L ${session.tmuxSocket} kill-session -t ${session.sessionName}`;
          await this.runRemoteCommand(session.conn, cmd).catch(() => {});
        }
      } catch (err) {
        this.logger.warn('Failed to kill remote tmux session:', err?.message || err);
      }
      try { session.stream?.close(); } catch (_) {}
      try { session.conn?.end(); } catch (_) {}
    }
  }

  async killDetachedSession({ sessionName, mode = 'tmux-local', target } = {}) {
    if (!sessionName) {
      throw new Error('Session name is required to destroy tmux session.');
    }
    if (mode === 'tmux-ssh') {
      if (!target || !target.host || !target.username) {
        throw new Error('SSH target is required to destroy remote tmux session.');
      }
      const conn = await this.establishSshConnection(target);
      try {
        const tmuxInfo = await this.ensureRemoteTmux(conn, target);
        const tmuxSocket = target.tmuxSocket || 'smarterminal';
        const envPrefix = target.prependPath ? `PATH=${target.prependPath}:$PATH ` : '';
        const baseCmd = `${envPrefix}${tmuxInfo.path} -L ${tmuxSocket}`;
        try {
          await this.runRemoteCommand(conn, `${baseCmd} kill-session -t ${sessionName}`);
        } catch (err) {
          const msg = err?.message || '';
          if (!/no such session/i.test(msg)) {
            throw err;
          }
        }
      } finally {
        try { conn.end(); } catch (_) {}
      }
      return true;
    }

    const tmuxInfo = await this.ensureLocalTmux();
    try {
      spawnSync(tmuxInfo.path, ['kill-session', '-t', sessionName], { stdio: 'ignore' });
    } catch (err) {
      const msg = err?.message || '';
      if (!/no such session/i.test(msg)) {
        throw err;
      }
    }
    return true;
  }

  verifyLocalTmuxBinary(tmuxPath) {
    const result = spawnSync(tmuxPath, ['-V'], { encoding: 'utf8' });
    if (result.error) {
      throw result.error;
    }
    if (typeof result.status === 'number' && result.status !== 0) {
      const detail = (result.stderr || result.stdout || '').trim();
      throw new Error(detail || `tmux exited with code ${result.status}`);
    }
    return true;
  }
}

module.exports = {
  TmuxManager,
  normalizeArch
};

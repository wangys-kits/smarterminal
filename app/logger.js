// Minimal structured logger for main process. Writes JSONL with rotation.
const fs = require('fs');
const path = require('path');
const os = require('os');

class FileLogger {
  constructor(opts) {
    this.getUserData = opts.getUserData; // () => string
    this.product = opts.product || 'SmartTerminal';
    this.maxSizeBytes = opts.maxSizeBytes || 10 * 1024 * 1024; // 10MB
    this.maxFiles = opts.maxFiles || 7; // keep 7 latest
    this.level = process.env.SM_LOG_LEVEL || 'info';
    this.stream = null;
    this.currentFile = null;
  }

  _logDir() {
    const dir = path.join(this.getUserData(), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  _fileNameBase() {
    const d = new Date();
    const y = String(d.getFullYear());
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${this.product.toLowerCase()}-${y}${m}${day}`;
  }

  _ensureStream() {
    const dir = this._logDir();
    const base = this._fileNameBase();
    const file = path.join(dir, `${base}.log`);
    if (!this.stream || this.currentFile !== file) {
      try { if (this.stream) this.stream.end(); } catch(_){}
      this.stream = fs.createWriteStream(file, { flags: 'a' });
      this.currentFile = file;
      this._prune(dir);
    }
    return this.stream;
  }

  _rotateIfNeeded() {
    try {
      if (!this.currentFile) return;
      const st = fs.statSync(this.currentFile);
      if (st.size >= this.maxSizeBytes) {
        try { this.stream.end(); } catch(_){}
        const ts = Date.now();
        const rotated = this.currentFile.replace(/\.log$/, `-${ts}.log`);
        fs.renameSync(this.currentFile, rotated);
        this.stream = fs.createWriteStream(this.currentFile, { flags: 'a' });
        this._prune(path.dirname(this.currentFile));
      }
    } catch(_){}
  }

  _prune(dir) {
    try {
      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.log'))
        .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a,b) => b.t - a.t);
      for (let i = this.maxFiles; i < files.length; i++) {
        try { fs.unlinkSync(path.join(dir, files[i].f)); } catch(_){}
      }
    } catch(_){}
  }

  _should(level) {
    const order = { error: 0, warn: 1, info: 2, debug: 3 };
    return (order[level] || 2) <= (order[this.level] || 2);
  }

  write(level, msg, meta) {
    if (!this._should(level)) return;
    const s = this._ensureStream();
    const payload = {
      ts: new Date().toISOString(),
      level,
      msg: typeof msg === 'string' ? msg : String(msg),
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      host: os.hostname(),
      ...meta
    };
    try {
      s.write(JSON.stringify(payload) + '\n');
      this._rotateIfNeeded();
    } catch(_){}
  }

  info(msg, meta={}) { this.write('info', msg, meta); }
  warn(msg, meta={}) { this.write('warn', msg, meta); }
  error(msg, meta={}) { this.write('error', msg, meta); }
  debug(msg, meta={}) { this.write('debug', msg, meta); }
}

module.exports = { FileLogger };


// Output Streamer - 流式输出到文件
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class OutputStreamer {
  constructor(ptyId) {
    this.ptyId = ptyId;
    this.outputFile = null;
    this.stream = null;
    this.totalSize = 0;
    this.isOpen = false;
  }

  open() {
    if (this.isOpen) return this.outputFile;

    try {
      // 创建输出目录
      const dir = path.join(app.getPath('userData'), 'command-outputs');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 生成文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${this.ptyId}_${timestamp}.log`;
      this.outputFile = path.join(dir, filename);

      // 创建写入流
      this.stream = fs.createWriteStream(this.outputFile, { flags: 'a' });
      this.isOpen = true;

      // 写入文件头
      const header = `# Command Output Log
# PTY ID: ${this.ptyId}
# Started: ${new Date().toISOString()}
# ========================================\n\n`;
      this.stream.write(header);

      this.safeLog('[OutputStreamer] Opened output file:', this.outputFile);
      return this.outputFile;
    } catch (err) {
      this.safeLog('[OutputStreamer] Failed to open output file:', err);
      return null;
    }
  }

  write(data) {
    if (!this.isOpen) {
      this.open();
    }

    if (!this.stream) return 0;

    try {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      this.stream.write(buffer);
      this.totalSize += buffer.length;
      return buffer.length;
    } catch (err) {
      this.safeLog('[OutputStreamer] Failed to write to output file:', err);
      return 0;
    }
  }

  close() {
    if (!this.isOpen) return;

    try {
      if (this.stream) {
        // 写入文件尾
        const footer = `\n\n# ========================================
# Ended: ${new Date().toISOString()}
# Total Size: ${this.formatSize(this.totalSize)}
`;
        this.stream.write(footer);
        this.stream.end();
        this.stream = null;
      }

      this.isOpen = false;
      // Use safe logging that won't throw EPIPE errors
      this.safeLog('[OutputStreamer] Closed output file:', this.outputFile);
    } catch (err) {
      // Silently handle errors during close to prevent EPIPE crashes
      this.safeLog('[OutputStreamer] Failed to close output file:', err);
    }
  }

  // Safe logging method that won't throw EPIPE errors
  safeLog(...args) {
    try {
      if (process.stdout && !process.stdout.destroyed) {
        console.log(...args);
      }
    } catch (err) {
      // Silently ignore logging errors
    }
  }

  getFilePath() {
    return this.outputFile;
  }

  getTotalSize() {
    return this.totalSize;
  }

  formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  // 清理旧的输出文件（保留最近 N 个）
  static cleanupOldFiles(keepCount = 50) {
    try {
      const dir = path.join(app.getPath('userData'), 'command-outputs');
      if (!fs.existsSync(dir)) return;

      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(dir, f),
          mtime: fs.statSync(path.join(dir, f)).mtimeMs
        }))
        .sort((a, b) => b.mtime - a.mtime);

      // 删除超过保留数量的文件
      if (files.length > keepCount) {
        const toDelete = files.slice(keepCount);
        toDelete.forEach(file => {
          try {
            fs.unlinkSync(file.path);
            console.log('[OutputStreamer] Deleted old output file:', file.name);
          } catch (err) {
            console.error('[OutputStreamer] Failed to delete file:', file.name, err);
          }
        });
      }
    } catch (err) {
      console.error('[OutputStreamer] Failed to cleanup old files:', err);
    }
  }
}

module.exports = OutputStreamer;

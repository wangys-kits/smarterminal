/* Path Completer Module - Tab completion for file paths */

export class PathCompleter {
  constructor() {
    this.currentDir = null;
    this.cache = new Map(); // Cache directory listings
    this.cacheTimeout = 5000; // 5 seconds cache
    this.homeDir = null; // Cache home directory
    // Remote execution context (e.g., active SSH). When set, listings
    // will be fetched from remote instead of local fs.
    // Shape: { type: 'ssh', target: { user, host, port } } or null
    this.remoteContext = null;
    this.initHomeDir();
  }

  /**
   * Initialize home directory (async)
   */
  async initHomeDir() {
    try {
      const result = await window.sm.app.getHomeDir();
      if (result.ok && result.data) {
        this.homeDir = result.data;
      }
    } catch (err) {
      console.warn('[PathCompleter] Failed to get home directory:', err);
    }
  }

  /**
   * Update current working directory
   */
  updateCurrentDirectory(cwd) {
    this.currentDir = cwd;
  }

  /**
   * Set or clear remote context used for path completion (e.g., SSH target)
   */
  setRemoteContext(ctx) {
    if (ctx && ctx.type === 'ssh' && ctx.target && ctx.target.host) {
      this.remoteContext = {
        type: 'ssh',
        target: {
          user: ctx.target.user || '',
          host: ctx.target.host,
          port: ctx.target.port || ''
        }
      };
    } else {
      this.remoteContext = null;
    }
  }

  /**
   * Detect if the cursor is in a path context
   * Returns path context info or null
   */
  detectPathContext(input, cursorPos) {
    if (!input || cursorPos < 0) return null;

    const beforeCursor = input.slice(0, cursorPos);

    // Pattern 1: Explicit path with / ~ or .
    // - Absolute paths: /usr/local or "/Library/Application Support/"
    // - Home paths: ~/Documents
    // - Relative paths: ./src or ../lib
    // Updated to support spaces (escaped or quoted) and all valid filename characters
    // Matches paths that:
    // 1. Start with /, ~, or .
    // 2. Continue with any characters except unescaped spaces
    // 3. Allow escaped spaces (\ ) within paths
    const explicitPathPattern = /(^|\s)([\.\/~](?:[^\s\\]|\\ )*?)$/;
    const explicitMatch = beforeCursor.match(explicitPathPattern);

    if (explicitMatch) {
      const fullPath = explicitMatch[2];
      const lastSlashIndex = fullPath.lastIndexOf('/');

      let directory, prefix;
      if (lastSlashIndex === -1) {
        // No slash found, e.g., "~" or "."
        directory = fullPath;
        prefix = '';
      } else {
        // Split at last slash
        directory = fullPath.slice(0, lastSlashIndex + 1);
        prefix = fullPath.slice(lastSlashIndex + 1);
      }

      return {
        fullPath,
        directory,
        prefix,
        startPos: explicitMatch.index + explicitMatch[1].length,
        endPos: cursorPos
      };
    }

    // Pattern 2: Filename after command (e.g., "cat a" or "vim file")
    // Match: command + whitespace + filename fragment
    const filenamePattern = /(^|\s)(\w+)\s+([\w\-\.]+)$/;
    const filenameMatch = beforeCursor.match(filenamePattern);

    if (filenameMatch) {
      const command = filenameMatch[2];
      const filename = filenameMatch[3];

      // Only trigger for file-related commands
      const fileCommands = [
        // Navigation and common file ops
        'cd', 'cat', 'less', 'more', 'head', 'tail', 'vim', 'vi', 'nano', 'emacs',
        'code', 'open', 'edit', 'rm', 'mv', 'cp', 'chmod', 'chown',
        'grep', 'awk', 'sed', 'diff', 'file', 'stat', 'wc', 'sort',
        'uniq', 'cut', 'paste', 'tr', 'tee', 'touch', 'ln'
      ];

      if (fileCommands.includes(command.toLowerCase())) {
        // Use current directory for filename completion
        return {
          fullPath: filename,
          directory: './',
          prefix: filename,
          startPos: filenameMatch.index + filenameMatch[1].length + command.length + 1,
          endPos: cursorPos
        };
      }
    }

    return null;
  }

  /**
   * Get home directory path
   */
  getHomeDirectory() {
    // Use cached value if available
    if (this.homeDir) {
      return this.homeDir;
    }

    // Fallback: try to infer from current directory
    if (this.currentDir && this.currentDir.startsWith('/Users/')) {
      const parts = this.currentDir.split('/');
      if (parts.length >= 3) {
        return `/${parts[1]}/${parts[2]}`;
      }
    }

    // Last resort fallback
    return null;
  }

  /**
   * Resolve directory path to absolute path
   */
  async resolveDirectory(directory) {
    if (!directory) return this.currentDir || '/';

    // Handle home directory
    if (this.remoteContext && (directory === '~' || directory.startsWith('~/'))) {
      // In remote context, defer ~ expansion to the remote shell
      return directory;
    }

    if (directory === '~' || directory === '~/') {
      let homeDir = this.getHomeDirectory();

      // If homeDir not cached yet, fetch it synchronously
      if (!homeDir) {
        await this.initHomeDir();
        homeDir = this.getHomeDirectory();
      }

      if (homeDir) {
        return directory === '~' ? homeDir : homeDir + '/';
      }

      // If still no homeDir, cannot resolve
      console.warn('[PathCompleter] Cannot resolve ~, homeDir not available');
      return null;
    }

    if (directory.startsWith('~/')) {
      let homeDir = this.getHomeDirectory();

      // If homeDir not cached yet, fetch it synchronously
      if (!homeDir) {
        await this.initHomeDir();
        homeDir = this.getHomeDirectory();
      }

      if (homeDir) {
        const relativePath = directory.slice(2); // Remove ~/
        return homeDir + '/' + relativePath;
      }

      // If still no homeDir, cannot resolve
      console.warn('[PathCompleter] Cannot resolve ~/, homeDir not available');
      return null;
    }

    // Handle relative paths
    if (directory.startsWith('./') || directory.startsWith('../')) {
      // Relative to current directory
      if (!this.currentDir) return directory;

      // Simple path resolution (backend will handle complex cases)
      if (directory === './') return this.currentDir;
      if (directory === '../') {
        const parts = this.currentDir.split('/').filter(Boolean);
        parts.pop();
        return '/' + parts.join('/');
      }

      // For more complex relative paths, combine with current dir
      const base = this.currentDir.endsWith('/') ? this.currentDir : this.currentDir + '/';
      return base + directory.slice(2); // Remove ./
    }

    // Absolute path
    if (directory.startsWith('/')) {
      return directory;
    }

    // Default: treat as relative to current dir
    if (this.currentDir) {
      const base = this.currentDir.endsWith('/') ? this.currentDir : this.currentDir + '/';
      return base + directory;
    }

    return directory;
  }

  /**
   * Get path completions for a given context
   */
  async getCompletions(pathContext) {
    if (!pathContext) return [];

    const { directory, prefix } = pathContext;
    const resolvedDir = await this.resolveDirectory(directory);

    console.log('[PathCompleter] getCompletions:', {
      directory,
      prefix,
      resolvedDir,
      homeDir: this.homeDir,
      currentDir: this.currentDir,
      remote: this.remoteContext ? (this.remoteContext.type || 'remote') : null
    });

    try {
      // Check cache first (keyed by local or remote)
      const cacheKey = this.remoteContext
        ? `ssh://${this.remoteContext.target.user || ''}@${this.remoteContext.target.host}${this.remoteContext.target.port ? ':' + this.remoteContext.target.port : ''}${resolvedDir}`
        : resolvedDir;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return this.filterAndSort(cached.entries, prefix);
      }

      let entries = [];
      if (this.remoteContext && this.remoteContext.type === 'ssh') {
        entries = await this.remoteList(resolvedDir, this.remoteContext.target);
      } else {
        // Query local file system via IPC
        console.log('[PathCompleter] Querying fs.list for:', resolvedDir);
        const result = await window.sm.fs.list({ path: resolvedDir });
        console.log('[PathCompleter] fs.list result:', result);
        if (!result.ok || !Array.isArray(result.data)) {
          console.warn('[PathCompleter] Invalid result:', result);
          return [];
        }
        entries = result.data;
      }

      // Cache the results
      this.cache.set(cacheKey, {
        entries,
        timestamp: Date.now()
      });

      // Filter and sort
      const filtered = this.filterAndSort(entries, prefix);
      console.log('[PathCompleter] Filtered results:', filtered.length);
      return filtered;
    } catch (err) {
      console.warn('[PathCompleter] Failed to get completions:', err);
      return [];
    }
  }

  /**
   * List a remote directory via ssh best-effort.
   */
  async remoteList(dir, target) {
    if (!dir || !target || !target.host) return [];
    const userHost = (target.user ? `${target.user}@` : '') + target.host;
    const portArg = target.port ? `-p ${target.port}` : '';
    const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
    // Expand ~ using $HOME to avoid quoting expansion issues
    let dirExpr;
    if (dir === '~') {
      dirExpr = '$HOME';
    } else if (dir.startsWith('~/')) {
      const rest = dir.slice(2);
      dirExpr = `$HOME/${rest.replace(/'/g, "'\\''")}`;
    } else {
      dirExpr = q(dir);
    }
    const remoteCmd = `sh -lc "printf '__SMRT_BEGIN__\\n'; ls -1A -p ${dirExpr} 2>/dev/null || true; printf '__SMRT_END__\\n'"`;
    const full = `ssh -o BatchMode=yes -o ConnectTimeout=3 ${portArg} ${userHost} ${q(remoteCmd)}`.replace(/\s+/g, ' ').trim();

    const commandId = `ls_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    const out = [];
    const onData = (m) => {
      if (m && m.commandId === commandId && typeof m.data === 'string') {
        out.push(m.data);
      }
    };
    const onExit = () => {};
    try { window.sm.cmd.onData(onData); window.sm.cmd.onExit(onExit); } catch (_) {}

    try {
      const execRes = await window.sm.cmd.execute({ commandId, command: full, cwd: undefined });
      if (!execRes?.ok) return [];
      await new Promise((resolve) => {
        const handler = (m) => { if (m && m.commandId === commandId) { try { window.sm.cmd.onExit(() => {}); } catch (_) {} resolve(); } };
        try { window.sm.cmd.onExit(handler); } catch (_) { resolve(); }
      });
    } catch (_) { return []; }

    const text = out.join('');
    const s = '__SMRT_BEGIN__';
    const e = '__SMRT_END__';
    const i1 = text.indexOf(s);
    const i2 = text.lastIndexOf(e);
    if (i1 === -1 || i2 === -1 || i2 <= i1) return [];
    const lines = text.slice(i1 + s.length, i2).split(/\r?\n/).map(v => v.trim()).filter(Boolean);
    return lines.map((name) => {
      let type = 'file';
      if (name.endsWith('/')) { type = 'dir'; name = name.slice(0, -1); }
      else if (name.endsWith('@')) { type = 'symlink'; name = name.slice(0, -1); }
      return { name, type };
    });
  }

  /**
   * Filter entries by prefix and sort them
   */
  filterAndSort(entries, prefix) {
    if (!Array.isArray(entries)) return [];

    const lowerPrefix = prefix.toLowerCase();

    // Filter by prefix
    const filtered = entries.filter(entry => {
      if (!entry || !entry.name) return false;
      return entry.name.toLowerCase().startsWith(lowerPrefix);
    });

    // Sort: directories first, then alphabetically
    filtered.sort((a, b) => {
      // Directories before files
      if (a.type === 'dir' && b.type !== 'dir') return -1;
      if (a.type !== 'dir' && b.type === 'dir') return 1;

      // Alphabetical
      return a.name.localeCompare(b.name);
    });

    return filtered;
  }

  /**
   * Apply completion to input
   */
  applyCompletion(input, cursorPos, pathContext, completion) {
    if (!pathContext || !completion) return { value: input, cursorPos };

    const { startPos, endPos, directory } = pathContext;

    // Escape spaces in the completion name
    const escapedName = completion.name.replace(/ /g, '\\ ');

    // Build the completed path
    let completedPath = directory + escapedName;

    // Add trailing slash for directories
    if (completion.type === 'dir') {
      completedPath += '/';
    }

    // Replace the path fragment in the input
    const before = input.slice(0, startPos);
    const after = input.slice(endPos);
    const newValue = before + completedPath + after;
    const newCursorPos = startPos + completedPath.length;

    return {
      value: newValue,
      cursorPos: newCursorPos
    };
  }

  /**
   * Find common prefix among completions
   */
  findCommonPrefix(completions) {
    if (!completions || completions.length === 0) return '';
    if (completions.length === 1) return completions[0].name;

    const first = completions[0].name;
    let commonPrefix = '';

    for (let i = 0; i < first.length; i++) {
      const char = first[i];
      const allMatch = completions.every(c => c.name[i] === char);

      if (allMatch) {
        commonPrefix += char;
      } else {
        break;
      }
    }

    return commonPrefix;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get icon for file type
   */
  getIcon(entry) {
    if (!entry) return '📄';

    switch (entry.type) {
      case 'dir':
        return '📁';
      case 'symlink':
        return '🔗';
      case 'file':
        // Check if executable
        if (entry.mode && (entry.mode & 0o111)) {
          return '⚙️';
        }
        return '📄';
      default:
        return '📄';
    }
  }

  /**
   * Format file size
   */
  formatSize(bytes) {
    if (!bytes || bytes === 0) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }
}

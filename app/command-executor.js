// Command Executor - 跨平台命令执行器（兼容性优先）
const { spawn } = require('child_process');
const kill = require('tree-kill');
const path = require('path');
const fs = require('fs');

class CommandExecutor {
  constructor() {
    // 检测 PTY 是否可用
    this.hasPTY = this.checkPTY();

    // 检测平台
    this.isWindows = process.platform === 'win32';
    this.isMac = process.platform === 'darwin';
    this.isLinux = process.platform === 'linux';

    // 选择最佳 shell
    this.shell = this.detectShell();

    // 存储所有运行中的命令进程
    this.processes = new Map();

    console.log('[CommandExecutor] Initialized:', {
      platform: process.platform,
      hasPTY: this.hasPTY,
      shell: this.shell
    });
  }

  checkPTY() {
    try {
      require('node-pty');
      return true;
    } catch {
      return false;
    }
  }

  detectShell() {
    if (this.isWindows) {
      // Windows: 优先 PowerShell，降级到 cmd
      const pwsh = this.findExecutable('pwsh.exe') ||
                   this.findExecutable('powershell.exe');
      return pwsh || process.env.COMSPEC || 'cmd.exe';
    } else {
      // Unix: 优先 bash，降级到 sh
      return process.env.SHELL ||
             this.findExecutable('/bin/bash') ||
             this.findExecutable('/bin/sh') ||
             '/bin/sh';
    }
  }

  findExecutable(name) {
    if (!name) return null;

    // 如果是绝对路径，直接检查
    if (path.isAbsolute(name)) {
      return fs.existsSync(name) ? name : null;
    }

    // 在 PATH 中搜索
    const pathEnv = process.env.PATH || '';
    const segments = pathEnv.split(path.delimiter).filter(Boolean);

    for (const dir of segments) {
      const fullPath = path.join(dir, name);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    return null;
  }

  /**
   * 执行命令（自动选择最佳模式）
   * @param {string} commandId - 命令唯一标识
   * @param {string} command - 要执行的命令
   * @param {object} options - 选项
   * @returns {object} 进程信息
   */
  executeCommand(commandId, command, options = {}) {
    console.log('[CommandExecutor] Execute:', { commandId, command, options });

    // 目前只使用多实例模式（最兼容）
    // 未来可以根据 options.interactive 选择 PTY 模式
    return this.executeSpawn(commandId, command, options);
  }

  /**
   * 使用 spawn 执行命令（多实例模式）
   */
  executeSpawn(commandId, command, options = {}) {
    const [shellPath, args] = this.getShellCommand(command);

    console.log('[CommandExecutor] Spawn:', {
      commandId,
      shell: shellPath,
      args,
      cwd: options.cwd
    });

    const proc = spawn(shellPath, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      windowsHide: true, // Windows 下隐藏窗口
      detached: !this.isWindows // Unix 下使用 detached 以便杀死进程组
    });

    // 存储进程信息
    const processInfo = {
      commandId,
      command,
      proc,
      pid: proc.pid,
      startTime: Date.now(),
      killed: false,
      exitHandlers: [] // 存储退出处理器
    };

    this.processes.set(commandId, processInfo);

    // 监听进程退出
    proc.on('close', (code, signal) => {
      console.log('[CommandExecutor] Process closed:', {
        commandId,
        pid: proc.pid,
        code,
        signal
      });

      // 调用所有退出处理器
      processInfo.exitHandlers.forEach(handler => {
        try {
          handler(code, signal);
        } catch (err) {
          console.error('[CommandExecutor] Exit handler error:', err);
        }
      });

      this.processes.delete(commandId);
    });

    proc.on('error', (err) => {
      console.error('[CommandExecutor] Process error:', { commandId, err });
      this.processes.delete(commandId);
    });

    return {
      commandId,
      pid: proc.pid,
      stdout: proc.stdout,
      stderr: proc.stderr,
      stdin: proc.stdin,
      proc: proc,
      // 添加退出处理器的方法
      onExit: (handler) => {
        processInfo.exitHandlers.push(handler);
      }
    };
  }

  /**
   * 获取平台特定的 shell 命令
   */
  getShellCommand(command) {
    if (this.isWindows) {
      // Windows: 使用 /c 或 -Command 参数
      if (this.shell.toLowerCase().includes('powershell')) {
        return [this.shell, ['-NoProfile', '-NonInteractive', '-Command', command]];
      } else {
        // cmd.exe
        return [this.shell, ['/c', command]];
      }
    } else {
      // Unix: 使用 -c 参数
      return [this.shell, ['-c', command]];
    }
  }

  /**
   * 终止命令
   * @param {string} commandId - 命令 ID
   * @returns {Promise<boolean>}
   */
  async killCommand(commandId) {
    const processInfo = this.processes.get(commandId);

    if (!processInfo) {
      console.warn('[CommandExecutor] Process not found:', commandId);
      return false;
    }

    if (processInfo.killed) {
      console.warn('[CommandExecutor] Process already killed:', commandId);
      return true;
    }

    processInfo.killed = true;
    const { pid, proc } = processInfo;

    console.log('[CommandExecutor] Killing process:', { commandId, pid });

    return new Promise((resolve) => {
      // 使用 tree-kill 杀死整个进程树
      kill(pid, 'SIGKILL', (err) => {
        if (err) {
          console.error('[CommandExecutor] Kill failed:', { commandId, pid, err });

          // 降级：直接杀死进程
          try {
            if (this.isWindows) {
              // Windows: 使用 taskkill
              spawn('taskkill', ['/F', '/T', '/PID', pid.toString()]);
            } else {
              // Unix: 发送 SIGKILL
              process.kill(pid, 'SIGKILL');
            }
          } catch (killErr) {
            console.error('[CommandExecutor] Direct kill also failed:', killErr);
          }
        } else {
          console.log('[CommandExecutor] Process killed successfully:', { commandId, pid });
        }

        // 清理
        this.processes.delete(commandId);
        resolve(true);
      });
    });
  }

  /**
   * 获取所有运行中的命令
   */
  getRunningCommands() {
    return Array.from(this.processes.values()).map(info => ({
      commandId: info.commandId,
      command: info.command,
      pid: info.pid,
      startTime: info.startTime,
      runtime: Date.now() - info.startTime
    }));
  }

  /**
   * 清理所有进程
   */
  async cleanup() {
    console.log('[CommandExecutor] Cleaning up all processes...');
    const promises = Array.from(this.processes.keys()).map(id => this.killCommand(id));
    await Promise.all(promises);
  }
}

module.exports = CommandExecutor;

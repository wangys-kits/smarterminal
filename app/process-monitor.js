// Process Monitor - 监控命令执行状态
const { exec } = require('child_process');
const os = require('os');

class ProcessMonitor {
  constructor(ptyId, pid) {
    this.ptyId = ptyId;
    this.pid = pid;
    this.startTime = Date.now();
    this.lastOutputTime = Date.now();
    this.metrics = {
      cpuUsage: 0,
      memoryUsage: 0,
      outputRate: 0,
      runtime: 0,
      isResponsive: true,
      outputSize: 0
    };
    this.monitorInterval = null;
    this.listeners = new Map();
    this.outputSizeWindow = [];
    this.windowSize = 5; // 5秒窗口
  }

  start() {
    if (this.monitorInterval) return;

    // 每秒更新一次指标
    this.monitorInterval = setInterval(() => {
      this.updateMetrics();
    }, 1000);
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  updateMetrics() {
    this.metrics.runtime = Date.now() - this.startTime;

    // 获取进程 CPU 和内存使用情况
    this.getProcessStats((err, stats) => {
      if (err) {
        console.warn('[ProcessMonitor] Failed to get process stats:', err);
        return;
      }

      this.metrics.cpuUsage = stats.cpu || 0;
      this.metrics.memoryUsage = stats.memory || 0;

      // 检查响应性
      this.checkResponsiveness();

      // 计算输出速率
      this.calculateOutputRate();

      // 触发监控事件
      this.notifyListeners();
    });
  }

  getProcessStats(callback) {
    if (!this.pid) {
      return callback(null, { cpu: 0, memory: 0 });
    }

    const platform = os.platform();
    let command;

    if (platform === 'darwin' || platform === 'linux') {
      // macOS/Linux: 使用 ps 命令
      command = `ps -p ${this.pid} -o %cpu,%mem,rss`;
    } else if (platform === 'win32') {
      // Windows: 使用 wmic 命令
      command = `wmic process where processid=${this.pid} get WorkingSetSize,PercentProcessorTime`;
    } else {
      return callback(new Error('Unsupported platform'));
    }

    exec(command, (error, stdout, stderr) => {
      if (error) {
        return callback(error);
      }

      try {
        const lines = stdout.trim().split('\n');
        if (lines.length < 2) {
          return callback(null, { cpu: 0, memory: 0 });
        }

        const values = lines[1].trim().split(/\s+/);

        if (platform === 'win32') {
          // Windows 格式
          const memory = parseInt(values[0], 10) || 0;
          const cpu = parseFloat(values[1]) || 0;
          callback(null, { cpu, memory });
        } else {
          // Unix 格式
          const cpu = parseFloat(values[0]) || 0;
          const memoryKB = parseInt(values[2], 10) || 0;
          const memory = memoryKB * 1024; // 转换为字节
          callback(null, { cpu, memory });
        }
      } catch (parseError) {
        callback(parseError);
      }
    });
  }

  checkResponsiveness() {
    // Unresponsive detection removed - no longer needed
  }

  calculateOutputRate() {
    // 计算最近 5 秒的平均输出速率
    const now = Date.now();
    this.outputSizeWindow = this.outputSizeWindow.filter(
      entry => now - entry.timestamp < this.windowSize * 1000
    );

    if (this.outputSizeWindow.length > 0) {
      const totalSize = this.outputSizeWindow.reduce((sum, entry) => sum + entry.size, 0);
      const timeSpan = (now - this.outputSizeWindow[0].timestamp) / 1000;
      this.metrics.outputRate = timeSpan > 0 ? totalSize / timeSpan : 0;
    } else {
      this.metrics.outputRate = 0;
    }
  }

  recordOutput(size) {
    this.lastOutputTime = Date.now();
    this.metrics.outputSize += size;

    // 记录到窗口
    this.outputSizeWindow.push({
      timestamp: Date.now(),
      size
    });

    // 检测异常输出速率
    if (this.metrics.outputRate > 1024 * 1024) { // 超过 1MB/s
      this.emit('high-output-rate', this.metrics);
    }
  }

  notifyListeners() {
    // 检测高 CPU 使用
    if (this.metrics.cpuUsage > 90 && this.metrics.runtime > 60000) {
      this.emit('high-cpu', this.metrics);
    }

    // 检测高内存使用
    if (this.metrics.memoryUsage > 500 * 1024 * 1024) { // 500MB
      this.emit('high-memory', this.metrics);
    }

    // 检测长时间运行
    if (this.metrics.runtime > 300000 && this.metrics.runtime % 60000 < 1000) {
      // 每分钟提醒一次
      this.emit('long-running', this.metrics);
    }

    // 始终发送更新事件
    this.emit('update', this.metrics);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    callbacks.forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.error('[ProcessMonitor] Listener error:', err);
      }
    });
  }

  getMetrics() {
    return { ...this.metrics };
  }
}

module.exports = ProcessMonitor;

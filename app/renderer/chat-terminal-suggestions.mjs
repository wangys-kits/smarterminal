/* Smart command suggestions for ChatTerminal */

export class CommandSuggestions {
  constructor() {
    this.commandStats = this.loadCommandStats();
    this.currentDir = null;
    this.dirContext = null;
  }

  loadCommandStats() {
    try {
      const stored = localStorage.getItem('smarterminal_command_stats');
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  }

  saveCommandStats() {
    try {
      localStorage.setItem('smarterminal_command_stats', JSON.stringify(this.commandStats));
    } catch (e) {
      console.error('Failed to save command stats:', e);
    }
  }

  updateCommandStats(command) {
    if (!command || command.startsWith('/')) return;

    const now = Date.now();
    if (!this.commandStats[command]) {
      this.commandStats[command] = {
        count: 0,
        lastUsed: now,
        firstUsed: now
      };
    }

    this.commandStats[command].count++;
    this.commandStats[command].lastUsed = now;
    this.saveCommandStats();
  }

  async detectDirectoryContext(cwd) {
    if (!cwd) return null;

    const context = {
      isGit: false,
      isNode: false,
      isPython: false,
      isRust: false,
      isGo: false,
      isDjango: false,
      isDocker: false
    };

    // TODO: Implement actual file system checks
    // For now, return empty context
    return context;
  }

  updateDirectoryContext(cwd) {
    this.currentDir = cwd;
    this.detectDirectoryContext(cwd).then(context => {
      this.dirContext = context;
    });
  }

  getContextualCommands() {
    const suggestions = [];

    if (!this.dirContext) return suggestions;

    if (this.dirContext.isGit) {
      suggestions.push(
        { cmd: 'git status', desc: 'Show working tree status', category: 'git' },
        { cmd: 'git add .', desc: 'Stage all changes', category: 'git' },
        { cmd: 'git commit -m ""', desc: 'Commit changes', category: 'git' },
        { cmd: 'git push', desc: 'Push to remote', category: 'git' },
        { cmd: 'git pull', desc: 'Pull from remote', category: 'git' },
        { cmd: 'git log --oneline', desc: 'Show commit history', category: 'git' },
        { cmd: 'git branch', desc: 'List branches', category: 'git' },
        { cmd: 'git checkout -b ', desc: 'Create new branch', category: 'git' }
      );
    }

    if (this.dirContext.isNode) {
      suggestions.push(
        { cmd: 'npm install', desc: 'Install dependencies', category: 'node' },
        { cmd: 'npm run dev', desc: 'Run dev server', category: 'node' },
        { cmd: 'npm run build', desc: 'Build project', category: 'node' },
        { cmd: 'npm test', desc: 'Run tests', category: 'node' },
        { cmd: 'npm start', desc: 'Start application', category: 'node' },
        { cmd: 'yarn install', desc: 'Install with yarn', category: 'node' },
        { cmd: 'yarn dev', desc: 'Run dev with yarn', category: 'node' }
      );
    }

    if (this.dirContext.isPython) {
      suggestions.push(
        { cmd: 'python -m venv venv', desc: 'Create virtual environment', category: 'python' },
        { cmd: 'pip install -r requirements.txt', desc: 'Install requirements', category: 'python' },
        { cmd: 'python manage.py runserver', desc: 'Run Django server', category: 'python' },
        { cmd: 'pytest', desc: 'Run tests', category: 'python' },
        { cmd: 'python -m pip list', desc: 'List installed packages', category: 'python' }
      );
    }

    if (this.dirContext.isDocker) {
      suggestions.push(
        { cmd: 'docker-compose up', desc: 'Start containers', category: 'docker' },
        { cmd: 'docker-compose down', desc: 'Stop containers', category: 'docker' },
        { cmd: 'docker ps', desc: 'List running containers', category: 'docker' },
        { cmd: 'docker logs ', desc: 'View container logs', category: 'docker' }
      );
    }

    return suggestions;
  }

  getSuggestions(input) {
    const suggestions = [];
    const inputLower = input.toLowerCase().trim();

    if (!inputLower || inputLower.length < 2) {
      const historySuggestions = Object.entries(this.commandStats)
        .map(([cmd, stats]) => ({
          cmd,
          desc: `Used ${stats.count} time${stats.count > 1 ? 's' : ''}`,
          lastUsed: stats.lastUsed,
          count: stats.count,
          score: this.calculateCommandScore(stats)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      suggestions.push(...historySuggestions);

      const contextual = this.getContextualCommands();
      suggestions.push(...contextual.slice(0, 3));

      return suggestions.slice(0, 8);
    }

    const matchingHistory = Object.entries(this.commandStats)
      .filter(([cmd]) => cmd.toLowerCase().includes(inputLower))
      .map(([cmd, stats]) => ({
        cmd,
        desc: `Used ${stats.count} time${stats.count > 1 ? 's' : ''}`,
        lastUsed: stats.lastUsed,
        count: stats.count,
        score: this.calculateCommandScore(stats)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    suggestions.push(...matchingHistory);

    const contextual = this.getContextualCommands()
      .filter(s => s.cmd.toLowerCase().includes(inputLower) || s.desc.toLowerCase().includes(inputLower));
    suggestions.push(...contextual);

    const seen = new Set();
    return suggestions.filter(s => {
      if (seen.has(s.cmd)) return false;
      seen.add(s.cmd);
      return true;
    }).slice(0, 8);
  }

  calculateCommandScore(stats) {
    const now = Date.now();
    const daysSinceLastUse = (now - stats.lastUsed) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 100 - daysSinceLastUse * 2);
    const frequencyScore = Math.min(100, stats.count * 5);

    return (recencyScore * 0.4) + (frequencyScore * 0.6);
  }

  formatRelativeTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  }
}

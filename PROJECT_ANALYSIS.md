# Smarterminal 项目代码分析报告

## 📋 项目概览

**项目名称：** Smarterminal  
**版本：** 0.1.0  
**许可证：** MIT  
**定位：** 现代化跨平台智能终端工作台（基于 Electron）

Smarterminal 是一个创新的终端应用，提供类似 Notebook 的聊天式交互界面，支持命令执行、Markdown 笔记、多标签会话管理、进程监控和文件预览等功能。项目采用 Electron 架构，结合 xterm.js 和 node-pty，为开发者提供强大且优雅的终端体验。

---

## 🏗️ 技术架构

### 1. 核心技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | ^29.4.6 | 应用框架 |
| xterm.js | ^5.3.0 | 终端UI渲染 |
| node-pty | ^1.0.0 | PTY（伪终端）支持 |
| electron-store | ^8.2.0 | 配置持久化 |
| ssh2 | ^1.15.0 | SSH连接（可选） |
| tree-kill | ^1.2.2 | 进程树管理 |

**语言选择：** 纯 JavaScript（ES6+ 模块），无 TypeScript 或框架依赖

### 2. 进程架构

采用 Electron 经典的三进程架构：

```
┌─────────────────────────────────────────────────┐
│              Main Process (Node.js)              │
│  ┌─────────────────────────────────────────┐   │
│  │ - Window Management                      │   │
│  │ - PTY/Stdio Terminal Lifecycle          │   │
│  │ - Tmux Session Manager                  │   │
│  │ - Process Monitor                       │   │
│  │ - Output Streamer                       │   │
│  │ - File Operations                       │   │
│  │ - Transfer Manager (SFTP)               │   │
│  │ - Tab Persistence (*.smt)               │   │
│  └─────────────────────────────────────────┘   │
└─────────────────┬───────────────────────────────┘
                  │ IPC Bridge
        ┌─────────┴──────────┐
        │                    │
┌───────▼────────┐  ┌────────▼────────┐
│   Preload.js   │  │  Renderer (Web)  │
│  (IPC Bridge)  │  │  ┌─────────────┐ │
│  - Whitelist   │◄─┤  │ Vanilla JS  │ │
│  - Security    │  │  │ ES Modules  │ │
│  - Context     │  │  │ xterm.js    │ │
│    Bridge      │  │  └─────────────┘ │
└────────────────┘  └─────────────────┘
```

**安全特性：**
- `contextIsolation: true` - 上下文隔离
- `sandbox: true` - 沙箱环境
- `nodeIntegration: false` - 禁用Node集成
- 严格的 CSP (Content Security Policy)
- IPC 通道白名单机制

---

## 📂 项目结构

```
smarterminal/
├── app/                          # 应用核心代码
│   ├── main.js                   # 主进程 (1845行)
│   ├── preload.js                # 预加载脚本 (97行)
│   ├── command-executor.js       # 命令执行器 (258行)
│   ├── tmux-manager.js           # Tmux会话管理 (560行)
│   ├── process-monitor.js        # 进程监控 (205行)
│   ├── output-streamer.js        # 输出流管理 (151行)
│   ├── logger.js                 # 日志系统
│   ├── renderer/                 # 渲染进程
│   │   ├── index.html            # 入口HTML
│   │   ├── renderer.mjs          # 主渲染逻辑 (4700行)
│   │   ├── chat-terminal.mjs     # 聊天式终端 (5526行)
│   │   ├── chat-terminal-cells.mjs        # 单元格管理
│   │   ├── chat-terminal-markdown.mjs     # Markdown渲染
│   │   ├── chat-terminal-suggestions.mjs  # 命令建议
│   │   ├── chat-terminal-path-completer.mjs # 路径补全
│   │   ├── i18n.mjs              # 国际化
│   │   ├── settings.mjs          # 设置管理
│   │   ├── command-palette.mjs   # 命令面板
│   │   └── styles.css            # 样式表
│   ├── assets/                   # 资源文件
│   └── resources/                # 资源（如tmux二进制）
│       └── tmux/                 # 打包的tmux二进制
├── design-system/                # 设计系统
│   └── modern/                   # 现代化主题
├── docs/                         # 文档
│   ├── product-requirements.md   # 产品需求文档
│   ├── technical-design.md       # 技术设计文档
│   └── ui-*/                     # UI设计参考
├── build/                        # 构建资源（图标等）
├── node-cache/                   # 本地npm缓存
├── tmux/                         # Tmux相关
├── package.json                  # 项目配置
└── README.md                     # 项目说明
```

---

## 🔑 核心模块详解

### 1. 主进程 (app/main.js)

**职责：** 应用生命周期、窗口管理、IPC处理、终端会话、文件操作

**关键功能：**

#### 1.1 终端会话管理
```javascript
// PTY优先，stdio回退策略
- node-pty: 完整PTY支持，真实终端环境
- stdio spawn: PTY不可用时的降级方案
- tmux集成: 本地和SSH远程tmux会话
```

**会话类型：**
- `pty`: 标准PTY终端
- `stdio`: 标准输入输出模式
- `tmux-local`: 本地tmux会话
- `tmux-ssh`: SSH远程tmux会话

#### 1.2 IPC通道白名单

```javascript
// 终端操作
term.spawn       // 创建终端会话
term.write       // 写入数据
term.resize      // 调整大小
term.kill        // 正常终止
term.forceKill   // 强制终止

// 命令执行
cmd.execute      // 执行命令
cmd.write        // 写入输入
cmd.kill         // 终止命令

// 文件系统
fs.list          // 列出文件
fs.rename        // 重命名
fs.delete        // 删除
fs.mkdir         // 创建目录
fs.createFile    // 创建文件
fs.copy          // 复制文件
fs.readFile      // 读取文件（用于/view）

// 标签页管理
tabs.list        // 列出所有标签页
tabs.create      // 创建新标签页
tabs.save        // 保存标签页状态
tabs.rename      // 重命名标签页
tabs.delete      // 删除标签页

// 传输管理
tx.enqueue       // 添加到传输队列
tx.list          // 列出传输任务
tx.control       // 控制传输（暂停/继续/取消）

// 设置和会话
settings.get/set // 获取/设置配置
session.load/save // 加载/保存会话

// 应用操作
app.getHomeDir   // 获取用户目录
app.openExternal // 打开外部链接
app.openDialog   // 打开文件对话框
```

#### 1.3 Shell自动探测

```javascript
Windows优先级:
1. 用户指定shell
2. COMSPEC环境变量
3. PowerShell (pwsh.exe / powershell.exe)
4. cmd.exe

Unix优先级:
1. 用户指定shell
2. SHELL环境变量
3. /bin/zsh
4. /bin/bash
5. /bin/sh
```

### 2. Tmux管理器 (app/tmux-manager.js)

**核心价值：** 提供持久化的终端会话，支持断线重连

**功能特性：**

#### 2.1 本地Tmux会话
```javascript
- 自动探测系统tmux
- 打包的tmux二进制备用（linux-x86_64, linux-arm64）
- 会话创建、附加、销毁
- SHA256校验，避免重复复制
```

#### 2.2 SSH Tmux会话
```javascript
- SSH连接管理（基于ssh2）
- 远程tmux自动上传和部署
- 通过SSH管道运行tmux命令
- 支持密码、密钥认证
```

**架构平台支持：**
```javascript
function normalizeArch(input) {
  if (arch === 'x64' || arch === 'amd64') return 'x86_64';
  if (arch === 'arm64' || arch === 'aarch64') return 'arm64';
  return arch;
}
```

### 3. 进程监控器 (app/process-monitor.js)

**监控指标：**
- **CPU使用率**: 通过`ps`/`wmic`采样
- **内存使用**: RSS（驻留集大小）
- **输出速率**: 5秒滑动窗口平均
- **运行时长**: 毫秒级计时

**告警阈值：**
```javascript
高CPU: > 90% 且运行超过60秒
高内存: > 500MB
高输出速率: > 1MB/s
长时间运行: 每分钟提醒（超过5分钟）
```

**事件类型：**
- `update`: 指标更新
- `high-cpu`: CPU过高
- `high-memory`: 内存过高
- `high-output-rate`: 输出速率过高
- `long-running`: 长时间运行

### 4. 输出流管理器 (app/output-streamer.js)

**功能：** 将所有终端输出记录到日志文件

```javascript
位置: ${userData}/command-outputs/
格式: <ptyId>_<timestamp>.log
自动清理: 保留最近50个文件
```

**日志结构：**
```
# Command Output Log
# PTY ID: <uuid>
# Started: <ISO timestamp>
# ========================================

<actual output>

# ========================================
# Ended: <ISO timestamp>
# Total Size: <formatted size>
```

### 5. 聊天式终端 (app/renderer/chat-terminal.mjs)

**核心概念：** 类似Jupyter Notebook的单元格模式

#### 5.1 单元格类型

**代码单元格：**
```javascript
- 命令输入和执行
- 输出区域（可折叠、复制、虚拟化）
- 执行时间和状态指示
- 重新运行功能
```

**Markdown单元格：**
```javascript
- 富文本笔记编辑
- 实时Markdown渲染
- 双击编辑模式
- Shift+Enter保存渲染
```

#### 5.2 命令完成检测

**智能哨兵系统：**
```javascript
非交互式命令:
  - OSC 133 诊断序列: ESC ]133;D;smrt:<id>;exit:%d BEL
  - 文本回退哨兵: __SMRT_DONE__<id>__%d__

交互式命令 (ssh, mysql, python等):
  - 提示符模式识别
  - 输出量阈值检测
  - 延迟完成（防止过早截断）
```

**提示符检测模式：**
```javascript
- bash/zsh: [user@host dir]$ / %
- Python: >>> / ...
- MySQL: mysql> / ->
- PostgreSQL: database=#
- SSH: [user@host]
- 通用: 行尾 $ # > :
```

#### 5.3 输出虚拟化

**性能优化：** 当输出超过阈值时启用虚拟化

```javascript
原理:
- 计算总高度 = lineCount × lineHeight
- 只渲染可见行 + overscan（上下各50行）
- transform: translateY 定位视口
- 滚动时动态更新渲染窗口

优势:
- 处理百万行输出不卡顿
- 内存占用最小化
- 平滑滚动体验
```

**复制优化：**
```javascript
- 自动移除行号
- 保留缩进和格式
- 多行选择支持
```

#### 5.4 语法高亮

**支持语言：**
- JavaScript/TypeScript
- Python
- C/C++/Java/Go/Rust/Swift
- Shell (Bash/Zsh)
- JSON/YAML/TOML
- HTML/CSS
- SQL
- Markdown

**高亮策略：**
```javascript
- 正则表达式Token匹配
- CSS类名语义化（.token-keyword, .token-string等）
- 文件扩展名自动检测
- 降级：纯文本展示
```

### 6. 命令建议系统 (chat-terminal-suggestions.mjs)

**数据来源：**
1. **本地历史**: localStorage持久化
2. **频率排序**: 使用次数加权
3. **模糊匹配**: 前缀和子串匹配

**触发方式：**
- `Tab`键打开建议
- 自动过滤输入内容
- `↑/↓`导航，`Enter`接受

**示例命令库：**
```javascript
- git (commit, push, pull, status, log...)
- npm (install, start, build, test...)
- docker (ps, run, stop, logs...)
- 系统命令 (ls, cd, mkdir, cat...)
```

### 7. 路径补全 (chat-terminal-path-completer.mjs)

**智能路径解析：**
```javascript
- 相对路径: ./file, ../dir
- 绝对路径: /usr/local/bin
- 用户目录: ~/Documents
- 当前目录: 自动列出文件
```

**补全策略：**
```javascript
1. 解析输入中的路径片段
2. 调用 fs.list 获取目录内容
3. 过滤匹配项
4. 显示文件/目录图标
5. Tab循环选择
```

### 8. 国际化系统 (app/renderer/i18n.mjs)

**支持语言：**
- `zh-CN`: 简体中文（默认）
- `en`: English

**特性：**
```javascript
- 运行时切换，无需重启
- localStorage持久化
- 回退机制（缺失翻译使用默认文本）
- 全局事件通知（i18n:change）
```

**使用示例：**
```javascript
i18n.t('tab.untitled', '未命名')
// 返回当前语言的翻译，或默认值"未命名"
```

### 9. 设置管理 (app/renderer/settings.mjs)

**配置项：**

#### 主题设置
```javascript
- light: 浅色主题
- dark: 深色主题
- system: 跟随系统
```

#### 字体设置
```javascript
命令区域:
  - 字体大小: 14-24px
  - 字体颜色: 自定义

输出区域:
  - 字体大小: 12-20px
  - 字体颜色: 自定义
```

**持久化：** localStorage + electron-store双层存储

---

## 🎯 核心功能实现

### 1. /view 命令预览

**支持格式：**

#### Markdown文件
```javascript
特性:
- 完整Markdown渲染
- 代码块语法高亮
- 表格、列表支持
- 大小限制: 2MB
```

#### 图片文件
```javascript
支持格式:
- PNG (.png)
- JPEG (.jpg, .jpeg)
- GIF (.gif)
- WebP (.webp)
- BMP (.bmp)
- SVG (.svg)

大小限制: 6MB
渲染方式: Base64 Data URI
```

**执行流程：**
```
1. 用户输入: /view README.md
2. 渲染器解析命令，提取路径
3. 推断文件类型（扩展名）
4. IPC调用: fs.readFile({path, cwd, maxBytes})
5. 主进程读取并限制大小
6. 返回内容（文本/base64）
7. 渲染器展示（Markdown渲染/图片<img>）
```

**限制：**
- 仅支持本地会话
- SSH/远程会话返回"不支持"提示

### 2. 标签页持久化

**存储格式：** `.smt` (SmartTerminal) JSON文件

```json
{
  "title": "项目开发",
  "favorite": true,
  "description": "Node.js项目开发环境",
  "customTitle": true,
  "deleted": false,
  "deletedAt": null,
  "state": {
    "messages": [
      "<div class='cell code'>...</div>",
      "<div class='cell markdown'>...</div>"
    ]
  },
  "createdAt": 1710000000000,
  "updatedAt": 1710123456789
}
```

**CRUD操作：**
```javascript
tabs.list()           // 列出所有标签页
tabs.create(data)     // 创建新标签页
tabs.save(data)       // 保存状态
tabs.rename(data)     // 重命名
tabs.delete({id})     // 软删除到回收站
```

**主页视图：**
- **收藏夹**: `favorite: true` 的标签页
- **全部对话**: 所有未删除的标签页
- **回收站**: `deleted: true` 的标签页

### 3. 命令执行模式

#### PTY模式（首选）
```javascript
优势:
- 完整的终端环境
- 信号支持（Ctrl+C = SIGINT）
- 颜色和格式保留
- 交互式程序完美支持

终止策略:
- Ctrl+C 发送SIGINT
- 等待500ms
- 失败则SIGKILL
```

#### Stdio模式（回退）
```javascript
场景:
- node-pty编译失败
- 权限受限环境
- 某些Windows配置

限制:
- 无PTY特性
- 颜色可能丢失
- Ctrl+C可能无效

终止策略:
- 直接tree-kill（SIGKILL）
- 跨平台进程树清理
```

### 4. 传输管理器（框架）

**功能：** SFTP上传/下载队列管理

```javascript
特性:
- 并发控制（默认3个任务）
- 断点续传
- 冲突处理（覆盖/跳过/重命名）
- 暂停/继续/取消
- 进度事件

状态:
- queued: 队列中
- running: 执行中
- paused: 已暂停
- completed: 已完成
- failed: 失败
- cancelled: 已取消
```

**IPC接口：**
```javascript
tx.enqueue({
  type: 'upload',    // 或 'download'
  local: '/path/to/local',
  remote: '/path/to/remote',
  connection: 'ssh-host-id'
})

tx.control({
  id: 'task-id',
  action: 'pause'    // 或 'resume', 'cancel'
})
```

**注意：** SSH连接管理UI未实现，需手动创建连接对象

---

## ⌨️ 键盘快捷键

### 全局快捷键
```
Ctrl/Cmd + N          新建标签页
Ctrl/Cmd + W          关闭当前标签页
Ctrl + Tab            下一个标签页
Ctrl + Shift + Tab    上一个标签页
Ctrl/Cmd + 1-9        跳转到指定序号标签页
F5                    刷新文件列表（文件区可见时）
```

### 终端交互
```
Shift + Enter         执行当前命令/渲染Markdown
Enter                 输入换行
Ctrl + C              中断当前命令
Esc                   清空输入/关闭弹窗
Tab                   打开命令建议/路径补全
↑ / ↓                 浏览建议列表
```

### 单元格操作（未聚焦输入时）
```
C                     切换到代码模式
M                     切换到Markdown模式
A                     在上方插入命令单元格
B                     在下方插入命令单元格
D D                   快速双击删除单元格
```

### 单元格编辑（选中单元格时）
```
M                     转换为Markdown单元格
C                     转换为代码单元格/进入编辑
Enter                 进入编辑模式
```

---

## 📊 数据存储

### 位置结构
```
${userData}/                      # 应用数据目录
├── tabs/                         # 标签页持久化
│   ├── <uuid>.smt               # 标签页JSON文件
│   └── ...
├── command-outputs/              # 命令输出日志
│   ├── <ptyId>_<timestamp>.log
│   └── ...
├── metrics/                      # 应用指标
│   └── app-metrics.csv
├── tmux-bundled/                 # 打包的tmux二进制
│   ├── linux-x86_64/
│   └── linux-arm64/
├── logs/                         # 应用日志
├── settings.json                 # 用户设置（electron-store）
└── session.json                  # 会话状态（electron-store）
```

### macOS路径示例
```
~/Library/Application Support/SmartTerminal/
```

### 浏览器存储（localStorage）
```javascript
sm_locale              # 界面语言 (zh-CN / en)
sm_theme               # 主题 (light / dark / system)
sm_font_command_size   # 命令区字体大小
sm_font_command_color  # 命令区字体颜色
sm_font_output_size    # 输出区字体大小
sm_font_output_color   # 输出区字体颜色
commandHistory         # 命令使用历史和频率
commandSuggestions     # 命令建议数据
```

---

## 🔐 安全机制

### 1. Electron安全最佳实践

```javascript
BrowserWindow配置:
{
  webPreferences: {
    contextIsolation: true,      // 上下文隔离
    sandbox: true,               // 沙箱模式
    nodeIntegration: false,      // 禁用Node.js
    enableRemoteModule: false,   // 禁用remote模块
    preload: path.join(__dirname, 'preload.js')
  }
}
```

### 2. Content Security Policy
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               style-src 'self' 'unsafe-inline'; 
               script-src 'self'; 
               img-src 'self' data: blob:;">
```

### 3. IPC通道验证

```javascript
// 预加载脚本中的白名单
contextBridge.exposeInMainWorld('sm', {
  term: { /* 仅暴露特定方法 */ },
  fs: { /* 仅暴露安全的文件操作 */ },
  // ...
});

// 主进程中的请求验证
ipcMain.handle('term.spawn', async (event, payload) => {
  // 验证payload结构
  // 限制参数范围
  // 返回标准格式 {ok, data?, error?}
});
```

### 4. 文件操作限制

```javascript
/view 命令限制:
- 文本文件: 2MB上限
- 图片文件: 6MB上限
- 路径验证: 防止目录遍历
- 仅限本地会话
```

---

## 🚀 构建和打包

### NPM脚本
```bash
npm start              # 启动开发模式
npm run pack           # 打包应用（--dir模式）
npm run dist           # 构建安装包
npm install --cache ./node-cache  # 使用本地缓存安装
```

### Electron Builder配置

```json
{
  "appId": "com.smartterminal.app",
  "productName": "SmartTerminal",
  "files": [
    "app/**/*",
    "design-system/**/*",
    "docs/ui-ux-modern/xterm-theme.json"
  ],
  "mac": {
    "category": "public.app-category.developer-tools",
    "icon": "build/icon.icns"
  },
  "win": {
    "target": ["nsis"],
    "icon": "build/icon.ico"
  },
  "linux": {
    "target": ["AppImage", "deb", "rpm"],
    "category": "Development",
    "icon": "build/icons"
  }
}
```

### 平台支持
- **macOS**: .dmg安装包
- **Windows**: NSIS安装程序
- **Linux**: AppImage, .deb, .rpm

---

## 🐛 已知问题和限制

### 1. SSH功能
```
状态: 基础架构已实现，UI未完成
影响: 无法通过界面创建SSH连接
计划: Roadmap功能
```

### 2. 文件管理器
```
状态: 仅有基础fs IPC，无完整UI
影响: 文件操作需手动命令
功能: fs.list/rename/delete/mkdir/copy可用
```

### 3. 自动更新
```
状态: 未实现
影响: 需手动下载新版本
```

### 4. PTY编译
```
问题: node-pty需要原生编译
回退: 自动降级到stdio模式
解决: npm install --cache ./node-cache
```

### 5. 性能
```
大输出: 虚拟化已优化，支持百万行
内存: 长期运行可能积累日志
建议: 定期清理command-outputs目录
```

---

## 🗺️ Roadmap（未来计划）

### 短期目标
1. **SSH连接管理UI**
   - 连接配置界面
   - Known Hosts管理
   - 密钥/密码认证

2. **完整文件管理器**
   - 侧边栏树形视图
   - 拖拽上传下载
   - CWD同步（OSC序列）

3. **命令面板全局快捷键**
   - Ctrl/Cmd+P触发
   - 快速动作执行

### 中期目标
4. **传输队列UI完善**
   - 与SSH连接打通
   - 可视化进度
   - 队列管理

5. **高级主题定制**
   - xterm配色方案
   - 字体配置
   - 布局偏好

6. **性能优化**
   - 日志自动轮转
   - 内存使用优化
   - 启动速度提升

### 长期目标
7. **自动更新**
   - electron-updater集成
   - 增量更新
   - 回滚机制

8. **端口转发**
   - 本地->远程
   - 远程->本地
   - UI管理

9. **SSH Agent转发**
   - 密钥链集成
   - 跳板机支持

10. **协作功能**
    - 会话分享
    - 多人协同
    - 云端同步

---

## 📚 开发指南

### 环境要求
```
Node.js: 18+
npm: 8+
操作系统: macOS / Windows / Linux
```

### 安装依赖
```bash
# 使用本地缓存（推荐）
npm install --cache ./node-cache

# 可选：安装SSH支持
npm install ssh2

# 重建原生模块
npm run postinstall
```

### 开发模式
```bash
npm start
# DevTools会在NODE_ENV=development时自动打开
```

### 调试技巧

#### 主进程调试
```bash
# 方法1: Chrome DevTools
electron --inspect=5858 .

# 方法2: VSCode launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Electron Main",
  "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
  "args": ["."],
  "outputCapture": "std"
}
```

#### 渲染进程调试
```javascript
// 在renderer中启用详细日志
window.setSmDebug(true);

// 查看命令完成哨兵和输出清理
```

#### IPC调试
```javascript
// 主进程
console.log('[IPC]', channel, payload);

// 渲染进程
const result = await window.sm.term.spawn({...});
console.log('spawn result:', result);
```

### 代码风格

```javascript
// 文件头注释
// Module Name - Brief description

// 函数注释（JSDoc风格）
/**
 * Function description
 * @param {string} param1 - Description
 * @returns {Promise<object>} Response object
 */

// 命名约定
const CONSTANTS = 'UPPER_SNAKE_CASE';
const variables = 'camelCase';
function functionName() { }
class ClassName { }

// 错误处理
try {
  // ...
} catch (err) {
  console.error('[Module] Error:', err?.message || err);
  return { ok: false, error: String(err?.message || err) };
}
```

---

## 🧪 测试

### 当前状态
```
单元测试: 未实现
集成测试: 未实现
E2E测试: 未实现
```

### 推荐测试框架
```javascript
单元测试: Jest
E2E测试: Spectron / Playwright for Electron
```

### 手动测试清单

#### 终端功能
- [ ] PTY模式命令执行
- [ ] Stdio模式降级
- [ ] 交互式命令（ssh, python等）
- [ ] Ctrl+C中断
- [ ] 多行命令
- [ ] 命令历史和重跑

#### UI功能
- [ ] 标签页创建/切换/关闭
- [ ] 主页收藏夹/全部/回收站
- [ ] 命令建议和路径补全
- [ ] /view预览Markdown和图片
- [ ] 语言切换（中/英）
- [ ] 主题切换（浅色/深色/系统）

#### 持久化
- [ ] 标签页自动保存
- [ ] 重启后状态恢复
- [ ] 设置持久化
- [ ] 命令历史保存

#### 性能
- [ ] 大量输出（10000+行）
- [ ] 虚拟化滚动
- [ ] 多标签页同时运行
- [ ] 长时间运行稳定性

---

## 🤝 贡献指南

### 提交Issue
```markdown
标题: [模块] 简短描述
内容:
- 问题描述
- 复现步骤
- 预期行为
- 实际行为
- 环境信息（OS, Node版本, Electron版本）
- 截图或日志
```

### Pull Request
```markdown
1. Fork项目
2. 创建功能分支: git checkout -b feature/amazing-feature
3. 提交更改: git commit -m 'Add amazing feature'
4. 推送分支: git push origin feature/amazing-feature
5. 创建Pull Request

PR模板:
- 功能描述
- 相关Issue
- 测试说明
- 截图（如适用）
```

### 代码审查要点
- 安全性：IPC通道验证、输入清理
- 性能：大数据处理、内存泄漏
- 兼容性：跨平台测试
- 可维护性：代码清晰、注释充分

---

## 📖 参考资料

### 官方文档
- [Electron Documentation](https://www.electronjs.org/docs)
- [xterm.js API](https://xtermjs.org/docs/)
- [node-pty](https://github.com/microsoft/node-pty)

### 设计参考
- 项目内: `docs/ui-ux-modern/`
- xterm主题: `docs/ui-ux-modern/xterm-theme.json`
- 设计令牌: `design-system/modern/`

### 相关项目
- VSCode Integrated Terminal
- Hyper Terminal
- Tabby (formerly Terminus)
- Warp Terminal

---

## 📄 许可证

MIT © Smarterminal contributors

---

## 📮 联系方式

- Issue Tracker: GitHub Issues
- Discussions: GitHub Discussions
- Email: （待补充）

---

## 🎉 致谢

感谢以下开源项目：
- Electron团队
- xterm.js社区
- node-pty维护者
- 所有贡献者

---

**文档版本：** 1.0.0  
**最后更新：** 2024年  
**文档作者：** AI代码分析助手

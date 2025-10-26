# Smarterminal

面向开发者的跨平台「智能终端工作台」，基于 Electron 构建。当前聚焦聊天式终端（Notebook Cells），支持多标签会话持久化、双语界面以及基础的进程监控与输出管理；传统 xterm 视图仍可随时切换。

## 核心亮点
- **统一命令工作台** —— 聊天式单元、AI 建议、快捷执行以及 tmux 挂靠的多标签终端融为一体。
- **上下文历史管理** —— 收藏 / 全部 / 回收站列表与一键重跑（含 Shift+Enter）让历史命令随取随用，焦点保持在原位置。
- **丰富回显与预览** —— 虚拟化 Out 区域、防遮挡设计、去行号复制以及 `/view` 指令的 Markdown / 图片内嵌预览。

## 已实现功能
- 聊天式终端（Notebook Cells）
  - Shift+Enter 执行、Enter 换行、Ctrl+C 中断
  - 每条输出支持折叠、复制（自动剥离行号）、重跑、计时器
  - 代码 / Markdown 双模式切换，Markdown 内联编辑（Shift+Enter 渲染）
  - 命令排队、交互式命令哨兵与提示符混合检测
- 标签页与首页
  - 会话持久化到 `tabs/*.smt`（标题、收藏、描述、消息状态）
  - 首页展示三张特色卡片与收藏 / 全部 / 回收站列表，支持重命名及 Markdown 描述
- 终端引擎
  - 优先使用 `node-pty`，失败时降级为 stdio `spawn`
  - 停止策略区分 PTY 与 stdio：先发送 Ctrl+C，必要时强制结束
- tmux 会话管理
  - 本地标签优先开启 tmux，缺失时自动回退
  - SSH 标签可上传内置二进制并创建远程 tmux 会话
- 监控与日志
  - 轻量进程监控（CPU/内存/输出速率/运行时长），告警事件可传至渲染端
  - 命令 / PTY 输出流式写入 `command-outputs/*.log`，并保留最近 N 个
- 国际化
  - 内置 `zh-CN` / `en`，渲染端即时切换
- 传输抽屉（脚手架）
  - 上传 / 下载队列，支持暂停 / 继续 / 取消与冲突策略（重命名 / 覆盖 / 跳过）
  - 主进程已对接 SFTP 基础操作，连接入口待补齐
- 命令面板（脚手架）
  - 模糊搜索 + 基础动作（关闭标签、清空终端等）
  - “打开 SSH 会话” 会尝试创建 tmux 加持的远程 Shell（需 `ssh2` 及 tmux 资源）
- `/view` 预览指令
  - `/view <文件>` 在 Out 区域预览 Markdown 或常见图片（当前仅限本地会话）
  - 对缺失、超限、类型不支持、远程会话等场景提供友好提示

## 未完成功能 / Roadmap
- SSH 连接管理 UI（已具备主进程基础逻辑，尚未开放给用户）
- 完整文件管理器与 CWD 同步（现阶段仅保留 `fs.*` IPC 与传输抽屉占位）
- 自动更新、凭据管控、端口转发等高级能力
- 命令面板全局快捷键、主题 / 字体等更多设置项

## 快速开始

### 环境要求
- Node.js **18+**（Electron 29 兼容）
- npm（Node 自带）

### 安装依赖
```bash
npm install --cache ./node-cache
```
项目默认使用本地缓存目录 `./node-cache`，避免权限问题并加快重复安装。

### 启动应用
```bash
npm start
```
执行上述命令后将启动 Electron 主进程（入口 `app/main.js`）并加载渲染端 `app/renderer/index.html`。

若下载 Electron 二进制失败，可重试：
```bash
npm_config_cache=./node-cache npm install
npx electron@29 .
```

### 可选模块：SSH / tmux
- `node-pty` 已默认安装，若编译失败会自动回退至 stdio 模式。
- 需要远程终端或传输功能时安装 `ssh2`（放在缓存目录即可）：
  ```bash
  npm install --cache ./node-cache ssh2
  ```
  安装后可在命令面板中使用 **Open SSH Session**。身份验证仍依赖 ssh-agent、私钥或密码。

#### 打包 tmux 二进制
本地 / 远程标签首选 tmux，可在仓库内提供：
```
app/resources/tmux/
├── linux-x86_64/
│   └── tmux
└── linux-arm64/
    └── tmux
```
运行时会复制到 `${userData}/tmux-bundled/…` 并赋予执行权限；远程服务器缺失 tmux 时也会自动上传到 `~/.smarterminal/bin/tmux`。

## 使用指南
- 在首页点击“开始新的对话”创建标签，双击标题可重命名。
- 输入命令按 Shift+Enter 执行，Enter 插入新行。
- 使用 Markdown 单元记录说明，同样 Shift+Enter 渲染。
- 每次执行生成独立单元，可折叠、复制或重跑；输出日志会自动落地。
- 历史命令卡片可直接点击执行按钮或 Shift+Enter 复用，焦点保持在原位置。
- 需要查看文件？输入 `/view README.md` 预览 Markdown 或图片。
- 远程 Shell？打开命令面板（点击工具栏按钮或自定义快捷键）选择 **Open SSH Session**。

### 快捷键速查
- Shift+Enter —— 执行当前命令 / 渲染 Markdown
- Enter —— 在作曲区换行
- Ctrl+C —— 中断运行命令
- Esc —— 清空输入或关闭弹窗
- Ctrl/Cmd + N —— 新建标签；Ctrl/Cmd + W —— 关闭标签
- Ctrl+Tab / Ctrl+Shift+Tab —— 标签切换；Ctrl/Cmd + 1..9 —— 跳转到指定标签
- F5 —— 刷新文件列表（文件区可见时）
- 作曲区外按 `C` / `M` —— 切换命令 / Markdown 模式
- 单元格选中时 `A` / `B` —— 在上方 / 下方插入命令单元
- 单元格选中时双击 `D` —— 删除该单元
- 作曲区 `Tab` —— 打开命令建议；`↑/↓` 选择；`Enter` 确认

## npm 脚本

| 脚本 | 说明 |
| ---- | ---- |
| `npm start` | 启动 Electron（仅在 `NODE_ENV=development` 时自动打开 DevTools）。 |
| `npm run pack` | 使用 Electron Builder 生成未打包目录（`--dir`）。 |
| `npm run dist` | 生成平台安装包 / 发行构件。 |

## 目录结构速览
- `app/main.js` —— 主进程：窗口 / IPC / 终端生命周期 / 监控 / 日志 / 会话存储 / tmux 管理
- `app/preload.js` —— 安全桥接层，暴露 `term.*`、`cmd.*`、`fs.*`、`tabs.*`、`tx.*`、`settings.*`、`session.*`
- `app/renderer/` —— 聊天式终端、首页、i18n、传输抽屉等前端模块
- `design-system/modern/` —— 设计令牌与主题样式
- `docs/` —— PRD / 技术文档 / UI Mockups
- `node-cache/` —— npm 缓存目录，可随时删除

## 数据存储位置
- 会话：`${userData}/tabs/*.smt`
- 输出日志：`${userData}/command-outputs/*.log`
> macOS 默认 `${userData}` 为 `~/Library/Application Support/SmartTerminal/`。

## 架构说明
- 渲染进程启用 `contextIsolation`、`sandbox`，且 `nodeIntegration=false`；IPC 通过白名单通道沟通。
- PTY 优先，stderr/stdout 自动归一；fallback stdio 时提供 `term.forceKill`。
- `electron-store` 用于 `settings` / `session`，主题等 UI 偏好保存在 `localStorage`。

## 故障排查
- Electron 下载失败：重复执行安装命令或使用 `npx electron@29 .`
- PTY 编译失败：应用会自动回退到 stdio，仍可运行
- 输出异常：可在 DevTools 中启用 `window.setSmDebug(true)` 观察哨兵 / 输出流

## 未来计划
- SSH：连接流程、主机指纹、凭据管理、端口与 Agent 转发
- 文件区：完整列表、右键菜单、与终端同步的 CWD 展示
- 传输：端到端上传 / 下载入口、进度可视化、可选哈希校验
- 设置：主题 / 字体 / 滚动缓冲区 / 默认 Shell 等扩展选项
- 构建：自动更新、签名、崩溃上报、日志打包

## 许可协议
MIT © Smarterminal Contributors

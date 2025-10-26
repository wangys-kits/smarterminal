# Smarterminal 实装版 PRD（当前代码对齐）

说明：此文已根据当前代码库（app/main.js 与 app/renderer/*）回溯整理，标注了“已实现/未实现”。原始 PRD 的部分目标暂归入 Roadmap。

## 产品定位（当前）
- 面向开发者的跨平台“智能终端工作台”
- 以“聊天式终端（Notebook Cells）”为核心体验；支持 Markdown/命令混排、逐条执行与重跑
- 中/英双语界面（即时切换）

## 范围与非目标（基于现状）
- 已实现：
  - 终端：`node-pty` 优先；失败时降级为 stdio `spawn`
  - 聊天式终端：代码/Markdown 双模式；Shift+Enter 执行；每条输出可折叠/复制/计时；命令队列
  - 历史与主页：会话持久化为 `.smt` 文件；收藏/全部/回收站；标题重命名与 Markdown 说明；历史卡片执行按钮与主输入一致，Shift+Enter 复用时保持焦点不跳转
  - 交互式命令支持：基于“完成哨兵 + 提示符识别”的可靠收敛；Ctrl+C/强杀区分 PTY 和 stdio
  - 输出体验：Out 区域虚拟化渲染防遮挡；复制时移除行号；`/view` 指令在本地会话内预览 Markdown 与常见图片格式
  - i18n：`zh-CN` / `en` 即时切换
  - 基础监控：CPU/内存/输出速率/运行时长，超阈值检测（仅 `high-cpu`/`high-memory` 事件转发；`long-running`/`high-output-rate` 暂不转发；UI 呈现未启用）
  - 输出日志：每个命令/PTY 流式落文件（app data/`command-outputs/*.log`）
- 未实现（Roadmap）：
  - SSH 连接管理与终端会话、KnownHosts、凭据存储
  - 完整文件管理器与 CWD 同步（目前仅有 fs 基础 IPC 与传输抽屉 UI）
  - 上传/下载的端到端 UI 与可视化（现有 `tx.*` 通道与 SFTP 传输骨架）
  - 自动更新、端口转发、SSH Agent 转发等进阶能力

## 平台与发布（当前）
- 平台：macOS / Windows / Linux（开发运行与本地打包）
- 自动更新/签名：未接入（保留 Electron Builder 配置）

## 架构选型（实际代码）
- Electron（主进程 + 预加载 + 渲染进程，强隔离）：`contextIsolation: true`，`sandbox: true`，严格 CSP
- 渲染技术栈：原生 JS 模块 + xterm 脚本引入；无 React/TS 依赖
- 终端：`node-pty` + xterm；失败时回退为 stdio 管道交互
- 传输/SFTP：存在 `ssh2` 软依赖与传输管理器骨架，尚未开放连接管理 UI
- 存储：`electron-store` 两份：`settings`、`session`；会话以 `.smt` 文件保存在 `AppData/tabs/`

## 界面布局（当前）
- 顶部：标签栏（新建/切换/关闭，重命名）
- 主区：聊天式终端（左） + 传统 xterm 容器（占位，后续替换）；可滚动，底部输入区
- 主页：顶部展示三张核心特色卡片（统一命令工作台 / 上下文历史管理 / 丰富回显与预览）；收藏/全部/回收站列表支持预览/收藏/恢复/删除
 - 独立页面：
   - 全部对话：分页/滚动列表，支持恢复/删除/收藏
   - 回收站：支持恢复/清空回收站（二次确认）

## 终端能力（当前）
- Shell 解析：Windows 优先 PowerShell/cmd；Unix 优先 bash/zsh/sh（自动探测）
- 输出渲染：Out 采用虚拟化视窗，补齐顶部/底部间距避免计时条遮挡；复制文本自动剥离行号
- `/view` 预览：支持 Markdown（首期）与常见图片（png/jpg/gif/webp/bmp/svg）在 Out 中内嵌预览；暂限本地会话，远程给出提示
- 执行模型：
  - PTY：原生交互，Ctrl+C 中断
  - stdio：强制 `-i` 交互参数，回车/换行转换，必要时使用 `term.forceKill` 强杀
- 命令完成：在命令后自动注入“完成哨兵”（OSC 133 + 文本哨兵），配合提示符识别可靠收敛
- 交互命令：`ssh`/`telnet`/`mysql`/`psql`/`python` 等检测，见到提示符与足量输出即可完成并恢复输入
- 单元格：折叠/复制/重跑/计时；Markdown 双击编辑
- 监控与告警：高 CPU/高内存/长时运行/高输出速率等提示（策略在代码内）
- 命令建议与路径补全：基于本地使用频率（`localStorage`）与目录上下文的下拉建议；支持路径补全（通过 `fs.list` 查询）；`Tab` 触发

## 键盘交互（当前）
- Shift+Enter：执行（命令或 Markdown 渲染）
- Enter：换行
- Ctrl+C：中断当前命令（优先 PTY 信号，必要时强杀）
- Esc：清空输入或关闭弹窗
- 方向键/Enter：在命令面板中导航与执行（面板存在但暂未绑定全局快捷键）


补充（聊天式终端快捷键）：
- 作曲区未聚焦：`C` 切换命令模式；`M` 切换 Markdown 模式
- 选中单元格：`A` 上方插入命令；`B` 下方插入命令
- 选中单元格：`M` 转 Markdown；`C` 转命令/进入编辑
- 选中单元格：快速双击 `D` 删除该单元格
- 作曲区：`Tab` 打开建议；`↑/↓` 浏览；`Enter` 采纳

全局（标签页与文件区）：
- Ctrl/Cmd+N 新建标签；Ctrl/Cmd+W 关闭标签
- Ctrl+Tab / Ctrl+Shift+Tab 切换标签；Ctrl/Cmd+1..9 跳转到指定序号标签
- F5 刷新文件列表（文件区可见时）
## SSH 与主机管理（状态）
- 连接管理 UI：未实现
- 传输：存在 `tx.*` IPC、SFTP 断点续传/冲突策略与抽屉 UI；尚待与连接打通

## 文件管理与路径同步（状态）
- IPC：提供本地 `fs.rename/delete/mkdir/createFile`；无完整文件列表 UI
- CWD 同步：预留（未实现 OSC 解析到 UI 切换）
 - 辅助：提供 `fs.copy` 以支持本地文件复制（用于传输/占位能力），UI 未完全打通

## 上传/下载与断点续传（当前）
- 传输管理器：队列 + 并发（默认 3）+ 暂停/继续/取消 + 进度事件
- 下载/上传：支持断点续传与冲突处理（覆盖/跳过/重命名）
- UI：提供“传输抽屉”和冲突对话框；触发入口与远程连接未接通

## 国际化与主题（当前）
- 语言：内置 `zh-CN` / `en`，渲染端即时切换；`localStorage` 持久化
- 主题：亮/暗/跟随系统；通过 `data-theme` 应用设计令牌并即时切换（持久化到 localStorage）

## 标签、会话与布局（当前）
- `.smt` 文件：`{ title, favorite, description, customTitle, deleted, deletedAt, state(messages[]), createdAt, updatedAt }`
- 主页：收藏/全部/回收站；软删除到回收站、可清空
- 分割比例：设置中持久化（默认 0.6；渲染端当前使用 0.5 显示）

## 设置项（当前）
- 语言/主题：渲染端即时切换
  - 语言：`zh-CN` / `en`，持久化到 `localStorage`，全局刷新 UI 文案
  - 主题：`light` / `dark` / `system`，通过 `data-theme` 应用设计令牌，持久化到 `localStorage`
- 字体：命令区/输出区分别可配置字号与颜色（保存在 `localStorage`，即时生效）
- 设置/会话存储：主进程使用 `electron-store`；渲染端偏好（语言/主题/字体）使用 `localStorage`

## 安全与隐私（当前）
- Electron 安全基线：禁用 remote、隔离上下文、严格 CSP
- IPC 白名单：`term.* / cmd.* / fs.* / tabs.* / tx.* / settings.* / session.* / app.open*`
- 输出日志：写入本地文件；提供数量保留的旧文件清理

## 验收标准（以当前实现为准）
- 终端：Windows/macOS/Linux 本地 Shell 正常运行；在 PTY 失败时 stdio 回退可用；Ctrl+C/强杀行为符合预期
- 聊天式终端：代码/Markdown 双模式可编辑；命令队列按序执行；交互式命令可进入输入态；单元格折叠/复制/重跑可用
- 会话：新建/重命名/收藏/删除/回收站；主页列表与预览渲染；`.smt` 文件可持久化与恢复
- i18n：中英文即时切换；关键 UI 文案随语言变化
- 监控与告警：主进程可检测并转发告警事件；UI 呈现暂未启用（不作强校验）
- 输出日志：每次执行有日志落地，关闭时写入结束标记

## Roadmap（与原始 PRD 衔接）
- SSH：连接管理、KnownHosts、凭据管理、端口 & Agent 转发
- 文件区：完整列表/排序/右键菜单、CWD 同步（OSC 7/133）、与终端联动
- 传输：端到端上传/下载入口与进度可视化，SHA-256 校验可选
- 设置：主题/字体/滚动缓冲区/默认 Shell 等
- 构建：自动更新与签名、崩溃收集、日志打包

## 变更摘要（对齐当前实现）
- 引入聊天式终端与 Cells，替代原“文件区优先”的界面重心
- 命令完成改为“哨兵 + 提示符”混合策略，避免固定超时
- 区分 PTY/stdio 的停止策略，stdio 新增 `term.forceKill`
- 加入输出日志与轻量进程监控

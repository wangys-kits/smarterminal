项目：SmartTerminal（正式名）
目标：极简、科技感、体现“智能 + 终端”。

交付内容
- design/logo/mark.svg      主标志（线框，渐变描边），适合浅色背景
- design/logo/mark-dark.svg 深色填充瓷砖版，适合小尺寸/深色主题
- design/logo/mark-mono.svg 单色版，便于印刷/图标专用
- design/logo/symbol.svg    仅符号（透明底），用于自适应/叠加
- design/logo/tile-dark.svg 深色方形底（自适应暗背景）
- design/logo/tile-light.svg 浅色方形底（自适应亮背景）
- design/logo/lockup-horizontal.svg 横向锁定（符号+字标 SmartTerminal）
- design/logo/wordmark.svg  字标（SmartTerminal）

- design/logo/export.sh     一键导出脚本（iOS/Android/macOS/Windows/Web/社交）
- design/logo/exports/      已导出资产（首次已生成）

设计概念（从国际一线设计视角）
- 语义最小集：以 “>_” 的提示符为原型（终端核心语义），用一笔“>”与一条“_”构成智能提示的具象符号。
- 几何秩序：1024网格、圆角外框呼应“窗口”，线端圆角保证像素对齐与缩放表现。
- 科技气质：电光青-蓝梯度（#00E5FF→#0077FF）表达计算与流动，避免廉价霓虹感。
- 音量控制：默认留白、轮廓化；在小尺寸用深色瓷砖提升可读性。

颜色建议
- 主色：Electric Cyan #00E5FF
- 次色：Deep Azure   #0077FF
- 背景：Near Black    #0A0B0D（暗）/  White #FFFFFF（亮）
- 单色：#00C2FF 或 纯黑/纯白（按场景）

使用建议
- 最小尺寸：16px（建议使用 mark-dark 或 mono），24px+ 使用 mark.svg
- 安全留白：以外框圆角半径为单位，四周至少 0.5×rx
- 不要：添加投影/描边/斜切；改变“>_”的比例；拉伸变形；叠加复杂纹理。

下一步
- 如需将字标转曲（避免字体依赖），请确认目标字体（当前使用系统无衬线栈）。
- Android 自适应图标：可根据主题动态切换 tile-dark / tile-light 背景色。
- macOS .icns：若需 .icns 文件，可在本机运行 `iconutil -c icns exports/macos/SmartTerminal.iconset`（部分环境可能需 Xcode 工具支持）。

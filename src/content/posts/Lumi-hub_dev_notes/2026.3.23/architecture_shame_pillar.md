---
title: "架构重构耻辱柱：为什么我们彻底抛弃了 C++ Launcher"
published: 2026-03-24
description: "从彻底剥离 C++ Launcher 转向纯 Flutter 单一进程架构的惨痛教训。"
image: "api"
tags: [Lumi-hub, 开发笔记, 架构重构]
category: 开发笔记
draft: false
pinned: false
---

## ❌ 案发现场 (我们最初是怎么搞砸的)

最开始，我们在规划桌面端应用时陷入了一个思维定式：“Flutter 无法很好地原生接管系统托盘和后台守护”。
因此，我们生硬地塞入了一个双进程/多语言架构：
1. **C++ Launcher (`LumiLauncher.exe`)**: 作为“守护进程”，负责接管 Win32 系统托盘，使用 Mutex 把控单例，充当启动 Python 进程（AstrBot）的中间人。
2. **Flutter 客户端**: 仅负责主要的 UI 渲染。

**糟糕的通信机制**：为了让双进程“感知”对方的存在，我们在 `bootstrap_service.dart` 中写出了通过 `Process.start` 互相拉起，并且依赖读写**环境变量**（如 `LUMI_LAUNCHER_PID` 和 `ASTRBOT_PID`）来确认对方死活的“祖传屎山”级逻辑。

## 🕳️ 踩过的坑 (详细罪状，钉在耻辱柱上)

### 1. 生命周期严重脱节 (Lifecycle Desync Nightmare)
- **幽灵托盘现象**: Flutter UI 关闭退出了，但由于 C++ 端没有收到正确的断开信号，它的托盘图标死活不消失，驻留在状态栏。
- **互相拉扯死锁**: 当用户从 C++ 托盘右键点击“显示窗口”时，C++ 进程要去尝试执行 Flutter 打包的 exe。如果环境路径稍微有一点偏差，就会直接无响应或报错。我们在开发期甚至遇到了 `E:\Lumi-Hub\cpp_launcher\build\LumiLauncher.exe明明在这啊为什么会没找到呢` 这类极其低级的路径转义 bug。

### 2. 开发/维护成本飙升 (Over-Engineering)
- 为了这一个极其简单的功能，我们需要额外配置并维护 `CMakeLists.txt`。
- 本地开发需要绑定庞大的 Visual Studio 2026 MSVC 编译工具链（`vcvars64.bat`）。
- 每次调试需要清理 build、重新 cmake、编译 exe，不仅拖慢了迭代速度，更违背了 Flutter "Hot Reload" 带来的开发体验。

### 3. 进程僵尸化与系统锁 (Zombie Processes)
- 取消 C++ Launcher 的最后一步时，由于多进程架构导致进程没关干净，直接引发了文件系统的 `IOException`（进程占用）。
- 为了删除 `cpp_launcher` 这个目录，我们不得不动用 Windows PowerShell 的终极清理命令去痛下杀手：
  `Get-Process | Where-Object {$_.Path -like "*cpp_launcher*"} | Stop-Process -Force`

## 💡 悬崖勒马：现在的纯 Flutter 架构

**“就不应该用 cpp 写 launch。”** —— 这是我们在调试地狱中做出的最正确决定。

我们认清了现实，删除了整个 `cpp_launcher` 目录（骨灰都扬了），全面拥抱 Flutter 生态，构建了**单进程/单一主节点 (Single Master Process)** 架构：

1. **原生的系统托盘接入**: 引入 `tray_manager` 插件，在 `main.dart` 中使用纯 Dart 代码搞定托盘图标注册、自定义右键菜单（“显示窗口”、“完全退出”）和点击唤起。
2. **桌面窗口无缝管理**: 配合 `window_manager`，将应用最小化由原来繁琐的跨进程唤起改为了简单的 `windowManager.hide()` 与 `windowManager.show()`。
3. **收归子进程控制权**: 所有的 Python (AstrBot) 进程全权交由 `bootstrap_service.dart` 的 `Process.start` 拉起，应用关闭时通过纯 Dart 逻辑优雅地 Kill 掉子进程，完全杜绝了中间商赚差价。
4. **趁热打铁的 UI 现代化**: 借着逻辑翻新的机会，我们将原本简陋原始的 `Row` 设置面板，重构成了现代化的 iOS/macOS 风格的卡片式 `ListTile`，极大提升了用户层面的观感。

## 🎯 总结箴言

1. **“能用主框架原生或成熟插件生态解决的，绝不跨语言乱造轮子。”**
2. **“如无必要，勿增实体。”** 强行把一个系统拆分为多进程，就要为其付出代价（IPC难题、竞态条件、僵尸进程、文件锁）。
3. 桌面端开发，保持单主控节点能省去 99% 的生命周期同步烦恼。

*RIP, `cpp_launcher`。我们不会想念你的。*
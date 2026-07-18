---
title: "第十四章 平台集成：窗口管理、系统托盘与进程控制"
published: 2026-03-28
pinned: false
description: "跨越 Dart 与 OS 的边界。深入实战 window_manager 与 tray_manager，掌握桌面应用的窗口控制、系统托盘及底层进程生命周期管理。"
tags: [Flutter, 桌面开发, 进程管理, 平台集成]
category: 学习笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 第十四章 平台集成：窗口管理、系统托盘与进程控制

> 目标：掌握 Dart/Flutter 与操作系统平台的交互。Lumi-Hub 是一个桌面应用，大量使用了窗口管理、系统托盘、进程启动/终止、文件 I/O、环境变量等平台能力。本章通过 Lumi-Hub 的完整启动→运行→退出流程，讲透 Dart 的 `dart:io` 库和 Flutter 桌面插件的用法。

---

## 14.1 🔑 `dart:io` —— Dart 的平台交互库

`dart:io` 提供了文件系统、进程、网络等操作系统级 API：

```dart
import 'dart:io';

// 平台检测
Platform.isWindows    // 是否 Windows
Platform.isMacOS      // 是否 macOS
Platform.isLinux      // 是否 Linux
Platform.isAndroid    // 是否 Android
Platform.isIOS        // 是否 iOS

// 环境变量
Platform.environment['PATH']          // 读取 PATH
Platform.environment['LOCALAPPDATA']  // Windows AppData 路径

// 路径分隔符
Platform.pathSeparator  // Windows: '\\', macOS/Linux: '/'
```

> 💡 C++ 对比：
> ```cpp
> #ifdef _WIN32     → Platform.isWindows
> getenv("PATH")    → Platform.environment['PATH']
> ```
> Dart 的 `Platform` 类比 C++ 的预处理器宏和 `getenv` 更统一也更安全（空安全）。

### `kIsWeb` —— Web 平台检测

```dart
import 'package:flutter/foundation.dart';

if (!kIsWeb && Platform.isWindows) {
  // 桌面平台逻辑
}
```

> ⚠️ **必须先检查 `kIsWeb`**——因为在 Web 平台上 `Platform.isWindows` 等属性会直接报错。  
> `kIsWeb` 是编译期常量，不需要 `dart:io`。

---

## 14.2 🔑 窗口管理——window_manager

Lumi-Hub 使用 `window_manager` 插件控制桌面窗口：

### 初始化窗口

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  //                    ^^^^^^^^^^^^^^^^^^
  // Flutter 插件需要在 runApp 前初始化绑定

  if (!kIsWeb && Platform.isWindows) {
    await windowManager.ensureInitialized();

    // 获取屏幕尺寸，按黄金比例缩放
    Display primaryDisplay = await screenRetriever.getPrimaryDisplay();
    Size screenSize = primaryDisplay.size;
    Size initialSize = Size(
      screenSize.width * 0.618,     // ← 黄金比例 φ ≈ 0.618
      screenSize.height * 0.618,
    );

    // 配置窗口选项
    WindowOptions windowOptions = WindowOptions(
      size: initialSize,
      center: true,                 // ← 居中显示
      title: 'Lumi Hub',
    );

    // 等待窗口就绪后显示
    windowManager.waitUntilReadyToShow(windowOptions, () async {
      await windowManager.setPreventClose(true);   // ← 拦截关闭事件
      await windowManager.show();
      await windowManager.focus();
    });
  }

  runApp(/* ... */);
}
```

> 💡 **`setPreventClose(true)`** 的关键作用：  
> 拦截窗口关闭事件——用户点 ❌ 时不会直接关闭应用，  
> 而是触发 `onWindowClose` 回调，让我们决定是最小化还是退出。

### WindowListener —— 监听窗口事件

```dart
class _LumiAppState extends State<LumiApp> with WindowListener, TrayListener {
  //                                              ^^^^^^^^^^^^^^
  //                              Mixin！（第 4 章学的 with 语法）

  @override
  void initState() {
    super.initState();
    if (!kIsWeb && Platform.isWindows) {
      windowManager.addListener(this);     // ← 注册窗口事件监听
      trayManager.addListener(this);       // ← 注册托盘事件监听
    }
  }

  @override
  void dispose() {
    if (!kIsWeb && Platform.isWindows) {
      trayManager.removeListener(this);    // ← 移除托盘监听
      windowManager.removeListener(this);  // ← 移除窗口监听
    }
    super.dispose();
  }
}
```

### 🔗 onWindowClose —— 关闭拦截

```dart
@override
Future<void> onWindowClose() async {
  if (_isClosing) return;                  // ← 防止重复触发

  final settings = context.read<AppSettings>();
  final bootstrap = context.read<BootstrapService>();

  // 1. 读取用户的关闭策略
  WindowCloseAction closeAction = settings.windowCloseAction;

  // 2. 如果设置为"每次都问"，弹出选择对话框
  if (closeAction == WindowCloseAction.ask) {
    closeAction = await _confirmCloseAction(settings);
    if (!mounted) return;
  }

  // 3. 执行对应操作
  if (closeAction == WindowCloseAction.minimize) {
    await windowManager.hide();            // ← 最小化到托盘
    return;
  }

  // 4. 真正退出
  _isClosing = true;
  trayManager.destroy();                   // ← 销毁托盘图标
  await bootstrap.handleAppExit(           // ← 清理子进程
    closeAstrBotOnExit: settings.closeAstrBotOnExit,
  );
  await windowManager.destroy();           // ← 销毁窗口
}
```

> 💡 **退出流程**：关闭拦截 → 询问用户 → 清理子进程 → 销毁窗口  
> 每一步都是异步的，体现了 `async/await` 在平台交互中的价值。

---

## 14.3 🔑 系统托盘——tray_manager

### 初始化托盘

```dart
Future<void> _initTray() async {
  if (!Platform.isWindows) return;

  await trayManager.setIcon(
    'windows/runner/resources/app_icon.ico',
  );
  await trayManager.setToolTip('Lumi Hub');
  await _updateTrayMenu();
}

Future<void> _updateTrayMenu() async {
  final Menu menu = Menu(
    items: [
      MenuItem(key: 'show_window', label: '显示窗口'),
      MenuItem(key: 'exit_app', label: '完全退出'),
    ],
  );
  await trayManager.setContextMenu(menu);
}
```

### TrayListener —— 托盘事件

```dart
// 点击托盘图标
@override
void onTrayIconMouseDown() {
  windowManager.show();
  windowManager.focus();
}

// 点击右键菜单项
@override
void onTrayMenuItemClick(MenuItem menuItem) async {
  if (menuItem.key == 'show_window') {
    await windowManager.show();
    await windowManager.focus();
  } else if (menuItem.key == 'exit_app') {
    if (_isClosing) return;
    final settings = context.read<AppSettings>();
    final bootstrap = context.read<BootstrapService>();
    _isClosing = true;
    trayManager.destroy();
    await bootstrap.handleAppExit(
      closeAstrBotOnExit: settings.closeAstrBotOnExit,
    );
    await windowManager.destroy();
  }
}
```

### 完整的窗口/托盘交互流程

```
用户点击 ❌ 关闭按钮
     ↓
onWindowClose()
     ↓
windowCloseAction == ask?
     ├── yes → 弹出选择对话框 ─→ 用户选择
     └── no  → 使用已保存的选择
                    ↓
        ┌─── minimize ────┐        ┌──── exit ─────┐
        │ windowManager   │        │ _isClosing    │
        │   .hide()       │        │ trayManager   │
        │ (最小化到托盘)    │        │   .destroy()  │
        └─────────────────┘        │ bootstrap     │
                                   │   .handleExit │
用户点击托盘图标                     │ windowManager │
     ↓                             │   .destroy()  │
onTrayIconMouseDown()              └───────────────┘
     ↓
windowManager.show() + .focus()
(窗口重新出现)
```

---

## 14.4 🔑 进程管理——Process

Dart 的 `Process` 类提供了启动和管理操作系统进程的能力。

### Process.run —— 执行并等待结果

```dart
// 同步等待进程完成（适合短命令）
Future<bool> _checkPythonAvailable() async {
  try {
    final result = await Process.run('python', ['--version']);
    //                   ^^^^^^^^^^^
    //    执行 `python --version`，等待完成

    if (result.exitCode == 0) {
      final version = result.stdout.toString().trim();
      //              ^^^^^^^^^^^^
      //    标准输出（stdout）
      _log('Python 版本: $version');
      return true;
    }

    _log('退出码: ${result.exitCode}', level: LogLevel.error);
    final err = result.stderr.toString().trim();
    //          ^^^^^^^^^^^^
    //    标准错误（stderr）
    if (err.isNotEmpty) {
      _log('错误输出: $err', level: LogLevel.error);
    }
    return false;
  } catch (_) {
    _log('无法执行 python --version', level: LogLevel.error);
    return false;
  }
}
```

> 💡 C++ 对比：
> ```cpp
> // C++ 没有标准的进程执行 API，通常用：
> system("python --version");           // 最简单但不安全
> popen("python --version", "r");       // 可以读输出
> CreateProcess(/* Windows API */);     // 最完整但最复杂
> ```
> Dart 的 `Process.run` 比 C++ 的任何方式都简洁——一个 `await` 拿到全部结果。

### Process.start —— 启动后台进程

```dart
Future<bool> _startAstrBot() async {
  // 1. 检查文件是否存在
  final mainFile = File('$astrbotRoot\\main.py');
  if (!await mainFile.exists()) {
    _log('未找到启动文件: ${mainFile.path}', level: LogLevel.error);
    return false;
  }

  try {
    // 2. 启动进程
    final process = await Process.start(
      'python',
      ['main.py'],
      workingDirectory: astrbotRoot,
      mode: ProcessStartMode.detached,    // ← 分离模式！
      //    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      //    进程和 Dart 完全脱钩，独立运行
      //    即使 Dart 退出，子进程也继续运行
    );

    _startedAstrBotByHub = true;
    _astrBotPid = process.pid;            // ← 记住 PID，退出时用
    _log('AstrBot PID: ${process.pid}');
    return true;
  } catch (e) {
    _log('启动异常: $e', level: LogLevel.error);
    return false;
  }
}
```

### ProcessStartMode 选项

| 模式 | 效果 | 适合场景 |
|------|------|---------|
| `normal` | 可以读 stdin/stdout/stderr | 需要和进程交互 |
| `inheritStdio` | 共享父进程的标准流 | 调试子进程 |
| `detached` | 完全独立运行 | 后台服务（Lumi-Hub 使用）|
| `detachedWithStdio` | 独立运行但保留标准流 | 独立运行又要读输出 |

### 终止进程——taskkill

```dart
Future<void> _killAstrBotByPid(int pid) async {
  try {
    final result = await Process.run('taskkill', [
      '/PID', pid.toString(),
      '/T',                          // ← 终止进程树（包括子进程）
      '/F',                          // ← 强制终止
    ]);

    if (result.exitCode == 0) {
      _log('已关闭 AstrBot（PID: $pid）。');
    } else {
      _log('关闭失败: ${result.stderr.toString().trim()}',
           level: LogLevel.error);
    }
  } catch (e) {
    _log('关闭异常: $e', level: LogLevel.error);
  }
}
```

> 💡 这是 Windows 特有的——Linux/macOS 上用 `Process.killPid(pid)` API。  
> Lumi-Hub 目前只支持 Windows 桌面，所以直接调用 `taskkill`。

### 打开文件资源管理器

```dart
Future<void> openLogDirectory() async {
  if (!_supportsLocalHostLifecycle) {
    _log('当前平台不支持一键打开日志目录。', level: LogLevel.warning);
    return;
  }

  try {
    await Process.start('explorer', [_logDirectoryPath!]);
    //                   ^^^^^^^^
    //    Windows 资源管理器
  } catch (e) {
    _log('打开日志目录失败: $e', level: LogLevel.error);
  }
}
```

---

## 14.5 🔑 文件 I/O——File 与 Directory

### File 操作

```dart
// 检查文件是否存在
final mainFile = File('$astrbotRoot\\main.py');
if (!await mainFile.exists()) { /* ... */ }

// 写入文件（追加模式）
final file = File(_logFilePath!);
await file.writeAsString(
  '$line\n',
  mode: FileMode.append,       // ← 追加，不覆盖
  flush: true,                 // ← 立即刷盘
);

// 创建文件
if (!await file.exists()) {
  await file.create(recursive: true);   // ← recursive: 连同父目录一起创建
}
```

### Directory 操作

```dart
// 创建目录（连同父级）
final dir = Directory('$baseDir${sep}LumiHub${sep}logs');
await dir.create(recursive: true);

// 临时目录
final tempDir = Directory.systemTemp;
```

### 🔗 Lumi-Hub 的完整日志系统

```dart
Future<void> _ensureLogFileReady() async {
  // 1. 确定基础路径
  String? baseDir = Platform.environment['LOCALAPPDATA'];
  if (baseDir == null || baseDir.isEmpty) {
    baseDir = Directory.systemTemp.path;   // ← 回退到临时目录
  }

  // 2. 创建日志目录
  final sep = Platform.pathSeparator;      // ← 跨平台路径分隔符
  final dir = Directory('$baseDir${sep}LumiHub${sep}logs');
  await dir.create(recursive: true);
  _logDirectoryPath = dir.path;

  // 3. 生成日志文件名（按日期）
  final now = DateTime.now();
  final dateStr = '${now.year}-${now.month.toString().padLeft(2, '0')}'
                  '-${now.day.toString().padLeft(2, '0')}';
  _logFilePath = '${dir.path}${sep}launcher_$dateStr.log';

  // 4. 确保文件存在
  final file = File(_logFilePath!);
  if (!await file.exists()) {
    await file.create(recursive: true);
  }

  // 5. 写入会话分隔符
  await _appendLogLine('---------------- new session ----------------');
}
```

> 💡 **防御式编程体现**：
> - 环境变量可能为 null → 有 fallback 到临时目录
> - 文件可能不存在 → 先 check 再 create
> - 写入可能失败（权限不足）→ catch 并静默忽略，不阻塞启动流程

---

## 14.6 🔑 轮询模式——等待外部状态就绪

### _waitHostReady —— Stopwatch + 轮询

```dart
Future<bool> _waitHostReady(Duration timeout) async {
  final stopwatch = Stopwatch()..start();
  //                            ^^^^^^^^
  //             级联操作符（第 3 章学的）：创建 + 启动

  while (stopwatch.elapsed < timeout) {
    if (await _isHostReachable()) {
      return true;          // ← Host 就绪，返回成功
    }
    await Future<void>.delayed(const Duration(milliseconds: 500));
    //                                        ^^^^^^^^^^^^^^^^^^^
    //                  每 500ms 检查一次（不要太频繁，避免 CPU 空转）
  }
  return false;             // ← 超时，返回失败
}
```

### _isHostReachable —— 连通性探测

```dart
Future<bool> _isHostReachable() async {
  try {
    final ws = await WebSocket.connect(
      _ws.serverUrl,
    ).timeout(const Duration(milliseconds: 1200));
    //        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //    1.2 秒超时，避免无限等待
    await ws.close();          // ← 探测完毕立即关闭
    return true;
  } catch (_) {
    return false;              // ← 连不上就返回 false
  }
}
```

> 💡 **轮询模式的三要素**：
> 1. **超时限制**（`Stopwatch` + `timeout`）——避免无限等待
> 2. **轮询间隔**（`Future.delayed(500ms)`）——避免 CPU 空转
> 3. **探测方法**（`_isHostReachable`）——快速失败不阻塞

---

## 14.7 🔗 BootstrapService 启动流程全景

把本章所有知识点串起来——Lumi-Hub 的完整启动流程：

```
main()
  │
  ├── WidgetsFlutterBinding.ensureInitialized()
  ├── windowManager.ensureInitialized()
  ├── 配置窗口大小/居中/标题
  ├── setPreventClose(true)    ← 拦截关闭
  └── runApp(MultiProvider → LumiApp)
         │
         ↓
    BootstrapScreen.initState()
         │
         ├── 检查是否需要询问连接模式
         │   └── showConnectionModeDialog()
         │
         └── BootstrapService.start()
              │
              ├── 📁 _ensureLogFileReady()     [File I/O]
              │   └── 创建日志目录和文件
              │
              ├── 🔍 _checkPythonAvailable()   [Process.run]
              │   └── python --version
              │
              ├── 🌐 _isHostReachable()        [WebSocket 探测]
              │   └── 尝试连接 ws://127.0.0.1:8765
              │
              ├── 🚀 _startAstrBot()           [Process.start]
              │   ├── 检查 main.py 是否存在    [File.exists]
              │   └── Process.start(detached) → 记录 PID
              │
              ├── ⏳ _waitHostReady(45s)       [轮询]
              │   └── 每 500ms 探测一次
              │
              ├── 🔌 _ws.connect()             [WebSocket]
              │
              └── ⏳ _waitWsConnected(10s)     [轮询]
                  └── 等待 WsService.status == connected
```

```
退出流程：

  用户点 ❌ / 托盘"完全退出"
       ↓
  onWindowClose() / onTrayMenuItemClick()
       ↓
  确认关闭方式（ask → dialog → minimize/exit）
       ↓ (exit)
  bootstrap.handleAppExit()
       │
       ├── 远程模式? → 跳过
       ├── 不关 AstrBot? → 跳过
       └── 由 Hub 启动的? → _killAstrBotByPid()
                                └── taskkill /PID xxx /T /F
       ↓
  trayManager.destroy()
  windowManager.destroy()
       ↓
  应用退出
```

---

## 14.8 环境检测与平台门控

```dart
// Lumi-Hub 中反复出现的平台门控模式
bool get _supportsLocalHostLifecycle => !kIsWeb && Platform.isWindows;

// 用法 1：功能开关
if (!_supportsLocalHostLifecycle) {
  _log('当前平台不支持一键打开日志目录。', level: LogLevel.warning);
  return;
}

// 用法 2：条件注册
@override
void initState() {
  super.initState();
  if (!kIsWeb && Platform.isWindows) {
    windowManager.addListener(this);
    trayManager.addListener(this);
    _initTray();
  }
}

// 用法 3：启动流程分支
if (isRemoteClientMode) {
  // 远程模式：跳过 Python 检测和进程管理
  _setStage(BootstrapStage.connectingWs);
  await _ws.connect();
} else {
  // 本机模式：完整的环境检测和进程管理流程
  final pythonOk = await _checkPythonAvailable();
  // ...
}
```

> 💡 **设计原则**：  
> 把平台特定逻辑封装在 `_supportsLocalHostLifecycle` 这样的 getter 中，  
> 而不是到处写 `!kIsWeb && Platform.isWindows`——更可读，也更容易扩展到其他平台。

---

## 14.9 Stopwatch —— 计时器

`Stopwatch` 用于精确计时（不依赖 `DateTime`）：

```dart
final stopwatch = Stopwatch()..start();  // 创建并启动

// 做一些事情...
await heavyOperation();

print(stopwatch.elapsed);           // Duration 类型
print(stopwatch.elapsedMilliseconds); // int 毫秒

stopwatch.stop();       // 暂停
stopwatch.reset();      // 重置
stopwatch.start();      // 继续

// 常见模式：超时循环
while (stopwatch.elapsed < timeout) {
  // ...
  await Future.delayed(Duration(milliseconds: 500));
}
```

> 💡 C++ 对比：
> ```cpp
> auto start = std::chrono::steady_clock::now();
> // ...
> auto elapsed = std::chrono::steady_clock::now() - start;
> ```
> Dart 的 `Stopwatch` 比 `chrono` 简洁得多。

---

## 14.10 本章小结

| 概念 | C++ | Dart/Flutter | 重要程度 |
|------|-----|-------------|----------|
| 平台检测 | `#ifdef _WIN32` | `Platform.isWindows` / `kIsWeb` | 🔑 |
| 环境变量 | `getenv()` | `Platform.environment['KEY']` | 🔑 |
| 窗口管理 | Win32 API | `window_manager` 插件 | 🔑🔑 |
| 系统托盘 | Win32 API | `tray_manager` 插件 | 🔑 |
| 执行命令 | `system()` / `CreateProcess` | `Process.run()` | 🔑🔑 |
| 启动后台进程 | `CreateProcess` (detached) | `Process.start(detached)` | 🔑🔑 |
| 终止进程 | `TerminateProcess` | `Process.run('taskkill', ...)` | 🔑 |
| 文件操作 | `fstream` / `fopen` | `File` / `Directory` | 🔑🔑 |
| 计时器 | `std::chrono` | `Stopwatch` | 🔑 |
| 轮询模式 | `while + sleep` | `while + Future.delayed` | 🔑🔑 |

### 🎯 关键要点

1. **`dart:io` 是平台交互的核心**——`Platform`、`Process`、`File`、`Directory` 全在这里。
2. **`kIsWeb` 必须先于 `Platform.isXxx` 检查**——Web 上访问 `Platform` 会报错。
3. **`Process.run` 等完成，`Process.start` 不等**——前者适合短命令，后者适合后台服务。
4. **`ProcessStartMode.detached`** 让子进程完全独立——Dart 退出后子进程继续运行。
5. **轮询三要素**：超时 + 间隔 + 快速失败的探测方法。
6. **`setPreventClose(true)`** 拦截窗口关闭——不直接退出，而是让代码决定是最小化还是退出。
7. **平台门控封装为 getter**——`_supportsLocalHostLifecycle` 比到处写 `if Platform.isWindows` 更好。
8. **防御式文件操作**——环境变量有 fallback，文件操作有 try-catch，写入失败不阻塞主流程。

---

> 📖 下一章：[第 15 章 WebSocket 实战：通信协议与消息处理](../15_networking.md) —— 深入 WsService 的完整网络通信架构。

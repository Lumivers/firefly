---
title: "第十三章 导航、路由与主题"
published: 2026-03-27
pinned: false
description: "掌握 Flutter 的导航艺术。从状态驱动的条件渲染到 Navigator 的命令式调用，结合 Material 3 主题系统，打造流畅且统一的用户交互体验。"
tags: [Flutter, 路由导航, 主题系统, Material3]
category: Dart学习笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 第十三章 导航、路由与主题

> 目标：掌握 Flutter 的页面导航体系和主题系统。Lumi-Hub 用了两种导航模式——状态驱动的条件渲染和 Navigator 的命令式导航，以及完整的明暗主题切换体系。

---

## 13.1 🔑 两种导航模式

Flutter 有两种页面切换方式，Lumi-Hub **同时使用了两种**：

| 模式 | 机制 | 适合场景 | Lumi-Hub 用例 |
|------|------|---------|--------------|
| **状态驱动** | 根据状态变量决定渲染哪个 Widget | 应用级的"页面替换" | 启动→登录→聊天 |
| **命令式 Navigator** | `Navigator.push()` / `pop()` | 子页面进入/退出、对话框 | 打开设置、MCP 页 |

### 模式一：状态驱动（声明式）

```dart
class AuthWrapper extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final bootstrap = context.watch<BootstrapService>();
    final ws = context.watch<WsService>();

    // 状态变化 → 自动切换页面，无需手动 push/pop
    if (!bootstrap.isReady) return const BootstrapScreen();
    if (!ws.isAuthenticated) return const AuthScreen();
    return const ChatScreen();
  }
}
```

```
状态驱动的页面流：

  bootstrap.isReady == false
       │
       ↓
  BootstrapScreen ──→ bootstrap.isReady = true
                            │
                            ↓
                      ws.isAuthenticated == false
                            │
                            ↓
                      AuthScreen ──→ ws.isAuthenticated = true
                                          │
                                          ↓
                                    ChatScreen
```

> 💡 这种模式**不使用 Navigator**——没有页面栈，没有后退按钮。  
> 页面切换完全由状态决定，更适合"线性流程"（启动→登录→主界面）。

### 模式二：命令式 Navigator

```dart
// 进入新页面
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (context) => const McpSettingsScreen(),
  ),
);

// 返回上一页
Navigator.pop(context);

// 返回并带回数据
Navigator.pop(context, result);
```

---

## 13.2 🔑 Navigator 详解

### Navigator 是一个页面栈

```
Navigator 页面栈：

  push McpSettingsScreen
  ┌────────────────────┐
  │  McpSettingsScreen  │  ← 当前页面（栈顶）
  ├────────────────────┤
  │    ChatScreen      │
  ├────────────────────┤
  │   AuthWrapper      │  ← 底层
  └────────────────────┘

  pop → 返回 ChatScreen
```

### `Navigator.push` —— 进入新页面

```dart
// 🔗 Lumi-Hub：点击侧边栏打开 MCP 设置
onTap: () {
  Navigator.push(
    context,
    MaterialPageRoute(
      builder: (context) => const McpSettingsScreen(),
      //                          ^^^^^^^^^^^^^^^^^
      //                   构建新页面的 Widget
    ),
  );
},
```

### `Navigator.pop` —— 返回上一页

```dart
// 简单返回
Navigator.pop(context);

// 返回并带数据
Navigator.pop(context, true);     // 返回 true
Navigator.pop(context, false);    // 返回 false

// Navigator.of(context).pop() 等价于 Navigator.pop(context)
Navigator.of(context).pop();
```

### `showDialog` + `Navigator.pop` 带返回值

```dart
// 弹出对话框并等待结果
final result = await showDialog<bool>(
  context: context,
  builder: (ctx) => AlertDialog(
    title: const Text('确认删除？'),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(ctx, false),   // ← 取消
        child: const Text('取消'),
      ),
      FilledButton(
        onPressed: () => Navigator.pop(ctx, true),    // ← 确认
        child: const Text('删除'),
      ),
    ],
  ),
);

if (result == true) {
  // 用户确认了
}
```

> 💡 `showDialog` 本质上也是 `Navigator.push` 一个透明的"页面"。  
> `Navigator.pop(ctx, value)` 把 value 传回给 `await showDialog<T>()` 的调用者。

### `Navigator.of(context).canPop()` —— 检查能否返回

```dart
if (Navigator.of(context).canPop()) {
  Navigator.of(context).pop();
}
// 避免在只有一个页面时 pop 导致黑屏
```

### `Navigator.of(context).maybePop()` —— 安全返回

```dart
Navigator.of(context).maybePop();
// 如果能 pop 就 pop，不能就什么都不做
// 比 canPop + pop 更简洁
```

---

## 13.3 MaterialPageRoute —— 页面过渡动画

```dart
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (context) => const McpSettingsScreen(),
  ),
);
```

`MaterialPageRoute` 自带 Material Design 的页面过渡动画（Android 上是从右滑入）。

### 其他 Route 类型

```dart
// 无动画过渡
Navigator.push(context, PageRouteBuilder(
  pageBuilder: (context, animation, secondaryAnimation) =>
      const McpSettingsScreen(),
  transitionsBuilder: (context, animation, secondaryAnimation, child) =>
      child,  // 无动画
));

// 淡入淡出
Navigator.push(context, PageRouteBuilder(
  pageBuilder: (context, animation, secondaryAnimation) =>
      const McpSettingsScreen(),
  transitionsBuilder: (context, animation, secondaryAnimation, child) =>
      FadeTransition(opacity: animation, child: child),
));
```

---

## 13.4 命名路由（了解即可）

```dart
// 定义命名路由
MaterialApp(
  routes: {
    '/': (context) => const AuthWrapper(),
    '/settings': (context) => const SettingsScreen(),
    '/mcp': (context) => const McpSettingsScreen(),
  },
);

// 使用命名路由导航
Navigator.pushNamed(context, '/settings');
```

> 💡 Lumi-Hub 没有使用命名路由——直接创建 Route 对象更灵活。  
> 命名路由在大型应用中会碰到类型安全问题（传参靠 Map），  
> 所以 Flutter 官方更推荐用 `go_router` 或直接 push Route。

---

## 13.5 🔑 MaterialApp —— 应用入口

`MaterialApp` 是 Flutter 应用的根 Widget，负责导航、主题、本地化等全局配置：

```dart
MaterialApp(
  // 导航相关
  navigatorKey: _navigatorKey,             // GlobalKey 跨组件导航
  home: const AuthWrapper(),               // 首页

  // 主题相关
  themeMode: ThemeMode.system,             // 跟随系统明暗
  theme: AppTheme.light(fontFamily: ...),  // 浅色主题
  darkTheme: AppTheme.dark(fontFamily: ...), // 深色主题

  // 其他
  title: 'Lumi Hub',                       // 任务管理器标题
  debugShowCheckedModeBanner: false,       // 隐藏 DEBUG 横幅
)
```

### ThemeMode 选项

| 值 | 效果 |
|----|------|
| `ThemeMode.system` | 跟随系统（Lumi-Hub 使用） |
| `ThemeMode.light` | 强制浅色 |
| `ThemeMode.dark` | 强制深色 |

---

## 13.6 🔑 ThemeData —— 主题配置

### 基本结构

```dart
ThemeData(
  brightness: Brightness.dark,           // 明暗基调
  scaffoldBackgroundColor: _darkBg,      // Scaffold 背景色
  colorScheme: const ColorScheme.dark(   // 语义化颜色
    primary: _darkAccent,                //   主色（按钮、链接）
    surface: _darkBg,                    //   表面色（卡片、对话框）
    onSurface: _darkText,               //   表面上的文字色
  ),
  fontFamily: fontFamily,                // 全局字体
  extensions: [LumiColors.dark()],       // 自定义扩展颜色
)
```

### ColorScheme 的语义化颜色

```dart
ColorScheme.dark(
  primary: Color(0xFF5BACF0),      // 主色 —— 按钮、重点元素
  onPrimary: Colors.white,         // 主色上的文字
  secondary: Color(0xFF03DAC6),    // 辅色 —— 次要按钮
  surface: Color(0xFF17212B),      // 表面色 —— 卡片、对话框背景
  onSurface: Color(0xFFEEF2F6),   // 表面上的文字
  error: Color(0xFFCF6679),        // 错误色
  onError: Colors.black,           // 错误色上的文字
)
```

> 💡 `ColorScheme` 是 Material 3 的核心——  
> **永远用语义化颜色**（`primary`、`surface`），不要硬编码 `Colors.blue`。  
> 这样切换主题时，所有 Widget 自动更新颜色。

### 在 Widget 中使用 Theme

```dart
// 获取当前主题的颜色
final colorScheme = Theme.of(context).colorScheme;
Container(
  color: colorScheme.surface,        // 表面色
  child: Text(
    'Hello',
    style: TextStyle(color: colorScheme.onSurface),  // 文字色
  ),
)

// 获取主题的文字样式
final textTheme = Theme.of(context).textTheme;
Text('标题', style: textTheme.headlineMedium);
Text('正文', style: textTheme.bodyLarge);
```

---

## 13.7 🔗 Lumi-Hub 的完整主题架构

### 架构图

```
AppSettings.fontFamily ──────────────────────────────────────┐
     │ context.watch                                        │
     ↓                                                      ↓
MaterialApp                                                 │
  ├─ theme: AppTheme.light(fontFamily: ...)  ←── factory ──┐│
  ├─ darkTheme: AppTheme.dark(fontFamily: ...)  ←── factory │
  └─ themeMode: ThemeMode.system                            │
                                                            │
AppTheme.dark() / .light()                                  │
  ├─ brightness                                             │
  ├─ scaffoldBackgroundColor                                │
  ├─ colorScheme (primary / surface / onSurface)            │
  ├─ fontFamily ← ──────────────────────────────────────────┘
  └─ extensions: [LumiColors.dark() / .light()]
                       │
                       ↓
  Widget 中使用：
  Theme.of(context).colorScheme.primary     → 标准颜色
  Theme.of(context).extension<LumiColors>()! → 自定义颜色
    .sidebar / .bubbleMe / .accent / ...
```

### AppTheme 工厂类

```dart
class AppTheme {
  // 颜色常量
  static const _darkAccent = Color(0xFF5BACF0);
  static const _darkText = Color(0xFFEEF2F6);
  static const _darkBg = Color(0xFF17212B);

  static const _lightAccent = Color(0xFF2481CC);
  static const _lightText = Color(0xFF000000);
  static const _lightBg = Color(0xFFF0F2F5);

  // 深色主题工厂方法
  static ThemeData dark({String? fontFamily}) {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: _darkBg,
      colorScheme: const ColorScheme.dark(
        primary: _darkAccent,
        surface: _darkBg,
        onSurface: _darkText,
      ),
      fontFamily: fontFamily,
      extensions: [LumiColors.dark()],
    );
  }

  // 浅色主题工厂方法（结构对称）
  static ThemeData light({String? fontFamily}) {
    return ThemeData(
      brightness: Brightness.light,
      scaffoldBackgroundColor: _lightBg,
      colorScheme: const ColorScheme.light(
        primary: _lightAccent,
        surface: _lightBg,
        onSurface: _lightText,
      ),
      fontFamily: fontFamily,
      extensions: [LumiColors.light()],
    );
  }
}
```

> 💡 **设计模式**：
> - `AppTheme` 是工具类（只有 `static` 方法，不需要实例化）
> - `dark()` 和 `light()` 结构对称，便于维护
> - 颜色常量用 `static const` 定义在类顶部，集中管理
> - `fontFamily` 作为参数注入——由 `AppSettings` Provider 控制

### 两层颜色系统

```dart
// 第一层：Material 标准颜色（通过 colorScheme 访问）
Theme.of(context).colorScheme.primary     // 主色
Theme.of(context).colorScheme.surface     // 表面色
Theme.of(context).colorScheme.onSurface   // 表面文字色

// 第二层：Lumi-Hub 自定义颜色（通过 ThemeExtension 访问）
final colors = Theme.of(context).extension<LumiColors>()!;
colors.sidebar       // 侧边栏背景
colors.bubbleMe      // 我的消息气泡
colors.bubbleThem    // 对方的消息气泡
colors.accent        // 强调色
colors.subtext       // 次要文字
colors.inputBg       // 输入框背景
colors.divider       // 分隔线
colors.onBubbleMe    // 我的气泡上的文字
colors.onBubbleThem  // 对方气泡上的文字
```

> 💡 为什么需要两层？
> - **Material 颜色**（`colorScheme`）——给 Material Widget 自动使用（按钮、输入框等）
> - **自定义颜色**（`LumiColors`）——给聊天气泡、侧边栏等非标准 UI 使用
> - 两层都**随主题切换而变化**——深色/浅色模式全自动

---

## 13.8 动态切换字体

Lumi-Hub 的字体切换流程是一个完整的"数据驱动 UI"链条：

```
用户选择字体
     ↓
AppSettings.setFontFamily('MiSans')
     ↓
_fontFamily = 'MiSans'
notifyListeners()  ← 通知所有 watch 的 Widget
_save()            ← 持久化
     ↓
_LumiAppState.build() 被重新调用（因为 context.watch<AppSettings>）
     ↓
MaterialApp(
  theme: AppTheme.light(fontFamily: 'MiSans'),   // ← 新字体
  darkTheme: AppTheme.dark(fontFamily: 'MiSans'),
)
     ↓
所有 Text Widget 自动用新字体渲染
```

> 💡 整个流程**没有手动刷新**——完全由 Provider 的 watch 机制驱动。  
> 这就是 Flutter 声明式 UI + 状态管理的威力。

---

## 13.9 本章小结

| 概念 | 用途 | 重要程度 |
|------|------|----------|
| 状态驱动导航 | 应用级页面切换（if + watch）| 🔑🔑 |
| `Navigator.push` | 进入新页面 | 🔑🔑 |
| `Navigator.pop` | 返回 + 带数据 | 🔑🔑 |
| `MaterialPageRoute` | 页面过渡动画 | 🔑 |
| `showDialog` + `pop(result)` | 对话框返回值 | 🔑🔑 |
| `MaterialApp` | 全局配置（导航 + 主题）| 🔑🔑 |
| `ThemeData` + `ColorScheme` | 语义化主题颜色 | 🔑🔑 |
| `ThemeExtension` | 自定义扩展颜色 | 🔑🔑 |
| `ThemeMode.system` | 跟随系统明暗 | 🔑 |

### 🎯 关键要点

1. **两种导航并存**——状态驱动（AuthWrapper 的 if-else）适合线性流程，Navigator.push 适合子页面。
2. **`showDialog` 本质是 push**——`Navigator.pop(ctx, value)` 可以把数据传回 `await showDialog<T>()` 的调用者。
3. **永远用 `ColorScheme` 的语义化颜色**——不要硬编码 `Colors.blue`，否则切换主题时会出问题。
4. **两层颜色系统**——Material 标准色给框架 Widget 用，`ThemeExtension` 给自定义 UI 用。
5. **字体切换的数据流**完美展示了 Provider + 声明式 UI 的协作——从用户操作到全局生效，零手动刷新。
6. **`ThemeMode.system`** 让应用自动跟随系统的深色/浅色切换——用户无需手动切换。

---

> 🎉 **第三部分"Flutter 框架"（Ch 10-13）全部完成！**  
> 📖 下一章：[第 14 章 平台集成：窗口管理、托盘与进程](../14_platform_integration.md) —— 进入工程实战领域。

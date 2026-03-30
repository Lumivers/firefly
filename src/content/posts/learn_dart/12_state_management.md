---
title: "第十二章 状态管理：Provider 与 ChangeNotifier"
published: 2026-03-30
pinned: false
description: "目标：掌握 Flutter 的状态管理体系。状态管理是 Flutter 应用架构的核心——它决定了数据存在哪里和 UI 怎么响应数据变化。Lumi-Hub 使用 Provider + ChangeNotifier 方案，是 Flutter 官方推荐的入门级状态管理。"
tags: [Flutter, Dart, 状态管理, Provider, ChangeNotifier]
category: 学习笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lonelystar"
image: ""
draft: false
---

# 第十二章 状态管理：Provider 与 ChangeNotifier

> 目标：掌握 Flutter 的状态管理体系。状态管理是 Flutter 应用架构的**核心**——它决定了"数据存在哪里"和"UI 怎么响应数据变化"。Lumi-Hub 使用 Provider + ChangeNotifier 方案，是 Flutter 官方推荐的入门级状态管理。

---

## 12.1 🔑 什么是状态管理

### 问题：状态放哪里？

```
场景：用户在设置页面修改了字体
         ↓
  设置页面需要知道（高亮选中的字体）
  聊天页面需要知道（应用新字体）
  整个应用需要知道（MaterialApp 重建主题）
```

如果每个页面各自维护一份状态 → **数据不同步**。  
如果通过构造函数层层传递 → **prop drilling**（传到第 N 层太痛苦）。

> 💡 状态管理的本质：
> 1. **在哪里存储**共享状态？ → 放到 Widget 树的上层
> 2. **怎么通知** UI 重建？ → 观察者模式
> 3. **怎么读取**状态？ → InheritedWidget / Provider

### Flutter 的状态分类

| 类型 | 描述 | 管理方式 |
|------|------|---------|
| **临时状态** | 单个 Widget 内部的 UI 状态（如动画进度、Tab 选中）| `setState()` |
| **应用状态** | 多个 Widget 共享的数据（如用户登录、连接状态、设置）| Provider / Riverpod / Bloc 等 |

---

## 12.2 🔑 ChangeNotifier —— 可观察的数据模型

`ChangeNotifier` 是 Flutter 的**观察者模式**基类——当数据变化时通知所有监听者。

### 基本原理

```dart
class Counter extends ChangeNotifier {
  int _count = 0;
  int get count => _count;

  void increment() {
    _count++;
    notifyListeners();    // ← 通知所有监听者：数据变了！
  }
}
```

```
Counter (ChangeNotifier)
  │
  │ notifyListeners()
  │
  ├──→ 监听者 A（重建 Widget）
  ├──→ 监听者 B（重建另一个 Widget）
  └──→ 监听者 C（更新其他逻辑）
```

> 💡 C++ 对比：
> ```cpp
> // C++ 的观察者模式需要手动实现
> class Observable {
>     std::vector<std::function<void()>> listeners;
>     void notify() { for (auto& f : listeners) f(); }
> };
> ```
> Dart 的 `ChangeNotifier` 把这个模式标准化了。

### notifyListeners 的规则

```dart
void setFontFamily(String key) {
  if (_fontFamily == key) return;    // ← 值没变就不通知（避免无意义重建）
  _fontFamily = key;
  notifyListeners();                 // ← 值变了才通知
  _save();                           // ← 持久化到本地
}
```

> ⚠️ **调用 `notifyListeners()` 会导致所有 `context.watch` 的 Widget 重建**。  
> 如果值没有实际变化，不要调用——否则会造成不必要的 UI 重建。

### 🔗 Lumi-Hub 的三个 ChangeNotifier

项目中有三个 ChangeNotifier，各自管理不同领域的状态：

| 类 | 职责 | 核心状态 |
|----|------|---------|
| `AppSettings` | 应用设置 | 字体、关闭行为、连接模式 |
| `WsService` | WebSocket 通信 | 连接状态、消息列表、认证状态 |
| `BootstrapService` | 启动流程 | 启动阶段、日志、错误信息 |

---

## 12.3 🔗 深入 AppSettings —— 教科书式的 ChangeNotifier

`app_settings.dart` 是最典型的 ChangeNotifier 实现：

### 完整结构

```dart
class AppSettings extends ChangeNotifier {
  // ① 私有状态字段
  String _fontFamily = 'MiSans';
  bool _closeAstrBotOnExit = false;
  WindowCloseAction _windowCloseAction = WindowCloseAction.ask;
  ConnectionMode _connectionMode = ConnectionMode.localOrUsb;

  // ② 公开 getter（只读访问）
  String? get fontFamily => _fontFamily.isEmpty ? null : _fontFamily;
  String get fontKey => _fontFamily;
  bool get closeAstrBotOnExit => _closeAstrBotOnExit;
  WindowCloseAction get windowCloseAction => _windowCloseAction;
  ConnectionMode get connectionMode => _connectionMode;

  // ③ 构造函数中加载持久化数据
  AppSettings() {
    _load();    // 从 SharedPreferences 异步加载
  }

  // ④ setter：修改 → 通知 → 持久化
  void setFontFamily(String key) {
    if (_fontFamily == key) return;      // 值没变，跳过
    _fontFamily = key;
    notifyListeners();                   // 通知 UI 重建
    _save();                             // 保存到本地
  }

  void setWindowCloseAction(WindowCloseAction value) {
    if (_windowCloseAction == value) return;
    _windowCloseAction = value;
    notifyListeners();
    _save();
  }

  void setConnectionMode(ConnectionMode value) {
    if (_connectionMode == value) return;
    _connectionMode = value;
    notifyListeners();
    _save();
  }
  // ... 其他 setter 同样的模式 ...
}
```

### 设计模式拆解

```
AppSettings 的数据流：

  SharedPreferences（磁盘）
       ↕ _load() / _save()
  AppSettings（内存 ChangeNotifier）
       │ notifyListeners()
       ↓
  UI Widget（context.watch → 自动重建）
```

> 💡 每个 setter 都遵循同样的三步曲：
> 1. **早返回**——值没变就 return
> 2. **notifyListeners()**——通知 UI
> 3. **_save()**——持久化到磁盘
>
> 这个模式非常工整，所有 setter 都长得几乎一样。

---

## 12.4 🔗 WsService —— 复杂状态的 ChangeNotifier

`WsService` 是一个**大型 ChangeNotifier**，管理 WebSocket 通信的所有状态：

```dart
class WsService extends ChangeNotifier {
  // 连接状态
  WsStatus _status = WsStatus.disconnected;
  WsStatus get status => _status;

  // 消息列表
  final List<ChatMessage> _messages = [];
  List<ChatMessage> get messages => List.unmodifiable(_messages);
  //                                ^^^^^^^^^^^^^^^^^^^^^^^^
  //                 返回不可变副本，防止外部修改内部列表

  // 认证状态
  bool _isAuthenticated = false;
  bool get isAuthenticated => _isAuthenticated;
  String? _token;
  Map<String, dynamic>? _user;
  Map<String, dynamic>? get user => _user;

  // 生成状态
  bool _isGenerating = false;
  bool get isGenerating => _isGenerating;

  // 状态变更都通过内部方法 + notifyListeners
  void _setStatus(WsStatus s) {
    _status = s;
    notifyListeners();
  }
}
```

### `List.unmodifiable` —— 保护内部状态

```dart
List<ChatMessage> get messages => List.unmodifiable(_messages);

// ❌ 如果直接暴露内部列表：
// List<ChatMessage> get messages => _messages;
// 外部代码可以：messages.add(...) 或 messages.clear()
// 绕过 notifyListeners()，导致 UI 不同步

// ✅ List.unmodifiable 返回不可变视图：
// 外部调 messages.add() 会抛 UnsupportedError
```

> 💡 **核心原则**：ChangeNotifier 的所有状态修改**必须**经过内部方法并调用 `notifyListeners()`。  
> 绝不暴露可变引用给外部。

---

## 12.5 🔑 Provider —— 把 ChangeNotifier 注入 Widget 树

Provider 是 Flutter 官方推荐的依赖注入 + 状态管理包。它把 ChangeNotifier（或其他对象）注入 Widget 树的上层，让下层所有 Widget 都能访问。

### ChangeNotifierProvider

```dart
// 在 Widget 树顶部提供一个 ChangeNotifier
ChangeNotifierProvider(
  create: (_) => AppSettings(),     // ← 创建实例
  child: MyApp(),                   // ← 下面所有 Widget 都能访问
)
```

### MultiProvider —— 提供多个

```dart
MultiProvider(
  providers: [
    ChangeNotifierProvider(create: (_) => AppSettings()),
    ChangeNotifierProvider(create: (_) => WsService()),
    // ... 更多 ...
  ],
  child: const LumiApp(),
)
```

### 🔗 Lumi-Hub 的 Provider 注册

```dart
void main() async {
  // ... 初始化代码 ...

  runApp(
    MultiProvider(
      providers: [
        // ① 独立的 ChangeNotifier
        ChangeNotifierProvider(create: (_) => AppSettings()),
        ChangeNotifierProvider(create: (_) => WsService()),

        // ② 依赖其他 Provider 的 ChangeNotifier
        ChangeNotifierProxyProvider2<WsService, AppSettings, BootstrapService>(
          create: (context) => BootstrapService(
            context.read<WsService>(),      // ← 读取上面的 WsService
            context.read<AppSettings>(),    // ← 读取上面的 AppSettings
          ),
          update: (context, ws, settings, previous) =>
              previous ?? BootstrapService(ws, settings),
        ),
      ],
      child: const LumiApp(),
    ),
  );
}
```

### Provider 的层级结构

```
MultiProvider
├── AppSettings (ChangeNotifier)
├── WsService (ChangeNotifier)
└── BootstrapService (ChangeNotifier)
         │  依赖 WsService + AppSettings
         └── ← ChangeNotifierProxyProvider2
```

> 💡 `ChangeNotifierProxyProvider2` 的 `2` 表示依赖**两个**其他 Provider。  
> 还有 `ProxyProvider`、`ProxyProvider3`... 以此类推。

---

## 12.6 🔑 消费 Provider：read / watch / select

### `context.watch<T>()` —— 监听并重建

```dart
@override
Widget build(BuildContext context) {
  final settings = context.watch<AppSettings>();
  //                        ^^^^^
  //   "我要监听 AppSettings 的变化"
  //   每次 AppSettings.notifyListeners() 被调用，
  //   这个 Widget 都会重新执行 build()

  return Text(settings.fontKey);  // 字体变了 → 自动更新
}
```

### `context.read<T>()` —— 只读取，不监听

```dart
void _submit() {
  final wsService = context.read<WsService>();
  //                        ^^^^
  //   "我只需要获取 WsService，不需要监听变化"
  //   适合在回调/事件处理中使用

  wsService.login(username, password);
}
```

### watch vs read 的选择

| 场景 | 用 `watch` | 用 `read` |
|------|-----------|-----------|
| 在 `build()` 中展示数据 | ✅ | ❌ 数据变了 UI 不更新 |
| 在事件回调中调用方法 | ❌ 造成不必要重建 | ✅ |
| 在 `initState` 中 | ❌ | 需通过 `addPostFrameCallback` |
| 在 `dispose` 中 | ❌ | ✅ |

```dart
@override
Widget build(BuildContext context) {
  // ✅ build 中用 watch —— 需要响应变化
  final ws = context.watch<WsService>();
  final settings = context.watch<AppSettings>();

  return ElevatedButton(
    onPressed: () {
      // ✅ 回调中用 read —— 只需一次性获取
      final ws = context.read<WsService>();
      ws.sendMessage(text);
    },
    child: Text(ws.isConnected ? '发送' : '未连接'),
  );
}
```

### `context.select<T, R>()` —— 精确监听特定字段

```dart
// ❌ watch：AppSettings 的任何字段变化都会重建这个 Widget
final settings = context.watch<AppSettings>();
return Text(settings.fontKey);

// ✅ select：只在 fontKey 变化时才重建
final fontKey = context.select<AppSettings, String>((s) => s.fontKey);
return Text(fontKey);
```

> 💡 `select` 是性能优化的利器——当 ChangeNotifier 有很多字段时，  
> 用 `select` 可以避免"改了字体就重建聊天消息列表"这样的无关重建。

---

## 12.7 🔗 Lumi-Hub 中 watch/read 的实际使用

### AuthWrapper —— watch 驱动页面切换

```dart
class AuthWrapper extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final bootstrap = context.watch<BootstrapService>();
    //                        ^^^^^
    //   监听 BootstrapService 的每次 notifyListeners()
    final ws = context.watch<WsService>();

    if (!bootstrap.isReady) return const BootstrapScreen();
    if (!ws.isAuthenticated) return const AuthScreen();
    return const ChatScreen();
    //    当 bootstrap.isReady 或 ws.isAuthenticated 变化时，
    //    AuthWrapper 自动重建，显示正确的页面
  }
}
```

### LumiApp —— watch 驱动主题切换

```dart
@override
Widget build(BuildContext context) {
  final settings = context.watch<AppSettings>();
  //   当用户修改字体时，AppSettings.notifyListeners()
  //   → LumiApp.build() 重新执行
  //   → MaterialApp 用新字体重建
  return MaterialApp(
    theme: AppTheme.light(fontFamily: settings.fontFamily),
    darkTheme: AppTheme.dark(fontFamily: settings.fontFamily),
    home: const AuthWrapper(),
  );
}
```

### ChatScreen.initState —— read + addPostFrameCallback

```dart
@override
void initState() {
  super.initState();
  WidgetsBinding.instance.addPostFrameCallback((_) {
    final ws = context.read<WsService>();
    //                 ^^^^
    //   initState 回调中只需要获取一次，不需要监听
    _authSubscription = ws.authRequests.listen(_handleAuthRequest);
    ws.addListener(_wsListener!);
  });
}
```

### ChatScreen.build —— watch 获取实时数据

```dart
@override
Widget build(BuildContext context) {
  final colors = Theme.of(context).extension<LumiColors>()!;
  final ws = context.watch<WsService>();
  //                 ^^^^^
  //   每次 WsService 状态变化（新消息、连接状态等），
  //   ChatScreen 自动重建

  return Column(
    children: [
      Expanded(child: MessageList(messages: ws.messages)),
      InputBar(isConnected: ws.status == WsStatus.connected),
    ],
  );
}
```

---

## 12.8 🔑 ChangeNotifierProxyProvider —— 有依赖的 Provider

当一个 Service 需要引用另一个 Service 时，用 `ChangeNotifierProxyProvider`：

```dart
ChangeNotifierProxyProvider2<WsService, AppSettings, BootstrapService>(
  create: (context) => BootstrapService(
    context.read<WsService>(),       // ← 创建时注入依赖
    context.read<AppSettings>(),
  ),
  update: (context, ws, settings, previous) =>
      previous ?? BootstrapService(ws, settings),
  //  ^^^^^^^^
  //  如果 WsService 或 AppSettings 重建了，
  //  update 会被调用。这里用 previous ?? 保留旧实例
)
```

```dart
// bootstrap_service.dart
class BootstrapService extends ChangeNotifier {
  final WsService _ws;            // ← 依赖 WsService
  final AppSettings _settings;    // ← 依赖 AppSettings

  BootstrapService(this._ws, this._settings);

  bool get isRemoteClientMode => _settings.remoteClientMode;
  //                              ^^^^^^^^^
  //                   通过注入的依赖访问设置

  Future<void> start() async {
    // ...
    await _ws.connect();          // ← 通过注入的依赖连接 WebSocket
    // ...
  }
}
```

### 依赖关系图

```
AppSettings ──────────┐
                      ├──→ BootstrapService
WsService  ───────────┘         │
     ↑                          │
     │                          │
     └── _ws.connect() ←────────┘
```

---

## 12.9 Provider vs 其他状态管理方案

| 方案 | 复杂度 | 适合场景 | Lumi-Hub 使用 |
|------|--------|---------|--------------|
| `setState` | ⭐ | 单 Widget 内部状态 | ✅ 表单、动画 |
| **Provider + ChangeNotifier** | ⭐⭐ | 中小型应用 | ✅ 主方案 |
| Riverpod | ⭐⭐⭐ | 中大型应用，需要更强类型安全 | ❌ |
| Bloc / Cubit | ⭐⭐⭐⭐ | 大型应用，严格的单向数据流 | ❌ |
| GetX | ⭐⭐ | 快速开发 | ❌ |

> 💡 Provider + ChangeNotifier 是 **Flutter 官方推荐的入门方案**。  
> 它足够简单也足够强大——Lumi-Hub 整个应用只用这一种方案就搞定了。

---

## 12.10 状态管理最佳实践

### ✅ Do

```dart
// 1. setter 中检查值是否变化
void setFont(String key) {
  if (_font == key) return;           // ← 避免无意义的 notifyListeners
  _font = key;
  notifyListeners();
}

// 2. 返回不可变视图
List<Message> get messages => List.unmodifiable(_messages);  // ✅

// 3. build 中 watch，回调中 read
Widget build(context) {
  final ws = context.watch<WsService>();     // ✅
  return Button(onPressed: () {
    context.read<WsService>().send();        // ✅
  });
}

// 4. 用 select 精确监听
final font = context.select<AppSettings, String>((s) => s.fontKey);
```

### ❌ Don't

```dart
// 1. 不要在 build 中用 read（数据变了 UI 不更新）
Widget build(context) {
  final ws = context.read<WsService>();      // ❌ 状态变了不更新
  return Text(ws.status.name);
}

// 2. 不要每次都 notifyListeners
void setFont(String key) {
  _font = key;
  notifyListeners();     // ❌ 没检查 key 是否真的变了
}

// 3. 不要暴露可变引用
List<Message> get messages => _messages;     // ❌ 外部能修改

// 4. 不要在一个 ChangeNotifier 中塞太多不相关的状态
// ❌ 把用户设置、网络状态、UI 状态全放一个类
// ✅ 拆成 AppSettings + WsService + ...
```

---

## 12.11 本章小结

| 概念 | 作用 | 重要程度 |
|------|------|----------|
| `ChangeNotifier` | 可观察的数据模型（观察者模式）| 🔑🔑🔑 |
| `notifyListeners()` | 通知 UI 重建 | 🔑🔑🔑 |
| `ChangeNotifierProvider` | 把 ChangeNotifier 注入 Widget 树 | 🔑🔑🔑 |
| `MultiProvider` | 注册多个 Provider | 🔑🔑 |
| `context.watch<T>()` | 监听 + 读取（用于 build）| 🔑🔑🔑 |
| `context.read<T>()` | 只读取（用于回调）| 🔑🔑🔑 |
| `context.select<T,R>()` | 精确监听特定字段 | 🔑🔑 |
| `ProxyProvider` | 有依赖关系的 Provider | 🔑 |
| `List.unmodifiable` | 保护内部状态 | 🔑🔑 |

### 🎯 关键要点

1. **ChangeNotifier 是核心**——所有共享状态都放在 extends ChangeNotifier 的类中，修改后调 `notifyListeners()`。
2. **setter 三步曲**：检查值是否变化 → `notifyListeners()` → `_save()` 持久化。
3. **`watch` 在 `build`，`read` 在回调**——这是铁律，搞反了要么 UI 不更新要么无意义重建。
4. **`List.unmodifiable`** 保护内部集合——不暴露可变引用，强制通过 setter 修改。
5. **Provider 在树顶注册**——`MultiProvider` 包裹 `runApp`，所有页面都能访问。
6. **按职责拆分 ChangeNotifier**——Lumi-Hub 拆成三个（AppSettings / WsService / BootstrapService），职责清晰。
7. **`select` 精确监听**——ChangeNotifier 字段多时，避免"改一个字段重建整个页面"。

---

> 📖 下一章：[第 13 章 导航、路由与主题](./13_navigation_routing.md) —— Navigator、MaterialApp 路由、ThemeData 主题系统。

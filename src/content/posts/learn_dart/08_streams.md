---
title: "第八章 Stream 与响应式编程"
published: 2026-03-22
pinned: false
description: "掌握响应式编程的核心。从 StreamController 到 StreamTransformer，带你领略数据流在 Dart 中的强大威力，轻松应对实时数据交互场景。"
tags: [Dart, Stream, 响应式编程, 事件流]
category: 学习笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lonelystar"
image: ""
draft: false
---

# 第八章 Stream 与响应式编程

> 目标：掌握 Dart 的 Stream 系统。如果说 Future 是"异步的**一个**值"，那 Stream 就是"异步的**一系列**值"。Stream 是 WebSocket 通信、事件监听、UI 响应的基石。

---

## 8.1 🔑 Stream vs Future —— 核心区别

| 维度 | `Future<T>` | `Stream<T>` |
|------|------------|-------------|
| 产出值数量 | **1 个** | **0 个、1 个或多个** |
| 类比 | 一次性快递 | 持续订阅的报纸 |
| 完成 | 产出值后就结束 | 可以持续发送，也可以关闭 |
| 消费方式 | `await` | `listen` / `await for` |
| 典型场景 | HTTP 请求、文件读取 | WebSocket、用户输入、传感器数据 |

```dart
// Future：一次性的
Future<String> fetchUser() async => '用户数据';
var user = await fetchUser();   // 拿到一个值，结束

// Stream：持续的
Stream<String> messages() async* {
  yield '消息1';
  yield '消息2';
  yield '消息3';
  // 可以无限 yield 下去
}
await for (var msg in messages()) {
  print(msg);  // 依次收到每条消息
}
```

> 💡 C++ 对比：
> - `Future` ≈ `std::future<T>`（一次性结果）
> - `Stream` ≈ **没有直接对应物**。最接近的是 C++ 中的消息队列、观察者模式或 RxCpp 的 Observable
> - Stream 本质上是**异步迭代器** + **发布-订阅模式**的结合体

---

## 8.2 🔑 StreamController —— 创建自定义 Stream

`StreamController` 就像一个**管道**：你在一端放数据（`.add()`），另一端有人在听（`.stream.listen()`）。

### 基本用法

```dart
import 'dart:async';

// 创建控制器
var controller = StreamController<String>();

// 消费端：监听 Stream
controller.stream.listen(
  (data) => print('收到: $data'),      // onData
  onError: (e) => print('错误: $e'),   // onError
  onDone: () => print('流结束了'),      // onDone
);

// 生产端：往 Stream 里放数据
controller.add('消息1');
controller.add('消息2');
controller.add('消息3');
controller.close();  // 关闭流

// 输出：
// 收到: 消息1
// 收到: 消息2
// 收到: 消息3
// 流结束了
```

### 生命周期

```
StreamController 生命周期:

  创建 ──→ add() add() add() ──→ close() ──→ 销毁
              │     │     │          │
              ↓     ↓     ↓          ↓
  listen() ──→ onData onData onData ──→ onDone
```

---

## 8.3 🔑 单订阅 vs 广播流

这是 Stream 中**最重要的概念区分**。

### 单订阅 Stream（默认）

```dart
var controller = StreamController<int>();   // 默认：单订阅

controller.stream.listen((n) => print('监听者A: $n'));  // ✅ 第一个监听者
controller.stream.listen((n) => print('监听者B: $n'));  // ❌ 运行时报错！
// StateError: Stream has already been listened to
```

> 单订阅流**只能被 listen 一次**。适合"点对点"通信，如文件读取流。

### 广播 Stream（`.broadcast()`）

```dart
var controller = StreamController<int>.broadcast();   // 广播流

controller.stream.listen((n) => print('监听者A: $n'));  // ✅
controller.stream.listen((n) => print('监听者B: $n'));  // ✅ 同时监听！

controller.add(42);
// 输出：
// 监听者A: 42
// 监听者B: 42
```

> 广播流可以**被多个监听者同时订阅**。适合"一对多"通信，如事件总线。

### 单订阅 vs 广播 对比

| 特性 | 单订阅流 | 广播流 |
|------|---------|--------|
| `listen` 次数 | 最多 1 次 | 不限 |
| 数据缓冲 | 有监听者前会缓冲数据 | ❌ 没人听的数据直接丢弃 |
| 取消后重新 listen | ❌ | ✅ |
| 适合场景 | 文件读取、HTTP 响应 | 事件通知、状态变化 |

> ⚠️ 广播流的**数据不会缓冲**——如果没有监听者，`add()` 进去的数据会被丢弃。

### 🔗 Lumi-Hub 实例：三条广播流

`ws_service.dart` 定义了**三条广播流**，分别用于不同类型的事件通知：

```dart
class WsService extends ChangeNotifier {
  // 审批请求流 —— 当 Host 需要用户审批时发出事件
  final _authRequestController =
      StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get authRequests =>
      _authRequestController.stream;

  // MCP 配置流 —— 当收到 MCP 配置相关响应时发出事件
  final _mcpConfigController =
      StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get mcpConfigResponses =>
      _mcpConfigController.stream;

  // 人格操作响应流 —— 当人格切换/删除/清空等操作完成时发出事件
  final _personaController =
      StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get personaResponses =>
      _personaController.stream;
}
```

> 💡 **为什么用广播流？**
> - 多个页面/组件可能同时监听同一个事件（如 ChatScreen 和 McpSettingsScreen）
> - 单订阅流不允许多个 listener，会报错
> - 广播流允许任意多个组件独立订阅

### 往流里发数据

```dart
// 收到 WebSocket 消息后，根据类型分发到不同的 Stream
void _onData(dynamic raw) {
  final data = jsonDecode(raw as String) as Map<String, dynamic>;
  final type = data['type'] as String? ?? '';

  switch (type) {
    case 'AUTH_REQUIRED':
      _authRequestController.add(data);       // ← 放入审批流
      break;
    case 'MCP_CONFIG_RESPONSE':
    case 'MCP_CONFIG_UPDATE_RESPONSE':
      _mcpConfigController.add(data);         // ← 放入 MCP 流
      break;
    case 'PERSONA_SWITCH':
    case 'PERSONA_DELETE_RESPONSE':
      _personaController.add(data);           // ← 放入人格流
      break;
  }
}
```

> 💡 这展示了 StreamController 在真实架构中的角色：  
> **消息总线的分发器**——WebSocket 收到的消息是混合的，  
> 通过 `_onData` 分拣后投递到不同的 StreamController，  
> 各个 UI 组件各自订阅自己感兴趣的流。

---

## 8.4 🔑 StreamSubscription —— 订阅管理

`stream.listen()` 返回一个 `StreamSubscription` 对象，用于控制订阅：

### 基本操作

```dart
StreamSubscription<int> sub = stream.listen((data) {
  print('收到: $data');
});

// 暂停
sub.pause();

// 恢复
sub.resume();

// 取消（非常重要！）
sub.cancel();
```

### 🔑 取消订阅——防止内存泄漏

```dart
class _MyWidgetState extends State<MyWidget> {
  StreamSubscription? _sub;

  @override
  void initState() {
    super.initState();
    // 开始订阅
    _sub = someStream.listen((data) {
      if (!mounted) return;   // ← 安全检查
      setState(() { /* 更新 UI */ });
    });
  }

  @override
  void dispose() {
    _sub?.cancel();           // ← 必须取消！
    super.dispose();
  }
}
```

> ⚠️ **这是 Flutter 中最常见的内存泄漏原因之一**：  
> 如果 Widget dispose 了但 StreamSubscription 没有 cancel，  
> Stream 的回调仍然会执行，导致：
> 1. 内存泄漏（被 dispose 的 Widget 无法被 GC 回收）
> 2. 调用已废弃的 `setState` → 崩溃

### 🔗 Lumi-Hub 实例：完整的订阅生命周期

**`chat_screen.dart`** 的审批请求订阅——教科书式的生命周期管理：

```dart
class _ChatScreenState extends State<ChatScreen> {
  StreamSubscription? _authSubscription;    // ← 声明

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final ws = context.read<WsService>();
      // 开始监听审批请求流
      _authSubscription = ws.authRequests.listen(_handleAuthRequest);
      //                     ^^^^^^^^^^^^        ^^^^^^^^^^^^^^^^^^
      //                   订阅 Stream           收到数据时的回调
    });
  }

  void _handleAuthRequest(Map<String, dynamic> request) {
    if (!mounted) return;    // ← 安全检查：Widget 可能已经 dispose
    showDialog(/* 弹出审批窗口 */);
  }

  @override
  void dispose() {
    _authSubscription?.cancel();    // ← 取消订阅！
    // ... 其他清理 ...
    super.dispose();
  }
}
```

**`ws_service.dart`** 的 WebSocket Stream 订阅：

```dart
class WsService extends ChangeNotifier {
  StreamSubscription? _sub;       // ← WebSocket 消息的订阅

  Future<void> connect() async {
    // ...
    _sub = _channel!.stream.listen(
      _onData,                    // ← 收到数据
      onError: _onError,          // ← 发生错误
      onDone: _onDone,            // ← 连接关闭
    );
  }

  void disconnect() {
    _sub?.cancel();               // ← 取消订阅
    _channel?.sink.close();
    // ...
  }
}
```

> 💡 **黄金法则**：`listen` 和 `cancel` 必须配对出现——  
> 在 `initState` / `connect` 中 listen，  
> 在 `dispose` / `disconnect` 中 cancel。

---

## 8.5 🔑 关闭 StreamController

### close() 方法

```dart
var controller = StreamController<String>.broadcast();

// ... 使用一段时间后 ...

await controller.close();  // ← 告诉所有监听者"没有更多数据了"
// close 之后不能再 add() 了
```

### 🔗 Lumi-Hub 实例：dispose 中关闭所有控制器

```dart
class WsService extends ChangeNotifier {
  final _authRequestController = StreamController<Map<String, dynamic>>.broadcast();
  final _mcpConfigController = StreamController<Map<String, dynamic>>.broadcast();
  final _personaController = StreamController<Map<String, dynamic>>.broadcast();

  @override
  void dispose() {
    _disposed = true;
    _authRequestController.close();   // ← 关闭流
    _mcpConfigController.close();     // ← 关闭流
    _personaController.close();       // ← 关闭流
    disconnect();
    super.dispose();
  }
}
```

> 💡 **StreamController 的 close 和 StreamSubscription 的 cancel 的区别**：
> | 操作 | 谁调用 | 效果 |
> |------|--------|------|
> | `controller.close()` | **生产者** | 通知所有监听者"流结束了" |
> | `subscription.cancel()` | **消费者** | 停止接收数据（流本身继续运行） |

---

## 8.6 🔑 listen 的完整参数

```dart
StreamSubscription<T> listen(
  void Function(T data)? onData, {     // 收到数据
  Function? onError,                    // 发生错误
  void Function()? onDone,              // 流关闭
  bool? cancelOnError,                  // 出错后自动取消？
});
```

### 三种事件

```dart
controller.stream.listen(
  (data) {
    print('数据: $data');              // ← 正常数据
  },
  onError: (error, stackTrace) {
    print('错误: $error');             // ← 生产者 addError() 的结果
  },
  onDone: () {
    print('流结束了');                  // ← 生产者 close() 的结果
  },
);
```

### 🔗 Lumi-Hub 实例

`ws_service.dart` 的 WebSocket 监听用了所有三种回调：

```dart
_sub = _channel!.stream.listen(
  _onData,       // ← 收到 WebSocket 消息
  onError: _onError,   // ← WebSocket 错误（连接异常等）
  onDone: _onDone,     // ← WebSocket 关闭
);
```

```dart
void _onError(dynamic error) {
  debugPrint('[WS] 连接异常: $error');
  _setStatus(WsStatus.disconnected);
  _scheduleReconnect();             // ← 出错后安排重连
}

void _onDone() {
  debugPrint('[WS] 连接关闭');
  _setStatus(WsStatus.disconnected);
  _scheduleReconnect();             // ← 关闭后也安排重连
}
```

> 💡 WebSocket 连接就是一个 Stream：
> - 数据事件 = 收到消息
> - 错误事件 = 连接异常
> - 完成事件 = 连接关闭

---

## 8.7 Stream 变换方法

Stream 和 List 一样支持函数式操作（第 2 章学过的 `.map()` / `.where()` 等）：

```dart
var numberStream = Stream.fromIterable([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

// map：变换每个元素
var doubled = numberStream.map((n) => n * 2);

// where：过滤
var evens = numberStream.where((n) => n.isEven);

// take：只取前 N 个
var first3 = numberStream.take(3);

// skip：跳过前 N 个
var afterSkip = numberStream.skip(3);

// distinct：去重
var unique = numberStream.distinct();

// expand：一对多展开
var expanded = numberStream.expand((n) => [n, n * 10]);
```

### 链式变换

```dart
ws.authRequests
    .where((req) => req['type'] == 'AUTH_REQUIRED')  // 只处理审批请求
    .map((req) => req['payload'] as Map<String, dynamic>)  // 提取 payload
    .listen((payload) {
  showApprovalDialog(payload);
});
```

> 💡 Stream 的变换方法返回的**还是 Stream**——所以可以链式调用。  
> 这和 List 的惰性 Iterable 很像，但是是异步的。

---

## 8.8 `async*` / `yield` —— 生成器函数

`async*` 函数可以**生成 Stream**，和 `async` 函数生成 Future 类似：

### 基础用法

```dart
// async* 生成 Stream
Stream<int> countDown(int from) async* {
  for (var i = from; i >= 0; i--) {
    await Future.delayed(Duration(seconds: 1));
    yield i;          // ← 向 Stream 发送一个值
  }
}

// 使用
await for (var n in countDown(5)) {
  print(n);  // 5, 4, 3, 2, 1, 0（每秒一个）
}
```

### `yield*` —— 委托给另一个 Stream

```dart
Stream<int> allNumbers() async* {
  yield* countUp(1, 5);     // 1, 2, 3, 4, 5
  yield* countDown(5);      // 5, 4, 3, 2, 1, 0
}
```

### 同步生成器：`sync*` / `yield`

```dart
// sync* 生成 Iterable（不是 Stream）
Iterable<int> range(int start, int end) sync* {
  for (var i = start; i <= end; i++) {
    yield i;
  }
}

for (var n in range(1, 5)) {
  print(n);  // 1, 2, 3, 4, 5
}
```

| 关键字 | 返回类型 | 异步？ |
|--------|---------|--------|
| `async` | `Future<T>` | ✅ |
| `async*` | `Stream<T>` | ✅ |
| `sync*` | `Iterable<T>` | ❌ |

---

## 8.9 `await for` —— 同步风格消费 Stream

```dart
// 方式 1：listen + 回调（适合 UI 事件）
stream.listen((data) {
  print(data);
});

// 方式 2：await for（适合线性流程）
await for (var data in stream) {
  print(data);
  // 流关闭后自动退出循环
}
```

### 何时用 `listen` vs `await for`

| 场景 | 推荐 |
|------|------|
| UI 中订阅事件 | `listen`（搭配 `cancel`）|
| 处理完所有数据后继续执行 | `await for` |
| 需要 `onError` / `onDone` | `listen` |
| 简洁的循环处理 | `await for` |

---

## 8.10 Lumi-Hub 中的 Stream 架构全景

把前面的内容串起来，看 Lumi-Hub 中 Stream 的完整数据流：

```
  WebSocket 服务器
       │
       │ 发送 JSON 消息
       ↓
  WebSocketChannel.stream  ←──── 底层 Stream（单订阅）
       │
       │ _sub = stream.listen(_onData, ...)
       ↓
  WsService._onData()  ←──── 消息分发器
       │
       ├──→ _authRequestController.add(data)  ──→  authRequests Stream
       │                                              │
       │                                    ChatScreen.listen(_handleAuthRequest)
       │                                              ↓
       │                                        弹出审批对话框
       │
       ├──→ _mcpConfigController.add(data)   ──→  mcpConfigResponses Stream
       │                                              │
       │                                   McpSettingsScreen.listen(...)
       │                                              ↓
       │                                        更新 MCP 配置 UI
       │
       └──→ _personaController.add(data)    ──→  personaResponses Stream
                                                      │
                                              Sidebar.listen(...)
                                                      ↓
                                                更新人格列表 UI
```

> 💡 这是一个典型的**扇出（Fan-out）架构**：
> 1. **一个入口**：WebSocket 的单订阅 Stream
> 2. **一个分发器**：`_onData` 方法（switch-case）
> 3. **多个出口**：三个广播 StreamController
> 4. **多个消费者**：各种 UI 组件各自订阅
>
> 好处：UI 组件完全解耦——ChatScreen 不需要知道 McpSettingsScreen 的存在。

---

## 8.11 本章小结

| 概念 | C++ | Dart | 重要程度 |
|------|-----|------|----------|
| 异步值序列 | 消息队列 / Observable | `Stream<T>` | 🔑🔑🔑 |
| 创建 Stream | 手动实现 | `StreamController<T>` | 🔑🔑 |
| 单订阅 vs 广播 | — | `.broadcast()` | 🔑🔑 |
| 订阅管理 | 手动管理回调 | `StreamSubscription` + `cancel()` | 🔑🔑 |
| 关闭流 | — | `controller.close()` | 🔑 |
| 三种事件 | — | `onData` / `onError` / `onDone` | 🔑 |
| Stream 变换 | — | `.map()` / `.where()` / `.take()` | 🔑 |
| 生成器 | — | `async*` + `yield` | 🔑 |
| 消费 | — | `listen()` / `await for` | 🔑 |

### 🎯 关键要点

1. **Stream 是异步的值序列**——Future 给你一个值，Stream 给你一连串值。WebSocket、事件监听等场景的基石。
2. **单订阅 vs 广播**——默认是单订阅（只能 listen 一次），`.broadcast()` 创建广播流（多个监听者）。Lumi-Hub 的三个 StreamController 全部是广播流。
3. **`listen` + `cancel` 必须配对**——这是防止内存泄漏的铁律。在 `initState` 中 listen，在 `dispose` 中 cancel。
4. **StreamController 是生产者，StreamSubscription 是消费者**——生产者 `close()` 结束流，消费者 `cancel()` 停止接收。
5. **广播流不缓冲数据**——没有监听者时 `add()` 的数据会被丢弃。
6. **Stream 支持链式变换**——和 List 一样可以 `.map().where().listen()`。
7. **扇出架构**——一个 WebSocket 入口通过 StreamController 扇出到多个 UI 组件，实现完全解耦。

---

> 📖 下一章：[第 9 章 泛型与扩展方法](../09_generics_extensions.md) —— 深入 Dart 的泛型系统和 Extension methods。

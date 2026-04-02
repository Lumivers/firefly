---
title: "第七章 异步编程：Future、async/await"
published: 2026-03-21
pinned: false
description: "解开 Dart 异步编程的秘密。深入理解 Future、async/await 与 Completer，学习如何优雅地处理非阻塞 I/O，让你的应用响应如飞。"
tags: [Dart, 异步编程, Future, EventLoop]
category: 学习笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lonelystar"
image: ""
draft: false
---

# 第七章 异步编程：Future、async/await

> 目标：彻底理解 Dart 的异步模型。Dart 是**单线程**语言，但通过事件循环和 Future/async/await 实现高效的异步编程。这和 C++ 的多线程模型**截然不同**，是 Dart 最需要转变思维的部分。

---

## 7.1 🔑 事件循环模型——Dart 为什么是单线程的

### C++ 的并发模型

```cpp
// C++ 用多线程实现并发
std::thread t1(taskA);
std::thread t2(taskB);
t1.join();
t2.join();
// 需要互斥锁、条件变量等同步原语，容易出死锁
```

### Dart 的并发模型

Dart 只有**一个主线程**（main isolate），通过**事件循环**（Event Loop）处理异步任务。

```
┌─────────────────────────────────────────────┐
│              Dart 事件循环                    │
│                                             │
│  1. 执行同步代码（main 函数体等）              │
│  2. 检查微任务队列（microtask queue）          │
│     └─ scheduleMicrotask / Future.then 内部  │
│  3. 检查事件队列（event queue）               │
│     └─ Timer / I/O 回调 / UI 事件            │
│  4. 回到第 2 步，无限循环                     │
│                                             │
└─────────────────────────────────────────────┘
```

> 💡 **核心概念**：
> - Dart 永远**不会阻塞主线程**——所有耗时操作都通过 Future 异步完成
> - 网络请求、文件 I/O、定时器等都在底层由操作系统处理，完成后把回调放到事件队列
> - 主线程只负责**从队列取出回调并执行**
> - **没有锁！没有线程安全问题！**——因为只有一个线程在修改数据

### 为什么单线程也能高效？

```dart
// 发起网络请求不会阻塞
var future = httpClient.get(url);   // ← 立刻返回一个 Future，不等待
doOtherWork();                       // ← 可以继续做其他事
var response = await future;         // ← 需要结果时才等待
```

> 💡 类比：去餐厅点餐后你不需要站在厨房门口等。你可以刷手机（做其他事），  
> 服务员做好了会叫你（Future 完成回调）。  
> 这就是异步——你没有"多个厨师"（多线程），但你也没有傻等。

---

## 7.2 🔑 Future<T> 是什么

`Future<T>` 表示一个**将来会产生 T 类型值**的异步操作。

### 三种状态

```
Future<T>
├── 未完成（pending）——操作还在进行中
├── 成功完成（completed with value）——得到了 T 类型的结果
└── 失败完成（completed with error）──—操作出错了
```

### 创建 Future

```dart
// 1. 最常见：async 函数自动返回 Future
Future<String> fetchData() async {
  return '服务器返回的数据';
}

// 2. Future 构造函数
var future = Future(() => '计算结果');        // 异步计算
var future2 = Future.value('已有的值');        // 已完成的 Future
var future3 = Future.error(Exception('失败'));  // 已失败的 Future

// 3. Future.delayed——延迟执行
var delayed = Future.delayed(
  Duration(seconds: 2),
  () => '2 秒后的结果',
);
```

### 消费 Future

```dart
// 方式 1：async/await（推荐）
var result = await fetchData();
print(result);

// 方式 2：.then / .catchError（回调风格，不推荐）
fetchData()
  .then((result) => print(result))
  .catchError((e) => print('失败: $e'));
```

> 💡 C++ 对比：
> ```cpp
> // C++ 的 std::future
> auto future = std::async(std::launch::async, [] { return "result"; });
> auto result = future.get();  // 阻塞等待
> ```
> C++ 的 `future.get()` 是**阻塞**的——当前线程卡住直到结果返回。  
> Dart 的 `await` 是**非阻塞**的——暂停当前函数，但事件循环继续运行。

---

## 7.3 🔑 async / await 深入

### 基本规则

```dart
// async 标记函数为异步函数
// 返回类型自动变成 Future<T>
Future<int> calculateSum() async {
  var a = await fetchA();  // 暂停，等待 fetchA 完成
  var b = await fetchB();  // 暂停，等待 fetchB 完成
  return a + b;            // 最终结果包装在 Future<int> 里返回
}
```

### await 的行为

```dart
Future<void> demo() async {
  print('1. before await');
  await Future.delayed(Duration(seconds: 1));
  print('2. after await');  // 1 秒后才执行

  // await 只暂停"这个函数"，不暂停整个应用
  // 在等待期间，UI 仍然可以响应用户操作
}
```

### 串行 vs 并行

```dart
// ❌ 串行等待：总时间 = A + B + C（慢！）
var a = await fetchA();  // 等 A 完
var b = await fetchB();  // 再等 B 完
var c = await fetchC();  // 再等 C 完

// ✅ 并行等待：总时间 = max(A, B, C)（快！）
var results = await Future.wait([
  fetchA(),
  fetchB(),
  fetchC(),
]);
var a = results[0];
var b = results[1];
var c = results[2];
```

> 💡 `Future.wait()` 接收一个 `List<Future>`，同时启动所有 Future，  
> 等全部完成后返回结果列表。和 C++ 的 `std::async` + `std::future::wait_for` 类似。

### 🔗 Lumi-Hub 实例：`connect()` 的 async/await 链

`ws_service.dart` 的连接方法是一个典型的串行 async/await：

```dart
Future<void> connect() async {
  if (_status == WsStatus.connected || _status == WsStatus.connecting) return;

  // ① 等待本地存储初始化完成
  await _authInitCompleter.future;

  _setStatus(WsStatus.connecting);

  try {
    // ② 创建 WebSocket 连接
    _channel = WebSocketChannel.connect(Uri.parse(_serverUrl));
    await _channel!.ready;                       // ← 等待连接就绪

    // ③ 设置消息监听
    _sub = _channel!.stream.listen(
      _onData,
      onError: _onError,
      onDone: _onDone,
    );
    _setStatus(WsStatus.connected);

    // ④ 发送握手
    _sendHandshake();

    // ⑤ 如果有 token，自动恢复登录
    if (_token != null) {
      restoreAuth();
    }

    // ⑥ 启动心跳
    _startPing();
  } catch (e) {
    debugPrint('[WS] 连接失败: $e');
    _setStatus(WsStatus.disconnected);
    _scheduleReconnect();                        // ← 失败时安排重连
  }
}
```

> 💡 注意每一步都要依赖上一步的结果，所以必须串行 await。  
> 但在 catch 中不崩溃，而是安排重连——这是弹性设计。

### 🔗 Lumi-Hub 实例：`start()` 的多步骤编排

`bootstrap_service.dart` 的 `start()` 方法是**更长的串行 async 编排**：

```dart
Future<void> start() async {
  await _ensureLogFileReady();                          // 步骤 1
  _setStage(BootstrapStage.checkingEnv);

  final pythonOk = await _checkPythonAvailable();       // 步骤 2
  if (!pythonOk) { _fail('未检测到 Python'); return; }

  final hostOnline = await _isHostReachable();          // 步骤 3
  if (!hostOnline) {
    final started = await _startAstrBot();              // 步骤 4
    if (!started) { _fail('AstrBot 启动失败'); return; }

    final ready = await _waitHostReady(                 // 步骤 5
      const Duration(seconds: 45),
    );
    if (!ready) { _fail('等待 Host 超时'); return; }
  }

  await _ws.connect();                                  // 步骤 6
  final wsConnected = await _waitWsConnected(           // 步骤 7
    const Duration(seconds: 10),
  );
  if (!wsConnected) { _fail('WebSocket 连接失败'); return; }

  _setStage(BootstrapStage.ready);                      // 完成！
}
```

> 💡 这是一个**7 步顺序执行的启动流程**，每一步都可能失败。  
> `async/await` 让这个本来可能需要回调地狱的逻辑变得**像同步代码一样清晰**。

---

## 7.4 🔑 Completer<T> ——手动控制 Future

`Completer` 让你**手动控制** Future 的完成时机。正常的 async 函数自动管理 Future 的生命周期，但有些场景你需要把"创建 Future"和"完成 Future"分开。

### 基本用法

```dart
import 'dart:async';

Future<String> getResult() {
  var completer = Completer<String>();

  // 过一段时间后手动完成
  Timer(Duration(seconds: 2), () {
    completer.complete('结果来了');    // ← 手动完成
    // 或
    // completer.completeError(Exception('失败'));  // ← 手动失败
  });

  return completer.future;  // ← 返回 Future，但此时还没有结果
}

// 使用
var result = await getResult();  // 2 秒后得到 '结果来了'
```

> 💡 Completer 的本质：
> - `completer.future` ——一个 Future，代表"将来会有结果"
> - `completer.complete(value)` ——告诉 Future"结果来了"
> - `completer.completeError(error)` ——告诉 Future"出错了"
> - `completer.isCompleted` ——检查是否已经完成

### 何时使用 Completer？

| 场景 | 用 async/await | 用 Completer |
|------|---------------|-------------|
| 简单的线性异步流程 | ✅ | ❌ 杀鸡用牛刀 |
| 把回调 API 转成 Future | ❌ | ✅ |
| 请求-响应关联 | ❌ | ✅ 经典场景 |
| "门闩"模式（等信号） | ❌ | ✅ |
| 确保某事只做一次 | ❌ | ✅ 配合 `??=` |

### 🔗 Lumi-Hub 实例：三种 Completer 模式

#### 模式一：门闩 / 初始化屏障

`ws_service.dart` 用 Completer 做初始化同步：

```dart
class WsService extends ChangeNotifier {
  final Completer<void> _authInitCompleter = Completer<void>();

  WsService() {
    _initAuth();  // 构造时启动异步初始化
  }

  Future<void> _initAuth() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('auth_token');
    _serverUrl = prefs.getString(_serverUrlStorage) ?? _defaultUrl;
    // ...
    if (!_authInitCompleter.isCompleted) {
      _authInitCompleter.complete();   // ← 初始化完成，打开"门闩"
    }
  }

  Future<void> connect() async {
    // ↓ 等待初始化完成后才继续连接
    await _authInitCompleter.future;
    // ...开始连接...
  }
}
```

> 💡 `_authInitCompleter` 就像一道门：
> - 构造函数启动 `_initAuth()`，此时门关着
> - `connect()` 调用 `await _authInitCompleter.future`，在门前等待
> - `_initAuth()` 完成后调用 `complete()`，门打开
> - 之后再调 `await _authInitCompleter.future` 会**立即通过**（Future 已完成）

#### 模式二：请求-响应关联

`ws_service.dart` 的 `_sendAndAwaitResponse`——这是最精妙的 Completer 用法：

```dart
// 存储所有等待响应的 Completer
final Map<String, Completer<Map<String, dynamic>>> _pendingResponses = {};

Future<Map<String, dynamic>> _sendAndAwaitResponse(
  String type, Map<String, dynamic> payload, {
  Duration timeout = const Duration(seconds: 30),
}) async {
  final msgId = '${_genId()}_${DateTime.now().microsecondsSinceEpoch}';

  // ① 创建 Completer 并存入 Map
  final completer = Completer<Map<String, dynamic>>();
  _pendingResponses[msgId] = completer;

  // ② 发送请求（带 msgId）
  _send({
    'message_id': msgId,
    'type': type,
    // ...
  });

  // ③ 等待对应的响应（或超时）
  try {
    return await completer.future.timeout(timeout);
  } on TimeoutException {
    _pendingResponses.remove(msgId);
    throw Exception('$type 请求超时');
  }
}

// ④ 收到响应时，通过 msgId 找到对应的 Completer 并完成它
void _handlePendingResponse(Map<String, dynamic> data) {
  final msgId = data['message_id'] as String?;
  if (msgId == null || msgId.isEmpty) return;
  final completer = _pendingResponses.remove(msgId);
  if (completer != null && !completer.isCompleted) {
    completer.complete(data);    // ← 找到匹配的请求，完成它
  }
}
```

> 💡 这个模式的精妙之处：
> ```
> 发送请求 (msgId=abc)   ──→   网络   ──→   服务器处理
>     │                                        │
>     ↓ 创建 Completer                          ↓ 返回响应 (msgId=abc)
>     │                                        │
>   await completer.future   ←──   网络   ←──  收到响应
>     │                                        │
>     ↓ Completer.complete()                   ↓
>   拿到结果                              _handlePendingResponse
> ```
> WebSocket 是全双工的——请求和响应不是一一对应的。  
> 通过 `msgId` + `Completer` 的组合，把无序的消息流变成了有序的请求-响应。

#### 模式三：确保只做一次

`bootstrap_service.dart` 用 `??=` + Future 记忆化：

```dart
Future<void>? _startFuture;

Future<void> ensureStarted() {
  _startFuture ??= start();   // ← 只有第一次调用时才启动
  return _startFuture!;        // ← 后续调用直接返回同一个 Future
}
```

> 💡 这不是 Completer，而是另一种"确保只做一次"的模式：
> - 第一次调用 → `_startFuture` 为 null → 执行 `start()` 并赋值
> - 第二次调用 → `_startFuture` 不为 null → 直接返回（如果还在运行，await 会等它完成）

---

## 7.5 🔑 Timer 与 Timer.periodic

### 一次性定时器

```dart
import 'dart:async';

// 3 秒后执行
Timer(Duration(seconds: 3), () {
  print('3 秒到了');
});

// 取消定时器
var timer = Timer(Duration(seconds: 10), () => print('不会执行'));
timer.cancel();
```

### 周期性定时器

```dart
// 每 20 秒执行一次
var periodic = Timer.periodic(Duration(seconds: 20), (timer) {
  print('第 ${timer.tick} 次执行');
  if (timer.tick >= 5) {
    timer.cancel();  // 第 5 次后取消
  }
});
```

> 💡 C++ 对比：
> ```cpp
> // C++ 需要自己管理线程和 sleep
> std::thread([]{
>     std::this_thread::sleep_for(std::chrono::seconds(3));
>     std::cout << "3秒到了" << std::endl;
> }).detach();
> ```
> Dart 的 Timer 是事件循环原生支持的，不需要额外线程。

### 🔗 Lumi-Hub 实例

`ws_service.dart` 中用 Timer.periodic 做**心跳 Ping**：

```dart
Timer? _pingTimer;
Timer? _reconnectTimer;

void _startPing() {
  _pingTimer?.cancel();
  _pingTimer = Timer.periodic(_pingInterval, (_) {
    //                         ^^^^^^^^^^^^
    //                   每 20 秒发一次 Ping
    if (_status == WsStatus.connected) {
      _send({'type': 'PING'});
    }
  });
}
```

用一次性 Timer 做**延迟重连**：

```dart
void _scheduleReconnect() {
  if (_disposed) return;
  _reconnectTimer?.cancel();
  _reconnectTimer = Timer(_reconnectDelay, () {
    //                     ^^^^^^^^^^^^^^^
    //                3 秒后重连
    if (!_disposed) connect();
  });
}
```

### Timer 的生命周期管理

```dart
// 取消所有定时器——通常在 dispose 中调用
void disconnect() {
  _reconnectTimer?.cancel();   // ← 取消重连定时器
  _pingTimer?.cancel();        // ← 取消心跳定时器
  _sub?.cancel();              // ← 取消 Stream 订阅
  _channel?.sink.close();      // ← 关闭 WebSocket
  _channel = null;
}
```

> ⚠️ **必须记得取消 Timer！** 否则即使对象被"废弃"，Timer 回调仍然会执行，  
> 导致内存泄漏和意外行为。

---

## 7.6 `unawaited()` —— 有意忽略 Future

当你故意不 await 一个 Future 时，Dart 的 linter 会警告你。用 `unawaited()` 明确表示"这是故意的"：

```dart
import 'dart:async';

// ❌ Linter 警告：Unawaited Future
connect();

// ✅ 明确表示"我知道没有 await，这是故意的"
unawaited(connect());
```

### 🔗 Lumi-Hub 实例

`ws_service.dart` 中多处使用：

```dart
// setServerUrl：修改地址后重连，不需要等重连完成
if (reconnectIfConnected && ...) {
  disconnect();
  unawaited(connect());   // ← 启动重连但不等待
}

// _handlePersonaList：收到人格列表后加载历史，不阻塞当前流程
if (_pendingInitialHistoryAfterPersonaList) {
  _pendingInitialHistoryAfterPersonaList = false;
  unawaited(loadInitialHistory());  // ← 后台加载，不阻塞 UI
}
```

`bootstrap_service.dart` 中：

```dart
void _log(String message, {LogLevel level = LogLevel.info}) {
  final entry = LogEntry(DateTime.now(), level, message);
  _logs.add(entry);
  unawaited(_appendLogLine(entry.toString()));  // ← 写日志不需要等
  notifyListeners();
}
```

> 💡 `unawaited()` 适合"**启动后不关心结果**"的场景：
> - 后台重连
> - 日志写入
> - 预加载数据
> - 分析统计上报

---

## 7.7 Future.delayed —— 异步延迟

```dart
// 等待指定时间
await Future.delayed(Duration(seconds: 2));

// 等待后返回值
var value = await Future.delayed(Duration(seconds: 2), () => '延迟值');
```

### 🔗 Lumi-Hub 实例：轮询等待

`bootstrap_service.dart` 的 `_waitHostReady` 用 Future.delayed 做轮询：

```dart
Future<bool> _waitHostReady(Duration timeout) async {
  final stopwatch = Stopwatch()..start();
  while (stopwatch.elapsed < timeout) {
    if (await _isHostReachable()) {
      return true;                                      // 可达了，返回
    }
    await Future<void>.delayed(const Duration(milliseconds: 500));
    //                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //                   每 500ms 检查一次，不是疯狂循环
  }
  return false;  // 超时
}
```

> 💡 `Future.delayed` 在轮询中的作用是**"让出控制权"**——  
> 如果不加 delay，while 循环会疯狂执行，阻塞事件循环，UI 会卡死。  
> 加了 `await Future.delayed(...)` 后，每轮之间让事件循环有机会处理其他任务。

---

## 7.8 `.timeout()` —— 给 Future 加超时

```dart
try {
  var result = await longOperation().timeout(Duration(seconds: 10));
} on TimeoutException {
  print('操作超时');
}
```

### 🔗 Lumi-Hub 实例

`ws_service.dart` 的请求-响应带超时：

```dart
try {
  return await completer.future.timeout(timeout);
  //                             ^^^^^^^^^^^^^^^^^
  //              如果 timeout 时间内没有 complete，抛 TimeoutException
} on TimeoutException {
  _pendingResponses.remove(msgId);        // ← 清理未完成的请求
  throw Exception('$type 请求超时');       // ← 转换为友好的错误
}
```

`bootstrap_service.dart` 中探测 Host 是否可达：

```dart
final ws = await WebSocket.connect(
  _ws.serverUrl,
).timeout(const Duration(milliseconds: 1200));
//       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//       1.2 秒内连不上就算不可达
```

---

## 7.9 async/await 常见陷阱

### 陷阱一：构造函数不能是 async

```dart
class Service {
  // ❌ 编译错误！构造函数不能 async
  // Service() async { await init(); }

  // ✅ 正确做法：构造函数中启动异步操作
  Service() {
    _init();  // 启动异步初始化（不 await）
  }

  Future<void> _init() async {
    // ... 异步初始化逻辑 ...
  }
}
```

> Lumi-Hub 中 `WsService` 和 `AppSettings` 都用了这个模式。

### 陷阱二：同步方法中调用 async

```dart
// ❌ 不好的做法
void syncMethod() {
  asyncMethod();  // 忘了 await！异常不会被捕获
}

// ✅ 做法 1：方法改成 async
Future<void> nowAsync() async {
  await asyncMethod();
}

// ✅ 做法 2：显式标记 unawaited
void syncMethod() {
  unawaited(asyncMethod());  // 明确表示不等待
}
```

### 陷阱三：循环中的 await

```dart
// 串行执行（每次等上一次完成）
for (var url in urls) {
  await fetch(url);  // 一个一个来，慢！
}

// 并行执行（同时开始，等全部完成）
await Future.wait(urls.map((url) => fetch(url)));  // 快！
```

### 陷阱四：`async` 函数总是返回 Future

```dart
// 即使函数体是同步的，标记 async 后返回值也是 Future<int>
Future<int> getValue() async {
  return 42;  // 被包装成 Future<int>
}

// 如果不需要 await，就不要标记 async
int getValueSync() {
  return 42;  // 直接返回 int
}
```

---

## 7.10 本章小结

| 概念 | C++ | Dart | 重要程度 |
|------|-----|------|----------|
| 并发模型 | 多线程 + 锁 | 单线程 + 事件循环 | 🔑🔑🔑 |
| 异步类型 | `std::future<T>` | `Future<T>` | 🔑 |
| 等待结果 | `future.get()`（阻塞） | `await future`（非阻塞） | 🔑🔑 |
| async 函数 | ❌ | `async` / `await` | 🔑🔑 |
| 手动控制 Future | `std::promise` | `Completer<T>` | 🔑🔑 |
| 并行等待 | 手动管理多线程 | `Future.wait([...])` | 🔑 |
| 定时器 | `sleep` + 线程 | `Timer` / `Timer.periodic` | 🔑 |
| 超时 | 手动实现 | `.timeout(Duration)` | 🔑 |
| 忽略 Future | — | `unawaited()` | 🔑 |
| 延迟 | `sleep` | `Future.delayed()` | ⚡ |

### 🎯 关键要点

1. **Dart 是单线程的**——没有锁，没有线程安全问题。所有"并发"都是通过事件循环实现的。
2. **`await` 不阻塞线程**——它只是暂停当前函数，事件循环继续运行。UI 不会卡死。
3. **`Completer` 是高级武器**——用于请求-响应关联、初始化屏障等 async/await 无法直接解决的场景。Lumi-Hub 的 `_sendAndAwaitResponse` 是经典用法。
4. **Timer 必须取消**——在 `dispose` 中取消所有 Timer，否则会导致内存泄漏。
5. **`unawaited()` 不是偷懒**——它是一种设计声明，表示"这个操作启动后不需要等待结果"。
6. **轮询中必须加 `Future.delayed`**——否则 while 循环会阻塞事件循环，UI 卡死。
7. **并行用 `Future.wait`，串行用连续 `await`**——根据任务间是否有依赖选择。

---

> 📖 下一章：[第 8 章 Stream 与响应式编程](../08_streams.md) —— Stream 是 Dart 的另一个异步核心概念，和 Future 互补。

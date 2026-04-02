---
title: "第六章 错误处理与异常"
published: 2026-03-20
pinned: false
description: "深入 Dart 的错误处理机制。从基础的 try-catch 到自定义异常，学习如何利用结果类型与异常捕获，构建一个健壮且具有容错能力的现代化应用。"
tags: [Dart, 错误处理, 异常归因, 健壮性]
category: 学习笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lonelystar"
image: ""
draft: false
---

# 第六章 错误处理与异常

> 目标：全面掌握 Dart 的异常处理体系。Dart 的异常机制和 C++ 类似但更灵活——没有"检查异常"的概念，所有异常都是未检查的。本章会结合 Lumi-Hub 展示真实项目中**五种常见的错误处理策略**。

---

## 6.1 Exception vs Error

Dart 有两种错误大类：

| 类型 | 含义 | 应该捕获吗？ | 示例 |
|------|------|-------------|------|
| `Exception` | **可预期的异常情况** | ✅ 应该捕获并处理 | 网络超时、文件不存在、格式错误 |
| `Error` | **程序逻辑 bug** | ❌ 不应该捕获，应该修复代码 | 空指针、类型转换失败、越界 |

```dart
// Exception：可预期的
throw Exception('文件不存在');
throw FormatException('无效地址');
throw TimeoutException('请求超时');

// Error：程序 bug（不应该 catch，应该修 bug）
throw ArgumentError('参数不能为负');
throw RangeError('索引越界');
throw StateError('不应该在此状态调用');
// TypeError、AssertionError 等也属于 Error
```

> 💡 C++ 对比：
> - C++ 的 `std::exception` 同时覆盖了 Dart 的 Exception 和 Error
> - C++ 的 `std::logic_error` ≈ Dart 的 `Error`
> - C++ 的 `std::runtime_error` ≈ Dart 的 `Exception`
> - C++ 有"检查异常"的概念（通过 `noexcept` / 异常规范），Dart 没有——**所有异常都是未检查的**

### 常用内置异常

```dart
// Exception 家族（应该捕获）
Exception('通用异常');
FormatException('格式错误');       // 解析格式不对
IOException('IO 错误');           // 文件/网络 IO
TimeoutException('超时');          // 异步操作超时
HttpException('HTTP 错误');       // HTTP 请求错误

// Error 家族（不应该捕获）
ArgumentError('参数无效');
RangeError('越界');
StateError('状态错误');
TypeError();                      // 类型转换失败
UnsupportedError('不支持的操作');
ConcurrentModificationError();    // 遍历中修改集合
```

---

## 6.2 🔑 throw —— 抛出异常

### 基本用法

```dart
void validateAge(int age) {
  if (age < 0) {
    throw ArgumentError('年龄不能为负: $age');
  }
  if (age > 150) {
    throw ArgumentError('年龄不合理: $age');
  }
}
```

### 抛出 Exception

```dart
// 用 Exception 类
throw Exception('文件不存在: $filePath');

// 用 FormatException
throw const FormatException('无效地址');     // ← const 更高效

// 也可以 throw 任何对象（但不推荐）
throw '一个字符串异常';  // 技术上合法，但不推荐
throw 42;               // 也合法，但很奇怪
```

> 💡 C++ 对比：
> ```cpp
> throw std::runtime_error("文件不存在");
> throw std::invalid_argument("参数无效");
> ```
> 几乎一样的概念。但 C++ 通常只 throw `std::exception` 的子类，  
> Dart 可以 throw 任何对象（虽然不推荐）。

### 🔗 Lumi-Hub 实例：throw 的真实用法

`ws_service.dart` 中 `throw` 随处可见——每处都有明确的错误信息：

```dart
// _sendAndAwaitResponse：前置条件检查
if (_status != WsStatus.connected) {
  throw Exception('WebSocket 未连接');
}

// uploadFile：文件存在性检查
final file = File(filePath);
if (!await file.exists()) {
  throw Exception('文件不存在: $filePath');
}

// uploadFile：服务端返回异常
if (uploadId == null || uploadId.isEmpty) {
  throw Exception('服务器未返回 upload_id（请确认 Host 已更新并重启）');
}

// _normalizeServerUrl：格式校验
if (uri == null || uri.host.isEmpty) {
  throw const FormatException('无效地址');
}
if (uri.scheme != 'ws' && uri.scheme != 'wss') {
  throw const FormatException('仅支持 ws:// 或 wss://');
}
```

> 💡 注意最后两个用了 `const FormatException`——因为错误信息是编译时常量，用 `const` 更高效。

---

## 6.3 🔑 try / catch / on / finally

### 基本语法

```dart
try {
  // 可能抛异常的代码
  var result = riskyOperation();
} catch (e) {
  // 捕获所有异常
  print('出错了: $e');
}
```

### `on` —— 按类型捕获

```dart
try {
  var result = int.parse(input);
} on FormatException catch (e) {
  // 只捕获 FormatException
  print('格式错误: $e');
} on Exception catch (e) {
  // 捕获其他 Exception
  print('异常: $e');
} catch (e) {
  // 兜底：捕获所有（包括 Error）
  print('未知错误: $e');
}
```

> 💡 C++ 对比：
> ```cpp
> try {
>     // ...
> } catch (const std::format_error& e) {
>     // 按类型捕获
> } catch (const std::exception& e) {
>     // 更通用的捕获
> } catch (...) {
>     // 捕获一切
> }
> ```
> 结构几乎一样。Dart 用 `on Type catch (e)` 代替 C++ 的 `catch (const Type& e)`。

### 获取堆栈跟踪

```dart
try {
  riskyOperation();
} catch (e, stackTrace) {
  //         ^^^^^^^^^^  ← 第二个参数是堆栈跟踪
  print('异常: $e');
  print('堆栈:\n$stackTrace');
}
```

> 💡 C++ 没有原生的堆栈跟踪获取方式。  
> Dart 的 `catch (e, stackTrace)` 让调试异常变得非常方便。

### `finally` —— 无论如何都执行

```dart
var file = File('data.txt');
IOSink? sink;
try {
  sink = file.openWrite();
  sink.write('数据');
} catch (e) {
  print('写入失败: $e');
} finally {
  sink?.close();  // ← 无论成功失败都关闭文件
}
```

> 💡 `finally` 的执行保证：
> - try 成功 → 执行 finally
> - try 抛异常被 catch → 执行 finally
> - try 抛异常未被 catch → 执行 finally，然后异常继续向上传播
> - try 中有 return → **先执行 finally**，再返回

```dart
int test() {
  try {
    return 1;
  } finally {
    print('finally 执行了');  // ← 会在 return 1 之前执行！
  }
}
// 输出：finally 执行了
// 返回值：1
```

---

## 6.4 🔑 rethrow —— 重新抛出

`rethrow` 保留原始的异常和堆栈跟踪，继续向上传播：

```dart
try {
  await sendInit();
} catch (e) {
  // 处理特定的超时情况
  final err = e.toString();
  if (err.contains('请求超时')) {
    // 特殊处理：重试
    await sendInit();
  } else {
    rethrow;  // ← 不是超时？原样向上抛出
  }
}
```

### `rethrow` vs `throw e`

```dart
// ❌ throw e —— 堆栈跟踪会被重置！
try {
  dangerousCode();
} catch (e) {
  throw e;  // 丢失了原始的堆栈信息
}

// ✅ rethrow —— 保留原始堆栈
try {
  dangerousCode();
} catch (e) {
  rethrow;  // 堆栈信息完整保留
}
```

> ⚠️ **重要**：当你需要在 catch 中做一些清理工作后继续向上抛异常时，  
> **永远用 `rethrow`**，不要用 `throw e`。

### 🔗 Lumi-Hub 实例：rethrow 的真实用法

`ws_service.dart` 的 `uploadFile` 方法中使用了精确的 rethrow：

```dart
Map<String, dynamic> initResp;
try {
  initResp = await sendInit();
} catch (e) {
  final err = e.toString();
  if (err.contains('FILE_UPLOAD_INIT 请求超时')) {
    // 情况 1：是超时 → 重试一次
    debugPrint('[WS] FILE_UPLOAD_INIT 超时，正在重试一次...');
    try {
      initResp = await sendInit();
    } catch (_) {
      // 重试也失败 → 抛出更友好的错误信息
      throw Exception(
        '上传初始化超时：Host 未响应 FILE_UPLOAD_INIT。'
        '请检查 Host 是否已重启到最新代码。',
      );
    }
  } else {
    rethrow;  // 情况 2：不是超时 → 原样向上抛
    //         保留了原始异常的完整信息
  }
}
```

> 💡 这段代码展示了一个经典的**条件重试模式**：
> 1. 第一次尝试
> 2. 如果是特定错误（超时）→ 重试一次
> 3. 如果重试也失败 → 抛出用户友好的错误信息
> 4. 如果是其他错误 → `rethrow` 原样传播

---

## 6.5 🔑 五种错误处理策略

通过分析 Lumi-Hub 的代码，可以总结出五种常见的错误处理策略：

### 策略一：前置条件检查（Guard Clause）

在方法开头检查前置条件，不满足就立刻抛异常或返回：

```dart
// ws_service.dart
Future<Map<String, dynamic>> _sendAndAwaitResponse(
  String type, Map<String, dynamic> payload, {
  Duration timeout = const Duration(seconds: 30),
}) async {
  // ↓ 前置条件检查
  if (_status != WsStatus.connected) {
    throw Exception('WebSocket 未连接');
  }
  // ... 正常逻辑 ...
}
```

```dart
// ws_service.dart
void sendMessage(String text, { ... }) {
  final normalized = text.trim();
  if (_status != WsStatus.connected) return;     // ← 静默返回
  if (normalized.isEmpty && attachments.isEmpty) return;
  // ... 正常逻辑 ...
}
```

> 💡 **何时 throw vs 何时 return**：
> - 调用者**需要知道出错了** → `throw`（如 `_sendAndAwaitResponse`）
> - 调用者**不关心失败**（优雅降级） → 静默 `return`（如 `sendMessage`）

### 策略二：try-catch + 优雅降级

捕获异常后不崩溃，而是降级处理：

```dart
// bootstrap_service.dart
Future<bool> _checkPythonAvailable() async {
  try {
    final result = await Process.run('python', ['--version']);
    if (result.exitCode == 0) {
      // 成功
      return true;
    }
    // 退出码非 0
    _log('Python 检测失败', level: LogLevel.error);
    return false;
  } catch (_) {
    // 完全无法执行 python 命令（比如系统上根本没有 python）
    _log('Python 检测异常：无法执行 python --version', level: LogLevel.error);
    return false;    // ← 不崩溃，返回 false
  }
}
```

```dart
// bootstrap_service.dart
Future<bool> _isHostReachable() async {
  try {
    final ws = await WebSocket.connect(
      _ws.serverUrl,
    ).timeout(const Duration(milliseconds: 1200));
    await ws.close();
    return true;
  } catch (_) {
    return false;   // ← 连不上？返回 false，不崩溃
  }
}
```

> 💡 `catch (_)` 中的 `_` 表示"我不关心具体是什么异常"。  
> 这在"只需要知道成功还是失败"的探测性操作中很常见。

### 策略三：try-catch + 日志记录 + 继续运行

捕获异常、记录日志，但不影响主流程：

```dart
// bootstrap_service.dart
Future<void> _appendLogLine(String line) async {
  if (_logFilePath == null) return;
  try {
    final file = File(_logFilePath!);
    await file.writeAsString('$line\n', mode: FileMode.append, flush: true);
  } catch (_) {
    // 忽略磁盘写入失败，避免阻塞启动流程
    // 日志写入是"尽力而为"的操作，失败了也没关系
  }
}
```

```dart
// bootstrap_service.dart
Future<void> _ensureLogFileReady() async {
  // ...
  try {
    // 创建日志目录和文件
    final dir = Directory('$baseDir${sep}LumiHub${sep}logs');
    await dir.create(recursive: true);
    // ...
  } catch (_) {
    // 移动端目录权限或路径不可用时：
    // 不崩溃，只是放弃文件日志，保留内存日志
    _logDirectoryPath = null;
    _logFilePath = null;
  }
}
```

> 💡 这是**弹性设计**的体现：  
> 日志是辅助功能，不应该因为日志写入失败而让整个应用崩溃。  
> Lumi-Hub 的做法是：文件日志写不了就只保留内存日志。

### 策略四：条件重试

在第 6.4 节已经展示。核心模式：

```dart
try {
  result = await operation();
} catch (e) {
  if (isRetryableError(e)) {
    try {
      result = await operation();  // 重试一次
    } catch (_) {
      throw FriendlyException('操作失败，已重试');
    }
  } else {
    rethrow;  // 非可重试错误，原样上抛
  }
}
```

### 策略五：异常转换（包装更友好的错误信息）

捕获底层异常，包装成更有意义的错误信息后重新抛出：

```dart
// ws_service.dart
try {
  return await completer.future.timeout(timeout);
} on TimeoutException {
  _pendingResponses.remove(msgId);                    // ← 清理资源
  throw Exception('$type 请求超时');                    // ← 转换为更友好的异常
}
```

```dart
// ws_service.dart - uploadFile
if ((initResp['type'] as String?) == 'FILE_UPLOAD_ERROR') {
  final detail =
      (initResp['payload'] as Map<String, dynamic>?)?['detail'] as String?;
  throw Exception(detail ?? '初始化上传失败');  // ← 用服务端返回的 detail，没有就用默认
}
```

> 💡 异常转换的好处：
> - 底层异常可能过于技术化（如 `TimeoutException`）
> - 包装后的异常对调用者更有意义（如 `'CHAT_REQUEST 请求超时'`）
> - 可以在转换时**做清理工作**（如 `_pendingResponses.remove(msgId)`）

---

## 6.6 🔑 on 关键字——精确捕获

`on` 让你**只捕获特定类型**的异常：

```dart
try {
  return await completer.future.timeout(timeout);
} on TimeoutException {
  // 只捕获 TimeoutException
  _pendingResponses.remove(msgId);
  throw Exception('$type 请求超时');
}
// 其他类型的异常会直接向上传播，不会被这个 catch 拦截
```

### `on` 的多种形式

```dart
try {
  riskyCode();
} on FormatException catch (e) {
  // 捕获 FormatException，并获取异常对象 e
  print('格式错误: ${e.message}');
} on FormatException {
  // 捕获 FormatException，但不需要异常对象
  print('格式错误');
} on Exception catch (e, stackTrace) {
  // 捕获所有 Exception，获取异常和堆栈
  print('异常: $e\n$stackTrace');
} catch (e) {
  // 兜底捕获所有（包括 Error）
  print('未知: $e');
}
```

> 💡 捕获的顺序很重要——**从具体到通用**：
> 1. 先 `on FormatException`（最具体）
> 2. 再 `on Exception`（较通用）
> 3. 最后 `catch (e)`（兜底）
>
> 如果顺序反了，具体的 catch 永远不会被执行到（和 C++ 一样）。

---

## 6.7 自定义异常

### 基本自定义异常

```dart
class NetworkException implements Exception {
  final String message;
  final int? statusCode;

  const NetworkException(this.message, {this.statusCode});

  @override
  String toString() => 'NetworkException: $message (status: $statusCode)';
}

// 使用
throw NetworkException('连接超时', statusCode: 408);
```

### 继承层级

```dart
class AppException implements Exception {
  final String message;
  const AppException(this.message);

  @override
  String toString() => message;
}

class AuthException extends AppException {
  const AuthException(super.message);
}

class UploadException extends AppException {
  final String fileName;
  const UploadException(super.message, {required this.fileName});
}

// 分层捕获
try {
  await uploadFile(path);
} on UploadException catch (e) {
  print('上传 ${e.fileName} 失败: ${e.message}');
} on AuthException catch (e) {
  print('认证失败: ${e.message}');
} on AppException catch (e) {
  print('应用错误: ${e.message}');
}
```

> 💡 `implements Exception` vs `extends Exception`：
> - `implements Exception` —— 更常见，因为 `Exception` 没有太多需要继承的方法
> - `extends Exception` —— 也行，但 `Exception` 的默认构造函数不太好用
>
> 推荐用 `implements`，这样你可以完全控制构造函数。

---

## 6.8 `assert` —— 调试时的安全网

`assert` 只在**调试模式**（debug mode）下生效，发布模式下完全被忽略：

```dart
void setProgress(double value) {
  assert(value >= 0 && value <= 1, 'progress 必须在 0-1 之间，实际: $value');
  _progress = value;
}
```

> 💡 C++ 对比：
> ```cpp
> #include <cassert>
> assert(value >= 0 && value <= 1);  // Release 模式下也是被优化掉
> ```
> 几乎一样的概念和行为。

### assert 的使用场景

```dart
// ✅ 检查程序逻辑（开发时抓 bug）
assert(user != null, '用户不应该为 null');
assert(list.isNotEmpty, '列表不应该为空');

// ❌ 不要用 assert 做输入校验（release 时会被忽略）
// assert(age >= 0);  // 用户可能传负数！用 if + throw 代替
```

---

## 6.9 异步中的错误处理

异步操作的错误处理需要特别注意（第 7 章会深入讲 async/await）：

### async/await 中的 try-catch

```dart
Future<void> connect() async {
  try {
    _channel = WebSocketChannel.connect(Uri.parse(_serverUrl));
    await _channel!.ready;     // ← 这里可能抛异常
    // ... 连接成功的逻辑 ...
  } catch (e) {
    debugPrint('[WS] 连接失败: $e');
    _setStatus(WsStatus.disconnected);
    _scheduleReconnect();       // ← 连接失败？安排重连
  }
}
```

> 💡 `async` 函数中的 `try-catch` 和同步代码**完全一样**——  
> 这是 `async/await` 最大的好处之一：异步错误处理不需要特殊语法。

### Future 的 `.timeout()`

```dart
try {
  return await completer.future.timeout(timeout);
} on TimeoutException {
  // 超时了
  throw Exception('$type 请求超时');
}
```

### 未捕获的异步异常

```dart
// ❌ 危险：没有 await 的 Future 异常不会被 try-catch 捕获
try {
  riskyFuture();  // 没有 await！
} catch (e) {
  // 这个 catch 永远不会捕获 riskyFuture 里的异常
}

// ✅ 正确做法
try {
  await riskyFuture();  // 有 await
} catch (e) {
  // 可以正确捕获
}
```

> ⚠️ **常见坑**：如果 Future 没有被 await，它的异常会成为"未捕获的异常"，  
> 可能导致难以调试的问题。这也是 `unawaited()` 函数存在的原因——  
> 它明确表示"我知道这个 Future 没有 await，这是故意的"。

---

## 6.10 错误处理最佳实践

### ✅ Do（推荐）

```dart
// 1. 异常信息要有意义
throw Exception('文件不存在: $filePath');       // ✅ 包含上下文
// throw Exception('error');                    // ❌ 含义不清

// 2. 捕获具体类型
try { ... } on FormatException catch (e) { }   // ✅ 精确
// try { ... } catch (e) { }                   // ❌ 太宽泛

// 3. 用 rethrow 保留堆栈
catch (e) { cleanup(); rethrow; }              // ✅
// catch (e) { cleanup(); throw e; }           // ❌ 丢失堆栈

// 4. finally 做清理
try { ... } finally { resource.close(); }      // ✅

// 5. 前置条件检查（越早失败越好）
if (value == null) throw ArgumentError('value 不能为 null');
```

### ❌ Don't（避免）

```dart
// 1. 不要吞掉异常（除非确实不需要处理）
try { ... } catch (e) { }                      // ❌ 异常被完全忽略

// 2. 不要用 catch 捕获 Error（应该修 bug）
try { ... } on RangeError catch (e) { }        // ❌ 越界是 bug，应该改代码

// 3. 不要用异常做流程控制
try {
  var value = list[index];
} on RangeError {
  value = defaultValue;                        // ❌ 应该先检查 index
}
// 正确做法：
var value = index < list.length ? list[index] : defaultValue;  // ✅

// 4. 不要在参数中 throw（虽然语法合法）
var name = getName() ?? (throw Exception('名字不能为空'));  // ❌ 可读性差
```

### Lumi-Hub 中的正反面示例

**正面**——有意的静默捕获，加了注释说明原因：

```dart
// bootstrap_service.dart
Future<void> _appendLogLine(String line) async {
  try {
    await file.writeAsString('$line\n', mode: FileMode.append, flush: true);
  } catch (_) {
    // Ignore disk write failures to avoid blocking startup flow.
    // ← 注释清楚说明了为什么忽略异常
  }
}
```

**正面**——逐层处理，最终保证不崩溃：

```dart
// bootstrap_service.dart 的启动流程
Future<void> start() async {
  // 每一步都做了错误处理
  final pythonOk = await _checkPythonAvailable();  // 内部 try-catch → 返回 bool
  if (!pythonOk) {
    _fail('未检测到 Python');           // ← 不崩溃，进入 failed 状态
    return;
  }
  
  final started = await _startAstrBot();           // 内部 try-catch → 返回 bool
  if (!started) {
    _fail('AstrBot 启动失败');
    return;
  }
  
  // ... 每一步都有对应的失败处理 ...
}
```

> 💡 这是**防御式编程**的典范：每一步操作都有失败的可能，  
> 但通过层层 try-catch + bool 返回值，整个启动流程**永远不会崩溃**，  
> 最坏情况只是进入 `BootstrapStage.failed` 状态并显示错误信息。

---

## 6.11 本章小结

| 概念 | C++ | Dart | 重要程度 |
|------|-----|------|----------|
| 异常层级 | `std::exception` | `Exception`（可预期）vs `Error`（bug）| 🔑🔑 |
| 抛出 | `throw` | `throw` | ⚡ |
| 捕获 | `catch (Type& e)` | `on Type catch (e, stackTrace)` | 🔑 |
| 重新抛出 | `throw;` | `rethrow` | 🔑🔑 |
| 清理 | RAII / 析构函数 | `finally` | 🔑 |
| 堆栈跟踪 | ❌ 需要第三方库 | `catch (e, stackTrace)` 原生支持 | 🔑 |
| 断言 | `assert()` | `assert()` 几乎一样 | ⚡ |
| 检查异常 | `noexcept` | ❌ 不存在，全是未检查异常 | ⚡ |

### 🎯 关键要点

1. **`Exception` 该捕获，`Error` 不该捕获**——Error 表示程序有 bug，应该修代码而不是 catch。
2. **`rethrow` 保留堆栈**——永远不要用 `throw e` 代替 `rethrow`。
3. **五种策略灵活运用**：前置检查 → 优雅降级 → 日志+继续 → 条件重试 → 异常转换。
4. **异步异常必须 await**——没有 await 的 Future 异常不会被 try-catch 捕获。
5. **静默 catch 要写注释**——如果你决定忽略异常，写清楚为什么。
6. **防御式编程**——像 Lumi-Hub 的启动流程一样，每一步都有失败处理，保证应用不会裸崩。

---

> 📖 下一章：[第 7 章 异步编程：Future、async/await](../07_async.md) —— 深入 Dart 的单线程事件循环模型和异步编程范式。

---
title: "第五章 枚举、模式匹配与 Dart 3 新特性"
published: 2026-03-19
pinned: false
description: "**Dart 3 的究极进化。** 见识比 C++ 强大百倍的增强枚举，以及如何利用模式匹配优雅地解构复杂 JSON 数据。"
tags: [Dart, Enums, Pattern Matching]
category: 学习笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lonelystar"
image: ""
draft: false
---

# 第五章 枚举、模式匹配与 Dart 3 新特性

> 目标：掌握 Dart 的枚举系统（比 C++ 强大得多）和 Dart 3 引入的**模式匹配**、**switch 表达式**、**Records**、**sealed class** 等现代特性。这些特性让代码更安全、更优雅。

---

## 5.1 基础枚举

### Dart 的枚举

```dart
enum Color { red, green, blue }

var c = Color.red;
print(c);            // Color.red
print(c.name);       // 'red'   —— 自动生成的属性！
print(c.index);      // 0       —— 枚举值的索引

// 枚举的所有值
print(Color.values);  // [Color.red, Color.green, Color.blue]
```

### C++ 对比

```cpp
enum Color { red, green, blue };
// C++ 的 enum 本质上就是整数，没有 .name、.values 这些能力
// C++11 的 enum class 好一些，但仍没有反射能力
```

> 💡 Dart 枚举的优势：
> - 自带 `.name` 属性（字符串形式）
> - 自带 `.index` 属性（整数索引）
> - 自带 `.values` 静态列表（可遍历所有枚举值）
> - 可以用在 `switch` 中，编译器会检查**是否穷举**

### 🔗 Lumi-Hub 实例

项目中定义了 **6 个枚举**，覆盖了不同的使用场景：

```dart
// ws_service.dart —— WebSocket 连接状态
enum WsStatus { disconnected, connecting, connected }

// message.dart —— 消息发送者
enum MessageSender { me, ai }

// app_settings.dart —— 窗口关闭行为
enum WindowCloseAction { ask, minimize, exit }

// app_settings.dart —— 连接模式
enum ConnectionMode { localOrUsb, lan, publicTunnel }

// bootstrap_service.dart —— 启动阶段
enum BootstrapStage {
  init,
  checkingEnv,
  checkingHost,
  startingAstrBot,
  waitingHost,
  connectingWs,
  ready,
  failed,
}

// bootstrap_service.dart —— 日志级别
enum LogLevel { info, debug, warning, error }
```

---

## 5.2 🔑 增强枚举（Enhanced Enums）

Dart 2.17 起，枚举可以拥有**字段、方法、构造函数**——本质上就是带固定实例的类。

### 基础增强枚举

```dart
enum LogLevel {
  info('INFO', 0),
  debug('DEBUG', 1),
  warning('WARN', 2),
  error('ERROR', 3);        // ← 最后一个值用分号结尾

  final String label;       // ← 字段
  final int priority;

  const LogLevel(this.label, this.priority);  // ← 构造函数（必须 const）

  bool get isSerious => priority >= 2;  // ← getter

  @override
  String toString() => label;           // ← 重写方法
}

print(LogLevel.warning.label);      // WARN
print(LogLevel.warning.isSerious);  // true
print(LogLevel.info.isSerious);     // false
```

> 💡 C++ 对比：
> ```cpp
> enum class LogLevel { info, debug, warning, error };
> // C++ 的 enum class 不能有方法或字段
> // 想要类似效果只能另外建一个 struct/class
> ```
> Dart 的增强枚举相当于把 C++ 的 `enum class` + 一个辅助类合二为一了。

### 增强枚举 + 接口

```dart
enum Planet implements Comparable<Planet> {
  mercury(3.303e+23, 2.4397e6),
  venus(4.869e+24, 6.0518e6),
  earth(5.976e+24, 6.37814e6);

  final double mass;
  final double radius;

  const Planet(this.mass, this.radius);

  double get surfaceGravity => 6.67430e-11 * mass / (radius * radius);

  @override
  int compareTo(Planet other) => surfaceGravity.compareTo(other.surfaceGravity);
}
```

> 💡 枚举甚至可以 `implements` 接口！它真的就是一个限制了实例数量的类。

### 枚举配合 Map 做标签映射

```dart
// app_settings.dart 中的真实代码
const Map<WindowCloseAction, String> kWindowCloseActionLabels = {
  WindowCloseAction.ask: '每次询问',
  WindowCloseAction.minimize: '默认最小化到后台',
  WindowCloseAction.exit: '默认直接退出',
};

const Map<ConnectionMode, String> kConnectionModeLabels = {
  ConnectionMode.localOrUsb: '本机/USB 调试 (127.0.0.1)',
  ConnectionMode.lan: '局域网 (ws://192.168.x.x:8765)',
  ConnectionMode.publicTunnel: '公网/内网穿透 (wss://domain)',
};
```

> 💡 用枚举值作为 Map 的 key 是一种常见模式，用于将枚举值映射为人类可读的文本。  
> 如果用增强枚举的话，可以直接把 `label` 作为枚举字段，不需要额外的 Map。两种都行。

---

## 5.3 传统 switch 语句

先复习传统写法，再引入 Dart 3 的新写法。

### 基本 switch-case

```dart
void handleMessage(String type) {
  switch (type) {
    case 'CHAT_RESPONSE':
      handleChat();
      break;               // ← 必须 break（和 C++ 一样）
    case 'PONG':
      // 什么都不做
      break;
    default:
      print('未知类型: $type');
  }
}
```

### 多 case 合并（fall-through）

```dart
switch (type) {
  case 'MCP_CONFIG_RESPONSE':
  case 'MCP_CONFIG_UPDATE_RESPONSE':   // ← 两个 case 执行同一段代码
    _mcpConfigController.add(data);
    break;
  case 'FILE_UPLOAD_ACK':
  case 'FILE_UPLOAD_ERROR':
    _handlePendingResponse(data);
    break;
}
```

> ⚠️ Dart 的 fall-through 规则比 C++ **更严格**：
> - 空 case（没有语句）可以自动 fall-through 到下一个 case ✅
> - 有语句的 case **不能省略 break**，否则编译报错 ❌
> - C++ 中忘写 break 会默默 fall-through（常见 bug 来源），Dart 在编译期就阻止了

### 🔗 Lumi-Hub 实例：大型消息路由器

`ws_service.dart` 的 `_onData` 方法是一个经典的 switch-case 消息分发器：

```dart
void _onData(dynamic raw) {
  try {
    final data = jsonDecode(raw as String) as Map<String, dynamic>;
    final type = data['type'] as String? ?? '';

    switch (type) {
      case 'CHAT_RESPONSE':
        _handleChatResponse(data);
        break;
      case 'CHAT_STREAM_CHUNK':
        _handleChatStreamChunk(data);
        break;
      case 'CHAT_RESPONSE_END':
        _isGenerating = false;
        _generationUnlockTimer?.cancel();
        notifyListeners();
        break;
      case 'PONG':
        break;                           // ← 空操作
      case 'CONNECT':
        debugPrint('[WS] 握手确认: ${data['payload']}');
        break;
      case 'AUTH_RESPONSE':
        _handleAuthResponse(data);
        break;
      case 'AUTH_REQUIRED':
        _handleAuthRequired(data);
        break;
      case 'HISTORY_RESPONSE':
        _handleHistoryResponse(data);
        break;
      case 'MCP_CONFIG_RESPONSE':
      case 'MCP_CONFIG_UPDATE_RESPONSE':  // ← 两个 case 合并
        _mcpConfigController.add(data);
        break;
      case 'FILE_UPLOAD_ACK':
      case 'FILE_UPLOAD_ERROR':           // ← 两个 case 合并
        _handlePendingResponse(data);
        break;
      case 'PERSONA_LIST':
        _handlePersonaList(data);
        break;
      case 'PERSONA_SWITCH':
      case 'PERSONA_CLEAR_HISTORY_RESPONSE':
      case 'MESSAGE_DELETE_RESPONSE':
      case 'PERSONA_DELETE_RESPONSE':     // ← 四个 case 合并！
        _personaController.add(data);
        break;
      default:
        debugPrint('[WS] 未处理消息类型: $type');
    }
  } catch (e) {
    debugPrint('[WS] 解析消息失败: $e');
  }
}
```

> 💡 这段代码展示了 switch-case 在真实项目中的核心角色：**消息路由/分发**。  
> 每种消息类型对应不同的处理逻辑，`default` 兜底未知类型。

---

## 5.4 🔑 switch 表达式（Dart 3 重磅特性）

Dart 3 引入了 **switch 表达式**——注意不是 switch **语句**，而是可以**返回值**的表达式。

### 基本语法

```dart
// 传统 switch 语句（不返回值）
String label;
switch (level) {
  case LogLevel.info:
    label = 'INFO';
    break;
  case LogLevel.debug:
    label = 'DEBUG';
    break;
  // ... 很冗长
}

// Dart 3 switch 表达式（直接返回值！）
var label = switch (level) {
  LogLevel.info   => 'INFO',
  LogLevel.debug  => 'DEBUG',
  LogLevel.warning => 'WARN',
  LogLevel.error  => 'ERROR',
};
```

> 💡 语法差异：
> | 特征 | switch 语句 | switch 表达式 |
> |------|-----------|-------------|
> | 关键字 | `switch (...) { case: ... break; }` | `switch (...) { pattern => value, }` |
> | 分隔 | `break;` | `,`（逗号） |
> | 箭头 | 无 | `=>`（产生值）|
> | 返回值 | 无 | ✅ 整体是一个表达式 |
> | 穷举检查 | 可选（有 default 就行） | **强制穷举**（除非有 `_`） |

### 通配符 `_`

```dart
var label = switch (rawString) {
  'minimize' => WindowCloseAction.minimize,
  'exit'     => WindowCloseAction.exit,
  _          => WindowCloseAction.ask,    // ← _ 匹配所有其他情况
};
```

### 🔗 Lumi-Hub 实例：枚举序列化与反序列化

`app_settings.dart` 中用 switch 表达式做枚举和字符串的**双向转换**——这是非常典型的用法：

**反序列化（字符串 → 枚举）**：

```dart
// _load() 中：从 SharedPreferences 读取字符串，转成枚举
final closeActionRaw = prefs.getString(_windowCloseActionStorage) ?? 'ask';

_windowCloseAction = switch (closeActionRaw) {
  'minimize' => WindowCloseAction.minimize,
  'exit'     => WindowCloseAction.exit,
  _          => WindowCloseAction.ask,      // ← 默认值兜底
};

_connectionMode = switch (connectionModeRaw) {
  'lan'            => ConnectionMode.lan,
  'public_tunnel'  => ConnectionMode.publicTunnel,
  _                => ConnectionMode.localOrUsb,
};
```

**序列化（枚举 → 字符串）**：

```dart
// _save() 中：把枚举转成字符串存储
final closeActionRaw = switch (_windowCloseAction) {
  WindowCloseAction.ask      => 'ask',
  WindowCloseAction.minimize => 'minimize',
  WindowCloseAction.exit     => 'exit',
};

final connectionModeRaw = switch (_connectionMode) {
  ConnectionMode.localOrUsb    => 'local_or_usb',
  ConnectionMode.lan           => 'lan',
  ConnectionMode.publicTunnel  => 'public_tunnel',
};
```

> 💡 注意序列化方向（枚举 → 字符串）**没有 `_` 通配符**！  
> 因为 Dart 编译器知道枚举的所有值，如果你列全了就不需要 `_`。  
> **如果你将来给枚举加了新值但忘了更新这里，编译器会报错**——这就是穷举检查的威力。

### switch 表达式 vs 传统 switch 对比

```dart
// 传统写法：11行
String levelString;
switch (level) {
  case LogLevel.info:
    levelString = 'INFO';
    break;
  case LogLevel.debug:
    levelString = 'DEBUG';
    break;
  case LogLevel.warning:
    levelString = 'WARN';
    break;
  case LogLevel.error:
    levelString = 'ERROR';
    break;
}

// switch 表达式：5行
var levelString = switch (level) {
  LogLevel.info    => 'INFO',
  LogLevel.debug   => 'DEBUG',
  LogLevel.warning => 'WARN',
  LogLevel.error   => 'ERROR',
};
```

> 💡 **行数减少 55%**，而且更安全（穷举检查）。这就是 Dart 3 的生产力提升。

---

## 5.5 🔑 模式匹配（Pattern Matching）

Dart 3 的模式匹配不仅仅用于 switch——它是一套完整的**模式系统**，可以用于赋值、条件判断等多种场景。

### 模式的种类

#### ① 变量声明中的解构

```dart
// 解构 List
var [a, b, c] = [1, 2, 3];
print(a);  // 1
print(b);  // 2

// 解构 Map
var {'name': name, 'age': age} = {'name': 'Lumi', 'age': 18};
print(name);  // Lumi
print(age);   // 18
```

> 💡 C++ 17 的结构化绑定类似：
> ```cpp
> auto [a, b, c] = std::tuple{1, 2, 3};
> ```
> Dart 3 的解构支持更多类型（List、Map、Record、Object）。

#### ② if-case 模式匹配

```dart
var json = {'type': 'CHAT_RESPONSE', 'payload': {'content': 'Hello!'}};

// 用 if-case 同时做类型检查和解构
if (json case {'type': String type, 'payload': {'content': String content}}) {
  print('消息类型: $type');
  print('内容: $content');
}
```

> 💡 这一行 if-case 做了三件事：
> 1. 检查 json 是否是一个 Map
> 2. 检查是否包含 `'type'` 和 `'payload'` -> `'content'` 键
> 3. 提取值并绑定到变量 `type` 和 `content`

#### ③ switch 中的模式匹配

```dart
void processShape(Object shape) {
  switch (shape) {
    case int n when n > 0:                // ← 类型模式 + guard
      print('正整数: $n');
    case String s when s.isNotEmpty:
      print('非空字符串: $s');
    case (double x, double y):            // ← Record 模式
      print('坐标: ($x, $y)');
    case [int first, ...var rest]:         // ← List 模式 + rest
      print('首元素: $first, 剩余: $rest');
    case _:
      print('其他');
  }
}
```

### guard 子句 `when`

`when` 给模式加额外条件：

```dart
var statusCode = 404;

var message = switch (statusCode) {
  200              => '成功',
  301 || 302       => '重定向',          // ← 逻辑模式：或
  >= 400 && < 500  => '客户端错误',      // ← 关系模式：范围
  >= 500           => '服务器错误',
  _                => '未知状态码',
};
```

### 逻辑模式

```dart
var value = 42;

// 逻辑或 ||
switch (value) {
  case 1 || 2 || 3:
    print('1/2/3 中的一个');
  case > 100:
    print('大于 100');
}

// 对比传统写法（多个 case 合并）——效果一样，但新语法更紧凑
```

### Object 模式（解构对象属性）

```dart
class Point {
  final double x, y;
  const Point(this.x, this.y);
}

var point = Point(3, 4);

// 解构对象（通过 getter 匹配）
if (point case Point(x: var px, y: var py)) {
  print('坐标: ($px, $py)');
}

// 在 switch 中使用
var description = switch (point) {
  Point(x: 0, y: 0)          => '原点',
  Point(x: var x, y: 0)      => 'x 轴上，x=$x',
  Point(x: 0, y: var y)      => 'y 轴上，y=$y',
  Point(x: var x, y: var y)   => '($x, $y)',
};
```

### 实际应用：JSON 安全解析

模式匹配最大的实际价值之一是**安全地解析 JSON**：

```dart
// 传统写法：层层判空，非常冗长
void processPayload(Map<String, dynamic> data) {
  final payload = data['payload'];
  if (payload is Map<String, dynamic>) {
    final content = payload['content'];
    if (content is String && content.isNotEmpty) {
      print('内容: $content');
    }
  }
}

// 模式匹配写法：一行搞定
void processPayload(Map<String, dynamic> data) {
  if (data case {'payload': {'content': String content}} when content.isNotEmpty) {
    print('内容: $content');
  }
}
```

> 💡 对比一下感受：模式匹配把**类型检查、null 检查、值提取**融合到一个表达式里。

---

## 5.6 🔑 Records（元组类型）

Dart 3 引入了 **Records**——轻量级的不可变数据组合，类似于 Python 的 tuple。

### 基本语法

```dart
// 位置 Record（匿名字段）
var point = (3.0, 4.0);
print(point.$1);  // 3.0  —— 用 $1、$2 访问
print(point.$2);  // 4.0

// 命名 Record（具名字段）
var user = (name: 'Lumi', age: 18);
print(user.name);  // Lumi
print(user.age);   // 18

// 混合
var mixed = (42, name: 'Lumi');
print(mixed.$1);     // 42
print(mixed.name);   // Lumi
```

### Record 作为函数返回值

传统方式如果函数想返回多个值，需要定义一个类或者用 Map。Record 让这变得极其简洁：

```dart
// 传统方式：定义一个类
class ParseResult {
  final bool success;
  final String message;
  ParseResult(this.success, this.message);
}

// Record 方式：无需定义类！
(bool success, String message) parseUrl(String raw) {
  final uri = Uri.tryParse(raw);
  if (uri == null) return (false, '无效地址');
  return (true, '解析成功');
}

// 使用解构接收
var (success, message) = parseUrl('ws://127.0.0.1:8765');
print(success);  // true
print(message);  // 解析成功
```

> 💡 C++ 对比：
> ```cpp
> // C++ 用 std::pair 或 std::tuple 返回多个值
> std::pair<bool, std::string> parseUrl(const std::string& raw) {
>     return {true, "success"};
> }
> auto [success, message] = parseUrl("...");  // C++17 结构化绑定
> ```
> 概念类似，但 Dart 的 Record 支持命名字段，可读性更好。

### Record 作为类型签名

```dart
// Record 可以作为参数类型和返回类型
typedef Coordinate = (double x, double y);

Coordinate offset(Coordinate point, double dx, double dy) {
  return (x: point.x + dx, y: point.y + dy);
}

var p = (x: 3.0, y: 4.0);
var moved = offset(p, 1, 2);  // (x: 4.0, y: 6.0)
```

### Records vs 类

| 维度 | Record | Class |
|------|--------|-------|
| 定义成本 | 零（直接写） | 需要声明类 |
| 可变性 | 不可变 | 可以可变 |
| 相等性 | **值相等**（自动） | 引用相等（除非重写 `==`） |
| 方法 | ❌ 不能有方法 | ✅ |
| 适合场景 | 临时组合 2-4 个值 | 有行为的领域对象 |

```dart
// Record 自动支持值相等！
var a = (1, 2);
var b = (1, 2);
print(a == b);  // true  —— 不需要重写 ==

// 类默认引用相等
var p1 = Point(1, 2);
var p2 = Point(1, 2);
print(p1 == p2);  // false（除非重写了 ==）
```

---

## 5.7 🔑 sealed class（密封类）

`sealed class` 用于定义**封闭的类层级**——编译器知道所有可能的子类。

### 定义

```dart
sealed class Shape {}

class Circle extends Shape {
  final double radius;
  Circle(this.radius);
}

class Rectangle extends Shape {
  final double width, height;
  Rectangle(this.width, this.height);
}

class Triangle extends Shape {
  final double a, b, c;
  Triangle(this.a, this.b, this.c);
}
```

### 与 switch 的配合——穷举检查

```dart
double area(Shape shape) {
  return switch (shape) {
    Circle(radius: var r)             => 3.14159 * r * r,
    Rectangle(width: var w, height: var h) => w * h,
    Triangle(a: var a, b: var b, c: var c) => _heronArea(a, b, c),
    // 不需要 _ 通配符！编译器知道只有三个子类
  };
}
```

> 💡 如果你给 `Shape` 新增了一个子类 `Polygon` 但忘了在 switch 中处理它，  
> **编译器会报错**——"switch 不完整，缺少 Polygon 的处理"。  
> 这就是 sealed class 的核心价值：**编译时保证处理了所有情况**。

### sealed class vs enum

| 维度 | `enum` | `sealed class` |
|------|--------|----------------|
| 实例数量 | 固定的值列表 | 任意数量的实例 |
| 可以有构造函数参数 | Dart 2.17+ 可以 | ✅ 每个子类参数不同 |
| 适合场景 | 简单的标签/状态 | 带不同数据的变体 |
| 穷举检查 | ✅ | ✅ |

```dart
// 用 enum：所有状态都已知且固定
enum WsStatus { disconnected, connecting, connected }

// 用 sealed class：每种状态可以携带不同的数据
sealed class NetworkResult {}
class Success extends NetworkResult {
  final String data;
  Success(this.data);
}
class Failure extends NetworkResult {
  final String error;
  final int statusCode;
  Failure(this.error, this.statusCode);
}
class Loading extends NetworkResult {}

// 使用
String describe(NetworkResult result) => switch (result) {
  Success(data: var d)             => '成功: $d',
  Failure(error: var e, statusCode: var c) => '失败($c): $e',
  Loading()                        => '加载中...',
};
```

---

## 5.8 Dart 3 的新 switch 语句（无需 break）

除了 switch**表达式**，Dart 3 也改进了 switch**语句**——可以省略 `break`：

```dart
// Dart 3 新语法：不需要 break
switch (command) {
  case 'start':
    startService();          // ← 没有 break，不会 fall-through
  case 'stop':
    stopService();
  case 'restart':
    stopService();
    startService();
  default:
    print('未知命令');
}
```

> 💡 对比传统写法（必须写 break）：
> ```dart
> switch (command) {
>   case 'start':
>     startService();
>     break;                // ← 必须有
>   case 'stop':
>     stopService();
>     break;
> }
> ```
> Dart 3 的新语法去掉了 `break` 的心智负担——更不容易出错。

### 何时用新语句 vs 表达式？

| 场景 | 推荐写法 |
|------|---------|
| 需要**返回一个值** | switch **表达式** `var x = switch(v) { ... }` |
| 每个分支**执行多行代码** | switch **语句**（新版，无 break） |
| 还在用旧的 Dart SDK（< 3.0） | 传统 switch（带 break） |

---

## 5.9 本章小结

| 概念 | C++ | Dart | 重要程度 |
|------|-----|------|----------|
| 基础枚举 | `enum` / `enum class` | `enum` + `.name` / `.index` / `.values` | 🔑 |
| 增强枚举 | ❌ | 枚举可以有字段、方法、接口 | 🔑 |
| switch 语句 | 需要 `break` | Dart 3 可以不要 `break`，编译器防 fall-through | 🔑 |
| switch 表达式 | ❌ | `var x = switch(v) { pattern => value, }` | 🔑🔑🔑 |
| 模式匹配 | ❌ | 解构、if-case、guard `when` | 🔑🔑 |
| Records | `std::tuple` / `std::pair` | `(int, String)` 原生元组 + 命名字段 | 🔑🔑 |
| sealed class | ❌ | 编译时穷举的封闭类层级 | 🔑🔑 |
| 穷举检查 | ❌ | enum / sealed 在 switch 中强制穷举 | 🔑🔑🔑 |

### 🎯 关键要点

1. **switch 表达式**是 Dart 3 最实用的新特性——用 `var x = switch(v) { ... }` 替代冗长的 switch-case 赋值。项目中枚举的序列化/反序列化就是典型场景。
2. **穷举检查**是类型安全的核心——编译器保证你处理了所有可能的情况。加新枚举值时，忘更新的地方会编译报错。
3. **增强枚举**可以拥有字段和方法——比 C++ 的 `enum class` 强大得多。
4. **Records** 解决了"函数返回多个值"的痛点——不需要为了返回两三个值就定义一个类。
5. **sealed class** 适合"每种状态携带不同数据"的场景——比枚举更灵活，比普通继承更安全。
6. **模式匹配**让 JSON 解析、类型检查、解构赋值可以在**一个表达式**中完成——大幅减少层层嵌套的 if-else。

---

> 📖 下一章：[第 6 章 错误处理与异常](../06_error_handling.md) —— try/catch/finally、自定义异常、rethrow 等完整的错误处理体系。

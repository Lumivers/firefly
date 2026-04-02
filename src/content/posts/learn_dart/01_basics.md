---
title: "第一章 Dart 速览：与 C++ 的异同"
published: 2026-03-15
pinned: false
description: "**从 C++ 迈向 Dart 的第一步。** 快速建立 Dart 的直观印象，深入解析如何从根源上消灭“空指针崩溃”的杀手锏。"
tags: [Dart, Basics, Null Safety]
category: 学习笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lonelystar"
image: ""
draft: false
---

# 第一章 Dart 速览：与 C++ 的异同

> 目标：用最快的速度建立 Dart 的"第一印象"。如果你写过 C++，这一章会帮你把已有知识迁移过来，同时把 Dart 独有的重要概念（尤其是 **Null Safety**）讲透。

---

## 1.1 Hello, Dart —— 入口函数

### Dart

```dart
void main() {
  print('Hello, Lumi-Hub!');
}
```

### C++ 对比

```cpp
#include <iostream>
int main() {
    std::cout << "Hello, Lumi-Hub!" << std::endl;
    return 0;
}
```

> 💡 **差异点**
> - Dart 的 `main()` 返回 `void`，不需要 `return 0`。
> - 不需要 `#include`——Dart 用 `import` 引入库。
> - 不需要分号结尾？**不，Dart 需要分号**，和 C++ 一样。
> - `print()` 是顶级函数，不需要引入任何库。

### 🔗 Lumi-Hub 实例

打开 `client/lib/main.dart`，你会看到项目的入口：

```dart
void main() async {                    // ← 注意 async，后面第 7 章会讲
  WidgetsFlutterBinding.ensureInitialized();
  // ... 窗口初始化 ...
  runApp(
    MultiProvider(
      providers: [ /* ... */ ],
      child: const LumiApp(),
    ),
  );
}
```

现在你只需要知道：Dart 的一切从 `main()` 开始，和 C++ 一样。`async` 关键字先不管，后面会详细讲。

---

## 1.2 变量声明：var / final / const / late

Dart 有 **四种** 常见的变量声明方式。对比 C++：

| Dart | C++ 近似 | 含义 |
|------|----------|------|
| `var name = 'Lumi';` | `auto name = "Lumi";` | 类型推断，**可重新赋值** |
| `String name = 'Lumi';` | `std::string name = "Lumi";` | 显式类型，可重新赋值 |
| `final name = 'Lumi';` | `const auto name = "Lumi";` | 运行时确定，**赋值后不可变** |
| `const name = 'Lumi';` | `constexpr auto name = "Lumi";` | **编译时常量**，必须编译期可求值 |
| `late String name;` | ❌ 无对应 | **延迟初始化**，承诺用之前一定会赋值 |

### var —— 类型推断

```dart
var count = 42;         // 推断为 int
var message = 'hello';  // 推断为 String
count = 100;            // ✅ 可以重新赋值
// count = 'text';      // ❌ 编译错误！推断后类型锁定
```

> 💡 `var` 推断后类型就固定了，不像 Python 的动态类型。这一点和 C++ 的 `auto` 完全一致。

### final —— 运行时不可变

```dart
final now = DateTime.now();  // ✅ 运行时求值
// now = DateTime.now();     // ❌ 不能重新赋值
```

### const —— 编译时常量

```dart
const pi = 3.14159;           // ✅ 编译期就能确定
// const now = DateTime.now(); // ❌ DateTime.now() 不是编译时常量
```

### late —— 延迟初始化

```dart
late String description;
// ... 某个时刻 ...
description = '稍后才知道的值';
print(description);  // ✅ 使用前已赋值
```

> 💡 `late` 是 Dart 独有的。它告诉编译器："我保证用之前会赋值，你别报错。"  
> 如果你食言了（用之前没赋值），运行时会抛出 `LateInitializationError`。

### 🔗 Lumi-Hub 实例

看 `ws_service.dart` 的字段声明——几乎把所有声明方式都用上了：

```dart
// ——— const：编译时常量（网络配置不会变）
static const String _defaultUrl = 'ws://127.0.0.1:8765';
static const Duration _pingInterval = Duration(seconds: 20);
static const int _uploadChunkSize = 256 * 1024;

// ——— final：运行时创建后不可变
final List<ChatMessage> _messages = [];
final Completer<void> _authInitCompleter = Completer<void>();

// ——— var（显式类型）：后续会被重新赋值
WsStatus _status = WsStatus.disconnected;
bool _isAuthenticated = false;
String _serverUrl = _defaultUrl;

// ——— 可空类型（下一节讲）
String? _token;
Map<String, dynamic>? _user;
```

注意区分的逻辑：
- **永远不变**的配置 → `static const`
- **创建后不换引用**但内容可能变化（如 List 可以 add）→ `final`
- **需要重新赋值**的状态 → 普通变量
- **可能没有值**的 → 加 `?`

---

## 1.3 基本类型

| Dart 类型 | C++ 对应 | 说明 |
|-----------|----------|------|
| `int` | `int64_t` | 64 位整数（Dart VM）|
| `double` | `double` | 64 位浮点 |
| `bool` | `bool` | `true` / `false` |
| `String` | `std::string` | **不可变**的 UTF-16 字符串 |
| `num` | ❌ | `int` 和 `double` 的父类 |
| `dynamic` | `void*`（类比） | 任意类型，跳过静态类型检查 |
| `Object` | ❌ | 所有非 null 值的基类 |

> 💡 **重点差异**
> - Dart 的 `String` 是**不可变**的！每次 `+` 拼接都会创建新字符串。
> - Dart **没有** `char` 类型。单个字符就是长度为 1 的 `String`。
> - `int` 和 `double` **不能隐式转换**：`double d = 42;` 会报错，必须写 `double d = 42.0;` 或 `42.toDouble()`。
> - `dynamic` 类似 C++ 的 `void*`，但更安全：可以调用任何方法（编译器不检查），运行时如果方法不存在会抛异常。

```dart
int count = 42;
double price = 9.99;
bool isOnline = true;
String name = 'Lumi-Hub';
num flexible = 3.14;  // num 可以接收 int 或 double
```

---

## 1.4 🔑 字符串与字符串插值

这是 Dart 比 C++ **方便得多**的地方。

### 字符串插值

```dart
var name = 'Lumi-Hub';
var version = 0.9;

// 简单变量：$变量名
print('欢迎使用 $name');

// 表达式：${表达式}
print('版本号: ${version + 0.1}');
print('名称长度: ${name.length}');
```

> 💡 C++ 中你只能用 `std::format`（C++20）或者手动 `+` 拼接。  
> Dart 的字符串插值是**一等公民**语法，开箱即用。

### 多行字符串

```dart
var doc = '''
这是多行字符串。
第二行。
第三行。
''';

// 也可以用 """
var doc2 = """
同样是多行字符串。
""";
```

### 原始字符串

```dart
var path = r'D:\astrbot-develop\AstrBot';  // r 前缀：不转义 \
```

### 🔗 Lumi-Hub 实例

`ws_service.dart` 中大量使用字符串插值进行调试输出：

```dart
debugPrint('[WS] 握手确认: ${data['payload']}');
debugPrint('[WS] 连接失败: $e');
debugPrint('[WS] 未处理消息类型: $type');
debugPrint('[WS] Auth 成功，已保存 Token: $_token');
```

`bootstrap_service.dart` 中读取环境变量拼路径：

```dart
final String astrbotRoot =
    Platform.environment['LUMI_ASTRBOT_ROOT'] ??   // ← ?? 后面会讲
    'D:\\astrbot-develop\\AstrBot';
```

---

## 1.5 🔑 Null Safety —— Dart 最重要的特性

> **这是整章最重要的一节。** C++ 没有原生的空安全机制，空指针解引用是 C++ 最常见的崩溃原因之一。Dart 从语言层面消灭了这个问题。

### 核心规则

**在 Dart 中，默认情况下变量不能为 `null`。**

```dart
String name = 'Lumi';
// name = null;  // ❌ 编译错误！String 类型不接受 null
```

如果你想让一个变量可以为 null，必须显式声明：

```dart
String? name = 'Lumi';
name = null;  // ✅ String? 表示"可能为 String，也可能为 null"
```

> 💡 C++ 对比：
> ```cpp
> // C++ 中指针天然可以为 nullptr，编译器不会阻止你
> std::string* name = nullptr;  // 合法，但解引用会崩溃
> ```
> Dart 的做法是：在**编译期**就强制你处理 null 的可能性。

### 五大空安全运算符

| 运算符 | 名称 | 用法 | 含义 |
|--------|------|------|------|
| `?` | 可空声明 | `String? name` | 这个变量可能为 null |
| `?.` | 空感知访问 | `name?.length` | 如果 name 不为 null 才访问 length，否则返回 null |
| `!` | 非空断言 | `name!` | "我保证它不为 null"（如果为 null，运行时崩溃） |
| `??` | 空值合并 | `name ?? '默认值'` | 如果 name 为 null，使用右边的默认值 |
| `??=` | 空值赋值 | `name ??= '默认'` | 只在 name 为 null 时才赋值 |

### 逐个详解

#### `?` —— 可空声明

```dart
String? token;           // 可以为 null（初始值就是 null）
int? count;              // 同上
List<String>? items;     // 整个 List 可以为 null

// 注意区分：
List<String?> items2 = ['a', null, 'b'];  // List 不为 null，但元素可以
```

#### `?.` —— 空感知访问（Null-aware access）

```dart
String? name;
print(name?.length);      // 输出：null（不会崩溃！）
print(name?.toUpperCase()); // 输出：null

// 链式调用
Map<String, dynamic>? user;
var id = user?['id']?.toString();  // 每一步都安全
```

> 💡 C++ 中你只能手动检查：
> ```cpp
> if (name != nullptr) {
>     std::cout << name->length();
> }
> ```
> Dart 的 `?.` 把这个 if 判断内置到了语法里。

#### `!` —— 非空断言（危险但有时必要）

```dart
String? name = getName();
print(name!.length);  // 告诉编译器："我确定这里不是 null"
```

> ⚠️ **谨慎使用！** 如果断言失败（确实是 null），会抛出运行时异常。
> 这就像 C++ 的裸指针解引用一样危险。只有你**100% 确定**不为 null 时才用。

#### `??` —— 空值合并（最常用）

```dart
String? name;
var displayName = name ?? '匿名用户';  // name 为 null → 用 '匿名用户'

// 等价于：
var displayName2 = name != null ? name : '匿名用户';
```

#### `??=` —— 空值赋值

```dart
String? cache;
cache ??= '新值';   // 只有 cache 为 null 时才赋值
print(cache);       // 输出：新值

cache ??= '更新值'; // cache 已经不是 null 了，所以不会赋值
print(cache);       // 输出：新值（没变）
```

### 🔗 Lumi-Hub 实例：Null Safety 实战

`ws_service.dart` 中空安全运算符**无处不在**。来看几个真实例子：

```dart
// ——— ?. 安全访问 ———
// 收到 WebSocket 消息时，payload 可能不存在
final payload = data['payload'] as Map<String, dynamic>? ?? {};
final content = payload['content'] as String? ?? '';

// 如果 content 为空就不处理
if (content.isEmpty) return;
```

拆解这段代码：
1. `data['payload']` 可能返回 null → 用 `as Map<String, dynamic>?` 声明可空类型
2. `?? {}` → 如果确实是 null，就用空 Map 兜底
3. 同理 `payload['content']` 也可能 null → `as String? ?? ''` 用空字符串兜底

再看一个更复杂的例子——`??=` 的真实用法：

```dart
// bootstrap_service.dart
Future<void> ensureStarted() {
  _startFuture ??= start();  // 只有第一次调用时才启动
  return _startFuture!;       // 执行到这里时，_startFuture 一定不为 null
}
```

这里 `??=` 的作用是**保证 start() 只被调用一次**——如果 `_startFuture` 已经有值（已启动过）就不再赋值。

---

## 1.6 运算符速览

大部分运算符和 C++ 一样，这里只列 **Dart 特有或有差异** 的：

| 运算符 | 说明 | 示例 |
|--------|------|------|
| `~/` | **整除**（C++ 的 `int` 除法） | `7 ~/ 2` → `3` |
| `is` | 类型检查（C++ 的 `dynamic_cast` 判断） | `if (x is String)` |
| `is!` | 类型检查（取反） | `if (x is! int)` |
| `as` | 强制类型转换（C++ 的 `static_cast`） | `var s = x as String` |
| `..` | 级联运算符（第 3 章详讲） | `list..add(1)..add(2)` |
| `...` | 展开运算符（第 2 章详讲） | `[...list1, ...list2]` |
| `?.` | 空感知访问 | 上面已讲 |
| `??` | 空值合并 | 上面已讲 |

> 💡 C++ 中 `7 / 2` 对于 int 类型自动做整除。  
> Dart 中 `7 / 2` 返回 `3.5`（double），想要整除必须用 `~/`。

```dart
print(7 / 2);   // 输出：3.5  （Dart 中整数除法也返回 double！）
print(7 ~/ 2);  // 输出：3    （整除运算符）
print(7 % 2);   // 输出：1    （取余，和 C++ 一样）
```

### `is` 类型检查 + 智能类型提升

```dart
void process(Object value) {
  if (value is String) {
    // 在这个 if 块里，value 自动被提升为 String 类型！
    print(value.length);    // ✅ 不需要强转
    print(value.toUpperCase());
  }
}
```

> 💡 C++ 中你需要先 `dynamic_cast` 再用：
> ```cpp
> if (auto* s = dynamic_cast<std::string*>(obj)) {
>     std::cout << s->length();
> }
> ```
> Dart 的 `is` 检查后会**自动提升类型**，不用手动转。这个特性叫做 **Type Promotion**。

### 🔗 Lumi-Hub 实例

`ws_service.dart` 的 `_onData` 方法中：

```dart
void _onData(dynamic raw) {
  try {
    final data = jsonDecode(raw as String) as Map<String, dynamic>;
    //                          ^^^^^^^^^
    //                  把 dynamic 转为 String（因为我们确信 WebSocket 传的是文本）
    final type = data['type'] as String? ?? '';
    //                         ^^^^^^^^^^
    //                  可能为 null，所以用 as String?，再用 ?? '' 兜底
  } catch (e) {
    debugPrint('[WS] 解析消息失败: $e');
  }
}
```

---

## 1.7 导入（import）

C++ 用 `#include`，Dart 用 `import`：

```dart
// 导入 Dart 核心库
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

// 导入第三方包（pub.dev 上的包，在 pubspec.yaml 中声明）
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

// 导入项目内的文件（相对路径）
import '../models/message.dart';
import '../services/ws_service.dart';
```

### 导入控制

```dart
// 只导入特定内容
import 'dart:math' show min, max;

// 导入时排除特定内容
import 'dart:math' hide Random;

// 重命名（解决命名冲突）
import 'dart:ui' as ui;
import 'package:markdown/markdown.dart' as md;
```

### 🔗 Lumi-Hub 实例

看 `chat_screen.dart` 顶部的导入：

```dart
import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;                          // ← 重命名避免冲突
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:markdown/markdown.dart' as md;    // ← 两个 markdown 包用 as 区分

import '../models/message.dart';                  // ← 项目内相对路径
import '../services/ws_service.dart';
```

> 💡 C++ 的 `#include` 是文本替换（预处理器），容易导致循环引用、编译慢等问题。  
> Dart 的 `import` 是**模块化导入**，不存在循环引用问题，编译也更快。

---

## 1.8 本章小结

| 概念 | C++ | Dart | 重要程度 |
|------|-----|------|----------|
| 入口函数 | `int main()` | `void main()` | ⚡ |
| 类型推断 | `auto` | `var` | ⚡ |
| 不可变 | `const` | `final`（运行时）/ `const`（编译时）| 🔑 |
| 延迟初始化 | ❌ | `late` | 🔑 |
| 字符串插值 | ❌ 手动拼接 | `$var` / `${expr}` | 🔑 |
| 空安全 | ❌ 空指针地狱 | `?` / `!` / `??` / `?.` / `??=` | 🔑🔑🔑 |
| 整除 | `/`（int 自动整除） | `~/` | ⚡ |
| 类型检查 | `dynamic_cast` | `is` + 自动类型提升 | 🔑 |
| 模块导入 | `#include` | `import` / `show` / `hide` / `as` | 🔑 |

### 🎯 关键要点

1. **Null Safety 是 Dart 的杀手锏**——从语言层面消灭空指针崩溃。记住默认不可 null，用 `?` 声明可空。
2. **`final` vs `const`**：不确定用哪个？先用 `final`，只有确定**编译时就能算出来**的值才用 `const`。
3. **`var` 有类型推断**，推断后类型锁定，不是动态类型。
4. 字符串插值 `$` 是日常开发高频使用的语法糖，比 C++ 的拼接优雅很多。
5. `is` 检查后自动类型提升，避免了冗余的强制转换。

---

> 📖 下一章：[第 2 章 控制流与集合](../02_control_flow.md) —— 深入 Dart 的集合类型和函数式集合操作。

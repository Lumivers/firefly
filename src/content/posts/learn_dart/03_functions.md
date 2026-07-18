---
title: "第三章 函数、闭包与高阶函数"
published: 2026-03-17
pinned: false
description: "**理解 Dart 的一等公民。** 掌握命名参数、级联运算符与闭包的高级用法，写出极具表达力的代码。"
tags: [Dart, Functions, Closures]
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 第三章 函数、闭包与高阶函数

> 目标：掌握 Dart 函数的声明方式、**命名参数**（C++ 没有的重要特性）、闭包机制，以及 Dart 独有的**级联运算符**。这些是读懂 Flutter 代码的基础。

---

## 3.1 函数声明

### 基本形式

```dart
// 完整写法
int add(int a, int b) {
  return a + b;
}

// 箭头函数：函数体只有一个表达式时可以简写
int add2(int a, int b) => a + b;
```

> 💡 C++ 对比：
> ```cpp
> int add(int a, int b) { return a + b; }
> // C++ 没有箭头函数语法糖（lambda 不算，写法不同）
> ```

### `void` 函数

```dart
void greet(String name) {
  print('Hello, $name!');
}

// 箭头写法也行
void greet2(String name) => print('Hello, $name!');
```

### 返回类型可省略（但不推荐）

```dart
add(int a, int b) => a + b;  // 能跑，但返回类型不明确
```

> ⚠️ Dart 的 linter 通常会警告你加上返回类型。**建议总是写返回类型。**

### 🔗 Lumi-Hub 实例

`ws_service.dart` 中两种写法都有：

```dart
// 箭头函数：简单的一行逻辑
String _assistantMsgId(String msgId) => '${msgId}_ai';

// 完整函数：复杂逻辑
String _mergeAssistantContent(String existing, String incoming) {
  if (incoming.isEmpty) return existing;
  if (existing.isEmpty) return incoming;
  if (existing.endsWith(incoming)) return existing;

  final maxOverlap = min(existing.length, incoming.length);
  for (var overlap = maxOverlap; overlap > 0; overlap--) {
    if (existing.endsWith(incoming.substring(0, overlap))) {
      return existing + incoming.substring(overlap);
    }
  }
  return existing + incoming;
}
```

> 💡 **经验法则**：一行能写完就用 `=>`，否则用花括号 `{}`。

---

## 3.2 🔑 参数：位置参数、可选参数、命名参数

这是 Dart 和 C++ **差异最大**的地方之一。Dart 有三种参数传递方式：

### ① 必选位置参数（和 C++ 一样）

```dart
int add(int a, int b) => a + b;

add(1, 2);  // ✅ 必须按顺序传
```

### ② 可选位置参数 `[]`

```dart
String greet(String name, [String? title]) {
  if (title != null) {
    return 'Hello, $title $name!';
  }
  return 'Hello, $name!';
}

greet('Lumi');            // ✅ Hello, Lumi!
greet('Lumi', 'Captain'); // ✅ Hello, Captain Lumi!
```

> 💡 用方括号 `[]` 把可选参数包起来。可选参数可以有默认值。

### ③ 🔑 命名参数 `{}`（重点！）

```dart
void connect({
  required String host,   // required = 必须传
  int port = 8765,        // 有默认值 = 可以不传
  String? accessKey,      // 可空 = 可以不传
}) {
  print('连接 $host:$port, key=$accessKey');
}

// 调用时用 参数名: 值 的形式
connect(host: '127.0.0.1');                         // ✅ port 用默认值 8765
connect(host: '192.168.1.1', port: 9090);           // ✅ 指定 port
connect(port: 9090, host: '10.0.0.1');              // ✅ 顺序可以随意
connect(host: '10.0.0.1', accessKey: 'secret123');  // ✅ 传入可选参数
```

> 💡 **命名参数是 Flutter/Dart 的灵魂**。C++ 没有命名参数。
>
> C++ 调用 `connect("host", 8765, nullptr)` 时，你必须记住每个参数的顺序。
>
> Dart 的 `connect(host: '...', port: 8765)` 自文档化，一眼就知道每个参数是什么。

### 何时用命名参数 vs 位置参数？

| 场景 | 推荐 | 原因 |
|------|------|------|
| 参数 ≤ 2 个且含义明显 | 位置参数 | `add(1, 2)` 显然是两个加数 |
| 参数 ≥ 3 个 | 命名参数 | 避免参数顺序混乱 |
| 有很多可选配置 | 命名参数 | Flutter Widget 的标准做法 |
| 构造函数 | 命名参数 | Flutter 几乎全用命名参数 |

### 🔗 Lumi-Hub 实例

`ws_service.dart` 的 `uploadFile` 方法——混合使用位置参数和命名参数：

```dart
Future<Map<String, dynamic>> uploadFile(
  String filePath, {                              // ← 位置参数
  void Function(double progress)? onProgress,     // ← 命名参数（可空回调）
}) async {
  // ...
  onProgress?.call(0);           // 安全调用：onProgress 为 null 时跳过
  // ... 分片上传循环 ...
  onProgress?.call((index + 1) / totalChunks);   // 上报进度
  // ...
  onProgress?.call(1);           // 上传完成
  return attachment;
}
```

调用端（`chat_screen.dart`）：

```dart
final attachment = await ws.uploadFile(
  filePath,                          // 位置参数：文件路径
  onProgress: (progress) {           // 命名参数：进度回调
    setState(() {
      _uploadProgress = progress.clamp(0, 1);
    });
  },
);
```

> 💡 注意 `onProgress` 的类型：`void Function(double progress)?`
> - `void Function(double)` —— 这是一个函数类型
> - `?` —— 可空（调用者可以不传）
> - 调用时用 `onProgress?.call(...)` 安全调用

`sendMessage` 的默认参数值：

```dart
void sendMessage(String text, {
  List<Map<String, dynamic>> attachments = const [],  // ← const 空列表作为默认值
}) {
  // ...
}
```

> 💡 Dart 中默认参数值必须是**编译时常量**（`const`）。
> 所以不能写 `= []`（运行时创建的 List），必须写 `= const []`。

---

## 3.3 🔑 闭包

闭包 = **函数 + 它捕获的外部变量**。Dart 的所有函数都是闭包。

### 基础闭包

```dart
Function makeCounter() {
  var count = 0;          // 这个变量被闭包"捕获"了
  return () {
    count++;
    return count;
  };
}

var counter = makeCounter();
print(counter());  // 1
print(counter());  // 2
print(counter());  // 3 —— count 一直活着，没有被销毁
```

> 💡 C++ 对比：
> ```cpp
> auto makeCounter() {
>     int count = 0;
>     return [count]() mutable {  // 必须显式写 [count] 捕获列表
>         return ++count;
>     };
> }
> ```
> Dart 不需要写捕获列表——**自动捕获所有引用变量**。

### 闭包作为参数

```dart
var numbers = [3, 1, 4, 1, 5, 9];

// 传一个闭包给 sort
numbers.sort((a, b) => a.compareTo(b));

// 传一个闭包给 where
var big = numbers.where((n) => n > 3).toList();
```

> 💡 上一章学的 `.map()` / `.where()` / `.fold()` 的参数全部都是闭包。

### 常见闭包写法

```dart
// 无参数
() => print('hello')

// 一个参数
(x) => x * 2

// 多个参数
(a, b) => a + b

// 带类型标注（更清晰）
(int a, int b) => a + b

// 多行闭包
(String name) {
  var greeting = 'Hello, $name!';
  print(greeting);
  return greeting;
}
```

### 🔗 Lumi-Hub 实例：嵌套函数（闭包的一种形式）

`ws_service.dart` 的 `uploadFile` 中定义了一个**嵌套函数** `sendInit`：

```dart
Future<Map<String, dynamic>> uploadFile(String filePath, { ... }) async {
  // ... 外部变量 ...
  final fileName = ...;
  final mimeType = ...;
  final sizeBytes = ...;
  final sha256Hex = ...;

  // ↓ 嵌套函数：自动捕获了上面的 fileName、mimeType 等变量
  Future<Map<String, dynamic>> sendInit() {
    return _sendAndAwaitResponse(
      'FILE_UPLOAD_INIT',
      {
        'file_name': fileName,      // ← 捕获外部变量
        'mime_type': mimeType,      // ← 捕获外部变量
        'size_bytes': sizeBytes,    // ← 捕获外部变量
        'sha256': sha256Hex,        // ← 捕获外部变量
      },
      timeout: const Duration(seconds: 15),
    );
  }

  // 调用嵌套函数（支持重试）
  Map<String, dynamic> initResp;
  try {
    initResp = await sendInit();       // 第一次尝试
  } catch (e) {
    // ... 超时时重试 ...
    initResp = await sendInit();       // 第二次尝试（复用同一个函数）
  }
}
```

> 💡 嵌套函数的好处：
> 1. **避免重复代码**：`sendInit` 被调用了两次（正常 + 重试），不用复制粘贴
> 2. **自动捕获上下文**：不用把 `fileName`、`mimeType` 等作为参数传进去
> 3. **作用域隔离**：`sendInit` 只在 `uploadFile` 内部可见

---

## 3.4 🔑 高阶函数

**高阶函数** = 接收函数作为参数，或返回函数的函数。

### 函数作为参数

```dart
void repeat(int times, void Function(int) action) {
  for (var i = 0; i < times; i++) {
    action(i);
  }
}

repeat(3, (i) => print('第 $i 次'));
// 输出：第 0 次、第 1 次、第 2 次
```

### 函数作为返回值

```dart
Function(int) multiplier(int factor) {
  return (int value) => value * factor;
}

var double = multiplier(2);
var triple = multiplier(3);
print(double(5));  // 10
print(triple(5));  // 15
```

### `typedef` —— 给函数类型起别名

当函数类型很长时，用 `typedef` 让代码更可读：

```dart
// 定义函数类型别名
typedef ProgressCallback = void Function(double progress);
typedef JsonMap = Map<String, dynamic>;

// 使用别名
Future<JsonMap> uploadFile(
  String filePath, {
  ProgressCallback? onProgress,   // ← 比 void Function(double)? 更清晰
}) async {
  // ...
}
```

> 💡 C++ 对比：
> ```cpp
> using ProgressCallback = std::function<void(double)>;
> ```
> 几乎一样的思路，Dart 用 `typedef`，C++ 用 `using`。

### 🔗 Lumi-Hub 实例

`ws_service.dart` 中函数作为参数的典型用法：

```dart
// onProgress 就是一个高阶函数参数
Future<Map<String, dynamic>> uploadFile(
  String filePath, {
  void Function(double progress)? onProgress,
}) async {
  // ...
  onProgress?.call(0);                          // 开始：0%
  for (var index = 0; index < totalChunks; index++) {
    // ... 上传逻辑 ...
    onProgress?.call((index + 1) / totalChunks);  // 过程中
  }
  onProgress?.call(1);                          // 完成：100%
  return attachment;
}
```

`chat_screen.dart` 中到处都是回调函数参数：

```dart
_TopBar(
  // ...
  onCancelSelection: _toggleSelectionMode,      // ← 传方法引用
  onDeleteSelected: () => _deleteSelectedMessages(ws),  // ← 传闭包
  onOpenSidebar: isCompact
      ? () => Scaffold.of(scaffoldContext).openDrawer()
      : null,                                   // ← 条件传闭包或 null
)
```

> 💡 **方法引用** vs **闭包**：
> - `onCancelSelection: _toggleSelectionMode` —— 直接传方法引用（等价于传函数指针）
> - `onDeleteSelected: () => _deleteSelectedMessages(ws)` —— 传一个闭包（因为需要额外传 `ws` 参数）

---

## 3.5 🔑 级联运算符 `..`

级联运算符让你对**同一个对象**连续调用多个方法，无需重复写变量名。

### 基本用法

```dart
// 不用级联
var list = <int>[];
list.add(1);
list.add(2);
list.add(3);

// 用级联 —— 更简洁
var list2 = <int>[]
  ..add(1)
  ..add(2)
  ..add(3);
```

### 级联的本质

`..` 的返回值是**对象本身**，而不是方法的返回值。

```dart
var sb = StringBuffer()
  ..write('Hello')      // write() 返回 void，但 .. 返回 sb 本身
  ..write(', ')
  ..write('World!');

print(sb.toString());   // Hello, World!
```

> 💡 C++ 中也有类似的模式叫**方法链**（Method Chaining），但需要每个方法返回 `this`：
> ```cpp
> builder.setHost("127.0.0.1").setPort(8765).build();
> ```
> Dart 的级联不需要方法特殊设计——**任何方法**都可以用 `..` 级联。

### `?..` 空安全级联

```dart
List<int>? list;

list
  ?..add(1)    // 如果 list 为 null，整条链都不执行
  ..add(2)
  ..add(3);
```

### 🔗 Lumi-Hub 实例

`ws_service.dart` 的 `_handleHistoryResponse`——经典的级联清空+填充：

```dart
if (offset == 0) {
  _messages
    ..clear()           // 先清空
    ..addAll(loaded);   // 再填入新数据
}
```

不用级联的话要写成：

```dart
if (offset == 0) {
  _messages.clear();
  _messages.addAll(loaded);
}
```

`chat_screen.dart` 中的 Set 级联操作：

```dart
_selectedMessageIds
  ..clear()
  ..addAll(messageIds);
```

> 💡 级联最适合对一个对象做**多步初始化或配置**的场景。

---

## 3.6 匿名函数 vs 具名函数 vs 方法引用

Dart 中函数有三种"身份"：

```dart
// 1. 具名函数（顶级或嵌套）
void greet() => print('hello');

// 2. 匿名函数（闭包/lambda）
var greet2 = () => print('hello');

// 3. 方法引用（把实例方法/静态方法当作值传递）
var items = [3, 1, 2];
items.sort(Comparable.compare);  // 传静态方法引用
```

### 方法引用 —— 简化回调

当回调函数的签名和某个现有方法**完全匹配**时，可以直接传方法引用：

```dart
// 匿名函数写法
numbers.forEach((n) => print(n));

// 方法引用写法（更简洁）
numbers.forEach(print);     // print 的签名刚好是 void Function(Object?)
```

### 🔗 Lumi-Hub 实例

`chat_screen.dart` 中的方法引用：

```dart
_TopBar(
  onCancelSelection: _toggleSelectionMode,   // 方法引用
  // 等价于：
  // onCancelSelection: () => _toggleSelectionMode(),
)
```

```dart
_scroll.addListener(_onScrollMaybeLoadOlder);  // 方法引用作为监听器
```

---

## 3.7 本章小结

| 概念 | C++ | Dart | 重要程度 |
|------|-----|------|----------|
| 函数声明 | `int f(int)` | 相同，多了 `=>` 箭头写法 | ⚡ |
| 命名参数 | ❌ | `{required String host, int port = 80}` | 🔑🔑🔑 |
| 可选位置参数 | 重载实现 | `[int? count]` | 🔑 |
| 默认参数值 | `= value` | `= const value`（必须编译时常量） | 🔑 |
| 闭包 | `[captures](){}` 需要显式捕获 | `() {}` 自动捕获 | 🔑 |
| 嵌套函数 | Lambda 可以，具名函数不行 | ✅ 支持嵌套具名函数 | 🔑 |
| 高阶函数 | `std::function` | 函数即一等公民 | 🔑 |
| `typedef` | `using` | `typedef Fn = void Function(int)` | 🔑 |
| 级联 `..` | ❌（需方法链设计） | 原生支持，对任何对象生效 | 🔑 |
| 方法引用 | 函数指针 | 直接传方法名 | ⚡ |

### 🎯 关键要点

1. **命名参数是 Dart/Flutter 的灵魂**——几乎所有 Widget 构造函数都用命名参数。记住 `required` 表示必传，`?` 或默认值表示可选。
2. **闭包自动捕获**——不需要像 C++ 那样写捕获列表。但要注意：捕获的是**变量的引用**，不是值的拷贝。
3. **嵌套函数**是一种强大的闭包形式——用于避免重复代码（如重试逻辑）。
4. **级联 `..`** 让对同一对象的多次操作更紧凑——在初始化和配置场景中特别有用。
5. **默认参数值必须是 `const`**——所以 `= []` 要写成 `= const []`。

---

> 📖 下一章：[第 4 章 面向对象：Dart 的类体系](../04_oop.md) —— 构造函数语法糖、factory、mixin 等 Dart 独有的 OOP 特性。

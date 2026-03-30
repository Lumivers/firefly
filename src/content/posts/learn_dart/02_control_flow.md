---
title: "第二章 控制流与集合"
published: 2026-03-30
pinned: false
description: "掌握 Dart 的控制流语法和集合操作。控制流大部分和 C++ 相同（快速过），集合操作是 Dart 日常开发的（高频核心），必须吃透。"
tags: [Dart, C++, 控制流, 集合]
category: 学习笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lonelystar"
image: ""
draft: false
---

# 第二章 控制流与集合

> 目标：掌握 Dart 的控制流语法和**集合操作**。控制流大部分和 C++ 相同（快速过），集合操作是 Dart 日常开发的**高频核心**，必须吃透。

---

## 2.1 ⚡ 条件语句

### if / else —— 和 C++ 完全一样

```dart
var score = 85;

if (score >= 90) {
  print('优秀');
} else if (score >= 60) {
  print('及格');
} else {
  print('不及格');
}
```

### 三元运算符

```dart
var status = score >= 60 ? '及格' : '不及格';
```

### 🔗 Lumi-Hub 实例

`ws_service.dart` 中判断附件类型：

```dart
final isImage =
    mimeType.startsWith('image/') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.webp') ||
    lowerName.endsWith('.gif');

final prefix = isImage ? '[图片]' : '[附件]';  // ← 三元运算符
```

> 💡 和 C++ 唯一的区别：Dart 的 `if` 条件**必须是 `bool` 类型**。  
> C++ 中 `if (1)` 是合法的（非零即真），Dart 中 `if (1)` 会编译报错。

---

## 2.2 ⚡ 循环

### for 循环 —— 和 C++ 一样

```dart
for (var i = 0; i < 10; i++) {
  print(i);
}
```

### for-in 循环 —— 遍历集合

```dart
var names = ['Lumi', 'Firefly', 'AstrBot'];

for (var name in names) {
  print(name);
}
```

> 💡 C++ 对比：
> ```cpp
> for (auto& name : names) {   // C++11 range-based for
>     std::cout << name;
> }
> ```
> 几乎完全一样，只是 Dart 用 `in`，C++ 用 `:`。

### while / do-while —— 和 C++ 一样

```dart
while (condition) { /* ... */ }

do { /* ... */ } while (condition);
```

### break / continue —— 和 C++ 一样

```dart
for (var i = 0; i < 10; i++) {
  if (i == 5) break;      // 跳出循环
  if (i % 2 == 0) continue; // 跳过当前迭代
  print(i);  // 输出：1, 3
}
```

### 🔗 Lumi-Hub 实例

`ws_service.dart` 的 `_handleHistoryResponse` 中用 for-in 遍历 JSON 数组：

```dart
final loaded = <ChatMessage>[];

for (var m in messagesJson) {        // ← for-in 遍历
  final msg = m as Map<String, dynamic>;
  final isMe = msg['role'] == 'user';
  loaded.add(
    ChatMessage(
      id: msg['message_id']?.toString() ?? _genId(),
      content: msg['content'] as String? ?? '',
      sender: isMe ? MessageSender.me : MessageSender.ai,
      time: DateTime.fromMillisecondsSinceEpoch(
        (msg['timestamp'] as num).toInt(),
      ),
    ),
  );
}
```

---

## 2.3 🔑 List —— Dart 的数组

Dart 没有 C++ 的原生数组 `int arr[10]`，一律用 `List<T>`。它同时充当 C++ 的 `std::vector` 和 `std::array` 的角色。

### 创建

```dart
// 类型推断
var list1 = [1, 2, 3];               // List<int>
var list2 = ['a', 'b', 'c'];         // List<String>
var list3 = [1, 'hello', true];      // List<Object>

// 显式类型
List<int> scores = [90, 85, 70];

// 空列表（必须指定类型或让上下文推断）
var empty = <int>[];                  // 字面量语法
var empty2 = List<int>.empty(growable: true);  // 构造函数
```

> 💡 C++ 对比：
> | 操作 | C++ `std::vector<int>` | Dart `List<int>` |
> |------|----------------------|------------------|
> | 创建 | `vector<int> v = {1,2,3};` | `var v = [1, 2, 3];` |
> | 添加 | `v.push_back(4);` | `v.add(4);` |
> | 长度 | `v.size()` | `v.length` |
> | 访问 | `v[0]` / `v.at(0)` | `v[0]` |
> | 删除 | `v.erase(...)` | `v.remove(item)` / `v.removeAt(i)` |

### 常用属性和方法

```dart
var list = [10, 20, 30, 40, 50];

// 属性
list.length;        // 5
list.isEmpty;       // false
list.isNotEmpty;    // true
list.first;         // 10
list.last;          // 50
list.reversed;      // (50, 40, 30, 20, 10) — 返回 Iterable

// 增
list.add(60);                    // 末尾添加
list.addAll([70, 80]);           // 末尾添加多个
list.insert(0, 5);               // 指定位置插入
list.insertAll(0, [1, 2]);       // 指定位置插入多个

// 删
list.remove(30);                 // 按值删除（第一个匹配项）
list.removeAt(0);                // 按索引删除
list.removeLast();               // 删除末尾
list.removeWhere((n) => n > 40); // 按条件批量删除
list.clear();                    // 清空

// 查
list.contains(20);               // 是否包含
list.indexOf(20);                // 查找索引（没找到返回 -1）
list.indexWhere((n) => n > 25);  // 按条件查找索引
```

### 🔗 Lumi-Hub 实例

`ws_service.dart` 中 List 操作无处不在：

```dart
// ——— 添加消息 ———
_messages.add(placeholder);

// ——— 按条件删除：移除所有"正在输入"占位消息 ———
_messages.removeWhere((m) => m.isTyping);

// ——— 按条件查找 ———
final existingIndex = _messages.indexWhere(
  (m) => m.id == assistantId && m.sender == MessageSender.ai,
);

// ——— 头部批量插入（翻页加载旧消息）———
_messages.insertAll(0, prepend);

// ——— 防御性拷贝：暴露不可修改的 List ———
final List<ChatMessage> _messages = [];              // 内部可变
List<ChatMessage> get messages => List.unmodifiable(_messages);  // 外部只读
```

> 💡 `List.unmodifiable()` 相当于给外部暴露一个**只读视图**。  
> 调用者如果尝试 `messages.add(...)` 会抛运行时异常。  
> 这是 Dart 中常见的"内部可变、外部只读"模式。

---

## 2.4 🔑 Map —— 键值对集合

对应 C++ 的 `std::map` / `std::unordered_map`。

### 创建

```dart
// 字面量
var user = {
  'name': 'Lumi',
  'age': 18,
  'isOnline': true,
};
// 类型：Map<String, Object>

// 显式类型
Map<String, int> scores = {
  'math': 90,
  'english': 85,
};

// 空 Map
var empty = <String, dynamic>{};
```

### 常用操作

```dart
var config = <String, dynamic>{};

// 增 / 改
config['host'] = '127.0.0.1';       // 新增
config['port'] = 8765;
config['host'] = '192.168.1.1';     // 修改（同 key 覆盖）

// 查
config['host'];                      // '192.168.1.1'，不存在返回 null
config.containsKey('host');          // true
config.containsValue(8765);         // true
config.keys;                         // ('host', 'port')
config.values;                       // ('192.168.1.1', 8765)
config.entries;                      // MapEntry 的迭代器

// 删
config.remove('port');               // 删除键值对
config.clear();                      // 清空

// 合并
config.addAll({'debug': true, 'timeout': 30});

// 条件赋值
config.putIfAbsent('host', () => 'localhost');  // key 不存在时才赋值
```

> 💡 C++ 的 `std::map` 是**有序的**（红黑树），`std::unordered_map` 是无序的。  
> Dart 的 `Map` 默认是 `LinkedHashMap`——**保留插入顺序**，且基于哈希表。

### 🔗 Lumi-Hub 实例

`ws_service.dart` 构建 WebSocket 消息时大量使用 Map 字面量：

```dart
_send({
  'message_id': requestId,
  'type': 'CHAT_REQUEST',
  'source': 'client',
  'target': 'host',
  'timestamp': DateTime.now().millisecondsSinceEpoch,
  'payload': {                      // ← 嵌套 Map
    'content': contentForHost,
    'context_id': 'default',
    'persona_id': _activePersonaId,
    'attachments': attachments,     // ← Map 内嵌 List
  },
});
```

`chat_screen.dart` 中用 Map 做快速查找表：

```dart
// collection for 语法建 Map（下一节详讲）
final byId = {for (final p in personas) (p['id'] as String? ?? ''): p};
// 等价于手动循环建 Map
```

---

## 2.5 🔑 Set —— 不重复集合

对应 C++ 的 `std::set` / `std::unordered_set`。

### 创建

```dart
var tags = {'dart', 'flutter', 'lumi'};   // Set<String>

// 注意：空花括号 {} 创建的是 Map，不是 Set！
var emptyMap = {};           // Map<dynamic, dynamic>
var emptySet = <String>{};   // Set<String> —— 必须带类型
```

### 常用操作

```dart
var ids = <String>{};

ids.add('msg-001');          // 添加
ids.addAll(['msg-002', 'msg-003']); // 批量添加
ids.add('msg-001');          // 重复添加无效，Set 保证唯一

ids.contains('msg-001');     // true
ids.remove('msg-001');       // 删除

// 集合运算
var setA = {1, 2, 3};
var setB = {2, 3, 4};
setA.union(setB);            // {1, 2, 3, 4} —— 并集
setA.intersection(setB);     // {2, 3} —— 交集
setA.difference(setB);       // {1} —— 差集
```

### 🔗 Lumi-Hub 实例

`ws_service.dart` 用 Set 追踪正在流式传输的消息 ID：

```dart
final Set<String> _streamingMsgIds = <String>{};

// 标记某条消息正在流式传输
_streamingMsgIds.add(msgId);

// 传输结束后检查并移除
if (isFromStreaming) {
  _streamingMsgIds.remove(msgId);
}
```

`_handleHistoryResponse` 用 Set 做**去重**：

```dart
// 先把现有消息的 ID 收集到 Set 中
final existingIds = _messages.map((m) => m.id).toSet();

// 只保留不重复的新消息
final prepend = loaded.where((m) => !existingIds.contains(m.id)).toList();
```

> 💡 这是 Set 最经典的用途：O(1) 的去重查询。

---

## 2.6 🔑 函数式集合操作

这是 Dart 和 C++ 差别最大的地方之一。C++ 需要 `<algorithm>` 头文件加迭代器，Dart 直接在集合上链式调用。

### 核心方法一览

| 方法 | 作用 | 返回类型 | C++ 近似 |
|------|------|----------|----------|
| `.map((e) => ...)` | 映射/变换每个元素 | `Iterable<T>` | `std::transform` |
| `.where((e) => ...)` | 过滤 | `Iterable<T>` | `std::copy_if` |
| `.any((e) => ...)` | 是否存在满足条件的 | `bool` | `std::any_of` |
| `.every((e) => ...)` | 是否全部满足条件 | `bool` | `std::all_of` |
| `.fold(init, (a,b) => ...)` | 累积/聚合 | `T` | `std::accumulate` |
| `.reduce((a,b) => ...)` | 累积（无初始值） | `T` | — |
| `.toList()` | 转为 List | `List<T>` | — |
| `.toSet()` | 转为 Set | `Set<T>` | — |
| `.join(sep)` | 拼接为字符串 | `String` | — |
| `.forEach((e) => ...)` | 遍历（无返回值） | `void` | `std::for_each` |
| `.firstWhere((e) => ...)` | 找到第一个匹配的 | `T` | `std::find_if` |
| `.indexWhere((e) => ...)` | 找到第一个匹配的索引 | `int` | — |
| `.removeWhere((e) => ...)` | 按条件删除（原地修改） | `void` | `std::erase_if` (C++20) |

### 逐个讲解

#### `.map()` —— 变换

```dart
var numbers = [1, 2, 3, 4, 5];

// 每个元素乘以 2
var doubled = numbers.map((n) => n * 2);
print(doubled);        // (2, 4, 6, 8, 10) —— 注意是 Iterable，不是 List！
print(doubled.toList()); // [2, 4, 6, 8, 10] —— 转为 List
```

> ⚠️ **重要**：`.map()` 返回的是**惰性 Iterable**，不是 List！  
> 需要 List 时要加 `.toList()`。这是新手常踩的坑。

#### `.where()` —— 过滤

```dart
var scores = [45, 78, 92, 33, 88, 65];

var passed = scores.where((s) => s >= 60).toList();
print(passed);  // [78, 92, 88, 65]
```

#### `.any()` / `.every()` —— 布尔判断

```dart
var list = [2, 4, 6, 8];

list.any((n) => n > 5);     // true —— 存在大于 5 的
list.every((n) => n.isEven); // true —— 全部是偶数
```

#### `.fold()` —— 累积聚合

```dart
var numbers = [1, 2, 3, 4, 5];

var sum = numbers.fold(0, (acc, n) => acc + n);  // 初始值 0，逐个累加
print(sum);  // 15

// 拼接字符串
var names = ['Lumi', 'Hub', 'Client'];
var result = names.fold('', (acc, name) => '$acc/$name');
print(result);  // /Lumi/Hub/Client
```

> 💡 C++ 对比：
> ```cpp
> int sum = std::accumulate(numbers.begin(), numbers.end(), 0);
> ```

#### 链式调用

Dart 的集合方法可以**链式调用**，非常优雅：

```dart
var data = [
  {'name': 'Alice', 'score': 92},
  {'name': 'Bob', 'score': 45},
  {'name': 'Charlie', 'score': 78},
  {'name': 'Diana', 'score': 33},
];

// 找出及格的人名，排好序
var passedNames = data
    .where((d) => (d['score'] as int) >= 60)    // 过滤
    .map((d) => d['name'] as String)             // 提取名字
    .toList()                                    // 转 List
    ..sort();                                    // 原地排序

print(passedNames);  // [Alice, Charlie]
```

### 🔗 Lumi-Hub 实例

`ws_service.dart` 的 `_handlePersonaList`——经典的 `.map().toList()` 链：

```dart
_personas = list.map((p) => Map<String, dynamic>.from(p as Map)).toList();
//               ^^^^                                             ^^^^^^^^
//          映射：把每个元素转为 Map<String, dynamic>          转为 List
```

`chat_screen.dart` 的 `_orderedPersonas`——`.map().where().toList()` 三连：

```dart
final newOrder = ordered
    .map((p) => p['id'] as String? ?? '')    // 提取 ID
    .where((id) => id.isNotEmpty)            // 过滤掉空 ID
    .toList();                               // 转为 List
```

`ws_service.dart` 的去重逻辑——`.map().toSet()` 组合：

```dart
final existingIds = _messages.map((m) => m.id).toSet();
//                             ^^^^             ^^^^^^^^
//                     提取每条消息的 id     去重并转为 Set
```

---

## 2.7 🔑 集合 if 与集合 for

这是 Dart **特有的**集合构建语法，C++ 完全没有。它允许你在**集合字面量内部**使用条件判断和循环。

### 集合 if

```dart
var isAdmin = true;

var menu = [
  '首页',
  '设置',
  if (isAdmin) '管理后台',   // ← 条件成立时才包含这个元素
];
print(menu);  // [首页, 设置, 管理后台]
```

> 💡 C++ 中你只能先创建集合再 if-push_back，Dart 可以直接在字面量里写。

### 集合 for

```dart
var ids = [1, 2, 3];

var items = [
  '固定项',
  for (var id in ids) '项目-$id',   // ← 循环生成元素
];
print(items);  // [固定项, 项目-1, 项目-2, 项目-3]
```

### Map 中的 collection for

```dart
var personas = [
  {'id': 'default', 'name': '默认'},
  {'id': 'firefly', 'name': '流萤'},
];

// 用 collection for 一行建立 id → persona 的查找表
var byId = {
  for (final p in personas)
    (p['id'] as String): p,
};
// 结果：{'default': {...}, 'firefly': {...}}
```

### 🔗 Lumi-Hub 实例

`chat_screen.dart` 的 `_orderedPersonas` 方法中，用 collection for 构建查找 Map：

```dart
final byId = {for (final p in personas) (p['id'] as String? ?? ''): p};
```

这一行代码等价于：

```dart
final byId = <String, Map<String, dynamic>>{};
for (final p in personas) {
  final id = p['id'] as String? ?? '';
  byId[id] = p;
}
```

> 💡 collection for 让代码更紧凑。在 Flutter 的 Widget 构建中尤其常见，比如动态生成一组按钮。

---

## 2.8 展开运算符 `...` 和 `...?`

### `...` —— 把一个集合"展开"到另一个集合中

```dart
var base = [1, 2, 3];
var extended = [0, ...base, 4, 5];
print(extended);  // [0, 1, 2, 3, 4, 5]
```

> 💡 C++ 中你需要 `insert(end, begin, end)` 来拼接两个 vector。  
> Dart 只需要 `...`。

### `...?` —— 空安全展开

```dart
List<int>? maybeList;

var result = [1, 2, ...?maybeList, 3];  // 如果 maybeList 为 null，就不展开
print(result);  // [1, 2, 3]
```

### 实用场景：合并配置

```dart
var defaultHeaders = {'Content-Type': 'application/json'};
var authHeaders = {'Authorization': 'Bearer token123'};

var allHeaders = {
  ...defaultHeaders,
  ...authHeaders,
  'X-Custom': 'value',
};
// 结果：三个 Map 合并成一个
```

---

## 2.9 本章小结

| 概念 | C++ | Dart | 重要程度 |
|------|-----|------|----------|
| if/else/for/while | 基本相同 | 基本相同（if 强制 bool） | ⚡ |
| 数组/列表 | `std::vector` | `List<T>` 字面量 `[]` | 🔑 |
| 键值对 | `std::map` | `Map<K,V>` 字面量 `{}` | 🔑 |
| 无重复集合 | `std::set` | `Set<T>` 字面量 `{}` | 🔑 |
| 函数式操作 | `<algorithm>` + 迭代器 | `.map()` / `.where()` 链式调用 | 🔑🔑 |
| 集合 if/for | ❌ | `[if (...) x, for (...) y]` | 🔑 |
| 展开运算符 | ❌ | `...` / `...?` | 🔑 |

### 🎯 关键要点

1. **`.map()` 返回的是惰性 Iterable**，需要具体化时加 `.toList()` 或 `.toSet()`。这是最常见的新手坑。
2. **Dart 的 Map 保留插入顺序**（`LinkedHashMap`），和 C++ 的 `std::map`（按 key 排序）不同。
3. **Set 用于去重和 O(1) 查找**，在消息去重、ID 追踪等场景非常实用。
4. **集合 if / for 和展开运算符**是 Dart 特有的语法糖——在 Flutter 构建 Widget 列表时会大量使用。
5. **链式调用**（`.where().map().toList()`）是 Dart 的惯用写法，比 C++ 的 `<algorithm>` 简洁得多。

---

> 📖 下一章：[第 3 章 函数、闭包与高阶函数](./03_functions.md) —— 深入命名参数、闭包和级联运算符。

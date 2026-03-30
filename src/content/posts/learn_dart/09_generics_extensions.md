---
title: "第九章 泛型与扩展方法"
published: 2026-03-30
pinned: false
description: "目标：掌握 Dart 的泛型系统和 Extension methods。泛型让代码类型安全且可复用，Extension methods 让你给任何已有类型添加新方法——包括你无法修改源码的第三方库。"
tags: [Dart, C++, 泛型, 扩展方法]
category: 学习笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lonelystar"
image: ""
draft: false
---
# 第九章 泛型与扩展方法

> 目标：掌握 Dart 的泛型系统和 Extension methods。泛型让代码类型安全且可复用，Extension methods 让你给**任何已有类型**添加新方法——包括你无法修改源码的第三方库。

---

## 9.1 🔑 泛型基础——为什么需要泛型

### 没有泛型的世界

```dart
// 只能存 int 的栈
class IntStack {
  final _items = <int>[];
  void push(int item) => _items.add(item);
  int pop() => _items.removeLast();
}

// 只能存 String 的栈
class StringStack {
  final _items = <String>[];
  void push(String item) => _items.add(item);
  String pop() => _items.removeLast();
}

// 还要 double 栈、bool 栈... 复制粘贴噩梦
```

### 有泛型的世界

```dart
class Stack<T> {                    // ← T 是类型参数
  final _items = <T>[];
  void push(T item) => _items.add(item);
  T pop() => _items.removeLast();
  bool get isEmpty => _items.isEmpty;
}

var intStack = Stack<int>();        // T = int
intStack.push(42);
int value = intStack.pop();        // 返回类型是 int，类型安全

var stringStack = Stack<String>(); // T = String
stringStack.push('hello');
String text = stringStack.pop();   // 返回类型是 String
```

> 💡 C++ 对比：
> ```cpp
> template<typename T>
> class Stack {
>     std::vector<T> items;
>     void push(T item) { items.push_back(item); }
>     T pop() { T t = items.back(); items.pop_back(); return t; }
> };
> Stack<int> intStack;
> ```
> 概念完全一样。Dart 用 `<T>`，C++ 用 `template<typename T>`。
> 但 Dart 的泛型是**具化的（reified）**——运行时保留类型信息；  
> C++ 的模板是**编译时展开**的——运行时没有类型参数信息。

---

## 9.2 泛型类

### 你已经在用的泛型类

前面学过的很多类型其实都是泛型：

```dart
List<int> numbers = [1, 2, 3];           // List<T>
Map<String, dynamic> json = {};          // Map<K, V>
Set<String> tags = {'dart', 'flutter'};  // Set<T>
Future<String> data = fetchData();       // Future<T>
Stream<int> counter = countUp();         // Stream<T>
Completer<void> gate = Completer();      // Completer<T>
```

### 自定义泛型类

```dart
// 一个泛型的结果包装器
class Result<T> {
  final T? value;
  final String? error;

  Result.success(this.value) : error = null;
  Result.failure(this.error) : value = null;

  bool get isSuccess => error == null;

  T get valueOrThrow {
    if (value == null) throw Exception(error);
    return value as T;
  }
}

// 使用
var result = Result<int>.success(42);
print(result.valueOrThrow);  // 42

var fail = Result<String>.failure('网络错误');
print(fail.isSuccess);       // false
```

### 多类型参数

```dart
// 两个类型参数
class Pair<A, B> {
  final A first;
  final B second;
  Pair(this.first, this.second);

  @override
  String toString() => '($first, $second)';
}

var pair = Pair<String, int>('age', 25);
print(pair.first);   // 'age'（类型是 String）
print(pair.second);  // 25（类型是 int）
```

> 💡 Dart 3 的 Records 语法 `(String, int)` 在很多场景下可以替代 `Pair` 类。  
> 但自定义泛型类在需要方法时仍然有价值。

---

## 9.3 🔑 泛型嵌套——真实项目中的复杂类型

Lumi-Hub 的代码中有大量的泛型嵌套，初学者看到可能会发懵。让我们逐层拆解。

### 🔗 Lumi-Hub 实例：从简单到复杂

**层级 1：简单泛型**

```dart
final List<ChatMessage> _messages = [];
// 含义：一个列表，元素类型是 ChatMessage
```

**层级 2：泛型 + 可空**

```dart
Map<String, dynamic>? _user;
// 含义：一个可能为 null 的 Map，key 是 String，value 是 dynamic
```

**层级 3：二层嵌套**

```dart
final Map<String, int> _historyRequestOffsets = <String, int>{};
// 含义：一个 Map，key 是 String（消息 ID），value 是 int（偏移量）
```

**层级 4：三层嵌套（重量级）**

```dart
final Map<String, Completer<Map<String, dynamic>>> _pendingResponses = {};
```

这个看着吓人，拆解一下：

```
Map<                              ← 最外层：Map
  String,                         ← Key：消息 ID（字符串）
  Completer<                      ← Value：一个 Completer
    Map<String, dynamic>          ← Completer 完成时产出的值类型
  >
>
```

翻译成人话：
> "一个映射表，通过消息 ID 找到对应的 Completer，  
> 这个 Completer 在未来会产出一个 JSON 对象（`Map<String, dynamic>`）。"

**层级 4 另一个：**

```dart
final Map<String, Completer<void>> _historyRequestCompleters = <String, Completer<void>>{};
```

拆解：

```
Map<
  String,              ← Key：消息 ID
  Completer<void>      ← Value：只通知完成，不产出值
>
```

**层级 3：StreamController 泛型**

```dart
final _authRequestController = StreamController<Map<String, dynamic>>.broadcast();
```

拆解：

```
StreamController<           ← 控制器
  Map<String, dynamic>      ← 流中每个事件的类型：一个 JSON 对象
>.broadcast()               ← 广播模式
```

### 拆解思路总结

> 💡 遇到复杂泛型嵌套时，**从外往内逐层读**：
> 1. 最外层是什么容器？（Map / List / Completer / StreamController）
> 2. 类型参数是什么？
> 3. 如果类型参数本身还是泛型，继续往里拆
> 4. 翻译成自然语言，确认理解

---

## 9.4 泛型函数

函数也可以有泛型参数：

```dart
// 泛型函数
T firstOrDefault<T>(List<T> list, T defaultValue) {
  return list.isNotEmpty ? list.first : defaultValue;
}

// 调用时可以显式指定类型
var result = firstOrDefault<int>([1, 2, 3], 0);

// 也可以让 Dart 自动推断
var result2 = firstOrDefault([1, 2, 3], 0);  // T 推断为 int
```

### 更实用的泛型函数

```dart
// 从 JSON Map 中安全提取值
T? jsonGet<T>(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is T) return value;
  return null;
}

// 使用
var user = {'name': 'Lumi', 'age': 18};
String? name = jsonGet<String>(user, 'name');   // 'Lumi'
int? age = jsonGet<int>(user, 'age');            // 18
int? missing = jsonGet<int>(user, 'phone');      // null
String? wrong = jsonGet<String>(user, 'age');    // null（age 是 int，不是 String）
```

> 💡 C++ 对比：
> ```cpp
> template<typename T>
> T firstOrDefault(const std::vector<T>& list, T defaultValue) {
>     return list.empty() ? defaultValue : list.front();
> }
> ```
> 同样的道理，Dart 不用写 `template<>`，直接在函数名后加 `<T>`。

---

## 9.5 🔑 泛型约束 `extends`

有时候你需要限制泛型参数的类型范围：

### 基本约束

```dart
// T 必须是 num 的子类型（int 或 double）
T findMax<T extends num>(List<T> list) {
  T max = list.first;
  for (var item in list) {
    if (item > max) max = item;  // ← 因为 T extends num，所以可以用 >
  }
  return max;
}

findMax<int>([1, 5, 3]);       // ✅ 5
findMax<double>([1.1, 5.5]);   // ✅ 5.5
// findMax<String>(['a', 'b']); // ❌ 编译错误：String 不是 num 的子类
```

### 约束为接口

```dart
// T 必须实现 Comparable 接口
T findMin<T extends Comparable<T>>(List<T> list) {
  T min = list.first;
  for (var item in list) {
    if (item.compareTo(min) < 0) min = item;
  }
  return min;
}

findMin<int>([3, 1, 2]);           // ✅ int 实现了 Comparable
findMin<String>(['c', 'a', 'b']);   // ✅ String 也实现了 Comparable
```

> 💡 C++ 对比（C++20 Concepts）：
> ```cpp
> template<typename T>
> requires std::totally_ordered<T>
> T findMin(const std::vector<T>& list) { ... }
> ```
> Dart 的 `<T extends X>` 比 C++20 之前的模板约束可读性好得多。

### 🔗 Lumi-Hub 实例：ThemeExtension 的泛型约束

`ThemeExtension` 的声明（Flutter 框架源码）：

```dart
abstract class ThemeExtension<T extends ThemeExtension<T>> {
  //                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //                  T 必须是 ThemeExtension<T> 的子类
  //                       （自引用泛型，Curiously Recurring Template Pattern）
  T copyWith();
  T lerp(T? other, double t);
}
```

Lumi-Hub 的实现：

```dart
class LumiColors extends ThemeExtension<LumiColors> {
  //                                    ^^^^^^^^^^
  //                    T = LumiColors（满足 T extends ThemeExtension<T>）

  @override
  LumiColors copyWith({ ... }) { ... }   // 返回类型是 LumiColors（不是 Object）

  @override
  LumiColors lerp(LumiColors? other, double t) { ... }  // 参数类型也是 LumiColors
}
```

> 💡 这个 `T extends ThemeExtension<T>` 的模式叫 **CRTP（Curiously Recurring Template Pattern）**：
> ```
> ThemeExtension<T extends ThemeExtension<T>>
>                ↑                        ↑
>                │                        │
>                └── T 就是子类自身 ────────┘
> ```
> 效果：`copyWith()` 和 `lerp()` 的返回类型自动变成子类类型（`LumiColors`），  
> 而不是基类类型（`ThemeExtension`）——这保证了类型安全。
>
> C++ 程序员对 CRTP 应该很熟悉：
> ```cpp
> template<typename T>
> class Base { T clone() { return static_cast<T&>(*this); } };
> class Derived : public Base<Derived> { };
> ```

---

## 9.6 泛型的运行时类型

Dart 的泛型是**具化的（reified）**——运行时保留类型信息：

```dart
var list = <int>[1, 2, 3];
print(list is List<int>);     // true  ← 运行时知道这是 List<int>
print(list is List<String>);  // false
print(list is List<Object>);  // true  （int 是 Object 的子类型）
print(list.runtimeType);      // List<int>
```

> 💡 C++ 对比：
> ```cpp
> std::vector<int> list = {1, 2, 3};
> // C++ 运行时无法判断 vector 的模板参数
> // typeid(list) 只给你 vector<int> 的 mangled name
> ```
> Java 的泛型是**擦除的**——运行时 `List<int>` 和 `List<String>` 是同一个类型。  
> Dart 的泛型是**具化的**——运行时可以区分。这更安全也更直观。

### 泛型协变

```dart
// Dart 的泛型集合是协变的
List<int> ints = [1, 2, 3];
List<num> nums = ints;    // ✅ List<int> 是 List<num> 的子类型（因为 int 是 num 的子类型）
List<Object> objs = ints; // ✅ 也行

// 但这可能导致运行时错误
nums.add(3.14);  // 运行时错误！实际是 List<int>，不接受 double
```

> ⚠️ Dart 的泛型协变在**编译时不检查**某些不安全操作（如上面的 `nums.add(3.14)`），  
> 但会在**运行时**抛出 `TypeError`。这是 Dart 的设计取舍。

---

## 9.7 `dynamic` vs 泛型

```dart
// ❌ 用 dynamic：丢失类型信息，不安全
dynamic fetchData() { return 42; }
var data = fetchData();
data.nonExistentMethod();  // 编译不报错，运行时崩溃！

// ✅ 用泛型：保留类型信息，安全
T fetchData<T>(String key) { ... }
int data = fetchData<int>('count');
// data.nonExistentMethod();  // 编译就报错
```

### `Map<String, dynamic>` 的必要性

```dart
// JSON 反序列化时，值的类型不确定，必须用 dynamic
final data = jsonDecode(raw) as Map<String, dynamic>;
// data['name'] → dynamic（可能是 String、int 或 null）
// 需要手动 as 转换
final name = data['name'] as String? ?? '';
```

> 💡 `Map<String, dynamic>` 在 Dart 中相当于"JSON 对象"的标准表示。  
> 这是 Dart 中**唯一推荐使用 `dynamic`** 的场景——因为 JSON 天生无类型。

---

## 9.8 🔑 Extension Methods——给已有类型加方法

Extension methods 是 Dart 2.7 引入的特性，允许你给**任何类型**添加新方法，而不需要修改原始类。

### 基本语法

```dart
extension StringHelpers on String {
  // 给 String 类型添加新方法
  bool get isEmail => contains('@') && contains('.');

  String truncate(int maxLength) {
    if (length <= maxLength) return this;
    return '${substring(0, maxLength)}...';
  }

  String get capitalized =>
      isEmpty ? this : '${this[0].toUpperCase()}${substring(1)}';
}

// 使用——就像是 String 原生的方法一样
print('hello@world.com'.isEmail);     // true
print('Hello World'.truncate(5));      // Hello...
print('hello'.capitalized);            // Hello
```

> 💡 C++ 对比：
> - C++ **不能**给已有类型添加方法（除非用自由函数）
> - Kotlin 有类似的 Extension Functions
> - Swift 也有 Extension
> - Dart 的 Extension 和 Kotlin/Swift 的语义基本一样

### 给 int 加方法

```dart
extension IntDuration on int {
  Duration get seconds => Duration(seconds: this);
  Duration get milliseconds => Duration(milliseconds: this);
  Duration get minutes => Duration(minutes: this);
}

// 使用
await Future.delayed(3.seconds);     // 3 秒
var timeout = 500.milliseconds;      // 500 毫秒
var interval = 5.minutes;            // 5 分钟
```

> 💡 这种写法在 Flutter 社区非常流行——让 Duration 创建变得极其优雅。

### 给 List 加方法

```dart
extension ListHelpers<T> on List<T> {
  // 安全获取元素（不会越界）
  T? safeGet(int index) {
    if (index < 0 || index >= length) return null;
    return this[index];
  }

  // 分组
  Map<K, List<T>> groupBy<K>(K Function(T) keySelector) {
    final result = <K, List<T>>{};
    for (var item in this) {
      final key = keySelector(item);
      (result[key] ??= []).add(item);
    }
    return result;
  }
}

// 使用
var items = [1, 2, 3];
print(items.safeGet(10));  // null（不崩溃）

var words = ['apple', 'ant', 'banana', 'avocado'];
var grouped = words.groupBy((w) => w[0]);
// {'a': ['apple', 'ant', 'avocado'], 'b': ['banana']}
```

### 给 Map 加方法

```dart
extension JsonMapHelpers on Map<String, dynamic> {
  // 安全获取并转换类型
  T? get<T>(String key) {
    final value = this[key];
    if (value is T) return value;
    return null;
  }

  // 获取嵌套值
  dynamic getNested(List<String> path) {
    dynamic current = this;
    for (var key in path) {
      if (current is Map<String, dynamic>) {
        current = current[key];
      } else {
        return null;
      }
    }
    return current;
  }
}

// 使用
var data = {'user': {'name': 'Lumi', 'age': 18}};
print(data.getNested(['user', 'name']));  // Lumi
```

---

## 9.9 Extension 的命名与冲突

### 命名 Extension

```dart
extension StringValidator on String {
  bool get isValidUrl => startsWith('http://') || startsWith('https://');
}
```

### 匿名 Extension

```dart
extension on String {
  bool get isBlank => trim().isEmpty;
}
// 匿名 extension 不能被 show/hide，也不能在其他文件中被显式引入
```

### 冲突解决

当两个 Extension 给同一个类型定义了同名方法时：

```dart
// file_a.dart
extension StringA on String {
  String greet() => 'Hello from A: $this';
}

// file_b.dart
extension StringB on String {
  String greet() => 'Hello from B: $this';
}

// main.dart
import 'file_a.dart';
import 'file_b.dart';

// 'hello'.greet();  // ❌ 编译错误！两个 greet 冲突

// 解决方案 1：用 show/hide 导入
import 'file_a.dart' show StringA;
'hello'.greet();  // ✅ 用 StringA 的版本

// 解决方案 2：显式调用
StringA('hello').greet();  // ✅
StringB('hello').greet();  // ✅
```

---

## 9.10 🔗 Lumi-Hub 中的 ThemeExtension——Extension 思想的框架级应用

虽然 Lumi-Hub 项目中没有自定义 `extension on` 方法，但 `ThemeExtension` 本身就是**Extension 思想在框架层面的体现**——给 `ThemeData` 扩展自定义颜色。

### 定义扩展颜色

```dart
class LumiColors extends ThemeExtension<LumiColors> {
  final Color sidebar;
  final Color bubbleThem;
  final Color bubbleMe;
  final Color accent;
  final Color subtext;
  final Color inputBg;
  final Color divider;
  final Color onBubbleMe;
  final Color onBubbleThem;

  const LumiColors({ /* required this.xxx */ });

  // copyWith：第 4 章学过
  @override
  LumiColors copyWith({ /* ... */ }) { /* ... */ }

  // lerp：主题切换时的插值动画
  @override
  LumiColors lerp(LumiColors? other, double t) {
    if (other == null) return this;
    return LumiColors(
      sidebar: Color.lerp(sidebar, other.sidebar, t)!,
      bubbleThem: Color.lerp(bubbleThem, other.bubbleThem, t)!,
      // ... 每个颜色都做线性插值
    );
  }
}
```

### 注册到 Theme

```dart
static ThemeData dark({String? fontFamily}) {
  return ThemeData(
    brightness: Brightness.dark,
    // ...
    extensions: [LumiColors.dark()],   // ← 把自定义颜色注册进去
  );
}
```

### 在 Widget 中使用

```dart
// 通过 Theme.of(context).extension<T>() 获取
final colors = Theme.of(context).extension<LumiColors>()!;
//                                         ^^^^^^^^^^^
//                            泛型参数指定要获取的扩展类型

// 然后就像访问普通属性一样
Container(
  color: colors.sidebar,          // 侧边栏背景色
  child: Text(
    'Hello',
    style: TextStyle(color: colors.accent),  // 强调色
  ),
)
```

### lerp 的作用——主题切换动画

```dart
// 当用户从深色模式切换到浅色模式时：
// Flutter 框架会自动调用 lerp()，在两组颜色之间做平滑过渡
// t = 0.0 → 完全是旧主题（dark）
// t = 0.5 → 两个主题各一半
// t = 1.0 → 完全是新主题（light）

sidebar: Color.lerp(
  Color(0xFF0E1621),  // dark.sidebar
  Color(0xFFFFFFFF),  // light.sidebar
  t,                  // 0.0 → 1.0 的过渡比例
)!,
```

> 💡 `Color.lerp` = **L**inear int**ERP**olation（线性插值）。  
> 这让主题切换不是瞬间跳变，而是有丝滑的过渡动画。

---

## 9.11 本章小结

| 概念 | C++ | Dart | 重要程度 |
|------|-----|------|----------|
| 泛型类 | `template<typename T> class X` | `class X<T>` | 🔑 |
| 泛型函数 | `template<typename T> T f()` | `T f<T>()` | 🔑 |
| 泛型约束 | `requires` (C++20) | `<T extends X>` | 🔑🔑 |
| CRTP | `class D : Base<D>` | `class D extends Base<D>` | 🔑 |
| 泛型嵌套 | 一样复杂 | 一样复杂，从外往内拆解 | 🔑🔑 |
| 运行时泛型 | ❌ 模板被擦除 | ✅ 具化的，运行时保留 | 🔑 |
| Extension methods | ❌ | `extension on Type` | 🔑🔑 |
| ThemeExtension | ❌ | 框架级扩展机制 | 🔑🔑 |

### 🎯 关键要点

1. **泛型嵌套不要慌**——从外层往内层逐层拆解，翻译成自然语言。`Map<String, Completer<Map<String, dynamic>>>` 就是"通过消息 ID 找到等待 JSON 响应的 Completer"。
2. **泛型约束 `extends`** 限制类型范围——让泛型代码既灵活又安全。
3. **CRTP 模式 `T extends X<T>`**——让父类方法返回子类类型。Flutter 的 `ThemeExtension` 就用了这个模式。
4. **Dart 的泛型是具化的**——运行时 `list is List<int>` 可以判断类型，比 Java 的泛型擦除更安全。
5. **Extension methods 是语法糖**——让你给任何类型添加方法，代码更自然。但要注意命名冲突。
6. **`ThemeExtension` 的 `lerp`** 是主题切换丝滑过渡的关键——线性插值每个颜色字段。

---

> 🎉 **第二部分"Dart 进阶特性"（Ch 7-9）全部完成！**  
> 📖 下一章：[第 10 章 Flutter 核心：Widget、State 与生命周期](./10_flutter_widgets.md) —— 进入 Flutter 框架领域。

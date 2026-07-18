---
title: "第四章 面向对象：Dart 的类体系"
published: 2026-03-18
pinned: false
description: "**超越传统类继承。** 相比 C++ 的多继承，Dart 的 Mixin 提供了更灵活的代码复用方案。掌握 copyWith 模式，拥抱不可变性。"
tags: [Dart, OOP, Mixin]
category: 学习笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 第四章 面向对象：Dart 的类体系

> 目标：全面掌握 Dart 的 OOP 体系。Dart 的面向对象和 C++ 有相似骨架，但在构造函数、访问控制、混入（mixin）等方面有重大差异。这些是 Flutter 框架的根基。

---

## 4.1 类的基本定义

### 最简形式

```dart
class Point {
  double x;
  double y;

  Point(this.x, this.y);  // ← 构造函数语法糖，下面详讲
}

var p = Point(3.0, 4.0);
print(p.x);  // 3.0
```

> 💡 C++ 对比：
> ```cpp
> class Point {
> public:
>     double x, y;
>     Point(double x, double y) : x(x), y(y) {}
> };
> ```
> 几个关键差异：
> - Dart **没有** `public` / `protected` / `private` 关键字
> - Dart 用 `this.x` 语法糖代替 C++ 的初始化列表
> - Dart **没有**头文件，一个 `.dart` 文件就是一个库

---

## 4.2 🔑 构造函数——Dart 的六种写法

Dart 的构造函数远比 C++ 灵活。这是必须吃透的内容。

### ① 默认构造函数

```dart
class Animal {
  String name;
  int age;

  // 最原始的写法
  Animal(String name, int age) {
    this.name = name;
    this.age = age;
  }
}
```

### ② `this.field` 语法糖（最常用）

```dart
class Animal {
  String name;
  int age;

  Animal(this.name, this.age);  // ← 一行搞定，自动赋值
}
```

> 💡 `this.name` 表示"把传入的参数直接赋值给同名字段"。  
> C++ 的初始化列表 `Point(double x, double y) : x(x), y(y) {}` 虽然也很简洁，但 Dart 的 `this.field` 更极致——连参数类型都省了（从字段推断）。

### ③ 命名参数 + `this.field`（Flutter 最爱的写法）

```dart
class ChatMessage {
  final String id;
  final String content;
  final MessageSender sender;
  final DateTime time;
  final bool isTyping;
  final bool isSelected;
  final Map<String, dynamic>? extra;

  ChatMessage({
    required this.id,        // required = 必须传
    required this.content,
    required this.sender,
    required this.time,
    this.isTyping = false,   // 有默认值 = 可以不传
    this.isSelected = false,
    this.extra,              // 可空 = 可以不传
  });
}
```

使用时：

```dart
var msg = ChatMessage(
  id: 'msg-001',
  content: 'Hello!',
  sender: MessageSender.me,
  time: DateTime.now(),
  // isTyping、isSelected 使用默认值，extra 为 null
);
```

> 💡 这就是你在 Flutter 中看到的**所有 Widget 构造函数的标准Style**：
> ```dart
> Text('hello', style: TextStyle(fontSize: 16, color: Colors.red))
> Container(width: 100, height: 100, color: Colors.blue)
> ```
> 全部都是命名参数 + `this.field` 语法糖。

### ④ 命名构造函数

一个类可以有**多个**构造函数，用名字区分：

```dart
class Color {
  int r, g, b;

  Color(this.r, this.g, this.b);

  // 命名构造函数
  Color.red() : r = 255, g = 0, b = 0;
  Color.green() : r = 0, g = 255, b = 0;
  Color.fromHex(int hex)
      : r = (hex >> 16) & 0xFF,
        g = (hex >> 8) & 0xFF,
        b = hex & 0xFF;
}

var red = Color.red();
var custom = Color.fromHex(0xFF5BACF0);
```

> 💡 C++ 没有命名构造函数。C++ 要实现类似效果只能用**静态工厂方法**：
> ```cpp
> static Color red() { return Color(255, 0, 0); }
> ```
> Dart 的命名构造函数是语言原生支持的。

### ⑤ `const` 构造函数

如果一个类的所有字段都是 `final` 的，可以定义 `const` 构造函数，创建**编译时常量**对象：

```dart
class LumiColors {
  final Color sidebar;
  final Color accent;
  // ... 其他 final 字段 ...

  const LumiColors({       // ← const 构造函数
    required this.sidebar,
    required this.accent,
    // ...
  });
}

// 使用 const 创建编译时常量
const darkColors = LumiColors(
  sidebar: Color(0xFF0E1621),
  accent: Color(0xFF5BACF0),
);
```

> 💡 `const` 对象的好处：
> 1. **编译时求值**——运行时零开销
> 2. **全局唯一**——两个相同的 const 对象**共享内存**
> 3. Flutter 中 `const Widget` 可以跳过重建，**提升性能**

> 💡 C++ 对比：类似 `constexpr` 构造函数，但 Dart 的 `const` 在 Flutter 中更常用。

### ⑥ `factory` 构造函数

`factory` 构造函数不一定创建新实例——可以返回缓存的对象、子类实例等：

```dart
class Logger {
  static final Logger _instance = Logger._internal();

  // 私有命名构造函数
  Logger._internal();

  // factory 构造函数：总是返回同一个实例（单例模式）
  factory Logger() => _instance;
}

var a = Logger();
var b = Logger();
print(identical(a, b));  // true —— 是同一个对象
```

> 💡 `factory` vs 普通构造函数：
> | 特性 | 普通构造函数 | factory 构造函数 |
> |------|-------------|-----------------|
> | 是否总是创建新实例 | ✅ 是 | ❌ 不一定 |
> | 能否返回子类 | ❌ | ✅ |
> | 能否返回缓存对象 | ❌ | ✅ |
> | 能访问 `this` 吗 | ✅ | ❌ |
> | 能有函数体吗 | ✅ | ✅ |

### 🔗 Lumi-Hub 实例：全部构造函数形式

**`message.dart`** —— 命名参数 + `this.field` + 默认值：

```dart
class ChatMessage {
  final String id;
  final String content;
  final MessageSender sender;
  final DateTime time;
  final bool isTyping;
  final bool isSelected;
  final Map<String, dynamic>? extra;

  ChatMessage({
    required this.id,
    required this.content,
    required this.sender,
    required this.time,
    this.isTyping = false,       // ← 默认值
    this.isSelected = false,
    this.extra,                  // ← 可空，默认 null
  });
}
```

**`bootstrap_service.dart`** —— 位置参数 + `this.field`：

```dart
class LogEntry {
  final DateTime time;
  final LogLevel level;
  final String message;

  LogEntry(this.time, this.level, this.message);  // ← 位置参数语法糖
}
```

**`app_theme.dart`** —— `const` 构造 + `factory` 命名构造：

```dart
class LumiColors extends ThemeExtension<LumiColors> {
  final Color sidebar;
  final Color bubbleThem;
  // ... 9 个 final 字段 ...

  const LumiColors({              // ← const 构造函数
    required this.sidebar,
    required this.bubbleThem,
    // ...
  });

  factory LumiColors.dark() => const LumiColors(   // ← factory 命名构造
    sidebar: Color(0xFF0E1621),
    bubbleThem: Color(0xFF182533),
    // ...
  );

  factory LumiColors.light() => const LumiColors(  // ← 另一个 factory
    sidebar: Color(0xFFFFFFFF),
    bubbleThem: Color(0xFFFFFFFF),
    // ...
  );
}
```

> 💡 这个类同时展示了：`const` 构造 + `factory` 命名构造 + `required this.field` 命名参数——三合一。

---

## 4.3 🔑 访问控制：Dart 的"库级"私有

### Dart 的规则

| 写法 | Dart 访问级别 | C++ 近似 |
|------|-------------|----------|
| `name` | **公开** | `public` |
| `_name` | **库级私有** | 介于 `private` 和 `friend` 之间 |

**Dart 没有 `public` / `private` / `protected` 关键字。**

命名以 `_` 开头的成员只能在**同一个 `.dart` 文件**（同一个库）内访问。

```dart
class WsService {
  // 公开：其他文件可以访问
  WsStatus get status => _status;
  bool get isAuthenticated => _isAuthenticated;

  // 私有：只在 ws_service.dart 内可访问
  WsStatus _status = WsStatus.disconnected;
  bool _isAuthenticated = false;
  String? _token;
  String _serverUrl = _defaultUrl;

  void _setStatus(WsStatus s) { /* ... */ }
  void _onData(dynamic raw) { /* ... */ }
  void _startPing() { /* ... */ }
}
```

> 💡 **和 C++ 的关键区别**：
> 1. C++ 的 `private` 是**类级别**——同类的不同实例可以互访，但子类不行
> 2. Dart 的 `_` 是**文件/库级别**——同文件的不同类可以互访，但不同文件不行
> 3. Dart **没有 `protected`**——子类想访问父类的"私有"成员？只要在同一个文件就行
> 4. 如果你确实需要跨文件的"友元"访问，可以用 `part` / `part of`（但不推荐）

### 常见模式：私有字段 + 公开 getter

```dart
class AppSettings {
  String _fontFamily = 'MiSans';      // 私有字段
  bool _closeAstrBotOnExit = false;

  // 公开 getter：外部可以读
  String? get fontFamily => _fontFamily.isEmpty ? null : _fontFamily;
  String get fontKey => _fontFamily;
  bool get closeAstrBotOnExit => _closeAstrBotOnExit;

  // 公开方法：外部通过方法修改（可以加校验逻辑）
  void setFontFamily(String key) {
    if (_fontFamily == key) return;
    _fontFamily = key;
    notifyListeners();
    _save();
  }
}
```

> 💡 这是 Dart 中最常见的封装模式：
> - 字段用 `_` 私有
> - 暴露 `get` 属性给外部读
> - 暴露 `set` 方法让外部写（方法内可加校验/通知逻辑）

---

## 4.4 🔑 getter / setter 属性访问器

Dart 的 getter/setter 和 C# 很像，比 C++ 更优雅。

### 基本语法

```dart
class Rectangle {
  double width;
  double height;

  Rectangle(this.width, this.height);

  // getter：像访问字段一样使用
  double get area => width * height;
  double get perimeter => 2 * (width + height);
  bool get isSquare => width == height;
}

var rect = Rectangle(10, 20);
print(rect.area);       // 200.0 —— 像字段一样访问，但实际是计算出来的
print(rect.isSquare);   // false
```

### 带逻辑的 setter

```dart
class Temperature {
  double _celsius;

  Temperature(this._celsius);

  double get celsius => _celsius;
  set celsius(double value) {
    if (value < -273.15) throw ArgumentError('绝对零度以下');
    _celsius = value;
  }

  double get fahrenheit => _celsius * 9 / 5 + 32;
  set fahrenheit(double f) => celsius = (f - 32) * 5 / 9;  // 转换后赋值
}

var t = Temperature(100);
print(t.fahrenheit);    // 212.0
t.fahrenheit = 32;      // setter 自动转换
print(t.celsius);       // 0.0
```

### getter 的两种写法

```dart
// 箭头写法（一行表达式）
String get timeString => '$hh:$mm:$ss';

// 花括号写法（多行逻辑）
String get timeString {
  final hh = time.hour.toString().padLeft(2, '0');
  final mm = time.minute.toString().padLeft(2, '0');
  final ss = time.second.toString().padLeft(2, '0');
  return '$hh:$mm:$ss';
}
```

### 🔗 Lumi-Hub 实例

**`bootstrap_service.dart`** 的 `LogEntry` 类——带计算逻辑的 getter：

```dart
class LogEntry {
  final DateTime time;
  final LogLevel level;
  final String message;

  LogEntry(this.time, this.level, this.message);

  // getter：格式化时间
  String get timeString {
    final hh = time.hour.toString().padLeft(2, '0');
    final mm = time.minute.toString().padLeft(2, '0');
    final ss = time.second.toString().padLeft(2, '0');
    return '$hh:$mm:$ss';
  }

  // getter：日志级别转字符串
  String get levelString {
    switch (level) {
      case LogLevel.info: return 'INFO';
      case LogLevel.debug: return 'DEBUG';
      case LogLevel.warning: return 'WARN';
      case LogLevel.error: return 'ERROR';
    }
  }
}
```

**`ws_service.dart`** 中大量使用简单 getter 暴露只读属性：

```dart
class WsService extends ChangeNotifier {
  WsStatus _status = WsStatus.disconnected;
  WsStatus get status => _status;             // ← 只读 getter

  bool _isAuthenticated = false;
  bool get isAuthenticated => _isAuthenticated;

  bool _isGenerating = false;
  bool get isGenerating => _isGenerating;

  bool _historyHasMore = true;
  bool get hasMoreHistory => _historyHasMore;  // ← getter 名可以和字段名不同

  final List<ChatMessage> _messages = [];
  List<ChatMessage> get messages => List.unmodifiable(_messages);  // ← 返回只读拷贝
}
```

**`bootstrap_service.dart`** 中 getter 包含逻辑判断：

```dart
bool get isReady => _stage == BootstrapStage.ready;
bool get hasFailed => _stage == BootstrapStage.failed;
bool get isRemoteClientMode => _settings.remoteClientMode || !_supportsLocalHostLifecycle;
bool get _supportsLocalHostLifecycle => !kIsWeb && Platform.isWindows;
```

> 💡 注意 `_supportsLocalHostLifecycle` 是**私有 getter**（以 `_` 开头），只在同文件内使用。

---

## 4.5 🔑 继承 `extends`

和 C++ 类似，Dart 用 `extends` 实现单继承：

```dart
class Animal {
  String name;
  Animal(this.name);

  void speak() => print('...');
}

class Dog extends Animal {
  String breed;

  Dog(super.name, this.breed);  // ← Dart 3：super.name 直接传给父类

  @override
  void speak() => print('Woof! I am $name');
}
```

> 💡 C++ 对比：
> ```cpp
> class Dog : public Animal {
> public:
>     std::string breed;
>     Dog(std::string name, std::string breed)
>         : Animal(name), breed(breed) {}
>     void speak() override { /* ... */ }
> };
> ```

### `super` 的三种用法

```dart
class Parent {
  String name;
  Parent(this.name);
  Parent.named(this.name);
}

class Child extends Parent {
  int age;

  // 用法 1：super.field 语法糖（Dart 3）
  Child(super.name, this.age);

  // 用法 2：初始化列表中调用 super()
  Child.v2(String name, this.age) : super(name);

  // 用法 3：调用父类的命名构造函数
  Child.v3(String name, this.age) : super.named(name);
}
```

### `@override` 注解

```dart
class LogEntry {
  // ...

  @override
  String toString() => '[$levelString] [$timeString] $message';
  //                    ^^^^^^^^
  //  重写 Object 类的 toString() 方法
}
```

> 💡 C++ 的 `override` 是**关键字**（放在方法签名后面），  
> Dart 的 `@override` 是**注解**（放在方法前面）。  
> Dart 中 `@override` 是可选的（但强烈建议加上，linter 会检查）。

### 🔗 Lumi-Hub 实例

**所有三个 Service 类**都继承了 `ChangeNotifier`：

```dart
class WsService extends ChangeNotifier { /* ... */ }
class AppSettings extends ChangeNotifier { /* ... */ }
class BootstrapService extends ChangeNotifier { /* ... */ }
```

**`LumiColors`** 继承了 `ThemeExtension<LumiColors>`：

```dart
class LumiColors extends ThemeExtension<LumiColors> {
  @override
  LumiColors copyWith({ /* ... */ }) { /* ... */ }

  @override
  LumiColors lerp(LumiColors? other, double t) { /* ... */ }
}
```

> `ThemeExtension` 要求子类必须实现 `copyWith` 和 `lerp` 两个方法。

---

## 4.6 🔑 抽象类 `abstract class`

Dart 的抽象类和 C++ 的纯虚类类似：

```dart
abstract class Shape {
  // 抽象方法：没有方法体，子类必须实现
  double area();
  double perimeter();

  // 普通方法：有默认实现
  void describe() => print('面积: ${area()}, 周长: ${perimeter()}');
}

class Circle extends Shape {
  double radius;
  Circle(this.radius);

  @override
  double area() => 3.14159 * radius * radius;

  @override
  double perimeter() => 2 * 3.14159 * radius;
}
```

> 💡 C++ 对比：
> ```cpp
> class Shape {
> public:
>     virtual double area() = 0;      // 纯虚函数
>     virtual double perimeter() = 0;
>     void describe() { /* ... */ }
> };
> ```
> Dart 不需要 `= 0` 或 `virtual`——只要方法没有函数体，就自动是抽象方法。

### `abstract interface class`（Dart 3）

Dart 3 引入了更精确的类修饰符：

```dart
// 只能被 implements，不能被 extends
abstract interface class Serializable {
  Map<String, dynamic> toJson();
  factory Serializable.fromJson(Map<String, dynamic> json);
}
```

---

## 4.7 🔑 接口 `implements`

在 Dart 中，**每个类都隐式地定义了一个接口**。用 `implements` 表示"我实现了这个类的所有公开方法"。

```dart
class Printable {
  void printSelf() => print(toString());
}

class Serializable {
  Map<String, dynamic> toJson() => {};
}

// 一个类可以同时实现多个接口
class User implements Printable, Serializable {
  final String name;
  User(this.name);

  @override
  void printSelf() => print('User: $name');

  @override
  Map<String, dynamic> toJson() => {'name': name};
}
```

### `extends` vs `implements`

| 维度 | `extends` | `implements` |
|------|-----------|-------------|
| 关系 | "是一种"（is-a） | "能做"（can-do）|
| 数量 | 只能一个 | 可以多个 |
| 继承实现 | ✅ 继承父类的方法实现 | ❌ 必须全部重新实现 |
| 继承字段 | ✅ | ❌ |

> 💡 C++ 对比：C++ 可以多继承（`class A : public B, public C`），但容易造成菱形继承等问题。  
> Dart 选择了**单继承 + 多接口 + mixin**的组合来避免这些问题。

---

## 4.8 🔑 混入 `mixin` 和 `with`

Mixin 是 Dart 解决"多继承"问题的利器。它允许一个类**复用多个类的方法**，但不是继承关系。

### 定义 mixin

```dart
mixin Swimmer {
  void swim() => print('$runtimeType is swimming');
}

mixin Flyer {
  void fly() => print('$runtimeType is flying');
}

// 使用 with 混入
class Duck extends Animal with Swimmer, Flyer {
  Duck(super.name);
}

var duck = Duck('Donald');
duck.swim();  // Duck is swimming
duck.fly();   // Duck is flying
duck.speak(); // Animal 的方法
```

> 💡 C++ 对比：
> ```cpp
> // C++ 需要多继承或 CRTP 模式，容易导致菱形问题
> class Duck : public Animal, public Swimmer, public Flyer { ... };
> ```
> Dart 的 mixin 是**线性化**的，不会有菱形继承问题。

### mixin 的限制

```dart
mixin Swimmer {
  void swim();            // 可以有抽象方法
  void dive() => swim();  // 可以有具体方法

  // 不能有构造函数！
  // Swimmer() { }  // ❌ 编译错误
}
```

### `mixin on` —— 限制 mixin 的使用范围

```dart
mixin Logger on ChangeNotifier {
  // 这个 mixin 只能用在 ChangeNotifier 或其子类上
  void log(String msg) {
    print(msg);
    notifyListeners();    // ← 可以调用 ChangeNotifier 的方法
  }
}
```

### 🔗 Lumi-Hub 实例

**`main.dart`** 的 `_LumiAppState` 同时混入了两个监听器：

```dart
class _LumiAppState extends State<LumiApp> with WindowListener, TrayListener {
//                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                   混入窗口事件监听器 和 系统托盘事件监听器

  @override
  void onTrayIconMouseDown() {      // ← 来自 TrayListener
    windowManager.show();
    windowManager.focus();
  }

  @override
  void onTrayMenuItemClick(MenuItem menuItem) async {  // ← 来自 TrayListener
    if (menuItem.key == 'show_window') {
      await windowManager.show();
    } else if (menuItem.key == 'exit_app') {
      // ...
    }
  }

  @override
  Future<void> onWindowClose() async {  // ← 来自 WindowListener
    // 窗口关闭时的处理逻辑
  }
}
```

> 💡 这展示了 mixin 的真实价值：
> - `State<LumiApp>` 是主继承链（Flutter 框架要求）
> - `WindowListener` 和 `TrayListener` 是额外的能力——通过 `with` 混入
> - 如果用 C++ 多继承，会比较混乱。Dart 的 mixin 语义更清晰。

---

## 4.9 🔑 `copyWith` 模式——不可变对象的"修改"

因为 Dart 鼓励使用 `final` 字段创建不可变对象，修改某个字段需要**创建新对象**。`copyWith` 是标准的解决方案。

### 模式

```dart
class Config {
  final String host;
  final int port;
  final bool debug;

  const Config({
    required this.host,
    required this.port,
    this.debug = false,
  });

  // copyWith：复制自身，只替换指定字段
  Config copyWith({
    String? host,
    int? port,
    bool? debug,
  }) {
    return Config(
      host: host ?? this.host,      // 没传就用原值
      port: port ?? this.port,
      debug: debug ?? this.debug,
    );
  }
}

var config = Config(host: '127.0.0.1', port: 8765);
var newConfig = config.copyWith(port: 9090);
// newConfig: host='127.0.0.1', port=9090, debug=false
// config 不变（不可变对象）
```

> 💡 `copyWith` 的关键在于参数都是**可空**的 (`?`)：
> - 传了值 → 用新值
> - 没传（null）→ 用 `??` 回退到原值
>
> 这是 Dart 中 Null Safety 和不可变模式的**完美结合**。

### 🔗 Lumi-Hub 实例

**`message.dart`** 的 `ChatMessage.copyWith`：

```dart
ChatMessage copyWith({
  String? content,
  bool? isTyping,
  bool? isSelected,
  Map<String, dynamic>? extra,
}) {
  return ChatMessage(
    id: id,                                 // id 不可改
    content: content ?? this.content,       // 没传就用原值
    sender: sender,                         // sender 不可改
    time: time,                             // time 不可改
    isTyping: isTyping ?? this.isTyping,
    isSelected: isSelected ?? this.isSelected,
    extra: extra ?? this.extra,
  );
}
```

使用场景——流式消息内容拼接：

```dart
// ws_service.dart 中，收到新的 chunk 后更新消息内容
_messages[existingIndex] = existing.copyWith(
  content: _mergeAssistantContent(existing.content, chunk),
  isTyping: false,
);
```

> 💡 注意 `copyWith` 只暴露了**允许修改的字段**（content、isTyping 等），  
> 而 `id`、`sender`、`time` 不在参数列表中——它们被"锁死"不可变。  
> 这是一种**设计意图的表达**：通过 API 设计限制不该变的东西。

**`app_theme.dart`** 的 `LumiColors.copyWith`——ThemeExtension 要求的实现：

```dart
@override
LumiColors copyWith({
  Color? sidebar,
  Color? bubbleThem,
  Color? bubbleMe,
  Color? accent,
  Color? subtext,
  Color? inputBg,
  Color? divider,
  Color? onBubbleMe,
  Color? onBubbleThem,
}) {
  return LumiColors(
    sidebar: sidebar ?? this.sidebar,
    bubbleThem: bubbleThem ?? this.bubbleThem,
    bubbleMe: bubbleMe ?? this.bubbleMe,
    accent: accent ?? this.accent,
    subtext: subtext ?? this.subtext,
    inputBg: inputBg ?? this.inputBg,
    divider: divider ?? this.divider,
    onBubbleMe: onBubbleMe ?? this.onBubbleMe,
    onBubbleThem: onBubbleThem ?? this.onBubbleThem,
  );
}
```

---

## 4.10 `@override` 与 `toString`

### 重写 `toString()`

每个 Dart 对象都继承自 `Object`，`Object` 有一个 `toString()` 方法。重写它可以自定义打印输出：

```dart
class LogEntry {
  // ...

  @override
  String toString() => '[$levelString] [$timeString] $message';
}

print(LogEntry(DateTime.now(), LogLevel.info, '启动完成'));
// 输出：[INFO] [21:03:17] 启动完成
```

### 重写 `==` 和 `hashCode`

如果你想让两个对象按**值相等**（而不是引用相等），需要重写 `==` 和 `hashCode`：

```dart
class Point {
  final double x;
  final double y;

  const Point(this.x, this.y);

  @override
  bool operator ==(Object other) =>
      other is Point && other.x == x && other.y == y;

  @override
  int get hashCode => Object.hash(x, y);
}

print(Point(1, 2) == Point(1, 2));  // true（值相等）
```

> 💡 C++ 对比：
> ```cpp
> bool operator==(const Point& other) const {
>     return x == other.x && y == other.y;
> }
> ```
> Dart 的 `operator ==` 接收 `Object` 类型，需要用 `is` 检查类型。

### 运算符重载

```dart
class Vector {
  final double x, y;
  const Vector(this.x, this.y);

  Vector operator +(Vector other) => Vector(x + other.x, y + other.y);
  Vector operator -(Vector other) => Vector(x - other.x, y - other.y);
  Vector operator *(double scalar) => Vector(x * scalar, y * scalar);

  @override
  String toString() => 'Vector($x, $y)';
}

var v1 = Vector(1, 2);
var v2 = Vector(3, 4);
print(v1 + v2);     // Vector(4.0, 6.0)
print(v1 * 3);      // Vector(3.0, 6.0)
```

> 💡 Dart 支持的可重载运算符：
> `+` `-` `*` `/` `~/` `%` `<` `>` `<=` `>=` `==` `[]` `[]=` `~` `<<` `>>` `^` `|` `&`
>
> 和 C++ 能重载的运算符种类差不多。

---

## 4.11 `static` 静态成员

```dart
class AppTheme {
  // 静态常量
  static const _darkAccent = Color(0xFF5BACF0);
  static const _darkBg = Color(0xFF17212B);

  // 静态方法
  static ThemeData dark({String? fontFamily}) {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: _darkBg,
      // ...
    );
  }

  static ThemeData light({String? fontFamily}) {
    return ThemeData(
      brightness: Brightness.light,
      // ...
    );
  }
}

// 调用
var theme = AppTheme.dark(fontFamily: 'MiSans');
```

> 💡 和 C++ 的 `static` 基本一样：
> - 静态成员属于类，不属于实例
> - 不需要创建对象就能访问
> - 静态方法不能访问非静态成员

### 🔗 Lumi-Hub 实例

`ws_service.dart` 用 `static const` 定义配置常量：

```dart
class WsService extends ChangeNotifier {
  static const String _defaultUrl = 'ws://127.0.0.1:8765';
  static const String _serverUrlStorage = 'ws.server_url';
  static const Duration _pingInterval = Duration(seconds: 20);
  static const Duration _reconnectDelay = Duration(seconds: 3);
  static const int _historyPageSize = 30;
  static const int _uploadChunkSize = 256 * 1024;
  // ...
}
```

`app_theme.dart` 的 `AppTheme` 类只有静态成员——它是一个**工具类**（不需要实例化）：

```dart
class AppTheme {
  static const _darkAccent = Color(0xFF5BACF0);
  // ...
  static ThemeData dark({String? fontFamily}) => ThemeData(/* ... */);
  static ThemeData light({String? fontFamily}) => ThemeData(/* ... */);
}
```

---

## 4.12 本章小结

| 概念 | C++ | Dart | 重要程度 |
|------|-----|------|----------|
| 构造函数 | 一种 + 拷贝构造 | 6 种（默认、`this.`、命名、factory、const、super.） | 🔑🔑🔑 |
| 访问控制 | `public/private/protected` | `_` 前缀 = 库级私有 | 🔑🔑 |
| getter/setter | 需手写方法 | 原生 `get` / `set` 语法 | 🔑 |
| 继承 | 多继承 | 单继承 `extends` | 🔑 |
| 接口 | 纯虚基类 | 每个类自动是接口，用 `implements` | 🔑 |
| 多态 | 虚函数 + `override` | `@override` | ⚡ |
| 混入 | 多继承（有菱形问题） | `mixin` + `with`（线性化，无菱形） | 🔑🔑 |
| 不可变修改 | 手动复制 | `copyWith` 模式 | 🔑🔑 |
| 运算符重载 | `operator+` | `operator +` | ⚡ |
| 抽象类 | 纯虚类 | `abstract class` | 🔑 |
| 静态成员 | `static` | `static` | ⚡ |

### 🎯 关键要点

1. **命名参数 + `this.field`** 是 Flutter 构造函数的标配——几乎每个 Widget 都这样写。
2. **`_` 是库级私有**，不是类级私有。同一个 `.dart` 文件内的所有类可以互相访问 `_` 成员。
3. **`factory` 构造函数**不创建新实例——常用于单例、缓存、返回子类等场景。
4. **`const` 构造函数**创建编译时常量，Flutter 中用于性能优化。
5. **mixin（`with`）** 是 Dart 的"多继承"方案——比 C++ 的多继承更安全。
6. **`copyWith` 模式**是不可变对象的标准操作——通过 `??` 实现"没传就用原值"。

---

> 📖 下一章：[第 5 章 枚举、模式匹配与 Dart 3 新特性](../05_enums_patterns.md) —— switch 表达式、sealed class、Records 等 Dart 3 独有特性。

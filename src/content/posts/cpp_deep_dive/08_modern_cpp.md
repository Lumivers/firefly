---
title: "第八章 现代 C++ 特性精选"
published: 2026-04-22
pinned: false
description: "**面试突击 · 现代 C++。** 从 auto/decltype 推导规则到 Lambda 的捕获陷阱，从 optional/variant/string_view 三剑客到 C++20 Concepts 与协程，从结构化绑定到 constexpr 编译期计算——一文掌握 C++11~20 的面试必考特性与游戏实战应用。"
tags: [C++, 面试, 现代C++, Lambda, optional, variant, Concepts]
category: C++深入笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 第八章 现代 C++ 特性精选

> **一句话理解**：现代 C++ (C++11~20) 不是换了一门语言，而是给老 C++ 装上了**安全带、自动驾驶和涡轮增压**——更安全、更易用、更高效。

---

## 8.1 概念直觉 —— What & Why

### 为什么要学现代 C++？

C++11 被称为"Modern C++ 元年"——它的变化大到像换了一门语言。后续每三年一个版本持续演进：

| 版本 | 年份 | 核心主题 | 杀手级特性 |
|------|------|---------|-----------|
| **C++11** | 2011 | 语言现代化 | auto, 右值引用, Lambda, 智能指针, 线程库 |
| **C++14** | 2014 | C++11 补丁 | 泛型 Lambda, 返回类型推导, `make_unique` |
| **C++17** | 2017 | 简化 & 实用 | if constexpr, 结构化绑定, optional/variant/string_view |
| **C++20** | 2020 | 四大件 | Concepts, Ranges, Coroutines, Modules |

> 💡 **面试建议**：面试中 C++11/17 是必考基础，C++20 是加分项。本章按面试频率排序。

---

## 8.2 C++11 核心特性

### 8.2.1 `auto` 与类型推导

```cpp
// auto 基础用法
auto x = 42;            // int
auto y = 3.14;          // double
auto s = std::string("hello");  // std::string
auto it = map.begin();  // std::map<K,V>::iterator（省去冗长类型名）

// auto 的推导规则（和模板参数推导一样）：
// 1. 去掉引用
// 2. 去掉顶层 const
int val = 42;
const int& ref = val;
auto a = ref;           // int（去掉 const 和 &）
auto& b = ref;          // const int&（保留 const，因为 & 保持引用）
const auto& c = val;    // const int&

// ⚠️ auto 陷阱
auto x1 = {1, 2, 3};    // std::initializer_list<int>！不是 vector
auto x2{42};             // C++17: int（C++11/14: initializer_list<int>）
auto x3 = {42};          // std::initializer_list<int>（所有版本）
```

### 8.2.2 `decltype` 与 `decltype(auto)`

```cpp
int x = 42;
int& ref = x;

// decltype 保留表达式的完整类型
decltype(x)   a = 10;     // int
decltype(ref) b = x;      // int&（保留引用）
decltype((x)) c = x;      // int&！（(x) 是左值表达式）
// ↑ 面试高频坑点：decltype(x) 和 decltype((x)) 结果不同

// decltype(auto)：按 decltype 规则推导
decltype(auto) d = x;      // int（decltype(x) = int）
decltype(auto) e = ref;    // int&（decltype(ref) = int&）
decltype(auto) f = (x);    // int&！（decltype((x)) = int&）
// ↑ 永远不要 decltype(auto) f = (local_var); 会返回悬垂引用

// 实际应用：完美返回类型
template <typename F, typename... Args>
decltype(auto) call(F&& f, Args&&... args) {
    return std::forward<F>(f)(std::forward<Args>(args)...);
    // 如果 f 返回引用，这里也返回引用（不会意外拷贝）
}
```

---

### 8.2.3 Lambda 表达式

```cpp
// 基本语法
// [capture](params) -> return_type { body }

// 捕获方式
int a = 10, b = 20;

auto f1 = [a, b]()    { return a + b; };   // 值捕获（拷贝）
auto f2 = [&a, &b]()  { a += b; };         // 引用捕获
auto f3 = [=]()        { return a + b; };   // 全部值捕获
auto f4 = [&]()        { a += b; };         // 全部引用捕获
auto f5 = [=, &a]()    { a += b; };         // 混合：a 引用，其余值捕获
auto f6 = [&, a]()     { return a + b; };   // 混合：a 值捕获，其余引用

// C++14：泛型 Lambda（auto 参数）
auto add = [](auto a, auto b) { return a + b; };
add(3, 5);          // int
add(3.14, 2.71);    // double

// C++14：初始化捕获（移动捕获）
auto ptr = std::make_unique<int>(42);
auto f7 = [p = std::move(ptr)]() {
    return *p;  // 把 unique_ptr 移入 Lambda
};

// C++17：*this 捕获（拷贝整个对象）
class Widget {
    int _value = 42;
public:
    auto getAction() {
        // [this] 捕获 this 指针（如果对象被销毁 → 悬垂）
        // [*this] 拷贝整个对象（安全，但有开销）
        return [*this]() { return _value; };
    }
};

// C++20：模板 Lambda
auto typed_add = []<typename T>(T a, T b) { return a + b; };

// 立即调用 Lambda (IIFE)
const auto config = []() {
    Config c;
    c.width = 1920;
    c.height = 1080;
    c.fullscreen = true;
    return c;
}();  // 注意末尾的 ()
```

> ⚠️ **Lambda 的本质**回顾（Ch2 已讲）：编译器生成匿名类 + `operator()`。捕获的变量变成成员。

---

### 8.2.4 nullptr

```cpp
// NULL 是 0，在重载决议中可能被当作 int
void f(int* p);
void f(int n);
f(NULL);     // ❌ 歧义！NULL = 0，可匹配两者
f(nullptr);  // ✅ 明确是空指针，保证匹配指针重载

// nullptr 的类型是 std::nullptr_t，只能转为任意指针类型，不能转 int
```

### 8.2.5 枚举深入：从 enum 到 enum class

枚举是 C++ 中最容易被低估的主题。表面上简单，但传统 `enum` 有四个致命问题，而 `enum class` 解决了它们。

**传统 enum 的四大问题**：

```cpp
// 问题一：作用域污染 —— 枚举值泄漏到外层作用域
enum Color { Red, Green, Blue };
// Red、Green、Blue 现在都是全局可见的
enum TrafficLight { Red, Yellow, Green };  // ❌ 编译错误！Red 和 Green 重复定义

// 旧式解决方法：用命名空间或前缀手动隔离
enum Color { COLOR_Red, COLOR_Green, COLOR_Blue };
enum Fruit { FRUIT_Apple, FRUIT_Orange };

// 问题二：隐式转换为 int —— 语义荒谬但编译通过
enum Color { Red = 0, Green = 1, Blue = 2 };
enum Fruit { Apple = 0, Orange = 1 };
int x = Red + Apple;         // ✅ 编译通过，x = 0
bool b = (Red == Apple);     // ✅ 编译通过，b = true（两者都是 0）
if (Red) { /* ... */ }       // ✅ 编译通过，但毫无语义

// 问题三：底层类型不确定
// 编译器可能选 int、unsigned int、char……取决于枚举值的范围
enum Flags { A = 1, B = 2, C = 4 };       // 可能用 int 或 unsigned
enum BigFlags { X = 1ULL << 40 };          // 必须用 64 位类型
// 这导致 ABI 兼容性问题：不同编译器可能选不同底层类型
// 也对前向声明造成了障碍

// 问题四：不能前向声明（C++11 之前）
// enum Color;  // ❌ C++03 不允许，因为编译器不知道底层类型
```

**enum class 的类型安全机制**：

```cpp
// enum class：作用域 + 类型安全 + 可指定底层类型
enum class Color { Red, Green, Blue };
enum class Fruit { Apple, Orange };

// ① 作用域隔离
Color c = Color::Red;        // ✅ 必须加 Color:: 前缀
Fruit f = Fruit::Apple;      // ✅ 各自的枚举值互不干扰

// ② 禁止隐式转换
// int x = Color::Red;       // ❌ 编译错误
int x = static_cast<int>(Color::Red);  // ✅ 显式转换，意图明确
// bool b = (Color::Red == Fruit::Apple);  // ❌ 编译错误！不同类型不能比较
// if (Color::Red) { }       // ❌ 编译错误

// ③ 可指定底层类型，支持前向声明
enum class InputKey : uint8_t {    // 只用 1 字节
    W = 0, A, S, D, Space, Shift
};

enum class EntityType : uint32_t;  // ✅ 前向声明（编译器知道占 4 字节）
// ... 在别的文件中
enum class EntityType : uint32_t {
    Player, Enemy, NPC, Projectile
};
```

**枚举的底层类型规则**：

```cpp
// C++11 起，enum class 默认底层类型是 int
// 可以显式指定为任意整数类型
enum class SmallEnum : uint8_t  { A, B, C };          // 1 字节
enum class MediumEnum : uint16_t { X = 1000 };         // 2 字节
enum class LargeEnum : uint64_t  { Y = 1ULL << 50 };   // 8 字节

// 传统 enum 在 C++11 起也可以指定底层类型
enum Flags : uint32_t {
    None    = 0,
    Visible = 1 << 0,
    Enabled = 1 << 1,
    Focused = 1 << 2
};

// 获取枚举的底层类型（C++11）
using T = std::underlying_type_t<Flags>;  // T = uint32_t
```

**枚举作为位掩码（Flags）**：

```cpp
// 游戏中最常见的用法：标志位
enum class RenderLayer : uint8_t {
    None       = 0,
    Default    = 1 << 0,
    Transparent = 1 << 1,
    UI         = 1 << 2,
    Skybox     = 1 << 3,
    Shadow     = 1 << 4
};

// 为了让 enum class 支持位运算，需要手动重载
inline constexpr RenderLayer operator|(RenderLayer a, RenderLayer b) {
    return static_cast<RenderLayer>(
        static_cast<uint8_t>(a) | static_cast<uint8_t>(b)
    );
}
inline constexpr RenderLayer operator&(RenderLayer a, RenderLayer b) {
    return static_cast<RenderLayer>(
        static_cast<uint8_t>(a) & static_cast<uint8_t>(b)
    );
}
inline constexpr bool hasFlag(RenderLayer value, RenderLayer flag) {
    return (static_cast<uint8_t>(value) & static_cast<uint8_t>(flag)) != 0;
}

// 使用
RenderLayer layer = RenderLayer::Default | RenderLayer::Transparent;
if (hasFlag(layer, RenderLayer::UI)) {
    // ...
}
```

> 💡 **面试中的表述**："`enum class` 相比传统 `enum` 有三个改进：作用域隔离（必须 `ClassName::` 前缀）、类型安全（禁止隐式转 int）、可显式指定底层类型（支持前向声明）。传统 `enum` 的枚举值会污染外层作用域，且可以隐式转为 int 导致非语义化比较被编译通过。"

### 8.2.6 范围 for
```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
for (auto& x : v) { x *= 2; }     // 引用修改
for (const auto& x : v) { ... }    // const 引用读取（推荐）

// 展开等价于：
// for (auto __begin = v.begin(), __end = v.end(); __begin != __end; ++__begin) {
//     auto& x = *__begin;
// }
```

---

## 8.3 C++17 实用特性

### 8.3.1 结构化绑定 (Structured Bindings)

```cpp
// 解构 pair / tuple
std::map<std::string, int> scores;
for (const auto& [name, score] : scores) {
    std::cout << name << ": " << score << "\n";
}

// 解构自定义结构体
struct Vec3 { float x, y, z; };
Vec3 pos{1.f, 2.f, 3.f};
auto [x, y, z] = pos;  // x=1, y=2, z=3

// 解构 pair 的 insert 返回值
auto [iter, inserted] = scores.insert({"Alice", 100});
if (!inserted) std::cout << "Already exists!\n";
```

### 8.3.2 `std::optional`

```cpp
#include <optional>

// 表示"可能没有值"——替代裸指针/魔法值
std::optional<int> findPlayer(const std::string& name) {
    if (auto it = players.find(name); it != players.end()) {
        return it->second.id;
    }
    return std::nullopt;  // 没找到
}

// 使用
auto result = findPlayer("Alice");
if (result) {
    std::cout << "ID: " << *result << "\n";     // 解引用
    std::cout << "ID: " << result.value() << "\n";  // .value() 无值时抛异常
}

// 提供默认值
int id = result.value_or(-1);  // 没有则返回 -1

// ⚠️ 不适用于：大对象（optional 在栈上存完整对象）、高频调用路径
```

### 8.3.3 `std::variant`

```cpp
#include <variant>

// 类型安全的 union —— 取代 C 的 union + tag
using GameEvent = std::variant<
    MouseClickEvent,
    KeyPressEvent,
    WindowResizeEvent
>;

GameEvent event = KeyPressEvent{KeyCode::W, true};

// 访问方式 1：std::get（抛异常版）
auto& key = std::get<KeyPressEvent>(event);  // 类型不对 → 抛 bad_variant_access

// 访问方式 2：std::get_if（安全版）
if (auto* click = std::get_if<MouseClickEvent>(&event)) {
    handleClick(click->x, click->y);
}

// 访问方式 3：std::visit（最推荐，用 visitor 模式）
std::visit([](auto&& arg) {
    using T = std::decay_t<decltype(arg)>;
    if constexpr (std::is_same_v<T, MouseClickEvent>) {
        handleClick(arg.x, arg.y);
    } else if constexpr (std::is_same_v<T, KeyPressEvent>) {
        handleKey(arg.key, arg.pressed);
    } else if constexpr (std::is_same_v<T, WindowResizeEvent>) {
        handleResize(arg.width, arg.height);
    }
}, event);

// overloaded 技巧（C++17 惯用法）
template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;

std::visit(overloaded{
    [](MouseClickEvent& e)   { handleClick(e.x, e.y); },
    [](KeyPressEvent& e)     { handleKey(e.key, e.pressed); },
    [](WindowResizeEvent& e) { handleResize(e.width, e.height); },
}, event);
```

### 8.3.4 `std::string_view`

```cpp
#include <string_view>

// string_view = 只读的字符串引用（指针 + 长度），零拷贝
void log(std::string_view msg) {
    std::cout << "[LOG] " << msg << "\n";
}

// 接受任何字符串类型，不拷贝
log("hello");                    // const char* → string_view（零拷贝）
log(std::string("hello"));      // string → string_view（零拷贝）
log(some_string.substr(0, 5));   // 无需创建子串的 string

// ⚠️ 生命周期陷阱
std::string_view dangerous() {
    std::string local = "hello";
    return local;  // ❌ local 销毁后 string_view 悬垂！
}
// string_view 不拥有数据，必须确保底层字符串存活

// 性能对比
void f1(const std::string& s);   // 传 "hello" → 构造临时 string（堆分配）
void f2(std::string_view sv);     // 传 "hello" → 只设指针和长度（零开销）
```

### 8.3.5 `if constexpr` 与 `constexpr` 增强

```cpp
// if constexpr（编译期分支，详见 Ch5）
template <typename T>
auto process(const T& val) {
    if constexpr (std::is_integral_v<T>) {
        return val * 2;
    } else {
        return val;
    }
}

// constexpr 函数：编译期 or 运行期都能执行
constexpr int factorial(int n) {
    int result = 1;
    for (int i = 2; i <= n; ++i) result *= i;
    return result;
}

constexpr int f5 = factorial(5);    // 编译期计算 → 120
int n = getUserInput();
int fn = factorial(n);              // 运行期计算

// C++17：constexpr if + constexpr Lambda
auto constexpr_lambda = [](int n) constexpr { return n * n; };
static_assert(constexpr_lambda(5) == 25);
```

---

## 8.4 C++20 重要特性

### 8.4.1 Concepts（详见 Ch5）

```cpp
// 模板约束：告诉编译器"T 必须满足什么条件"
template <typename T>
concept Numeric = std::is_arithmetic_v<T>;

template <Numeric T>
T lerp(T a, T b, float t) {
    return a + (b - a) * t;
}

lerp(0.f, 1.f, 0.5f);     // ✅
// lerp("a", "b", 0.5f);  // ❌ 清晰报错：string 不满足 Numeric
```

### 8.4.2 Ranges

```cpp
#include <ranges>
#include <algorithm>

std::vector<int> v = {5, 3, 1, 4, 2, 8, 6, 7};

// 传统写法
std::sort(v.begin(), v.end());
auto it = std::find_if(v.begin(), v.end(), [](int x) { return x > 5; });

// Ranges 写法：管道风格
auto result = v
    | std::views::filter([](int x) { return x % 2 == 0; })  // 筛选偶数
    | std::views::transform([](int x) { return x * x; })     // 平方
    | std::views::take(3);                                     // 取前 3 个

for (int x : result) {
    std::cout << x << " ";  // 4 16 64
}
// 注意：views 是惰性求值，不创建中间容器！
```

### 8.4.3 协程 (Coroutines)

```cpp
#include <coroutine>

// 协程 = 可暂停和恢复的函数
// 关键字：co_await（等待）、co_yield（产出值）、co_return（返回）

// 简化的 Generator（产出序列值）
template <typename T>
struct Generator {
    struct promise_type {
        T current_value;
        Generator get_return_object() {
            return Generator{std::coroutine_handle<promise_type>::from_promise(*this)};
        }
        std::suspend_always initial_suspend() { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }
        std::suspend_always yield_value(T value) {
            current_value = value;
            return {};
        }
        void return_void() {}
        void unhandled_exception() { std::terminate(); }
    };

    std::coroutine_handle<promise_type> handle;

    bool next() {
        handle.resume();
        return !handle.done();
    }
    T value() const { return handle.promise().current_value; }

    ~Generator() { if (handle) handle.destroy(); }
};

// 使用协程生成斐波那契数列
Generator<int> fibonacci() {
    int a = 0, b = 1;
    while (true) {
        co_yield a;
        auto next = a + b;
        a = b;
        b = next;
    }
}

auto gen = fibonacci();
for (int i = 0; i < 10 && gen.next(); ++i) {
    std::cout << gen.value() << " ";  // 0 1 1 2 3 5 8 13 21 34
}
```

### 8.4.4 三路比较 `<=>` (Spaceship Operator)

```cpp
#include <compare>

struct Vec2 {
    float x, y;

    // 一行搞定所有比较运算符（==, !=, <, >, <=, >=）
    auto operator<=>(const Vec2&) const = default;
};

Vec2 a{1, 2}, b{3, 4};
bool eq = (a == b);   // false
bool lt = (a < b);    // true（先比 x，再比 y）

// 自定义排序逻辑
struct Score {
    int points;
    float time;

    std::strong_ordering operator<=>(const Score& other) const {
        // 分数高的排前面，相同分数时时间短的排前面
        if (auto cmp = other.points <=> points; cmp != 0) return cmp;
        return time <=> other.time;  // 注意：不是 other.time
    }
    bool operator==(const Score&) const = default;
};
```

### 8.4.5 `std::span` (C++20) —— 连续内存的视图

```cpp
#include <span>

// span = 连续内存的非拥有视图（类似 string_view 对 string）
void processVertices(std::span<const float> vertices) {
    for (float v : vertices) { /* ... */ }
}

// 接受任何连续容器，零拷贝
std::vector<float> vec = {1, 2, 3, 4};
float arr[] = {5, 6, 7, 8};
std::array<float, 4> stdarr = {9, 10, 11, 12};

processVertices(vec);       // ✅ vector
processVertices(arr);       // ✅ C 数组
processVertices(stdarr);    // ✅ std::array
processVertices({vec.data() + 1, 2});  // ✅ 子范围

// 游戏中特别有用：GPU 缓冲区上传
void uploadToGPU(std::span<const float> data) {
    glBufferData(GL_ARRAY_BUFFER, data.size_bytes(), data.data(), GL_STATIC_DRAW);
}
```

---

## 8.5 经典陷阱与面试题

### 8.5.1 代码陷阱

```cpp
// === 陷阱 1：auto 推导 initializer_list ===
auto x = {1, 2, 3};   // initializer_list<int>，不是 vector！

// === 陷阱 2：Lambda 捕获悬垂引用 ===
auto makeLambda() {
    int local = 42;
    return [&local]() { return local; };  // ❌ local 已销毁
    // ✅ return [local]() { return local; };  // 值捕获
}

// === 陷阱 3：optional 的 value() ===
std::optional<int> opt;
// int v = opt.value();  // 💥 抛 std::bad_optional_access
int v = opt.value_or(0); // ✅ 安全

// === 陷阱 4：string_view 的生命周期 ===
std::string_view sv;
{
    std::string s = "hello";
    sv = s;   // sv 指向 s 的数据
}
// sv 悬垂了！s 已销毁，sv 指向已释放的内存

// === 陷阱 5：decltype((x)) 意外返回引用 ===
int x = 42;
decltype(x) a;    // int
decltype((x)) b = x;  // int&（加了括号变成表达式）
```

### 8.5.2 面试辨析

**Q1：`auto` 的推导规则？**

> `auto` 按值推导——去掉引用和顶层 const，和模板参数推导规则一样。`auto&` 保留引用，`const auto&` 保留 const。`decltype` 保留完整类型。`decltype(auto)` 按 `decltype` 规则推导。

**Q2：Lambda 的捕获方式有哪些？**

> 值捕获 `[x]`、引用捕获 `[&x]`、全部值 `[=]`、全部引用 `[&]`、混合 `[=, &x]`、this 指针 `[this]`、拷贝 this 对象 `[*this]`(C++17)、初始化捕获 `[p = std::move(ptr)]`(C++14)。

**Q3：`optional`、`variant`、`any` 的区别？**

> `optional<T>` 表示"可能没有值"（零或一个 T）。`variant<T1,T2,...>` 表示"确定是其中一种类型"（类型安全的 union）。`any` 可以存任何类型（完全类型擦除，性能最差）。优先用 `optional` 和 `variant`。

---

## 8.6 🎮 游戏实战场景

### 8.6.1 `std::optional` —— 碰撞检测结果

```cpp
struct HitResult {
    Vec3 point;
    Vec3 normal;
    float distance;
    Entity* entity;
};

// optional 表示"可能没打中"
std::optional<HitResult> raycast(const Ray& ray, float maxDist) {
    for (auto& collider : colliders) {
        if (auto hit = collider.intersect(ray, maxDist)) {
            return hit;
        }
    }
    return std::nullopt;  // 没打中
}

// 使用
if (auto hit = raycast(playerRay, 100.f)) {
    // 打中了
    spawnImpactEffect(hit->point, hit->normal);
    hit->entity->takeDamage(weapon.damage);
} else {
    // 没打中
}
```

### 8.6.2 `std::variant` —— 事件系统

```cpp
// 类型安全的事件数据
struct PlayerMoveEvent  { Vec3 position; Vec3 direction; };
struct PlayerDamageEvent { float damage; DamageType type; Entity* source; };
struct ItemPickupEvent  { ItemId item; int quantity; };

using GameEvent = std::variant<PlayerMoveEvent, PlayerDamageEvent, ItemPickupEvent>;

class EventBus {
    std::vector<std::function<void(const GameEvent&)>> _listeners;

public:
    void subscribe(std::function<void(const GameEvent&)> listener) {
        _listeners.push_back(std::move(listener));
    }

    void publish(const GameEvent& event) {
        for (auto& listener : _listeners) {
            listener(event);
        }
    }
};

// 订阅
bus.subscribe([](const GameEvent& event) {
    std::visit(overloaded{
        [](const PlayerDamageEvent& e) {
            showDamageNumber(e.damage);
            playHitSound(e.type);
        },
        [](const ItemPickupEvent& e) {
            showPickupNotification(e.item, e.quantity);
        },
        [](auto&&) { /* 忽略其他事件 */ }
    }, event);
});
```

### 8.6.3 `std::string_view` —— 高性能日志与配置解析

```cpp
class Logger {
public:
    // string_view：接受任何字符串，零拷贝
    void log(std::string_view level, std::string_view msg,
             std::string_view file, int line) {
        std::cout << "[" << level << "] " << msg
                  << " (" << file << ":" << line << ")\n";
    }
};

// 宏利用 __FILE__ 和 __LINE__
#define LOG_INFO(msg)  logger.log("INFO",  msg, __FILE__, __LINE__)
#define LOG_WARN(msg)  logger.log("WARN",  msg, __FILE__, __LINE__)
#define LOG_ERROR(msg) logger.log("ERROR", msg, __FILE__, __LINE__)

// 配置文件解析：用 string_view 避免大量子串拷贝
void parseConfig(std::string_view content) {
    while (!content.empty()) {
        auto newline = content.find('\n');
        auto line = content.substr(0, newline);

        auto eq = line.find('=');
        if (eq != std::string_view::npos) {
            auto key = line.substr(0, eq);
            auto val = line.substr(eq + 1);
            // key 和 val 都是 string_view → 零拷贝！
            config[std::string(key)] = std::string(val);
        }

        content = (newline == std::string_view::npos)
            ? "" : content.substr(newline + 1);
    }
}
```

### 8.6.4 协程 —— 游戏对话系统

```cpp
// 协程让异步逻辑写起来像同步代码
Task<void> dialogueSequence(DialogueUI& ui) {
    ui.showText("Hero: 你好，老爷爷！");
    co_await ui.waitForClick();    // 暂停，等待玩家点击

    ui.showText("NPC: 年轻人，前方有龙！");
    co_await ui.waitForClick();

    auto choice = co_await ui.showChoice({
        "去打龙",
        "我怕，不去了"
    });

    if (choice == 0) {
        ui.showText("NPC: 勇者，拿着这把剑！");
        player.addItem(Items::DragonSlayer);
    } else {
        ui.showText("NPC: 那你回家吧...");
    }
    co_await ui.waitForClick();
    ui.close();
}

// 传统回调写法（回调地狱）：
// ui.showText("...", [&]() {
//     ui.showText("...", [&]() {
//         ui.showChoice({...}, [&](int choice) {
//             if (choice == 0) { ... } else { ... }
//         });
//     });
// });
```

### 8.6.5 `constexpr` —— 编译期游戏数据

```cpp
// 编译期计算查找表（零运行时开销）
constexpr std::array<float, 360> buildSinTable() {
    std::array<float, 360> table{};
    for (int i = 0; i < 360; ++i) {
        table[i] = static_cast<float>(
            std::sin(i * 3.14159265358979 / 180.0)
        );
    }
    return table;
}

constexpr auto SIN_TABLE = buildSinTable();
// SIN_TABLE 在编译期就算好了，运行时直接查表

// 编译期 hash（字符串作为 switch case）
constexpr uint32_t hash(std::string_view sv) {
    uint32_t hash = 2166136261u;
    for (char c : sv) {
        hash ^= static_cast<uint32_t>(c);
        hash *= 16777619u;
    }
    return hash;
}

void handleCommand(std::string_view cmd) {
    switch (hash(cmd)) {
        case hash("attack"): doAttack(); break;
        case hash("defend"): doDefend(); break;
        case hash("heal"):   doHeal();   break;
        default: std::cout << "Unknown command\n";
    }
    // 编译期计算 hash 值 → switch 直接跳转，零开销
}
```

---

## 8.7 30 秒速答

**Q：`auto` 的推导规则？**

> `auto` 按值推导——去掉引用和顶层 const。`auto&` 保留引用和 const。注意 `auto x = {1,2,3}` 推导为 `initializer_list`，不是 `vector`。

**Q：Lambda 的捕获方式有哪些？**

> 值捕获 `[x]`、引用捕获 `[&x]`、全部值 `[=]`、全部引用 `[&]`、混合捕获、this 指针 `[this]`、拷贝对象 `[*this]`(C++17)、初始化捕获 `[p = move(ptr)]`(C++14)。引用捕获要注意生命周期。

**Q：`optional`、`variant`、`any` 的区别？**

> `optional<T>` 是"零或一个 T"，替代空指针和魔法值。`variant<T1,T2,...>` 是"确定是其中一种类型"，替代 C union。`any` 存任意类型，用 `any_cast` 取出，最灵活但性能最差。优先 optional > variant > any。

**Q：C++11 vs C++17 最大的变化？**

> C++11 的革命性在于右值引用、Lambda、智能指针——重新定义了 C++ 的写法。C++17 的价值在于简化——结构化绑定、if constexpr、optional/variant/string_view 让代码更简洁、更安全。

---

> 📖 上一章：[第七章 并发与多线程](../07_concurrency) —— 从 std::thread 到原子操作，从死锁到无锁队列，游戏引擎的渲染线程分离与 Job System。

> 📖 系列导航：[C++ 面试突击系列 · 全部章节](../cpp_deep_dive/) —— 8 章内容一览，推荐阅读路线。

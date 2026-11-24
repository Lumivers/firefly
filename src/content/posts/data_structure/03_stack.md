---
title: "第三章 栈：后进先出的秩序"
published: 2026-04-05
pinned: false
description: "数据结构笔记 · 栈。内容按优先级梳理：P0 核心考点（std::stack 容器适配器、为什么默认是 deque、最小栈 MinStack、双栈实现队列）、P1 经典算法与单调栈（单调栈套路、每日温度、接雨水、括号匹配、递归转迭代）、P2 工程实践（UI 栈、游戏状态栈、Undo/Redo 系统）与 P3 基础实现附录。"
tags: [数据结构, C++, 面试, Stack, 单调栈]
category: 数据结构笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 第三章 栈 (Stack)

> 栈是一种遵循**后进先出 (LIFO, Last In First Out)** 的受限线性表。它在物理上没有独立的数据结构，而是作为抽象接口施加于数组、双端队列或链表之上。

---

## 0. 考点优先级概览

根据面试常见考察频次与工程实用度，内容按优先级从高到低组织：

| 优先级 | 分类 | 核心内容 | 重点说明 |
| :--- | :--- | :--- | :--- |
| **P0** | **核心考点** | `std::stack` 适配器机制、为什么默认选用 `deque`、最小栈 (MinStack)、双栈实现队列 | 经典机制与高频手写题 |
| **P1** | **单调栈与技巧** | 单调栈核心范式、每日温度、柱状图最大矩形、接雨水、递归转显式栈 | 笔试面试常客，高效解决区间极值与边界问题 |
| **P2** | **工程实践** | 游戏 UI 导航栈、嵌套游戏状态机 (GameState Stack)、双栈 Undo/Redo 命令模式 | 客户端与游戏引擎常用架构模式 |
| **P3** | **基础与附录** | 各底层容器对比表、全操作复杂度、手写定长数组栈参考实现（可折叠） | 知识库查阅备忘 |

---

## P0：核心考点

### 1.1 `std::stack` 底层适配器机制

在 C++ STL 中，`std::stack` 并非原生独立容器，而是一个**容器适配器 (Container Adapter)**。它通过封装底层已有容器的接口，对外仅暴露受限的 LIFO 行为：

```cpp
template <typename T, typename Container = std::deque<T>>
class stack {
protected:
    Container c; // 底层容器
public:
    void push(const T& x) { c.push_back(x); }
    void pop()            { c.pop_back(); }
    T& top()              { return c.back(); }
    bool empty() const    { return c.empty(); }
    size_t size() const   { return c.size(); }
};
```

---

### 1.2 为什么 `std::stack` 默认底层选用 `std::deque`？

这是面试中考察 STL 底层理解深度的经典问题：为什么默认不是 `std::vector`，也不是 `std::list`？

| 底层容器 | 优势 | 劣势 | 为何未选为默认实现 |
| :--- | :--- | :--- | :--- |
| **`std::vector`** | 连续物理内存，尾部操作快，Cache 局部性极好 | 扩容时需申请 2 倍新内存并搬迁旧元素，产生瞬时卡顿与内存浪费 | 扩容搬迁代价不可控，且要求大块连续地址空间 |
| **`std::list`** | 无需连续内存，增删绝不触发扩容与迭代器失效 | 每个节点独立 `new`，指针额外开销大，Cache Miss 严重 | 内存碎片严重，性能远落后于数组分段结构 |
| **`std::deque` (默认选择)** | **分段连续存储（中控数组 + 固定 Buffer 块）**：<br>1. 扩容仅需追加新缓冲区，**无需整体搬迁旧数据**；<br>2. 保持了较高的局部缓存命中率；<br>3. 内存释放更细粒度。 | 随机访问略慢于 vector（需二次寻址） | **兼顾了无搬迁代价与局部缓存友好，且栈不需要随机访问** |

> 💡 **总结**：栈只需要尾部增删，完全不需要随机访问能力。`std::deque` 既避开了 `vector` 的全量搬迁停顿，又没有 `list` 散落节点的指针开销，是综合权衡的最优解。

---

### 1.3 核心手撕 1：最小栈 (LeetCode 155)

* **问题**：设计一个栈，支持在 **$O(1)$** 时间内检索到栈中的最小元素。
* **双栈法解题思路**：
  维护两个栈：`data_stack` 存储正常业务数据，`min_stack` 同步维护当前状态下的最小值。
  - **`push(val)`**：`data_stack.push(val)`；对于 `min_stack`，推入 `min(val, min_stack.top())`。
  - **`pop()`**：两个栈同时弹出。
  - **`getMin()`**：直接返回 `min_stack.top()`，时间复杂度严格 **$O(1)$**。

```cpp
#include <stack>
#include <algorithm>

class MinStack {
    std::stack<int> _data;
    std::stack<int> _min;

public:
    MinStack() {}

    void push(int val) {
        _data.push(val);
        if (_min.empty() || val <= _min.top()) {
            _min.push(val);
        } else {
            _min.push(_min.top());
        }
    }

    void pop() {
        _data.pop();
        _min.pop();
    }

    int top() {
        return _data.top();
    }

    int getMin() {
        return _min.top();
    }
};
```

---

### 1.4 核心手撕 2：用栈实现队列 (LeetCode 232)

* **问题**：使用两个后进先出的栈实现先进先出的队列功能。
* **双栈解法**：
  划分 `in_stack`（负责入队）与 `out_stack`（负责出队）：
  - **`push(x)`**：直接压入 `in_stack`。
  - **`pop()` / `peek()`**：若 `out_stack` 为空，将 `in_stack` 中所有元素逐个弹出并压入 `out_stack`（负负得正，反转为 FIFO 顺序），随后从 `out_stack` 弹出。
  - **复杂度分析**：每个元素最多进出两个栈各两次，单次操作**均摊时间复杂度为 $O(1)$**。

```cpp
#include <stack>

class MyQueue {
    std::stack<int> _in;
    std::stack<int> _out;

    void _transfer() {
        if (_out.empty()) {
            while (!_in.empty()) {
                _out.push(_in.top());
                _in.pop();
            }
        }
    }

public:
    void push(int x) { _in.push(x); }

    int pop() {
        _transfer();
        int val = _out.top();
        _out.pop();
        return val;
    }

    int peek() {
        _transfer();
        return _out.top();
    }

    bool empty() {
        return _in.empty() && _out.empty();
    }
};
```

---

### 1.5 常见面试问答要点

* **Q：为什么系统函数调用要使用栈模型？**
  > **回答要点**：函数的生命周期具有天然的“后调用的先返回”嵌套特征。调用子函数时，当前函数的活动记录（返回地址、形参、局部变量、寄存器状态）必须暂存；当子函数执行完毕后，控制权原路返回并恢复现场。这种嵌套上下文的保存与恢复与 LIFO 行为完全契合。

* **Q：如何有效防止递归引发的 Stack Overflow（栈溢出）？**
  > **回答要点**：两类手段。一是将普通递归改写为**尾递归**（让编译器优化为跳转指令，复用栈帧）；二是利用**循环迭代配合用户态堆栈**（如 `std::vector`）显式模拟递归过程。系统栈空间默认通常仅几 MB（如 Linux 8MB，Windows 1MB），而堆内存可利用整机可用物理内存，彻底消除栈溢出风险。

---

## P1：单调栈与经典技巧

### 2.1 单调栈核心范式

单调栈是指内部元素按照数值大小始终保持单调递增或单调递减的栈。
* **核心应用场景**：在 **$O(n)$** 线性时间内，寻找数组中每个元素向左或向右**第一个比它大（或小）的元素**。
* **工作机制**：遍历数组，当新元素破坏单调性时，不断弹出栈顶元素并结算结果，直至恢复单调性再压入当前元素。

#### 典型模板：每日温度 (LeetCode 739)
> 寻找右侧第一个比当前温度高的天数间隔。

```cpp
#include <vector>
#include <stack>

std::vector<int> dailyTemperatures(const std::vector<int>& temperatures) {
    int n = temperatures.size();
    std::vector<int> res(n, 0);
    std::stack<int> st; // 单调递减栈，存下标

    for (int i = 0; i < n; ++i) {
        // 当前温度大于栈顶温度，说明找到了栈顶元素的下一个更高温度
        while (!st.empty() && temperatures[i] > temperatures[st.top()]) {
            int prev_idx = st.top();
            st.pop();
            res[prev_idx] = i - prev_idx;
        }
        st.push(i);
    }
    return res;
}
```

---

### 2.2 经典算法题速查

| 题目 | 难度 | 核心思路 |
| :--- | :--- | :--- |
| **LC 20. 有效的括号** | Easy | 遇到左括号压入对应右括号；遇到右括号比对是否等于栈顶并弹出。 |
| **LC 150. 逆波兰表达式求值** | Medium | 遇到数字压栈；遇到运算符弹出两个操作数（注意减法和除法的左右次序），计算结果压回栈。 |
| **LC 739. 每日温度** | Medium | 单调递减栈存下标，当前元素大于栈顶时循环出栈并结算距离。 |
| **LC 84. 柱状图中最大的矩形** | Hard | 单调递增栈，首尾补 0 作为哨兵。当前柱子变矮时出栈计算以被弹出高度为基准的最大矩形面积。 |
| **LC 42. 接雨水** | Hard | 单调递减栈（按行结算积水）或双指针（按列结算积水）。 |

---

## P2：工程实践与业务场景

### 3.1 客户端与游戏 UI 导航栈 (UI Stack)

在复杂界面系统中（如游戏菜单、设置、背包弹窗），UI 窗口的跳转遵循严格的压栈与回退：
* 打开子弹窗：`push(Window)`，并根据策略隐藏或停用下层窗口。
* 点击返回键：`pop()`，自动激活并刷新露出的上一级窗口。

---

### 3.2 游戏状态机嵌套 (GameState Stack)

游戏主循环经常需要暂停或叠加子状态：
* 正常游戏运行处于 `PlayState`。
* 玩家按下 ESC 打开暂停菜单：压入 `PauseState`，原 `PlayState` 暂停 `update()` 但继续执行 `render()` 作为毛玻璃背景。
* 退出暂停：`PauseState` 弹出并销毁，无缝继续游戏，避免了状态的重置与重新加载。

---

### 3.3 双栈模式实现 Undo / Redo 系统

图形软件与编辑器中的撤销/重做系统核心基于命令模式与双栈维护：
* **`undo_stack`**：每次用户执行一个 Command，将其压入 Undo 栈，同时清空 Redo 栈。
* **撤销 (Undo)**：从 `undo_stack` 弹出 Command，调用其 `unexecute()`，并将其压入 `redo_stack`。
* **重做 (Redo)**：从 `redo_stack` 弹出 Command，调用其 `execute()`，并压回 `undo_stack`。

---

## P3：基础原理与参考实现

### 4.1 复杂度速查与底层容器选型

| 操作接口 | 时间复杂度 | 空间复杂度 | 对应底层操作 |
| :--- | :--- | :--- | :--- |
| `push()` | **$O(1)$ 均摊** | $O(1)$ | 底层容器 `push_back()` |
| `pop()` | **$O(1)$** | $O(1)$ | 底层容器 `pop_back()` |
| `top()` | **$O(1)$** | $O(1)$ | 底层容器 `back()` |
| `empty()` / `size()` | **$O(1)$** | $O(1)$ | 底层容器元数据返回 |

---

### 4.2 手写定长数组栈参考实现

<details>
<summary>👉 查看基于原生数组的定长栈 (FixedStack) C++ 参考实现</summary>

```cpp
#include <array>
#include <stdexcept>
#include <cstddef>

template <typename T, std::size_t Capacity>
class FixedStack {
    std::array<T, Capacity> _data;
    std::size_t _top = 0; // 指向下一个空闲槽位

public:
    void push(const T& val) {
        if (full()) throw std::overflow_error("Stack is full");
        _data[_top++] = val;
    }

    void pop() {
        if (empty()) throw std::underflow_error("Stack is empty");
        --_top;
    }

    T& top() {
        if (empty()) throw std::underflow_error("Stack is empty");
        return _data[_top - 1];
    }

    const T& top() const {
        if (empty()) throw std::underflow_error("Stack is empty");
        return _data[_top - 1];
    }

    bool empty() const { return _top == 0; }
    bool full() const { return _top == Capacity; }
    std::size_t size() const { return _top; }
};
```
</details>

---

> 📖 下一章：[第四章 队列：先进先出的管道](../04_queue/) —— 从循环队列到阻塞队列，从 BFS 广度优先搜索到游戏网络包调度。

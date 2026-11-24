---
title: "第四章 队列：先进先出的管道"
published: 2026-04-06
pinned: false
description: "数据结构笔记 · 队列。内容按优先级梳理：P0 核心考点（std::queue 与 std::deque 底层中控架构、循环队列判空判满、单调队列与滑动窗口）、P1 进阶原理（优先队列 priority_queue 与堆、Top-K 选型、BFS 模板）、P2 工程实践（游戏事件队列、渲染命令缓冲、网络消息包队列）与 P3 基础实现附录。"
tags: [数据结构, C++, 面试, Queue, Deque, PriorityQueue, 单调队列]
category: 数据结构笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 第四章 队列 (Queue)

> 队列是一种遵循**先进先出 (FIFO, First In First Out)** 的线性表。它是多线程通信、事件驱动系统以及广度优先搜索 (BFS) 的核心调度中枢。

---

## 0. 考点优先级概览

根据面试常见考察频次与工程实用度，内容按优先级组织如下：

| 优先级 | 分类 | 核心内容 | 重点说明 |
| :--- | :--- | :--- | :--- |
| **P0** | **核心考点** | `std::queue` 与 `std::deque` 底层中控结构、循环队列设计、单调队列与滑动窗口最大值 | 高频机制与重点手撕题目 |
| **P1** | **优先队列与算法** | `std::priority_queue` 堆原理、Top-K 选型策略、BFS 经典遍历模板 | 算法高频应用与比较仿函数 |
| **P2** | **工程实践** | 异步事件队列 (Event Queue)、渲染命令缓冲、网络数据包缓冲调度 | 游戏客户端与分布式系统异步解耦 |
| **P3** | **基础与附录** | 队列家族横向对比表、全操作复杂度、手写数组循环队列完整源码（可折叠） | 知识库查阅备忘 |

---

## P0：核心考点

### 1.1 `std::queue` 与 `std::deque` 底层架构

#### 1. 为什么 `std::queue` 默认底层也是 `std::deque`？
* `std::queue` 需要支持两端操作：**队尾写入 (`push_back`)** 与 **队头弹出 (`pop_front`)**。
* 若使用 `std::vector`：虽然尾部插入是 $O(1)$，但从头部弹出元素需要将所有后续元素向前移动，**复杂度退化为 $O(n)$**。
* 若使用 `std::list`：虽然双端均为 $O(1)$，但每个元素单独 `new`，指针开销大且 Cache 极度不友好。
* **`std::deque` 完美契合**：双端操作均为严格 $O(1)$，且没有 `vector` 搬迁和 `list` 离散节点的缺点。

#### 2. `std::deque` 的分段连续中控架构
`std::deque` 内部并非一整块大连续内存，而是通过**中控映射数组 (Map Array)** 管理一组**固定大小的连续缓冲区 (Buffer / Node)**：

```mermaid
graph TD
    subgraph "std::deque 中控映射架构"
        MAP["中控指针数组 (Map Array)"]
        B0["Buffer 0 (512B 连续数组)"]
        B1["Buffer 1 (512B 连续数组)"]
        B2["Buffer 2 (512B 连续数组)"]

        MAP -->|map[0]| B0
        MAP -->|map[1]| B1
        MAP -->|map[2]| B2
    end
```
* **双端扩容机制**：向队头或队尾新增元素超出当前缓冲区时，仅需申请一个新的独立 Buffer 并挂在中控 Map 的两端，**现有已存储的数据绝对不需要移动或重新拷贝**。
* **随机访问复杂度**：通过两次指针解引用（一次计算在中控 Map 中的行号，一次在具体 Buffer 内部计算列号），依然保持 **$O(1)$** 随机访问。

---

### 1.2 循环队列 (Circular Queue) 的设计与状态判定

使用固定容量的原生数组实现队列时，随着不断 `push` 和 `pop`，有效区间整体向右移动，导致数组前端空间闲置而尾部越界（**假溢出**）。通过取模运算首尾相连构成**循环队列**。

#### 1. 核心指针与索引计算
* 读指针 `head`：指向队头元素。
* 写指针 `tail`：指向下一个待写入的槽位。
* 推进公式：`index = (index + 1) % Capacity`。

#### 2. 判空与判满的两种设计方案
* **方案 A：多维护一个 `size` 计数变量（工程最推荐）**
  - 判空：`size == 0`
  - 判满：`size == Capacity`
  - 优点：空间利用率 100%，无需浪费槽位。
* **方案 B：牺牲一个槽位（经典算法教材写法）**
  - 判空：`head == tail`
  - 判满：`(tail + 1) % Capacity == head`
  - 优点：不依赖额外成员变量。

---

### 1.3 核心手撕：单调队列与滑动窗口最大值 (LeetCode 239)

* **问题**：给定数组 `nums` 和滑动窗口大小 `k`，在窗口向右滑动的过程中，以 **$O(n)$** 时间复杂度输出每个窗口的最大值。
* **单调队列核心设计**：
  使用 `std::deque` 维护一个**单调递减队列**（存元素下标或数值）：
  1. **入队规整**：新元素进入前，若队尾元素小于新元素，说明队尾元素在当前及后续窗口中“既比新元素小，又比新元素更早过期”，**永远不可能再成为最大值**，将其从尾部循环弹出。
  2. **过期剔除**：若队头元素的下标已滑出窗口左边界 `i - k + 1`，从队头弹出。
  3. **窗口最大值**：经过上述维护，**队头元素恒定为当前窗口的最大值**。

```cpp
#include <vector>
#include <deque>

std::vector<int> maxSlidingWindow(const std::vector<int>& nums, int k) {
    std::deque<int> dq; // 存储数组下标
    std::vector<int> result;

    for (int i = 0; i < nums.size(); ++i) {
        // 1. 移出窗口外的元素
        if (!dq.empty() && dq.front() <= i - k) {
            dq.pop_front();
        }

        // 2. 保持单调递减：弹出所有小于当前值的尾部元素
        while (!dq.empty() && nums[dq.back()] <= nums[i]) {
            dq.pop_back();
        }

        dq.push_back(i);

        // 3. 窗口形成后记录最大值
        if (i >= k - 1) {
            result.push_back(nums[dq.front()]);
        }
    }
    return result;
}
```
* **时空复杂度**：每个元素最多进出队列各一次，时间复杂度严格保证为 **$O(n)$**，空间复杂度 $O(k)$。

---

### 1.4 常见面试问答要点

* **Q：为什么不能用 `std::vector` 作为 `std::queue` 的底层容器？**
  > **回答要点**：`std::queue` 的核心操作包含队头出队 `pop()`。`std::vector` 仅支持尾部的高效增删，在头部执行 `erase(begin())` 时，必须将后续全部 $n-1$ 个元素依次向前平移，时间复杂度高达 $O(n)$，彻底破坏了队列队头出队 $O(1)$ 的基本性能契约。

* **Q：`std::deque` 与 `std::vector` 的内存分配有何核心不同？**
  > **回答要点**：`vector` 要求**全局绝对单块连续**的物理内存，扩容必须整体搬迁；`deque` 采用**中控指针数组映射多段固定大小的缓冲区（分段连续）**。扩容时只需新增一个缓冲区挂在中控数组上，旧缓冲区内的数据无需整体搬移，但在物理上跨缓冲区是不连续的。

---

## P1：优先队列与算法应用

### 2.1 `std::priority_queue` 底层机制与比较器规则

`std::priority_queue` 是基于**堆 (Heap)** 的容器适配器，默认在底层使用 `std::vector` 并调用 STL 堆算法（`make_heap`, `push_heap`, `pop_heap`）维护一个**大顶堆**。

```cpp
// 默认：大顶堆（堆顶为最大值）
std::priority_queue<int> max_heap;

// 小顶堆：堆顶为最小值（必须显式指定三个模板参数）
std::priority_queue<int, std::vector<int>, std::greater<int>> min_heap;
```

> ⚠️ **记忆技巧（反直觉陷阱）**：
> `std::sort` 传 `greater<int>` 表示**降序**；但在 `priority_queue` 中，传 `greater<int>` 却代表**小顶堆（堆顶最小）**。这是因为堆算法内部使用的是类似“`comp(child, parent)` 时上浮”的规则。

---

### 2.2 Top-K 问题的标准选型策略

* **海量数据求最大的前 K 个元素**：
  **必须使用大小为 $K$ 的小顶堆**。
  - 遍历数据：若当前元素大于小顶堆堆顶，弹出堆顶并压入该元素。遍历结束后，堆内剩余的 $K$ 个元素即为全局最大的 $K$ 个。
  - **优势**：内存空间严格保持为 $O(K)$，无需把海量数据全量载入内存。
* **海量数据求最小的前 K 个元素**：
  **使用大小为 $K$ 的大顶堆**。

---

### 2.3 BFS (广度优先搜索) 核心队列模板

BFS 遍历是队列最核心的图论/树形应用，其标准代码骨架如下：

```cpp
void bfs(TreeNode* root) {
    if (!root) return;
    std::queue<TreeNode*> q;
    q.push(root);

    while (!q.empty()) {
        int level_size = q.size(); // 当前层的节点总数
        for (int i = 0; i < level_size; ++i) {
            TreeNode* cur = q.front();
            q.pop();
            // 处理当前节点业务...
            if (cur->left)  q.push(cur->left);
            if (cur->right) q.push(cur->right);
        }
    }
}
```

---

### 2.4 队列高频题目速查

| 题目 | 难度 | 核心思路 |
| :--- | :--- | :--- |
| **LC 102. 二叉树的层序遍历** | Medium | 利用队列 BFS，外层每轮循环记录 `q.size()` 分层读取。 |
| **LC 200. 岛屿数量** | Medium | 遇到陆地使用队列 BFS 将相连陆地逐一出入队并标记为水（染色）。 |
| **LC 215. 数组中的第 K 个最大元素** | Medium | 大小为 $K$ 的小顶堆，或基于快速选择算法（QuickSelect）均摊 $O(n)$。 |
| **LC 225. 用队列实现栈** | Easy | 单队列：每次 `push` 入队后，循环将前面的元素依次出队再重新入队 $n-1$ 次。 |

---

## P2：工程实践与业务场景

### 3.1 异步事件队列 (Event Queue)

在游戏引擎与客户端系统中，各系统（输入、UI、音频、物理）之间禁止直接同步调用，而是将事件打包压入线程安全的**事件队列**：
* **解耦性**：UI 线程产生点击事件压入队列，主逻辑线程在每帧 Update 阶段按顺序批量出队处理。
* **流量削峰**：瞬间产生的大量事件暂存在队列中平滑处理，防止逻辑线程发生阻塞。

---

### 3.2 渲染命令缓冲 (Render Command Buffer)

现代游戏引擎采用多线程渲染架构：
* **逻辑线程**：计算世界状态，生成轻量级的渲染指令（如 `DrawMesh`、`SetMaterial`）压入队列。
* **渲染线程**：从队列中批量取出绘制命令，提交给底层图形 API（Vulkan/DirectX）。

---

### 3.3 网络数据包处理队列

网络 IO 线程接收到客户端原始 TCP/UDP 字节流后，先进行拆包与组包，确认是完整数据帧后放入接收队列；游戏主循环每 Tick 从队列中弹出定额的数据包进行逻辑结算，有效平滑网络抖动。

---

## P3：基础原理与参考实现

### 4.1 队列家族横向对比

| 容器类型 | 底层数据结构 | 头部操作 | 尾部操作 | 随机访问 | 适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`std::queue`** | `std::deque` 适配器 | `pop` $O(1)$ | `push` $O(1)$ | 不支持 | 基础先进先出调度 |
| **`std::deque`** | 分段连续数组 + 中控映射 | $O(1)$ | $O(1)$ | **$O(1)$** | 频繁双端增删且需要索引访问 |
| **`std::priority_queue`** | `std::vector` + 堆算法 | 堆顶弹出 $O(\log n)$ | 插入 $O(\log n)$ | 仅堆顶 | 优先级调度、Top-K |
| **循环队列** | 原生一维连续数组 | $O(1)$ | $O(1)$ | $O(1)$ | 无锁环形缓冲、网络包缓冲 |

---

### 4.2 手写原生数组循环队列完整参考实现

<details>
<summary>👉 查看手写基于原生数组的循环队列 (MyCircularQueue) 完整源码</summary>

```cpp
#include <vector>

class MyCircularQueue {
    std::vector<int> _data;
    int _head = 0;
    int _tail = 0;
    int _size = 0;
    int _capacity = 0;

public:
    MyCircularQueue(int k) : _data(k), _capacity(k) {}

    bool enQueue(int value) {
        if (isFull()) return false;
        _data[_tail] = value;
        _tail = (_tail + 1) % _capacity;
        ++_size;
        return true;
    }

    bool deQueue() {
        if (isEmpty()) return false;
        _head = (_head + 1) % _capacity;
        --_size;
        return true;
    }

    int Front() const {
        return isEmpty() ? -1 : _data[_head];
    }

    int Rear() const {
        if (isEmpty()) return -1;
        int idx = (_tail - 1 + _capacity) % _capacity;
        return _data[idx];
    }

    bool isEmpty() const { return _size == 0; }
    bool isFull() const { return _size == _capacity; }
};
```
</details>

---

> 📖 下一章：[第五章 哈希表：空间换时间的极致](../05_hash_table/) —— 从冲突解决策略到 std::unordered_map 底层架构，从 LRU Cache 到空间哈希碰撞优化。

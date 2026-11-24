---
title: "6.5 线段树 & 树状数组"
published: 2026-04-07
pinned: false
description: "数据结构笔记 · 线段树与树状数组。内容按优先级梳理：P0 核心考点（线段树 vs 树状数组核心对比、树状数组 lowbit 原理与单点增/前缀查手写）、P1 进阶原理（线段树 build/query/update、懒传播 Lazy Propagation 区间更新）、P2 游戏实战应用、P3 完整线段树 C++ 模板源码附录。"
tags: [数据结构, C++, 面试, SegmentTree, BIT, FenwickTree]
category: 数据结构笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 6.5 线段树与树状数组

> 在需要高频交替执行**动态单点/区间修改**与**区间聚合查询（和、最值）**时，前缀和与朴素数组均无法两全。线段树与树状数组能将这两类操作的时间复杂度全部均衡在 **$O(\log n)$**。

---

## 0. 考点优先级概览

根据面试常见考察频次与工程实用度，内容按优先级组织如下：

| 优先级 | 分类 | 核心内容 | 重点说明 |
| :--- | :--- | :--- | :--- |
| **P0** | **核心考点** | 线段树 vs 树状数组选型依据、树状数组 `lowbit` 机制与核心操作手写 | 极简高效区间结构与基础位运算推导 |
| **P1** | **进阶原理** | 线段树三大核心方法（递归建树、单点更新、区间查询）、懒传播 (Lazy Propagation) | 复杂区间修改算法与延迟下推机制 |
| **P2** | **业务实战** | 游戏动态视锥裁剪、区间重叠技能命中判定、离线区间逆序对统计 | 实际工程与算法进阶题型 |
| **P3** | **基础与附录** | 4N 空间复杂度原因、完整线段树类模板源码（可折叠） | 知识库查阅备忘 |

---

## P0：核心考点

### 1.1 线段树 vs 树状数组核心对比

| 维度 | 普通前缀和数组 | 树状数组 (Binary Indexed Tree / BIT) | 线段树 (Segment Tree) |
| :--- | :--- | :--- | :--- |
| **单点修改** | $O(n)$（后续前缀和需全量更新） | **$O(\log n)$** | **$O(\log n)$** |
| **区间查询** | **$O(1)$** | **$O(\log n)$** | **$O(\log n)$** |
| **区间修改** | $O(n)$ | 配合差分可支持区间修改 | **$O(\log n)$（支持 Lazy 标记）** |
| **适用运算** | 仅支持可逆运算（求和、异或） | **仅支持可逆结合律运算**（求和、异或，难以直接查区间最值） | **通用**（求和、最值、GCD 等任意结合律运算） |
| **代码量** | 极简（几行） | **极简（约 20 行）** | 较长（约 80~100 行） |
| **空间开销** | $N$ | **$N$（严格原地）** | **$4N$（通常需开辟 4 倍节点数组）** |

> 💡 **选型总结**：若是简单的**单点修改 + 区间求和**，首选**树状数组**（代码短、常数小、无空间浪费）；若是复杂的**区间修改（加乘赋值）+ 区间最值查询**，必须选**线段树**。

---

### 1.2 树状数组核心：`lowbit` 与树形跳跃

树状数组利用二进制的进位特性，将数组项组织为隐式树状结构。

#### 1. 核心公式：`lowbit(x)`
`lowbit(x)` 用于提取整数 $x$ 在二进制表示下**最低位的 1 及其后导 0 构成的数值**：
$$\text{lowbit}(x) = x \ \& \ (-x)$$
* **原理**：计算机采用补码，$-x = \sim x + 1$。按位与后，除最低位的 1 保留外，更高位全被清零。
* **物理意义**：`tree[i]` 负责管辖的区间长度恰好是 `lowbit(i)`，即区间 $[i - \text{lowbit}(i) + 1, \, i]$ 的累加和。

#### 2. 核心手撕：标准树状数组实现
```cpp
#include <vector>

class FenwickTree {
    std::vector<int> _tree;
    int _n;

    static int lowbit(int x) { return x & (-x); }

public:
    FenwickTree(int n) : _tree(n + 1, 0), _n(n) {}

    // 单点增加：下标 i 增加 delta，时间 O(log n)
    void add(int i, int delta) {
        for (; i <= _n; i += lowbit(i)) {
            _tree[i] += delta;
        }
    }

    // 查询前缀和 [1..i]，时间 O(log n)
    int query(int i) const {
        int sum = 0;
        for (; i > 0; i -= lowbit(i)) {
            sum += _tree[i];
        }
        return sum;
    }

    // 查询区间和 [l..r]
    int range_sum(int l, int r) const {
        return query(r) - query(l - 1);
    }
};
```

---

### 1.3 常见面试问答要点

* **Q：为什么线段树的数组空间必须开到 $4N$？**
  > **回答要点**：线段树是一棵满二叉树或完全二叉树。叶子节点有 $N$ 个，若 $N$ 刚好是 2 的幂（如 8），则整棵树刚好有 $2N - 1$ 个节点（占用约 $2N$ 空间）；但在最坏情况下，若 $N = 2^k + 1$（如 9），为了将树对齐补满，最后一层会延伸到第 $k+1$ 层，所需的连续数组最大索引会接近 $4N$。为了防止数组越界，工程上统一开辟 $4N$ 大小的安全数组。

* **Q：树状数组的下标为什么必须从 1 开始而不能从 0 开始？**
  > **回答要点**：因为 `lowbit(0) = 0 & (-0) = 0`。若下标为 0，执行 `i += lowbit(i)` 时将陷入无限死循环，永远停留在 0。因此树状数组强制采用 1-based indexing。

---

## P1：线段树与懒传播 (Lazy Propagation)

### 2.1 线段树三大核心操作骨架

线段树将区间 $[0, n-1]$ 递归二分为左右子区间：
1. **`build(node, l, r)`**：自顶向下划分，自底向上合并结果。
2. **`update(node, l, r, idx, val)`**：单点修改，二分向下寻找目标叶子，回溯时更新父节点。
3. **`query(node, l, r, ql, qr)`**：区间查询，若当前节点区间完全落在目标查询区间 $[ql, qr]$ 内则直接返回，否则拆分左右子树查询并合并。

---

### 2.2 懒传播 (Lazy Propagation) 核心思想

若需要频繁执行**区间批量修改**（如给区间 $[L, R]$ 内的所有数字都加上 $V$）：
* **直接递归修改**：必须访问到叶子节点，单次操作退化为 $O(n)$。
* **懒传播优化**：
  - 当修改区间完全覆盖当前节点管辖的区间时，**直接更新当前节点的聚合值，并在当前节点打上一个 `lazy` 暂存标记，随后立即返回，不再继续向下递归**！
  - 只有在后续的查询或更新操作**不得不访问其子节点时**，才顺带把暂存的 `lazy` 标记下推一层传递给左右子节点（`push_down`）。
  - **效果**：将区间修改的复杂度从 $O(n)$ 重新压缩回 **$O(\log n)$**。

---

## P2：工程与业务实战场景

1. **游戏战斗大范围 AOE 伤害统计**：场景网格离散化后，技能造成多段区间增益或伤害判定，通过线段树 Lazy 标记高效结算。
2. **离线动态逆序对求解**：树状数组维护元素出现频次，边遍历边查询当前已插入数据中大于当前值的数量。

---

## P3：基础原理与参考实现

### 3.1 手写线段树区间求和（带 Lazy 标记）参考源码

<details>
<summary>👉 查看支持区间加法与区间求和的线段树完整 C++ 实现</summary>

```cpp
#include <vector>

class SegmentTree {
    int _n;
    std::vector<int> _tree;
    std::vector<int> _lazy;

    void _push_down(int node, int l, int r) {
        if (_lazy[node] == 0) return;
        int mid = l + (r - l) / 2;
        int left = 2 * node + 1;
        int right = 2 * node + 2;

        _lazy[left] += _lazy[node];
        _tree[left] += _lazy[node] * (mid - l + 1);

        _lazy[right] += _lazy[node];
        _tree[right] += _lazy[node] * (r - mid);

        _lazy[node] = 0;
    }

public:
    SegmentTree(int n) : _n(n), _tree(4 * n, 0), _lazy(4 * n, 0) {}

    void update_range(int node, int l, int r, int ql, int qr, int val) {
        if (ql <= l && r <= qr) {
            _tree[node] += val * (r - l + 1);
            _lazy[node] += val;
            return;
        }
        _push_down(node, l, r);
        int mid = l + (r - l) / 2;
        if (ql <= mid) update_range(2 * node + 1, l, mid, ql, qr, val);
        if (qr > mid)  update_range(2 * node + 2, mid + 1, r, ql, qr, val);
        _tree[node] = _tree[2 * node + 1] + _tree[2 * node + 2];
    }

    int query_range(int node, int l, int r, int ql, int qr) {
        if (ql <= l && r <= qr) return _tree[node];
        _push_down(node, l, r);
        int mid = l + (r - l) / 2;
        int sum = 0;
        if (ql <= mid) sum += query_range(2 * node + 1, l, mid, ql, qr);
        if (qr > mid)  sum += query_range(2 * node + 2, mid + 1, r, ql, qr);
        return sum;
    }
};
```
</details>

---

> 📖 下一节：[6.6 游戏中的树形架构](./06_06_game_tree.md) —— 从场景图变换层级与脏标记更新，到行为树 AI 与四叉树空间划分。

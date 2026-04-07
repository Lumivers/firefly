---
title: "6.5 线段树 & 树状数组"
published: 2026-04-07
pinned: false
description: "**面试突击 · 线段树。** 区间查询与修改的利器——从线段树的递归实现到懒传播优化，从树状数组的 lowbit 技巧到逆序对计数，掌握区间问题的两大杀器。"
tags: [数据结构, C++, 面试, SegmentTree, BIT, FenwickTree]
category: 数据结构笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lonelystar"
image: ""
draft: false
---

# 6.5 线段树 & 树状数组

> **一句话理解**：当你需要在 O(log n) 内完成"区间求和 / 区间最值 / 区间修改"等操作时，线段树是最通用的方案，树状数组是最简洁的方案。两者都是面试中的进阶加分项。

---

## 6.5.1 问题背景 —— 为什么需要它们？

假设有一个数组 `arr[0..n-1]`，需要频繁执行：
1. **区间查询**：求 `arr[l..r]` 的和 / 最大值 / 最小值
2. **单点修改**：更新 `arr[i] = new_val`

| 方案 | 单点修改 | 区间查询 | 适用场景 |
|------|---------|---------|---------|
| 暴力遍历 | O(1) | **O(n)** | n 很小 |
| 前缀和 | **O(n)**（重建）| O(1) | 只有查询，不修改 |
| **线段树** | **O(log n)** | **O(log n)** | **动态修改 + 查询** |
| **树状数组** | **O(log n)** | **O(log n)** | 前缀和场景（更简洁）|

> 💡 前缀和数组在"不修改"的前提下是最优的（O(1) 查询）。但一旦需要**动态修改**，前缀和就崩了（修改一个元素要重建整个前缀和）。线段树和树状数组就是解决"**又要改又要查**"的利器。

---

## 6.5.2 线段树 (Segment Tree)

### 核心思想

线段树是一棵**完全二叉树**（用数组存储），每个节点存储一个**区间的聚合信息**（和 / 最大值等）。

```
数组: [2, 1, 5, 3, 4]

线段树（维护区间和）：

              [0,4]=15
             /        \
        [0,2]=8      [3,4]=7
        /    \        /   \
    [0,1]=3  [2,2]=5  [3,3]=3  [4,4]=4
    /   \
[0,0]=2 [1,1]=1

每个节点存的是：该区间内所有元素的和
```

### 三大操作

```
1. build（建树）     → O(n)
   自底向上，叶节点存原始值，内部节点存子区间的聚合值

2. query（区间查询） → O(log n)
   从根节点出发，将查询区间分解到线段树的节点上

3. update（单点修改） → O(log n)
   修改叶节点后，自底向上更新所有祖先节点
```

### C++ 实现 —— 区间求和

```cpp
class SegmentTree {
    int _n;
    std::vector<long long> _tree;  // 4n 大小足够

    // 建树
    void _build(const std::vector<int>& arr, int node, int start, int end) {
        if (start == end) {
            _tree[node] = arr[start];  // 叶节点
            return;
        }

        int mid = (start + end) / 2;
        _build(arr, 2 * node, start, mid);       // 左子树
        _build(arr, 2 * node + 1, mid + 1, end); // 右子树
        _tree[node] = _tree[2 * node] + _tree[2 * node + 1];  // 合并
    }

    // 单点修改：将 arr[idx] 更新为 val
    void _update(int node, int start, int end, int idx, int val) {
        if (start == end) {
            _tree[node] = val;  // 叶节点直接更新
            return;
        }

        int mid = (start + end) / 2;
        if (idx <= mid) {
            _update(2 * node, start, mid, idx, val);
        } else {
            _update(2 * node + 1, mid + 1, end, idx, val);
        }
        _tree[node] = _tree[2 * node] + _tree[2 * node + 1];  // 回溯更新
    }

    // 区间查询：求 arr[l..r] 的和
    long long _query(int node, int start, int end, int l, int r) {
        // 完全不重叠
        if (r < start || end < l) return 0;

        // 完全包含
        if (l <= start && end <= r) return _tree[node];

        // 部分重叠 → 分裂到两个子节点
        int mid = (start + end) / 2;
        return _query(2 * node, start, mid, l, r)
             + _query(2 * node + 1, mid + 1, end, l, r);
    }

public:
    SegmentTree(const std::vector<int>& arr) : _n(arr.size()), _tree(4 * arr.size(), 0) {
        if (!arr.empty()) _build(arr, 1, 0, _n - 1);
    }

    void update(int idx, int val) {
        _update(1, 0, _n - 1, idx, val);
    }

    long long query(int l, int r) {
        return _query(1, 0, _n - 1, l, r);
    }
};
```

### 查询过程图解

```
查询 query(1, 3)：求 arr[1..3] 的和

              [0,4]=15
             /        \
        [0,2]=8      [3,4]=7
        /    \        /   \
    [0,1]=3  [2,2]=5  [3,3]=3  [4,4]=4

1. 根 [0,4]: 查询 [1,3] 部分重叠 → 分裂
2. 左 [0,2]: 查询 [1,3] 部分重叠 → 分裂
3.   左 [0,1]: 查询 [1,3] 部分重叠 → 分裂
4.     左 [0,0]: 查询 [1,3] 不重叠 → 返回 0
5.     右 [1,1]: 查询 [1,3] 完全包含 → 返回 1
6.   右 [2,2]: 查询 [1,3] 完全包含 → 返回 5
7. 右 [3,4]: 查询 [1,3] 部分重叠 → 分裂
8.   左 [3,3]: 查询 [1,3] 完全包含 → 返回 3
9.   右 [4,4]: 查询 [1,3] 不重叠 → 返回 0

结果 = 0 + 1 + 5 + 3 + 0 = 9 ✅（arr[1]+arr[2]+arr[3] = 1+5+3 = 9）
```

> 💡 **O(log n) 的关键**：每一层最多访问 **2 个节点**（左右各一个"部分重叠"的节点）。树高 = O(log n)，所以总访问节点数 = O(2 log n) = O(log n)。

---

## 6.5.3 懒传播 (Lazy Propagation)

### 问题：区间修改

如果需要"将 `arr[l..r]` 所有元素加上 val"，朴素做法是逐个调用 `update`，时间 O(n log n)。懒传播可以将**区间修改**优化到 O(log n)。

**核心思想**：不立即更新到叶子，而是在内部节点上打一个"待下发"的标记（lazy tag）。只在需要时才把修改下发给子节点。

```cpp
class SegmentTreeLazy {
    int _n;
    std::vector<long long> _tree;
    std::vector<long long> _lazy;   // 懒标记

    void _build(const std::vector<int>& arr, int node, int start, int end) {
        _lazy[node] = 0;
        if (start == end) {
            _tree[node] = arr[start];
            return;
        }
        int mid = (start + end) / 2;
        _build(arr, 2*node, start, mid);
        _build(arr, 2*node+1, mid+1, end);
        _tree[node] = _tree[2*node] + _tree[2*node+1];
    }

    // 下发懒标记
    void _push_down(int node, int start, int end) {
        if (_lazy[node] == 0) return;

        int mid = (start + end) / 2;
        long long val = _lazy[node];

        // 更新左子节点
        _tree[2*node] += val * (mid - start + 1);
        _lazy[2*node] += val;

        // 更新右子节点
        _tree[2*node+1] += val * (end - mid);
        _lazy[2*node+1] += val;

        _lazy[node] = 0;  // 清除当前懒标记
    }

    // 区间修改：arr[l..r] 都加上 val
    void _range_update(int node, int start, int end, int l, int r, long long val) {
        if (r < start || end < l) return;

        if (l <= start && end <= r) {
            // 完全包含 → 打懒标记，不下发
            _tree[node] += val * (end - start + 1);
            _lazy[node] += val;
            return;
        }

        _push_down(node, start, end);  // 先下发旧的懒标记

        int mid = (start + end) / 2;
        _range_update(2*node, start, mid, l, r, val);
        _range_update(2*node+1, mid+1, end, l, r, val);
        _tree[node] = _tree[2*node] + _tree[2*node+1];
    }

    long long _query(int node, int start, int end, int l, int r) {
        if (r < start || end < l) return 0;
        if (l <= start && end <= r) return _tree[node];

        _push_down(node, start, end);  // 查询前先下发

        int mid = (start + end) / 2;
        return _query(2*node, start, mid, l, r)
             + _query(2*node+1, mid+1, end, l, r);
    }

public:
    SegmentTreeLazy(const std::vector<int>& arr)
        : _n(arr.size()), _tree(4 * arr.size(), 0), _lazy(4 * arr.size(), 0)
    {
        if (!arr.empty()) _build(arr, 1, 0, _n - 1);
    }

    void range_update(int l, int r, long long val) {
        _range_update(1, 0, _n - 1, l, r, val);
    }

    long long query(int l, int r) {
        return _query(1, 0, _n - 1, l, r);
    }
};
```

> 💡 **懒传播的精髓**：「能不动就不动」——修改信息先存在父节点上（lazy tag），等到**真正需要查子节点的值**时再下发。这样区间修改和区间查询都是 O(log n)。

---

## 6.5.4 树状数组 (Binary Indexed Tree / Fenwick Tree)

### 核心思想

树状数组（BIT）是线段树的"轻量替代品"——用更少的代码、更少的内存实现**前缀和的动态维护**。

**核心技巧**：`lowbit(x) = x & (-x)`，提取 x 的二进制最低位 1。

```
lowbit 示例：
  x = 6  = 110₂   → lowbit = 010₂ = 2
  x = 12 = 1100₂  → lowbit = 100₂ = 4
  x = 8  = 1000₂  → lowbit = 1000₂ = 8
  x = 7  = 111₂   → lowbit = 001₂ = 1
```

### 树状数组的结构

```
原数组 a[1..8] (1-indexed):

BIT[i] 存储的区间：
  BIT[1] = a[1]           (lowbit(1)=1, 管 1 个)
  BIT[2] = a[1] + a[2]    (lowbit(2)=2, 管 2 个)
  BIT[3] = a[3]           (lowbit(3)=1, 管 1 个)
  BIT[4] = a[1..4]        (lowbit(4)=4, 管 4 个)
  BIT[5] = a[5]           (lowbit(5)=1, 管 1 个)
  BIT[6] = a[5] + a[6]    (lowbit(6)=2, 管 2 个)
  BIT[7] = a[7]           (lowbit(7)=1, 管 1 个)
  BIT[8] = a[1..8]        (lowbit(8)=8, 管 8 个)

可视化（每个节点管理其下方的区间）：
                BIT[8]
        ┌───────┴───────┐
      BIT[4]          BIT[6]
    ┌───┴───┐       ┌───┴───┐
  BIT[2]  BIT[3]  BIT[5]  BIT[7]
  ┌─┴─┐
BIT[1]
```

### C++ 实现

```cpp
class BIT {
    int _n;
    std::vector<long long> _tree;  // 1-indexed

    int _lowbit(int x) const { return x & (-x); }

public:
    BIT(int n) : _n(n), _tree(n + 1, 0) {}

    // 从已有数组建树 → O(n)
    BIT(const std::vector<int>& arr) : _n(arr.size()), _tree(arr.size() + 1, 0) {
        for (int i = 0; i < _n; ++i) {
            update(i + 1, arr[i]);  // 转 1-indexed
        }
    }

    // 单点修改：a[i] += delta → O(log n)
    void update(int i, long long delta) {
        for (; i <= _n; i += _lowbit(i)) {
            _tree[i] += delta;
        }
    }

    // 前缀和查询：sum(a[1..i]) → O(log n)
    long long prefix_sum(int i) const {
        long long sum = 0;
        for (; i > 0; i -= _lowbit(i)) {
            sum += _tree[i];
        }
        return sum;
    }

    // 区间和：sum(a[l..r]) → O(log n)
    long long range_sum(int l, int r) const {
        return prefix_sum(r) - prefix_sum(l - 1);
    }
};
```

### update 与 query 的过程

```
update(3, +5)：从 3 开始，沿 lowbit 路径向上
  3 (011₂) → +lowbit(3)=1 → 4 (100₂) → +lowbit(4)=4 → 8 (1000₂)
  更新: BIT[3], BIT[4], BIT[8]

prefix_sum(7)：从 7 开始，沿 lowbit 路径向下
  7 (111₂) → -lowbit(7)=1 → 6 (110₂) → -lowbit(6)=2 → 4 (100₂) → -lowbit(4)=4 → 0
  累加: BIT[7] + BIT[6] + BIT[4] = a[7] + (a[5]+a[6]) + (a[1..4])
```

> 💡 **树状数组 vs 线段树**：树状数组代码量只有线段树的 1/3，且常数更小。但它只能处理**满足区间可减性**的问题（如求和、异或），不能处理区间最值（max/min 不可减）。需要区间最值就必须用线段树。

---

## 6.5.5 线段树 vs 树状数组 —— 选型对比

| 维度 | 线段树 | 树状数组 |
|------|--------|---------|
| 代码量 | ~60 行 | **~20 行** |
| 常数大小 | 较大（递归开销）| **较小** |
| 空间 | 4n | **n+1** |
| 单点修改 + 区间求和 | ✅ O(log n) | ✅ O(log n) |
| **区间修改** + 区间求和 | ✅ 懒传播 | ✅ 差分技巧 |
| 区间最值（max/min） | ✅ | ❌ |
| 区间修改 + 区间最值 | ✅ | ❌ |
| 面试手写难度 | ⭐⭐⭐ | ⭐ |

**选择建议**：

```
只需要前缀和 + 单点修改 → 树状数组（简洁高效）
需要区间最值 → 线段树（唯一选择）
需要区间修改 + 区间查询 → 线段树 + 懒传播
面试手写 → 优先树状数组（代码短、不容易出错）
```

---

## 6.5.6 面试高频题

### 区域和检索 - 数组可修改 (LeetCode 307)

> 给定一个整数数组，实现 `update(i, val)` 和 `sumRange(l, r)` 两个操作。

**树状数组解法**（最简洁）：

```cpp
class NumArray {
    int _n;
    std::vector<int> _arr;
    std::vector<long long> _bit;

    int _lowbit(int x) { return x & (-x); }

    void _add(int i, long long delta) {
        for (++i; i <= _n; i += _lowbit(i))  // 转 1-indexed
            _bit[i] += delta;
    }

    long long _prefix(int i) {
        long long sum = 0;
        for (++i; i > 0; i -= _lowbit(i))
            sum += _bit[i];
        return sum;
    }

public:
    NumArray(std::vector<int>& nums) : _n(nums.size()), _arr(nums), _bit(nums.size() + 1, 0) {
        for (int i = 0; i < _n; ++i) _add(i, nums[i]);
    }

    void update(int index, int val) {
        _add(index, val - _arr[index]);  // 差值更新
        _arr[index] = val;
    }

    int sumRange(int left, int right) {
        return static_cast<int>(_prefix(right) - _prefix(left - 1));
    }
};
// update: O(log n), sumRange: O(log n)
```

### 逆序对计数 (LeetCode 315 / 剑指 Offer 51)

> 计算数组中的逆序对数量：`i < j 且 nums[i] > nums[j]` 的 (i,j) 对数。

**方法一：归并排序（分治）**

```cpp
int mergeCount(std::vector<int>& arr, int lo, int hi) {
    if (lo >= hi) return 0;

    int mid = (lo + hi) / 2;
    int count = mergeCount(arr, lo, mid) + mergeCount(arr, mid + 1, hi);

    std::vector<int> tmp;
    int i = lo, j = mid + 1;

    while (i <= mid && j <= hi) {
        if (arr[i] <= arr[j]) {
            tmp.push_back(arr[i++]);
        } else {
            count += (mid - i + 1);  // arr[i..mid] 都与 arr[j] 构成逆序对
            tmp.push_back(arr[j++]);
        }
    }

    while (i <= mid) tmp.push_back(arr[i++]);
    while (j <= hi) tmp.push_back(arr[j++]);

    for (int k = lo; k <= hi; ++k) arr[k] = tmp[k - lo];

    return count;
}
// 时间 O(n log n), 空间 O(n)
```

**方法二：树状数组**

```cpp
// 从右往左扫描，用 BIT 统计"已经出现的比当前值小的数"
int countInversions(std::vector<int>& nums) {
    // 离散化（将值映射到 1..n 的范围）
    std::vector<int> sorted = nums;
    std::sort(sorted.begin(), sorted.end());
    sorted.erase(std::unique(sorted.begin(), sorted.end()), sorted.end());

    auto rank = [&](int val) {
        return std::lower_bound(sorted.begin(), sorted.end(), val) - sorted.begin() + 1;
    };

    int n = sorted.size();
    BIT bit(n);
    int count = 0;

    // 从右往左扫描
    for (int i = nums.size() - 1; i >= 0; --i) {
        int r = rank(nums[i]);
        count += bit.prefix_sum(r - 1);  // 比 nums[i] 小的已出现元素数
        bit.update(r, 1);                 // 标记 nums[i] 已出现
    }

    return count;
}
// 时间 O(n log n), 空间 O(n)
```

> 💡 **逆序对 = 归并排序的副产品**。归并排序在合并时天然能统计跨区间的逆序对数。树状数组方法更灵活——它的思路是"边扫描边统计已出现的比我小的数"。

### 区间最大值查询（线段树经典应用）

```cpp
class SegmentTreeMax {
    int _n;
    std::vector<int> _tree;

    void _build(const std::vector<int>& arr, int node, int start, int end) {
        if (start == end) { _tree[node] = arr[start]; return; }
        int mid = (start + end) / 2;
        _build(arr, 2*node, start, mid);
        _build(arr, 2*node+1, mid+1, end);
        _tree[node] = std::max(_tree[2*node], _tree[2*node+1]);  // 改为 max
    }

    void _update(int node, int start, int end, int idx, int val) {
        if (start == end) { _tree[node] = val; return; }
        int mid = (start + end) / 2;
        if (idx <= mid) _update(2*node, start, mid, idx, val);
        else _update(2*node+1, mid+1, end, idx, val);
        _tree[node] = std::max(_tree[2*node], _tree[2*node+1]);
    }

    int _query(int node, int start, int end, int l, int r) {
        if (r < start || end < l) return INT_MIN;
        if (l <= start && end <= r) return _tree[node];
        int mid = (start + end) / 2;
        return std::max(_query(2*node, start, mid, l, r),
                        _query(2*node+1, mid+1, end, l, r));
    }

public:
    SegmentTreeMax(const std::vector<int>& arr)
        : _n(arr.size()), _tree(4 * arr.size(), INT_MIN) {
        if (!arr.empty()) _build(arr, 1, 0, _n - 1);
    }

    void update(int idx, int val) { _update(1, 0, _n-1, idx, val); }
    int query(int l, int r) { return _query(1, 0, _n-1, l, r); }
};
```

> 💡 线段树的 `merge` 函数决定了它能维护什么信息。把 `+` 换成 `max` 就是区间最大值，换成 `min` 就是区间最小值，换成 `gcd` 就是区间 GCD。这就是线段树比树状数组**更通用**的原因。

---

## 6.5.7 🎮 游戏实战场景

### 实时伤害统计

```cpp
// 每秒的伤害记录，支持查询"最近 N 秒的总伤害"
class DamageTracker {
    BIT _bit;
    int _max_seconds;

public:
    DamageTracker(int max_seconds) : _bit(max_seconds), _max_seconds(max_seconds) {}

    // 在第 t 秒记录伤害
    void record_damage(int second, int damage) {
        _bit.update(second, damage);
    }

    // 查询最近 duration 秒的总伤害
    long long recent_damage(int current_second, int duration) {
        int from = std::max(1, current_second - duration + 1);
        return _bit.range_sum(from, current_second);
    }
};
```

### 动态排行榜排名查询

```cpp
// 已知分数范围 [0, MAX_SCORE]
// 支持：添加/删除玩家分数、查询某分数的排名
class Leaderboard {
    BIT _bit;
    int _max_score;

public:
    Leaderboard(int max_score) : _bit(max_score + 1), _max_score(max_score) {}

    void add_player(int score) {
        _bit.update(score + 1, 1);  // 1-indexed
    }

    void remove_player(int score) {
        _bit.update(score + 1, -1);
    }

    // 排名 = 分数 > score 的玩家数 + 1
    int get_rank(int score) {
        long long higher = _bit.range_sum(score + 2, _max_score + 1);
        return static_cast<int>(higher) + 1;
    }
};
```

---

## 6.5.8 面试题速查表

| 题号 | 题目 | 核心技巧 | 难度 |
|------|------|----------|------|
| LC 307 | 区域和检索（可修改）| **树状数组 / 线段树** | Medium |
| LC 315 | 逆序对计数 | 归并排序 / **树状数组** | Hard |
| LC 327 | 区间和的个数 | 归并排序 / 线段树 | Hard |
| LC 493 | 翻转对 | 归并排序 / 树状数组 | Hard |
| 剑指 51 | 逆序对 | 同 LC 315 | Hard |
| — | 区间最大值查询 (RMQ) | **线段树** | 手写 |
| — | 区间修改 + 区间查询 | **线段树 + 懒传播** | 进阶 |

---

## 6.5.9 本节小结

### 核心要点

| 概念 | 要点 |
|------|------|
| **线段树** | 完全二叉树，每个节点存区间聚合值。单点修改 / 区间查询 O(log n) |
| **懒传播** | 区间修改的优化——先打标记，查询时再下发。区间修改 + 查询都是 O(log n) |
| **树状数组** | 基于 lowbit 的轻量方案。代码短、常数小，但只能处理"可减"的操作（和、异或）|
| **选型** | 前缀和 + 单点修改 → BIT；区间最值 / 复杂区间操作 → 线段树 |
| **面试定位** | 进阶加分项。大厂偶尔考，竞赛常考。掌握 BIT 即可覆盖 80% 场景 |

### 面试 30 秒速答

> **Q：线段树是什么？什么时候用？**
>
> A：线段树是一棵完全二叉树，每个节点存储一个**区间的聚合信息**（和、最值等）。当需要**动态修改数组元素**且**频繁查询区间聚合值**时使用。单点修改和区间查询都是 O(log n)。如果还需要区间修改，可以用**懒传播**优化。

> **Q：树状数组和线段树的区别？**
>
> A：树状数组代码更短（~20 行 vs ~60 行）、常数更小，但只能处理**可减**的操作（如求和——区间和 = 前缀和相减）。区间最值（max/min）不可减，必须用线段树。面试中如果只需要区间求和，优先写树状数组。

---

> 📖 上一节：[6.4 堆与优先队列](./06_04_heap)
>
> 📖 下一节：[6.6 实战场景：场景树、骨骼动画与行为树](./06_06_game_tree)

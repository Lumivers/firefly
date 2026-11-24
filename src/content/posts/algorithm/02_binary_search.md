---
title: "第二章 二分查找与二分答案"
published: 2026-04-28
pinned: false
description: "算法笔记 · 二分查找与减治范式。内容按优先级梳理：P0 核心考点（减治法思想、二分查找边界模板、lower_bound 与 upper_bound 手写）、P1 二分答案法范式（check 函数设计与单调性、旋转排序数组、寻找峰值）、P2 游戏开发 LOD 距离层级二分与浮点数二分、P3 减治法全景理论附录。"
tags: [算法, 二分查找, 二分答案, 减治法, 面试, C++]
category: 算法笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 第二章 二分查找与减治范式

> 二分查找是经典**减治法 (Decrease and Conquer)** 的代表。它通过利用问题的**单调性**，每次将搜索空间精确**折半排除**，从而在 **$O(\log n)$** 时间内完成极速检索。而**二分答案法**更进一步将这一技巧升华为了“猜答案并验证可行性”的通用算法设计范式。

---

## 0. 考点优先级概览

根据面试常见考察频次与工程实用度，内容按优先级组织如下：

| 优先级 | 分类 | 核心内容 | 重点说明 |
| :--- | :--- | :--- | :--- |
| **P0** | **核心考点** | 减治法核心思想（减半无合并）、二分查找边界开闭模板、`lower_bound` 与 `upper_bound` 手撕 | 必考基础，边界条件与循环不变量 |
| **P1** | **二分答案与变体** | 二分答案法思维框架（`check(mid)` 单调性）、旋转排序数组查找、寻找峰值 (局部有序) | 高频进阶考点，从查找技巧升华到算法范式 |
| **P2** | **工程与游戏实战** | 浮点数二分精度控制、游戏网格 LOD (Level of Detail) 距离层级检索 | 实际开发与图形渲染参数决策 |
| **P3** | **基础与附录** | 减治法全景分类（减常数、减常数因子、减可变规模）、二分查找易错边界汇总 | 理论常识备忘 |

---

## P0：核心考点

### 1.1 减治法 (Decrease and Conquer) vs 分治法

算法课中的经典核心辨析：
* **分治法 (Divide and Conquer)**：将原问题拆解为**多个**子问题，分别递归求解所有子问题，最后必须执行**合并 (Combine)** 步骤（如归并排序需递归处理左右两半，再双路合并）。
* **减治法 (Decrease and Conquer)**：每次将问题规模缩小一个因子（如折半缩小为 $n/2$），但**仅需深入其中一个子分支，直接丢弃另一半无效分支，且完全不需要合并操作**！
* **效率差异**：因为每次只探查单分支，减治法的递归深度与时间复杂度仅为 **$O(\log n)$**，远快于分治法的 $O(n \log n)$。

---

### 1.2 核心手撕 1：二分查找统一闭区间模板

二分查找看似简单，但边界控制（`left <= right` 还是 `<`、`mid + 1` 还是 `mid`）极易引发死循环或越界漏判。
**推荐工业级标准：统一采用闭区间 `[left, right]` 循环不变量原则**。

```cpp
#include <vector>

int binarySearch(const std::vector<int>& nums, int target) {
    int left = 0;
    int right = static_cast<int>(nums.size()) - 1; // 闭区间 [left, right]

    while (left <= right) { // 区间不为空时循环
        // 核心防溢出：避免 (left + right) 超过 INT_MAX
        int mid = left + (right - left) / 2;

        if (nums[mid] == target) {
            return mid; // 命中
        } else if (nums[mid] < target) {
            left = mid + 1; // 目标在右半区间 [mid + 1, right]
        } else {
            right = mid - 1; // 目标在左半区间 [left, mid - 1]
        }
    }
    return -1; // 未找到
}
```

---

### 1.3 核心手撕 2：寻找左右边界 (`lower_bound` 与 `upper_bound`)

当有序数组中包含**重复元素**时，标准二分仅返回任意一个匹配位置，而 STL 的 `lower_bound` 与 `upper_bound` 能精确锁定边界：

* **`lower_bound`**：寻找**第一个 $\ge target$** 的元素位置（左边界）。
* **`upper_bound`**：寻找**第一个 $> target$** 的元素位置（右边界）。

```cpp
// 寻找第一个 >= target 的下标 (lower_bound)
int lowerBound(const std::vector<int>& nums, int target) {
    int left = 0, right = static_cast<int>(nums.size()) - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] >= target) {
            right = mid - 1; // 尝试向左收缩寻找更靠前的解
        } else {
            left = mid + 1;
        }
    }
    return left; // 返回插入位置或第一个满足条件的下标
}

// 寻找第一个 > target 的下标 (upper_bound)
int upperBound(const std::vector<int>& nums, int target) {
    int left = 0, right = static_cast<int>(nums.size()) - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (nums[mid] > target) {
            right = mid - 1;
        } else {
            left = mid + 1;
        }
    }
    return left;
}
```

---

### 1.4 常见面试问答要点

* **Q：二分查找必须要求数组全局完全有序吗？**
  > **回答要点**：**不必须！** 二分查找的核心灵魂是**单调性与“可二段性”**（能根据中点条件将搜索空间划分为“有解半区”和“无解半区”，并排除其中一半）。例如：
  > 1. **旋转排序数组 (LC 33)**：中点切分后至少有一半是严格有序的。
  > 2. **寻找峰值 (LC 162)**：数组完全无序，但只要当前斜率向上（`nums[mid] < nums[mid+1]`），峰值必然在右侧，仍然可以二分排除左侧。

* **Q：计算中点为什么必须写成 `left + (right - left) / 2`？**
  > **回答要点**：若写成 `(left + right) / 2`，当数组规模极大、`left` 与 `right` 均接近 20 亿（`INT_MAX`）时，两数相加会直接发生整型带符号溢出变为负数，导致下标计算崩溃。写成减法形式在数学上等价，但在计算机底层能严格防止整型溢出。

---

## P1：二分答案法 (Binary Search on Answer)

### 2.1 算法范式：将“求解问题”转换为“判定问题”

在很多复杂优化问题中，直接推导计算“最优解数值是多少”极其困难；但如果换一个角度：**“给定一个假定值 $X$，验证 $X$ 是否可行”**却可以在 $O(n)$ 线性时间内轻松验证。

#### 核心三步法则
1. **确认单调性**：若答案 $X$ 可行，则比 $X$ 更大（或更小）的值也必定可行（具备单调二段性）。
2. **界定答案搜索范围**：确定下界 `low`（理论可能最小值）与上界 `high`（理论可能最大值）。
3. **编写判定函数 `check(mid)`**：二分猜测一个 `mid`，根据 `check(mid)` 的布尔返回结果，向左或向右缩小一半搜索范围。

#### 典型模板：爱吃香蕉的珂珂 (LeetCode 875)
> 寻找在 $H$ 小时内吃完所有香蕉的**最小速度 $K$**。

```cpp
#include <vector>
#include <algorithm>

bool check(const std::vector<int>& piles, int h, int k) {
    long long hours = 0;
    for (int p : piles) {
        hours += (p + k - 1) / k; // 上取整
    }
    return hours <= h;
}

int minEatingSpeed(const std::vector<int>& piles, int h) {
    int low = 1;
    int high = *std::max_element(piles.begin(), piles.end());
    int ans = high;

    while (low <= high) {
        int mid = low + (high - low) / 2;
        if (check(piles, h, mid)) {
            ans = mid;        // 当前速度可行，尝试寻找更慢的更优解
            high = mid - 1;
        } else {
            low = mid + 1;    // 速度太慢吃不完，必须提速
        }
    }
    return ans;
}
```

---

### 2.2 搜索旋转排序数组 (LeetCode 33)

* **核心洞察**：将旋转数组在中点切开，**左半段 `[l, mid]` 和右半段 `[mid, r]` 中，至少有一半是完全连续升序的**！
  - 若 `nums[l] <= nums[mid]`：说明左半段严格升序。若目标值落在 `[nums[l], nums[mid])` 内，则向左收缩，否则向右搜。
  - 否则：说明右半段严格升序。若目标值落在 `(nums[mid], nums[r]]` 内，则向右收缩，否则向左搜。

---

## P2：工程实践与业务场景

### 3.1 浮点数二分查找与精度控制

在物理模拟、几何计算中寻找零点或交点：
* **方法 1：指定精度阈值**：`while (right - left > 1e-6)`。
* **方法 2：固定迭代次数（工业级更推荐）**：`for (int iter = 0; iter < 100; ++iter)`。
  - 优点：$2^{100} \approx 10^{30}$，迭代 100 次能将区间缩小至极小量，且**绝无死循环风险**，耗时恒定可控。

---

### 3.2 游戏 LOD (Level of Detail) 模型细节分级

开放世界渲染中，摄像机离物体的距离决定了加载高模、中模还是低模：
* 距离阈值表有序排列（如 `[50m, 150m, 500m, 1000m]`）。
* 渲染引擎利用 `std::upper_bound` 极速定位当前摄像机距离所属的 LOD 档位，毫秒级切换模型网格，减少渲染负载。

---

## P3：基础原理与参考实现

### 3.1 经典题目速查

| 题目 | 难度 | 核心思路 |
| :--- | :--- | :--- |
| **LC 35. 搜索插入位置** | Easy | 标准 `lower_bound` 查找第一个 $\ge target$ 的下标。 |
| **LC 34. 查找元素的第一个和最后一个位置** | Medium | 分别执行 `lower_bound` 寻找左界，`upper_bound - 1` 寻找右界。 |
| **LC 33. 搜索旋转排序数组** | Medium | 划分后必定有一半严格有序，判断目标是否落在有序半区内。 |
| **LC 162. 寻找峰值** | Medium | 若 `nums[mid] < nums[mid+1]` 则右侧必有峰值，向右二分收缩。 |
| **LC 1011. 在 D 天内送达包裹的能力** | Medium | 二分答案法：`low = max(weights)`，`high = sum(weights)`，贪心检验天数。 |

---

> 📖 下一节：[第三章 动态规划基础](./03_dp_basic.md) —— 最优子结构与状态转移，从线性 DP 到背包模型。

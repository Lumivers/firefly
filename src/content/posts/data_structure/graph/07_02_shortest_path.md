---
title: "7.2 最短路径：Dijkstra & A*"
published: 2026-04-14
pinned: false
description: "数据结构笔记 · 最短路径算法。内容按优先级梳理：P0 核心考点（四大最短路算法选型决策总表、Dijkstra 堆优化手撕模板与负权限制）、P1 进阶算法（Bellman-Ford/SPFA 负权环检测、Floyd-Warshall 全源 DP 循环顺序）、P2 游戏实战（A* 启发式寻路算法与网格优化）、P3 复杂度与参考源码附录。"
tags: [数据结构, C++, 面试, Graph, Dijkstra, AStar, ShortestPath]
category: 数据结构笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 7.2 最短路径算法

> 最短路径问题是带权图论中最核心的应用模型：在由带权边构成的网络中，寻找两点之间权重总和最小的通路。四种主流算法依据**单源/全源**以及**边权是否允许为负**形成了清晰的技术选型分工。

---

## 0. 考点优先级概览

根据面试常见考察频次与工程实用度，内容按优先级组织如下：

| 优先级 | 分类 | 核心内容 | 重点说明 |
| :--- | :--- | :--- | :--- |
| **P0** | **核心考点** | 最短路四大算法选型总表、Dijkstra 堆优化标准手撕模板、为什么不能有负权边 | 最核心的高频单源最短路手撕算法 |
| **P1** | **经典进阶** | Bellman-Ford 与 SPFA 负权环检测机制、Floyd-Warshall 动态规划及循环顺序 | 处理负权边与全源距离矩阵 |
| **P2** | **游戏实战** | A* 启发式搜索 (Heuristic Search)、评估函数 $f=g+h$、网格寻路优化 | 游戏客户端与 AI 寻路最高频实战算法 |
| **P3** | **基础与附录** | 完整 Dijkstra 堆优化 C++ 模板源码（可折叠） | 知识库备忘查阅 |

---

## P0：核心考点

### 1.1 最短路径四大核心算法选型总表

| 算法名称 | 算法思想 | 单源 / 全源 | 边权约束 | 时间复杂度 | 核心优势与适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dijkstra (堆优化)** | 贪心 + 优先队列 | 单源 (Single Source) | **必须全部为非负权** | **$O(E \log V)$** | **最常用的单源最短路算法**，效率极高 |
| **Bellman-Ford / SPFA** | 动态规划 / 松弛 | 单源 | **允许存在负权边** | $O(V \cdot E)$ (SPFA 均摊更快) | **能检测图中是否存在负权回路** |
| **Floyd-Warshall** | 动态规划 (三维DP压缩) | **多源 / 全源 (All Pairs)** | 允许负权，不可有负环 | **$O(V^3)$** | 代码极短（三重循环），适合顶点规模较小的稠密图 |
| **A\* 算法** | 启发式搜索 (带评估函数) | 点到点 (Point to Point) | 非负权，需定义启发函数 | 最优 $O(E)$，最坏退化为 Dijkstra | **游戏与机器人网格地图寻路首选** |

---

### 1.2 核心手撕：Dijkstra 堆优化标准实现

* **贪心本质**：将顶点划分为“已确定最短距离集合”与“未确定集合”。每次从未确定集合中**贪心选取距离起点最近的顶点**加入确定集合，并用该顶点对其所有邻接边执行**松弛 (Relaxation)** 操作。
* **优先队列优化**：使用小顶堆（`priority_queue`）存储 `(dist, u)` 键值对，将“寻找最近未确定点”的耗时从 $O(V)$ 降低至 $O(\log V)$。

```cpp
#include <vector>
#include <queue>
#include <utility>

const int INF = 1e9;

// 邻接表结构：adj[u] 存放若干 (v, weight)
std::vector<int> dijkstra(int n, int start, const std::vector<std::vector<std::pair<int, int>>>& adj) {
    std::vector<int> dist(n, INF);
    // 小顶堆存 (当前距离, 顶点编号)
    using PII = std::pair<int, int>;
    std::priority_queue<PII, std::vector<PII>, std::greater<PII>> pq;

    dist[start] = 0;
    pq.push({0, start});

    while (!pq.empty()) {
        auto [d, u] = pq.top();
        pq.pop();

        // 懒惰删除：若从堆中取出的距离大于已记录的更优解，直接跳过
        if (d > dist[u]) continue;

        for (auto& [v, weight] : adj[u]) {
            // 松弛操作
            if (dist[u] + weight < dist[v]) {
                dist[v] = dist[u] + weight;
                pq.push({dist[v], v});
            }
        }
    }
    return dist;
}
```
* **时空复杂度**：时间复杂度为 **$O(E \log V)$**，空间复杂度为 $O(V + E)$。

---

### 1.3 常见面试问答要点

* **Q：为什么 Dijkstra 算法无法处理含有负权边的图？**
  > **回答要点**：Dijkstra 的算法正确性依赖于一个数学前置假设：**一旦某个节点从未确定集合中被选出为全局最小距离点，该节点的最终最短距离即已永久敲定，后续绝不可能被其他路径更新得更短**。这一假设在所有边权均为非负数时恒成立；但若存在负权边，一条经过更多边的折返路径其总和反而可能更小，破坏了贪心选择的最优子结构，导致算法得出错误结果。

* **Q：如果图中存在负权边，该如何求解？**
  > **回答要点**：必须选用 **Bellman-Ford 算法** 或其队列优化版本 **SPFA**。它对整张图的所有边执行至多 $V-1$ 轮全量松弛，即便边权为负也能正确计算。如果在第 $V$ 轮松弛时依然能使得某个节点的距离变短，则证明图中存在**负权环 (Negative Cycle)**（路径权值可以无限缩小，此时最短路无解）。

---

## P1：经典算法模型

### 2.1 Floyd-Warshall 全源最短路径：为什么 $k$ 必须在最外层？

Floyd 算法通过三重循环计算任意两点 $(i, j)$ 之间的最短路：

```cpp
// 核心状态转移方程：通过中继节点 k 进行松弛
for (int k = 0; k < n; ++k) {         // 必须在最外层！
    for (int i = 0; i < n; ++i) {
        for (int j = 0; j < n; ++j) {
            if (dist[i][k] != INF && dist[k][j] != INF) {
                dist[i][j] = std::min(dist[i][j], dist[i][k] + dist[k][j]);
            }
        }
    }
}
```

* **原理解析**：
  Floyd 本质是动态规划。定义状态 $dp[k][i][j]$ 为：**“仅允许以节点 $0, 1, \dots, k$ 作为中继路径节点时，$i$ 到 $j$ 的最短距离”**。
  $$dp[k][i][j] = \min(dp[k-1][i][j], \, dp[k-1][i][k] + dp[k-1][k][j])$$
  为了计算第 $k$ 阶段的状态，必须确保**第 $k-1$ 阶段的所有点对计算已经全部完成**。因此中继节点 $k$ 代表动态规划的阶段推进步长，**必须位于最外层循环**。

---

## P2：工程实践：A* 启发式寻路算法

在游戏引擎与地图导航中，Dijkstra 算法如同同心圆一样向全方向均匀扩散，探索了大量与目标方向完全相反的无用节点。
**A\* 算法**引入了**启发评估函数 (Heuristic Function)**：
$$f(n) = g(n) + h(n)$$
* $g(n)$：从起点到当前节点 $n$ 的实际已花费代价（等同于 Dijkstra 中的距离）。
* $h(n)$：从节点 $n$ 到终点的预估剩余代价。
* $f(n)$：综合评估代价，优先队列按照 $f(n)$ 的大小进行小顶堆调度。

#### 常用启发函数 $h(n)$
1. **曼哈顿距离 (Manhattan Distance)**：仅允许四向移动时（上下左右）：
   $$h(n) = |x_n - x_{\text{target}}| + |y_n - y_{\text{target}}|$$
2. **欧几里得距离 (Euclidean Distance)**：允许任意角度自由移动时：
   $$h(n) = \sqrt{(x_n - x_{\text{target}})^2 + (y_n - y_{\text{target}})^2}$$

> ⚠️ **启发函数的约束条件（可容许性 Admissibility）**：
> 启发函数 $h(n)$ 的估算值**必须小于或等于真实最短距离**（即绝不能高估）。只要满足这一条件，A\* 算法保证必定能寻找到全局最优解。

---

## P3：基础原理与参考实现

### 3.1 经典算法速查

| 题目 | 难度 | 核心思路 |
| :--- | :--- | :--- |
| **LC 743. 网络延迟时间** | Medium | 单源最短路径，使用 Dijkstra 堆优化求起点到所有点的最长距离。 |
| **LC 787. K 站中转内最便宜的航班** | Medium | 限定步数的最短路，标准 Bellman-Ford 算法循环至多 $K+1$ 轮。 |
| **LC 1334. 阈值距离内邻居最少的城市** | Medium | 顶点规模较小（$N \le 100$），标准 Floyd-Warshall 三重循环求解全源矩阵。 |

---

> 📖 下一节：[7.3 最小生成树与拓扑排序](./07_03_mst_topo.md) —— 从 Kruskal 贪心并查集到 Prim 算法，从 Kahn 拓扑排序到依赖解析。

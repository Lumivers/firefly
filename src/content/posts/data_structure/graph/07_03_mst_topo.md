---
title: "7.3 最小生成树 & 拓扑排序"
published: 2026-04-14
pinned: false
description: "数据结构笔记 · 最小生成树与拓扑排序。内容按优先级梳理：P0 核心考点（Kahn 算法拓扑排序与成环检测、Kruskal 最小生成树与并查集手撕、Kruskal vs Prim 选型）、P1 进阶算法（DFS 三色标记拓扑排序、Prim 算法堆优化）、P2 游戏实战（技能树前置依赖解锁、构建依赖图、迷宫生成）、P3 基础参考实现源码附录。"
tags: [数据结构, C++, 面试, Graph, MST, TopologicalSort, Kruskal, Prim]
category: 数据结构笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 7.3 最小生成树与拓扑排序

> 最小生成树 (MST) 解决的是“以**最小边权总和**将网络中所有顶点连通”的成本优化问题；拓扑排序解决的是“在有向无环图 (DAG) 中寻找符合**先后依赖约束**的线性执行序列”的调度问题。

---

## 0. 考点优先级概览

根据面试常见考察频次与工程实用度，内容按优先级组织如下：

| 优先级 | 分类 | 核心内容 | 重点说明 |
| :--- | :--- | :--- | :--- |
| **P0** | **核心考点** | Kahn 算法拓扑排序 (入度表+队列)、课程表成环检测 (LC 207)、Kruskal 算法 (贪心+并查集) | 面试高频必考算法与手撕模板 |
| **P1** | **经典进阶** | DFS 三色标记拓扑排序、Prim 算法 (扩点切分定理)、Kruskal vs Prim 选型对比 | 算法扩展与稠密图生成树方案 |
| **P2** | **业务实战** | 技能树前置条件校验、项目资产构建依赖图 (Asset DAG)、关键路径分析 (CPM) | 游戏系统设计与工程构建工具链 |
| **P3** | **基础与附录** | 最小生成树切割定理数学原理、完整 Kahn 算法 C++ 源码参考（可折叠） | 知识库备忘查阅 |

---

## P0：核心考点

### 1.1 拓扑排序核心手撕：Kahn 算法 (BFS + 入度表)

拓扑排序仅适用于**有向无环图 (DAG, Directed Acyclic Graph)**。若图中存在有向环，则无法产生合法的线性拓扑序列。

#### 1. Kahn 算法执行步骤
1. **统计入度**：遍历全图，统计每个节点的入度值 `in_degree[u]`。
2. **零入度入队**：将所有入度为 0 的节点（即没有任何前置依赖的任务）全部压入队列。
3. **出队消减**：循环从队列弹出节点加入拓扑序列；同时遍历该节点的每条出边，将对应邻居节点的入度减 1。**若某邻居的入度减至 0，立即将其推入队列**。
4. **成环判定**：若最终拓扑序列中的节点总数小于全图总顶点数 $V$，**说明图中存在环，依赖关系发生死锁**！

#### 2. 课程表 (LeetCode 207) 标准手撕模板
```cpp
#include <vector>
#include <queue>

bool canFinish(int numCourses, const std::vector<std::vector<int>>& prerequisites) {
    std::vector<int> in_degree(numCourses, 0);
    std::vector<std::vector<int>> adj(numCourses);

    // 1. 构建邻接表与入度表 (先修课程 b -> 当前课程 a)
    for (const auto& edge : prerequisites) {
        int a = edge[0], b = edge[1];
        adj[b].push_back(a);
        in_degree[a]++;
    }

    // 2. 将所有入度为 0 的节点压入队列
    std::queue<int> q;
    for (int i = 0; i < numCourses; ++i) {
        if (in_degree[i] == 0) q.push(i);
    }

    int visited_count = 0;

    // 3. 广度优先拓扑扩展
    while (!q.empty()) {
        int u = q.front();
        q.pop();
        ++visited_count;

        for (int v : adj[u]) {
            if (--in_degree[v] == 0) {
                q.push(v);
            }
        }
    }

    // 若全部节点均能消除入度，说明无环
    return visited_count == numCourses;
}
```

---

### 1.2 最小生成树：Kruskal 算法 (贪心选边 + 并查集)

一个包含 $V$ 个顶点的连通无向图，其生成树必须恰好包含 $V-1$ 条边，且不能包含任何环。

* **Kruskal 核心思想（贪心选边）**：
  1. 将图中所有边按照**权值从小到大升序排序**。
  2. 依次遍历每条边 $(u, v, w)$：借助**并查集 (Union-Find)** 检查 $u$ 和 $v$ 是否已连通。
     - 若已连通：加入该边会导致成环，**放弃该边**。
     - 若未连通：**选取该边纳入生成树集合**，并在并查集中执行 `unite(u, v)`。
  3. 当成功选取了 $V-1$ 条边时，提前终止算法。

```cpp
#include <vector>
#include <algorithm>

struct Edge {
    int u, v, weight;
    bool operator<(const Edge& o) const { return weight < o.weight; }
};

int kruskal(int n, std::vector<Edge>& edges) {
    std::sort(edges.begin(), edges.end()); // 边权升序
    UnionFind uf(n); // 并查集

    int total_weight = 0;
    int edges_count = 0;

    for (const auto& edge : edges) {
        if (uf.unite(edge.u, edge.v)) {
            total_weight += edge.weight;
            if (++edges_count == n - 1) break; // 已成树
        }
    }
    return edges_count == n - 1 ? total_weight : -1; // -1 表示图不连通
}
```
* **时空复杂度**：时间复杂度由边排序主导，为 **$O(E \log E)$**，空间复杂度 $O(V)$。

---

### 1.3 常见面试问答要点

* **Q：Kruskal 算法与 Prim 算法有何本质区别？如何选型？**
  > **回答要点**：
  > - **Kruskal 算法（以边为核心）**：按照边权全局贪心排序，利用并查集逐个连通点，复杂度为 $O(E \log E)$。其性能主要取决于边数，**非常适合稀疏图 ($E \ll V^2$)**。
  > - **Prim 算法（以点为核心）**：从单个起点出发，维护割集，通过最小堆贪心寻找距离当前生成树最近的外部节点逐步扩圈，堆优化复杂度为 $O(E \log V)$。在**稠密图 ($E \approx V^2$)** 下表现更为出色。

* **Q：拓扑排序的结果是唯一的吗？什么情况下唯一？**
  > **回答要点**：不唯一。如果 DAG 中存在多个入度同时为 0 的节点，它们在队列中的先后顺序可以任意交换，均属于合法拓扑序。**只有在整个算法执行的任意时刻，队列中都恰好只有一个元素入队**（即每一步的选择都是唯一的，存在哈密顿路径）时，拓扑排序的结果才具有唯一性。

---

## P1：经典算法模型

### 2.1 DFS 拓扑排序：三色标记法

除了 Kahn 算法，利用 DFS 后序遍历也可以得到拓扑序列。为检测有向图中的环，需使用三色标记法：
* **0 (白色 / 未访问)**：节点尚未被探索。
* **1 (灰色 / 访问中)**：当前节点的 DFS 递归调用栈尚未返回。**若在遍历邻居时遇到了灰色节点，证明存在后向边，图中有环！**
* **2 (黑色 / 已完成)**：该节点及其所有后代已全部遍历完毕。将节点推入结果列表。
* **最终结果**：将黑色节点加入列表的顺序**执行一次翻转 (Reverse)**，即为合法的拓扑排序。

---

## P2：工程实践与业务场景

### 3.1 游戏技能树前置依赖解锁判定

RPG 与策略游戏中的技能天赋树本质上是一个 DAG：
* 技能 A 和技能 B 是技能 C 的前置依赖（边：$A \to C$, $B \to C$）。
* 玩家学习技能时，必须实时查询当前技能在拓扑网络中的所有前驱节点是否已被激活，避免非法越级加点。

---

### 3.2 游戏资源打包与构建依赖图 (Asset Dependency Graph)

现代游戏引擎（如 Unreal Engine、Unity）在打包 Asset Bundle 时：
* 材质 (Material) 依赖纹理 (Texture)，预制体 (Prefab) 依赖材质和网格 (Mesh)。
* 引擎构建管线通过对全量资产图执行**拓扑排序**，确定正确的编译与烘焙顺序，并利用有向环检测提前发现美术工程中的“循环依赖资产”报错。

---

## P3：基础原理与参考实现

### 3.1 经典题目速查

| 题目 | 难度 | 核心思路 |
| :--- | :--- | :--- |
| **LC 207. 课程表** | Medium | Kahn 算法入度表 + 队列 BFS，判断遍历完成节点数是否等于总课程数。 |
| **LC 210. 课程表 II** | Medium | 在 LC 207 基础上，按出队顺序依次追加记录节点，输出完整拓扑序列。 |
| **LC 1584. 连接所有点的最小费用** | Medium | 点与点之间全连通的完全图，计算曼哈顿距离后使用 Kruskal 算法或 Prim 算法求 MST。 |

---

> 📖 下一章：[第十章 数据结构选型终极指南](../10_selection_guide/) —— 十大数据结构全景横评、选型决策树、反选型避坑与工业级架构综合实战。

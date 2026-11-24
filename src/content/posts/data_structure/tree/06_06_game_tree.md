---
title: "6.6 实战场景：场景树、骨骼动画与行为树"
published: 2026-04-07
pinned: false
description: "数据结构笔记 · 游戏中的树形架构。内容按优先级梳理：P0 核心考点（场景树 Transform 层级计算、脏标记 Dirty Flag 缓存优化、四叉树空间划分）、P1 进阶架构（行为树 Behavior Tree 组合节点与执行状态、骨骼动画逆绑定矩阵）、P2 工业实践（时间轮 Timer Wheel、表达式 AST）、P3 基础参考实现源码附录。"
tags: [数据结构, C++, 面试, SceneGraph, BehaviorTree, GameEngine]
category: 数据结构笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 6.6 游戏中的树形架构：场景树、骨骼与行为树

> 树形层级结构是现代游戏引擎的核心骨架。从场景节点空间变换继承，到角色骨骼动画绑定，再到 AI 决策行为树，树结构提供了表达“从属关系”、“空间包含”与“控制逻辑”的天然建模工具。

---

## 0. 考点优先级概览

根据面试常见考察频次与工程实用度，内容按优先级组织如下：

| 优先级 | 分类 | 核心内容 | 重点说明 |
| :--- | :--- | :--- | :--- |
| **P0** | **核心架构** | 场景树 (Scene Graph) 变换级联、脏标记 (Dirty Flag) 缓存优化、四叉树空间划分 | 游戏引擎客户端渲染与物理必问考点 |
| **P1** | **游戏系统设计** | 行为树 (Behavior Tree) 组合节点机制 (Selector/Sequence)、骨骼动画层级蒙皮 | 游戏 AI 决策逻辑与动画管线设计 |
| **P2** | **调度与解析** | 时间轮 (Timer Wheel) 分级定时器、表达式语法树 (AST) 解析 | 服务端高并发调度与技能系统计算 |
| **P3** | **基础与附录** | 场景节点带脏标记的 C++ 参考骨架源码（可折叠） | 知识库查阅备忘 |

---

## P0：核心考点

### 1.1 场景树 (Scene Graph) 与 Transform 矩阵级联

在游戏世界中，对象之间具有天然的从属关系（如：角色手握武器，车顶放置机枪）。

#### 1. 变换矩阵继承公式
每个节点仅维护相对父节点的**局部变换 (Local Transform)**。该节点在世界坐标系中的**全局变换 (World Transform)** 由其自身及所有祖先矩阵逐级累乘得出：
$$M_{\text{world}} = M_{\text{parent\_world}} \times M_{\text{local}}$$

#### 2. 脏标记模式 (Dirty Flag Pattern)
若每一帧每个物体都自顶向下重新遍历并重新相乘计算 $M_{\text{world}}$，在大规模静态物体场景下会造成严重的矩阵运算浪费。
* **标记机制**：每个节点维护一个 `bool _is_dirty`。
* **传播触发**：仅当调用 `set_local_position()` 等修改变换的接口时，将自身的 `_is_dirty` 置为 `true`，**并递归将所有子代节点的 `_is_dirty` 均置为 `true`**。
* **按需计算 (Lazy Evaluation)**：调用 `get_world_matrix()` 时，若 `!_is_dirty` 则直接返回缓存的历史矩阵；仅在为 `true` 时才重新执行一次矩阵乘法并清除脏标记。

---

### 1.2 空间划分树：四叉树 (Quadtree) / 八叉树 (Octree)

在大规模游戏场景中，为了快速进行**视锥裁剪 (Frustum Culling)** 与**近邻碰撞过滤**，避免两两遍历的 $O(n^2)$ 崩溃：
* **四叉树 (2D) / 八叉树 (3D)**：根节点代表整个世界包围盒 (AABB)。当某个包围盒内部的实体数量超过预设阈值时，将其均匀拆分为 4 个象限（或 8 个子立方体）。
* **加速裁剪**：摄像机视锥体仅需与顶层节点的 AABB 进行相交测试。若整个大区域完全不在视锥内，则该分支下的数千个子实体被**整树直接剔除**，无需进入 GPU 渲染管线。

---

### 1.3 常见面试问答要点

* **Q：场景树中如果修改了根节点的坐标，子节点的世界坐标如何保持同步？**
  > **回答要点**：场景树通过父子层级关系链接。当根节点的局部变换改变时，通过脏标记模式将整棵子树标记为“脏”，但并不立即同步计算；只有在渲染管线需要使用子节点的世界矩阵时，子节点再检查父节点的最新世界变换并与自身的局部变换相乘更新。这种按需延迟计算避免了多层物体频繁位移时的无谓矩阵开销。

* **Q：四叉树和空间哈希 (Spatial Hashing) 该如何选型？**
  > **回答要点**：四叉树适用于物体**在空间中分布高度不均匀（局部密集、局部稀疏）**的场景，能动态按需细分层次；而空间哈希基于规则网格，适用于**物体在空间中分布较为均匀、且频繁高速移动**的动态场景（因为四叉树中物体跨越边界时需要执行繁重的节点脱链与重新插入，开销高于直接哈希取模）。

---

## P1：游戏系统设计与核心逻辑

### 2.1 行为树 (Behavior Tree) 核心决策机制

相比于复杂的有限状态机 (FSM)，行为树在游戏 AI（如怪物、NPC、Boss）中更具模块化和易扩展性。

#### 1. 节点返回值三态
行为树的每个节点在每次 Tick 时，必须且仅返回以下三种状态之一：
* **`SUCCESS`（成功）**：任务执行达成。
* **`FAILURE`（失败）**：条件不符或任务失败。
* **`RUNNING`（运行中）**：持续性动作（如移动中、攻击后摇中），下一次 Tick 继续从该节点执行。

#### 2. 两大核心控制节点
* **选择节点 (Selector / 类似逻辑或 `OR`)**：
  从左到右依次执行子节点，**只要有一个子节点返回 `SUCCESS` 或 `RUNNING`，立即返回该结果**；只有所有子节点全返回 `FAILURE` 时，自己才返回 `FAILURE`。常用于表达“优先级回退逻辑”（如：若能攻击则攻击，否则若能巡逻则巡逻，否则待机）。
* **顺序节点 (Sequence / 类似逻辑与 `AND`)**：
  从左到右依次执行子节点，**只要有一个子节点返回 `FAILURE`，整个序列立即终止返回 `FAILURE`**；只有所有子节点均成功，才最终返回 `SUCCESS`。常用于表达“连续动作序列”（如：先定位目标 $\to$ 再接近目标 $\to$ 再发起攻击）。

---

### 2.2 骨骼动画 (Skeletal Hierarchy) 与逆绑定姿势

角色的骨骼是一个有向无环的树形层级（如：骨盆根节点 $\to$ 脊柱 $\to$ 肩膀 $\to$ 手臂 $\to$ 手腕）：
* **局部骨骼变换**：表示当前骨骼相对父级骨骼的旋转和平移。
* **蒙皮矩阵计算**：网格模型上的顶点初始是定义在全局模型空间下的。为了让顶点随骨骼移动，必须先通过**逆绑定姿势矩阵 (Inverse Bind Pose Matrix)** 将顶点转换回骨骼的局部坐标系，然后再乘上当前帧骨骼的世界变换矩阵，从而实现自然的网格变形蒙皮。

---

## P2：工程实践与业务场景

### 3.1 时间轮 (Timer Wheel) 定时器架构

游戏服务器需要同时处理数万个玩家的技能 CD、Buff 持续时间、心跳检测：
* 若每个定时器都放入堆中，每次插入与弹出代价为 $O(\log n)$。
* **时间轮架构**：利用类似钟表盘的环形数组（每个刻度代表 10ms 或 1s），当前指针随时间单向步进。到期任务直接挂载在对应刻度的链表槽内，支持 **$O(1)$** 极速注册与批量到期触发。

---

## P3：基础原理与参考实现

### 3.1 场景节点带脏标记的 C++ 参考骨架源码

<details>
<summary>👉 查看场景节点 (SceneNode) 变换计算与脏标记管理 C++ 源码</summary>

```cpp
#include <vector>
#include <memory>
#include <cmath>

struct Matrix4x4 {
    float m[4][4]{};
    static Matrix4x4 identity() {
        Matrix4x4 mat;
        for (int i = 0; i < 4; ++i) mat.m[i][i] = 1.0f;
        return mat;
    }
    Matrix4x4 operator*(const Matrix4x4& o) const {
        Matrix4x4 res;
        for (int i = 0; i < 4; ++i)
            for (int j = 0; j < 4; ++j)
                for (int k = 0; k < 4; ++k)
                    res.m[i][j] += m[i][k] * o.m[k][j];
        return res;
    }
};

class SceneNode {
    Matrix4x4 _local = Matrix4x4::identity();
    mutable Matrix4x4 _world = Matrix4x4::identity();
    mutable bool _dirty = true;

    SceneNode* _parent = nullptr;
    std::vector<std::shared_ptr<SceneNode>> _children;

    void _mark_dirty() {
        if (_dirty) return;
        _dirty = true;
        for (auto& child : _children) {
            child->_mark_dirty();
        }
    }

public:
    void set_local_transform(const Matrix4x4& mat) {
        _local = mat;
        _mark_dirty();
    }

    const Matrix4x4& get_world_matrix() const {
        if (_dirty) {
            if (_parent) {
                _world = _parent->get_world_matrix() * _local;
            } else {
                _world = _local;
            }
            _dirty = false;
        }
        return _world;
    }

    void add_child(std::shared_ptr<SceneNode> child) {
        child->_parent = this;
        child->_mark_dirty();
        _children.push_back(std::move(child));
    }
};
```
</details>

---

> 📖 下一章：[第七章 图论与寻路算法](../../graph/) —— 从邻接表到 Dijkstra 最短路，从 A* 启发式寻路到拓扑排序与关键路径。

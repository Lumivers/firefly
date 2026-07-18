---
title: "第二章 场景管理与空间划分"
published: 2026-04-29
pinned: false
description: "**游戏引擎基础 · 场景管理与空间划分。** 从 Transform 层级的矩阵传递到底层空间数据结构（四叉树/八叉树/BSP/空间哈希），从视锥剔除到遮挡剔除，从 Additive 场景流式加载到 LOD 系统——理解游戏世界如何被高效组织与检索。"
tags: [游戏引擎, Unity, 场景管理, 四叉树, 八叉树, LOD, 剔除]
category: 游戏引擎笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 第二章 场景管理与空间划分

> **一句话理解**：场景管理的本质是**只处理当前需要处理的**——开放世界有十万个物体，但屏幕上只看得见 200 个，AI 只关心半径 50 米内的敌人。场景管理的每一种数据结构，都是为了回答同一个问题：**"哪些东西是我现在需要关心的？"**

> 📋 前置知识：设计模式 Ch5（组合模式——场景树就是组合模式）、算法 Ch1（排序与缓存友好性——空间划分的性能本质）

---

## 2.1 概念直觉 —— 为什么需要场景管理

### 暴力遍历的死线

```csharp
// ❌ 最简单的场景管理：每帧遍历所有物体
void Update() {
    foreach (var enemy in allEnemies) {           // 10000 个敌人
        foreach (var bullet in allBullets) {      // 500 发子弹
            if (Vector3.Distance(bullet.position, enemy.position) < hitRadius) {
                enemy.TakeDamage(bullet.damage);
            }
        }
    }
}
// 10000 × 500 = 5,000,000 次距离判断——每帧！
// 每次 Distance 包含 3 次减法 + 3 次乘法 + 2 次加法 + 1 次开方 = ~10 次浮点运算
// 5,000,000 × 10 = 50,000,000 次浮点运算/帧
// 60 FPS 下 = 3,000,000,000 次/秒——仅碰撞粗筛就占满 CPU
```

**场景管理要做的**：

```
10000 个敌人，但玩家周围 50 米内只有 30 个
500 发子弹分布在整个地图

优化后：
  先查"玩家周围 50 米内有哪些敌人" → 30 个
  对每发子弹，查"子弹周围 5 米内有哪些敌人" → 平均 3 个
  30 × 3 × 500 = 45,000 次——比 5,000,000 减少了 99.1%
```

这就是空间划分的价值。

---

## 2.2 场景树与 Transform 层级

### 组合模式的工业实现

设计模式 Ch5 讲了组合模式的理论。Unity 的 `Transform` 层级就是组合模式在工业级引擎中的实现：

```csharp
// Unity 的 Transform 层级本质：
// 
// Scene (根)
//  ├── Player (GameObject)
//  │     ├── Mesh (子节点——模型)
//  │     ├── Sword (子节点——武器)
//  │     │     └── Blade_Trail (子节点——刀光特效)
//  │     └── Camera_Rig (子节点——摄像机臂)
//  └── Enemies (空节点，仅用于组织)
//        ├── Goblin_01
//        ├── Goblin_02
//        └── ...
//
// 每个节点存储的是"局部变换"（相对于父节点）
// 世界变换 = 父世界变换 × 局部变换

public class Transform {
    // 局部变换（相对于父节点）
    private Vector3 localPosition;
    private Quaternion localRotation;
    private Vector3 localScale;

    // 世界变换缓存（脏标记模式）
    private Matrix4x4 worldMatrix;
    private bool isWorldMatrixDirty = true;

    private Transform parent;
    private List<Transform> children;

    // 获取世界位置——需要从根开始计算
    public Vector3 position {
        get {
            if (parent == null) return localPosition;
            // 递归往上乘：世界位置 = 父世界旋转 × (父缩放 × 局部位置) + 父世界位置
            return parent.TransformPoint(localPosition);
        }
    }

    public Matrix4x4 localToWorldMatrix {
        get {
            if (isWorldMatrixDirty) {
                Matrix4x4 local = Matrix4x4.TRS(localPosition, localRotation, localScale);
                if (parent != null) {
                    worldMatrix = parent.localToWorldMatrix * local;
                } else {
                    worldMatrix = local;
                }
                isWorldMatrixDirty = false;
            }
            return worldMatrix;
        }
    }

    // 当自身局部变换改变时，标记自己和所有子节点为脏
    public void SetLocalPosition(Vector3 pos) {
        localPosition = pos;
        InvalidateWorldMatrix();  // 递归向下通知
    }

    private void InvalidateWorldMatrix() {
        isWorldMatrixDirty = true;
        foreach (var child in children) {
            child.InvalidateWorldMatrix();  // 连锁反应——深层层级代价大
        }
    }
}
```

### 深层 Transform 层级的代价

```csharp
// 一个常见的性能反模式——Prefab 层级过深
// 某个 UI Prefab 的层级：
// 
// Canvas
//  └── MainPanel
//        └── ContentArea
//              └── ScrollView
//                    └── Viewport
//                          └── Content
//                                └── ItemContainer
//                                      └── Item (实际只有这一个有内容)
//                                              ├── Icon (空的 Image)
//                                              ├── Name (Text)
//                                              ├── Price (Text)
//                                              └── Border (Image)
//
// 每次移动 Item → 标记脏 → 通知 ItemContainer → 通知 Content → ...
// → 一直通知到 Canvas，每层都要重算世界矩阵
// 12 层 × 60 FPS = 720 次矩阵乘法/秒——仅一个 UI 元素！
```

**优化原则**：Prefab 层级尽量扁平。不需要的空节点能省则省——Unity 的 `Transform` 是一个类，每个空节点也会分配内存。

---

## 2.3 空间划分数据结构

### 对比总览

| 数据结构 | 维度 | 插入 | 查询 | 内存 | 适用场景 |
|---------|------|------|------|------|---------|
| **四叉树** | 2D | O(log n) | O(log n) | 中 | 2D 碰撞检测、地形 LOD |
| **八叉树** | 3D | O(log n) | O(log n) | 高 | 3D 碰撞检测、体素渲染 |
| **BSP** | 2D/3D | O(n) 构建 | O(log n) | 中高 | 室内可见性、Doom/Quake |
| **空间哈希** | 2D/3D | O(1) | O(1)* | 低 | 弹幕游戏、粒子碰撞 |
| **BVH** | 3D | O(log n) | O(log n) | 中 | 光线追踪、物理引擎 |

> \* 空间哈希在均匀分布时 O(1)，聚集时退化。

### 四叉树——2D 空间划分

```csharp
// 四叉树的核心思想：递归地将 2D 空间分为 4 个象限
// 每个节点要么是叶子（包含少量物体），要么有 4 个子节点
//
// +-------+-------+
// |  NW   |  NE   |
// |  ● ●  |       |
// +-------+-------+
// |  SW   |  SE   |
// |       |  ●    |
// +-------+-------+
// ● = 物体

public class QuadTree {
    private const int MAX_OBJECTS = 4;     // 节点分裂阈值
    private const int MAX_LEVEL = 6;       // 最大深度

    private Rect bounds;                    // 本节点覆盖的区域
    private int level;                      // 当前深度
    private List<QuadObject> objects;       // 本节点存储的物体
    private QuadTree[] children;            // 4 个子节点（null = 叶子）
    private bool isLeaf => children == null;

    public QuadTree(Rect bounds, int level = 0) {
        this.bounds = bounds;
        this.level = level;
        objects = new List<QuadObject>();
        children = null;
    }

    public void Insert(QuadObject obj) {
        // 如果已分裂，尝试插入子节点
        if (!isLeaf) {
            int index = GetChildIndex(obj.position);
            if (index != -1) {
                children[index].Insert(obj);
                return;
            }
        }

        // 存入当前节点
        objects.Add(obj);

        // 超过阈值且未达最大深度 → 分裂
        if (objects.Count > MAX_OBJECTS && level < MAX_LEVEL && isLeaf) {
            Split();
            // 将已有物体重新分配到子节点
            var oldObjects = objects;
            objects = new List<QuadObject>();
            foreach (var old in oldObjects) {
                Insert(old);
            }
        }
    }

    public List<QuadObject> Query(Rect area) {
        List<QuadObject> result = new List<QuadObject>();

        // 区域与本节点不相交 → 返回空
        if (!bounds.Overlaps(area)) return result;

        // 检查本节点的物体
        foreach (var obj in objects) {
            if (area.Contains(obj.position)) {
                result.Add(obj);
            }
        }

        // 如果是分支节点，递归查询子节点
        if (!isLeaf) {
            foreach (var child in children) {
                result.AddRange(child.Query(area));
            }
        }

        return result;
    }

    private void Split() {
        float halfW = bounds.width / 2f;
        float halfH = bounds.height / 2f;
        float x = bounds.x;
        float y = bounds.y;
        int nextLevel = level + 1;

        children = new QuadTree[4];
        children[0] = new QuadTree(new Rect(x, y + halfH, halfW, halfH), nextLevel);        // NW
        children[1] = new QuadTree(new Rect(x + halfW, y + halfH, halfW, halfH), nextLevel); // NE
        children[2] = new QuadTree(new Rect(x, y, halfW, halfH), nextLevel);                 // SW
        children[3] = new QuadTree(new Rect(x + halfW, y, halfW, halfH), nextLevel);         // SE
    }

    private int GetChildIndex(Vector2 pos) {
        float midX = bounds.x + bounds.width / 2f;
        float midY = bounds.y + bounds.height / 2f;

        bool top = pos.y > midY;
        bool right = pos.x > midX;

        if (top && !right) return 0;   // NW
        if (top && right) return 1;    // NE
        if (!top && !right) return 2;  // SW
        if (!top && right) return 3;   // SE
        return -1;
    }
}

// 使用——碰撞检测的粗筛阶段
public class CollisionBroadPhase {
    private QuadTree quadTree;

    public void Update(List<Collider2D> allColliders) {
        // 每帧重建四叉树（物体位置变了）
        quadTree = new QuadTree(new Rect(0, 0, worldWidth, worldHeight));

        foreach (var col in allColliders) {
            quadTree.Insert(new QuadObject(col.transform.position, col));
        }

        // 查询——每个物体只检测附近物体
        foreach (var col in allColliders) {
            Rect queryArea = new Rect(
                col.transform.position.x - 5f,
                col.transform.position.y - 5f,
                10f, 10f
            );
            var nearby = quadTree.Query(queryArea);

            foreach (var other in nearby) {
                if (col != other.collider) {
                    NarrowPhaseCheck(col, other.collider);
                }
            }
        }
    }
}
```

### 何时用八叉树

```csharp
// 八叉树 = 四叉树的 3D 版本：每个节点分裂为 8 个子节点
// 2D 用四叉树，3D 用八叉树，原理完全相同
//
// 八叉树适合：
// ✅ 3D 空间中的碰撞检测粗筛
// ✅ 体素渲染（Minecraft 风格的可破坏地形）
// ✅ 动态光源的影响范围查询
//
// 八叉树不适合：
// ❌ 物体分布极不均匀（一棵树在角落 → 大量空节点）
// ❌ 物体数量少（< 100）—— 暴力遍历更快
```

### 空间哈希——最简单的方案

```csharp
// 空间哈希的核心：把空间切成等大的网格，物体落入哪个格子就存在哪个格子里
// 查询时只看相邻几个格子

public class SpatialHash {
    private float cellSize;  // 格子边长
    private Dictionary<Vector2Int, List<Collider2D>> grid;

    public SpatialHash(float cellSize) {
        this.cellSize = cellSize;
        grid = new Dictionary<Vector2Int, List<Collider2D>>();
    }

    private Vector2Int GetCell(Vector2 position) {
        return new Vector2Int(
            Mathf.FloorToInt(position.x / cellSize),
            Mathf.FloorToInt(position.y / cellSize)
        );
    }

    public void Insert(Vector2 position, Collider2D collider) {
        var cell = GetCell(position);
        if (!grid.ContainsKey(cell)) {
            grid[cell] = new List<Collider2D>();
        }
        grid[cell].Add(collider);
    }

    public List<Collider2D> Query(Vector2 position, float radius) {
        List<Collider2D> result = new List<Collider2D>();
        int cellRadius = Mathf.CeilToInt(radius / cellSize);

        var centerCell = GetCell(position);
        for (int x = -cellRadius; x <= cellRadius; x++) {
            for (int y = -cellRadius; y <= cellRadius; y++) {
                var cell = new Vector2Int(centerCell.x + x, centerCell.y + y);
                if (grid.TryGetValue(cell, out var objects)) {
                    result.AddRange(objects);
                }
            }
        }
        return result;
    }

    public void Clear() {
        // 不 new 新 Dictionary——只清空列表，复用内存
        foreach (var kvp in grid) {
            kvp.Value.Clear();
        }
    }
}
```

**空间哈希 vs 四叉树**：

```csharp
// 空间哈希的优势：
// - 插入 O(1)，查询只需看 9 个格子（固定开销）
// - 实现简单，内存连续（用数组替代 Dictionary 更佳）
// - 弹幕游戏：500 发子弹均匀分布在屏幕上 → 空间哈希最优

// 四叉树的优势：
// - 自适应密度——密集区域自动细分，稀疏区域保持粗粒度
// - RTS 游戏：单位聚团（分队）→ 四叉树一个叶节点覆盖一整队
// - 四叉树可以动态调节深度，空间哈希的格子大小固定
```

---

## 2.4 剔除 (Culling)

### 视锥剔除 (Frustum Culling)

视锥剔除是 CPU 端的优化——在提交 DrawCall 之前，先判断物体是否在摄像机视野内：

```csharp
// Unity 底层原理（简化版）
// 视锥体 = 6 个平面（上/下/左/右/近/远）

public class FrustumCulling {
    private Plane[] frustumPlanes = new Plane[6];

    public void UpdateFrustum(Camera camera) {
        // 从摄像机的 VP 矩阵提取 6 个平面
        Matrix4x4 vp = camera.projectionMatrix * camera.worldToCameraMatrix;

        // 左平面
        frustumPlanes[0] = new Plane(
            vp[3, 0] + vp[0, 0],
            vp[3, 1] + vp[0, 1],
            vp[3, 2] + vp[0, 2],
            vp[3, 3] + vp[0, 3]
        );
        // ... 其余 5 个平面类似
    }

    public bool IsVisible(Bounds bounds) {
        foreach (var plane in frustumPlanes) {
            // 包围盒在平面的"外侧"（法线反方向）→ 不可见
            if (!plane.GetSide(bounds.min) && !plane.GetSide(bounds.max)) {
                // 更精确的检查：包围盒 vs 平面
                Vector3 positive = bounds.min;
                Vector3 negative = bounds.max;

                if (plane.normal.x >= 0) {
                    positive.x = bounds.max.x;
                    negative.x = bounds.min.x;
                } else {
                    positive.x = bounds.min.x;
                    negative.x = bounds.max.x;
                }
                // ... y, z 同理

                if (plane.GetDistanceToPoint(positive) < 0) {
                    return false;
                }
            }
        }
        return true;
    }
}

// Unity 自动做视锥剔除——你不需要手动实现
// 但理解原理有助于理解：
// - 为什么单个大 Mesh 被错误剔除（包围盒中心不在视野但部分 Mesh 在）
// - 为什么 SkinnedMeshRenderer 的剔除基于包围盒而非实际顶点
```

### 遮挡剔除 (Occlusion Culling)

视锥剔除回答"在视野内吗？"，遮挡剔除回答"被挡住了吗？"：

```
视锥剔除：摄像机能看到这个方向 → 但可能被墙挡住了
遮挡剔除：摄像机确实能看到这个物体 → 发送 DrawCall

[摄像机] ────→ [墙] ────→ [敌人(被遮挡，不渲染)]
                          [宝箱(只露出一角，渲染)]
```

**Unity 的遮挡剔除**：

```csharp
// 1. 静态遮挡剔除（预烘焙）
//    - Window > Rendering > Occlusion Culling
//    - 标记场景中的静态物体为 Occluder Static / Occludee Static
//    - 烘焙后生成遮挡数据（场景被切分为 Cell）
//    - 运行时：摄像机在某个 Cell → 查表得知哪些物体可见
//
//    优点：运行时几乎零开销
//    缺点：只对静态物体有效，动态物体只能被遮挡不能遮挡别人

// 2. 动态遮挡剔除（Umbra——Unity 内置中间件）
//    - 支持动态 Occluder（移动的门、电梯）
//    - 基于 PVS (Potentially Visible Set) 技术
//    - 需要标记物体参与遮挡剔除（Occluder 或 Occludee）

// 检查遮挡剔除是否生效：
// Scene 视图 → Shading Mode → Occlusion Culling → 可视化遮挡数据
```

**遮挡剔除的常见问题**：

```csharp
// 问题 1：物体太大导致始终认为可见
// 解决方案：设置合理的 Occluder 尺寸，不要让单个 Mesh 横跨多个 Cell

// 问题 2：小物体被错误剔除（窗口中的敌人突然消失）
// 解决方案：调整 Smallest Occluder 和 Smallest Hole 参数

// 问题 3：动态场景中静态剔除失效
// 动态场景门可以标记为 Occluder Dynamic，但需要额外的运行时开销
```

---

## 2.5 LOD —— 细节层次

### 原理

```
距离越远，屏幕占比越小，细节越看不出来

距离 5m：  使用 LOD0（最高精度）—— 5000 三角形
距离 20m： 使用 LOD1（中等精度）—— 1500 三角形
距离 50m： 使用 LOD2（低精度）   —— 400 三角形
距离 150m：不渲染（Culled）     —— 0 三角形

节省：5000 → 1500 → 400 → 0 —— GPU 负载随距离递减
```

```csharp
// Unity LOD Group 的使用
[RequireComponent(typeof(LODGroup))]
public class LODSetup : MonoBehaviour {
    void Start() {
        var lodGroup = GetComponent<LODGroup>();

        // LOD 数组——按精度从高到低
        LOD[] lods = new LOD[3];

        // LOD0 = 100% 屏幕占比时使用（最近）
        lods[0] = new LOD(0.15f, GetRenderersForLOD(0));  // 屏幕占比 > 15%
        // LOD1 = 8%-15% 时使用
        lods[1] = new LOD(0.08f, GetRenderersForLOD(1));
        // LOD2 = 3%-8% 时使用
        lods[2] = new LOD(0.03f, GetRenderersForLOD(2));
        // < 3% → Culled（不渲染）

        lodGroup.SetLODs(lods);
        lodGroup.RecalculateBounds();
    }

    private Renderer[] GetRenderersForLOD(int level) {
        // 返回对应 LOD 级别的 Renderer 组件
        // 通常不同 LOD 级别是不同的 Prefab/模型
    }
}
```

**LOD 切换距离的动态调整**：

```csharp
// 不同设备应该用不同的 LOD 距离
// 手机上屏幕小，LOD0 在更近的距离就可以切到 LOD1

void AdjustLODForDevice() {
    var lodGroup = GetComponent<LODGroup>();

    if (Application.isMobilePlatform) {
        // 手机屏幕小 → 更激进地降级（LOD 切换更早）
        lodGroup.SetLODs(new LOD[] {
            new LOD(0.20f, lod0Renderers),  // 原来 0.15 → 手机 0.20（更早切换）
            new LOD(0.10f, lod1Renderers),
            new LOD(0.04f, lod2Renderers),
        });
    }
}
```

---

## 2.6 大世界的流式加载

### Additive 场景加载

```csharp
// 无缝大世界的分段加载方案：
// 把世界切成一个个 Chunk，玩家在哪就加载哪几个 Chunk
//
// +-------+-------+-------+
// | Chunk | Chunk | Chunk |
// | (0,2) | (1,2) | (2,2) |
// +-------+-------+-------+
// | Chunk | Chunk | Chunk |
// | (0,1) | (1,1) | (2,1) |
// +-------+-------+-------+
// | Chunk | Chunk | Chunk |
// | (0,0) | (1,0) | (2,0) |
// +-------+-------+-------+
//                ● = 玩家位置

public class WorldStreamer : MonoBehaviour {
    [SerializeField] private float chunkSize = 256f;
    [SerializeField] private int loadRadius = 2;  // 加载玩家周围 2 个 Chunk

    private Vector2Int currentChunk;
    private HashSet<Vector2Int> loadedChunks = new HashSet<Vector2Int>();
    private Dictionary<Vector2Int, AsyncOperation> loadingOperations =
        new Dictionary<Vector2Int, AsyncOperation>();

    void Start() {
        StartCoroutine(StreamWorld());
    }

    IEnumerator StreamWorld() {
        while (true) {
            Vector2Int playerChunk = GetPlayerChunk();

            // 如果玩家跨了 Chunk，重新计算需要加载/卸载的
            if (playerChunk != currentChunk) {
                currentChunk = playerChunk;
                UpdateChunks();
            }

            // 每 0.5 秒检查一次（不用每帧检查）
            yield return new WaitForSeconds(0.5f);
        }
    }

    void UpdateChunks() {
        HashSet<Vector2Int> neededChunks = new HashSet<Vector2Int>();

        // 计算需要哪些 Chunk
        for (int x = -loadRadius; x <= loadRadius; x++) {
            for (int y = -loadRadius; y <= loadRadius; y++) {
                neededChunks.Add(new Vector2Int(
                    currentChunk.x + x,
                    currentChunk.y + y
                ));
            }
        }

        // 卸载不需要的
        HashSet<Vector2Int> toUnload = new HashSet<Vector2Int>(loadedChunks);
        toUnload.ExceptWith(neededChunks);

        foreach (var chunk in toUnload) {
            StartCoroutine(UnloadChunk(chunk));
        }

        // 加载需要的（还未加载的）
        foreach (var chunk in neededChunks) {
            if (!loadedChunks.Contains(chunk)) {
                StartCoroutine(LoadChunk(chunk));
            }
        }
    }

    IEnumerator LoadChunk(Vector2Int chunkCoord) {
        string sceneName = $"Chunk_{chunkCoord.x}_{chunkCoord.y}";

        AsyncOperation op = SceneManager.LoadSceneAsync(sceneName, LoadSceneMode.Additive);
        op.allowSceneActivation = true;

        while (!op.isDone) {
            // 可以在这里显示加载进度
            yield return null;
        }

        loadedChunks.Add(chunkCoord);
    }

    IEnumerator UnloadChunk(Vector2Int chunkCoord) {
        string sceneName = $"Chunk_{chunkCoord.x}_{chunkCoord.y}";
        AsyncOperation op = SceneManager.UnloadSceneAsync(sceneName);

        while (!op.isDone) yield return null;

        loadedChunks.Remove(chunkCoord);
    }

    private Vector2Int GetPlayerChunk() {
        Vector3 pos = player.transform.position;
        return new Vector2Int(
            Mathf.FloorToInt(pos.x / chunkSize),
            Mathf.FloorToInt(pos.z / chunkSize)
        );
    }
}
```

### 加载性能优化要点

```csharp
// 1. 分帧加载——不要一帧加载多个 Chunk
IEnumerator LoadChunkStaggered(Vector2Int chunkCoord) {
    // 等一帧再加载——避免卡顿
    yield return null;
    yield return LoadChunk(chunkCoord);
}

// 2. 优先级加载——玩家前方的 Chunk 先加载，后方后加载
int GetChunkPriority(Vector2Int chunk, Vector2Int playerChunk, Vector3 playerForward) {
    Vector2 offset = new Vector2(chunk.x - playerChunk.x, chunk.y - playerChunk.y);
    float dot = Vector2.Dot(offset.normalized,
        new Vector2(playerForward.x, playerForward.z).normalized);

    if (dot > 0.7f) return 0;   // 前方 → 高优先级
    if (dot > 0) return 1;      // 侧方 → 中
    return 2;                    // 后方 → 低
}

// 3. 预加载——根据玩家速度预测下一个要加载的 Chunk
Vector2Int PredictNextChunk(Vector2Int current, Vector3 velocity) {
    float lookAhead = velocity.magnitude * 2f;  // 提前 2 秒
    Vector3 predictedPos = player.transform.position + velocity.normalized * lookAhead;
    return new Vector2Int(
        Mathf.FloorToInt(predictedPos.x / chunkSize),
        Mathf.FloorToInt(predictedPos.z / chunkSize)
    );
}

// 4. 加载画面遮挡——用 Loading Screen 或 Fade 过渡
// 或者在 Chunk 加载期间显示低精度地形作为占位
```

---

## 2.7 🎮 完整示例：碰撞检测粗筛

```csharp
// 一个完整的碰撞检测流程：粗筛（空间哈希）+ 精筛（AABB）+ 精确（SAT/GJK）
public class CollisionSystem {
    private SpatialHash broadPhase;
    private float cellSize = 10f;  // 根据物体大小调整

    public void Update(List<Collider> colliders) {
        broadPhase.Clear();

        // 1. 所有物体插入空间哈希
        foreach (var col in colliders) {
            broadPhase.Insert(col.transform.position, col);
        }

        // 2. 对每个物体查询附近的潜在碰撞对象
        foreach (var col in colliders) {
            var nearby = broadPhase.Query(col.transform.position, cellSize);

            foreach (var other in nearby) {
                if (col == other) continue;

                // 3. AABB 检测（快速矩形重叠测试）
                if (col.bounds.Intersects(other.bounds)) {
                    // 4. 精确碰撞检测（SAT / GJK）
                    if (PreciseCollisionCheck(col, other)) {
                        col.OnCollision(other);
                        other.OnCollision(col);
                    }
                }
            }
        }
    }

    private bool PreciseCollisionCheck(Collider a, Collider b) {
        // 2D：SAT（分离轴定理）
        // 3D：GJK + EPA
        // 这里省略具体实现——交给 PhysX
        return Physics.ComputePenetration(
            a, a.transform.position, a.transform.rotation,
            b, b.transform.position, b.transform.rotation,
            out Vector3 direction, out float distance
        );
    }
}
```

---

## 2.8 常见坑

### 坑一：FindObjectsOfType 在运行时

```csharp
// ❌ 每帧遍历整个场景查找所有敌人——O(n)，n = 场景总物体数
void Update() {
    var enemies = FindObjectsOfType<Enemy>();
    foreach (var enemy in enemies) {
        // ...
    }
}

// ✅ 自己维护列表——Enemy 在 Awake 注册，OnDestroy 注销
public class EnemyManager {
    public static List<Enemy> AllEnemies = new List<Enemy>();
}

public class Enemy : MonoBehaviour {
    void Awake() => EnemyManager.AllEnemies.Add(this);
    void OnDestroy() => EnemyManager.AllEnemies.Remove(this);
}
```

### 坑二：Instantiate 大量运行时对象

```csharp
// ❌ 弹幕游戏——每帧 Instantiate 50 发子弹
void Update() {
    for (int i = 0; i < 50; i++) {
        Instantiate(bulletPrefab);  // 50 次堆分配/帧
    }
}

// ✅ 对象池（设计模式 Ch2）
void Update() {
    for (int i = 0; i < 50; i++) {
        bulletPool.Acquire();  // 0 次分配
    }
}
```

### 坑三：场景加载卡主线程

```csharp
// ❌ 同步加载——游戏直接卡死 2 秒
SceneManager.LoadScene("Level_02");

// ✅ 异步加载——显示加载画面，不卡顿
IEnumerator LoadLevelAsync() {
    loadingScreen.SetActive(true);

    AsyncOperation op = SceneManager.LoadSceneAsync("Level_02");
    op.allowSceneActivation = false;  // 加载完不自动切换

    while (op.progress < 0.9f) {
        loadingBar.fillAmount = op.progress;
        yield return null;
    }

    // 加载到 90%，可以切换了
    loadingBar.fillAmount = 1f;
    yield return new WaitForSeconds(0.5f);  // 给玩家看一眼 100%
    op.allowSceneActivation = true;
}
```

### 坑四：LOD 切换距离不考虑设备

```csharp
// ❌ PC 上调好的 LOD 距离直接用于手机
// 手机屏幕小 → 同样的距离下物体所占像素更少 → LOD0 浪费

// ✅ 根据不同设备调整
float lodMultiplier = Screen.dpi / referenceDpi;
foreach (var lodGroup in GetComponentsInChildren<LODGroup>()) {
    lodGroup.size = lodGroup.size * lodMultiplier;
}
```

### 坑五：静态 Batching 物体被移动

```csharp
// ❌ 标记了 Static 的物体在运行时被移动
// Unity 的 Static Batching 会把所有 Static 物体的 Mesh 合并成一个大 Mesh
// 移动其中任何一个物体 → 整个合批 Mesh 需要重建 → 帧率尖刺

// ✅ 会移动的物体不要标记 Static
// 如果是"偶尔移动的静态物体"（如可破坏的墙），用动态合批或 GPU Instancing
```

---

## 2.9 本章回顾

| 概念 | 一句话 | 选型指南 |
|------|--------|---------|
| **场景树** | Transform 层级 = 组合模式 | 组织用层级，性能用扁平 |
| **四叉树** | 2D 自适应空间划分 | 2D 游戏、RTS 单位管理 |
| **八叉树** | 3D 自适应空间划分 | 3D 碰撞、体素渲染 |
| **空间哈希** | 均匀网格 + 字典 | 弹幕游戏、粒子碰撞 |
| **视锥剔除** | 在视野内吗？ | Unity 自动做，理解原理即可 |
| **遮挡剔除** | 被挡住了吗？ | 室内场景必须烘焙 |
| **LOD** | 远小近大，精度递减 | 开放世界必配，手机上更激进 |
| **流式加载** | 分块加载/卸载 | 大世界用 Additive + 异步 |

> 📖 下一章：[第三章 UI 系统设计](./03_ui_system) —— Canvas 渲染原理、DrawCall 合批策略、ScrollRect 优化、MVVM 数据绑定。场景管理讲的是"世界怎么组织"，UI 系统讲的是"界面的组织方式"——它们共用组合模式作为底层结构。

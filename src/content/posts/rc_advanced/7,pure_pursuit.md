---
title: "底盘运动学与 Pure Pursuit 轨迹跟踪"
published: 2026-07-26
pinned: false
description: "放弃 nav2 的理由、底盘逆运动学、Pure Pursuit 数学原理与实现、路径规划与物理世界走位问题。"
tags: [pure_pursuit, 运动学, 导航, pid, 教程]
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 这一章的代码我 26 赛季没有实际写过（车用的是纯里程计 + DT35 微调），但 Pure Pursuit 是 RC 赛场上用得最多的路径跟踪算法，原理和实现都值得讲清楚。

# 为什么不用 nav2

ROS2 自带的 nav2 导航栈是给服务机器人设计的——在办公楼里慢悠悠地走，遇到人停下来，绕个障碍物再继续。它的核心是 Costmap（代价地图）+ 全局规划器 + 局部控制器，整套流程假设你不知道地图、需要实时避障、速度很慢。

RC 赛场完全不是这个场景：

**地图是已知的。** 赛场布局提前公布，路径可以离线规划好，不需要边跑边建图。

**不需要避障。** 赛场上没有行人、没有突然出现的障碍物（如果有的话那是赛道设计有问题）。车要做的就是沿着规划好的路径高速通过。

**速度要求高。** nav2 的控制频率和响应速度跟不上 RC 赛车的需求。它的局部控制器（DWB / MPPI）要考虑避障、要考虑代价地图膨胀，计算量不小。

**Costmap 在 RC 赛场边缘会出问题。** 赛道边界在 Costmap 里是高代价区域，车靠近边界时 nav2 会试图"推开"，导致车在边缘原地打转或者反复震荡。这是架构层面的问题，调参解决不了。

> 结论：nav2 能用，但 RC 赛车不需要它的核心能力（避障、建图），反而会被它的开销拖累。自己写一个 Pure Pursuit 就够了。

---

# 底盘逆运动学

在写跟踪算法之前，得先搞清楚"给定一个速度指令，每个轮子该怎么转"。

## 差速底盘

两个驱动轮 + 一个万向轮，最常见的 RC 底盘。

```
    ┌─────────┐
    │         │
  ┌─┤         ├─┐
  │L│         │R│
  └─┤         ├─┘
    │    C    │
    └─────────┘
```

给定线速度 `v` 和角速度 `ω`：

```
v_L = v - (ω × L / 2)
v_R = v + (ω × L / 2)
```

其中 `L` 是轮距（两个驱动轮之间的距离）。

反过来，从轮速算整车速度：

```
v = (v_R + v_L) / 2
ω = (v_R - v_L) / L
```

## 麦克纳姆轮底盘

四个轮子，每个轮子 45° 安装辊子，能全向移动。

```
  ↖  ┌─────────┐  ↗
     │         │
  ↙  │         │  ↘
     └─────────┘
```

逆运动学：

```
v_FL = v_x - v_y - ω × (L + W) / 2
v_FR = v_x + v_y + ω × (L + W) / 2
v_RL = v_x + v_y - ω × (L + W) / 2
v_RR = v_x - v_y + ω × (L + W) / 2
```

其中 `L` 是轴距，`W` 是轮距。FL/FR/RL/RR 分别是左前/右前/左后/右后。

> 麦克纳姆轮的好处是能横移，对需要侧方停靠的赛题很有用。但辊子磨损快，赛场地面如果有沙子或地毯接缝，打滑会很严重。

---

# Pure Pursuit 数学原理

Pure Pursuit 的思想非常直观：在规划路径上找一个"前瞻点"（lookahead point），然后算出一条圆弧让车沿着这条弧走到前瞻点。

## 几何推导

```
         ●  前瞻点 (target)
        /|
       / |
    Ld/  | y
     /   |
    /    |
   ●─────●
 车当前位置
```

- 车在原点，朝向 x 轴正方向
- 前瞻点在车体坐标系下的坐标为 `(x, y)`
- `Ld` = 前瞻距离（车到前瞻点的直线距离）
- `α` = 前瞻点相对于车头朝向的夹角

由几何关系：

```
sin(α) = y / Ld
```

跟踪圆弧的曲率 `κ`：

```
κ = 2 × sin(α) / Ld = 2y / Ld²
```

角速度：

```
ω = v × κ = 2vy / Ld²
```

这就是 Pure Pursuit 的全部数学。给定前瞻点坐标 `(x, y)` 和当前速度 `v`，算出角速度 `ω`，发给底盘。

## 前瞻距离 Ld 的选择

`Ld` 是 Pure Pursuit 唯一的关键参数，它决定了跟踪行为：

| Ld 大 | Ld 小 |
|---|---|
| 跟踪平滑，不走蛇形 | 跟踪精确，紧跟路径 |
| 过弯时切弯严重 | 过弯时响应快但容易震荡 |
| 适合高速直道 | 适合低速弯道 |

实践中通常让 `Ld` 随速度变化：

```python
Ld = max(Ld_min, k × v)  # k 通常取 0.5~1.5
```

速度快的时候前瞻距离拉远，避免来回修正；速度慢的时候前瞻距离拉近，保证精度。

## 实现

```python
import math

def pure_pursuit(state, path, v, Ld_min=0.3, k=1.0):
    """
    state: (x, y, theta) 当前位姿
    path: [(x1,y1), (x2,y2), ...] 路径点列表
    v: 当前线速度
    """
    x, y, theta = state

    # 1. 找到路径上离车最近的点
    min_dist = float('inf')
    nearest_idx = 0
    for i, (px, py) in enumerate(path):
        d = math.hypot(px - x, py - y)
        if d < min_dist:
            min_dist = d
            nearest_idx = i

    # 2. 从最近点往前搜索，找到距离 >= Ld 的前瞻点
    Ld = max(Ld_min, k * v)
    target = path[-1]  # 默认用终点
    for i in range(nearest_idx, len(path)):
        px, py = path[i]
        d = math.hypot(px - x, py - y)
        if d >= Ld:
            target = (px, py)
            break

    # 3. 把前瞻点转换到车体坐标系
    dx = target[0] - x
    dy = target[1] - y
    local_x =  dx * math.cos(theta) + dy * math.sin(theta)
    local_y = -dx * math.sin(theta) + dy * math.cos(theta)

    # 4. 算曲率和角速度
    Ld_actual = math.hypot(local_x, local_y)
    if Ld_actual < 0.01:
        return 0.0
    curvature = 2.0 * local_y / (Ld_actual ** 2)
    omega = v * curvature

    return omega
```

调用：

```python
state = (1.0, 2.0, 0.5)  # x, y, theta
path = [(0, 0), (1, 0), (2, 0.5), (3, 1.5), (3, 3)]
v = 1.0

omega = pure_pursuit(state, path, v)
# omega 发给底盘
```

> 整个算法就一个 for 循环加几行三角函数，没有矩阵、没有优化器、没有迭代求解。这就是 Pure Pursuit 为什么适合 RC——简单、快、好调。

---

# 路径规划

Pure Pursuit 解决的是"怎么沿着路径走"，但路径本身从哪来？

## 手动标点

最简单的方式：提前在赛场地图上标好关键路径点，存成数组。

```python
# 蓝区 Zone1 路径
path = [
    (0.0, 0.0),
    (1.0, 0.0),
    (2.0, 0.5),
    (3.0, 1.5),
    (3.0, 3.0),
]
```

够用就行，不需要花里胡哨。很多 RC 队伍就是手动标点 + Pure Pursuit 跑完全程。

## A* 全局规划

如果赛场有障碍物需要绕行，可以用 A* 在栅格地图上找最短路径：

```python
import heapq

def astar(grid, start, end):
    """grid: 2D 数组, 0=可通行, 1=障碍"""
    rows, cols = len(grid), len(grid[0])
    open_set = [(0, start)]
    came_from = {}
    g_score = {start: 0}

    while open_set:
        _, current = heapq.heappop(open_set)
        if current == end:
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            return path[::-1]

        for dx, dy in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]:
            nx, ny = current[0]+dx, current[1]+dy
            if 0 <= nx < rows and 0 <= ny < cols and grid[nx][ny] == 0:
                new_g = g_score[current] + (1.414 if dx*dy != 0 else 1)
                if new_g < g_score.get((nx,ny), float('inf')):
                    g_score[(nx,ny)] = new_g
                    f = new_g + abs(nx-end[0]) + abs(ny-end[1])
                    heapq.heappush(open_set, (f, (nx,ny)))
                    came_from[(nx,ny)] = current
    return []
```

A* 出来的路径是折线，直接丢给 Pure Pursuit 会走出锯齿。需要做平滑。

## 贝塞尔曲线平滑

用贝塞尔曲线把折线路径变成光滑曲线：

```python
def bezier_curve(points, n=100):
    """n 阶贝塞尔曲线，points 是控制点列表"""
    n_pts = len(points)
    curve = []
    for t_i in range(n + 1):
        t = t_i / n
        # de Casteljau 算法
        temp = list(points)
        for k in range(n_pts - 1):
            temp = [
                ((1-t) * temp[i][0] + t * temp[i+1][0],
                 (1-t) * temp[i][1] + t * temp[i+1][1])
                for i in range(len(temp) - 1)
            ]
        curve.append(temp[0])
    return curve
```

用法：

```python
# A* 出来的折线
waypoints = [(0,0), (1,1), (2,1), (3,2)]

# 贝塞尔平滑
smooth_path = bezier_curve(waypoints, n=200)

# 丢给 Pure Pursuit
omega = pure_pursuit(state, smooth_path, v)
```

> 实际比赛中大多数队伍用的是手动标点，不用 A*。赛场布局已知，路径就那么几条，手动标比跑 A* 省事。贝塞尔平滑倒是值得用——手动标的点之间用贝塞尔连一下，过弯会顺滑很多。

---

# 物理世界的坑

算法在仿真里跑得好好的，上实车就出问题。这是 RC 导航最头疼的部分。

## 蛇形走位 / 画龙

车走直线的时候左右小幅摆动，像蛇一样。

**原因：** 定位数据有高频噪声。激光 SLAM 或里程计的输出每一帧都有几厘米的抖动，Pure Pursuit 每一帧都在修正这个抖动，越修越抖。

**解法：** 低通滤波。对定位数据做滑动平均，滤掉高频噪声：

```python
class LowPassFilter:
    def __init__(self, alpha=0.3):
        self.alpha = alpha
        self.value = None

    def update(self, new_value):
        if self.value is None:
            self.value = new_value
        else:
            self.value = self.alpha * new_value + (1 - self.alpha) * self.value
        return self.value

# 用法
filter_x = LowPassFilter(alpha=0.3)
filter_y = LowPassFilter(alpha=0.3)

while running:
    raw_x, raw_y = get_position()
    x = filter_x.update(raw_x)
    y = filter_y.update(raw_y)
    omega = pure_pursuit((x, y, theta), path, v)
```

`alpha` 越小滤波越强，响应越慢。取值 0.2~0.5 之间调。

## 过弯过冲 / 走对数曲线

车到了弯道应该转弯，但转不过来，冲出赛道。或者走着走着走出一条越来越弯的弧线。

**原因：** 定位数据有延时。激光 SLAM 处理一帧要 50~100ms，你拿到的位姿是 100ms 之前的，但 Pure Pursuit 用这个"旧"位姿算出来的角速度是针对 100ms 前的位置的。速度越快，100ms 的位移越大，误差越大。

**解法：** 航位推算补偿。用上一帧的速度和角速度，把位姿往前推算 100ms：

```python
def predict_state(state, v, omega, dt):
    """航位推算：用运动模型预测 dt 秒后的位姿"""
    x, y, theta = state
    x += v * math.cos(theta) * dt
    y += v * math.sin(theta) * dt
    theta += omega * dt
    return (x, y, theta)

# 收到定位数据后，推算到"当前时刻"
state = get_position()              # 这是 100ms 前的位姿
state = predict_state(state, v, omega, 0.1)  # 推算到现在
omega = pure_pursuit(state, path, v)
```

## 坐标瞬移 / 重定位跳变

车走着走着，定位突然跳了几十厘米甚至几米。Pure Pursuit 看到位置突然变了，以为车偏了，猛打方向，车直接甩尾。

**原因：** ICP/NDT 匹配失败后重新匹配成功，或者粒子滤波重采样后粒子收敛到了新位置。这在环境退化（长走廊、空旷区域）时容易发生。

**解法：** 没有完美解法。几个缓解措施：
- 对定位输出做异常值检测，跳变超过阈值就丢弃这一帧
- 用轮式里程计做降级，定位跳变时切回里程计
- 过滤器的 `alpha` 调小，让定位变化更平滑

> 这些问题在仿真里全都碰不到——仿真器的定位是完美的，没有噪声、没有延时、没有跳变。所以上实车之前一定要做故障注入测试（下一章会讲）。

---

# 小结

Pure Pursuit 就三步：找前瞻点 → 算曲率 → 发角速度。数学不复杂，实现不复杂，调 `Ld` 一个参数就能出效果。

真正难的是物理世界——定位有噪声、有延时、有跳变，算法在仿真里跑得好好的上实车就蛇形走位。低通滤波、航位推算、异常值检测这些"补丁"才是决定车能不能跑稳的关键。

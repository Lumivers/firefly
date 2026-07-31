---
title: "脱离硬件的软件在环仿真"
published: 2026-07-26
pinned: false
description: "从零搭建 2D 仿真沙盒，用 Pygame 可视化 Pure Pursuit，注入故障压测算法鲁棒性。"
tags: [仿真, pygame, pure_pursuit, 故障注入, 教程]
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 上一章的 Pure Pursuit 代码在控制台跑了一下输出数字就完事了，根本看不出来车走得好不好。这一章我们把它接到一个 2D 仿真器里，屏幕上能看到车在走、路径在那、前瞻点在动——改一个参数立刻看到效果。

# 为什么要仿真？

上实车之前先在电脑上跑通，这不是偷懒，是省时间。

**实车调试成本高。** 要搬设备、接线、找场地、调完发现问题要重新编译部署。一轮下来半小时起步。

**仿真可以无限重复。** 同一条路径跑 100 遍，改 100 个参数，每遍 5 秒出结果。实车跑 100 遍要一整天。

**仿真可以注入故障。** 给定位加 100ms 延时、加高频噪声、模拟跳变——这些在实车上很难复现，在仿真里改一个数字就行。

**仿真不会撞墙。** 算法有 bug 车飞出赛道，在仿真里就是屏幕上一个小图标飞出画面，重启就行。实车上飞出去要捡车、可能还要修。

---

# 开始之前你需要什么

这个仿真方案用的是 Python + Pygame，不需要装 ROS2，不需要 Docker，不需要任何重型工具。

**Python 3.10+：** 你电脑上应该已经有了。

**Pygame：** 一个 Python 的 2D 游戏库，用来画画面和处理键盘输入。

```bash
pip install pygame
```

装完跑一下确认没问题：

```python
import pygame
pygame.init()
screen = pygame.display.set_mode((800, 600))
pygame.display.set_caption("test")
print("pygame ok")
pygame.quit()
```

能看到窗口弹出来就行。

**上一章的 Pure Pursuit 函数：** 直接拿过来用，不用改。

就这些。不需要 ROS2，不需要 C++，不需要编译。

---

# 仿真器的基本结构

一个 2D 仿真器的核心就三样东西：

```
物理模型：给定速度指令，算出下一帧的位姿
渲染：把位姿画到屏幕上
循环：每帧执行 物理更新 → 渲染 → 等待下一帧
```

## 运动学积分器

上一章讲了底盘逆运动学（给定 v 和 ω 算轮速），这里用它的正运动学——给定 v 和 ω 算下一帧的位姿：

```python
import math

def step(state, v, omega, dt):
    """
    运动学积分：给定当前位姿和速度指令，算出 dt 秒后的位姿。
    state: (x, y, theta)
    v: 线速度 m/s
    omega: 角速度 rad/s
    dt: 时间步长 s
    """
    x, y, theta = state
    x += v * math.cos(theta) * dt
    y += v * math.sin(theta) * dt
    theta += omega * dt
    return (x, y, theta)
```

这就是仿真的"物理引擎"——一条公式。车每帧根据当前速度和朝向往前走一小步。

> dt 取 0.02s（50Hz），和实际控制频率一致。dt 太大积分会不准（车走出折线），dt 太小浪费算力。

## 坐标系

屏幕坐标系和数学坐标系不一样——屏幕 y 轴向下，数学 y 轴向上。仿真里用数学坐标系（y 向上），画到屏幕上的时候做一次翻转：

```python
def world_to_screen(x, y, screen_w, screen_h, scale, offset_x, offset_y):
    """数学坐标 → 屏幕坐标"""
    sx = int(x * scale + offset_x)
    sy = int(screen_h - (y * scale + offset_y))  # y 轴翻转
    return sx, sy
```

`scale` 控制"1 米等于多少像素"，`offset_x/offset_y` 控制画面偏移。

---

# 完整的仿真器

把上面的东西组装起来：

```python
import pygame
import math

# ── Pure Pursuit（上一章的代码） ──

def pure_pursuit(state, path, v, Ld_min=0.3, k=1.0):
    x, y, theta = state
    min_dist = float('inf')
    nearest_idx = 0
    for i, (px, py) in enumerate(path):
        d = math.hypot(px - x, py - y)
        if d < min_dist:
            min_dist = d
            nearest_idx = i
    Ld = max(Ld_min, k * v)
    target = path[-1]
    for i in range(nearest_idx, len(path)):
        px, py = path[i]
        d = math.hypot(px - x, py - y)
        if d >= Ld:
            target = (px, py)
            break
    dx = target[0] - x
    dy = target[1] - y
    local_x =  dx * math.cos(theta) + dy * math.sin(theta)
    local_y = -dx * math.sin(theta) + dy * math.cos(theta)
    Ld_actual = math.hypot(local_x, local_y)
    if Ld_actual < 0.01:
        return 0.0, target
    curvature = 2.0 * local_y / (Ld_actual ** 2)
    omega = v * curvature
    return omega, target

# ── 运动学积分 ──

def step(state, v, omega, dt):
    x, y, theta = state
    x += v * math.cos(theta) * dt
    y += v * math.sin(theta) * dt
    theta += omega * dt
    return (x, y, theta)

# ── 坐标转换 ──

def world_to_screen(x, y, sw, sh, scale, ox, oy):
    return (int(x * scale + ox), int(sh - (y * scale + oy)))

# ── 主仿真 ──

def main():
    # 路径
    path = [(0,0), (2,0), (4,1), (5,3), (5,5), (3,6), (1,6)]

    # 初始状态
    state = (0.0, 0.0, 0.0)
    v = 1.5          # 速度 m/s
    dt = 0.02         # 50Hz
    trail = []        # 轨迹

    # Pygame 初始化
    pygame.init()
    sw, sh = 900, 700
    screen = pygame.display.set_mode((sw, sh))
    pygame.display.set_caption("Pure Pursuit 仿真")
    clock = pygame.time.Clock()

    # 坐标参数：1米=80像素，原点偏移到左下角
    scale = 80
    ox, oy = 100, 100

    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_r:  # R 键重置
                    state = (0.0, 0.0, 0.0)
                    trail.clear()
                if event.key == pygame.K_UP:
                    v += 0.2
                if event.key == pygame.K_DOWN:
                    v -= 0.2

        # 物理更新
        omega, target = pure_pursuit(state, path, v)
        state = step(state, v, omega, dt)
        trail.append((state[0], state[1]))

        # 渲染
        screen.fill((30, 30, 30))

        # 画路径
        pts = [world_to_screen(px, py, sw, sh, scale, ox, oy) for px, py in path]
        if len(pts) > 1:
            pygame.draw.lines(screen, (100, 200, 100), False, pts, 2)

        # 画轨迹
        if len(trail) > 1:
            tpts = [world_to_screen(tx, ty, sw, sh, scale, ox, oy) for tx, ty in trail]
            pygame.draw.lines(screen, (50, 100, 200), False, tpts, 1)

        # 画前瞻点
        tx, ty = world_to_screen(target[0], target[1], sw, sh, scale, ox, oy)
        pygame.draw.circle(screen, (255, 200, 0), (tx, ty), 5)

        # 画车（三角形）
        cx, cy = world_to_screen(state[0], state[1], sw, sh, scale, ox, oy)
        angle = state[2]
        car_len = 15
        p1 = (cx + car_len * math.cos(angle), cy - car_len * math.sin(angle))
        p2 = (cx + car_len * math.cos(angle + 2.5), cy - car_len * math.sin(angle + 2.5))
        p3 = (cx + car_len * math.cos(angle - 2.5), cy - car_len * math.sin(angle - 2.5))
        pygame.draw.polygon(screen, (255, 80, 80), [p1, p2, p3])

        # HUD
        font = pygame.font.SysFont(None, 24)
        hud = font.render(f"v={v:.1f} m/s  Ld={max(0.3, 1.0*v):.2f}m  [R]重置 [↑↓]调速", True, (200,200,200))
        screen.blit(hud, (10, 10))

        pygame.display.flip()
        clock.tick(50)

    pygame.quit()

if __name__ == "__main__":
    main()
```

```bash
python pursuit_sim.py
```

跑起来你能看到：
- 绿线是规划路径
- 蓝线是车实际走的轨迹
- 黄点是前瞻点
- 红色三角形是车
- 按上下箭头调速度，按 R 重置

改一下 `path` 里的坐标、改一下 `v` 的值、改一下 `Ld_min`，立刻看到效果。比控制台输出数字直观一万倍。

---

# 故障注入：压测算法鲁棒性

仿真器跑通了，但这只是理想情况——定位完美、没有延时、没有噪声。实车上不是这样的。

## 加定位延时

激光 SLAM 处理一帧要 50~100ms，你拿到的位姿是过去的。在仿真里模拟这个延时：

```python
from collections import deque

class DelayBuffer:
    def __init__(self, delay_steps):
        self.buffer = deque(maxlen=delay_steps + 1)

    def push(self, state):
        self.buffer.append(state)

    def get(self):
        if len(self.buffer) < self.buffer.maxlen:
            return self.buffer[0]  # 缓冲区没满，用最早的
        return self.buffer[0]      # 返回 delay_steps 帧前的数据

# 用法
delay = DelayBuffer(delay_steps=5)  # 5帧 × 0.02s = 100ms 延时

while running:
    delay.push(state)                    # 每帧把真实位姿塞进缓冲区
    delayed_state = delay.get()          # 取出 100ms 前的位姿
    omega, target = pure_pursuit(delayed_state, path, v)  # 用旧位姿算控制量
    state = step(state, v, omega, dt)    # 但物理更新用真实位姿
```

加上 100ms 延时后，过弯的时候车会明显切弯。速度越快切得越厉害。

## 加定位噪声

```python
import random

def add_noise(state, pos_std=0.02, angle_std=0.01):
    """给位姿加高斯噪声"""
    x, y, theta = state
    return (
        x + random.gauss(0, pos_std),      # 位置噪声 2cm
        y + random.gauss(0, pos_std),
        theta + random.gauss(0, angle_std), # 角度噪声 0.01rad
    )

# 用法
noisy_state = add_noise(state)
omega, target = pure_pursuit(noisy_state, path, v)
```

噪声加到 5cm 以上，车就开始蛇形走位了。这时候就知道上一章说的低通滤波为什么重要。

## 加定位跳变

```python
def maybe_jump(state, jump_prob=0.005, jump_dist=0.3):
    """0.5% 概率产生 30cm 的跳变"""
    if random.random() < jump_prob:
        x, y, theta = state
        return (x + random.uniform(-jump_dist, jump_dist),
                y + random.uniform(-jump_dist, jump_dist),
                theta)
    return state
```

跳变发生的时候，Pure Pursuit 会猛打方向。这就是为什么实车上要做异常值检测。

## 组合起来

```python
delay = DelayBuffer(delay_steps=5)

while running:
    # 真实位姿
    omega, target = pure_pursuit(observed_state, path, v)
    state = step(state, v, omega, dt)

    # 观测位姿 = 真实位姿 + 延时 + 噪声 + 可能的跳变
    observed = add_noise(state)
    observed = maybe_jump(observed)
    delay.push(observed)
    observed_state = delay.get()
```

> 仿真的价值不是"跑通了算法"，而是"在各种恶劣条件下跑通了算法"。加上延时、噪声、跳变之后还能稳定跟踪的代码，上实车才有底气。

---

# 改参数的直观感受

仿真最大的好处是改参数立刻看到效果。试一下这些：

```python
# Ld 从 0.3 改到 2.0，看车怎么变
# v 从 0.5 改到 3.0，看过弯切多少
# 噪声从 0.01 改到 0.1，看蛇形走位多严重
# 延时从 0 改到 200ms，看过弯过冲多少
```

每个参数改一下，跑 10 秒看效果，比在实车上调参快 100 倍。

---

# 小结

仿真的核心就是三条：运动学积分算位姿、Pygame 画到屏幕上、故障注入压测算法。

不需要 ROS2，不需要 Gazebo，不需要 Docker。一个 Python 文件，几十行代码，就能在电脑上看到车怎么跑、哪里会出问题。上一章的 Pure Pursuit 调好参数、加上滤波和补偿，再往这个仿真器里一跑，上实车之前心里就有数了。

---
title: "脱离硬件的软件在环仿真"
published: 2026-07-26
pinned: false
description: "为什么不需要等真车、基于 robocon-fsm 的 Mock 决策全场仿真、Pygame 轻量 2D 轨迹跟踪仿真、故障注入压测鲁棒性。"
tags: [仿真, sitl, mock, pygame, pure_pursuit, robocon-fsm, 教程, 赛场经验]
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 在备赛前期，最折磨人的情况就是：机械还在加工零件、电控还在焊接调板子，上位机手里没有车，不知道该干什么。很多队伍等到临近比赛最后两周车才装好，上位机匆忙上车写战术，结果发现各种死锁、竞态和超时 bug，根本没时间改。这一章我们讲怎么脱离真实硬件，在普通电脑上把整套软件逻辑跑通。

# 为什么做上位机不需要等真车？

做上位机开发，一个很关键的思维转变是：**不要把你的代码进度和硬件绑定在一起。**

整套上位机系统其实可以清晰地分成两部分验证：
1. **决策层逻辑验证**：小车全场从起点到工位、抓取、避障、发射这一整套战术流程，有没有逻辑死锁？红蓝方切换参数对不对？遇到丢包和超时能不能自愈？
2. **控制层轨迹验证**：Pure Pursuit 算出来的速度平不平？会不会蛇形画龙？终点能不能平稳停住？

这两块完全可以在你自己的 Windows / Mac / Linux 笔记本上，**不接真车、甚至不需要启动 ROS 2**，直接脱机跑通。

---

# 决策层仿真：基于 `robocon-fsm` 的 Mock 机制

在 `robocon-fsm` 框架的设计中，我们专门提供了一个脱机测试模块：`MockActionDispatcher`（参考框架源码 `examples/02_mock_robot_mission/`）。

它的思路非常简单：**用一个虚拟的动作执行器，替代真实的硬件底层。你调用发指令，它在后台模拟真实硬件的时序，自动给你投递反馈事件。**

### 1. 脱机全流程仿真示例

下面这段代码不需要 ROS 2 环境，只需要 Python 3.8+ 就能直接运行：

```python
import asyncio
import logging
from robocon_fsm import FSM, Blackboard
from robocon_fsm.mock import MockActionDispatcher

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

class SimulatedRobot:
    def __init__(self):
        self.fsm = FSM()
        # 挂载虚拟动作分发器：自动模拟硬件回包
        self.mock_act = MockActionDispatcher(self.fsm, auto_ack=True)
        self.bb = Blackboard(is_red_team=True, current_score=0)

    async def go_to(self, x: float, y: float, timeout: float = 2.0):
        logging.info("--> [底盘导航] 前往目标点 (%.2f, %.2f)", x, y)
        # 模拟小车跑了 150ms 到位，并在后台向状态机投递 NAV_DONE 事件
        self.mock_act.simulate_navigation(x, y, duration=0.15)
        
        # 竞态等待：要么正常到达，要么半路触发避障
        event = await self.fsm.wait_any("NAV_DONE", "OBSTACLE", timeout=timeout)
        if event.type == "OBSTACLE":
            logging.warning("⚠️ 半路检测到障碍物，执行局部避让...")
            await self.fsm.wait(0.1)
            return await self.go_to(x, y, timeout)
            
        logging.info("<-- [底盘导航] 成功到达目标工位！")
        return event

    async def grab_block(self, block_id: int):
        logging.info("--> [机械爪] 开始抓取物块 #%d...", block_id)
        # 模拟气缸闭合耗时 100ms 并回包
        self.mock_act.simulate_actuator(
            actuator_name="gripper",
            command_id=block_id,
            done_event_type="ARM_DONE",
            duration=0.1
        )
        await self.fsm.wait_event("ARM_DONE", timeout=1.0)
        logging.info("<-- [机械爪] 物块抓取完成！")

    async def run_mission(self):
        logging.info(">>> 全场比赛战术启动！队伍模式: %s", "红方" if self.bb.is_red_team else "蓝方")

        # 1. 跑位到取料区
        await self.go_to(1.5, 0.8)

        # 2. 连续抓两个物块
        for i in [1, 2]:
            await self.grab_block(block_id=i)
            self.bb.current_score += 10
            logging.info("当前得分: %d", self.bb.current_score)

        # 3. 停稳 0.2s 并并行等待传感器确认
        await self.fsm.wait(0.2)
        
        # 4. 跑位到发射区
        await self.go_to(3.8, 2.2)
        logging.info(">>> 全场任务顺利执行完毕！")

if __name__ == "__main__":
    robot = SimulatedRobot()
    asyncio.run(robot.run_mission())
```

### 2. 决策层能测出什么问题？

在没有真车的时候，运行这个脚本你能测出很多平时难以发现的问题：
* **死锁测试**：如果某个动作少写了事件监听，或者事件名称拼写错误，程序会立刻在对应位置触发 `TimeoutError` 并打印总线黑匣子日志，秒级发现逻辑漏洞；
* **战术耗时预估**：把每个动作的模拟耗时按真实机械速度填入，整场跑一遍，就能算出 3 分钟内到底能不能跑完预定任务，战术节奏心里有数；
* **红蓝方镜像逻辑**：切换 `self.bb.is_red_team = False`，验证坐标镜像变换是否正常，会不会算到场外去。

---

# 控制层仿真：Pygame 2D 轨迹跟踪

很多同学一听到“底盘运动控制仿真”，就觉得必须要在 Linux 里装几十个 G 的 Gazebo 或者 Isaac Sim。

但在 RC 赛场这种已知平面场地里，搭建大型 3D 物理引擎不仅耗费大量时间配网格、碰撞体和关节力矩，而且往往“杀鸡用牛刀”。一个 150 行的 **Pygame 脚本**，足够你把上一章的 Pure Pursuit 算法调得明明白白。

### 1. 仿真器的核心架构

一个极简 2D 轨迹仿真器只需要三部分：
1. **运动学积分器**：根据当前线速度 \(v\) 和角速度 \(\omega\)，按照 \(dt = 0.02\text{s}\)（50Hz）推算下一时刻的坐标 $(x, y, \theta)$；
2. **算法接口**：调用上一章写好的 `pure_pursuit` 算法，算出当前需要的转向角速度；
3. **Pygame 绘图**：把赛道路径、小车轨迹、前瞻点画在窗口里。

### 2. 完整可视化仿真代码

新建一个 `sim_pursuit.py`：

```python
import pygame
import math

# ── 1. 运动学积分 (正运动学) ──
def step_forward(state, v, omega, dt=0.02):
    x, y, theta = state
    x += v * math.cos(theta) * dt
    y += v * math.sin(theta) * dt
    theta += omega * dt
    return (x, y, theta)

# ── 2. Pure Pursuit 跟踪计算 ──
def pure_pursuit(state, path, v, ld_min=0.35, k=0.8):
    x, y, theta = state
    ld = max(ld_min, k * v)

    # 寻找前瞻点
    target = path[-1]
    for px, py in path:
        if math.hypot(px - x, py - y) >= ld:
            target = (px, py)
            break

    # 转换到车体坐标系
    dx, dy = target[0] - x, target[1] - y
    local_y = -dx * math.sin(theta) + dy * math.cos(theta)
    ld_actual = math.hypot(dx, dy)
    if ld_actual < 0.01:
        return 0.0, target

    curvature = 2.0 * local_y / (ld_actual ** 2)
    omega = v * curvature
    return omega, target

# ── 3. 坐标系转换 (真实世界米 -> 屏幕像素) ──
def to_screen(x, y, scale=80, ox=100, oy=100, sh=600):
    return int(x * scale + ox), int(sh - (y * scale + oy))

# ── 4. 主渲染循环 ──
def main():
    pygame.init()
    sw, sh = 800, 600
    screen = pygame.display.set_mode((sw, sh))
    pygame.display.set_caption("Pure Pursuit 2D 仿真")
    clock = pygame.time.Clock()

    # 预设一条 S 弯比赛路线
    path = [(0, 0), (1.5, 0), (3.0, 1.0), (4.0, 2.5), (3.5, 4.0), (1.5, 4.5)]
    state = (0.0, 0.0, 0.0)
    trail = []
    v = 1.2

    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_r:  # 按 R 重置
                    state = (0.0, 0.0, 0.0)
                    trail.clear()
                elif event.key == pygame.K_UP:
                    v = min(3.0, v + 0.2)
                elif event.key == pygame.K_DOWN:
                    v = max(0.2, v - 0.2)

        # 算法与物理更新 (50Hz)
        omega, target_pt = pure_pursuit(state, path, v)
        state = step_forward(state, v, omega, dt=0.02)
        trail.append((state[0], state[1]))

        # 绘图
        screen.fill((30, 30, 30))

        # 规划路径 (绿色)
        path_pixels = [to_screen(px, py) for px, py in path]
        pygame.draw.lines(screen, (80, 200, 80), False, path_pixels, 2)

        # 实际跑出来的轨迹 (蓝色)
        if len(trail) > 1:
            trail_pixels = [to_screen(tx, ty) for tx, ty in trail]
            pygame.draw.lines(screen, (70, 130, 240), False, trail_pixels, 1)

        # 前瞻点 (黄色)
        tx, ty = to_screen(target_pt[0], target_pt[1])
        pygame.draw.circle(screen, (255, 215, 0), (tx, ty), 5)

        # 小车车头 (红色多边形)
        cx, cy = to_screen(state[0], state[1])
        heading = state[2]
        p_front = (cx + 15 * math.cos(heading), cy - 15 * math.sin(heading))
        p_left = (cx + 10 * math.cos(heading + 2.5), cy - 10 * math.sin(heading + 2.5))
        p_right = (cx + 10 * math.cos(heading - 2.5), cy - 10 * math.sin(heading - 2.5))
        pygame.draw.polygon(screen, (240, 80, 80), [p_front, p_left, p_right])

        # 显示 HUD 参数
        font = pygame.font.SysFont(None, 24)
        hud = font.render(f"速度: {v:.1f} m/s | [UP/DOWN] 调速 | [R] 重置", True, (220, 220, 220))
        screen.blit(hud, (15, 15))

        pygame.display.flip()
        clock.tick(50)

    pygame.quit()

if __name__ == "__main__":
    main()
```

运行这个脚本，在屏幕上一眼就能看到：
* 绿线是目标路径，蓝线是小车实际切过去的轨迹；
* 黄色小点就是前瞻点，跟着小车一路向前走；
* 按键盘上下箭头调速，观察速度变快时过弯切角的变化。

---

# 进阶：故障注入压测鲁棒性

完美的数学仿真其实很容易给人“一切顺利”的错觉。真实赛场上充满了延时和噪声。

仿真的最大威力，就在于**你可以主动往系统里注入各种毛刺，看算法会不会崩溃**：

### 1. 注入通信延时（Delay Buffer）

串口通信或者图像处理通常有 50ms~100ms 的延迟。小车算控制量时，拿到的位姿其实是过去的位姿：

```python
from collections import deque

class DelayBuffer:
    def __init__(self, delay_frames=4):
        self.buf = deque(maxlen=delay_frames + 1)

    def update(self, val):
        self.buf.append(val)
        return self.buf[0]

delay = DelayBuffer(delay_frames=4) # 4 帧 × 20ms = 80ms 延时

# 在仿真循环里：
real_state = step_forward(real_state, v, omega)
delayed_state = delay.update(real_state)
# 故意拿带延时的旧坐标去算 Pure Pursuit
omega, target = pure_pursuit(delayed_state, path, v)
```

加了 80ms 延时之后，你会明显看到小车过弯过冲。这时候上一章讲的“动态前瞻距离拉长”就能立竿见影地稳住车身。

### 2. 注入高频噪声

模拟地毯拼缝跳动和传感器高频毛刺：

```python
import random

def add_sensor_noise(state):
    x, y, theta = state
    return (
        x + random.gauss(0, 0.02),     # 2cm 位置噪点
        y + random.gauss(0, 0.02),
        theta + random.gauss(0, 0.01)   # 角度微小毛刺
    )
```

如果没做滤波，小车在屏幕上就会开始轻微左右晃动（蛇形走位）。这时候在仿真里加上低通滤波，看晃动被抹平，上实车心里就有底了。

---

# 小结

1. **上位机不要等真车**：把决策逻辑和底盘控制拆开，前期在普通电脑上就能完成 90% 的代码编写和测试。
2. **决策层用 Mock 测逻辑**：利用 `MockActionDispatcher` 模拟硬件回包，几秒钟跑通全场 3 分钟的战术，验证死锁、竞态和超时重试。
3. **控制层用 Pygame 调轨迹**：100 多行代码搭起 2D 仿真器，实时看前瞻点切弯和终点减速，告别繁重昂贵的复杂仿真平台。
4. **利用故障注入打预防针**：主动加入 80ms 延迟和 2cm 噪声，在恶劣条件下调试通过的控制算法，上实车几乎不会翻车。

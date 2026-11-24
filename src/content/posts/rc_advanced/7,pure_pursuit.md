---
title: "底盘运动学与 Pure Pursuit 轨迹跟踪"
published: 2026-07-26
pinned: false
description: "放弃 nav2 的理由、上位机速度控制边界、Pure Pursuit 原理与全向底盘解耦、终点减速规划、结合 robocon-fsm 打通 NAV_DONE 闭环。"
tags: [pure_pursuit, 运动学, 导航, 轨迹跟踪, robocon-fsm, 教程, 赛场经验]
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 上一章我们讲了怎么用 `robocon-fsm` 协程状态机调度比赛全场流程。在很多战术代码里，我们都会调用 `act.send_navigate(x, y)` 然后 `await fsm.wait_event("NAV_DONE")`。这一章我们就下沉到底盘控制层，看看这个导航底层到底是怎么跑起来的，以及如何把整个闭环彻底打通。

# 为什么不用 nav2？

很多刚接触 ROS 2 移动机器人的同学，第一反应是给车配一套标准的 `nav2`（ROS 2 导航栈）。

但在 Robocon / RC 这种对抗竞速赛场上，大部分强队最终都选择自己写简单的轨迹跟踪算法（比如 Pure Pursuit），原因很现实：

1. **地图完全已知，根本不需要在线全局规划**  
   nav2 的核心是 Costmap（代价地图）+ 全局路径规划（NavFn/Smac）+ 局部避障控制器（DWB/MPPI）。这套架构是给未知室内环境（比如扫地机、送餐车）设计的。但比赛场地在规则手册里尺寸、分区标得一清二楚，走位路线在备赛期就可以完全定死，根本不需要在车上实时开代价地图算路线。
2. **Costmap 在赛场贴边走位时会出严重问题**  
   比赛车经常需要紧贴着赛场边缘挡板或者料台精准停靠。但在 Costmap 里，挡板会被当成障碍物进行多层膨胀（Inflation Layer）。当小车靠近挡板时，nav2 会认为自己即将撞墙，疯狂减速甚至试图反向“推开”小车，导致车在挡板附近反复原地抽搐。这属于架构层面的假设冲突，调参非常痛苦。
3. **计算开销大且参数过于复杂**  
   nav2 涉及大量节点、参数文件和服务通信，光是把参数调扎实就得耗费很多天。赛场上我们需要的是**起步猛、跑得直、过弯平滑、到位坚决**，逻辑越简单确定性越高。

> 结论：在规则明确的竞技赛场上，自己写一套轻量的 Pure Pursuit（纯追踪）跟踪器，不仅开销极小，而且完全可控。

---

# 上位机的控制边界：我们只输出整车速度

在很多教材里，讲到移动底盘往往会花大篇幅推导电机的逆运动学公式（比如左轮转速多少、右轮转速多少、麦轮四个轮子各自怎么算）。

但在真正的整车架构分工里（回顾 Ch1~Ch3 的架构契约）：**上位机千万不要去算每个轮子的电机转速！**

* **上位机的职责**：拿到当前全局坐标 $(x, y, \theta)$，对照目标路径，计算出当前小车应该以多大线速度和角速度跑。即输出整车速度指令：
  \[
  \text{cmd\_vel} = (v_x, v_y, \omega)
  \]
* **电控的职责**：单片机接收到这组速度，结合底盘的轮距、轴距和轮子类型，解算出每个电机的目标转速，并在下位机做 200Hz+ 的电机 PID 闭环。

上位机把整车速度打包通过串口发给电控，权责分明，底盘换了轮子也不影响上位机代码。

---

# Pure Pursuit 核心数学原理

Pure Pursuit（纯追踪算法）的核心思路非常直观：**就像人开车一样，眼睛不看正下方，而是盯着前方一段距离的路径点（前瞻点 Lookahead Point），打方向盘沿着一段圆弧切过去。**

```
               ● 前瞻点 Target (lx, ly)
              /|
             / |
          Ld/  | ly
           /   |
          /    |
         ●─────┘
      车当前位置
```

### 1. 差速底盘的推导

假设小车当前处于车体坐标系原点，朝向为正前方（X 轴）：
- 在规划路径上，找到距离小车当前位置距离为 $L_d$（前瞻距离）的目标点，转换到车体坐标系下的坐标为 $(l_x, l_y)$；
- 目标点偏离车头的侧向位移为 $l_y$；
- 连接车身与前瞻点的圆弧半径为 $R$，圆弧曲率 $\kappa = \frac{1}{R}$。

由几何关系可以推导得出：

$$
\kappa = \frac{2 \cdot l_y}{L_d^2}
$$

如果当前给定的前进线速度为 $v$，那么底盘所需的转向角速度 $\omega$ 就是：

$$
\omega = v \cdot \kappa = \frac{2v \cdot l_y}{L_d^2}
$$

整个算法的核心就这一行公式：**侧向偏差 $l_y$ 越大，打方向的角度越大；前瞻距离 $L_d$ 越远，转向越平缓。**

### 2. 全向底盘（全向轮 / 麦克纳姆轮）的解耦跟踪

上面的推导针对的是差速底盘（车头必须顺着走）。但 Robocon 赛场上很多车用的是三轮全向、四轮麦轮或者舵轮底盘。

全向底盘最大的优势在于：**位移移动与车头朝向是完全解耦的！**

小车可以一边沿路径走曲线，车头一边始终朝向料台，甚至直接横移。针对全向底盘，Pure Pursuit 的做法更加灵活：

1. **轨迹平移跟踪**：
   直接计算车身指向前瞻点的世界坐标方向矢量，转换到车体自身坐标系，作为平移速度分量 $(v_x, v_y)$；
2. **车身航向角独立闭环**：
   车头朝向 $\theta$ 不跟随前瞻点切线，而是单独指定目标朝向 $\theta_{\text{target}}$，用一个简单的 P 控制器计算自转角速度：

   $$
   \omega = k_p \cdot \text{normalize\_angle}(\theta_{\text{target}} - \theta_{\text{current}})
   $$

这样小车就能实现“平移过弯的同时，机械爪提前旋转对准物块”，大幅节约进站时间。

---

# 终点减速与速度规划

如果纯按固定的巡航速度 $v_{\max}$ 跑，小车冲到终点前根本刹不住，要么直接冲出工位，要么急刹导致轮子在地毯上打滑破坏里程计。

在赛场实战中，必须加入简单的**终点距离减速规划**：

```python
# 简单的终点减速：距离终点越近，速度越小
dist_to_goal = math.hypot(goal_x - current_x, goal_y - current_y)

if dist_to_goal < slow_down_dist:
    # 线性减速，但保留一个最小蠕变速度，防止减速过头停在半路
    target_v = max(v_min, v_max * (dist_to_goal / slow_down_dist))
else:
    target_v = v_max
```

配合加速度限制（防止猛起步猛刹车打滑）：
```python
# 速度斜坡限制 (每周期允许的最大速度变化量 delta_v)
delta_v = max_acc * dt
if target_v > current_v + delta_v:
    cmd_v = current_v + delta_v
elif target_v < current_v - delta_v:
    cmd_v = current_v - delta_v
else:
    cmd_v = target_v
```

---

# 在 `robocon-fsm` 中打通闭环

现在我们来看看，这个跟踪算法在 `robocon-fsm` 框架里到底怎么和决策层串联起来。

在上一章的模板代码中，决策层只需这样写：
```python
# my_decision.py
await act.follow_path(bb.path_to_zone_a)
await fsm.wait_event("NAV_DONE", timeout=8.0)
```

那么底层的 `act.follow_path` 到底该怎么实现？它是怎么一边算速度、一边判断到达并唤醒状态机的？

我们直接在 `MyRobotActions`（继承自 `Ros2ActionDispatcher`）里实现这个闭环：

```python
# my_actions.py 内部的路径跟踪实现
import asyncio
import math

class MyRobotActions(Ros2ActionDispatcher):
    def __init__(self, node=None):
        super().__init__(node=node)
        self.enable_cmd_vel("/cmd_vel")

    async def follow_path(self, path, v_max=1.5, stop_tolerance=0.05):
        """
        异步路径跟踪任务: 50Hz 循环计算 Pure Pursuit 并下发 cmd_vel
        到达终点后自动刹车，并向状态机投递 NAV_DONE 事件
        """
        goal_x, goal_y = path[-1]

        while True:
            # 1. 从黑板或底层获取当前位姿
            curr_x = self.blackboard.current_pose_x
            curr_y = self.blackboard.current_pose_y
            curr_yaw = self.blackboard.current_pose_yaw

            # 2. 判断是否已经到达终点
            dist_to_goal = math.hypot(goal_x - curr_x, goal_y - curr_y)
            if dist_to_goal <= stop_tolerance:
                # 到位！下发零速刹车
                self.send_cmd_vel(0.0, 0.0, 0.0)
                # 触发状态机事件，唤醒等待它的协程
                self.post_event("NAV_DONE", success=True)
                break

            # 3. 寻找前瞻点
            lookahead_pt = self._get_lookahead_point(path, (curr_x, curr_y), lookahead_dist=0.4)

            # 4. 算终点减速
            v = min(v_max, max(0.2, v_max * (dist_to_goal / 1.0)))

            # 5. 计算 Pure Pursuit 转向角速度
            # 转换到车体坐标系
            dx = lookahead_pt[0] - curr_x
            dy = lookahead_pt[1] - curr_y
            local_y = -dx * math.sin(curr_yaw) + dy * math.cos(curr_yaw)
            ld_actual = math.hypot(dx, dy)
            omega = 2.0 * v * local_y / (ld_actual ** 2)

            # 6. 下发速度指令给下位机
            self.send_cmd_vel(v_x=v, v_y=0.0, omega=omega)

            # 7. 协程挂起 20ms (以 50Hz 控制频率运行)
            await asyncio.sleep(0.02)
```

看到这段代码，整套框架的逻辑就全通了：
- `follow_path` 是一个协程循环，每 20ms 让出一次 CPU，保证整个节点其他回调正常跑；
- 当小车跑到终点（误差小于 5cm），循环退出，发出零速停车指令；
- 最关键的一步：调用 `self.post_event("NAV_DONE", success=True)`；
- 决策层挂号等待的 `await fsm.wait_event("NAV_DONE")` 瞬间被唤醒，丝滑进入下一步抓取！

---

# 路径从哪来：从 params.yaml 加载航点 + 贝塞尔平滑

在实际比赛中，小车的行进路径绝不是临时算出来的，而是提前在赛场地图上标定好的。

### 1. 放在配置参数里（`params.yaml`）

千万别把坐标点硬编码在 Python 代码里。放在上一章讲的 YAML 参数中：

```yaml
# config/params.yaml
routes:
  start_to_pickup:
    - [0.0, 0.0]
    - [1.0, 0.1]
    - [2.0, 0.8]
    - [2.8, 1.5]
```

在赛前跑车发现起点放偏了或者料台微调了，直接改配置文件里的坐标即可。

### 2. 贝塞尔曲线平滑

如果直接用直线连接标定好的航点，折线转角处的曲率突变会导致底盘在转角处猛抖。用简单的贝塞尔曲线在航点之间做平滑插值：

```python
def generate_bezier_path(control_points, num_points=100):
    """
    通用贝塞尔平滑插值，把粗糙的几个航点变成密集的平滑路径点
    """
    n = len(control_points) - 1
    curve = []
    for step in range(num_points + 1):
        t = step / num_points
        # de Casteljau 递推解法
        points = [list(pt) for pt in control_points]
        for r in range(1, len(points)):
            for i in range(len(points) - r):
                points[i][0] = (1 - t) * points[i][0] + t * points[i + 1][0]
                points[i][1] = (1 - t) * points[i][1] + t * points[i + 1][1]
        curve.append((points[0][0], points[0][1]))
    return curve
```

标出 3~4 个关键折点，插值出 100 个平滑点丢给 Pure Pursuit，小车过弯就会像跑丝带一样平滑顺畅。

---

# 实车物理调试防坑技巧

在仿真里测轨迹通常一次就过，但在实车地毯上跑往往会遇到各种物理坑：

### 1. 跑直线时“画龙”（蛇形摆动）
* **现象**：小车走直线时车头一直左右小幅摆动，晃个不停。
* **原因**：前瞻距离 $L_d$ 设得太短（比如只有 0.1m~0.2m），控制算法对任何微小的横向误差都过度反应；加上里程计微小抖动，越修正越震荡。
* **解法**：**动态前瞻距离**。把 $L_d$ 与当前速度挂钩：

  $$
  L_d = \max(L_{d, \min}, k \cdot v)
  $$

  直道高速时把 $L_d$ 拉长到 0.5m~0.8m，车身就会非常稳；只有到低速转弯或进站时才缩短 $L_d$。

### 2. 第五章 DT35 坐标校正跳变时的防抖
* **现象**：第五章讲了小车到位后通过激光测距修正了里程计坐标（比如瞬间把 X 补偿了 2cm）。如果此时小车还在运动中，坐标瞬变会导致 Pure Pursuit 算出的 $l_y$ 突变，底盘猛打方向。
* **解法**：校正打点尽量选在小车减速停稳的瞬间（回顾上一章的 `await fsm.wait(0.1)` 停稳后再打点）；如果必须动态打点，把偏差通过低通滤波在接下来的 200ms 内平滑过渡吸收，而不是瞬时突变。

### 3. 加速度过大导致地毯打滑
* **现象**：小车起步瞬间猛冲，跑完全程发现终点漂了十几厘米。
* **原因**：电机扭矩很大，起步急加速让轮子和地毯之间发生了严重打滑，里程计直接丢步。
* **解法**：必须严格限制线加速度（通常限制在 $1.5 \sim 2.5\text{m/s}^2$ 之间，根据车重调整），让底盘柔和起步。

---

# 小结

1. **果断放弃 nav2**：已知封闭赛场不需要代价地图和复杂动态避障，轻量 Pure Pursuit 才是高可靠性的选择。
2. **遵守控制边界**：上位机负责输出整车速度 $(v_x, v_y, \omega)$，电机轮速交由电控在单片机里闭环解算。
3. **全向底盘解耦优势**：对于麦轮/全向轮，轨迹平移与车头朝向可以完全分开，平移走位的同时车身独立瞄准工位。
4. **终点减速必不可少**：距离终点越近速度线性降低，配合加速度限制，防止冲过头和地毯打滑。
5. **打通 FSM 闭环**：在 50Hz 跟踪协程内判断终点到位，停车并调用 `post_event("NAV_DONE")`，使上层状态机优雅衔接。
6. **参数化与贝塞尔平滑**：航点存入 `params.yaml`，用贝塞尔曲线平滑折点，过弯既顺滑又便于现场调校。

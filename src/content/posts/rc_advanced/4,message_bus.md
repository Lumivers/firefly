---
title: "轻量消息总线与三层架构"
published: 2026-07-26
pinned: false
description: "ROS2 pub/sub 机制、复杂决策下的回调卡死痛点、ROS2 与 asyncio 双线程桥接架构、赛场热重置机制与三层解耦设计。"
tags: [ros2, pub/sub, 消息总线, 架构, asyncio, 教程]
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 串口协议搞定了，硬件驱动也能收发数据了。但上位机内部各个模块之间怎么传数据？当线性的比赛战术遇到异步事件时，又该怎么写才不会把节点卡死？这一章聊聊消息总线与架构桥接。

# 模块之间为什么要通信？

上位机不是一个 `main` 函数就能从头跑到尾的控制程序。

在真实的机器人系统里，多个任务是同时在运转的：
- **串口驱动节点**：以高频率接收下位机的数据包，解包后把里程计与机构状态发出来；同时等待上层的控制指令发往下位机。
- **定位与感知节点**：处理激光雷达、双目相机或 UWB 传感器，实时计算机器人在场地上的绝对坐标。
- **决策调度节点**：根据赛场局势，决定现在是去取物块、还是去发射区、还是避障，并协调各个机构执行动作。

最粗暴的做法是把所有东西塞进一个大进程里直接调函数，但很快你就会发现：雷达算一帧点云要 30ms，串口接收要求毫秒级响应，直接函数调用不是把线程卡死，就是多线程共享内存被数据踩烂。

因此，模块与模块之间必须解耦，通过**消息总线（Message Bus）**来交换数据。

---

# ROS 2 Pub/Sub 机制

在当前的机器人技术生态里，ROS 2 是事实上的工业标准。它底层依赖 DDS（数据分发服务），提供了跨进程、跨机器的消息发布与订阅能力。

## 核心模型：发布者与订阅者互不相识

ROS 2 的核心通信逻辑非常简单：**发布者往 Topic 扔消息，订阅者从 Topic 捡消息**。双方不需要知道对方的 IP 地址、进程 ID，甚至不需要知道对方是否存在。

**发布者（Talker 示例）：**

```python
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist

class CmdVelPublisher(Node):
    def __init__(self):
        super().__init__('cmd_vel_publisher')
        self.pub = self.create_publisher(Twist, '/cmd_vel', 10)
        self.timer = self.create_timer(0.05, self.on_timer)  # 20Hz 发送速度

    def on_timer(self):
        msg = Twist()
        msg.linear.x = 1.0  # 前进速度 1.0 m/s
        msg.angular.z = 0.0
        self.pub.publish(msg)

def main():
    rclpy.init()
    rclpy.spin(CmdVelPublisher())
    rclpy.shutdown()
```

**订阅者（Listener 示例）：**

```python
import rclpy
from rclpy.node import Node
from geometry_msgs.msg import Twist

class CmdVelListener(Node):
    def __init__(self):
        super().__init__('cmd_vel_listener')
        self.sub = self.create_subscription(Twist, '/cmd_vel', self.on_cmd_vel, 10)

    def on_cmd_vel(self, msg: Twist):
        self.get_logger().info(f"收到速度指令: vx={msg.linear.x:.2f}, wz={msg.angular.z:.2f}")

def main():
    rclpy.init()
    rclpy.spin(CmdVelListener())
    rclpy.shutdown()
```

启动两个独立终端分别运行，就能看到速度指令顺畅地跨进程传输。

## QoS 策略：传感器与指令不能一视同仁

ROS 2 引入了 QoS（服务质量）配置。在 Robocon 赛场上，你最需要区分两种通信场景：

| 数据类型 | 典型话题 | QoS 建议 | 核心考量 |
|---|---|---|---|
| **高频传感器流** | `/odom`, `/scan`, `/camera/pose` | `BEST_EFFORT`（尽力而为） | 丢了一帧无所谓，下一帧毫秒级就到；最怕网络排队导致读到几百毫秒前的历史旧帧。 |
| **控制与状态确认** | `/cmd_vel`, `/robot/gripper_cmd`, `/robot/nav_reached` | `RELIABLE`（可靠交付） | 抓取、投掷指令绝不能丢，丢一帧机器人就可能停在原地发呆甚至失控。 |

```python
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy

# 传感器 QoS 配置
sensor_qos = QoSProfile(
    reliability=ReliabilityPolicy.BEST_EFFORT,
    history=HistoryPolicy.KEEP_LAST,
    depth=1
)

# 控制指令 QoS 配置
cmd_qos = QoSProfile(
    reliability=ReliabilityPolicy.RELIABLE,
    history=HistoryPolicy.KEEP_LAST,
    depth=10
)
```

---

# ROS 2 在复杂决策面前的致命痛点

既然 ROS 2 的 Pub/Sub 这么好用，那我们能不能直接用原生的 ROS 2 节点写整场比赛的决策呢？

几乎所有刚入门的战队同学都会这么尝试，然后无一例外在赛前联调时遇到以下三个典型“车祸现场”。

### 痛点一：`spin()` 单线程阻塞与回调地狱

ROS 2 的 Python 节点默认由 `rclpy.spin(node)` 驱动。它是一个单线程的事件循环，所有订阅回调、定时器回调都在同一个主线程里串行排队执行。

如果你写出下面这种代码：

```python
# 典型车祸代码：在回调里阻塞等待
class NaiveDecisionNode(Node):
    def on_start_match(self, msg):
        self.send_move_to_zone1()
        time.sleep(3.0)  # 等待车开到 1 号区 —— 致命错误！
        self.send_arm_grab()
```

在这 `time.sleep(3.0)` 的 3 秒钟内，**整个节点的线程彻底被占死**。底盘反馈话题、急停话题、激光雷达里程计话题全部无法被处理。底层 DDS 接收队列瞬间积压爆仓，车子冲出赛道你都收不到报错。

为了不阻塞，有人改用状态机标志位切分回调：

```python
# 典型车祸代码 2：回调地狱与散落一地的全局标志位
def on_nav_feedback(self, msg):
    if self.state == State.GOING_TO_ZONE1 and msg.reached:
        self.state = State.GRABBING
        self.send_grab()
    elif self.state == State.GRABBING and msg.gripper_done:
        self.state = State.RETURNING
        self.send_return()
    # 随着战术增多，这里会膨胀成数百行巨型 if-else，逻辑碎片化到无法维护
```

整场 3 分钟的连贯战术，被生生撕裂成了数十个散落在不同回调里的碎片函数。想要看清楚“车到底按什么顺序走”，必须在几个文件和回调之间来回人肉跳转。

### 痛点二：试图在回调里直接塞 asyncio 导致的死锁

了解 Python 的同学会想到：可以用 `asyncio` 的 `async/await` 写连贯的异步代码呀！

于是大家经常写出这种尝试：

```python
# 典型车祸代码 3：在 ROS 回调里混用 asyncio.run
def on_start_button(self, msg):
    # 直接报错: RuntimeError: This event loop is already running
    # 或者阻塞当前 ROS spin 线程，导致外层回调再也无法触发
    asyncio.run(self.my_mission())
```

因为 ROS 2 的 `spin()` 有自己的事件派发逻辑，而 `asyncio` 也有自己的事件循环。两者如果在同一个线程里抢夺控制权，要么抛出异常，要么直接死锁。

### 痛点三：`MultiThreadedExecutor` 并不是万能药

ROS 2 官方提供了多线程执行器 `MultiThreadedExecutor`，允许多个回调在线程池中并发执行。但这只解决了“并发处理回调”，并没有解决“长流程任务调度”。

如果要在不同回调线程之间等待彼此的结果，你就必须手动编写 `threading.Event`、`Condition` 或各种加锁机制。一旦赛场出现网络抖动或丢包，锁没释放，整车直接假死在场地上。

---

# 核心方案：ROS 2 + asyncio 双线程桥接架构

为了彻底解决“既要 ROS 2 的跨进程通信能力，又要 Python 协程线性的任务表达能力”，`robocon-fsm` 采用了**双线程解耦桥接架构**。

```
┌───────────────────────────────┐
│                     ROS 2 决策节点进程                       │
│                                                              │
│  【线程 1: ROS 2 主线程】            【线程 2: 决策协程线程】│
│                                                              │
│   MultiThreadedExecutor               asyncio Event Loop     │
│            │                                   │           │
│       rclpy.spin()                      loop.run_forever()   │
│            │                                   │           │
│     收到 ROS Topic 回调                  执行 run_mission()  │
│            │                                   │           │
│   actions.post_event()                          │           │
│            │   call_soon_threadsafe()          │           │
│            └─────────────► 唤醒挂起的 Future  │
│                                                 │           │
│                                        await fsm.wait_event()│
│                                                 │           │
│   直接发布 ROS 话题 (底层 C++ 线程安全)         │           │
│             ◄─────────────────┘           │
│   actions.send_navigate()                                    │
└───────────────────────────────┘
```

这个架构的分工极其清晰：

1. **线程 1（ROS 2 主线程）**：跑 `MultiThreadedExecutor`。它是一个被动响应式的“外壳”，只负责接收传感器和底层反馈话题。任何回调里绝不包含耗时逻辑，收到数据后只做解析并向状态机投递事件。
2. **线程 2（`DecisionWorker` 协程线程）**：跑独立的 `asyncio` 事件循环。全场战术流程 `async def run_mission()` 运行在这个线程中。你可以自由使用 `await fsm.wait_event(...)`，代码完全是线性的，挂起等待时绝不阻塞任何 ROS 2 回调。

### 跨线程桥梁的灵魂：`call_soon_threadsafe`

在两个线程之间传递数据，安全性是第一原则：

- **从 ROS 2 到 asyncio（消息转事件）**：
  当 ROS 2 订阅收到 `/robot/nav_reached` 时，回调函数调用 `post_event("NAV_DONE")`。在 FSM 内部：
  ```python
  if self._loop.is_running():
      self._loop.call_soon_threadsafe(self._dispatch_event, ev)
  ```
  `call_soon_threadsafe` 是 Python 标准库提供的线程安全投递原语。它直接向目标事件循环投递任务，由目标线程的 loop 在下一个 tick 安全执行，唤醒正在等待该事件的 `Future`。**微秒级延迟，且完全不需要业务层手动加互斥锁。**

- **从 asyncio 到 ROS 2（动作指令下发）**：
  协程在执行 `act.send_navigate(x, y)` 时，直接调用 ROS 2 Publisher 的 `publish()` 方法。ROS 2 底层是由 C/C++ 实现的 DDS 接口，`publish` 本身就是线程安全的，因此协程线程可以直接下发，立刻发出网络报文。

---

# 实战代码：从基类到全场装配

在 `robocon-fsm` 中，这个双线程架构被提炼为可复用的基类 `Ros2DecisionNodeBase`。

### 1. 核心基类实现 (`node_base.py`)

```python
import asyncio
import threading
from typing import Optional
import rclpy
from rclpy.node import Node
from rclpy.executors import MultiThreadedExecutor

from robocon_fsm.core.fsm import FSM
from robocon_fsm.core.context import Blackboard

class Ros2DecisionNodeBase(Node):
    def __init__(self, node_name: str = "decision_node"):
        super().__init__(node_name)

        self.fsm = FSM()
        self.blackboard = Blackboard()
        self.act = None

        # 创建独立的 asyncio 事件循环并注入状态机
        self._loop = asyncio.new_event_loop()
        self.fsm.set_loop(self._loop)
        self._decision_thread: Optional[threading.Thread] = None
        self._current_task: Optional[asyncio.Task] = None

    def set_action_dispatcher(self, action_dispatcher):
        self.act = action_dispatcher
        self.act.bind_fsm(self.fsm)

    def start_decision(self):
        """在独立后台线程中启动 asyncio 事件循环"""
        def _run_loop():
            asyncio.set_event_loop(self._loop)
            self._current_task = self._loop.create_task(self._safe_run_mission())
            self._loop.run_forever()

        self._decision_thread = threading.Thread(
            target=_run_loop, daemon=True, name="DecisionWorker"
        )
        self._decision_thread.start()

    async def _safe_run_mission(self):
        try:
            await self.run_mission()
        except asyncio.CancelledError:
            self.get_logger().info("决策任务已被取消或重置")
        except Exception as e:
            self.get_logger().error(f"决策任务未捕获异常: {e}", exc_info=True)

    async def run_mission(self):
        """虚方法：由队伍子类实现具体的比赛全流程"""
        raise NotImplementedError
```

### 2. 赛场救命神器：`reset_mission` 免杀进程热重置

在 Robocon 3 分钟的正式比赛中，如果小车中途卡住或发生意外，规则通常允许操作手向裁判举手申请“重试”（Retry），并将小车抱回起跑区重新出发。

如果你采用传统的“Ctrl+C 杀掉所有节点再 ros2 launch”方案：
1. DDS 节点重新发现与话题匹配需要 2~3 秒；
2. 串口设备文件可能由于旧进程未完全释放而报 `Device or resource busy`；
3. 比赛时间分秒必争，重启失败往往直接导致比赛零分。

而在双线程架构下，我们设计了**免杀进程热重置机制**：

```python
    def reset_mission(self) -> None:
        """赛场免杀进程热重置"""
        self.get_logger().warn(">>> [RESET] 触发任务热重置，正在归位状态机...")
        
        # 1. 立即给硬件下发急停，切断底盘与机械臂动作
        if self.act is not None:
            self.act.emergency_stop()

        # 2. 跨线程重置 asyncio 任务
        def _do_reset():
            self.fsm.clear()  # 拔掉所有挂起的等待 Future，防止旧事件唤醒新流程
            if self._current_task and not self._current_task.done():
                self._current_task.cancel()  # 取消正在执行的旧任务
            self._current_task = self._loop.create_task(self._safe_run_mission())

        if self._loop.is_running():
            self._loop.call_soon_threadsafe(_do_reset)
```

操作手只需要在遥控器上按一下按键，或者外部发一个 `/competition/reset` 话题：
- 节点进程不退出；
- 串口和雷达连接不中断；
- **直接取消旧协程、清空等待队列、重新拉起起跑流程**。小车放回起跑区就能直接开始第二轮冲刺！

---

# 三层解耦架构与工程组织

有了坚固的消息总线与双线程底座，整个上位机工程该如何分层组织？

我们在真实比赛项目中推行**三层解耦架构**：

```
┌───────────────────────────────┐
│  【决策调度层】 (my_decision.py)                             │
│  - 只管“做什么”                                            │
│  - 纯线性 async 流程，没有任何 ROS 话题细节                  │
│  - 如：await act.navigate(1.0, 2.0); await act.grab_ring()   │
├───────────────────────────────┤
│  【控制与动作分发层】 (my_actions.py)                        │
│  - 负责“怎么做”与软硬件协议翻译                            │
│  - 下发时：将高层语义动作转化为 ROS 话题发布 (/goal_pose 等) │
│  - 反馈时：监听 ROS 话题并将消息转化为状态机事件 post_event  │
├───────────────────────────────┤
│  【感知与底层驱动层】 (serial_driver_node.py, perception 等) │
│  - 只管“提供干净可靠的 ROS 话题数据”                       │
│  - 屏蔽串口 CRC、波特率、雷达点云滤波细节                    │
└───────────────────────────────┘
```

### 为什么是“分文件而非分人”？

很多软件工程教科书说“分层是为了方便不同小组分工合作”。但在现实的 Robocon 战队中，根本不可能有机械电控的同学来给你写上位机代码，**整个上位机通常就是你一个人（或者两名上位机同学）全权负责**。

分层的真正价值在于：**把变更频率不同的模块做物理隔离**。

- **感知驱动层（协议）**：开赛前两三个月把通信协议定好后，硬件不改基本不动。
- **动作分发层（动作）**：底盘与机械臂动作调稳后，几周不动一次。
- **决策调度层（战术）**：比赛前一天晚上、甚至预选赛每一场之间，都在根据对手的积分战术调整路线和取物顺序。

通过将它们拆分成独立文件（`my_decision.py`、`my_actions.py`、`main_node.py`）：
你可以在赛场备赛区疯狂修改战术流程，随心所欲调换取物顺序，而**完全不需要触碰串口收发、ROS 回调注册或节点生命周期的任何一行代码**。改完按一下保存，小车就能按全新战术出发，绝不会发生“改了战术导致串口驱动崩掉”的低级错误。

### 现场战术代码写起来有多爽？

看看在 `my_decision.py` 中写全场战术的实际体验：

```python
async def run_mission(fsm, act, bb):
    # 1. 驶向取球区
    act.send_navigate(bb.loading_pos_x, bb.loading_pos_y)
    await fsm.wait_event("NAV_DONE", timeout=5.0)

    # 2. 机械臂抓球并等待电控确认
    act.send_gripper_command(1)  # 1: 抓取
    await fsm.wait_event(
        lambda e: e.type == "GRIPPER_DONE" and e.data.get("command") == 1,
        timeout=2.0
    )

    # 3. 驶向发射区投掷
    act.send_navigate(bb.scoring_pos_x, bb.scoring_pos_y)
    await fsm.wait_event("NAV_DONE", timeout=6.0)
    
    act.send_shoot_command()
    await fsm.wait_event("SHOOT_DONE", timeout=1.5)
```

没有杂乱的嵌套回调，没有成堆的全局状态变量。整场比赛的执行逻辑一目了然，这才是适合竞赛高压环境的上位机代码形态。

---

# 小结

1. **ROS 2 的定位是进程间管道**：它负责跨进程、跨机器的数据搬运，以及与现成生态（如激光雷达、Nav2）互通。
2. **拒绝在 ROS 回调中阻塞**：单线程 `spin()` 下的 `time.sleep` 会直接卡死整个节点，而回调地狱会导致逻辑严重碎片化。
3. **双线程桥接是最佳实践**：ROS 2 主线程处理话题收发，独立后台线程运行 asyncio 事件循环，利用 `call_soon_threadsafe` 实现无锁、微秒级跨线程事件唤醒。
4. **赛场热重置至关重要**：通过 `reset_mission`，在无需重启节点和断开串口的前提下，0.05 秒完成全场状态归位与任务重拉。
5. **分层分文件保证战术安全**：将高频变更的决策逻辑（`my_decision.py`）与低频稳定的动作和驱动物理隔离，保证赛场调车时改战术不崩底座。

下一章，我们深入感知层——搞定轮式里程计、激光雷达与视觉流水线，看看上层决策需要的干净位姿数据到底是从哪里算出来的。

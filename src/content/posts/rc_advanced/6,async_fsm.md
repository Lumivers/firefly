---
title: "协程驱动的异步决策系统"
published: 2026-07-26
pinned: false
description: "从 1600 行 C++ 状态机到 350 行 Python 协程、阻塞代码的毁灭性后果、先挂号后发指令的时序防坑、超时黑匣子与战术解耦设计。"
tags: [asyncio, 协程, 状态机, 决策, python, 教程]
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 这一章讲的东西，是我重构决策代码的最核心产物。从早期的 1600 行 C++ 嵌套状态机，砍到 350 行纯粹的 Python async 协程；改全场比赛战术，从“翻半天多重 switch-case 还经常改错枚举”，变成了“改两行路线调用就能直接出发”。

# 为什么决策层坚决选 Python 而不是 C++？

在很多工科竞赛里，都有“全栈 C++ 才是正统”、“Python 慢得不能用在机器人上”的刻板印象。甚至 C++20 也引入了协程（`co_await`、`co_yield`），理论上也能写异步。

但我依然把整套决策调度系统用 Python `asyncio` 重构，原因非常现实：

1. **决策层根本不需要微秒级计算性能**  
   决策层干的事情是：“导航到取物区 $\to$ 抓取物块 $\to$ 导航到发射区 $\to$ 发射”。每个动作之间间隔几百毫秒到几秒，计算量无限趋近于零。真正吃性能的是底盘运动解算、激光雷达点云与视觉检测——那些跑在 C++ 或被底座封装好的独立节点里。决策层一整年消耗的 CPU 周期，可能还没控制层一秒钟多。用 C++ 写决策，就像开着重型推土机去楼下小卖部买瓶可乐。

2. **Python 的表达能力与可读性降维打击 C++**  
   C++20 的协程是出了名的难写难读。光是为了让一个函数能 `co_await`，你就要手动实现 `promise_type`、`coroutine_handle`、`initial_suspend`、`final_suspend` 等一大堆晦涩的模板样板代码。一旦发生生命周期悬挂指针，直接报段错误崩溃。  
   而 Python 的 `async/await` 是原生语言级支持，写起来和普通的同步线性代码毫无区别。

3. **比赛现场的“抗造能力”**  
   在 Robocon 备赛区，小组赛每一场之间往往只有 15~20 分钟的检录和休整时间。如果上一场对手采用了针对性的封堵战术，你必须在 5 分钟内修改取球路线与作业顺序。  
   用 Python 改战术，改两行代码按一下保存就能跑；如果是全套 C++，改完状态机还要面临重新编译、链接、打包的折磨，万一现场手抖写漏了个引用，半天都找不出编译报错。

> **架构选型铁律**：  
> 算力密集型（串口驱动、底盘运动学、图像预处理）用 C++；逻辑高频变更型（决策调度、全场战术）用 Python。两者通过 ROS 2 话题解耦，这才是现代机器人工程各取所长的形态。

---

# 阻塞式代码的毁灭性后果

先来看一段很多战队新手都写过的经典代码：

```python
# 典型车祸现场：阻塞式等待
def grab_block(block_id):
    send_arm_command(block_id)     # 1. 往下位机发动作指令
    while not arm_done_flag:       # 2. 阻塞死循环等电控回包
        time.sleep(0.1)            # 每 100ms 查一次
    send_next_action()             # 3. 机械臂到位了，继续下一步
```

这段代码从逻辑上看貌似无可挑剔：发指令 $\to$ 等完成 $\to$ 下一步。

但在实际机器人运行中，这个 `while + time.sleep` 是致命的毒药。因为在它 sleep 的几百毫秒到几秒内，**当前线程被彻底占死**：
- 底盘到点的信号到了？收不到，因为回调被排在后面；
- 操作手拍下急停按钮或裁判哨响要求复位？处理不了；
- 激光雷达和传感器数据？全堵在底层缓冲区里，内存急剧膨胀。

> 我见过最惨烈的一个事故：机械臂在赛场上机械卡壳，一直死循环。此时车子明明已经到了终点，但因为处理到达信号的回调被死循环挡住，小车就一直以为自己没到，在原地死等机械臂，直到 3 分钟比赛时间耗尽。

**阻塞式代码的根本死穴在于：它剥夺了程序同时响应意外事件的能力。**

---

# 协程的解法：发指令，挂起，等事件通知

协程的思路完全不同。它不是“发完指令死循环硬等”，而是：**“发完指令后立即挂起当前函数，把 CPU 和线程执行权交还给事件循环；等目标事件到达时，由事件循环自动唤醒恢复执行。”**

```python
async def grab_block(fsm, act, block_id):
    act.send_arm_command(block_id)             # 1. 发送硬件指令
    event = await fsm.wait_event("ARM_DONE")   # 2. 挂起！让出控制权
    # 当收到电控的 ARM_DONE 事件后，自动从这里满血复活往下跑
    act.send_next_action()
```

看清楚这一瞬间发生的本质改变：

```
【阻塞模式】：
  发指令 ──► time.sleep ──► time.sleep ──► 线程全卡死，急停/传感器/回调全报废

【协程模式】：
  发指令 ──► await 挂起 ──► 主循环自由调度急停、处理传感器、刷新里程计 ──► 事件到达唤醒
```

在协程挂起的这几秒钟里，系统的事件循环依然在以极高速度运转。如果此时收到了急停话题或者重置信号，系统可以瞬间响应处理。

---

# 核心等待机制：先挂号，后发指令

在设计事件驱动系统时，绝大多数初学者都会踩进一个极其隐蔽的**时序竞争漏洞（Race Condition）**。

### 致命的时序漏洞：“先发指令，后等待”

很多人直觉上会这么写原子动作：

```python
# 存在严重竞态隐患的代码
async def bad_action(fsm, act):
    act.send_hardware_command()           # ① 先把串口指令发出去
    # ── 就在这里！极微小的微秒级时间窗口 ──
    await fsm.wait_event("ACTION_DONE")   # ② 再挂起等待事件
```

在本地仿真、或者下位机回包较慢时，这段代码通常表现正常。

但在真实比赛现场，下位机如果是极速响应（例如电控在 50 微秒内直接通过串口回包），或者在进程内部通信时：
1. ① 发送硬件指令；
2. 下位机瞬间回包，ROS 2 回调线程立马收到并调用了 `post_event("ACTION_DONE")`；
3. 但此时 ② 的 `wait_event` **甚至还没来得及向状态机注册等待者（Waiter）**！
4. 状态机发现当前没有任何人在等这个事件，直接当成历史旧事件抛弃；
5. 紧接着，② 开始执行并向状态机挂号，然而那个确认信号已经在几微秒前溜走了；
6. **协程陷入永久等待，直到超时崩溃！**

这就是为什么很多队伍的代码在平时测试偶尔“偶发性发呆”，而且“加了个 print 打印之后 bug 就不见了”（因为 print 的耗时改变了竞态时序）。

### `robocon-fsm` 的解法：先挂号，后发指令

在我们的框架中，彻底杜绝了这种微秒级时序隐患。标准的等待模式必须是：**先在状态机把号挂上，再去触发物理动作**。

```python
# robocon-fsm 中的标准可靠模式
async def safe_action(fsm, act):
    # 1. 先挂号：在状态机内部预注册 Future，把陷阱先设好
    fut = fsm.create_waiter("ACTION_DONE")
    try:
        # 2. 后发指令：此时哪怕下位机在 1 微秒内回包，Future 也必定能捕获到
        act.send_hardware_command()
        # 3. 挂起等待刚才挂好号的 Future
        event = await fsm.wait_future("ACTION_DONE", fut, timeout=3.0)
        return event
    finally:
        # 确保异常时清理 waiter，绝不造成内存泄露
        fsm.cancel_waiter(fut)
```

框架提供的 `retry_until_ack` 底层全部严格基于“先挂号后发指令”原则实现。无论硬件通信有多快、无论多线程如何并发，确认信号绝不丢失。

---

# 高级调度原语与超时诊断黑匣子

在全场对抗赛中，比赛流程远比单纯的单步等待更复杂。`robocon-fsm` 提供了成套的高级异步原语：

### 1. 谓词匹配器（Predicate Matcher）

有时我们等待的不仅是一个事件名称，还需要校验其中的具体参数：

```python
# 过滤其他机构回包，只精确等待 command == 2 (机械臂抓取完成) 的事件
await fsm.wait_event(
    lambda e: e.type == "GRIPPER_STATUS" and e.data.get("command") == 2,
    timeout=2.0
)
```

### 2. 组合等待：`wait_all` 与 `wait_any`

赛场上为了争分夺秒，机器人常常需要**边走边做机构动作**：

```python
# 并行协同：底盘开往发射区的同时，发射机构提前预热并升降到位
# 两个动作同时进行，直到全部就绪才继续
await fsm.wait_all(
    act.navigate(bb.shoot_x, bb.shoot_y),
    fsm.wait_event("SHOOTER_READY"),
    timeout=8.0
)
```

也有“先到先处理”的竞争场景：

```python
# 边导航边检测防守障碍：
# 如果底盘先到点，正常执行；如果中途检测到对手恶意冲撞，立刻触发避障分支
winner_event = await fsm.wait_any("NAV_DONE", "OBSTACLE_BLOCKED", timeout=6.0)
if winner_event.type == "OBSTACLE_BLOCKED":
    act.get_logger().warn("行进路线被阻挡，切换备用绕行路线！")
    await fallback_route_mission(fsm, act, bb)
```

### 3. 超时诊断黑匣子

在调试赛车时，最让人抓狂的是控制台冷冰冰地抛出一句：
`asyncio.TimeoutError`

你根本不知道在这 3 秒钟里硬件到底发生了什么：是电控压根没回包？还是回了别的包？还是指令发错编号了？

在 `robocon-fsm` 中，`FSMTimeoutError` 会自动关联事件总线的历史审计追踪，直接打印**现场诊断黑匣子**：

```python
# 当超时发生时，控制台抛出的异常自带上下文：
# FSMTimeoutError: Timed out waiting for event 'GRIPPER_DONE' after 3.0s. Recent events on bus: ['NAV_DONE', 'DT35_ALIGNED', 'HEARTBEAT']
```

看到这行报错，你 1 秒钟就能破案：“底盘到点了，DT35 也校准了，心跳也是正常的，唯独没有 `GRIPPER_DONE`——机械臂电控没发完成确认帧或者微动开关没触发”。调试时间直接从半小时缩短到几秒钟。

---

# 从 1600 行 C++ 到 350 行 Python 的蜕变

对比一下重构前后的代码形态，就能直观感受这种架构带来的工程震撼。

### 曾经的 C++ 状态机形态（噩梦级可读性）

```cpp
// 曾经的 C++ 巨石代码：多重 switch-case 与散落的状态机
void DecisionNode::onTick() {
    switch (current_state_) {
        case State::NAV_TO_ZONE1:
            if (nav_reached_) {
                send_dt35_trigger();
                current_state_ = State::WAIT_DT35;
            }
            break;
        case State::WAIT_DT35:
            if (dt35_ready_) {
                send_arm_command(1);
                current_state_ = State::WAIT_ARM_GRAB;
            }
            break;
        case State::WAIT_ARM_GRAB:
            if (arm_done_) {
                send_chassis_rotate(180.0);
                current_state_ = State::WAIT_ROTATE;
            }
            break;
        // ... 下面还有 20 多个 case，状态切换散落在多个回调函数里
    }
}
```

改一个状态，你要在枚举定义头文件、主循环 switch-case、事件接收函数里改三处。稍微改错一个枚举值，整台小车直接死在场地上。

### 现在的 Python 协程形态（极简线性）

```python
# 当前的 Python 协程战术流程：一目了然的线性全场逻辑
async def zone1_mission(fsm, act, bb):
    # 1. 跑位与打点校正
    act.send_navigate(bb.zone1_x, bb.zone1_y)
    await fsm.wait_event("NAV_DONE", timeout=5.0)
    await act.dt35_align()

    # 2. 机械臂作业并转向
    await act.grab_ring()
    act.send_rotate(180.0)
    await fsm.wait_event("ROTATE_DONE", timeout=2.0)

    # 3. 投放与归位
    await act.release_ring()
```

没有枚举状态变量，没有多重 switch-case，没有跨文件状态跳转。**每一行 `await` 就是一次状态转移**。代码的阅读顺序，就是小车在赛场上的行动路线。

---

# 原子动作与战术逻辑解耦

重构带来的另一个巨大红利，是实现了**动作与战术的物理分工**：

- **原子动作（`my_actions.py`）**：
  封装底层的硬件时序、参数拼包、等待 ACK 与重试机制。例如 `grab_ring()` 内部包含“张开爪子 $\to$ 下降机械臂 $\to$ 闭合爪子 $\to$ 确认到位”，这一套动作由机械电控时序决定，一旦调稳后基本不动。
- **全场战术（`my_decision.py`）**：
  只负责按战术编排原子动作的调用顺序。比赛前一晚要改策略（例如“先去 2 号区防守，再去 1 号区拿球”），你只需要在 `my_decision.py` 里颠倒两行函数的调用顺序，**不需要改动任何底盘控制或通信协议的代码**。

---

# 小结

1. **决策层选型首选 Python 协程**：逻辑调度不需要微秒级性能，需要的是极简的代码表达能力和赛场现场 5 分钟改完战术的极高容错度。
2. **坚决不用 `while + sleep`**：阻塞等待会彻底杀死节点响应意外事件的能力；利用 `await` 挂起让出控制权，保持事件循环畅通。
3. **谨防时序竞态**：异步等待物理硬件响应时，必须坚持**“先挂号，后发指令”**（`create_waiter` $\to$ 发送 $\to$ `wait_future`），杜绝微秒级回包丢失。
4. **善用高级原语与诊断工具**：利用 `wait_all` 实现边跑边做动作，利用 `wait_any` 实现动态避障切线；遇到超时充分利用黑匣子日志秒级定位故障。
5. **解耦原子动作与战术流程**：硬件时序锁死在 `my_actions.py`，战术编排自由释放给 `my_decision.py`，改路线永不影响底层通信。

下一章，我们将下沉到底盘运动学与路径跟踪——看看小车是如何依靠 Pure Pursuit 算法，平滑、高速地沿着预定轨迹疾驰的。

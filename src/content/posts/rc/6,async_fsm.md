---
title: "协程驱动的异步决策系统"
published: 2026-07-26
pinned: false
description: "从阻塞式死循环到 async/await 线性代码，用 Python 协程重构 RC 决策状态机。"
tags: [asyncio, 协程, 状态机, 决策, python, 教程]
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 这一章讲的东西，是我 26 赛季重构决策代码的核心。1600 行 C++ 嵌套状态机砍到 350 行 Python async 协程，改流程从"翻半天文件还经常改错"变成"改一个坐标就行了"。

# 为什么用 Python 而不是 C++？

C++20 也有协程了，`co_await`、`co_yield` 都有，理论上能写异步决策。但我还是选了 Python，原因很实际：

**决策逻辑不需要性能。** 决策层干的事是"走到 1 号点 → 抓块 → 走到 2 号点"，每个动作之间间隔几百毫秒到几秒，计算量几乎为零。不像 Pure Pursuit 要 50Hz 跑浮点运算，决策层一年的运算量可能还没有控制层一秒多。用 C++ 跑决策就像开推土机去买菜。

**Python 的可读性和维护性碾压 C++ 协程。** C++20 协程的语法是出了名的难写难读——`promise_type`、`coroutine_handle`、`initial_suspend`、`final_suspend`，光配置一个协程就要写一堆 boilerplate。Python 的 `async/await` 是语言原生语法，写起来跟普通函数几乎一样。比赛前一天要改流程，Python 改两行就能跑，C++ 可能要调半小时编译。

**C++ 留给串口驱动和运动控制。** 真正吃性能的地方（串口收发、Pure Pursuit、图像处理）用 C++，决策用 Python，各取所长。中间靠 ROS2 通信串起来。

> 不要为了"统一技术栈"而全部用 C++，也不要因为"Python 慢"就不敢用。决策层不需要快，需要的是能改、能读懂、比赛前一天还能动。

# 阻塞代码的毁灭性后果

先看一段很多 RC 队伍都写过的代码：

```cpp
void grab_block(int block_id) {
    send_command(block_id);           // 发指令
    while (!arm_done) {               // 死循环等
        sleep(100);                   // 每 100ms 看一眼
    }
    // 机械臂到位了，继续
}
```

看起来没问题对吧？发指令，等完成，继续。逻辑清晰。

但这个 `while + sleep` 会把整个线程卡住。在它 sleep 的这 100ms 里，ROS2 的回调全在排队——导航到了的到达信号、按钮按下的重试信号、传感器的新数据，全都处理不了。决策线程在睡觉，回调在等，两边互相卡。

> 我见过一个队，机械臂卡住了，`while (!arm_done)` 一直转，导航到了的回调排在后面收不到，车到了目标点不知道自己到了，继续在那原地等机械臂。

问题的根源是：**阻塞式代码一次只能干一件事。** 等机械臂的时候不能等急停，等导航的时候不能等按钮。你要是想同时等两件事，就得开多线程，然后线程之间共享状态、加锁、处理竞态。1600行的那坨就是这么来的。

---

# 异步：发指令，挂起，等回调

协程的思路完全不同。不是"发完指令然后死循环等"，而是"发完指令，挂起，让出控制权，等事件来了再唤醒"：

```python
async def grab_block(fsm, block_id):
    send_command(block_id)                    # 发指令
    event = await fsm.wait_event("ARM_DONE")  # 挂起，让出控制权
    # 事件来了，自动恢复执行
```

`await` 的时候协程暂停了，但事件循环还在跑——急停回调、按钮回调、传感器回调全都能正常处理。等 `ARM_DONE` 事件到了，协程自动从 `await` 那一行恢复往下执行。

对比一下：

```
阻塞写法：
  发指令 → sleep → sleep → sleep → sleep → 收到完成 → 继续
  （中间什么都干不了）

协程写法：
  发指令 → await（挂起）→ 事件循环继续跑其他回调 → 收到事件 → 恢复
  （挂起期间急停、按钮、传感器回调全不受影响）
```

这就是为什么 async/await 是硬件控制的"唯一解"——它解决了"等一件事的时候不能处理其他事"这个根本问题，而且不用开多线程。

---

# wait_event 机制

核心就一个东西：**事件队列 + Future 挂起**。

```python
class FSM:
    def __init__(self):
        self._waiters: list[tuple[str, asyncio.Future]] = []

    def post_event(self, event: Event):
        """从任意线程投递事件，唤醒所有匹配的 awaiter."""
        for event_type, future in self._waiters:
            if event_type == event.type and not future.done():
                future.set_result(event)
        self._waiters = [
            (et, f) for et, f in self._waiters if f.done()
        ]

    async def wait_event(self, event_type: str, timeout: float = None) -> Event:
        """等待指定类型的事件，挂起当前协程."""
        future = self._loop.create_future()
        self._waiters.append((event_type, future))

        try:
            if timeout:
                return await asyncio.wait_for(future, timeout)
            return await future
        except asyncio.TimeoutError:
            return Event(event_type, success=False)
```

流程是这样的：

1. 协程调 `wait_event("ARM_DONE")`，创建一个 Future，放进 waiters 列表，然后挂起
2. ROS2 回调线程收到 `/juece_ack`，调 `post_event(Event("ARM_DONE"))`
3. `post_event` 在 waiters 里找到匹配的 Future，`set_result` 唤醒它
4. 协程从 `await` 恢复，拿到事件，继续往下跑

`post_event` 用的是 `call_soon_threadsafe`，从 ROS2 回调线程安全地投递到 asyncio 事件循环：

```python
def post_event(self, event: Event):
    if self._loop.is_running():
        self._loop.call_soon_threadsafe(self._dispatch_event, event)
    else:
        self._loop.call_soon(self._dispatch_event, event)
```

> 这个机制看起来简单，但它解决了一个很关键的问题：**ROS2 回调线程和 asyncio 决策线程之间的桥梁。** ROS2 回调是同步的，asyncio 是异步的，`call_soon_threadsafe` 是唯一安全的跨线程唤醒方式。

---

# 从 1600 行到 350 行

我 26 赛季之前的 C++ 决策代码是这样的：

```cpp
// 简化版，实际更惨
void DecisionNode::onTick() {
    switch (state_) {
        case ZONE1_NAV:
            if (nav_done_) {
                state_ = ZONE1_DT35;
                send_dt35_command();
            }
            break;
        case ZONE1_DT35:
            if (dt35_done_) {
                state_ = ZONE1_GRAB;
                send_grab_command(1);
            }
            break;
        case ZONE1_GRAB:
            if (arm_done_) {
                state_ = ZONE1_ROTATE;
                send_rotate_command(M_PI);
            }
            break;
        // ... 还有十几个 state
    }
}
```

每个状态一个 case，每个 case 里还要判断子状态、处理超时、处理异常。Zone1 有 8 个状态，Zone2 有 11 个状态，加上子状态总共 20 多个。状态之间的切换散落在 `onTick`、`handleSubEvent`、`enterSub` 三个函数里，改一个流程要在三个地方同步修改。

Python 协程版长这样：

```python
async def zone1(fsm, act, cfg, state):
    for pt in cfg.zone1_route:
        await fsm.nav_to(pt.x, pt.y)          # 走到目标点
        await fsm.dt35_correct(...)             # DT35 微调
        await fsm.spearhead_and_wait(1)         # 抓矛头
        await fsm.rotate_to(0.0, 0.7, π)       # 转 180°
        await fsm.spearhead_and_wait(2)         # 对接
        await fsm.spearhead_and_wait(4)         # 完成
        await fsm.wait(3.0)                     # 等 3 秒
```

没有 switch-case，没有状态编号，没有散落多处的切换逻辑。`await` 就是状态切换——每一行 `await` 就是一次"发指令 → 等完成 → 继续"。

> 1600 行里大概有 800 行是在管理状态切换本身（进入状态、退出状态、子状态、超时处理），真正干活的逻辑也就 300 行。协程把那 800 行管理代码全干掉了，剩下的就是业务逻辑本身。

---

# 原子动作与业务逻辑分离

这是重构过程中最重要的一个设计决策。

**原子动作**是硬件层面的能力，封装了时序和确认逻辑，改不得：

```python
async def grab(fsm, act, block, need_stand=True, retract=False):
    """抓块流程：发指令 → 等机械臂到位 → 等吸盘确认."""
    if retract:
        act.publish_cmd_with_area(block=0, stand=1)
        await fsm.wait_event("ARM_DONE")

    act.publish_cmd_with_area(block=block, stand=1 if need_stand else 0)
    await fsm.wait(5.0 if block == 2 else 3.0)

    act.waiting_xipan = True
    act.publish_cmd_with_area(block=block, run=1)
    await fsm.wait_event("XIPAN_GRABBED")

    act.publish_cmd_with_area(block=block, run=0)
```

这里面的时序（先发 block 再发 run、等几秒再查吸盘、吸到了再清 run）是电控的硬件时序决定的，你改不了，也不该改。

**业务决策**是路线和顺序，天天变：

```python
# 比赛前一天要改流程，你就改这里
cfg.zone1_route = [4, 5]    # → 改成 [5, 4]
cfg.zone2_tasks = [...]      # → 重新排任务顺序
```

```python
async def zone2(fsm, act, cfg, state):
    await grab(fsm, act, block=2, need_stand=True)     # 先抓 2 号
    await grab(fsm, act, block=1, need_stand=True)     # 再抓 1 号
    await do_stair(fsm, act, 1)                         # 上台阶
```

grab 和 do_stair 是原子动作，zone2 里的调用顺序是业务决策。改顺序不用动 grab 的实现，改 grab 的实现不影响业务逻辑。

> 26 赛季改过三次流程，每次就是改 `zone2` 函数里的几行调用顺序。如果还是 C++ 那套 1600 行的状态机，改一次至少半天，还得祈祷没改错状态编号。

---

# 超时、重试与急停

## 超时

硬件不是每次都靠谱。机械臂可能卡住，导航可能到不了，每个 `wait_event` 都要带超时：

```python
result = await fsm.wait_event("ARM_DONE", timeout=5.0)
if not result.success:
    log.warning("ARM_DONE 超时，跳过")
```

超时了就返回一个 `success=False` 的事件，协程继续往下跑，不会卡死。

我的代码里还有一个 `force_skip_upper()` 的机制——超时后不光跳过等待，还要抑制后续的 `up_free=1` 信号，防止下位机恢复后又触发一轮等待：

```python
def force_skip_upper(self):
    self.suppress_up_busy = True    # 后续 up_free=1 全部忽略
    self.up_free = True             # 立即标记为空闲
```

## 重试

有些操作值得重试，比如矛头抓取：

```python
result = await fsm.spearhead_and_wait(1, up_timeout=5.0)
if not result.success:
    log.warning("矛头抓取失败，重试一次")
    result = await fsm.spearhead_and_wait(1, up_timeout=5.0)
    if not result.success:
        log.warning("重试也失败了，继续往下走")
```

重试次数不能太多——赛场上时间是有限的，卡在一个动作上重试 5 次，后面的任务全来不及。

## 急停

急停不是软件管的事。我们的车用遥控器控制，有问题了直接按遥控器，电控那边收到信号直接断电停车，不经过上位机。

软件层面要做的是：车已经停了，决策协程还在 `await` 等事件呢，别让它卡在那。实际操作就是 kill 掉进程重新跑。不需要在每个 `await` 里检查急停标志——硬件都停了，软件清理不清理无所谓，重来就行。

> 急停要的是快，遥控器一按硬件就停了，比任何软件方案都可靠。别在软件里搞急停逻辑，那是电控的事。

---

# 并行等待

有时候需要同时等两件事。比如"一边走导航一边等机械臂准备好"：

```python
await asyncio.gather(
    fsm.nav_to(1.0, 2.0),
    fsm.wait_event("ARM_READY"),
)
```

`asyncio.gather` 同时挂起两个协程，任意一个先完成都不影响另一个继续等。两个都完成了才往下走。

也有"等任意一个先到"的场景：

```python
event = await fsm.wait_event_any("NAV_DONE", "EMERGENCY_STOP")
if event.type == "EMERGENCY_STOP":
    return  # 急停了，不继续
```

---

# 小结

协程决策的本质就一句话：**用 `await` 替代 `while + sleep`，用事件替代状态变量。**

阻塞式代码把"等硬件"和"处理其他事件"耦合在一起，协程把它们彻底分开——挂起等硬件的时候，事件循环该处理急停处理急停，该处理按钮处理按钮。

1600 行到 350 行不是因为 Python 比 C++ 短，而是因为协程干掉了状态管理本身。剩下的 350 行全是业务逻辑，改流程改的就是这 350 行里的几行调用顺序。

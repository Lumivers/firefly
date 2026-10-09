---
title: "轻量消息总线与三层架构"
published: 2026-07-26
pinned: false
description: "ROS2 pub/sub 上手、RC 赛场瓶颈、自研消息总线的取舍、三层解耦架构设计。"
tags: [ros2, pub/sub, 消息总线, 架构, asyncio, 教程]
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 串口协议搞定了，硬件接口也隔离好了，但上位机内部各个模块之间怎么传数据？这一章聊聊消息总线。

# 模块之间为什么要通信？

上位机不是一个 main 搞定所有事。串口驱动要收发硬件数据，决策状态机要发指令等反馈，传感器处理要跑雷达和视觉——这些东西同时在跑，还得互相传数据。串口驱动收到轮速得给决策用，决策发出速度指令得给串口驱动发出去。

最粗暴的做法是直接函数调用，但模块跑在不同线程甚至不同进程里，直接调不是锁死就是压根调不到。所以得有个中间人帮忙转发，这东西就叫消息总线。

---

# ROS2 Pub/Sub

2026 年做 RC 上位机的人大概率绕不开 ROS2。它继承了 ROS 1 十几年的生态，DDS 通信、节点管理、参数系统一应俱全，行业里的 SLAM、导航、视觉方案几乎都挂在上面。可以说 ROS2 就是机器人软件的事实标准。

但 RC 赛场不是工厂车间。一辆竞速赛车的上位机可能只需要串口驱动、一个决策状态机、一套 Pure Pursuit——总共三四个节点，跑在一台 Jetson 上，通信频率不过 50Hz。为这几个节点装一整套 ROS2 + DDS，就像为了喝杯水去建自来水厂。能喝到水吗？能。值不值是另一回事。

先不管值不值，ROS2 的 pub/sub 得会用，因为很多现成的东西（串口驱动、雷达驱动、定位算法）都挂在 ROS2 上。

## 跑通一个最小示例

ROS2 的核心模型就一句话：发布者往 Topic 扔消息，订阅者从 Topic 捡消息，两边互不认识。

**发布者：**

```python
import rclpy
from rclpy.node import Node
from std_msgs.msg import String

class Talker(Node):
    def __init__(self):
        super().__init__('talker')
        self.pub = self.create_publisher(String, '/chatter', 10)
        self.timer = self.create_timer(1.0, self.tick)

    def tick(self):
        msg = String()
        msg.data = 'hello'
        self.pub.publish(msg)

rclpy.init()
rclpy.spin(Talker())
```

**订阅者：**

```python
import rclpy
from rclpy.node import Node
from std_msgs.msg import String

class Listener(Node):
    def __init__(self):
        super().__init__('listener')
        self.create_subscription(String, '/chatter', self.on_msg, 10)

    def on_msg(self, msg):
        self.get_logger().info(f'Received: {msg.data}')

rclpy.init()
rclpy.spin(Listener())
```

两个终端各跑一个，能看到消息收发就说明跑通了。

## 自定义消息

`String`、`Twist` 这些标准消息不够用的时候要自定义。在 ROS2 包里建一个 `msg/Command.msg`：

```
float32 x
float32 y
float32 yaw
int32 stair
int32 block
int32 spearhead
int32 area
```

CMakeLists.txt 加上消息生成的配置，编译一下就能用了。具体怎么配网上到处都是，不展开了。

## QoS：传感器和指令不能一视同仁

ROS2 的 Topic 有 QoS 策略，控制消息的可靠性。传感器数据用 `BEST_EFFORT`——丢了下一帧还有，要的是快；控制指令用 `RELIABLE`——丢了车就飞，要的是稳。

> 我 26 赛季的分法：轮速、雷达、里程计全 BEST_EFFORT，/command 和 /decision 用 RELIABLE。传感器丢一帧还行，指令丢了车动都不动。

## 我项目里的实际架构

我的系统是 C++ 串口驱动 + Python 决策，两个独立进程，靠 ROS2 topic 通信：

```
┌─────────────────┐     /command      ┌──────────────────┐
│  C++ 串口驱动    │ ←───────────────  │  Python 决策节点   │
│                 │  /decision       │  async/await 决策 │
│                 │ ─────────────→    │                  │
└─────────────────┘                   └──────────────────┘
```

C++ 端串口收到下位机的反馈帧，解析完发到 `/decision`；Python 端订阅，收到后唤醒对应的协程。反过来 Python 决策发出的速度指令发到 `/command`，C++ 端订阅后通过串口发给电控。

```python
# 订阅 /decision，收到后触发事件唤醒协程
self.create_subscription(Ack, '/decision', self.act.on_upper_ack, qos)

def on_upper_ack(self, msg):
    if msg.up_free == 2:
        self.post_event(Event("ARM_DONE", success=True))
```

ROS2 本身其实就是个传话的不是吗？

---

# ROS2 在 RC 赛场上的问题

用归用，不满意的地方也得说。

**启动慢。** ROS2 底层是 DDS，启动时要节点发现、Topic 匹配、QoS 协商。光 `rclpy.init()` 这一行就要几百毫秒到几秒。赛场上按完启动按钮车 2 秒后才动，这 2 秒可能就是 DDS 在握手。

**进程内通信也要序列化。** 不管发布者和订阅者是不是在同一个进程里，消息都要走一遍序列化 → 传输 → 反序列化。一个 `{x: 1.0, y: 2.0}` 变成字节再变回来，在 50Hz 控制频率下这个开销不是理论上的，是能感知到的。

**spin() 单线程，回调互相卡。** `rclpy.spin()` 默认单线程跑所有回调。视觉处理耗时 200ms 的话，这 200ms 内急停回调也收不到。我后来把决策逻辑放到单独的 asyncio 线程里才解决，但这本身就说明 ROS2 默认模型不适合实时决策——你得绕过它的限制才能用好。

**装起来重。** 好几个 G，编译自定义消息要配 CMakeLists.txt、package.xml、setup.py。RC 赛车就那么几个 Topic，杀鸡用牛刀。

## 什么时候还是得用 ROS2？

双进程架构（C++ 驱动 + Python 决策）或者多机器架构（雷达在 Jetson，决策在 x86），ROS2 做桥接是目前最省事的。进程间通信确实需要一个管道，ROS2 帮你把序列化、断线重连、跨机器这些都封装好了，自己搞 socket 通信等于重新发明轮子。

全 Python 单进程的话就完全没必要用 ROS2 了，下面讲的 EventBus 够用。

---

# 自研 EventBus

很多人（包括我之前）都想：ROS2 太重了，我自己写个 pub/sub 不就行了？

核心逻辑确实不复杂。C++ 版用模板和 `std::any` 实现类型擦除，让一个 EventBus 能传任意类型的数据，不用像 ROS2 那样提前定义 .msg 文件：

```cpp
class EventBus {
    // type_index → [回调列表]，用类型索引区分不同消息
    std::unordered_map<std::type_index,
        std::vector<std::function<void(const std::any&)>>> subs_;
    std::mutex mtx_;

public:
    template<typename T>
    void subscribe(const std::string& topic, std::function<void(const T&)> cb) {
        std::lock_guard<std::mutex> lock(mtx_);
        subs_[std::type_index(typeid(T))].push_back(
            [cb](const std::any& data) { cb(std::any_cast<T>(data)); });
    }

    template<typename T>
    void publish(const std::string& topic, const T& data) {
        std::lock_guard<std::mutex> lock(mtx_);
        for (auto& cb : subs_[std::type_index(typeid(T))])
            cb(data);
    }
};
```

`std::any` 能装任意类型的值，`std::type_index` 给每个类型一个唯一的 key，这样同一个 EventBus 实例既能传 `WheelSpeed` 又能传 `Command`，编译期就做类型检查，传错类型直接抛异常。

用起来就两行：

```cpp
EventBus bus;
bus.subscribe<WheelSpeed>("/wheel_speed", [](const auto& msg) {
    std::cout << msg.left << ", " << msg.right << std::endl;
});
bus.publish("/wheel_speed", WheelSpeed{1.0, 1.2});
```

Python 版更简单，一个字典加一个回调列表：

```python
class EventBus:
    def __init__(self):
        self._subs = {}

    def subscribe(self, topic, callback):
        self._subs.setdefault(topic, []).append(callback)

    def publish(self, topic, data=None):
        for cb in self._subs.get(topic, []):
            cb(data)
```

但实际用起来有几个坑：

**C++ 和 Python 不共享内存。** 我的系统是两个进程，EventBus 在一个进程里创建，另一个进程根本访问不到。进程间通信还是得靠 ROS2、ZeroMQ 或者自己写 socket。ROS2 虽然重，但它帮你把这些都封装好了。

**多线程要加锁。** 串口驱动在自己的线程里 publish，决策在 asyncio 线程里 subscribe，不加锁的话回调列表会被踩坏。上面 C++ 版用了 `std::mutex`，但锁的粒度要控制好——锁太大了 publish 和 subscribe 互相等，锁太小了保护不住。

**背压策略要自己想。** 发布者 100Hz 往 Topic 扔数据，订阅者处理一帧要 30ms，队列满了怎么办？ROS2 的 QoS 帮你处理了这些，自己写的话每种策略都要自己实现。

---

# 三层架构

不管用什么通信方式，上位机的分层是一样的。26 赛季踩了不少坑才搞清楚这件事。

```
决策调度层    状态机 / 任务规划 / 路线选择
  ↑ 只管"做什么"
控制跟踪层    Pure Pursuit / 运动学解算 / PID
  ↑ 只管"怎么走"
感知驱动层    串口驱动 / 雷达 / 视觉 / DT35
  只管"提供干净数据"
```

就和我们常说的“高内聚，低耦合”一样，各层之间通过消息总线传数据，不直接调用。感知层不知道决策层在干什么，决策层不知道串口协议长什么样。

为什么要分这么清楚？因为**需求变的频率不一样**。感知层的协议定了基本不动，除非换硬件；控制层调完参数基本不动，除非换底盘；但决策层——比赛前一天要改流程的话，你就得改。如果决策代码里混着串口收发逻辑，改流程的时候一不小心把协议改了，车直接寄。

拿"走到 1 号点然后抓块"这个流程举个例：

```python
async def zone1(fsm, act, cfg, state):
    await fsm.nav_to(1.0, 2.0)        # 走
    await fsm.spearhead_and_wait(1)    # 抓
    await fsm.rotate_to(0.0, 0.7, π)  # 转
```

决策层不知道 Pure Pursuit 怎么算的，不知道串口发了什么字节，它只管 `nav_to` → 等事件 → 下一步。底下发生了什么是感知层和控制层的事。

---

# 小结

ROS2 做 pub/sub 能用，但启动慢、序列化开销、spin 单线程这些问题是实际存在的。自研 EventBus 理论上简单，实际有跨进程、线程安全、背压等坑，全 Python 单进程可以搞，双进程老实用 ROS2 或 ZeroMQ。

三层架构的核心价值不是"代码好看"，是把变化频率不同的东西隔开——改决策不动控制，改控制不动感知。比赛前一天改方案的时候你会感谢这个分层。

下一章讲感知层——定位和视觉，搞清楚数据从哪来、什么质量。

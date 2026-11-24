---
title: "现场调参与参数热加载"
published: 2026-07-26
pinned: false
description: "参数抽离原则、结合 robocon-fsm 的 Blackboard 参数流转、红蓝方镜像切换、参数热更新与免杀进程一键重置。"
tags: [参数, yaml, ros2, blackboard, robocon-fsm, 调参, 教程, 赛场经验]
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 在备赛和赛场调试中，代码里最忌讳的就是到处写死 magic number——工位坐标写死 `(2.0, 1.0)`、Pure Pursuit 前瞻距离写死 `0.8`、气缸盲等时间写死 `0.5`。比赛现场但凡需要微调一个数字，如果每次都要去改代码、重新编译或者打包，几轮下来赛前宝贵的联调时间全被耗光了。这一章我们结合 `robocon-fsm` 框架，讲讲怎么规范地管理参数和实现热更新。

# 为什么参数管理直接决定调试效率？

在赛场检录和试车区，上位机面临的现场反馈通常是这样的：
* “今天比赛馆地毯有点滑，小车过弯有点甩，速度降一点试试。”
* “红方和蓝方的料台镜像对称，现在抽签抽到了蓝方，快切一下路线。”
* “今天气泵气压不够足，机械爪开合慢了 0.1 秒，动作得稍微多等一会儿。”

每一句话本质上都在改动一两个具体的数值。

如果这些参数硬编码在 Python 或 C++ 逻辑深处，你的流程就是：翻代码找变量 $\to$ 改代码 $\to$ 重启甚至重新编译 $\to$ 重新部署。一轮折腾五分钟，一天宝贵的一两次上场试车机会就被浪费了。

如果所有会变的数值都集中在配置文件里，你的流程就是：改一行 YAML $\to$ 秒级生效。

---

# `robocon-fsm` 的参数流转链路

在 `robocon-fsm` 的标准开发模板（`templates/standard_robot/`）中，参数的流转是一条非常干净的链路：

```
config/params.yaml ──► main_node.py 加载 ──► 注入 Blackboard 黑板 ──► my_decision.py 全局读取
```

### 1. 参数文件配置（`config/params.yaml`）

把赛场上可能会调整的数值全抽到这里：

```yaml
# config/params.yaml
decision_node:
  ros__parameters:
    # 比赛阵营 (抽签决定)
    is_red_side: true
    max_match_time_s: 180.0

    # 关键工位坐标
    start_pos_x: 0.5
    start_pos_y: 0.5
    loading_pos_x: 2.0
    loading_pos_y: 1.0
    scoring_pos_x: 4.0
    scoring_pos_y: 2.5

    # 机构延时参数 (对应第六章的盲等妥协)
    gripper_blind_wait_sec: 0.5

    # 底盘控制参数
    max_linear_vel: 1.5
    lookahead_min: 0.35
```

### 2. 节点统一加载并存入黑板（`main_node.py`）

节点启动时，声明并读取参数，直接塞进 `self.blackboard`：

```python
# main_node.py
class MyRobotDecisionNode(Ros2DecisionNodeBase):
    def __init__(self):
        super().__init__(node_name="my_decision_node")
        self.actions = MyRobotActions(node=self)
        self.set_action_dispatcher(self.actions)

        # 统一加载参数
        self._load_parameters()

    def _load_parameters(self):
        # 声明并读取 ROS2 参数
        self.declare_parameter("is_red_side", True)
        self.declare_parameter("loading_pos_x", 2.0)
        self.declare_parameter("loading_pos_y", 1.0)
        self.declare_parameter("gripper_blind_wait_sec", 0.5)

        # 存入 Blackboard 黑板中，跨模块共享
        self.blackboard.is_red_side = self.get_parameter("is_red_side").value
        self.blackboard.loading_pos_x = self.get_parameter("loading_pos_x").value
        self.blackboard.loading_pos_y = self.get_parameter("loading_pos_y").value
        self.blackboard.gripper_wait = self.get_parameter("gripper_blind_wait_sec").value
```

### 3. 业务决策层直接从黑板读取（`my_decision.py`）

在战术流程中，函数不需要层层传参，直接读黑板：

```python
# my_decision.py
async def run_mission(fsm, act, bb):
    log.info("当前阵营: %s", "红方" if bb.is_red_side else "蓝方")

    # 直接从黑板拿工位坐标
    await act.go_to(bb.loading_pos_x, bb.loading_pos_y)

    # 抓取物块，使用黑板里的延时参数
    act.send_gripper_close()
    await fsm.wait(bb.gripper_wait)
```

这样业务逻辑代码干干净净，没有哪怕一个硬编码的数字。

---

# 赛场最高频的两个改动场景

### 1. 红蓝方场地镜像一键切换

大多数比赛中，红方和蓝方的赛道布局是完全镜像的（通常关于场地中心对称或沿 Y 轴对称）。

很多新手会为红方写一份 `decision_red.py`，再为蓝方复制一份 `decision_blue.py`。这是典型的灾难写法——比赛前夜临时改了一下抓取时序，改了红方忘了改蓝方，直接导致第二天的关键局翻车。

在黑板机制下，全场逻辑只有一份：

```python
def get_actual_pos(bb, x, y):
    """根据红蓝方自动做镜像变换"""
    if bb.is_red_side:
        return x, y
    else:
        # 假设场地宽度为 12m，Y 轴对称镜像
        return x, (12.0 - y)
```

抽签结束进场前，只需要在终端或者 launch 参数里指定 `is_red_side: false`，全场战术自动镜像，零风险。

### 2. 气压不足时的动作盲等补偿

回顾第六章讲的“电控没写回调、气缸没有到位传感器”的盲等情况。

在学校实验室调试时，气泵打得满，气缸开合只要 0.4 秒；到了赛场连续打了两场，储气罐气压略有下降，气缸开合变慢到了 0.6 秒。如果时间写死 0.5 秒，爪子还没夹紧底盘就启动开跑，球当场掉落。

把盲等时间抽到参数里，上位机只需在 `params.yaml` 里把 `gripper_blind_wait_sec` 改成 `0.6`，立刻就能稳住动作，完全不需要改动任何逻辑。

---

# 运行时改参：免重启参数热更新

在 ROS 2 系统中，如果不想每次重启节点，可以利用参数服务进行动态修改。

一行命令直接修改正在运行的节点参数：

```bash
ros2 param set /my_decision_node gripper_blind_wait_sec 0.7
```

在节点中通过注册回调函数，实时将新参数同步到黑板：

```python
from rcl_interfaces.msg import SetParametersResult

class MyRobotDecisionNode(Ros2DecisionNodeBase):
    def __init__(self):
        super().__init__("my_decision_node")
        # ...
        self.add_on_set_parameters_callback(self.on_param_change)

    def on_param_change(self, params):
        for param in params:
            if param.name == "gripper_blind_wait_sec":
                self.blackboard.gripper_wait = param.value
                self.get_logger().info(f"黑板参数更新: gripper_wait = {param.value}")
        return SetParametersResult(successful=True)
```

---

# 赛场免杀进程热重置（`reset_mission`）

在赛场测试或者正式比赛中，如果出现意外（比如车被卡住、裁判叫暂停、或者操作手拍下急停按钮），很多新手会习惯性地在控制台狂按 `Ctrl+C` 强杀节点。

但强杀进程有几个很大的隐患：
* 串口底座节点如果在强杀瞬间被中断，Linux 串口占用（`/dev/ttyUSB0`）可能没有正确释放，再次启动报 `Device busy`；
* 重启 launch 需要重新加载 Python 解释器和依赖，耗时 5~10 秒，现场读秒阶段根本等不起。

在 `robocon-fsm` 的标准模板中，提供了一个极其实用的功能：**赛场免杀进程热重置**。

在 `main_node.py` 中默认订阅了重置话题：

```python
# 赛场一键重试复位话题 (操作手按键、遥控器按键或外部触发)
self.create_subscription(
    Bool,
    "/competition/reset",
    lambda msg: self.reset_mission() if msg.data else None,
    10
)
```

当操作手拍下急停后，只需要发布一个 `Bool` 信号（或者遥控器拨杆触发）：
1. 框架会自动终止当前正在执行的协程任务；
2. 给底盘下发零速刹车，切断电机运动；
3. 清空状态机的事件队列与黑板临时状态；
4. 重新启动 `run_mission()` 从头开始跑。

整个过程不需要杀掉后台进程，不需要重新连串口，1 秒钟完成热重启，在分秒必争的赛场上非常抗造。

---

# 哪些参数该抽，哪些不该抽？

判断一个数值要不要进 YAML，标准只有一个：**它是否与现场环境或物理硬件的物理特性相关。**

| 必须抽进 YAML 的参数 | 留在代码里的参数 |
|---|---|
| 工位目标坐标 $(x, y)$ | 串口包头 `0xAA 0x55` |
| 终点减速前瞻距离 $L_d$、速度上限 $v_{\max}$ | 状态机事件名称定义 |
| 气缸/推杆的盲等时间 | 坐标转换矩阵的数学公式 |
| 红蓝方阵营标志 | 校验和算法逻辑 |
| 动作超时等待阈值（如等待抓取的最长限时） | 内部循环逻辑控制变量 |

---

# 小结

1. **拒绝 Magic Number**：物理坐标、速度限制、盲等时间和超时阈值坚决抽到 `config/params.yaml` 里。
2. **规范参数流转**：通过 ROS 2 加载参数统一注入 `Blackboard`，让业务逻辑代码纯粹表达战术，消除硬编码。
3. **红蓝方一套代码**：利用黑板标志做坐标镜像，全场只维护一套业务逻辑，避免双份代码修改脱节。
4. **善用免杀进程热重置**：利用 `node.reset_mission()` 快速清空状态重跑，避免在赛场上频繁强杀进程导致串口锁死。

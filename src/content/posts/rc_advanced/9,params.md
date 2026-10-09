---
title: "现场调参与参数热加载"
published: 2026-07-26
pinned: false
description: "YAML 配置管理、ROS2 Parameter、热重载机制，让比赛现场改参数不用重新编译。"
tags: [参数, yaml, ros2, 调参, 教程]
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 前面几章的代码里到处是 magic number——Pure Pursuit 的前瞻距离写死 0.8，速度上限写死 1.5，PID 增益写死 1.2。这些数字在赛场上是要反复调的，如果每次改一个数字都要改代码、重新编译、重新部署，那赛前调试的时间全浪费在等编译上了。

# 为什么需要参数管理

赛场上调参是这样的：

"速度太快了过弯打滑，降到 1.2 试试。"
"前瞻距离太小了走蛇形，改大一点。"
"PID 的 D 项太大了有高频抖动，去掉。"

每一句都是在改一个数字。如果这个数字写死在代码里，流程就是：改代码 → 编译 → 部署 → 跑一遍 → 不行再改 → 编译 → 部署……一轮下来 5 分钟没了，一天调不了几轮。

如果这个数字在配置文件里，流程就是：改配置文件 → 重启程序（甚至不重启）→ 跑一遍 → 不行再改。一轮 30 秒。

> 赛场上一天能跑的次数是有限的，每多编译一次就少跑一次。参数管理不是锦上添花，是直接决定赛前能调多少轮。

---

# YAML 配置文件

把所有可调参数抽到 YAML 文件里，程序启动时读取。

```yaml
# config/params.yaml

pure_pursuit:
  lookahead_min: 0.3      # 最小前瞻距离 m
  lookahead_k: 1.0        # 前瞻距离 = max(min, k * v)
  max_speed: 2.0          # 最大速度 m/s
  min_speed: 0.3          # 最小速度 m/s

pid:
  linear_kp: 1.2
  linear_ki: 0.01
  linear_kd: 0.3
  angular_kp: 2.0
  angular_ki: 0.0
  angular_kd: 0.5

chassis:
  wheel_base: 0.3         # 轮距 m
  max_angular_vel: 2.0    # 最大角速度 rad/s

paths:
  zone1:
    - [0.0, 0.0]
    - [1.0, 0.0]
    - [2.0, 0.5]
    - [3.0, 1.5]
```

Python 读取用 `pyyaml`：

```bash
pip install pyyaml
```

```python
import yaml

def load_config(path="config/params.yaml"):
    with open(path) as f:
        return yaml.safe_load(f)

cfg = load_config()

# 用的时候
v_max = cfg["pure_pursuit"]["max_speed"]
Ld_min = cfg["pure_pursuit"]["lookahead_min"]
kp = cfg["pid"]["angular_kp"]
```

C++ 读取用 `yaml-cpp`：

```cpp
#include <yaml-cpp/yaml.h>

YAML::Node cfg = YAML::LoadFile("config/params.yaml");

double v_max = cfg["pure_pursuit"]["max_speed"].as<double>();
double Ld_min = cfg["pure_pursuit"]["lookahead_min"].as<double>();
double kp = cfg["pid"]["angular_kp"].as<double>();
```

> 把路径点也写在 YAML 里，改流程就是改坐标，不用动代码。我的 `decision.py` 里 zone1 的路线就是从 ROS2 参数读的，改一个数字就行。

---

# ROS2 Parameter

如果你的系统已经在用 ROS2，那它自带一套参数系统，不用白不用。

## 声明参数

在节点里声明参数，带默认值：

```python
class ControlNode(Node):
    def __init__(self):
        super().__init__('control_node')

        # 声明参数，默认值在括号里
        self.declare_parameter('lookahead_min', 0.3)
        self.declare_parameter('lookahead_k', 1.0)
        self.declare_parameter('max_speed', 2.0)
        self.declare_parameter('pid_kp', 1.2)

    def get_params(self):
        return {
            'Ld_min': self.get_parameter('lookahead_min').value,
            'Ld_k': self.get_parameter('lookahead_k').value,
            'v_max': self.get_parameter('max_speed').value,
            'kp': self.get_parameter('pid_kp').value,
        }
```

## 从 launch 文件传参

```python
# launch/control.launch.py
from launch import LaunchDescription
from launch_ros.actions import Node
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration

def generate_launch_description():
    return LaunchDescription([
        DeclareLaunchArgument('max_speed', default_value='2.0'),
        Node(
            package='r2_control',
            executable='control_node',
            parameters=[{
                'max_speed': LaunchConfiguration('max_speed'),
                'lookahead_min': 0.3,
                'pid_kp': 1.2,
            }]
        )
    ])
```

启动时传参：

```bash
ros2 launch r2_control control.launch.py max_speed:=1.5
```

## 运行时改参数

程序跑着的时候，一行命令改参数：

```bash
ros2 param set /control_node max_speed 1.2
ros2 param set /control_node lookahead_min 0.5
```

不用重启程序，改完立刻生效（如果代码里处理了参数更新的话）。

## 参数更新回调

要让参数改了立刻生效，注册一个回调：

```python
class ControlNode(Node):
    def __init__(self):
        super().__init__('control_node')
        self.declare_parameter('max_speed', 2.0)
        self.v_max = 2.0

        # 注册参数更新回调
        self.add_on_set_parameters_callback(self.on_param_change)

    def on_param_change(self, params):
        for param in params:
            if param.name == 'max_speed':
                self.v_max = param.value
                self.get_logger().info(f'v_max updated to {param.value}')
        return SetParametersResult(successful=True)
```

> 26赛季的决策节点参数全是通过 ROS2 Parameter 加载的，红蓝区两套参数、zone1 路径点、DT35 目标值全在 launch 文件里。切红蓝区就是换一套参数，不用改代码。

---

# 不用 ROS2 的热重载方案

如果你没用 ROS2，自己实现一个文件监听也很简单。思路是：起一个后台线程，每隔几秒检查 YAML 文件的修改时间，变了就重新读取。

```python
import os
import time
import yaml
import threading

class ConfigWatcher:
    def __init__(self, path, callback, interval=2.0):
        self.path = path
        self.callback = callback
        self.interval = interval
        self._last_mtime = 0
        self._running = False

    def start(self):
        self._running = True
        threading.Thread(target=self._loop, daemon=True).start()

    def stop(self):
        self._running = False

    def _loop(self):
        while self._running:
            try:
                mtime = os.path.getmtime(self.path)
                if mtime != self._last_mtime:
                    self._last_mtime = mtime
                    with open(self.path) as f:
                        cfg = yaml.safe_load(f)
                    self.callback(cfg)
            except Exception as e:
                print(f"Config reload failed: {e}")
            time.sleep(self.interval)

# 用法
def on_config_change(cfg):
    global v_max, Ld_min
    v_max = cfg["pure_pursuit"]["max_speed"]
    Ld_min = cfg["pure_pursuit"]["lookahead_min"]
    print(f"Config reloaded: v_max={v_max}, Ld_min={Ld_min}")

watcher = ConfigWatcher("config/params.yaml", on_config_change)
watcher.start()

# 之后改 params.yaml 文件，2 秒内自动生效
```

> 这个方案比 ROS2 Parameter 轻量得多，但要注意：修改 YAML 文件的时候不要有语法错误，否则 `yaml.safe_load` 会抛异常。用 `try-except` 包住，加载失败就用上一次的配置。

---

# 哪些参数值得抽出来

不是所有变量都要写进 YAML。判断标准：**赛场上会不会调这个值？**

| 该抽出来的 | 不用抽的 |
|---|---|
| 前瞻距离、速度上限 | 帧头 0xAA |
| PID 增益 | 循环里的计数器 |
| 路径点坐标 | 数学常量（π） |
| 红蓝区标志 | 内部状态变量 |
| 超时时间 | 数据结构字段 |

> 原则：和物理世界打交道的参数抽出来，纯逻辑的东西不用抽。速度、距离、增益、超时这些是和底盘、场地、硬件绑定的，换一辆车就要改。帧头、校验方式这些是协议层面的，定了就不动。

---

# 调参的顺序

赛场上时间有限，不能瞎调。推荐的顺序：

```
1. 先调前瞻距离 Ld
   → 蛇形走位？Ld 调大
   → 过弯切太多？Ld 调小
   → 这一个参数影响最大

2. 再调速度上限
   → 过弯打滑？降速
   → 直道太慢？提速
   → 和 Ld 配合调

3. 最后调控制参数（PID / 其他控制器的增益）
   → 这部分取决于你用什么控制器，具体怎么调看你自己的方案
```

> 不要一次改三个参数。改一个，跑一遍，看效果，再改下一个。同时改多个参数出了问题你不知道是哪个改坏了。

---

# 小结

参数管理就一件事：把会变的东西和不变的东西分开。会变的写配置文件，不变的，很少变的写代码里面。

用 ROS2 的话自带 Parameter 系统，`ros2 param set` 一行命令改参数。不用 ROS2 的话写个文件监听，改 YAML 自动重载。

赛场上每多编译一次就少跑一次。参数热加载不是锦上添花，是直接决定赛前能调多少轮。

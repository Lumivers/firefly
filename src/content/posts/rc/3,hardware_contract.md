---
title: "串口协议与硬件接口抽象"
published: 2026-07-26
pinned: false
description: "串口通信的物理本质、帧协议设计、CRC 校验、内存对齐编解码、纯虚接口隔离与 Mock 假硬件机制。"
tags: [串口, 协议, crc, 接口, mock, 教程]
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 从这一章开始，我们正式进入上位机的核心架构。第一个要解决的问题是：上位机（大脑）和下位机/电控（身体）之间怎么说话。这一章学完，你将得到一个干净的硬件接口层——上层代码永远不需要知道串口是什么。

# 为什么先讲串口？

RC 赛车的上位机不是孤立运行的。它需要告诉底盘"往前走、左转、停"，也需要从电控那里拿到轮速、气压、机械臂状态等反馈。而这些信息的载体，在 RC 赛场上基本就是**串口（UART）**。

为什么是串口而不是 USB、网口、CAN？
- 电控那边的单片机（STM32 之类的）天生就带 UART 外设，接线简单
- RS485/TTL 电平转换便宜可靠，几毛钱一个模块
- 赛场环境简单，不需要网络协议栈那么复杂的东西

但串口有一个本质问题：**它只是一根电线，传的是裸字节流，没有消息边界、没有校验、没有语义。** 你发 `0x01 0x02`，对方收到的可能是 `0x01` 然后隔了 50ms 才收到 `0x02`——字节流就是这样，随时可能被拆开或粘连。

所以这一章的核心任务是：**在裸字节流之上，设计一套可靠的消息协议。**

---

# 串口通信的物理本质

## 字节流，不是消息包

很多人刚接触串口时会有一个误解：以为发一个"包"对方就收到一个"包"。实际上串口只保证**字节顺序**，不保证**消息边界**。

```
你发的：  [0xAA] [0x01] [0x02] [0x55]    ← 一帧
对方可能收到：
  第1次读：[0xAA] [0x01]               ← 只读到一半
  第2次读：[0x02] [0x55]               ← 后一半才到
```

也可能：
```
你发两帧：  [帧1] [帧2]
对方一次读到：[帧1 的尾巴] [帧2 的开头]  ← 粘包
```

**这是串口编程的第一课：永远不要假设一次 read 就是一条完整消息。** 你必须自己从字节流里切分出消息帧。

## 波特率与常见配置

RC 赛场上串口配置基本是固定的：

```bash
波特率：115200（主流，够快够稳）
数据位：8
停止位：1
校验位：无
流控：无
```

> 波特率不是越高越好。115200 在几米线长内足够可靠。到了 921600 或更高，线材质量、电磁干扰都可能导致误码。赛场环境电磁环境复杂，别贪快。

---

# 协议约定：先对表，再写码

**这是整个章节最重要的一节。** 协议不是上位机自己定的——它是上位机和电控之间的契约。你在电脑上写得再漂亮，电控那边不认、不解析、字段对不上，全是瞎jb写。

## 必须提前约定的清单

在开始写代码之前，拉着电控的人坐下来，把这些东西约定好写死在文档里：

| 约定项 | 举例 | 不约定会怎样 |
|---|---|---|
| **波特率** | 115200 | 两边速度不一致，收全是乱码 |
| **字节序** | 小端序（Little-Endian） | 你发 `0x0001`，对方收到 `0x0100` |
| **帧头/帧尾** | `0xAA 0x55` / `0x55` | 电控按 `0xFF` 解析，你发 `0xAA`，帧永远收不到 |
| **CRC 多项式** | Modbus CRC-16 (0xA001) | 你算的校验和和对方对不上，全帧丢弃 |
| **命令字定义** | `0x01` = 速度指令，`0x02` = 急停 | 你发 `0x01` 是速度，电控以为是急停 |
| **数据字段顺序和类型** | 先 linear(float) 再 angular(float) | 你发 float 4 字节，电控按 int 解析 |
| **数值范围和单位** | linear ∈ [-3.0, 3.0] m/s | 你发 5.0，电控截断成 255，车疯了 |
| **通信方向** | 上位机→电控：速度指令；电控→上位机：轮速反馈 | 双方都在发，谁也不收 |
| **发送频率** | 50Hz（每 20ms 一帧） | 你发 100Hz，电控处理不过来，队列溢出 |

## 怎么落地：写一份协议文档

不要用口头约定，不要用微信聊天记录。在项目仓库里建一个 `docs/protocol.md`，长这样：

```markdown
# R2 串口通信协议v1.2（下一届的好像叫BR？反正都是全自动）

## 物理层
- 接口：UART TTL 3.3V
- 波特率：115200
- 数据格式：8N1（8数据位，无校验，1停止位）

## 帧格式
| 字段   | 长度   | 说明           |
|--------|--------|----------------|
| 帧头   | 2 byte | 0xAA 0x55      |
| 命令字 | 1 byte | 见命令表       |
| 长度   | 1 byte | 数据区字节数   |
| 数据   | N byte | 见各命令定义   |
| CRC    | 2 byte | CRC-16/Modbus  |

## 字节序
所有多字节字段均为小端序（Little-Endian）

## 命令表
| 命令字 | 方向         | 含义     | 数据区                  |
|--------|--------------|----------|-------------------------|
| 0x01   | 上位机→电控  | 速度指令 | linear(4B) + angular(4B)|
| 0x02   | 上位机→电控  | 急停     | 无                      |
| 0x10   | 电控→上位机  | 轮速反馈 | left(4B) + right(4B)    |
| 0x11   | 电控→上位机  | 气压状态 | pressure(4B)            |

## 速度指令 (0x01) 数据区
| 偏移 | 长度 | 类型  | 字段    | 范围             |
|------|------|-------|---------|------------------|
| 0    | 4    | float | linear  | [-3.0, 3.0] m/s  |
| 4    | 4    | float | angular | [-5.0, 5.0] rad/s|

## 更新记录
- v1.2 (2026-07-26): 增加气压状态反馈
- v1.1 (2026-07-20): 修正 angular 范围为 [-5.0, 5.0]
- v1.0 (2026-07-15): 初始版本
```

> **这份文档就是你们团队的命根子。** 上位机和电控各自照着实现，出了问题对着文档查，而不是互相甩锅。

## 常见的"约定事故"

> 电控说"我发的 float 是 4 字节"，实际用的是 double（8 字节）

上位机按 4 字节读，后面 4 字节全错位，CRC 永远对不上。**约定时必须写死类型和字节数，不要说"float"，要说"IEEE 754 单精度浮点，4 字节，小端序"。**

> 上位机改了协议没通知电控

你加了一个新命令字 `0x03`，但电控那边的解析代码没更新。电控收到 `0x03` 直接丢弃，你以为指令发出去了。**协议变更必须同步两端，文档版本号递增。**

> 赛场上发现协议有问题，现场改

比赛前一天发现某个字段范围不够，现场改协议——这是灾难的开始。**协议在第一次联调时就应该定稿，之后只增不改（新增命令字可以，改已有字段不行）。**

## 联调验证：先发已知数据对答案

两边代码都写好后，不要直接上控制逻辑。先做一个最简单的验证：

```
上位机发一帧固定数据 → 电控收到后原样返回 → 上位机比对
```

```cpp
// 联调验证：发一个已知的测试帧，看对方能不能原样回传
void protocol_verify(SerialPort& serial) {
    // 构造测试帧
    uint8_t test_frame[] = {0xAA, 0x55, 0xFE, 0x04,
                            0x01, 0x02, 0x03, 0x04,  // 固定数据
                            0x00, 0x00};  // CRC 占位
    uint16_t crc = crc16(test_frame + 2, 6);  // 对命令+长度+数据算 CRC
    test_frame[8] = crc & 0xFF;
    test_frame[9] = (crc >> 8) & 0xFF;

    serial.write(test_frame, sizeof(test_frame));

    // 读回传
    uint8_t reply[64];
    int n = serial.read(reply, sizeof(reply), 1000);  // 超时 1 秒

    if (n == sizeof(test_frame) && memcmp(reply, test_frame, n) == 0) {
        std::cout << "✅ 协议验证通过，通信链路正常" << std::endl;
    } else {
        std::cout << "❌ 协议验证失败，检查帧格式和字节序" << std::endl;
        hex_dump(reply, n);
    }
}
```

> 这步通过了，才说明"两边说的是同一种语言"。之后再往上叠逻辑才有意义。

---

# 帧协议设计

## 为什么需要帧头和帧尾？

既然串口是无边界的字节流，那我们就要自己划边界。最经典的做法：**帧头 + 数据 + 帧尾**。

```
┌────────┬────────┬────────┬──────────┬──────────┐
│ 帧头   │ 命令字 │ 长度   │ 数据     │ CRC 校验 │
│ 0xAA   │ 1 byte │ 1 byte │ N bytes  │ 2 bytes  │
└────────┴────────┴────────┴──────────┴──────────┘
```

- **帧头（0xAA）**：标记一条消息的开始。接收方逐字节扫描，看到 0xAA 就知道"一帧来了"
- **命令字**：区分不同类型的消息（速度指令、状态查询、急停……）
- **长度**：数据区有多少字节，接收方知道该读多少
- **数据**：实际内容，比如底盘速度、轮速反馈
- **CRC 校验**：数据在传输过程中有没有出错

## 帧头怎么选？

帧头不能太简单，否则数据区里碰巧出现同样的字节就会误判。

```cpp
// 帧头设计原则：选一个数据区里不太可能出现的值
constexpr uint8_t FRAME_HEADER = 0xAA;
constexpr uint8_t FRAME_TAIL   = 0x55;

// 更稳妥的做法：用两个字节做帧头，误判概率降到 1/65536
constexpr uint8_t HEADER[] = {0xAA, 0x55};
```

> 如果你的数据区会传任意二进制数据（比如摄像头图像），帧头误判概率会升高。这时候就要靠**转义机制**或**长度字段**来兜底——读完长度字段指定的字节数后，紧接着的两个字节必须是 CRC，对不上就丢弃这帧。

---

# CRC 校验：数据有没有出错

## 什么是 CRC？

CRC（Cyclic Redundancy Check，循环冗余校验）就是对一帧数据算一个"指纹"。发送方算好附在帧尾，接收方收到后重新算一遍，对得上说明数据没坏，对不上就丢弃。

```
发送方：数据 → CRC 计算 → 附在帧尾 → 发出去
接收方：收到数据 → 重新算 CRC → 和帧尾的 CRC 对比
  匹配 → 数据有效
  不匹配 → 丢弃，等下一帧
```

## CRC-16 实现

RC 赛场上 CRC-16 够用了。这里给一个可以直接抄的实现：

```cpp
#include <cstdint>
#include <cstddef>

uint16_t crc16(const uint8_t* data, size_t length) {
    uint16_t crc = 0xFFFF;  // 初始值
    for (size_t i = 0; i < length; i++) {
        crc ^= data[i];
        for (int j = 0; j < 8; j++) {
            if (crc & 0x0001)
                crc = (crc >> 1) ^ 0xA001;  // 多项式
            else
                crc >>= 1;
        }
    }
    return crc;
}
```

用法：

```cpp
// 假设要发送的数据是 {0x01, 0x02, 0x03}
uint8_t payload[] = {0x01, 0x02, 0x03};
uint16_t checksum = crc16(payload, sizeof(payload));

// checksum 的低字节和高字节分别附在帧尾
uint8_t crc_lo = checksum & 0xFF;
uint8_t crc_hi = (checksum >> 8) & 0xFF;
```

> CRC 的多项式有很多种，RC 赛场上用 Modbus 那个（0xA001）就行，上位机和电控约定好同一个即可。

---

# 内存对齐与高效编解码

## 为什么不能直接把结构体发出去？

很多人会想：既然上位机和下位机都是 C/C++，直接把结构体通过串口发不就行了？

```cpp
// ❌ 千万别这么干
struct SpeedCmd {
    float linear;   // 4 bytes
    float angular;  // 4 bytes
};

SpeedCmd cmd{1.0, 0.5};
serial.write((uint8_t*)&cmd, sizeof(cmd));  // 危险！
```

问题在于**内存对齐**。编译器为了访问效率，会在结构体成员之间插入填充字节：

```
// 不加控制，编译器可能这样排列：
struct SpeedCmd {
    float linear;   // 4 bytes
    // ← 编译器插入 4 bytes 填充（取决于平台）
    float angular;  // 4 bytes
};
// sizeof = 12，而不是 8
```

而且不同平台（x86 vs ARM）、不同编译器（GCC vs MSVC）的对齐策略可能不一样。你电脑上 sizeof 是 8，Jetson 上可能就是 12，数据直接乱套。

## #pragma pack(1)：禁用对齐填充

```cpp
#pragma pack(push, 1)  // 告诉编译器：按 1 字节对齐，不要插填充
struct SpeedCmd {
    uint8_t header;    // 1 byte
    float   linear;    // 4 bytes
    float   angular;   // 4 bytes
    uint16_t crc;      // 2 bytes
};
#pragma pack(pop)      // 恢复默认对齐

static_assert(sizeof(SpeedCmd) == 11, "结构体大小必须是 11 字节");
```

> `static_assert` 是断言，如果编译器偷偷塞了填充字节，编译阶段就会报错，而不是到赛场上才发现数据对不上。

## 打包与解包

有了 pack 结构体，收发就很直接：

```cpp
// 打包：结构体 → 字节数组 → 发送
SpeedCmd cmd;
cmd.header = 0xAA;
cmd.linear = 1.0f;
cmd.angular = 0.5f;
cmd.crc = crc16((uint8_t*)&cmd, sizeof(cmd) - 2);  // CRC 不包含自身

serial.write((uint8_t*)&cmd, sizeof(cmd));

// 解包：收到字节流 → 找到帧头 → 拷贝到结构体 → 校验 CRC
SpeedCmd received;
memcpy(&received, buffer + frame_start, sizeof(SpeedCmd));

if (received.crc != crc16((uint8_t*)&received, sizeof(SpeedCmd) - 2)) {
    // CRC 校验失败，丢弃
    return;
}
// CRC 通过，可以安全使用 received.linear 和 received.angular
```

## Python 端的打包

如果你需要用 Python 写测试脚本或快速验证协议，用 `struct` 模块：

```python
import struct

# 打包：'<BffH' 表示小端序，1个uint8 + 2个float + 1个uint16
header = 0xAA
linear = 1.0
angular = 0.5
crc = 0x1234  # 实际要算

data = struct.pack('<BffH', header, linear, angular, crc)
ser.write(data)

# 解包
received = struct.unpack('<BffH', ser.read(11))
_, linear, angular, crc = received
```

> `<` 表示小端序（Little-Endian），上位机和电控必须约定好字节序。RC 赛场上基本都是小端序（STM32 和 x86 都是），但约定就是约定，写死在文档里。

---

# 纯虚接口隔离：设计红线

## 为什么上层不能直接碰串口？

假设你写了一个决策状态机，里面直接调串口发指令：

```cpp
// ❌ 决策代码直接依赖串口
class DecisionFSM {
    SerialPort serial_;  // 直接持有串口对象

    void grab_block() {
        serial_.write(grab_cmd, sizeof(grab_cmd));  // 决策层知道串口细节
    }
};
```

这有什么问题？
1. **没法单测**——没有真实硬件就跑不了
2. **换硬件就炸**——换了一种通信方式（比如 CAN 总线），决策代码全部要改
3. **职责混乱**——决策层在操心"怎么发字节"，而不是"该不该抓"

## 正确做法：定义纯虚接口

```cpp
// 底盘接口：上层只需要知道"底盘能做什么"
class IChassis {
public:
    virtual ~IChassis() = default;

    // 设置速度（线速度 m/s, 角速度 rad/s）
    virtual void set_velocity(float linear, float angular) = 0;

    // 急停
    virtual void emergency_stop() = 0;

    // 获取当前轮速
    virtual WheelSpeed get_wheel_speed() = 0;
};

// 机械臂接口
class IArm {
public:
    virtual ~IArm() = default;

    // 抓取
    virtual void grab(int block_id) = 0;

    // 释放
    virtual void release() = 0;

    // 查询是否到位
    virtual bool is_ready() = 0;
};
```

上层代码只依赖接口，不依赖实现：

```cpp
// ✅ 决策层只依赖接口
class DecisionFSM {
    IChassis& chassis_;  // 引用接口，不知道底层是什么
    IArm& arm_;

public:
    DecisionFSM(IChassis& chassis, IArm& arm)
        : chassis_(chassis), arm_(arm) {}

    void grab_block() {
        chassis_.set_velocity(0, 0);     // 停车
        arm_.grab(1);                     // 抓 1 号块
        // 不需要知道这些指令怎么变成字节发出去的
    }
};
```

## 串口实现：藏在接口后面

```cpp
// 真实硬件实现：通过串口和电控通信
class SerialChassis : public IChassis {
    SerialPort serial_;

public:
    SerialChassis(const std::string& port, int baudrate)
        : serial_(port, baudrate) {}

    void set_velocity(float linear, float angular) override {
        SpeedCmd cmd;
        cmd.header = 0xAA;
        cmd.linear = linear;
        cmd.angular = angular;
        cmd.crc = crc16((uint8_t*)&cmd, sizeof(cmd) - 2);
        serial_.write((uint8_t*)&cmd, sizeof(cmd));
    }

    void emergency_stop() override {
        uint8_t stop_cmd[] = {0xAA, 0xFF, 0x00, 0x00};
        // ... 发送急停帧
    }

    WheelSpeed get_wheel_speed() override {
        // 从串口读取轮速反馈帧，解包返回
        // ...
    }
};
```

> **设计红线：上层（决策、控制）永远不知道串口的存在。** 它只知道"我有一个底盘，能设速度、能急停、能读轮速"。至于这个底盘是串口控制的、CAN 控制的、还是仿真的？上层不关心也不需要关心。

---

# Mock 假硬件：脱离实车做单测

接口隔离最大的好处之一：你可以用几行代码造一个"假底盘"。

```cpp
// 假硬件实现：不接串口，纯内存操作
class MockChassis : public IChassis {
public:
    float linear_ = 0, angular_ = 0;
    bool stopped_ = false;
    WheelSpeed wheel_speed_{0, 0};

    void set_velocity(float linear, float angular) override {
        linear_ = linear;
        angular_ = angular;
    }

    void emergency_stop() override {
        linear_ = 0;
        angular_ = 0;
        stopped_ = true;
    }

    WheelSpeed get_wheel_speed() override {
        return wheel_speed_;
    }

    // 测试辅助：手动设置轮速反馈
    void mock_set_wheel_speed(float left, float right) {
        wheel_speed_ = {left, right};
    }
};

class MockArm : public IArm {
public:
    bool grabbed_ = false;
    bool ready_ = true;

    void grab(int block_id) override {
        grabbed_ = true;
        ready_ = false;
    }

    void release() override {
        grabbed_ = false;
        ready_ = true;
    }

    bool is_ready() override {
        return ready_;
    }
};
```

有了 Mock，不用连任何硬件就能测决策逻辑：

```cpp
#include <cassert>

void test_grab_sequence() {
    MockChassis chassis;
    MockArm arm;
    DecisionFSM fsm(chassis, arm);

    // 模拟抓取流程
    fsm.grab_block();

    // 验证：决策层应该先停车再抓
    assert(chassis.linear_ == 0);
    assert(chassis.angular_ == 0);
    assert(arm.grabbed_ == true);

    std::cout << "✅ 抓取流程测试通过" << std::endl;
}

int main() {
    test_grab_sequence();
    return 0;
}
```

```bash
g++ -std=c++20 test_decision.cpp -o test_decision
./test_decision
# 输出：✅ 抓取流程测试通过
```

> **这就是 Mock 的价值：你在笔记本电脑上就能验证决策逻辑对不对，不用等车造好、不用接线、不用怕撞墙。** 赛前改方案时，先在 Mock 上跑通，再上实车。

---

# 完整的收发流程

把前面的知识串起来，一个完整的"上位机发速度指令 → 收轮速反馈"流程：

```cpp
// main.cpp
#include <iostream>
#include <thread>
#include <chrono>

int main() {
    // 1. 创建串口底盘（真实硬件）
    SerialChassis chassis("/dev/ttyUSB0", 115200);

    // 2. 或者创建假底盘（开发调试用）
    // MockChassis chassis;

    // 3. 发速度指令
    chassis.set_velocity(1.0, 0.3);  // 前进 1m/s，右转 0.3rad/s

    // 4. 读轮速反馈
    auto speed = chassis.get_wheel_speed();
    std::cout << "左轮: " << speed.left << " m/s" << std::endl;
    std::cout << "右轮: " << speed.right << " m/s" << std::endl;

    // 5. 急停
    chassis.emergency_stop();

    return 0;
}
```

---

# 常见坑

> 发出去的数据电控收不到？

检查顺序：
1. 串口有没有开对（`ls /dev/ttyUSB*` 看看设备在不在）
2. 波特率对不对（上位机和电控必须一样）
3. TX/RX 有没有接反（A 的 TX 要接 B 的 RX）
4. 电平对不对（TTL 3.3V 和 RS485 不能直连，需要转换模块）

> 数据偶尔对不上，CRC 经常校验失败？

大概率是**字节序**或**结构体对齐**问题。用 `#pragma pack(1)` 强制对齐，并在两端打印原始字节比对：

```cpp
// 调试用：打印原始字节
void hex_dump(const uint8_t* data, size_t len) {
    for (size_t i = 0; i < len; i++) {
        printf("%02X ", data[i]);
    }
    printf("\n");
}
```

> 串口读到的数据是乱码？

检查：是不是读到了上一帧的残留数据。每次打开串口后先清空缓冲区：

```cpp
serial.flush();  // 清空收发缓冲区
```

---

# 小结

```
字节流（串口原始数据）
    ↓ 帧头/帧尾切分
帧协议（结构化消息）
    ↓ CRC 校验
可靠数据（确认没出错）
    ↓ 纯虚接口隔离
干净的 API（IChassis / IArm）
    ↓ Mock 实现
脱离硬件的单测能力
```

这一章建立了上位机和硬件之间的"契约"。从下一章开始，我们在这个契约之上搭建消息总线和三层架构——上层代码将彻底和硬件解耦。

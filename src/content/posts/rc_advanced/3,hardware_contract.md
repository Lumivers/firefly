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

# 帧协议设计：实战中的双向帧结构

## 为什么需要双向区分帧头？

既然串口是无边界的字节流，那我们就要自己划定消息边界。最经典的做法是定长包 + 帧头 + 校验码。

但在 RC 赛场上，通信是**双向全双工（或者半双工 RS485）**的：
* 上位机往电控发：目标位置、底盘速度、机械臂动作；
* 电控往上位机回：当前位姿、到位状态、微动开关、传感器反馈。

如果两边都用一模一样的帧头（比如都是 `0xAA 0x55`），在某些接线（比如短接测试、或者 485 总线带回显）时，上位机很容易把**自己刚发出去的数据当成下位机的回包**收进来解析，导致状态彻底错乱。

所以更成熟的工程做法是**区分上下行帧头**：

```cpp
constexpr uint8_t FRAME_HEADER_0   = 0xAA; // 引导字节
constexpr uint8_t FRAME_HEADER_CMD = 0x55; // 上位机 -> 下位机 指令帧
constexpr uint8_t FRAME_HEADER_ACK = 0x56; // 下位机 -> 上位机 确认/状态帧
```
* 上位机发送帧头以 `0xAA 0x55` 开头；
* 下位机回传帧头以 `0xAA 0x56` 开头；
彼此泾渭分明，接收端扫描帧头时一眼就能过滤掉无关数据。

---

# CRC-16 校验：查表法与快速计算

## 什么是 CRC？
CRC（Cyclic Redundancy Check，循环冗余校验）就是对一帧数据算一个“指纹”。发送方算好附在帧尾，接收方收到后重新算一遍，对得上说明数据在电磁干扰严重的车载环境中没有误码，对不上就直接丢弃。

赛场环境电机启停时干扰极重，绝对不要用简单的校验和（Checksum 累加和），累加和只能防简单的丢字节，防不住突发误码。**Modbus CRC-16 (多项式 0xA001)** 是 RC 上位机与单片机通信的标准答案。

## 查表法实现（比位移循环快得多）

位移法每个字节都要跑 8 次循环计算，在嵌入式或高频通信中会有不必要的开销。工业上最常用的做法是**预置 256 字节查找表（Table-driven CRC16）**，每个字节只需一次异或和查表：

```cpp
// crc.hpp
#ifndef ROBOT_SERIAL__CRC_HPP_
#define ROBOT_SERIAL__CRC_HPP_

#include <cstdint>
#include <cstddef>

namespace robot_serial
{
class CRC16
{
public:
  // 计算给定缓冲区的 CRC16 (Modbus)
  static uint16_t calcCRC16(const uint8_t * data, size_t length);

private:
  static const uint16_t tableCRC16[256];
};
}  // namespace robot_serial

#endif
```

```cpp
// crc.cpp
#include "robot_serial/crc.hpp"

namespace robot_serial
{
const uint16_t CRC16::tableCRC16[256] = {
  0x0000, 0xC0C1, 0xC181, 0x0140, 0xC301, 0x03C0, 0x0280, 0xC241,
  0xC601, 0x06C0, 0x0780, 0xC741, 0x0500, 0xC5C1, 0xC481, 0x0440,
  0xCC01, 0x0CC0, 0x0D80, 0xCD41, 0x0F00, 0xCFC1, 0xCE81, 0x0E40,
  0x0A00, 0xCAC1, 0xCB81, 0x0B40, 0xC901, 0x09C0, 0x0880, 0xC841,
  // ... 完整 256 项预置表
};

uint16_t CRC16::calcCRC16(const uint8_t * data, size_t length)
{
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < length; ++i) {
    uint8_t table_index = (crc ^ data[i]) & 0xFF;
    crc = (crc >> 8) ^ tableCRC16[table_index];
  }
  return crc;
}
}
```
不管是单片机端还是工控机端，都可以用同一张查找表，计算极其高效。

---

# 内存对齐与数据包结构体（robot_serial 实战）

## 为什么不能直接发结构体？

在 C/C++ 编程中，很多人图省事想直接 `write((uint8_t*)&cmd, sizeof(cmd))` 把结构体扔进串口。

**千万别信编译器默认的内存排布！**  
编译器为了 CPU 寻址效率，会在结构体成员之间偷偷插入“填充字节（Padding）”。你电脑上编译出来可能是 24 字节，STM32 用 Keil/GCC 编译出来可能是 28 字节，只要两端对齐策略稍有差异，浮点数的字节位置全部错开，解析出来的数值就是天文数字。

## #pragma pack(push, 1)：紧凑打包

解决办法是用预编译指令告诉编译器：**禁止任何内存填充，全部按 1 字节紧凑对齐**。

看看我们在 `robot_serial/packet.hpp` 中真正使用的完整通信协议包：

```cpp
#pragma pack(push, 1)

/**
 * @brief 上位机 -> 下位机 发送数据包
 */
struct SendPacket
{
  uint8_t header[2] = {0xAA, 0x55}; // 帧头

  // 当前机器人在场地上的雷达/里程计位姿 (供下位机闭环跟踪与校准)
  float current_x = 0.0f;
  float current_y = 0.0f;
  float current_yaw = 0.0f;

  // 导航目标位姿
  float target_x = 0.0f;
  float target_y = 0.0f;
  float target_yaw = 0.0f;

  // 通用机构控制指令
  uint8_t action_code = 0;   // 动作码 (1: 张开, 2: 闭合, 3: 升降...)
  uint32_t action_data = 0;  // 动作参数 (目标高度/力度/延时等)

  // 校验码 (CRC16)
  uint16_t checksum = 0;
};

/**
 * @brief 下位机 -> 上位机 回传数据包
 */
struct ReceivePacket
{
  uint8_t header[2];       // 应匹配 {0xAA, 0x56}
  uint8_t last_cmd_code;   // 响应的功能码
  uint8_t status;          // 0: IDLE, 1: RUNNING, 2: DONE, 3: ERROR
  uint16_t status_flags;   // 传感器状态与微动开关掩码
  float feedback_data;     // 传感器测距/速度/位置反馈
  uint16_t checksum;       // 校验码 (CRC16)
};

#pragma pack(pop)
```

通过紧凑对齐后，数据包不仅长度完全固定，而且可以通过 `memcpy` 安全地在字节流和结构体之间相互转化：

```cpp
// 序列化打包
inline std::vector<uint8_t> serializePacket(SendPacket & pkt)
{
  // 计算校验码（不包含 checksum 本身）
  pkt.checksum = CRC16::calcCRC16(
    reinterpret_cast<const uint8_t *>(&pkt),
    sizeof(SendPacket) - sizeof(uint16_t));

  std::vector<uint8_t> buffer(sizeof(SendPacket));
  std::memcpy(buffer.data(), &pkt, sizeof(SendPacket));
  return buffer;
}

// 反序列化解包
inline bool parseReceivePacket(const uint8_t * data, size_t length, ReceivePacket & out_pkt)
{
  if (length < sizeof(ReceivePacket)) {
    return false;
  }
  std::memcpy(&out_pkt, data, sizeof(ReceivePacket));

  // 验证 CRC16
  uint16_t expected_crc = CRC16::calcCRC16(data, sizeof(ReceivePacket) - sizeof(uint16_t));
  return out_pkt.checksum == expected_crc;
}
```

---

# 硬件解耦的终局：把串口封死在 ROS 2 驱动节点里

在传统单体代码里，很多新手喜欢在决策函数里直接调串口 `serial.write()`。这会导致代码一旦换硬件就全部推倒重来，而且完全无法单测。

在现代 ROS 2 机器人架构中，**ROS 2 话题就是最天然、最坚固的物理隔离墙**。

我们写一个专门的驱动节点 `SerialDriverNode`（即 `src/robot_serial` 包）：

```
[上层战术决策] ──(/command)──► ┌───────────────────┐ ──(SendPacket)──► [电控单片机]
                                    │         SerialDriverNode             │
[上层定位系统] ──(/odometry)─►  │ - 定时把最新位姿与指令打包发送给串口 │ ◄─(ReceivePacket)─ [传感器反馈]
                                    │ - 后台独立线程读取字节流并做 CRC 校验│
                                    └───────────────────┘
                                                  │
                                                  └──(/robot_status)──► [上层战术决策]
```

### 1. 发送逻辑：定时把数据包发出去

驱动节点内维护一个当前发送包缓存 `current_send_packet_`。上层下发目标点时更新缓存，同时用一个定时器周期性把数据包发送给串口：

```cpp
// 驱动节点中的发送逻辑
void SerialDriverNode::sendPacket()
{
  if (!has_command_ || !serial_driver_ || !serial_driver_->port()->is_open()) {
    return;
  }

  try {
    auto buffer = serializePacket(current_send_packet_);
    serial_driver_->port()->send(buffer);
  } catch (const std::exception & ex) {
    RCLCPP_ERROR(get_logger(), "串口发送异常: %s", ex.what());
    reopenPort();
  }
}
```

### 2. 接收逻辑：独立后台线程解包

串口接收是一个持续阻塞等待的过程，绝对不能放在 ROS 2 的主回调线程里，必须开一个独立的后台线程：

```cpp
void SerialDriverNode::receiveLoop()
{
  std::vector<uint8_t> single_byte(1);
  const size_t PACKET_SIZE = sizeof(ReceivePacket);
  std::vector<uint8_t> frame_buffer(PACKET_SIZE);

  while (rclcpp::ok()) {
    try {
      // 1. 扫描首字节 0xAA
      serial_driver_->port()->receive(single_byte);
      if (single_byte[0] != FRAME_HEADER_0) continue;
      frame_buffer[0] = FRAME_HEADER_0;

      // 2. 匹配第二字节 0x56 (下行 ACK 帧)
      serial_driver_->port()->receive(single_byte);
      if (single_byte[0] != FRAME_HEADER_ACK) continue;
      frame_buffer[1] = FRAME_HEADER_ACK;

      // 3. 读取剩余定长负载
      std::vector<uint8_t> rest(PACKET_SIZE - 2);
      serial_driver_->port()->receive(rest);
      std::memcpy(frame_buffer.data() + 2, rest.data(), rest.size());

      // 4. 解析与 CRC16 校验
      ReceivePacket pkt{};
      if (parseReceivePacket(frame_buffer.data(), frame_buffer.size(), pkt)) {
        // 校验通过，发布 ROS 2 状态消息给上层决策
        auto msg = std::make_shared<robot_serial::msg::Ack>();
        msg->last_cmd_code = pkt.last_cmd_code;
        msg->status = pkt.status;
        msg->status_flags = pkt.status_flags;
        msg->feedback_data = pkt.feedback_data;
        ack_pub_->publish(*msg);
      } else {
        RCLCPP_WARN_THROTTLE(get_logger(), *get_clock(), 5000, "CRC 校验失败，丢弃坏帧");
      }
    } catch (const std::exception & ex) {
      RCLCPP_ERROR_THROTTLE(get_logger(), *get_clock(), 5000, "串口读取异常: %s", ex.what());
      reopenPort();
    }
  }
}
```

**这么做的好处是什么？**
* 上层的决策协程和控制算法，从此**彻底与物理串口隔离**；
* 上层只需要向 `/command` 话题发布指令，并从 `/robot_status` 订阅下位机反馈；
* 什么时候想在自己电脑上单测？甚至不需要改动任何驱动代码，直接用我们框架里的 `MockActionDispatcher`，或者跑一个虚拟节点往 `/robot_status` 发布假消息即可！

---

# 赛场硬件联调保命锦囊

最后总结几个赛场联调时让很多新手抓狂的物理硬件大坑：

### 1. 串口权限被拒（Permission Denied）
在 Linux 下刚插上 USB 转串口模块，程序启动往往报 `open port failed: Permission denied`。  
这是因为串口设备（`/dev/ttyUSB0`）默认属于 `dialout` 用户组，普通用户没有读写权限。  
**永久解决办法**：把当前登录用户加入该组，然后**注销并重新登录一次**：
```bash
sudo usermod -aG dialout $USER
```

### 2. 串口设备号漂移问题（ttyUSB0 变 ttyUSB1）
赛车上有多个 USB 设备（比如陀螺仪、主控单片机、雷达），工控机重启或者颠簸接触不良重新插拔一下，原先的 `/dev/ttyUSB0` 就会变成 `/dev/ttyUSB1`，导致驱动程序找不到端口暴毙。  
**解决办法**：通过 `udev rules` 绑定设备的硬件 Vendor ID 和 Product ID：
```bash
# 查看串口设备的硬件唯一标识
lsusb
# 假设输出为：ID 10c4:ea60 Cygnal Integrated Products CP210x...
```
在 `/etc/udev/rules.d/99-robot-serial.rules` 中写入：
```text
SUBSYSTEM=="tty", ATTRS{idVendor}=="10c4", ATTRS{idProduct}=="ea60", SYMLINK+="robot_chassis"
```
执行 `sudo udevadm control --reload && sudo udevadm trigger` 生效。  
之后无论怎么插拔重启，你的下位机设备永远可以通过固定路径 `/dev/robot_chassis` 访问！

### 3. 数据不对劲时：善用 Hex Dump 抓包
两边联调如果发现 CRC 总是对不上，千万别在脑子里猜。在解包失败处打一行十六进制打印：
```cpp
void hex_dump(const uint8_t* data, size_t len) {
  for (size_t i = 0; i < len; i++) {
    printf("%02X ", data[i]);
  }
  printf("\n");
}
```
把两端打印出来的原始十六进制放在一起对比，一眼就能看出是字节错位了、高低字节颠倒了、还是首尾字节被截断了。

---

# 小结

这一章我们完成了整车系统最底层的“物理契约与驱动封装”：
1. **先对表再写码**：约定死小端序、波特率与数据字段，拒绝口头传话；
2. **区分上下行帧头**：`0xAA 0x55` 与 `0xAA 0x56` 避免总线误判；
3. **查表法 CRC-16**：兼顾运行性能与抗电磁干扰；
4. **内存紧凑对齐**：`#pragma pack(push, 1)` 让结构体与二进制流安全转换；
5. **ROS 2 节点化隔离**：将串口彻底封闭在 `robot_serial` 内，向上层暴露干净的标准话题。

底层的通信链路已经就绪。在下一章中，我们将进入 **Ch4 消息总线与 ROS 2 双线程调度桥接**，剖析整个框架最精妙的跨语言调度核心：ROS 2 执行器与 Python asyncio 是如何实现跨线程零阻塞唤醒的！
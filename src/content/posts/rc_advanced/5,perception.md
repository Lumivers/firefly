---
title: "感知与定位流水线"
published: 2026-07-26
pinned: false
description: "上位机位姿需求、里程计累积误差与上位机责任、激光 SLAM 的赛场现实、DT35 与 AprilTag 打点重定位、OpenCV 与 YOLO 视觉流水线、感知降级链设计。"
tags: [定位, 里程计, imu, slam, yolo, opencv, 相机标定, dt35, 视觉, 冗余设计, 教程]
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 上一章我们打通了双线程消息总线，决策系统已经随时待命。但决策和运动控制都需要一个最根本的输入：机器人在场地的什么位置？目标物块又在什么位置？这一章我们把感知与定位流水线讲透。
// 虽然但是赛场上基本上没有apriltag。所以这个我也感觉不用写？然后关于第六章，sleep有一个迫不得已的情况下写的，就是电控没有写回调函数。我发出去没有回复的这种情况。即使我不想写sleep也不得不写。

# 上位机到底需要什么数据？

在进入具体传感器之前，我们先厘清上位机对感知数据的核心诉求。感知层不负责做动作决策，它的唯一职责就是：**把传感器采集到的原始数据，加工成上层可直接使用的、低延迟且干净的数据**。

| 消费方 | 需要的数据 | 核心用途 |
|---|---|---|
| **控制跟踪层** (Pure Pursuit) | 全局位姿 \((x, y, \theta)\)、线速度与角速度 \((v_x, v_y, \omega)\) | 寻找前瞻路径点、闭环解算底盘速度与转向角 |
| **决策调度层** (FSM) | 目标物块坐标、到位确认、视觉识别结果 | 触发战术转移、判定取物目标、切换比赛阶段 |

注意这两者的本质区别：**控制层要的是连续、高频（50Hz~100Hz）、无跳变的平滑位姿；而决策层要的是离散、稳定、经过滤噪确认的语义信息。**

---

# 里程计：从哪来，到哪去？

上一章在串口协议中，我们定义了下位机上报的反馈包 `ReceivePacket`：

```python
current_x: float    # 当前 X 坐标 (m)
current_y: float    # 当前 Y 坐标 (m)
current_yaw: float  # 当前偏航角 (rad)
```

作为上位机开发，你首先要搞清楚一件事情：**机械和电控怎么去量底盘位移（不管是驱动轮编码器、还是底盘底下装了专门的测程轮、还是板载 IMU 陀螺仪），那是机械和电控的活。电控在下位机里做高频积分，把算好的全局坐标通过串口发上来，上位机拿到直接用。**

上位机真正要关心的问题是：**这个里程计到底可不可信？会漂成什么样？上位机该怎么给它擦屁股？**

### 里程计的本质：相对积分与累积误差

里程计是靠时间累积积分算出来的（Dead Reckoning）。它的最大优点是**更新极快（100Hz+）、平滑、无延迟、几乎不占上位机算力**。

但它的致命缺陷是**累积误差**：
- 底盘急加速或急刹车，轮子与地面微小打滑；
- 赛场地毯接缝、微小凹凸导致的颠簸；
- 哪怕每 10 毫秒只有 0.1 毫米的微小误差，积分跑下来也会越积越大。

```
跑 1 圈（20m）：漂 2 ~ 5cm
跑 5 圈（100m）：漂 10 ~ 30cm
跑 10 圈（200m）：漂 30 ~ 80cm
```

> **我 26 赛季的经验**：
> 我 26 赛季用的就是纯里程计。在短距离作业下（跑几米到十几米），里程计误差完全在厘米级，只要速度规划得当，根本不用担心会偏。
> 但如果你的赛题需要大范围长距离折返、跑几十米以上，或者机械爪对物块的对准要求达到了毫米级，纯靠里程计硬撑就会出事。这时候，**上位机必须负责引入绝对参考系，做打点重定位校正**。

---

# 激光 SLAM：为什么我们最后没上？

> 很多机器人教材会给你长篇大论分析 ICP/NDT 点云匹配、对称环境退化、动态人员遮挡等学术缺点。但如果你问我当时为什么在实车上没上全套激光 SLAM，真实原因其实特别简单：**第一，备赛时间严重落后，根本没时间调；第二，当时板子算力吃紧，跑全套建图和匹配极其吃力；第三，我是纯软件开发的学生，我负责的主要是决策层方面的东西。所以**

如果你也在纠结要不要给比赛车上全套激光 SLAM，不妨从参赛工程的角度算三笔账：

1. **时间账：调 SLAM 的时间成本太高**  
   配雷达驱动、建图、调粒子滤波、解各种偶发定位飘移，没几个星期根本调不扎实。在 Robocon 这种 deadline 极度紧迫的比赛里，上位机最重要的任务是**尽快把全场战术流程跑通**。如果把大把时间陷在底层建图定位里，导致留给上层机构联调和战术测试的时间只剩几天，最后往往得不偿失。

2. **算力与稳定性账**  
   激光点云匹配非常吃 CPU 单核算力和内存带宽。如果上位机算力紧张，雷达节点一旦把 CPU 占满，就会导致串口收发抖动、视觉丢帧甚至整个节点卡死。在 3 分钟争分夺秒的赛场上，多一个复杂节点就多一个故障点。

3. **赛题场景账：杀鸡何必用牛刀**  
   SLAM 的核心价值是解决“未知大场景”下的自主建图与定位。但 Robocon 赛场是一个只有 12m × 15m 的标准封闭小场地，场地边界和尺寸在规则手册里写得清清楚楚。在已知的小环境里，用全套 SLAM 去定一个点，从工程 ROI（投入产出比）来看其实非常低。

所以当时我们果断止损：**放弃全套激光 SLAM，采用“电控里程计主力推算 + 关键工位传感器打点校准”**。电控通过底盘编码器做高频相对积分，上位机在到达目标工位时用简单的传感器（比如 DT35 测距或视觉标记）打一下绝对参考系，立刻把累积误差抹平。

这套方案不仅三天就能调完上线，而且全场运行具有极高的确定性。这也是为什么接下来两节，我会把重点放在 DT35 和 AprilTag 上——因为这是最适合赛道实战、开发成本最低且极其稳妥的做法。

---

# 绝对打点重定位：DT35 激光测距与 AprilTag

既然里程计有微小的累积误差，我们要怎么抹平它？

核心原则只有一句话：**长距离靠里程计推算，到工位用固定参考物打点校正（Relocalization）。**

### 方案 A：DT35 激光测距精校正

DT35 是一种高精度的工业激光测距传感器，打在挡板上的重复测量精度可以达到毫米级。

```
     赛场挡板 (已知全局坐标 X_wall = 4.000m)
  ════════════════════════════════════════════
             ▲
             │ 真实测距值 d = 0.520m
             │ (DT35 激光束打在墙上)
         ┌───┴───┐
         │ DT35  │
         ├───────┤
         │ 机器人 │ 里程计当前值: x_odom = 3.465m
         └───────┘ 真实绝对位置: x_real = 4.000 - 0.520 = 3.480m
                   里程计漂移量: err = 3.480 - 3.465 = +0.015m (15mm)
```

小车通过里程计导航跑到工位附近后，DT35 测出距挡板的真实距离，反算出全局绝对位置，上位机一次性修正偏差，把累积的 15 毫米漂移彻底抹平。

结合上一章的 `robocon-fsm`，在状态机中实现一个原子校正动作：

```python
async def dt35_correct_position(fsm, act, blackboard, target_wall_x=4.0):
    """
    到达工位附近后，利用 DT35 测距值对里程计全局坐标进行一次性瞬时校正
    """
    # 1. 稍微停顿 150ms，等待底盘减速停稳，获得稳定的测距读数
    await fsm.wait(0.15)

    # 2. 从黑板获取滤波后的 DT35 读数
    distance = blackboard.dt35_distance_x
    if distance <= 0.05 or distance >= 3.0:
        # 超出有效量程（打空或被遮挡），放弃本次校正，绝不污染全局坐标
        return False

    # 3. 计算真实绝对 X 坐标并修正黑板偏差
    real_x = target_wall_x - distance
    error_x = real_x - blackboard.current_pose_x

    # 4. 如果误差在合理范围 (如 10cm 内)，更新坐标系偏移量
    if abs(error_x) < 0.10:
        blackboard.offset_x += error_x
        return True
    
    return False
```

### 方案 B：AprilTag 视觉标记重定位

如果赛场立柱或挡板上贴有赛方指定的 AprilTag，可以通过单目相机 + PnP 算法解算出机器人相对 Tag 的 6DoF 位姿：

```
相机拍到 Tag ──► 检测 4 个角点 ──► PnP 求解 ──► 相机相对位姿 (R, T) ──► 结合 Tag 坐标换算全场位姿
```

#### 1. 前提：相机内参标定（张正友标定法）

没有标定的相机测出来的距离是完全扭曲的。用一张棋盘格标定板在不同角度拍摄 15~20 张照片：

```python
import cv2
import numpy as np

PATTERN_SIZE = (9, 6)
SQUARE_SIZE = 0.025  # 格子物理边长 25mm

objp = np.zeros((PATTERN_SIZE[0] * PATTERN_SIZE[1], 3), np.float32)
objp[:, :2] = np.mgrid[0:PATTERN_SIZE[0], 0:PATTERN_SIZE[1]].T.reshape(-1, 2) * SQUARE_SIZE

obj_points, img_points = [], []
cap = cv2.VideoCapture(0)

print("按 's' 记录一帧棋盘格，收集满 20 张后按 'c' 计算内参...")
while len(img_points) < 20:
    ret, frame = cap.read()
    if not ret: break
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    found, corners = cv2.findChessboardCorners(gray, PATTERN_SIZE, None)
    
    disp = frame.copy()
    if found:
        cv2.drawChessboardCorners(disp, PATTERN_SIZE, corners, found)
    cv2.imshow("Calibration", disp)
    key = cv2.waitKey(30)
    if key == ord('s') and found:
        corners_sub = cv2.cornerSubPix(
            gray, corners, (11, 11), (-1, -1),
            (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)
        )
        obj_points.append(objp)
        img_points.append(corners_sub)
        print(f"已收集: {len(img_points)}/20")

ret, mtx, dist, _, _ = cv2.calibrateCamera(
    obj_points, img_points, gray.shape[::-1], None, None
)
np.savez("camera_params.npz", camera_matrix=mtx, dist_coeffs=dist)
print("标定完成，参数已存入 camera_params.npz")
```

#### 2. AprilTag 快速位姿解算

使用 `dt_apriltags` 库直接获取相对位置：

```python
import cv2
import numpy as np
from dt_apriltags import Detector

params = np.load("camera_params.npz")
camera_matrix = params["camera_matrix"]
fx, fy = camera_matrix[0, 0], camera_matrix[1, 1]
cx, cy = camera_matrix[0, 2], camera_matrix[1, 2]

detector = Detector(families="tag36h11", nthreads=2)

def detect_tag_pose(frame, tag_real_size=0.10):
    """返回识别到的 Tag ID 及其在相机坐标系下的 (x, y, z) 平移"""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    detections = detector.detect(
        gray, estimate_tag_pose=True,
        camera_params=(fx, fy, cx, cy),
        tag_size=tag_real_size
    )
    results = []
    for d in detections:
        results.append({
            "id": d.tag_id,
            "dist_xyz": d.pose_t.flatten()  # [tx, ty, tz]
        })
    return results
```

---

# 视觉流水线：OpenCV vs YOLO 目标检测

在感知层中，除了定位自身位姿，另一大任务是**寻找赛场上的作业目标**（物块、圆环、球、料框或对手车辆）。

在硬件选型上，强烈建议小车上位机直接使用 **x86 迷你工控机 / NUC（如 Intel 12代/13代酷睿 i5/i7 迷你主机）**。别用老旧的嵌入式板卡折磨自己——老旧 ARM 板卡不仅有配不完的 CUDA/Python 驱动地狱、赛场发热严重容易降频，而且 CPU 单核性能羸弱。换用普通 x86 迷你主机，标准 Ubuntu 跑起来畅快淋漓，算力完全溢出。

视觉算法选型同样遵守一条黄金原则：**能用传统几何特征解决的，绝不上深度学习；必须上深度学习的，只用轻量模型。**

### 1. OpenCV 几何预处理（针对规则色块、球体）

如果赛题目标物是鲜艳的特定颜色与固定几何轮廓（例如红球、蓝色立方体）：

```
原始帧 ──► ROI 区域裁剪 ──► 转 HSV ──► 阈值二值化 ──► 形态学开闭运算 ──► 轮廓筛选与拟合
```

```python
import cv2
import numpy as np

def detect_colored_ball(frame, roi_rect):
    """
    通过 ROI + HSV 快速锁定目标，处理耗时在 2~4ms 之间
    """
    # 1. ROI 裁剪 (只处理画面下半部，剔除 60% 无效背景计算)
    rx, ry, rw, rh = roi_rect
    roi = frame[ry:ry+rh, rx:rx+rw]

    # 2. 色彩转换与滤波
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    blurred = cv2.GaussianBlur(hsv, (5, 5), 0)

    # 3. 颜色阈值二值化 (以黄色球为例)
    lower_yellow = np.array([20, 100, 100])
    upper_yellow = np.array([35, 255, 255])
    mask = cv2.inRange(blurred, lower_yellow, upper_yellow)

    # 4. 形态学滤波去除微小噪点
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

    # 5. 寻找最大轮廓并拟合最小外接圆
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    largest = max(contours, key=cv2.contourArea)
    if cv2.contourArea(largest) < 200:  # 面积过小视为噪点
        return None

    (cx, cy), radius = cv2.minEnclosingCircle(largest)
    return (int(cx + rx), int(cy + ry), int(radius))
```

> **赛场避坑铁律**：
> 比赛馆内的灯光（冷白灯管 vs 聚光射灯）会让颜色在 HSV 空间产生巨大偏移。**千万别把 HSV 阈值 hardcode 在代码里**。必须放进上一章讲的 YAML 参数中，到了赛场打开滑动条脚本花 1 分钟校准一次。

### 2. YOLOv8n / YOLOv11n 深度学习轻量推理

当目标物形状不规则、存在遮挡、或者存在多类目标（如“己方物块”与“障碍物”）时，传统颜色阈值容易失效，此时必须选用 YOLO。

在 x86 迷你主机上，直接使用 **ONNX Runtime / OpenVINO** 进行推理，不需要配置繁琐的 GPU 驱动环境：

```bash
# 导出通用 ONNX 模型
yolo export model=best.pt format=onnx imgsz=640
```

在 Python 节点中调用推理：

```python
from ultralytics import YOLO

# 直接加载导出的 onnx 模型，在现代 x86 CPU 上单帧仅需 15~25ms
model = YOLO("best.onnx", task="detect")

def infer_frame(frame):
    results = model(frame, conf=0.6, verbose=False)
    detections = []
    for r in results:
        for box in r.boxes:
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            detections.append({
                "class_name": model.names[cls_id],
                "confidence": conf,
                "bbox": (x1, y1, x2, y2),
                "center": ((x1 + x2) / 2, (y1 + y2) / 2)
            })
    return detections
```

---

# 感知系统的防御性降级链设计

在紧张激烈的正式比赛中，硬件传感器出幺蛾子是常态：
- 相机由于剧烈晃动偶发丢帧；
- 激光测距打在吸光布料或接缝上返回 0；
- 对手机器人突然挡住视野。

如果感知层没有防御性设计，一旦抛出异常或返回 `None`，整车就会当场卡死。

一套稳健的感知流水线必须设计**降级链（Fallback Chain）**：

```
                ┌─────────────────────────┐
                │ 顶级精度: 视觉 + DT35 精准引导│
                └────────────┬────────────┘
                             │ (目标被遮挡 / 相机丢帧超时)
                             ▼
                ┌─────────────────────────┐
                │ 次级精度: 里程计盲走预设工位 │
                └────────────┬────────────┘
                             │ (里程计数据超时未上报)
                             ▼
                ┌─────────────────────────┐
                │ 安全兜底: 立即切断底盘急停  │
                └─────────────────────────┘
```

### 1. 测距传感器的中值滤波

DT35 偶尔会因为激光扫到接缝产生单帧尖峰噪点。**绝不要直接拿单帧裸数据去算坐标**，至少做滑动窗口中值滤波：

```python
from collections import deque
import numpy as np

class DistanceFilter:
    def __init__(self, window_size=5):
        self.buffer = deque(maxlen=window_size)

    def update(self, raw_val: float) -> float:
        # 过滤无效量程
        if raw_val <= 0.05 or raw_val > 5.0:
            return self.get_latest()

        self.buffer.append(raw_val)
        # 取中位数，消除单帧毛刺
        return float(np.median(self.buffer))

    def get_latest(self) -> float:
        return float(np.median(self.buffer)) if self.buffer else 0.0
```

### 2. 视觉丢失的心跳超时与盲走兜底

在状态机中等待视觉目标时，永远附带超时与降级策略：

```python
async def align_to_target_mission(fsm, act, bb):
    try:
        # 尝试在 1.5 秒内等待视觉捕捉到目标
        event = await fsm.wait_event("TARGET_ACQUIRED", timeout=1.5)
        target_x, target_y = event.data["x"], event.data["y"]
        act.send_fine_tune_approach(target_x, target_y)
    except FSMTimeoutError:
        # 视觉丢失超时！立即降级为预置坐标盲抓，绝不停留在原地发呆
        act.get_logger().warn("视觉目标丢失，降级为预置坐标盲抓流程！")
        act.send_blind_grab_action()
```

---

# 小结

1. **里程计权责分明**：机械与电控负责在下位机以高频积分解算底盘位姿并上报；上位机负责享用平滑的基准位姿，并为长距离累积漂移擦屁股。
2. **拒绝盲目上激光 SLAM**：在 12m × 15m 的对抗赛场上，低矮挡板与动态人员遮挡极易导致点云退化与假死。“里程计主力推算 + 关键工位打点校正”才是高胜率解法。
3. **打点校正是精度的保证**：通过 DT35 测距传感器打在已知挡板上，或者相机识别 AprilTag，在到达作业点前进行一次性坐标修正，彻底抹平累积漂移。
4. **硬件与算法务实选型**：上位机推荐采用普通的 x86 迷你工控机，告别老旧 ARM 板卡的驱动折磨；规则图形用 HSV 几何形态学（2~4ms），复杂目标用轻量 YOLO 转 ONNX（15~25ms）。
5. **感知层必须有降级链**：测距野点做中值滤波，视觉等待加严格超时与盲走兜底，确保机器人永远不会在赛场上原地卡死。

下一章，我们将正式进入核心决策系统——看看如何利用 Python `async/await` 协程状态机，把这些感知数据调动起来，优雅、线性地指挥机器人全场拿分。

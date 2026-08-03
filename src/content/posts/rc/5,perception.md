---
title: "感知与定位流水线"
published: 2026-07-26
pinned: false
description: "上位机需要什么定位数据、轮式里程计与 IMU 融合、激光 SLAM、相机标定、视觉定位、YOLO 目标检测、OpenCV 预处理、DT35 校正、降级与冗余设计。"
tags: [定位, 里程计, imu, slam, yolo, opencv, 相机标定, dt35, 视觉, 冗余设计, 教程]
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 前面几章一直在说"定位数据"，但这个数据到底从哪来？精度怎么样？有什么坑？这一章把感知层的活讲清楚。

# 上位机需要什么数据

控制层和决策层不直接接触传感器，它们需要感知层提供干净的数据：

| 谁需要 | 需要什么 | 干什么用 |
|---|---|---|
| 控制层 | 位姿 (x, y, θ) | Pure Pursuit 算前瞻点 |
| 控制层 | 速度 (v, ω) | 闭环控制、航位推算 |
| 决策层 | 到达确认 | 知道车到了目标点，可以执行下一步 |
| 决策层 | 区域识别 | 知道车在哪个区域，切换任务 |

感知层的活就是把这些数据从传感器里"榨出来"，滤波、校准、打包，交给上层用。

---

# 轮式里程计

最基础的定位方案：装在轮子上的编码器记录轮子转了多少圈，乘以轮子周长算出行驶距离，再根据左右轮差速算朝向。

```
左轮走了 1.0m，右轮走了 1.05m
轮距 0.3m

前进距离 = (1.0 + 1.05) / 2 = 1.025m
转角 = (1.05 - 1.0) / 0.3 = 0.167 rad ≈ 9.6°
```

每帧做一次积分，不断累加就得到了全局位姿。

## 优势

- 不依赖外部传感器，纯靠轮子上的编码器
- 频率高（100Hz+），更新快
- 计算量几乎为零

## 累积误差

里程计是积分算出来的，每帧都有微小误差，误差会不断累积：

```
跑 1 圈（20m）：漂 2~5cm
跑 5 圈（100m）：漂 10~30cm
跑 10 圈（200m）：漂 30~80cm
```

轮子打滑（急加速、急转弯、地毯接缝）误差更大。

> 我 26 赛季用的就是纯里程计。短距离够用，跑几米到十几米误差在厘米级。但如果赛题要求跑几十米以上还不校正，里程计就不够了。

## IMU 融合

IMU（惯性测量单元）测三轴加速度和角速度，和轮式里程计融合后互相补短：

- **打滑/碰撞检测：** 轮速显示在走，但 IMU 加速度对不上，说明轮子打滑或者车被撞了
- **姿态补偿：** 车有俯仰、倾斜时，IMU 修正里程计的平面假设
- **短时顶替：** 激光匹配失败、SLAM 输出不可信时，先用推算顶几秒

常见的融合方式是 EKF（扩展卡尔曼滤波）：把轮速和 IMU 数据按各自的噪声加权，输出一个比任何单一来源都稳的位姿。

```
里程计（100Hz） + IMU（200Hz） → EKF → 融合位姿
```

> IMU 不是第二个里程计，它自己也会漂（尤其朝向角），单独用越跑越偏。它的价值是和轮式里程计融合：姿态归 IMU，位移归轮子，互相补短。纯 IMU 只能撑几秒，不是全程定位方案。

---

# 激光 SLAM

用激光雷达扫描周围环境，和已知地图（或在线建图）做匹配，算出车在地图里的位姿。

## 两个主流方案

**Cartographer（Google 开源）：** 建图和定位一体，第一次跑的时候在线建图，之后用这个地图定位。适合从零开始的场景。计算量比较大，在 Jetson 上跑要注意性能。

**AMCL（ROS 自带）：** 需要提前建好地图，然后在地图上做粒子滤波定位。比 Cartographer 轻量，但依赖已知地图。

```
Cartographer：边跑边建图 → 生成地图 → 用地图定位
AMCL：提前建好地图 → 在地图上撒粒子 → 粒子收敛到位姿
```

## 匹配算法：ICP 和 NDT

激光 SLAM 的核心是点云匹配——把当前帧的点云和地图对齐，算出位姿。

**ICP（Iterative Closest Point）：** 迭代地找两个点云之间的对应关系，逐步对齐。简单直观，但对初始值敏感，初始偏差太大会收敛到错误结果。

**NDT（Normal Distributions Transform）：** 把空间划分成网格，每个网格用正态分布建模，然后优化点云在网格中的似然。比 ICP 对初始值更鲁棒，计算量也更稳定。

> 大多数 SLAM 框架用的是 NDT 或者改良版 ICP。选型的时候不用太纠结，用框架自带的就行，关键是调好参数（分辨率、最大迭代次数、收敛阈值）。

## 优势

- 全局定位：不靠积分，每帧独立算位姿，不累积误差
- 精度高：厘米级
- 能建图：第一次跑的时候在线建图，之后用这个地图定位

## 坑

**环境退化。** 长走廊、空旷区域、对称结构——激光雷达看到的特征太少，匹配不唯一，定位会飘或者跳。

退化的信号是匹配分数突然变差、协方差变大、位姿在相邻帧之间跳。发现退化后别继续信任激光输出，切到里程计 + IMU 的推算顶着，等特征恢复（出了走廊、拐了弯）再切回来：

```
正常匹配：激光分数高、位姿连续
退化中：激光分数掉、位姿跳变 → 切里程计 + IMU 推算
恢复：分数回升、位姿稳定 → 切回激光 SLAM
```

有测距传感器（比如 DT35）时还能做"距离裁决"：激光里程计和 NDT 地图匹配"打架"、各说各话时，用测距量到已知墙面的距离，谁算出来的位置和这个距离对得上就信谁。

**匹配失败。** 车速太快、雷达转速不够、点云太稀疏，匹配算法找不到最优解，输出的位姿可能是错的。

**初始化。** 冷启动时不知道车在哪，需要在地图上撒一堆粒子（AMCL）或者靠里程计初值（Cartographer），这个过程要几秒到十几秒。

**地图依赖。** 赛场布局变了（每年赛题不同），地图要重新建。如果在线建图质量不好（建图时走的路径不够全），定位精度会受影响。

> 激光 SLAM 是 RC 赛场上定位精度最高的方案，但也是最容易踩坑的。环境退化和匹配失败在赛场上经常发生，需要做降级方案（匹配失败时切回里程计）。我没有实际用过 SLAM，这部分只是原理层面的了解，具体怎么调参怎么踩坑建议去找专门的 SLAM 教程。

---

# 相机标定

做视觉之前必须做的一件事。摄像头拍出来的图像有畸变——直线在边缘会变弯，距离测量不准。标定就是算出畸变参数，把图像"掰直"。

## 张正友标定法

用一张棋盘格标定板，从不同角度拍 15~20 张照片，OpenCV 自动算出相机内参和畸变系数。

```python
import cv2
import numpy as np

# 棋盘格内角点数（列, 行）
CHECKERBOARD = (9, 6)
criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)

# 准备棋盘格的 3D 坐标（假设 z=0）
objp = np.zeros((CHECKERBOARD[0] * CHECKERBOARD[1], 3), np.float32)
objp[:, :2] = np.mgrid[0:CHECKERBOARD[0], 0:CHECKERBOARD[1]].T.reshape(-1, 2)

obj_points = []  # 3D 点
img_points = []  # 2D 点

for i in range(20):  # 拍 20 张
    frame = capture_frame()  # 你的摄像头取帧
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    ret, corners = cv2.findChessboardCorners(gray, CHECKERBOARD, None)

    if ret:
        corners2 = cv2.cornerSubPix(gray, corners, (11, 11), (-1, -1), criteria)
        obj_points.append(objp)
        img_points.append(corners2)

# 标定
ret, camera_matrix, dist_coeffs, rvecs, tvecs = cv2.calibrateCamera(
    obj_points, img_points, gray.shape[::-1], None, None)

print("相机内参:\n", camera_matrix)
print("畸变系数:\n", dist_coeffs)

# 保存
np.savez("calibration.npz", camera_matrix=camera_matrix, dist_coeffs=dist_coeffs)
```

标定完之后，用 `cv2.undistort()` 矫正图像：

```python
data = np.load("calibration.npz")
undistorted = cv2.undistort(frame, data["camera_matrix"], data["dist_coeffs"])
```

> 标定做不好，后面所有视觉算法都是歪的。AprilTag 的位姿估计、色块的坐标测量、YOLO 的检测框位置——全依赖标定质量。拍棋盘格的时候多拍几个角度，远近左右倾斜都拍一些。

---

# 视觉定位

用摄像头识别赛场上的已知标记（AprilTag、色块、二维码），算出车的绝对位姿。

## AprilTag

AprilTag 是一种专门设计给机器人识别的二维码，贴在赛场的关键位置。摄像头拍到 AprilTag 后，通过 PnP 算法算出摄像头相对于 tag 的 6DoF 位姿（位置 + 朝向）。

```
摄像头拍到 tag → 检测 tag 的角点 → PnP 算相对位姿 → 结合 tag 的已知坐标 → 车的全局位姿
```

```python
from dt_apriltags import Detector

detector = Detector(families="tag36h11")
camera_params = (fx, fy, cx, cy)  # 从标定结果里拿

gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
detections = detector.detect(gray, estimate_tag_pose=True, camera_params=camera_params, tag_size=0.1)

for det in detections:
    print(f"Tag ID: {det.tag_id}")
    print(f"位置: {det.pose_t.flatten()}")  # 相对于 tag 的平移
    print(f"旋转:\n{det.pose_R}")             # 相对于 tag 的旋转
```

## 色块识别

简单赛题可能只需要识别特定颜色的区域。HSV 颜色阈值 + 轮廓检测 + 最小外接矩形，几十行代码搞定。

```python
import cv2
import numpy as np

hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
mask = cv2.inRange(hsv, (0, 100, 100), (10, 255, 255))  # 红色
contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

for cnt in contours:
    area = cv2.contourArea(cnt)
    if area > 500:
        x, y, w, h = cv2.boundingRect(cnt)
        center_x = x + w // 2
        center_y = y + h // 2
```

> 色块识别最大的问题是光照。同一个红色方块，在冷光灯下和暖光灯下 HSV 值差很多。现场调阈值是家常便饭，建议写成可调参数（上一章讲的 YAML 配置），别写死在代码里。

---

# YOLO 目标检测

当识别目标不是简单的色块或者 AprilTag，而是形状不规则、类别不同时（比如区分不同颜色的方块、识别障碍物、检测对手车辆），YOLO 是目前最常用的方案。

## YOLO 是什么

YOLO（You Only Look Once）是一个单阶段目标检测模型，输入一张图像，直接输出检测框的坐标、类别和置信度。速度快，适合实时场景。

```
摄像头图像 → YOLO 模型 → [(x, y, w, h, class, confidence), ...]
```

## 训练

**准备数据集：** 用摄像头在赛场环境下拍 200~500 张图片，用 LabelImg 或 Roboflow 标注。每个目标画框、标类别。

```bash
pip install labelimg
labelimg  # 图形界面，框框点点就行
```

**训练配置（以 YOLOv8 为例）：**

```bash
pip install ultralytics
```

```yaml
# data.yaml
train: ./dataset/train/images
val: ./dataset/val/images
nc: 3
names: ['red_block', 'blue_block', 'obstacle']
```

```python
from ultralytics import YOLO

model = YOLO("yolov8n.pt")  # 加载预训练的 nano 模型（最轻量）
model.train(data="data.yaml", epochs=100, imgsz=640)
```

> 用 `yolov8n`（nano）就够了。RC 赛场上不需要大模型，推理速度比精度重要。nano 模型在 Jetson 上跑 30fps 没问题。

## 部署

训练完得到 `best.pt`，直接加载推理：

```python
from ultralytics import YOLO

model = YOLO("runs/detect/train/weights/best.pt")

while True:
    ret, frame = cap.read()
    results = model(frame, conf=0.5)  # conf 是置信度阈值

    for r in results:
        for box in r.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            cls = int(box.cls[0])
            conf = float(box.conf[0])
            name = model.names[cls]
            print(f"{name}: ({x1:.0f},{y1:.0f})-({x2:.0f},{y2:.0f}) conf={conf:.2f}")
```

## TensorRT 加速

在 Jetson 上跑 YOLO，用 TensorRT 加速可以把推理速度提升 2~3 倍：

```python
# 导出 TensorRT 引擎
model.export(format="engine", device=0)  # 生成 best.engine

# 加载 TensorRT 引擎推理
model = YOLO("best.engine")
```

> TensorRT 引擎是和硬件绑定的，在 Jetson 上导出的 engine 不能拿到 x86 上用。每次换硬件要重新导出。

## YOLO 的坑

**数据集不够。** 200 张图训练出来的模型在训练集上 99% 准确率，到了赛场上灯光不一样、角度不一样、背景不一样，直接废掉。至少 500 张，多拍不同角度、不同光照。

**类别不平衡。** 训练集里红色方块 400 张、蓝色方块 50 张，模型会偏向识别红色。数据增强（翻转、旋转、亮度调整）可以缓解。

**误检。** 赛场上的背景杂物被识别成目标。提高置信度阈值（`conf=0.7`）可以减少误检，但也会漏检。需要在误检和漏检之间找平衡。

**推理延时。** YOLO 推理一帧要 20~50ms（Jetson + TensorRT），加上摄像头采集延时，从目标出现到检测结果出来可能过了 80~130ms。做实时控制的时候要考虑这个延时。

---

# OpenCV 图像预处理

不管是 AprilTag、色块还是 YOLO，原始图像在送进算法之前通常要做预处理。

## 常见预处理流水线

```
原始图像
  → 畸变矫正（标定后的 undistort）
  → ROI 裁剪（只保留感兴趣区域，减少计算量）
  → 色彩空间转换（BGR → HSV / 灰度）
  → 滤波去噪（高斯模糊 / 中值滤波）
  → 送进检测算法
```

```python
# 完整的预处理流水线
def preprocess(frame, roi, camera_matrix, dist_coeffs):
    # 1. 畸变矫正
    undistorted = cv2.undistort(frame, camera_matrix, dist_coeffs)

    # 2. ROI 裁剪（比如只看画面下方 2/3）
    x, y, w, h = roi
    cropped = undistorted[y:y+h, x:x+w]

    # 3. 高斯模糊去噪
    blurred = cv2.GaussianBlur(cropped, (5, 5), 0)

    # 4. 转 HSV
    hsv = cv2.cvtColor(blurred, cv2.COLOR_BGR2HSV)

    return hsv
```

## ROI 裁剪

ROI（Region of Interest）裁剪是减少计算量最简单有效的方法。如果你知道目标只出现在画面的某个区域，把其他区域裁掉：

```python
# 只看画面下方 2/3（上方是天空/无关区域）
h, w = frame.shape[:2]
roi = frame[int(h*0.3):h, 0:w]
```

> 裁掉一半画面，计算量直接减半。在 Jetson 这种算力有限的平台上，ROI 裁剪是最简单的加速手段。

## 调试可视化

调视觉算法的时候一定要把中间结果画出来，不然出了问题不知道是哪一步坏的：

```python
cv2.imshow("raw", frame)
cv2.imshow("undistorted", undistorted)
cv2.imshow("mask", mask)
cv2.imshow("result", result_frame)
cv2.waitKey(1)
```

> 不要只看最终结果。中间每一步的输出都看一下——畸变矫正对不对、HSV 阈值准不准、mask 有没有噪点、检测框位置对不对。哪一步出了问题就在哪一步修。

---

# DT35 校正

DT35 是一种激光位移传感器，精度很高（亚毫米级），可以用来做局部位置校正。

## 原理

在赛场的固定位置安装 DT35 传感器（或者把 DT35 装在车上对准固定参考面），测量车和参考面之间的距离。这个距离是绝对的、不累积的，可以用来修正里程计的累积误差。

```
里程计说：我在 (1.02, 2.05)
DT35 说：我到墙面的距离是 0.400m，墙面在 x=1.428
实际 x 应该是 1.428 - 0.400 = 1.028
误差 = 1.028 - 1.02 = 0.008m = 8mm
```

## 我 26 赛季的做法

我的代码里有一个 `dt35_correct()` 函数，在导航到目标点附近后开启 DT35，读取当前值，算误差，加到导航目标上做一次性修正：

```python
async def dt35_correct(self, nav_x, nav_y, dt35_target_x, dt35_target_y, get_dt35, y_sign=-1.0):
    await asyncio.sleep(0.3)  # 等 DT35 值稳定

    dt35_x, dt35_y = get_dt35()
    err_x = dt35_x - dt35_target_x
    err_y = dt35_y - dt35_target_y

    corrected_x = nav_x + err_x
    corrected_y = nav_y + err_y * y_sign

    self.act.send_navigate(corrected_x, corrected_y, ...)
    return await self.wait_event("NAV_DONE")
```

思路是：先用里程计走到目标点附近（粗定位），再用 DT35 做精确修正（精定位）。里程计负责"大概到了"，DT35 负责"精确到位"。

> DT35 的局限是只能在特定位置生效（需要有参考面），不能全程提供定位。所以它适合做"到达校正"，不适合做"全程定位"。全程定位靠里程计或 SLAM，到了目标点附近用 DT35 修正。

---

# 选型建议

| 方案 | 精度 | 频率 | 适用场景 | 复杂度 |
|---|---|---|---|---|
| 纯里程计 | 中（累积误差） | 高（100Hz+） | 短距离、有校正点 | 低 |
| 里程计 + IMU | 中（抗打滑、比纯里程计稳） | 高（100Hz+） | 短中距离、激光失效时兜底 | 中 |
| 激光 SLAM | 高（厘米级） | 中（10~20Hz） | 长距离、复杂环境 | 高 |
| 视觉 AprilTag | 高（近距离） | 中（30Hz） | 有 tag 的固定位置 | 中 |
| DT35 校正 | 极高（毫米级） | 高 | 特定位置精校正 | 低 |

实际比赛中大多数队伍用的是**组合方案**：

```
里程计 + IMU 做高频推算（100Hz+）→ 主要定位源
激光 SLAM 做低频校正（10Hz）→ 修正累积误差
DT35 做到达精校正 → 最后几厘米的精度
```

> 不要为了"高级"而上 SLAM。纯里程计够用就用纯里程计，简单、好调、不踩坑。等赛题真的要求长距离定位再上 SLAM。我 26 赛季就是纯里程计 + DT35，够用了。

---

# 降级链与冗余设计

比赛现场什么都会坏：雷达过热、摄像头松了、IMU 掉线。设计定位系统时先想清楚一件事——如果这个传感器失灵了，谁来补？

一个可行的降级链：

```
雷达 SLAM → 视觉 SLAM → 里程计 + IMU + DT35（机械定位）
```

- 雷达坏了：切视觉 SLAM，靠 AprilTag 或视觉里程计继续定位
- 雷达和摄像头都死了：切机械定位，码盘推算 + IMU 姿态 + DT35 到点校正
- 每一级切换都要有健康检查：匹配分数、检测频率、传感器心跳，连续几帧异常才降级，别被单帧噪声骗了

> 本质上前面所有方案都在做同一件事的两半：里程计负责"我相对刚才走了多少"，重定位负责"我在全局哪里"。怎么搭配、什么时候信谁，就是定位系统的设计核心。冗余设计花不了多少时间，但比赛时可能救一命。

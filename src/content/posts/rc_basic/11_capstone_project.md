---
title: "【结业实战】组装你的第一个道具抓取定位 Demo 与进阶之路"
published: 2026-10-08
pinned: false
weight: 11
description: "基础篇大收官：从零组装工业级道具识别、solvePnP 空间解算、双缓冲采图与串口通信的端到端机器视觉工程，攻克坐标系转换、无显示器 Headless 运行、systemd 开机自启，并展望卡尔曼滤波与深度学习进阶之路。"
tags: [Robocon, 机器视觉, 结业实战, 架构设计, solvePnP, 串口通信, 多线程, 教程]
category: RC上位机入门
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 恭喜你一路坚持到了这里！  
> 从第 1 章第一次在终端配置 Git，到第 6、7、8 章摸索图像矩阵、HSV 调参和 PnP 几何解算，再到第 9、10 章攻克多线程双缓冲和串口底层 `termios` 原始通信——你已经亲手打造了机器人上位机所需的所有核心积木。  
> 
> 但在真正的赛场上，软件不是一块块零散的教学代码，而是一部严丝合缝、在工控机上无人值守默默运转的高速引擎。  
> 本章是整个《RC 上位机新手篇》的**结业终局战**：我们将把前面所有章节的模块整合成一个工业级端到端工程，解决赛场专有的坐标系对齐、无显示器（Headless）运行、开机自启等最后的一公里难题，并为你指明迈向高阶赛车级视觉算法的进阶方向。

---

# 一、完整工程拓扑与架构设计

在真正的机器人视觉工程中，最忌讳的是把几百上千行代码全部堆在 `main.cpp` 里的“意大利面条式”代码。  
我们要按照标准的现代 CMake 工程结构，把业务模块清晰划分为四个正交层：

```
prop_vision_system/
├── CMakeLists.txt                 # 现代目标式 CMake 构建脚本 (第 5 章)
├── include/
│   ├── PingPongFrameBuffer.hpp   # 零拷贝指针交换双缓冲区 (第 9 章)
│   ├── TargetDetector.hpp        # 颜色空间与几何特征提取器 (第 6、7 章)
│   ├── PnPSolver.hpp             # 空间小孔成像与 solvePnP 解算器 (第 8 章)
│   └── SerialPort.hpp            # Linux termios 原始模式二进制串口类 (第 10 章)
└── src/
    ├── TargetDetector.cpp
    ├── PnPSolver.cpp
    └── main.cpp                  # 生产者-消费者主线程调度与软硬件闭环
```

### 全链路数据流向

整个工程的数据管道如下图所示，各个模块职责分明、通过轻量数据结构低耦合交互：

```
      [物理摄像头 / 工业相机]
                 │ (100 FPS 高速硬件流)
                 ▼
      [采图工作线程 (Producer)]
                 │
                 │ std::swap 零拷贝交换 (<10ns)
                 ▼
      [PingPongFrameBuffer 双缓冲]
                 │
                 │ 纳秒级所有权接管 (按需取最新帧)
                 ▼
      [算法处理主线程 (Consumer)]
                 │
                 ├─ 1. TargetDetector: HSV 阈值 -> 形态学去噪 -> 四边形顶点提取
                 │     └─ 成功: 提取 4 个像素角点 QuadPoints
                 │     └─ 失败: 标记置信度为 0，防止假目标误导电控
                 │
                 ├─ 2. PnPSolver: 物理模型 3D 点 + 图像 2D 点 -> cv::solvePnP
                 │     └─ 输出: 相机系坐标 (X_c, Y_c, Z_c) 与姿态角
                 │
                 ├─ 3. 坐标系转换 (Extrinsics): 相机系 -> 机器人底盘中心系
                 │
                 └─ 4. SerialPort: 打包为 18 字节二进制帧 -> CRC8 校验 -> 写入串口
                             │
                             ▼
                 [电控单片机 STM32 / 底盘电机与机械臂]
```

---

# 二、核心模块源码组装

这里我们将前面几章写过的组件做最终的代码整合与接口标准化。

### 1. 目标检测器：`TargetDetector.hpp` 与 `TargetDetector.cpp`

检测器的任务：从输入的 BGR 图像中，提取出我们感兴趣道具的外轮廓四边形顶点。

```cpp
// include/TargetDetector.hpp
#pragma once
#include <opencv2/opencv.hpp>
#include <vector>

struct DetectionResult {
    bool is_detected = false;
    uint8_t target_type = 0;             // 1: 红色道具, 2: 蓝色道具
    std::vector<cv::Point2f> corners;    // 顺时针排列的 4 个四边形角点 (左上/右上/右下/左下)
    float confidence = 0.0f;
};

class TargetDetector {
public:
    TargetDetector();
    DetectionResult detect(const cv::Mat& bgr_frame, bool is_red_target = true);

private:
    cv::Mat hsv_img_;
    cv::Mat mask_img_;
    cv::Mat kernel_morph_;
    
    void sortQuadCorners(std::vector<cv::Point2f>& corners);
};
```

```cpp
// src/TargetDetector.cpp
#include "TargetDetector.hpp"

TargetDetector::TargetDetector() {
    kernel_morph_ = cv::getStructuringElement(cv::MORPH_RECT, cv::Size(5, 5));
}

void TargetDetector::sortQuadCorners(std::vector<cv::Point2f>& corners) {
    if (corners.size() != 4) return;

    // 1. 利用凸包算法保证 4 个角点按顺时针闭环排列 (彻底规避 atan2 在 +-pi 处的跳变割裂)
    std::vector<cv::Point2f> hull;
    cv::convexHull(corners, hull, true /* clockwise: 顺时针 */);
    if (hull.size() != 4) return;
    corners = hull;

    // 2. 寻找距离图像原点 (0, 0) 最近的点作为左上角起算点
    int top_left_idx = 0;
    float min_dist_sq = 1e9f;
    for (int i = 0; i < 4; ++i) {
        float dist_sq = corners[i].x * corners[i].x + corners[i].y * corners[i].y;
        if (dist_sq < min_dist_sq) {
            min_dist_sq = dist_sq;
            top_left_idx = i;
        }
    }
    std::rotate(corners.begin(), corners.begin() + top_left_idx, corners.end());
}

DetectionResult TargetDetector::detect(const cv::Mat& bgr_frame, bool is_red_target) {
    DetectionResult result;
    if (bgr_frame.empty()) return result;

    // 1. 转换至 HSV 颜色空间
    cv::cvtColor(bgr_frame, hsv_img_, cv::COLOR_BGR2HSV);

    // 2. 颜色阈值分割 (以红色双段阈值为例)
    if (is_red_target) {
        cv::Mat mask1, mask2;
        cv::inRange(hsv_img_, cv::Scalar(0, 120, 70), cv::Scalar(10, 255, 255), mask1);
        cv::inRange(hsv_img_, cv::Scalar(170, 120, 70), cv::Scalar(180, 255, 255), mask2);
        cv::bitwise_or(mask1, mask2, mask_img_);
    } else {
        // 蓝色目标
        cv::inRange(hsv_img_, cv::Scalar(100, 120, 70), cv::Scalar(124, 255, 255), mask_img_);
    }

    // 3. 形态学开闭运算消除噪点
    cv::morphologyEx(mask_img_, mask_img_, cv::MORPH_OPEN, kernel_morph_);
    cv::morphologyEx(mask_img_, mask_img_, cv::MORPH_CLOSE, kernel_morph_);

    // 4. 轮廓提取
    std::vector<std::vector<cv::Point>> contours;
    cv::findContours(mask_img_, contours, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_SIMPLE);

    // 5. 寻找最大满足几何特征的轮廓
    double max_area = 0;
    int best_contour_idx = -1;

    for (size_t i = 0; i < contours.size(); ++i) {
        double area = cv::contourArea(contours[i]);
        if (area < 800.0) continue; // 面积太小视为杂波

        if (area > max_area) {
            max_area = area;
            best_contour_idx = i;
        }
    }

    if (best_contour_idx == -1) return result;

    // 6. 多边形拟合逼近四边形角点
    std::vector<cv::Point> approx_curve;
    double peri = cv::arcLength(contours[best_contour_idx], true);
    cv::approxPolyDP(contours[best_contour_idx], approx_curve, 0.03 * peri, true);

    if (approx_curve.size() == 4) {
        result.corners.clear();
        for (const auto& p : approx_curve) {
            result.corners.emplace_back(p.x, p.y);
        }
        sortQuadCorners(result.corners);
        result.is_detected = true;
        result.target_type = is_red_target ? 1 : 2;
        result.confidence = 95.0f;
    }

    return result;
}
```

---

### 2. 空间几何解算器：`PnPSolver.hpp` 与 `PnPSolver.cpp`

解算器的任务：将图像中的 4 个像素角点，结合标定内参和道具物理三维模型，解算出物理空间坐标。

```cpp
// include/PnPSolver.hpp
#pragma once
#include <opencv2/opencv.hpp>
#include <vector>

struct PoseResult {
    bool is_valid = false;
    float x = 0.0f;      // 相机系 X (米, 向右)
    float y = 0.0f;      // 相机系 Y (米, 向下)
    float z = 0.0f;      // 相机系 Z (米, 向前)
    float yaw = 0.0f;    // 绕垂直轴旋转角度 (度)
};

class PnPSolver {
public:
    PnPSolver(double fx, double fy, double cx, double cy,
              const std::vector<double>& dist_coeffs,
              float width_meters, float height_meters);

    PoseResult solve(const std::vector<cv::Point2f>& image_points);

private:
    cv::Mat camera_matrix_;
    cv::Mat dist_coeffs_;
    std::vector<cv::Point3f> object_points_;
};
```

```cpp
// src/PnPSolver.cpp
#include "PnPSolver.hpp"

PnPSolver::PnPSolver(double fx, double fy, double cx, double cy,
                     const std::vector<double>& dist_coeffs,
                     float width_meters, float height_meters) {
    camera_matrix_ = (cv::Mat_<double>(3, 3) << 
        fx, 0.0, cx,
        0.0, fy, cy,
        0.0, 0.0, 1.0);

    dist_coeffs_ = cv::Mat(dist_coeffs, true);

    // 道具在自身坐标系下的物理 3D 角点 (顺时针: 左上, 右上, 右下, 左下)
    float half_w = width_meters / 2.0f;
    float half_h = height_meters / 2.0f;
    object_points_ = {
        cv::Point3f(-half_w, -half_h, 0.0f),
        cv::Point3f( half_w, -half_h, 0.0f),
        cv::Point3f( half_w,  half_h, 0.0f),
        cv::Point3f(-half_w,  half_h, 0.0f)
    };
}

PoseResult PnPSolver::solve(const std::vector<cv::Point2f>& image_points) {
    PoseResult res;
    if (image_points.size() != 4) return res;

    cv::Mat rvec, tvec;
    // 使用 SOLVEPNP_IPPE 针对平面四边形解算，性能高且精度稳定
    bool ok = cv::solvePnP(object_points_, image_points, camera_matrix_, dist_coeffs_,
                           rvec, tvec, false, cv::SOLVEPNP_IPPE);

    if (ok) {
        res.is_valid = true;
        res.x = static_cast<float>(tvec.at<double>(0));
        res.y = static_cast<float>(tvec.at<double>(1));
        res.z = static_cast<float>(tvec.at<double>(2));

        // 将旋转向量转换为旋转矩阵计算偏航角
        cv::Mat R;
        cv::Rodrigues(rvec, R);
        // 绕相机 Y 轴（垂直向下）的偏航角
        double yaw_rad = std::atan2(R.at<double>(0, 2), R.at<double>(2, 2));
        res.yaw = static_cast<float>(yaw_rad * 180.0 / CV_PI);
    }
    return res;
}
```

---

# 三、跨越最后一公里：赛场落地的三大致命盲区

在实验室对着笔记本跑 Demo 和真正上车跑比赛，存在着三个巨大的鸿沟：

### 盲区一：相机坐标系 vs 机器人底盘物理坐标系（外参转换）

很多新手直接把 PnP 解算出来的 `(x, y, z)` 打包发给电控，结果电控同学直接骂娘：  
*“视觉发过来的坐标怎么全是反的？车往前开，坐标里的 $Z$ 越变越小；而且小车一做偏航转向对准，不仅没对准，反而在原地疯狂打转越转越快！”*

**底层真相：相机坐标系与机器人本体底盘坐标系在空间位置和轴向极性上完全不重合！**

```
 相机坐标系 (Camera Frame)                机器人底盘本体坐标系 (Chassis Frame)
       Z_c (光轴斜下/向前)                            Z_r (垂直向上)
      ▲                                              ▲
     /                                               │
    /                                                │
   /───────> X_c (向右)                               │───────> X_r (车头向前)
   │                                                 /
   │                                                /
   ▼ Y_c (向下)                                    ▼ Y_r (车身向左)
```

#### 1. 致命暗算：相机向下倾斜安装时的俯仰角（Pitch）测距误差
在真实 RC/Robocon 机器人中，为了能看清地面上的道具，**相机的物理安装姿态几乎 100% 是向下倾斜的（通常带有 $15^\circ \sim 35^\circ$ 的下俯角 $\theta$）**。
- 相机光轴 $Z_c$ 是斜向下戳向地面的，它根本不是地面的水平前向距离！
- 假设相机向下俯仰 $25^\circ$，真实水平距离其实是 $X_r = Z_c \cos 25^\circ - Y_c \sin 25^\circ$；
- 如果直接拿 $Z_c$ 当水平前向距离，**测距误差会高达 10%~25%**，目标越远误差越离谱。机械臂根据这个距离伸展，必定砸在地上或抓在空地上！

**严谨的外参旋转投影公式**（相机绕自身水平 $X$ 轴向下俯仰角度 $\theta$）：
```cpp
// 1. 将倾斜视线旋转至水平等效坐标系 (绕相机 X 轴旋转 theta)
float cos_p = std::cos(theta_rad);
float sin_p = std::sin(theta_rad);

float x_level = pose.x;
float y_level = pose.y * cos_p - pose.z * sin_p;
float z_level = pose.y * sin_p + pose.z * cos_p;

// 2. 投影到机器人底盘中心坐标系 (加上物理安装偏置)
send_packet.x = z_level + L_offset; // 车头向前: 等效水平深度 + 前向安装距
send_packet.y = -x_level;           // 车身向左: 相机向右为正，底盘向左为正，取负
send_packet.z = -y_level + H_offset;// 离地高度: 相机向下为正，取负后加上离地基准高
```

#### 2. 控制死穴：偏航角（Yaw）极性相反导致的正反馈发散
- 在相机坐标系下，$Y_c$ **垂直向下**，根据右手定则，正的偏航角代表目标在俯视图中**顺时针旋转（向右偏）**；
- 但在标准机器人底盘坐标系（ROS REP 103 / ISO 8855）中，$Z_r$ **垂直向上**，正的偏航角代表目标**逆时针旋转（向左偏）**。
- **灾难后果**：如果直接把 `pose.yaw` 发给单片机闭环转向，控制回路会形成**正反馈发散**——小车向右偏了一点，算法命令它继续向右打舵，结果小车在赛场上疯狂画圈暴走！
- **修正铁律**：发给底盘的偏航角必须严格取反：
```cpp
send_packet.yaw = -pose.yaw;
```

**必须统一约定好：发给电控单片机的所有物理量，必须是机器人自身底盘坐标系下的米制单位与标准极性！**

---

### 盲区二：无显示器（Headless）运行崩溃防范

在赛场上，工控机是塞在小车底盘内部随车移动的，**不可能外接任何显示器**。

如果你的代码中写了：
```cpp
cv::imshow("Vision Debug", frame);
cv::waitKey(1);
```
当你在终端通过 SSH 断开连接、或者开机自启无人值守运行时，Linux 没有图形桌面环境（Display Server），`cv::imshow` 会直接抛出：
```text
Gtk-WARNING **: cannot open display: 
terminate called after throwing an instance of 'cv::Exception'
```
导致程序在开机后几微秒内直接崩溃退出！

**规范做法：增加 GUI 调试开关**
```cpp
bool enable_gui = false; // 比赛车载模式下默认为 false

if (enable_gui) {
    cv::imshow("Vision Debug", current_frame);
    cv::waitKey(1);
}
```
可以通过启动参数（如 `./prop_detector --gui`）来切换调试模式与车载静默运行模式。

---

### 盲区三：跟踪丢失与通信失联防护

当赛场道具被其他小车遮挡，或者车体急转弯使道具滑出视野时：
* 很多同学的代码什么都不发，或者把上一帧的历史旧坐标一直重复发给单片机；
* 单片机以为目标还在原地，控制机械臂盲目向下抓取，直接卡在空地上烧毁舵机或电机。

**通信安全准则**：
1. **只要视野里丢了目标，必须持续发送“丢失标记包”**（置信度赋值为 0，坐标清零）；
2. 单片机只要连续收到 3 帧以上置信度为 0 的包，立刻中止当前动作，转入原地搜索等待状态；
3. 上位机串口每次写入（`write`）必须捕获返回值，如果返回 `-1` 说明 USB 线被剧烈颠簸震松脱落，必须进入重连重试循环，而不能直接抛出异常闪退。

---

# 四、终局联调：主程序 `main.cpp` 与现代 CMake

下面是把全书所有成果融会贯通的端到端主程序 `main.cpp`：

```cpp
// src/main.cpp
#include <iostream>
#include <thread>
#include <atomic>
#include <chrono>

#include "PingPongFrameBuffer.hpp"
#include "TargetDetector.hpp"
#include "PnPSolver.hpp"
#include "SerialPort.hpp"

#pragma pack(push, 1)
struct PropTargetPacket {
    uint8_t  target_type; // 0: 丢失, 1: 红色, 2: 蓝色
    float    x;           // 机器人坐标系 X (米, 前方)
    float    y;           // 机器人坐标系 Y (米, 左方)
    float    z;           // 机器人坐标系 Z (米, 上方)
    float    yaw;         // 目标偏航角度 (度)
    uint8_t  confidence;  // 置信度 (0~100)
};
#pragma pack(pop)

std::atomic<bool> is_running(true);

// 采图工作子线程 (生产者)
void cameraCaptureTask(PingPongFrameBuffer& buffer) {
    cv::VideoCapture cap(0);
    if (!cap.isOpened()) {
        std::cerr << "[相机线程] 无法打开摄像头！" << std::endl;
        is_running = false;
        return;
    }

    // 关键硬件队列限制：驱动层只保留 1 帧，彻底防积压
    cap.set(cv::CAP_PROP_BUFFERSIZE, 1);
    cap.set(cv::CAP_PROP_FPS, 60);

    cv::Mat frame;
    while (is_running) {
        cap >> frame;
        if (frame.empty()) {
            std::this_thread::sleep_for(std::chrono::milliseconds(2));
            continue;
        }
        // 零拷贝指针交换放入最新缓冲区
        buffer.update(frame);
    }

    cap.release();
    std::cout << "[相机线程] 安全退出。" << std::endl;
}

int main(int argc, char** argv) {
    // 检查是否开启 GUI 窗口 (默认车载无屏幕运行)
    bool show_gui = false;
    for (int i = 1; i < argc; ++i) {
        if (std::string(argv[i]) == "--gui") show_gui = true;
    }

    // 1. 初始化模块
    PingPongFrameBuffer frame_buffer;
    TargetDetector detector;
    
    // 初始化 PnP 解算器 (根据相机真实内参填入，假设道具尺寸 0.15m x 0.15m)
    PnPSolver pnp(920.0, 920.0, 640.0, 360.0, {0.0, 0.0, 0.0, 0.0, 0.0}, 0.15f, 0.15f);

    SerialPort serial;
    std::string serial_dev = "/dev/ttyUSB0";
    if (!serial.openPort(serial_dev, 115200)) {
        std::cerr << "[警告] 串口 " << serial_dev << " 打开失败，仅开启纯视觉计算模式！" << std::endl;
    }

    // 2. 启动采图后台线程
    std::thread cap_thread(cameraCaptureTask, std::ref(frame_buffer));

    cv::Mat current_frame;
    PropTargetPacket send_packet = {0};

    std::cout << "[主控系统] 机器人视觉追踪系统启动成功！" << std::endl;
    if (show_gui) std::cout << "[主控系统] GUI 调试窗口已激活 (按 ESC 退出)" << std::endl;

    while (is_running) {
        // 3. 从双缓冲队列获取最新鲜的一帧 (零拷贝接管所有权)
        if (!frame_buffer.getLatest(current_frame)) {
            continue;
        }

        // 4. 执行颜色与几何检测
        DetectionResult det = detector.detect(current_frame, true /* 识别红色道具 */);

        if (det.is_detected) {
            // 5. 空间姿态与距离解算
            PoseResult pose = pnp.solve(det.corners);

            if (pose.is_valid) {
                // 6. 相机坐标系 -> 机器人底盘本体坐标系转换
                // (假设相机在车架上向下倾斜 20 度安装，前向偏置 0.10m，离地基准高度 0.25m)
                constexpr float CAMERA_PITCH_DEG = 20.0f;
                constexpr float theta_rad = CAMERA_PITCH_DEG * 3.1415926535f / 180.0f;
                float cos_p = std::cos(theta_rad);
                float sin_p = std::sin(theta_rad);

                // 旋转补偿向下俯仰角
                float x_level = pose.x;
                float y_level = pose.y * cos_p - pose.z * sin_p;
                float z_level = pose.y * sin_p + pose.z * cos_p;

                send_packet.target_type = det.target_type;
                send_packet.x = z_level + 0.10f; // 车头向前: 等效水平深度 + 前向安装距
                send_packet.y = -x_level;        // 车身向左: 相机向右为正，底盘向左为正，取负
                send_packet.z = -y_level + 0.25f;// 离地高度: 相机向下为正，取负后加上离地基准高
                send_packet.yaw = -pose.yaw;     // 关键：偏航角严格取反，符合机器人底盘坐标系极性规范
                send_packet.confidence = static_cast<uint8_t>(det.confidence);

                if (show_gui) {
                    // 可视化：绘制 4 个角点与物理坐标
                    for (size_t i = 0; i < 4; ++i) {
                        cv::line(current_frame, det.corners[i], det.corners[(i + 1) % 4], cv::Scalar(0, 255, 0), 2);
                    }
                    char info_str[128];
                    std::snprintf(info_str, sizeof(info_str), "X:%.2fm Y:%.2fm Z:%.2fm Yaw:%.1fdeg",
                                  send_packet.x, send_packet.y, send_packet.z, send_packet.yaw);
                    cv::putText(current_frame, info_str, cv::Point(30, 50),
                                cv::FONT_HERSHEY_SIMPLEX, 0.7, cv::Scalar(0, 255, 255), 2);
                }
            } else {
                // 解算失败，降级为丢失状态
                send_packet = {0};
            }
        } else {
            // 视野内未检测到目标：发送安全归零包
            send_packet = {0};
        }

        // 7. 打包并通过串口发送至电控单片机 (命令字 0x01)
        if (serial.isOpened()) {
            serial.sendPacket(0x01, &send_packet, sizeof(send_packet));
        }

        // 8. 调试窗口展示
        if (show_gui) {
            cv::imshow("Robot Vision Pipeline", current_frame);
            if (cv::waitKey(1) == 27) { // 按 ESC 键主动退出
                is_running = false;
                break;
            }
        }
    }

    // 9. 安全退出与资源回收
    if (cap_thread.joinable()) {
        cap_thread.join();
    }
    serial.closePort();
    if (show_gui) cv::destroyAllWindows();

    std::cout << "[主控系统] 视觉程序安全退出。" << std::endl;
    return 0;
}
```

---

### 现代 CMake 构建文件：`CMakeLists.txt`

遵循第 5 章确立的现代 Target 依赖原则：

```cmake
cmake_minimum_required(VERSION 3.16)
project(prop_vision_system LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 默认构建模式为兼顾速度与调试的 RelWithDebInfo
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE RelWithDebInfo)
endif()

# 查找系统 OpenCV 依赖
find_package(OpenCV REQUIRED)
find_package(Threads REQUIRED)

# 添加可执行目标
add_executable(prop_vision_node
    src/main.cpp
    src/TargetDetector.cpp
    src/PnPSolver.cpp
)

# 目标专属头文件目录
target_include_directories(prop_vision_node PRIVATE
    ${PROJECT_SOURCE_DIR}/include
    ${OpenCV_INCLUDE_DIRS}
)

# 目标专属链接依赖
target_link_libraries(prop_vision_node PRIVATE
    ${OpenCV_LIBS}
    Threads::Threads
)
```

一键构建运行：
```bash
cmake -B build
cmake --build build -j$(nproc)

# 本地带窗口调试运行:
./build/prop_vision_node --gui

# 车载无显示器静默运行:
./build/prop_vision_node
```

---

# 五、赛场终极部署：systemd 开机自启服务

在比赛检录上场时，发车通常只有短短几秒的准备时间。没有裁判会允许你插上键盘显示器去慢慢敲命令。  
工控机必须做到：**随车电池电源一开，主板通电启动完毕后，视觉程序全自动在后台拉起并连接单片机！**

在 Linux 上，最现代、最稳定的后台守护方式是编写一个 `systemd` 服务。

### 1. 编写服务单元文件
在工控机终端中创建 `/etc/systemd/system/robot_vision.service`：

```ini
[Unit]
Description=Robocon Robot Vision Node Service
# 在网络与本地文件系统加载就绪后启动 (避免与 multi-user.target 产生依赖环死锁)
After=network.target local-fs.target

[Service]
Type=simple
# 替换为你实际的用户名
User=robot
# 替换为你编译生成的二进制绝对路径
WorkingDirectory=/home/robot/prop_vision_system/build
ExecStart=/home/robot/prop_vision_system/build/prop_vision_node
# 如果崩溃则在 2 秒后全自动重启
Restart=always
RestartSec=2s

[Install]
WantedBy=multi-user.target
```

### 2. 启用并启动服务
```bash
# 1. 重载 systemd 配置
sudo systemctl daemon-reload

# 2. 设置开机自启
sudo systemctl enable robot_vision.service

# 3. 立即启动服务测试
sudo systemctl start robot_vision.service

# 4. 查看当前运行状态与日志
sudo systemctl status robot_vision.service
```

如果状态显示为绿色的 `active (running)`，拔掉显示器重启工控机，你的视觉系统就已经像汽车行车电脑一样具备了无人值守的工业级自愈能力！

---

# 六、基础已成：给年轻开发者的进阶路线图

当你亲手把这个全链路 Demo 跑通、把小车上的道具稳稳当当抓取起来时，**你已经正式跨过了绝大多数大学新人的第一道技术天堑**。

你不再是一个只会对着 Jupyter Notebook 调参的“调包侠”，而是一个通晓 Linux 底层、现代 C++ 内存与多线程、空间几何解算以及软硬件通信的**全栈机器人上位机工程师**。

但国赛的赛场永无止境。面对更高速的对抗、更复杂的动态光照和遮挡，这套基础流水线还会遇到新的物理瓶颈。这就是你接下来要攻克的进阶方向：

```
                    ┌─────────────────────────┐
                    │  基础篇完成: 几何规则管道│
                    │ (HSV + solvePnP + UART) │
                    └────────────┬────────────┘
                                 │
         ┌───────────────────────┴───────────────────────┐
         ▼                                               ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│     进阶方向 A: 目标追踪与预测  │   │     进阶方向 B: 深度学习感知    │
│  - 扩展卡尔曼滤波 (EKF)         │   │  - YOLOv8 / YOLO11 目标检测     │
│  - 机械臂前馈延时补偿           │   │  - TensorRT 边缘端毫秒级加速    │
│  - 匈牙利算法多目标数据关联     │   │  - 解决强光照反射与复杂杂物干扰│
└─────────────────────────────────┘   └─────────────────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ 进阶方向 C: 分布式机器人 │
                    │  - ROS 2 节点化与生命周期│
                    │  - MCAP 录包回放与仿真  │
                    └─────────────────────────┘
```

1. **状态估计与运动预测（卡尔曼滤波 / EKF）**：
   机械臂从发出动作到抓取存在 50~100ms 的物理延时。如果目标处于移动状态，机械臂按“当前位置”抓必定抓空。必须通过卡尔曼滤波滤除传感器噪声，并依据运动速度模型**预测未来 100ms 目标在哪里**；
2. **边缘深度学习（YOLO + TensorRT）**：
   当赛场射灯打在反光金属或破损道具上时，HSV 颜色提取会大面积失效。通过 YOLO 神经网络提取高阶语义特征，并用 TensorRT 在小主机 GPU 或 NPU 上跑出 100+ FPS 的极速推理；
3. **分布式通信框架（ROS 2）**：
   当你的机器人上挂了激光雷达、双目相机、IMU，并有路径规划算法协同运行时，通过 ROS 2 的发布/订阅（Pub/Sub）机制重构模块。

关于上述高阶战术，你可以继续阅读我的下一套专题**《RC 上位机架构进阶篇》**。

---

# 🏁 全书通关结业试炼

作为本系列的最后一次挑战，请带上你的硬件：
1. **组装全套代码**：在工控机上新建项目，将四个模块按 CMake 标准组织并成功编译；
2. **软硬件全闭环联调**：将工控机通过 USB-TTL 连接单片机，在镜头前移动道具，让单片机用串口打印接收到的物理坐标 $(X_r, Y_r, Z_r)$；
3. **完成第一台机器人的抓取实验**：配合机械臂同学，在物理世界中完成你的第一次视觉引导自主抓取！

**代码的终点不是屏幕上的像素，而是钢铁战车在赛场上的每一次精准起落。祝你的赛车在赛场上一往无前！**

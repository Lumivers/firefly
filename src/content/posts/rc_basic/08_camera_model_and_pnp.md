---
title: "从 2D 像素到 3D 现实：小孔成像模型、张氏标定与 solvePnP 解算"
published: 2026-10-08
pinned: false
weight: 8
description: "机器视觉核心分水岭：四大坐标系转换推导、小孔成像数学模型、内参矩阵与畸变系数物理意义、张氏棋盘格标定实操、多边形拟合获取透视角点、鲁棒极角排序法、相机坐标系欧拉角推导与 solvePnP 解算。"
tags: [pnp, opencv, 相机标定, 坐标系, 小孔成像, 姿态解算, 教程, 新手入门]
category: RC上位机入门
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 上一章我们提取了道具轮廓，并找到了它在画面上的像素中心点 $(u, v)$。  
> 但机械臂单片机没办法根据“第 320 列、第 240 行像素”去抓东西。机械臂需要的是物理世界的真实米制坐标：**目标在镜头正前方多远（深度 $Z$）？水平偏左还是偏右多少米（$X$）？偏高还是偏低多少米（$Y$）？**  
> 这一章把 2D 像素转换为 3D 空间坐标的核心算法——**小孔成像模型、相机标定与 PnP 位姿解算**讲清楚。

---

# 一、为什么单个像素点无法直接确定三维位置？

看下面这幅投影几何图：

```
       相机光心 (O)
          │ \
          │  \  视线 (Ray)
          │   \
       图像平面 (投影点 p)
                \
                 \───> 物体 A (距离 0.5 米)
                  \
                   \───> 物体 B (距离 1.0 米，体积更大)
```

三维世界里的物体投射到二维图像上，本质上是一次降维。  
从相机光心出发，穿过图像上的像素点 $p$，在现实世界里是一条无限延伸的射线。在这条射线上的任何物体（不管是近处的小方块，还是远处的大方块），在传感器上感光的位置都落在同一个像素点 $p$ 上。

这就是单目普通摄像头最大的限制：**丢失了深度信息**。  
单凭一张图片中的一个点，分不清它是一个近处的小物体，还是一个远处的大物体。

**破局的关键在于先验知识**：在 RC 比赛中，我们要抓取的道具（方块、球体、圆环）的**物理尺寸是已知的**（例如规则规定正方形道具边长为 100mm）。  
已知物体的真实几何尺寸，再结合它在图像上占据的像素投影变形，我们就能通过空间几何唯一解算出它距离相机的物理位置与三维姿态。

---

# 二、四大坐标系与小孔成像模型

为了把物理世界里的点映射到图像上的像素格子，数学上定义了四个相互转换的坐标系：

```
1. 世界坐标系 (Xw, Yw, Zw) [单位: 米]
      │
      │ 外部刚体变换：外参矩阵 [旋转矩阵 R | 平移向量 t]
      ▼
2. 相机坐标系 (Xc, Yc, Zc) [单位: 米，光心为原点，Z 轴垂直朝前]
      │
      │ 透视投影除法 (小孔成像几何，相似三角形)
      ▼
3. 图像物理坐标系 (x, y)   [单位: 毫米，以图像中心为原点]
      │
      │ 离散化采样：内参矩阵 K (除以每个像素的物理尺寸 dx, dy)
      ▼
4. 像素坐标系 (u, v)       [单位: 像素点，左上角为原点 (0, 0)]
```

---

## 2.1 相机内参矩阵（Camera Matrix）

把相机坐标系下的点 $(X_c, Y_c, Z_c)$ 投影到像素坐标 $(u, v)$，用矩阵表示为：

$$
Z_c \begin{bmatrix} u \\ v \\ 1 \end{bmatrix} = \begin{bmatrix} f_x & 0 & c_x \\ 0 & f_y & c_y \\ 0 & 0 & 1 \end{bmatrix} \begin{bmatrix} X_c \\ Y_c \\ Z_c \end{bmatrix}
$$

中间这个 $3 \times 3$ 的矩阵通常记作 $K$，称为**相机内参矩阵**：

- **$f_x, f_y$**：相机焦距以像素为单位的等效值（$f_x = f / dx$，$f$ 是物理焦距毫米数，$dx$ 是单个像素感光单元的毫米宽度）。焦距越大，画面视野（FOV）越窄，物体在画面里看起来越大；
- **$c_x, c_y$**：相机光轴与图像传感器平面的交点（主点偏移）。理论上在画面正中心（比如 640x480 的图像，$c_x \approx 320, c_y \approx 240$），由于装配公差，通常有几个像素的偏差。

内参矩阵是相机的固有光学参数，只要镜头的焦距环没有被拧动，数值就固定不变。

---

## 2.2 相机畸变参数（Distortion Coefficients）

真实世界的透镜不可避免地存在光学畸变：
- **径向畸变（Radial Distortion）**：透镜边缘折射弯曲产生的变形，使直线变弯（桶形畸变或枕形畸变），主要由参数 $k_1, k_2, k_3$ 描述；
- **切向畸变（Tangential Distortion）**：透镜与感光芯片表面没有做到绝对平行产生的形变，主要由参数 $p_1, p_2$ 描述。

OpenCV 通常用一个向量 `distCoeffs = (k1, k2, p1, p2, k3)` 来表示畸变。

> **广角镜头工程提示**：  
> 如果赛车使用了视场角大于 80° 的广角镜头，画面边缘的桶形畸变很明显，物体的直线边缘会被弯曲成弧线，导致提取的 2D 角点坐标本身产生偏差。在这种情况下，建议在检测前用 `cv::undistort` 对全图做去畸变，或者对提取出的 2D 角点单独调用 `cv::undistortPoints`。

---

# 三、相机标定实战：用棋盘格获取内参

在做空间解算之前，必须先通过标定获得相机的内参 $K$ 和畸变系数。

## 3.1 标定步骤与重要避坑点

1. **制作标定板**：打印一张标准黑白棋盘格（例如 $9 \times 6$ 内角点），**务必贴在平整的亚克力板、铝板或硬纸板上**；
   > **严禁用手机或平板屏幕显示棋盘格！** 屏幕表面有厚玻璃反光，且显示屏像素缩放与防误触算法容易使方格实际物理尺寸产生偏差，屏幕反光还会让角点亚像素检测精度严重下降。
2. **多角度采样**：手持标定板在镜头前变换不同距离（近、中、远）、不同倾斜角度（仰俯、左右倾斜），采集 15~25 张照片；
3. **计算并导出**：调用 `cv::findChessboardCorners` 与 `cv::calibrateCamera` 求解，将内参保存为 YAML 文件。

---

## 3.2 标定程序源码

```cpp
// 文件名: calibrate.cpp
#include <opencv2/opencv.hpp>
#include <iostream>
#include <vector>

int main() {
    // 棋盘格内部角点数 (列数, 行数)
    cv::Size board_size(9, 6);
    // 每个方格的真实物理边长 (单位: 米)
    float square_size = 0.025f;

    cv::VideoCapture cap(0);
    if (!cap.isOpened()) {
        std::cerr << "无法打开摄像头！" << std::endl;
        return -1;
    }

    std::vector<cv::Point3f> obj_single_pattern;
    for (int i = 0; i < board_size.height; i++) {
        for (int j = 0; j < board_size.width; j++) {
            obj_single_pattern.push_back(cv::Point3f(j * square_size, i * square_size, 0.0f));
        }
    }

    std::vector<std::vector<cv::Point3f>> object_points;
    std::vector<std::vector<cv::Point2f>> image_points;

    cv::Mat frame, gray;
    std::cout << "标定程序启动！将棋盘格对准镜头：" << std::endl;
    std::cout << "按键盘 'c' 捕获当前帧，按 's' 开始计算并保存结果，按 'q' 退出。" << std::endl;

    while (true) {
        cap >> frame;
        if (frame.empty()) break;

        cv::cvtColor(frame, gray, cv::COLOR_BGR2GRAY);

        std::vector<cv::Point2f> corners;
        bool found = cv::findChessboardCorners(gray, board_size, corners,
                                               cv::CALIB_CB_ADAPTIVE_THRESH | cv::CALIB_CB_NORMALIZE_IMAGE);

        cv::Mat display_frame = frame.clone();
        if (found) {
            cv::drawChessboardCorners(display_frame, board_size, corners, found);
        }

        std::string status = "Captured: " + std::to_string(image_points.size()) + " frames";
        cv::putText(display_frame, status, cv::Point(20, 30), cv::FONT_HERSHEY_SIMPLEX, 0.7, cv::Scalar(0, 255, 0), 2);
        cv::imshow("Camera Calibration", display_frame);

        char key = (char)cv::waitKey(30);
        if (key == 'c' && found) {
            cv::cornerSubPix(gray, corners, cv::Size(11, 11), cv::Size(-1, -1),
                             cv::TermCriteria(cv::TermCriteria::EPS + cv::TermCriteria::COUNT, 30, 0.01));

            image_points.push_back(corners);
            object_points.push_back(obj_single_pattern);
            std::cout << "已成功捕获第 " << image_points.size() << " 组标定数据！" << std::endl;
        } else if (key == 's') {
            if (image_points.size() < 12) {
                std::cout << "当前捕获帧数少于 12 张，请继续按 'c' 捕获更多角度。" << std::endl;
                continue;
            }
            break;
        } else if (key == 'q' || key == 27) {
            cap.release();
            return 0;
        }
    }

    std::cout << "正在运行标定算法..." << std::endl;
    cv::Mat camera_matrix, dist_coeffs;
    std::vector<cv::Mat> rvecs, tvecs;

    double rep_error = cv::calibrateCamera(object_points, image_points, gray.size(),
                                           camera_matrix, dist_coeffs, rvecs, tvecs);

    std::cout << "标定完成！重投影误差: " << rep_error << " 像素 (通常 < 0.5 像素为合格)" << std::endl;

    cv::FileStorage fs("camera_params.yaml", cv::FileStorage::WRITE);
    fs << "camera_matrix" << camera_matrix;
    fs << "dist_coeffs" << dist_coeffs;
    fs.release();
    std::cout << "参数已保存到 camera_params.yaml" << std::endl;

    return 0;
}
```

---

# 四、角点提取：为什么不能直接用旋转矩形？

在把角点送进 PnP 之前，需要先从检测到的道具轮廓中提取 4 个二维顶点。

很多初学者直接使用上一章的 `minAreaRect` 取出 4 个角点：
```cpp
// 存在几何缺陷的做法：
cv::RotatedRect r_rect = cv::minAreaRect(cnt);
r_rect.points(corners);
```

### 为什么在透视投影下旋转矩形会失真？
`cv::minAreaRect` 算出来的是一个二维平行矩形，它的**对边在图像上永远严格平行且等长**。  
但现实三维空间中的方形道具一旦发生倾斜（例如向后倾斜 30 度），在透视投影（近大远小）的作用下，它在图像平面上呈现的形状是一个**近宽远窄的梯形或一般凸四边形**，对边在图像上并不平行。

PnP 算法正是根据这四条边的透视缩放比例来精确计算物体的俯仰（Pitch）和偏航（Yaw）姿态角的。如果强行用对边平行的旋转矩形框住它，透视特征就会被抹平，算出来的角度误差会非常大。

### 正确解法：多边形逼近（cv::approxPolyDP）
对轮廓进行多边形拟合，直接获取带有真实透视形变的 4 个凸四边形角点：

```cpp
std::vector<cv::Point2f> getQuadCornersFromContour(const std::vector<cv::Point>& cnt) {
    std::vector<cv::Point> approx;
    double peri = cv::arcLength(cnt, true);
    // 逼近精度通常设为周长的 2%~4%
    cv::approxPolyDP(cnt, approx, 0.03 * peri, true);

    std::vector<cv::Point2f> corners;
    // 如果拟合出来正好是凸四边形，直接提取真实角点
    if (approx.size() == 4 && cv::isContourConvex(approx)) {
        for (const auto& pt : approx) {
            corners.push_back(cv::Point2f(pt.x, pt.y));
        }
    } else {
        // 如果轮廓边缘受噪点干扰拟合点数不对，降级使用 minAreaRect 兜底
        cv::RotatedRect r = cv::minAreaRect(cnt);
        cv::Point2f pts[4];
        r.points(pts);
        corners.assign(pts, pts + 4);
    }
    return corners;
}
```

---

# 五、角点排序：鲁棒的极角排序法

`cv::solvePnP` 强依赖于 **3D 物理模型点与 2D 像素点的严格对应**：
- 如果你的 3D 模型点定义顺序是：左上 (0)、右上 (1)、右下 (2)、左下 (3)；
- 那么传入 PnP 的 2D 像素点也必须严格是：左上 (0)、右上 (1)、右下 (2)、左下 (3)。

很多教材使用简单的排序方式（例如按 $y$ 坐标排序分出上下，再按 $x$ 坐标分出左右）：
```cpp
// 缺陷做法：当物体旋转 45° 呈菱形时会直接崩溃！
std::sort(pts.begin(), pts.end(), [](const cv::Point2f& a, const cv::Point2f& b) { return a.y < b.y; });
```
当方形道具在画面里旋转成菱形时，$y$ 最小的是上方顶点，$y$ 次小的是左侧顶点，这两个点会被强行划为“上边缘”，整个四边形的几何顺序完全被打乱，解算出的坐标会严重跳变甚至变成负数。

---

## 5.1 标准四边形极角排序算法

通用的几何排序思路：
1. 计算四边形的质心（中心点）；
2. 以质心为原点，用 `atan2` 计算每个角点的极角，按顺时针/逆时针排成一个闭合环；
3. 找到距离画面左上角最近的点作为起始点（Top-Left），顺时针重排为 TL, TR, BR, BL。

```cpp
std::vector<cv::Point2f> sortQuadCorners(const std::vector<cv::Point2f>& pts) {
    if (pts.size() != 4) return pts;

    // 1. 计算几何中心
    cv::Point2f center(0, 0);
    for (const auto& p : pts) center += p;
    center *= 0.25f;

    // 2. 根据极角排序（让 4 个点按时钟顺序排列）
    std::vector<cv::Point2f> sorted = pts;
    std::sort(sorted.begin(), sorted.end(), [center](const cv::Point2f& a, const cv::Point2f& b) {
        return std::atan2(a.y - center.y, a.x - center.x) < 
               std::atan2(b.y - center.y, b.x - center.x);
    });

    // 3. 寻找距离图像原点 (0, 0) 最近的点，作为左上角 (Top-Left)
    int tl_idx = 0;
    double min_dist = 1e9;
    for (int i = 0; i < 4; ++i) {
        double d = sorted[i].x * sorted[i].x + sorted[i].y * sorted[i].y;
        if (d < min_dist) {
            min_dist = d;
            tl_idx = i;
        }
    }

    // 4. 从左上角开始，顺时针输出 4 个点: TL, TR, BR, BL
    std::vector<cv::Point2f> result(4);
    for (int i = 0; i < 4; ++i) {
        result[i] = sorted[(tl_idx + i) % 4];
    }
    return result;
}
```

无论道具在画面中如何旋转，这个函数输出的点集始终保持拓扑连续且起点对齐。

---

# 六、核心算法：solvePnP 位姿解算

数据准备完毕后，调用 `cv::solvePnP`：

```
输入：
1. 道具 3D 模型角点 (object_points) [米]
2. 图像 2D 对应角点 (image_points)  [像素]
3. 相机内参与畸变 (camera_matrix, dist_coeffs)

输出：
- tvec: 平移向量 (Xc, Yc, Zc) [米]
- rvec: 旋转向量 (Roll, Pitch, Yaw)
```

## 6.1 tvec：目标在相机坐标系下的物理坐标

平移向量 `tvec` 直接给出了物理坐标：
- **$X_c$**：相机光轴向右为正（负数代表在镜头左侧）；
- **$Y_c$**：相机光轴向下为正（负数代表在镜头上方）；
- **$Z_c$**：**目标正前方距离相机的物理深度（纵深距离）**。

这三个数值可以直接传给下位机做底盘对齐和机械臂伸展。

---

## 6.2 rvec 与相机坐标系欧拉角推导

这是很多教程容易写错的地方。很多人直接套用航空/车体坐标系公式，导致算出来的偏航和俯仰轴向完全颠倒。

在 OpenCV 相机坐标系中：
- $X_c$ 轴水平向右，绕 $X_c$ 旋转代表**俯仰（Pitch）**；
- $Y_c$ 轴垂直向下，绕 $Y_c$ 旋转代表**偏航（Yaw）**；
- $Z_c$ 轴光轴向前，绕 $Z_c$ 旋转代表在图像平面内的**翻滚（Roll）**。

用 `cv::Rodrigues` 将 `rvec` 转为旋转矩阵 $R$ 后，按相机系分解欧拉角：

```cpp
cv::Mat R;
cv::Rodrigues(rvec, R);

// 相机坐标系下的欧拉角分解 (度)
double pitch = std::asin(-R.at<double>(1, 2)) * 180.0 / CV_PI;
double yaw   = std::atan2(R.at<double>(0, 2), R.at<double>(2, 2)) * 180.0 / CV_PI;
double roll  = std::atan2(R.at<double>(1, 0), R.at<double>(1, 1)) * 180.0 / CV_PI;
```

---

# 七、模块化实战：编写 PnPSolver 类

把上述逻辑封装进独立的头文件 `PnPSolver.hpp`：

```cpp
// PnPSolver.hpp
#pragma once
#include <opencv2/opencv.hpp>
#include <vector>
#include <string>

struct PoseResult {
    cv::Vec3d tvec;  // 平移向量 (x, y, z) 单位: 米
    double distance; // 空间欧式直线距离
    double yaw;      // 偏航角 (绕 Yc 轴)
    double pitch;    // 俯仰角 (绕 Xc 轴)
    double roll;     // 翻滚角 (绕 Zc 轴)
};

class PnPSolver {
public:
    PnPSolver() = default;

    bool loadCameraParams(const std::string& yaml_path) {
        cv::FileStorage fs(yaml_path, cv::FileStorage::READ);
        if (!fs.isOpened()) return false;

        fs["camera_matrix"] >> camera_matrix_;
        fs["dist_coeffs"]   >> dist_coeffs_;
        fs.release();
        return true;
    }

    // 设定 3D 物理尺寸，顺序严格为: 左上, 右上, 右下, 左下
    void setTargetSize(float width_m, float height_m) {
        float half_w = width_m / 2.0f;
        float half_h = height_m / 2.0f;

        object_points_.clear();
        object_points_.push_back(cv::Point3f(-half_w, -half_h, 0.0f)); // 0: TL
        object_points_.push_back(cv::Point3f( half_w, -half_h, 0.0f)); // 1: TR
        object_points_.push_back(cv::Point3f( half_w,  half_h, 0.0f)); // 2: BR
        object_points_.push_back(cv::Point3f(-half_w,  half_h, 0.0f)); // 3: BL
    }

    bool estimatePose(const std::vector<cv::Point2f>& sorted_image_points, PoseResult& result) {
        if (sorted_image_points.size() != 4 || object_points_.size() != 4) return false;

        cv::Vec3d rvec;
        // SOLVEPNP_IPPE 适合平面四边形靶标
        bool success = cv::solvePnP(object_points_, sorted_image_points,
                                    camera_matrix_, dist_coeffs_,
                                    rvec, result.tvec,
                                    false, cv::SOLVEPNP_IPPE);

        if (!success) return false;

        result.distance = cv::norm(result.tvec);

        // 旋转矩阵转相机系欧拉角
        cv::Mat R;
        cv::Rodrigues(rvec, R);
        result.pitch = std::asin(-R.at<double>(1, 2)) * 180.0 / CV_PI;
        result.yaw   = std::atan2(R.at<double>(0, 2), R.at<double>(2, 2)) * 180.0 / CV_PI;
        result.roll  = std::atan2(R.at<double>(1, 0), R.at<double>(1, 1)) * 180.0 / CV_PI;

        return true;
    }

private:
    cv::Mat camera_matrix_;
    cv::Mat dist_coeffs_;
    std::vector<cv::Point3f> object_points_;
};
```

---

# 八、联调主程序

```cpp
// main.cpp
#include <opencv2/opencv.hpp>
#include <iostream>
#include "PnPSolver.hpp"

// 多边形拟合提取 4 个角点
std::vector<cv::Point2f> getQuadCorners(const std::vector<cv::Point>& cnt) {
    std::vector<cv::Point> approx;
    double peri = cv::arcLength(cnt, true);
    cv::approxPolyDP(cnt, approx, 0.03 * peri, true);

    std::vector<cv::Point2f> corners;
    if (approx.size() == 4 && cv::isContourConvex(approx)) {
        for (const auto& pt : approx) corners.push_back(cv::Point2f(pt.x, pt.y));
    } else {
        cv::RotatedRect r = cv::minAreaRect(cnt);
        cv::Point2f pts[4];
        r.points(pts);
        corners.assign(pts, pts + 4);
    }
    return corners;
}

// 极角法排序
std::vector<cv::Point2f> sortQuadCorners(const std::vector<cv::Point2f>& pts) {
    if (pts.size() != 4) return pts;
    cv::Point2f center(0, 0);
    for (const auto& p : pts) center += p;
    center *= 0.25f;

    std::vector<cv::Point2f> sorted = pts;
    std::sort(sorted.begin(), sorted.end(), [center](const cv::Point2f& a, const cv::Point2f& b) {
        return std::atan2(a.y - center.y, a.x - center.x) < 
               std::atan2(b.y - center.y, b.x - center.x);
    });

    int tl_idx = 0;
    double min_dist = 1e9;
    for (int i = 0; i < 4; ++i) {
        double d = sorted[i].x * sorted[i].x + sorted[i].y * sorted[i].y;
        if (d < min_dist) {
            min_dist = d;
            tl_idx = i;
        }
    }

    std::vector<cv::Point2f> result(4);
    for (int i = 0; i < 4; ++i) {
        result[i] = sorted[(tl_idx + i) % 4];
    }
    return result;
}

int main() {
    cv::VideoCapture cap(0);
    if (!cap.isOpened()) return -1;

    PnPSolver solver;
    if (!solver.loadCameraParams("camera_params.yaml")) {
        std::cerr << "未找到 camera_params.yaml，请先运行标定！" << std::endl;
        return -1;
    }

    // 设置道具真实尺寸：0.1m x 0.1m (10cm 方块)
    solver.setTargetSize(0.10f, 0.10f);

    cv::Mat frame, hsv, mask;
    cv::Mat kernel = cv::getStructuringElement(cv::MORPH_RECT, cv::Size(3, 3));

    // 假设寻找黄色道具
    cv::Scalar lower_yellow(20, 100, 100);
    cv::Scalar upper_yellow(40, 255, 255);

    while (true) {
        cap >> frame;
        if (frame.empty()) break;

        cv::cvtColor(frame, hsv, cv::COLOR_BGR2HSV);
        cv::inRange(hsv, lower_yellow, upper_yellow, mask);
        cv::morphologyEx(mask, mask, cv::MORPH_OPEN, kernel);
        cv::morphologyEx(mask, mask, cv::MORPH_CLOSE, kernel);

        std::vector<std::vector<cv::Point>> contours;
        cv::findContours(mask, contours, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_SIMPLE);

        for (const auto& cnt : contours) {
            if (cv::contourArea(cnt) < 300.0) continue;

            // 1. 多边形拟合提取角点
            auto raw_corners = getQuadCorners(cnt);

            // 2. 鲁棒极角排序
            auto sorted_corners = sortQuadCorners(raw_corners);

            // 3. PnP 解算
            PoseResult pose;
            if (solver.estimatePose(sorted_corners, pose)) {
                // 绘制边缘连线
                for (int i = 0; i < 4; i++) {
                    cv::line(frame, sorted_corners[i], sorted_corners[(i + 1) % 4], cv::Scalar(0, 255, 0), 2);
                }

                // 打印坐标和偏航角
                char info[128];
                snprintf(info, sizeof(info), "X:%.2fm Y:%.2fm Z:%.2fm Yaw:%.1f deg",
                         pose.tvec[0], pose.tvec[1], pose.tvec[2], pose.yaw);
                cv::putText(frame, info, sorted_corners[0] + cv::Point2f(-50, -15),
                            cv::FONT_HERSHEY_SIMPLEX, 0.5, cv::Scalar(0, 255, 255), 2);
            }
        }

        cv::imshow("3D Pose", frame);
        if (cv::waitKey(30) == 27) break;
    }

    return 0;
}
```

---

# 九、工程实战注意：IPPE 平面二义性问题

在调用 `cv::SOLVEPNP_IPPE` 解算平面靶标时，数学上存在一个**天然的双解问题（Planar Ambiguity）**：  
当目标平面正对相机或者处于较远距离时，微小的图像像素噪声可能使算法无法确切分辨目标是“稍微左偏”还是“稍微右偏”（类似内克尔立方体的视觉双稳态反转）。

表现出来的现象是：在某些特定角度，算出来的 `yaw` 可能会在正负角度之间突变横跳。  
在实际比赛工程中，单帧的 PnP 结果通常不直接发给电控，而是会经过一层**时序平滑滤波器**（如滑动窗口平均滤波或扩展卡尔曼滤波 EKF），剔除突变的孤立奇异解。这个进阶内容我们在后续架构篇中会专门处理。

---

# 🎯 本章通关小作业

1. 打印标准棋盘格（贴在平整硬板上，勿用屏幕），运行 `calibrate.cpp` 导出内参 `camera_params.yaml`；
2. 找一个已知边长（例如 10cm）的正方形道具，修改代码中的 `setTargetSize`；
3. 编译并运行主程序，在距离镜头 0.5 米和 1.0 米处放置道具，比对屏幕上的 $Z$ 坐标与实测距离误差，观察旋转道具时 Yaw 角度是否连续平滑变化。

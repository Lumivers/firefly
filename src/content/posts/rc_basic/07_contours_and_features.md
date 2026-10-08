---
title: "几何特征提取：形态学去噪、轮廓分析与旋转矩形筛选"
published: 2026-10-08
pinned: false
weight: 7
description: "从二值掩膜到物理目标：形态学腐蚀膨胀与开闭运算、findContours 轮廓提取、面积与长宽比几何筛选、cv::RotatedRect 旋转矩形与道具角点提取。"
tags: [opencv, c++, 图像处理, 形态学, 轮廓检测, 旋转矩形, 教程, 新手入门]
category: RC上位机入门
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 上一章我们用 HSV + inRange 得到了一张黑白的二值掩膜图（Mask）。  
> 但现在的程序只知道画面里哪些像素是 255（白）、哪些是 0（黑）。它还不知道：
> - 画面里一共有几个道具？
> - 每个道具的中心像素坐标 $(u, v)$ 在哪？
> - 道具是摆正的还是倾斜的？长宽比例是多少？
> 
> 这一章的任务就是把这张黑白图像变成结构化的目标数据：**用形态学修补图像 $\rightarrow$ 提取闭合轮廓 $\rightarrow$ 用几何指标筛出真正的目标 $\rightarrow$ 拿到道具的中心点与角点**，为下一章的 3D 空间位置解算做好准备。

---

# 一、形态学操作：修补二值图像

二值化输出的图像通常不够干净：
- 白色道具内部可能因为反光产生黑色小孔洞；
- 背景里可能残留着几颗细小的白色噪点；
- 两个靠得较近的物体边缘可能轻微粘连。

形态学操作就是用一个固定大小的卷积核（通常是 3x3 或 5x5 的矩形），在二值图上滑过并修改像素。最基础的两个操作是**腐蚀**和**膨胀**。

```
原始二值图                 腐蚀 (Erode)             膨胀 (Dilate)
[ 0  0  0  0  0 ]       [ 0  0  0  0  0 ]       [ 0  1  1  1  0 ]
[ 0  1  1  1  0 ]  ──>  [ 0  0  1  0  0 ]  ──>  [ 1  1  1  1  1 ]
[ 0  1  1  1  0 ]       [ 0  0  1  0  0 ]       [ 1  1  1  1  1 ]
[ 0  0  0  0  0 ]       [ 0  0  0  0  0 ]       [ 0  1  1  1  0 ]
                          (白色区域缩小一圈)       (白色区域扩大一圈)
```

## 1.1 腐蚀与膨胀

- **腐蚀（Erode，`cv::erode`）**：卷积核覆盖的所有像素中，只要有一个是黑的，中心像素就变成黑的。效果是把白色区域“削瘦一圈”，细小的孤立白噪点直接被吃掉。
- **膨胀（Dilate，`cv::dilate`）**：卷积核覆盖的所有像素中，只要有一个是白的，中心像素就变成白的。效果是把白色区域“放大一圈”，可以填平物体内部细小的黑洞。

## 1.2 开运算与闭运算（实战主力）

把腐蚀和膨胀按不同顺序组合，就得到了去噪和填孔的标准手段：

### 开运算（Open）：先腐蚀，后膨胀
先缩小把细碎的孤立白噪点消灭，再放大恢复主体大小。  
**应用场景**：消除背景上的散乱杂点，断开两个粘连物体之间的细弱连接。

### 闭运算（Close）：先膨胀，后腐蚀
先放大把物体内部的黑色细缝和孔洞连成一片，再缩小恢复主体边缘。  
**应用场景**：填平道具内部反光留下的黑色坑洞，闭合不完整的外轮廓。

```cpp
// 1. 创建 3x3 的矩形结构元（卷积核）
cv::Mat kernel = cv::getStructuringElement(cv::MORPH_RECT, cv::Size(3, 3));

// 2. 开运算：消除孤立细碎噪点
cv::Mat opened;
cv::morphologyEx(mask, opened, cv::MORPH_OPEN, kernel);

// 3. 闭运算：填补道具内部空洞
cv::Mat closed;
cv::morphologyEx(opened, closed, cv::MORPH_CLOSE, kernel);
```

通常对 Mask 图连续做一次开运算和一次闭运算后，道具轮廓就会变得非常规整。

---

# 二、提取轮廓：cv::findContours

处理干净二值图后，使用 `cv::findContours` 提取每个连通白色区域的外边界。

## 2.1 核心调用代码

```cpp
// 轮廓数据结构：一个轮廓是一串连续的像素点集 std::vector<cv::Point>
// 所有轮廓合起来就是二维数组 std::vector<std::vector<cv::Point>>
std::vector<std::vector<cv::Point>> contours;
std::vector<cv::Vec4i> hierarchy; // 轮廓的层级关系拓扑树

cv::findContours(
    closed,                 // 输入的单通道二值图像
    contours,               // 输出的轮廓集合
    hierarchy,              // 输出的拓扑层级结构
    cv::RETR_EXTERNAL,      // 轮廓检索模式：只检测最外层轮廓
    cv::CHAIN_APPROX_SIMPLE // 轮廓近似方法：压缩水平/垂直线段，只保留端点
);
```

两个关键参数的含义：
1. **`cv::RETR_EXTERNAL`**：忽略物体内部的孔洞轮廓，只抓取最外层轮廓。我们识别实心或规则道具时，只关心外轮廓，用这个模式最快、最省内存；
2. **`cv::CHAIN_APPROX_SIMPLE`**：如果一条边缘是直线，它只保存起点和终点，不保存中间冗余的几百个点，大幅减少后续计算量。

## 2.2 绘制轮廓验证

调试时可以用 `cv::drawContours` 把找出的轮廓画在原图上查看：

```cpp
// 在原图上画出所有找到的轮廓，绿色线条，线宽 2
cv::drawContours(frame, contours, -1, cv::Scalar(0, 255, 0), 2);
```

---

# 三、几何特征筛选：过滤假目标

`findContours` 会把画面里所有符合颜色的白色色块全部找出来（可能找到几十甚至上百个）。赛场地毯接缝、反光边缘可能都会被找出来。我们必须用几何规则把非道具的干扰物剔除。

遍历每一个轮廓，依次做以下判断：

```cpp
for (size_t i = 0; i < contours.size(); i++) {
    const auto& cnt = contours[i];
    // 依次进行面积、比例、外形筛选...
}
```

## 1. 面积筛选（Area）

远处的杂质反光面积很小，赛场大面积背景板面积很大。用 `cv::contourArea` 算出像素面积。

在实际工程中，**建议根据图像总分辨率的比例来设置面积上下限**，避免换用高分辨率工业相机时参数失效：

```cpp
double area = cv::contourArea(cnt);
double frame_area = frame.cols * frame.rows; // 画面总像素数

// 过滤掉小于画面 0.1%（远距离噪点）或大于画面 40%（背景墙）的轮廓
if (area < frame_area * 0.001 || area > frame_area * 0.4) {
    continue;
}
```

## 2. 最小外接旋转矩形（cv::RotatedRect）

很多新人喜欢用 `cv::boundingRect` 算直立矩形：

```cpp
cv::Rect upright_rect = cv::boundingRect(cnt);
```

直立矩形只能返回 $(x, y, width, height)$，而且边永远平行于画面边缘。如果地上的方块道具斜着摆放（比如旋转了 45 度），直立矩形会变得非常大，算出来的长宽比完全失真。

在机器人视觉中，计算目标边界通常使用最小外接旋转矩形 `cv::minAreaRect`：

```cpp
cv::RotatedRect r_rect = cv::minAreaRect(cnt);
```

```
       直立矩形 (boundingRect)          最小外接旋转矩形 (minAreaRect)
      ┌─────────────────────────┐               ┌──────┐
      │          /─────\        │              /        \
      │         /       \       │             /  道具    \
      │        /  道具   \      │            /            \
      │        \         /      │            \            /
      │         \───────/       │             \          /
      └─────────────────────────┘              └────────┘
      (包络虚大，长宽比失真)                 (紧密贴合物体，带角度)
```

`cv::RotatedRect` 结构体包含三个核心属性：
- **`r_rect.center`**：矩形的中心点坐标 `cv::Point2f(x, y)`（道具在画面上的像素中心）；
- **`r_rect.size`**：矩形的实际物理像素长宽 `size.width` 与 `size.height`；
- **`r_rect.angle`**：旋转角度。

通过 `points` 方法可以直接取出该旋转矩形的 4 个角点：
```cpp
cv::Point2f vertices[4];
r_rect.points(vertices); // 把 4 个顶点的坐标填入数组中
```

> **透视投影预警**：  
> `minAreaRect` 拟合出来的对边永远严格平行。在 2D 目标圈定和中心定位时它非常稳健，但在下一章进行 3D 空间位姿解算（PnP）时，物体倾斜产生的真实投影是“近大远小”的一般四边形。下一章我们会用多边形拟合进一步升级它。

## 3. 长宽比筛选（Aspect Ratio）

知道道具的长宽尺寸后，计算其长宽比：

```cpp
float w = r_rect.size.width;
float h = r_rect.size.height;

// 长边除以短边（数值永远 >= 1.0）
float max_dim = std::max(w, h);
float min_dim = std::min(w, h);
float aspect_ratio = max_dim / (min_dim + 1e-5f);

// 假设我们找的是一个正方形道具（或正视时的圆球），理想长宽比为 1.0
// 超过 1.6 说明物体已经明显呈长条形（如反光条、地线），直接剔除
if (aspect_ratio > 1.6f) {
    continue;
}
```

如果是识别圆环或圆球，外接矩形的长宽比同样接近 1.0；如果是长条形道具或灯条，长宽比通常在 3.0~5.0 之间。通过这一步，绝大多数细长条反光都可以被剔除。

---

# 四、模块化实战：编写 TargetDetector 识别类

把上面所有步骤整合为一个独立的 C++ 类，输入原始图像，输出识别到的所有有效道具信息。

```cpp
// TargetDetector.hpp
#pragma once
#include <opencv2/opencv.hpp>
#include <vector>

// 定义一个表示目标道具的数据结构
struct TargetObject {
    cv::Point2f center;          // 像素中心坐标 (u, v)
    cv::RotatedRect rect;        // 最小外接旋转矩形
    cv::Point2f corners[4];      // 矩形的 4 个角点
    double area;                 // 轮廓面积
};

class TargetDetector {
public:
    TargetDetector() {
        // 创建 3x3 矩形结构元
        kernel_ = cv::getStructuringElement(cv::MORPH_RECT, cv::Size(3, 3));
    }

    // 传入一帧图像与当前 HSV 阈值范围，返回所有识别到的道具
    std::vector<TargetObject> detect(
        const cv::Mat& bgr_img,
        const cv::Scalar& lower_hsv,
        const cv::Scalar& upper_hsv
    ) {
        std::vector<TargetObject> results;

        if (bgr_img.empty()) return results;

        // 1. 转 HSV 色彩空间
        cv::Mat hsv;
        cv::cvtColor(bgr_img, hsv, cv::COLOR_BGR2HSV);

        // 2. 阈值分割得到二值 Mask
        cv::Mat mask;
        cv::inRange(hsv, lower_hsv, upper_hsv, mask);

        // 3. 形态学开闭运算修补
        cv::morphologyEx(mask, mask, cv::MORPH_OPEN, kernel_);
        cv::morphologyEx(mask, mask, cv::MORPH_CLOSE, kernel_);

        // 4. 轮廓提取
        std::vector<std::vector<cv::Point>> contours;
        cv::findContours(mask, contours, cv::RETR_EXTERNAL, cv::CHAIN_APPROX_SIMPLE);

        double frame_area = bgr_img.cols * bgr_img.rows;

        // 5. 遍历几何筛选
        for (const auto& cnt : contours) {
            double area = cv::contourArea(cnt);
            // 过滤极小噪点与极大背景
            if (area < frame_area * 0.001 || area > frame_area * 0.4) continue;

            cv::RotatedRect r_rect = cv::minAreaRect(cnt);

            float w = r_rect.size.width;
            float h = r_rect.size.height;
            float max_dim = std::max(w, h);
            float min_dim = std::min(w, h);
            float aspect_ratio = max_dim / (min_dim + 1e-5f);

            // 正方形或规则道具，长宽比通常不超过 1.6
            if (aspect_ratio > 1.6f) continue;

            TargetObject obj;
            obj.center = r_rect.center;
            obj.rect = r_rect;
            obj.area = area;
            r_rect.points(obj.corners);

            results.push_back(obj);
        }

        return results;
    }

private:
    cv::Mat kernel_;
};
```

---

# 五、调用与可视化渲染主程序

编写一个 `main.cpp` 来使用上面的 `TargetDetector`，并在窗口中实时绘制旋转矩形边界、中心红点和坐标数值：

```cpp
// main.cpp
#include <opencv2/opencv.hpp>
#include <iostream>
#include "TargetDetector.hpp"

int main() {
    cv::VideoCapture cap(0);
    if (!cap.isOpened()) {
        std::cerr << "无法打开摄像头！" << std::endl;
        return -1;
    }

    TargetDetector detector;

    // 填入上一章通过调参窗口记录下的颜色阈值（此处以黄色道具为例）
    cv::Scalar lower_yellow(20, 100, 100);
    cv::Scalar upper_yellow(40, 255, 255);

    cv::Mat frame;
    while (true) {
        cap >> frame;
        if (frame.empty()) break;

        // 执行检测
        std::vector<TargetObject> targets = detector.detect(frame, lower_yellow, upper_yellow);

        // 在原图上绘制检测结果
        for (const auto& obj : targets) {
            // 1. 画出旋转矩形的四条边（绿色）
            for (int i = 0; i < 4; i++) {
                cv::line(frame, obj.corners[i], obj.corners[(i + 1) % 4], cv::Scalar(0, 255, 0), 2);
            }

            // 2. 标记像素中心点（红色实心圆）
            cv::circle(frame, obj.center, 5, cv::Scalar(0, 0, 255), -1);

            // 3. 在物体旁边打印中心点像素坐标 (u, v)
            std::string text = "(" + std::to_string((int)obj.center.x) + ", " 
                                   + std::to_string((int)obj.center.y) + ")";
            cv::putText(frame, text, obj.center + cv::Point2f(10, -10),
                        cv::FONT_HERSHEY_SIMPLEX, 0.5, cv::Scalar(0, 255, 255), 1);
        }

        cv::imshow("Target Detection", frame);

        char key = (char)cv::waitKey(30);
        if (key == 'q' || key == 27) break;
    }

    cap.release();
    cv::destroyAllWindows();
    return 0;
}
```

运行效果：摄像头对准目标道具时，屏幕上的道具会被一个绿色的贴合旋转框包围，中心有一个红点，并实时跟随道具移动输出它的像素位置。

---

# 🎯 本章通关小作业

1. 把上面的 `TargetDetector.hpp`、`main.cpp` 放入一个标准的 CMake 工程中；
2. 将阈值换成上一章你调好的自己物体的 HSV 范围；
3. 运行程序，在摄像头前拿动物体：
   - 观察当物体倾斜时，绿色的外接旋转矩形是否会随之旋转贴合；
   - 记录下该物体在画面中的中心坐标 $(u, v)$；
   - 思考一个问题：**我们现在拿到了目标在图像上的像素点 $(u, v)$，但机械臂抓取需要的是三维空间的物理距离 $(X, Y, Z)$（比如在前方 0.8 米，偏左 0.1 米），像素坐标怎么转换成实际空间坐标？**

带着这个问题，我们进入下一章——**空间几何解算与 solvePnP**。

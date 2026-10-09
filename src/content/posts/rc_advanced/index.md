---
title: "从零开始学习RC上位机开发"
published: 2026-07-18
pinned: true
weight: 1
description: ""
tags: []
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 写在前面

> **新手必读**：如果你刚进战队，还没有掌握C/C++内存指针、OpenCV传统图像处理或PnP三维位姿解算，强烈建议先阅读前置系列：**[RC 上位机新手基础篇](../rc_basic/)**。

在RC这个圈子，机械、结构和电控嵌软占了绝大多数，而负责视觉、感知和决策的上位机方向，资料往往非常碎片化。甚至可以说，目前的上位机教程就像嵌软那边n年不更新的Keil一样，这么多年都没个系统、开箱即用的好版本。

因此，我打算将上位机开发的大部分核心知识做个系统性的梳理与统一，并保持持续更新，供大家参考和查阅。

- [Ch1 整车级系统架构与技术选型：为什么选择 C++ 底座 + Python 决策？](./1,architecture/)
- [Ch2 现代 ROS 2 混合工程工作空间与开发脚手架](./2,create_environment/)
- [Ch3 串口协议与硬件接口抽象](./3,hardware_contract/)
- [Ch4 轻量消息总线与三层架构](./4,message_bus/)
- [Ch5 感知与定位流水线](./5,perception/)
- [Ch6 协程驱动的异步决策系统](./6,async_fsm/)
- [Ch7 底盘运动学与 Pure Pursuit 轨迹跟踪](./7,pure_pursuit/)
- [Ch8 脱离硬件的软件在环仿真](./8,sitl/)
- [Ch9 现场调参与参数热加载](./9,params/)
- [Ch10 赛场联调诊断与排错复盘](./10,troubleshooting/)
---
title: "Lumi-Hub 开发日志：2026年3月24日 (补充记录)"
published: 2026-03-24
description: "今日的核心成果集中在桌面端交互体验打磨与日志链路闭环上。"
image: "api"
tags: [Lumi-hub, 开发笔记]
category: 开发笔记
draft: false
pinned: false
---

## 概要

今日的核心成果集中在**桌面端交互体验打磨**与**日志链路闭环**上：

1. 彻底解决了 Windows 端聊天区域因语义树更新而引发的大量 AXTree 报错刷屏问题。
2. 重构聊天气泡的桌面端右键呼出行为，解决了手势与文本选择区域的事件冲突。
3. 把右键菜单视觉全面迭代为桌面化质感（亚克力毛玻璃风格、无动画瞬间弹出、紧凑布局与圆角处理）。
4. 增强启动阶段日志可观测性，完善按日切分策略，并在系统设置面板开放了日志目录的快捷入口。

---

## 1. 聊天区域体验重构与打磨 (UI 优化与降噪)

### 背景问题

在 Windows 端开发环境下，当聊天气泡被包裹在支持跨气泡滑选的 `SelectionArea` 中时，由于引擎底层的部分已知问题，会不断触发 `accessibility_bridge.cc` 的 AXTree 更新报错，严重干扰开发终端的纯净度。同时，原有的聊天气泡操作菜单过度依赖移动端长按逻辑和自带的长篇动画，带有严重的“移动端包袱感”，极大拖累了桌面体验。另外由于手势拦截机制，经常导致右键事件被吞，菜单无法正常呼出。

### 方案

- **降噪策略**：针对桌面端非急需的无障碍特性，利用 `ExcludeSemantics` 主动阻断消息列表区域不必要的语义树生成以换取清爽纯净的终端输出。
- **事件解耦**：完全摒弃 `GestureDetector.onSecondaryTapDown` 事件绑定，改用更底层的 `Listener` 侦测并抢占点按鼠标右键真实的触发时刻，避开上层 `SelectionArea` 的事件吞没和冲突风险。
- **视觉架构跃迁**：弃用自带标准 `showMenu` 方法。改由底层的 `showGeneralDialog` 全新构建独立的透明悬浮路由。结合 `BackdropFilter` 以及高斯模糊算法处理底部透印，渲染亚克力毛玻璃拟真感。同时紧缩各项目的间距和图文字号与主正文高度一致。

### 关键实现

#### AXTree 降噪处理 (`client/lib/screens/chat_screen.dart`)

在列表构件时增加系统判定：如果是在 Windows 且判定环境容许时，引入语义摒弃：
```dart
Widget child = SelectionArea(
  // 原有的选择包裹
  child: ListView.builder(...),
);

if (Platform.isWindows) {
  child = ExcludeSemantics(
    excluding: true,
    child: child,
  );
}
```

#### 引发捕获由 Gesture 回退到原生 Listener

右键的呼出监听改为：
```dart
Listener(
  onPointerDown: (event) {
    if (event.buttons == kSecondaryMouseButton) {
      _showDesktopMenu(context, event.position);
    }
  },
  child: _buildBubble(context),
)
```

#### 无动画亚克力窗口实现

将内部弹窗动画彻底移除 `transitionDuration: Duration.zero`，挂载透明色卡调教的 `BoxDecoration`，同时配置圆角 `Radius.circular(14)`，配合 `Sigma 10` 的高斯模糊图层实现通透毛玻璃质感，高度匹配 PC 端软件常规的操作感知。

---

## 2. 客户端日志管线拓展 (日志切分与管理通道)

### 背景问题

之前初步支持的磁盘日志是一股脑写在同一个 `launcher.log` 内进行堆积追加。除了占用逐渐膨胀以外，一旦有排错需求，去庞大的未结构化文件里翻寻对应时段日志形如大海捞针。且原设置页上没有直达此数据核心夹的跳转梯口，极大影响维护效率。

### 方案

升级 `BootstrapService` 中日志产出逻辑，启用轮转按日期分级记录机制。另在 UI 设置偏好处直接埋下与原生交互衔接的开口调用。

### 关键实现

#### 滚动日志落定 (`client/lib/services/bootstrap_service.dart`)

抛弃固定路径记录符，动态结合 `DateTime.now()` 获取当日标准时序（`yyyy-MM-dd`），确保新日志落位在 `launcher_xxx.log` 中。

#### 绑定前端配置挂载点 (`client/lib/screens/chat_screen.dart`)

基于在设置菜单里的补充布局代码：
```dart
ListTile(
  title: const Text('打开日志目录'),
  subtitle: Text(bootstrap.logDirectory),
  trailing: const Icon(Icons.folder_open),
  onTap: () => bootstrap.openLogDirectory(),
)
```
点击自动转调内置执行器唤出来属平台的文件管理系统。

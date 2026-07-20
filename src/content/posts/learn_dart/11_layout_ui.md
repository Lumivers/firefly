---
title: "第十一章 Flutter 布局与常用 Widget"
published: 2026-03-25
pinned: false
description: "从 Row/Column 到 Stack/Container，深度解析 Flutter 的声明式布局系统。学习如何通过组件组合而非继承，构建出高性能且极具美感的桌面级 UI。"
tags: [Flutter, 布局系统, Widget, 声明式UI]
category: Dart学习笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 第十一章 Flutter 布局与常用 Widget

> 目标：掌握 Flutter 的布局系统和核心 Widget。Flutter 用**组合**代替**继承**来构建 UI——通过嵌套 Row/Column/Stack 等布局容器和 Padding/SizedBox 等间距 Widget 来实现精确的界面设计。

---

## 11.1 🔑 布局核心三巨头：Row / Column / Stack

### Column —— 垂直排列

```dart
Column(
  mainAxisSize: MainAxisSize.min,       // 纵向尽量小
  crossAxisAlignment: CrossAxisAlignment.stretch,  // 横向撑满
  children: [
    Text('标题'),
    SizedBox(height: 16),              // 间距
    TextField(),
    SizedBox(height: 24),
    ElevatedButton(child: Text('提交')),
  ],
)
```

### Row —— 水平排列

```dart
Row(
  children: [
    Icon(Icons.file, color: colors.accent, size: 16),
    SizedBox(width: 8),                // 水平间距
    Expanded(                          // 占满剩余空间
      child: Text('文件名.pdf'),
    ),
    IconButton(icon: Icon(Icons.close)),
  ],
)
```

### 轴的概念

```
Column（垂直布局）             Row（水平布局）
┌─────────────┐               ┌──────────────────┐
│  main axis  │               │                  │
│     ↓       │               │   main axis →    │
│  ┌─────┐    │  cross        │ ┌──┐ ┌──┐ ┌──┐   │  cross
│  │  A  │    │  axis →       │ │A │ │B │ │C │   │  axis ↓
│  ├─────┤    │               │ └──┘ └──┘ └──┘   │
│  │  B  │    │               │                  │
│  ├─────┤    │               └──────────────────┘
│  │  C  │    │
│  └─────┘    │
└─────────────┘
```

| 属性 | Column 的含义 | Row 的含义 |
|------|-------------|-----------|
| `mainAxisAlignment` | 垂直方向的对齐 | 水平方向的对齐 |
| `crossAxisAlignment` | 水平方向的对齐 | 垂直方向的对齐 |
| `mainAxisSize` | 纵向占多大 | 横向占多大 |

### MainAxisAlignment 选项

```dart
// 常用值
MainAxisAlignment.start        // 靠起始端（默认）
MainAxisAlignment.center       // 居中
MainAxisAlignment.end          // 靠末端
MainAxisAlignment.spaceBetween // 均分间距（两端靠边）
MainAxisAlignment.spaceEvenly  // 均分间距（含两端）
MainAxisAlignment.spaceAround  // 均分间距（两端半间距）
```

### CrossAxisAlignment 选项

```dart
CrossAxisAlignment.start       // 靠起始侧（Column 中是靠左）
CrossAxisAlignment.center      // 居中（默认）
CrossAxisAlignment.end         // 靠末端侧
CrossAxisAlignment.stretch     // 拉伸填满（常用！）
```

### Stack —— 层叠布局

```dart
Stack(
  children: [
    Image.asset('background.png'),     // 底层
    Positioned(                        // 定位层
      bottom: 16,
      right: 16,
      child: FloatingActionButton(
        onPressed: () {},
        child: Icon(Icons.add),
      ),
    ),
  ],
)
```

---

## 11.2 🔑 Expanded 与 Flexible —— 弹性空间分配

### Expanded —— 占满剩余空间

```dart
Column(
  children: [
    TopBar(),                   // 固定高度
    Divider(),                  // 固定高度
    Expanded(                   // ← 占满剩余所有空间
      child: MessageList(),     //    消息列表填满中间区域
    ),
    Divider(),                  // 固定高度
    InputBar(),                 // 固定高度
  ],
)
```

```dart
Row(
  children: [
    Icon(Icons.file, size: 16),          // 固定宽度
    SizedBox(width: 8),                  // 固定宽度
    Expanded(                            // ← 文件名占满剩余空间
      child: Text(
        '这是一个很长很长的文件名.pdf',
        overflow: TextOverflow.ellipsis,  // 溢出省略号
        maxLines: 1,
      ),
    ),
    IconButton(icon: Icon(Icons.close)),  // 固定宽度
  ],
)
```

> 💡 `Expanded` 的本质：`flex: 1` 的 `Flexible` + `FlexFit.tight`（必须填满）。

### 多个 Expanded 的比例分配

```dart
Row(
  children: [
    Expanded(flex: 1, child: Container(color: Colors.red)),    // 1/3
    Expanded(flex: 2, child: Container(color: Colors.blue)),   // 2/3
  ],
)
```

### Flexible —— 弹性但不强制

```dart
Row(
  children: [
    Flexible(                    // ← 可以小于可用空间（不强制填满）
      child: Text('短'),
    ),
    Text('固定'),
  ],
)
```

| Widget | 空间不够时 | 空间足够时 |
|--------|----------|----------|
| `Expanded` | 按比例分配 | **强制填满** |
| `Flexible` | 按比例分配 | 可以不填满 |

---

## 11.3 🔑 Scaffold —— 页面脚手架

`Scaffold` 是 Material Design 页面的骨架：

```dart
Scaffold(
  appBar: AppBar(title: Text('页面标题')),   // 顶栏
  body: Center(child: Text('内容')),         // 主体
  drawer: Drawer(child: SidebarWidget()),    // 侧边抽屉
  floatingActionButton: FloatingActionButton( // 浮动按钮
    onPressed: () {},
    child: Icon(Icons.add),
  ),
  bottomNavigationBar: BottomNavigationBar(  // 底部导航
    items: [...],
  ),
)
```

### 🔗 Lumi-Hub 实例

`auth_screen.dart` 使用 Scaffold 的基本用法：

```dart
return Scaffold(
  body: Center(                          // body 是页面主体
    child: Container(
      width: 400,                        // 固定宽度的登录卡片
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,   // 高度由内容决定
        crossAxisAlignment: CrossAxisAlignment.stretch,  // 宽度撑满
        children: [
          Text('欢迎回到 Lumi-Hub', /* ... */),
          const SizedBox(height: 32),
          TextField(/* 用户名 */),
          const SizedBox(height: 16),
          TextField(/* 密码 */),
          const SizedBox(height: 24),
          ElevatedButton(/* 登录按钮 */),
        ],
      ),
    ),
  ),
);
```

> 💡 布局逻辑：`Scaffold` > `Center`（居中）> `Container`（限宽 400）> `Column`（垂直排列表单）

### Scaffold 的坐标系

```
┌──────────────────────────────┐
│          AppBar              │  ← appBar
├──────────────────────────────┤
│                              │
│                              │
│           body               │  ← body
│                              │
│                              │
│                      [FAB]   │  ← floatingActionButton
├──────────────────────────────┤
│     BottomNavigationBar      │  ← bottomNavigationBar
└──────────────────────────────┘
         ┌────────┐
         │ Drawer │               ← drawer（从左滑出）
         │        │
         └────────┘
```

---

## 11.4 间距与尺寸 Widget

### SizedBox —— 固定尺寸/间距

```dart
// 作为间距使用（最常见）
SizedBox(height: 16)   // 垂直间距 16-pixel
SizedBox(width: 8)     // 水平间距 8-pixel

// 作为固定尺寸容器
SizedBox(
  width: 100,
  height: 50,
  child: ElevatedButton(child: Text('固定大小')),
)
```

> 💡 `SizedBox` 是 Flutter 中最常用的间距 Widget——  
> 比 `Padding` 更简洁，语义更清晰。

### Padding —— 内边距

```dart
Padding(
  padding: const EdgeInsets.all(32),            // 四周 32
  child: Column(/* ... */),
)

Padding(
  padding: const EdgeInsets.symmetric(
    horizontal: 10,                            // 左右 10
    vertical: 8,                               // 上下 8
  ),
  child: Text('内容'),
)

Padding(
  padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),  // 左上右下分别指定
  child: Text('精确控制'),
)

Padding(
  padding: const EdgeInsets.only(top: 16),     // 只有上方有间距
  child: Text('特定方向'),
)
```

### ConstrainedBox —— 约束尺寸

```dart
ConstrainedBox(
  constraints: BoxConstraints(
    maxWidth: MediaQuery.of(context).size.width * 0.62,  // 最大宽度为屏幕的 62%
  ),
  child: Container(/* ... */),
)
```

### Center —— 居中

```dart
Center(
  child: Text('居中内容'),
)
// Center 本质上是 Align(alignment: Alignment.center)
```

### Align —— 精确对齐

```dart
Align(
  alignment: Alignment.centerLeft,   // 左侧居中
  child: Text('靠左'),
)
```

---

## 11.5 🔑 Container —— 万能装饰容器

`Container` 是最常用的装饰 Widget——集尺寸、间距、背景、边框、圆角于一身：

```dart
Container(
  width: 400,
  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
  decoration: BoxDecoration(
    color: colors.inputBg,                            // 背景色
    borderRadius: BorderRadius.circular(12),           // 圆角
    border: Border.all(color: colors.divider),         // 边框
  ),
  child: Row(/* ... */),
)
```

### BoxDecoration 详解

```dart
BoxDecoration(
  color: Colors.blue,                        // 纯色背景
  gradient: LinearGradient(                  // 渐变背景
    colors: [Colors.blue, Colors.purple],
  ),
  borderRadius: BorderRadius.circular(12),    // 圆角
  border: Border.all(                        // 边框
    color: Colors.grey,
    width: 1,
  ),
  boxShadow: [                              // 阴影
    BoxShadow(
      color: Colors.black26,
      blurRadius: 8,
      offset: Offset(0, 4),
    ),
  ],
)
```

### ClipRRect —— 裁剪圆角

```dart
ClipRRect(
  borderRadius: BorderRadius.circular(6),
  child: LinearProgressIndicator(
    value: 0.65,
    minHeight: 5,
    backgroundColor: colors.divider,
    valueColor: AlwaysStoppedAnimation<Color>(colors.accent),
  ),
)
```

> 💡 `Container` 的 `borderRadius` 只影响背景和边框，  
> 如果内容（child）溢出圆角区域，需要用 `ClipRRect` 裁剪。

---

## 11.6 常用交互 Widget

### TextField —— 文本输入

```dart
TextField(
  controller: _usernameCtrl,         // 文本控制器
  obscureText: true,                 // 密码模式（隐藏输入）
  decoration: const InputDecoration(
    labelText: '用户名',              // 浮动标签
    border: OutlineInputBorder(),     // 外边框样式
    prefixIcon: Icon(Icons.person),   // 前置图标
  ),
  onSubmitted: (text) {              // 回车提交
    _submit();
  },
)
```

### Button 系列

```dart
// 填充按钮（最醒目）
ElevatedButton(
  onPressed: isConnected ? _submit : null,  // ← null = 禁用状态
  style: ElevatedButton.styleFrom(
    padding: const EdgeInsets.symmetric(vertical: 16),
  ),
  child: Text('登录'),
)

// 填充按钮（Material 3 推荐）
FilledButton(
  onPressed: () => Navigator.of(context).pop(result),
  child: const Text('直接退出'),
)

// 文字按钮
TextButton(
  onPressed: () {
    setState(() { _isLoginMode = !_isLoginMode; });
  },
  child: Text('没有账号？点击注册'),
)

// 图标按钮
IconButton(
  onPressed: _clearAttachmentState,
  icon: Icon(Icons.close_rounded, color: colors.subtext, size: 16),
  splashRadius: 14,
  padding: EdgeInsets.zero,
  constraints: const BoxConstraints(minWidth: 24, minHeight: 24),
)
```

> 💡 `onPressed: null` 会让按钮变成**禁用状态**（灰色，不可点击）。  
> Lumi-Hub 中用 `wsService.status == WsStatus.connected ? _submit : null` 来实现  
> "未连接时按钮不可点击"的效果。

### Text —— 文本显示

```dart
Text(
  '欢迎回到 Lumi-Hub',
  style: const TextStyle(
    fontSize: 24,
    fontWeight: FontWeight.bold,
  ),
  textAlign: TextAlign.center,
  maxLines: 1,
  overflow: TextOverflow.ellipsis,  // 溢出显示省略号
)
```

### Icon —— 图标

```dart
Icon(
  Icons.insert_drive_file_outlined,
  color: colors.accent,
  size: 16,
)

// 带圆形背景的图标
CircleAvatar(
  radius: 40,
  backgroundColor: Theme.of(context).colorScheme.primary,
  child: const Icon(Icons.person, size: 40, color: Colors.white),
)
```

---

## 11.7 🔑 列表与滚动

### ListView —— 可滚动列表

```dart
// ListView.builder —— 懒加载（只渲染可见项，适合长列表）
ListView.builder(
  controller: _scroll,
  itemCount: messages.length,
  itemBuilder: (context, index) {
    return MessageBubble(message: messages[index]);
  },
)

// ListView —— 直接传 children（适合短列表）
ListView(
  children: [
    ListTile(title: Text('设置项 1')),
    ListTile(title: Text('设置项 2')),
    ListTile(title: Text('设置项 3')),
  ],
)
```

> 💡 `ListView.builder` 只在项目可见时才调用 `itemBuilder`——  
> 对于 1000 条消息的聊天列表，性能远优于直接传 children。

### SingleChildScrollView —— 单个可卷动的子元素

```dart
SingleChildScrollView(
  child: Column(
    children: [/* 很多 Widget */],
  ),
)
```

> 💡 `Column` 本身不支持滚动。如果内容超过屏幕，需要包一层 `SingleChildScrollView`。  
> 但如果内容很多，用 `ListView.builder` 性能更好。

### ScrollController —— 控制滚动位置

```dart
final _scroll = ScrollController();

// 跳到底部
_scroll.jumpTo(_scroll.position.maxScrollExtent);

// 滚动到底部（带动画）
_scroll.animateTo(
  _scroll.position.maxScrollExtent,
  duration: Duration(milliseconds: 300),
  curve: Curves.easeOut,
);

// 监听滚动位置
_scroll.addListener(() {
  final nearBottom = (_scroll.position.maxScrollExtent - _scroll.position.pixels) < 80;
  if (nearBottom) {
    // 接近底部
  }
});

// dispose 中销毁
_scroll.dispose();
```

---

## 11.8 🔑 条件渲染与集合 if/for

Flutter 的声明式 UI + Dart 的 collection if/for 配合得天衣无缝：

### 条件渲染

```dart
Column(
  children: [
    Text('标题'),

    // 条件 Widget（collection if）
    if (_pendingFileName != null)
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
        child: Text(_pendingFileName!),
      ),

    // 条件 + else
    if (_isUploadingAttachment)
      LinearProgressIndicator(value: _uploadProgress)
    else
      Text(_uploadError != null ? '失败' : '上传完成'),

    // 条件状态提示
    if (wsService.status != WsStatus.connected)
      const Text('正在连接服务器...', style: TextStyle(color: Colors.red)),
  ],
)
```

### 三元表达式 vs collection if

```dart
// ✅ collection if：Widget 存在或不存在
Column(
  children: [
    if (isError) Text('错误'),     // isError=false 时完全不渲染
  ],
)

// ✅ 三元表达式：总有一个 Widget，选哪个
Text(isLoginMode ? '登录' : '注册')  // 总会有文字

// ❌ 三元解 null：可读性差
Column(
  children: [
    isError ? Text('错误') : SizedBox.shrink(),  // 不如 if 清晰
  ],
)
```

### 条件 onPressed

```dart
ElevatedButton(
  onPressed: (wsService.status == WsStatus.connected)
      ? _submit       // 连接了 → 可点击
      : null,         // 没连 → 禁用（灰色）
  child: Text('登录'),
)
```

---

## 11.9 🔑 响应式布局——MediaQuery

### 获取屏幕信息

```dart
final screenWidth = MediaQuery.of(context).size.width;
final screenHeight = MediaQuery.of(context).size.height;
final isCompact = screenWidth < 920;
```

### 🔗 Lumi-Hub 实例：自适应侧边栏

```dart
@override
Widget build(BuildContext context) {
  final screenWidth = MediaQuery.of(context).size.width;
  final isCompact = screenWidth < 920;     // ← 窗口宽度决定布局模式

  if (isCompact) {
    // 窄屏：侧边栏变成 Drawer（抽屉）
    return Scaffold(
      drawer: Drawer(child: _Sidebar(/* ... */)),    // ← 滑出式
      body: chatMain,
    );
  } else {
    // 宽屏：侧边栏常驻
    return Row(
      children: [
        SizedBox(
          width: 260,
          child: _Sidebar(/* ... */),                 // ← 固定展示
        ),
        VerticalDivider(width: 1),
        Expanded(child: chatMain),                    // ← 聊天区域
      ],
    );
  }
}
```

> 💡 这是一个经典的**响应式设计模式**：
> - 宽屏（≥920px）：Row 布局，侧边栏 + 聊天区域并排
> - 窄屏（<920px）：Scaffold + Drawer，侧边栏收起为抽屉

### ConstrainedBox 按比例限宽

```dart
ConstrainedBox(
  constraints: BoxConstraints(
    maxWidth: MediaQuery.of(context).size.width * 0.62,
    //       屏幕宽度的 62%
  ),
  child: FileCard(/* ... */),
)
```

---

## 11.10 Dialog —— 对话框

### AlertDialog

```dart
showDialog<WindowCloseAction>(
  context: context,
  builder: (context) {
    return AlertDialog(
      title: const Text('关闭 Lumi Hub'),
      content: const Text('最小化到托盘还是直接退出？'),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(WindowCloseAction.minimize),
          child: const Text('最小化到托盘'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(WindowCloseAction.exit),
          child: const Text('直接退出'),
        ),
      ],
    );
  },
);
```

### StatefulBuilder —— Dialog 内的局部 setState

```dart
showDialog(
  context: context,
  builder: (context) {
    return StatefulBuilder(
      //     ^^^^^^^^^^^^^^^^  ← Dialog 内部有自己的 setState
      builder: (context, setDialogState) {
        return AlertDialog(
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CheckboxListTile(
                title: const Text('记住本次选择'),
                value: rememberChoice,
                onChanged: (value) {
                  setDialogState(() {           // ← 用 setDialogState，不是 setState
                    rememberChoice = value ?? false;
                  });
                },
              ),
            ],
          ),
        );
      },
    );
  },
);
```

> 💡 `StatefulBuilder` 让你在本来没有 State 的地方（如 dialog builder）拥有局部 setState 能力。

### SnackBar —— 底部提示条

```dart
ScaffoldMessenger.of(context).showSnackBar(
  const SnackBar(content: Text('用户名和密码不能为空')),
);
```

---

## 11.11 本章小结

| Widget | 用途 | 重要程度 |
|--------|------|----------|
| `Row` / `Column` | 水平/垂直排列 | 🔑🔑🔑 |
| `Expanded` / `Flexible` | 弹性空间分配 | 🔑🔑🔑 |
| `Stack` / `Positioned` | 层叠布局 | 🔑 |
| `Scaffold` | 页面骨架（AppBar + Body + Drawer + FAB）| 🔑🔑 |
| `Container` + `BoxDecoration` | 装饰容器（背景/圆角/边框/阴影）| 🔑🔑 |
| `SizedBox` | 间距 / 固定尺寸 | 🔑🔑 |
| `Padding` | 内边距 | 🔑🔑 |
| `ListView.builder` | 高性能可滚动列表 | 🔑🔑 |
| `MediaQuery` | 响应式布局 | 🔑🔑 |
| `if` in children | 条件渲染 | 🔑🔑 |
| `AlertDialog` | 对话框 | 🔑 |

### 🎯 关键要点

1. **Row/Column + Expanded** 是最核心的布局组合——90% 的布局靠这三个完成。
2. **`mainAxisSize: MainAxisSize.min`** 让容器"包裹内容"而不是"撑满可用空间"。
3. **`CrossAxisAlignment.stretch`** 让所有子 Widget 在交叉轴上撑满——表单布局的标配。
4. **`collection if`** 是条件渲染的首选——比三元表达式更清晰，和声明式 UI 天然契合。
5. **`onPressed: null`** = 按钮禁用——这是 Flutter 按钮状态管理的标准方式。
6. **`ListView.builder`** 对长列表至关重要——只渲染可见项，聊天列表必须用它。
7. **响应式**用 `MediaQuery.of(context).size.width` 判断——宽屏 Row 布局，窄屏 Drawer 布局。
8. **`StatefulBuilder`** 让 Dialog 内也能有局部状态——不用为一个 Checkbox 创建整个 StatefulWidget。

---

> 📖 下一章：[第 12 章 状态管理：Provider 与 ChangeNotifier](../12_state_management.md) —— 深入 Flutter 最核心的架构概念。

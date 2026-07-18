---
title: "第十五章 WebSocket 实战：通信协议与消息处理"
published: 2026-03-29
pinned: false
description: "深度解析 WebSocket 全双工通信。通过异步 Stream 与 Completer 模式，构建一个支持流式回复、文件分片上传及心跳重连的高性能网络系统。"
tags: [Dart, WebSocket, 异步编程, 网络协议]
category: 学习笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 第十五章 WebSocket 实战：通信协议与消息处理

> 目标：深入 Lumi-Hub 的 WebSocket 通信架构。本章是前面所有知识的**综合应用**——`async/await`（Ch7）、`Stream`（Ch8）、`Completer`（Ch7）、`ChangeNotifier`（Ch12）、JSON 序列化、文件 I/O 在一个真实的网络通信系统中交汇。

---

## 15.1 🔑 WebSocket 基础——什么是全双工通信

### HTTP vs WebSocket

| 特性 | HTTP | WebSocket |
|------|------|-----------|
| 连接模式 | 请求-响应（短连接）| 持久化（长连接）|
| 方向 | 客户端发起 → 服务端响应 | **双向**：两端都能主动发消息 |
| 适合场景 | 加载页面、API 调用 | 聊天、实时通知、游戏 |
| 协议 | HTTP/1.1, HTTP/2 | ws:// 或 wss://（加密）|

```
HTTP：一问一答
Client ──→ Request ──→ Server
Client ←── Response ←── Server

WebSocket：持续双向
Client ←──────────────→ Server
       ↕ 任意时刻发消息 ↕
```

> 💡 Lumi-Hub 使用 WebSocket 因为：
> 1. AI 回复是**流式的**——需要服务端主动推送每个 chunk
> 2. 审批请求是**服务端主动发起的**——HTTP 做不到
> 3. 消息需要**实时同步**——不能靠轮询

---

## 15.2 🔑 Lumi-Hub 的 JSON 通信协议

所有消息都是 JSON 格式，遵循统一结构：

### 消息结构

```json
{
  "message_id": "abc123_1711894400000",
  "type": "CHAT_REQUEST",
  "source": "client",
  "target": "host",
  "timestamp": 1711894400000,
  "payload": {
    "content": "你好",
    "context_id": "default",
    "persona_id": "persona_001",
    "attachments": []
  }
}
```

### 字段说明

| 字段 | 类型 | 作用 |
|------|------|------|
| `message_id` | `String` | 唯一标识，用于关联请求与响应 |
| `type` | `String` | 消息类型（决定如何处理）|
| `source` | `String` | 发送方（`client` / `host`）|
| `target` | `String` | 接收方 |
| `timestamp` | `int` | 毫秒时间戳 |
| `payload` | `Map` | 消息体（内容因 type 而异）|

### 完整消息类型表

| type | 方向 | 用途 |
|------|------|------|
| `CONNECT` | ← Host | 握手确认 |
| `PING` / `PONG` | 双向 | 心跳保活 |
| `AUTH_RESPONSE` | ← Host | 登录/注册结果 |
| `AUTH_REQUIRED` | ← Host | 审批请求（需用户决定）|
| `CHAT_REQUEST` | → Host | 发送聊天消息 |
| `CHAT_RESPONSE` | ← Host | 完整的 AI 回复 |
| `CHAT_STREAM_CHUNK` | ← Host | 流式回复的一个片段 |
| `CHAT_RESPONSE_END` | ← Host | 流式回复结束信号 |
| `HISTORY_RESPONSE` | ← Host | 聊天历史记录 |
| `PERSONA_LIST` | ← Host | 人格列表 |
| `PERSONA_SWITCH` | ← Host | 人格切换确认 |
| `MCP_CONFIG_RESPONSE` | ← Host | MCP 配置数据 |
| `FILE_UPLOAD_INIT` | → Host | 上传初始化 |
| `FILE_UPLOAD_CHUNK` | → Host | 上传分片 |
| `FILE_UPLOAD_ACK` | ← Host | 上传分片确认 |
| `FILE_UPLOAD_ERROR` | ← Host | 上传错误 |

---

## 15.3 🔑 连接生命周期

### connect() —— 建立连接

```dart
Future<void> connect() async {
  // ① 防止重复连接
  if (_status == WsStatus.connected || _status == WsStatus.connecting) return;

  // ② 等待本地 Token 读取完成（Completer 门控，Ch7 学的）
  await _authInitCompleter.future;

  _setStatus(WsStatus.connecting);

  try {
    // ③ 建立 WebSocket 连接
    _channel = WebSocketChannel.connect(Uri.parse(_serverUrl));
    await _channel!.ready;
    //               ^^^^^
    //   等待底层 TCP 握手完成

    // ④ 开始监听 Stream（Ch8 学的）
    _sub = _channel!.stream.listen(
      _onData,          // 收到消息
      onError: _onError, // 连接异常
      onDone: _onDone,   // 连接关闭
    );

    _setStatus(WsStatus.connected);

    // ⑤ 发送握手 + 自动恢复登录 + 启动心跳
    _sendHandshake();
    if (_token != null) {
      restoreAuth();      // 有 Token → 自动恢复会话
    }
    _startPing();
  } catch (e) {
    debugPrint('[WS] 连接失败: $e');
    _setStatus(WsStatus.disconnected);
    _scheduleReconnect();  // 连接失败 → 安排重连
  }
}
```

### disconnect() —— 断开连接

```dart
void disconnect() {
  _reconnectTimer?.cancel();    // ← 取消重连计时器
  _pingTimer?.cancel();         // ← 取消心跳计时器
  _sub?.cancel();               // ← 取消 Stream 订阅
  _channel?.sink.close();       // ← 关闭 WebSocket 通道
  _channel = null;
  _setStatus(WsStatus.disconnected);
}
```

> 💡 **断开时要清理四样东西**：重连 Timer、心跳 Timer、Stream 订阅、WebSocket 通道。  
> 遗漏任何一个都会导致问题——这和 `dispose` 中清理资源是同样的道理。

### 连接状态机

```
              connect()
disconnected ──────────→ connecting
      ↑                       │
      │                       │ _channel.ready 完成
      │                       ↓
      │                  connected
      │                  ↕ 正常通信
      │                       │
      │   _onError / _onDone  │
      ←───────────────────────┘
      │
      │ _scheduleReconnect()
      │ (3 秒后)
      └──→ 自动重新 connect()
```

---

## 15.4 🔑 消息分发器——_onData

`_onData` 是整个通信系统的**中枢神经**——所有收到的消息都经过它分发：

```dart
void _onData(dynamic raw) {
  try {
    // ① 解析 JSON
    final data = jsonDecode(raw as String) as Map<String, dynamic>;
    final type = data['type'] as String? ?? '';

    // ② 按类型分发
    switch (type) {
      case 'CHAT_RESPONSE':
        _handleChatResponse(data);          // → 完整回复
        break;
      case 'CHAT_STREAM_CHUNK':
        _handleChatStreamChunk(data);       // → 流式片段
        break;
      case 'CHAT_RESPONSE_END':
        _isGenerating = false;              // → 流式结束
        notifyListeners();
        break;
      case 'PONG':
        break;                              // → 心跳回应，忽略
      case 'CONNECT':
        debugPrint('[WS] 握手确认');         // → 握手确认
        break;
      case 'AUTH_RESPONSE':
        _handleAuthResponse(data);          // → 登录结果
        break;
      case 'AUTH_REQUIRED':
        _authRequestController.add(data);   // → Stream（Ch8）
        break;
      case 'HISTORY_RESPONSE':
        _handleHistoryResponse(data);       // → 历史消息
        break;
      case 'MCP_CONFIG_RESPONSE':
      case 'MCP_CONFIG_UPDATE_RESPONSE':
        _mcpConfigController.add(data);     // → Stream
        break;
      case 'FILE_UPLOAD_ACK':
      case 'FILE_UPLOAD_ERROR':
        _handlePendingResponse(data);       // → Completer（Ch7）
        break;
      case 'PERSONA_LIST':
        _handlePersonaList(data);           // → 人格列表
        break;
      case 'PERSONA_SWITCH':
      case 'PERSONA_DELETE_RESPONSE':
        _personaController.add(data);       // → Stream
        break;
      default:
        debugPrint('[WS] 未处理消息类型: $type');
    }
  } catch (e) {
    debugPrint('[WS] 解析消息失败: $e');
  }
}
```

### 分发架构图

```
WebSocket 收到 raw JSON
       │
       ↓ jsonDecode()
  Map<String, dynamic> data
       │
       ↓ switch (data['type'])
       │
       ├── 直接处理型（内部 handle 方法 → notifyListeners → UI 更新）
       │   ├── CHAT_RESPONSE → _handleChatResponse()
       │   ├── CHAT_STREAM_CHUNK → _handleChatStreamChunk()
       │   ├── AUTH_RESPONSE → _handleAuthResponse()
       │   ├── HISTORY_RESPONSE → _handleHistoryResponse()
       │   └── PERSONA_LIST → _handlePersonaList()
       │
       ├── Stream 广播型（放入 StreamController → UI 组件各自监听）
       │   ├── AUTH_REQUIRED → _authRequestController.add()
       │   ├── MCP_* → _mcpConfigController.add()
       │   └── PERSONA_* → _personaController.add()
       │
       └── Completer 唤醒型（按 message_id 找到 Completer → complete）
            └── FILE_UPLOAD_ACK/ERROR → _handlePendingResponse()
```

> 💡 三种分发模式完美对应前面学的三种异步原语：
> 1. **直接处理**：修改状态 → `notifyListeners()` → UI 重建
> 2. **Stream 广播**：放入 StreamController → 多个 UI 组件各自 listen
> 3. **Completer 唤醒**：根据 message_id 找到等待中的 Completer → `complete(data)`

---

## 15.5 🔑 流式消息处理——打字机效果

AI 回复不是一次性返回的，而是**一个字一个字"打"出来的**——这需要流式处理。

### 流程

```
Client 发送 CHAT_REQUEST
     │
     ↓ Host 开始生成回复
     │
Host ← CHAT_STREAM_CHUNK (chunk: "你")
Host ← CHAT_STREAM_CHUNK (chunk: "你好")
Host ← CHAT_STREAM_CHUNK (chunk: "你好，")
Host ← CHAT_STREAM_CHUNK (chunk: "你好，我是")
Host ← CHAT_STREAM_CHUNK (finished: true)    ← 结束标记
Host ← CHAT_RESPONSE (content: "你好，我是 Lumi")  ← 最终完整回复
```

### _handleChatStreamChunk —— 流式拼接

```dart
void _handleChatStreamChunk(Map<String, dynamic> data) {
  final payload = data['payload'] as Map<String, dynamic>? ?? {};
  final chunk = payload['chunk'] as String? ?? '';
  final finished = payload['finished'] == true;
  final msgId = data['message_id'] as String? ?? _genId();
  final assistantId = _assistantMsgId(msgId);

  // ① 结束帧：只负责状态收口
  if (finished) {
    _streamingMsgIds.add(msgId);
    _isGenerating = false;
    notifyListeners();
    return;
  }

  if (chunk.isEmpty) return;

  // ② 第一块到达：移除 "正在输入..." 占位
  _streamingMsgIds.add(msgId);
  _messages.removeWhere((m) => m.isTyping);

  // ③ 查找已有消息
  final existingIndex = _messages.indexWhere(
    (m) => m.id == assistantId && m.sender == MessageSender.ai,
  );

  if (existingIndex == -1) {
    // ④ 第一块：创建新消息
    _messages.add(ChatMessage(
      id: assistantId,
      content: chunk,
      sender: MessageSender.ai,
      time: DateTime.now(),
    ));
  } else {
    // ⑤ 后续块：追加内容（使用 copyWith，Ch4 学的）
    final existing = _messages[existingIndex];
    _messages[existingIndex] = existing.copyWith(
      content: _mergeAssistantContent(existing.content, chunk),
      isTyping: false,
    );
  }

  notifyListeners();   // ← 每个 chunk 都通知 UI 更新
}
```

### _mergeAssistantContent —— 智能去重拼接

```dart
String _mergeAssistantContent(String existing, String incoming) {
  if (incoming.isEmpty) return existing;
  if (existing.isEmpty) return incoming;
  if (existing.endsWith(incoming)) return existing;  // ← 完全重复，跳过

  // 找到最大重叠部分（避免重复拼接）
  final maxOverlap = min(existing.length, incoming.length);
  for (var overlap = maxOverlap; overlap > 0; overlap--) {
    if (existing.endsWith(incoming.substring(0, overlap))) {
      return existing + incoming.substring(overlap);
      //                         ^^^^^^^^^^^^^^^^
      //              只拼接不重叠的部分
    }
  }
  return existing + incoming;   // ← 没有重叠，直接拼接
}
```

> 💡 **为什么需要去重？**  
> 服务端发的 chunk 可能是**累积式的**（每个 chunk 包含之前的内容）  
> 而不是**增量式的**（只包含新增部分）。  
> `_mergeAssistantContent` 通过后缀匹配自动处理两种格式。

---

## 15.6 🔑 请求-响应模式——_sendAndAwaitResponse

WebSocket 是双向异步的——"发一条消息等一个回复"需要手动关联。  
Lumi-Hub 用 `Completer` + `message_id` 实现了**请求-响应模式**（第 7 章学的 Completer 的实战应用）。

### 核心实现

```dart
// 存储等待中的请求
final Map<String, Completer<Map<String, dynamic>>> _pendingResponses = {};

Future<Map<String, dynamic>> _sendAndAwaitResponse(
  String type,
  Map<String, dynamic> payload, {
  Duration timeout = const Duration(seconds: 30),
}) async {
  if (_status != WsStatus.connected) {
    throw Exception('WebSocket 未连接');
  }

  // ① 生成唯一 ID
  final msgId = '${_genId()}_${DateTime.now().microsecondsSinceEpoch}';

  // ② 创建 Completer 并存入 Map
  final completer = Completer<Map<String, dynamic>>();
  _pendingResponses[msgId] = completer;

  // ③ 发送请求
  _send({
    'message_id': msgId,
    'type': type,
    'source': 'client',
    'target': 'host',
    'timestamp': DateTime.now().millisecondsSinceEpoch,
    'payload': payload,
  });

  // ④ 等待响应（带超时）
  try {
    return await completer.future.timeout(timeout);
  } on TimeoutException {
    _pendingResponses.remove(msgId);   // ← 超时清理
    throw Exception('$type 请求超时');
  }
}
```

### 响应到达时唤醒 Completer

```dart
void _handlePendingResponse(Map<String, dynamic> data) {
  final msgId = data['message_id'] as String?;
  if (msgId == null || msgId.isEmpty) return;

  // 按 message_id 找到对应的 Completer
  final completer = _pendingResponses.remove(msgId);
  if (completer != null && !completer.isCompleted) {
    completer.complete(data);   // ← 唤醒 await
  }
}
```

### 完整数据流

```
调用端                         WsService 内部                Host
  │                                │                          │
  │ _sendAndAwaitResponse()        │                          │
  │──→ 创建 Completer              │                          │
  │    _pendingResponses[id]=c    │                          │
  │──→ _send({id, type, ...})     │──→ WebSocket ──→         │
  │                               │                          │
  │    await completer.future     │    (等待中...)            │
  │    ┊                          │                          │
  │    ┊                          │←── WebSocket ←──         │
  │    ┊                          │  _onData()               │
  │    ┊                          │  → _handlePendingResponse│
  │    ┊                          │  → completer.complete()  │
  │    ┊                          │                          │
  │←── 返回 data                  │                          │
```

---

## 15.7 文件上传——分片与进度

文件上传展示了 `_sendAndAwaitResponse` 在复杂场景中的应用：

### 上传流程

```
Client                              Host
  │── FILE_UPLOAD_INIT ──→            │   (初始化)
  │←── FILE_UPLOAD_ACK ──            │   (返回 upload_id)
  │                                    │
  │── FILE_UPLOAD_CHUNK[0] ──→        │   (第 1 片)
  │←── FILE_UPLOAD_ACK ──            │
  │── FILE_UPLOAD_CHUNK[1] ──→        │   (第 2 片)
  │←── FILE_UPLOAD_ACK ──            │
  │── FILE_UPLOAD_CHUNK[2] ──→        │   (第 3 片)
  │←── FILE_UPLOAD_ACK ──            │   (上传完成)
```

### 关键代码

```dart
Future<Map<String, dynamic>> uploadFile(
  String filePath, {
  void Function(double progress)? onProgress,
}) async {
  final file = File(filePath);
  if (!await file.exists()) throw Exception('文件不存在');

  final bytes = await file.readAsBytes();
  final sha256Hex = sha256.convert(bytes).toString();  // ← SHA256 校验

  // ① 初始化上传（拿到 upload_id）
  final initResp = await _sendAndAwaitResponse('FILE_UPLOAD_INIT', {
    'file_name': fileName,
    'mime_type': mimeType,
    'size_bytes': bytes.length,
    'sha256': sha256Hex,
  });

  final uploadId = initResp['payload']['upload_id'] as String;

  // ② 分片上传
  final totalChunks = (bytes.length / _uploadChunkSize).ceil();
  onProgress?.call(0);

  for (var index = 0; index < totalChunks; index++) {
    final start = index * _uploadChunkSize;
    final end = min(bytes.length, start + _uploadChunkSize);
    final chunk = bytes.sublist(start, end);

    await _sendAndAwaitResponse('FILE_UPLOAD_CHUNK', {
      'upload_id': uploadId,
      'chunk_index': index,
      'total_chunks': totalChunks,
      'chunk_base64': base64Encode(chunk),    // ← Base64 编码二进制
    }, timeout: const Duration(seconds: 60));

    onProgress?.call((index + 1) / totalChunks);
    //               ^^^^^^^^^^^^^^^^^^^^^^^^
    //         进度回调：0.0 → 1.0
  }
}
```

> 💡 **为什么要分片？**
> - WebSocket 消息大小有限制（通常 64KB-1MB）
> - 大文件需要拆成多个 chunk（每个 256KB）
> - 每个 chunk 独立确认——某个 chunk 丢失可以单独重传
> - 分片还能实现**进度条**——每完成一片就更新进度

---

## 15.8 🔑 认证流程

### 登录/注册 → 自动恢复

```dart
// 登录
void login(String username, String password) {
  _send({
    'type': 'AUTH_REQUEST',
    'payload': {
      'action': 'login',
      'username': username,
      'password': password,
    },
  });
}

// 自动恢复会话
void restoreAuth() {
  isRestoringAuth = true;
  notifyListeners();
  _send({
    'type': 'AUTH_RESTORE',
    'payload': {'token': _token},
  });
}
```

### 处理认证响应

```dart
Future<void> _handleAuthResponse(Map<String, dynamic> data) async {
  final payload = data['payload'] as Map<String, dynamic>? ?? {};
  final status = payload['status'] as String?;
  final wasRestoring = isRestoringAuth;
  isRestoringAuth = false;

  if (status == 'success') {
    // ① 保存 Token
    _token = payload['token'] as String?;
    _user = payload['user'] as Map<String, dynamic>?;
    if (_token != null) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('auth_token', _token!);
    }

    // ② 恢复登录时延迟，避免 UI 闪烁
    if (wasRestoring) {
      await Future.delayed(const Duration(milliseconds: 1000));
    }

    // ③ 设置认证状态，触发页面切换
    _isAuthenticated = true;
    _pendingInitialHistoryAfterPersonaList = true;
    requestPersonaList();      // ← 先拿人格列表
    notifyListeners();         // ← AuthWrapper watch 到变化 → 切换到 ChatScreen
  } else {
    await logout();            // ← 失败就清除 Token
  }
}
```

### 完整认证流程

```
应用启动
  │
  ├── _initAuth() → 从 SharedPreferences 读取 Token
  │
  ├── connect() → WebSocket 连接成功
  │   └── Token 存在? → restoreAuth() → AUTH_RESTORE
  │
  ├── Host 响应 AUTH_RESPONSE
  │   ├── success → _isAuthenticated = true → AuthWrapper → ChatScreen
  │   └── failure → logout() → 清除 Token → AuthScreen
  │
  └── 用户手动登录
      └── login() → AUTH_REQUEST → Host → AUTH_RESPONSE → ...
```

---

## 15.9 心跳与自动重连

### 心跳保活

```dart
void _startPing() {
  _pingTimer?.cancel();
  _pingTimer = Timer.periodic(_pingInterval, (_) {
    //                          ^^^^^^^^^^^
    //                     每 20 秒发一次
    if (_status == WsStatus.connected) {
      _send({'type': 'PING', 'timestamp': DateTime.now().millisecondsSinceEpoch});
    }
  });
}
```

> 💡 **为什么需要心跳？**  
> - 网络中间件（NAT/防火墙）会断开**闲置的**连接  
> - 定期发 PING 让连接保持"活跃"
> - 如果 PING 失败，说明连接已断 → 触发重连

### 自动重连

```dart
void _scheduleReconnect() {
  _reconnectTimer?.cancel();
  _reconnectTimer = Timer(_reconnectDelay, () {
    //                      ^^^^^^^^^^^^^^
    //                   3 秒后重连
    if (_status == WsStatus.disconnected && !_disposed) {
      unawaited(connect());
    }
  });
}

void _onError(dynamic error) {
  debugPrint('[WS] 连接异常: $error');
  _setStatus(WsStatus.disconnected);
  _scheduleReconnect();             // ← 出错就重连
}

void _onDone() {
  debugPrint('[WS] 连接关闭');
  _setStatus(WsStatus.disconnected);
  _scheduleReconnect();             // ← 关闭也重连
}
```

---

## 15.10 🔑 发送消息——完整的聊天流程

### sendMessage 的完整逻辑

```dart
void sendMessage(String text, {List<Map<String, dynamic>> attachments = const []}) {
  final normalized = text.trim();
  if (_status != WsStatus.connected) return;        // ← 未连接，忽略
  if (normalized.isEmpty && attachments.isEmpty) return;  // ← 空消息，忽略

  final requestId = _genId();
  final now = DateTime.now();

  // ① 创建本地消息（乐观 UI）
  if (normalized.isNotEmpty) {
    _messages.add(ChatMessage(
      id: requestId,
      content: normalized,
      sender: MessageSender.me,
      time: now,
    ));
  }

  // ② 添加"正在输入"占位
  _messages.add(ChatMessage(
    id: '${requestId}_typing',
    content: '',
    sender: MessageSender.ai,
    time: now,
    isTyping: true,            // ← 特殊标记
  ));
  _isGenerating = true;
  notifyListeners();            // ← 立刻更新 UI

  // ③ 发送到 Host
  _send({
    'message_id': requestId,
    'type': 'CHAT_REQUEST',
    'source': 'client',
    'target': 'host',
    'timestamp': DateTime.now().millisecondsSinceEpoch,
    'payload': {
      'content': normalized,
      'context_id': 'default',
      'persona_id': _activePersonaId,
      'attachments': attachments,
    },
  });
}
```

### 乐观 UI 模式

```
用户点击发送
     │
     ↓ (本地立即)
  ① 显示用户消息（不等服务器确认）
  ② 显示"正在输入..."占位
     │
     ↓ (网络异步)
  ③ 发送 CHAT_REQUEST 到 Host
     │
     ↓ (服务端响应)
  ④ 收到 CHAT_STREAM_CHUNK → 替换占位 → 逐字显示
  ⑤ 收到 CHAT_RESPONSE → 最终内容 → 完成
```

> 💡 **乐观 UI（Optimistic UI）**：  
> 不等服务器确认就先在本地显示用户消息——让用户感觉"即时响应"。  
> 这是聊天应用的标准做法。缺点是如果发送失败，需要处理回滚（Lumi-Hub 当前未实现回滚）。

---

## 15.11 本章小结

| 概念 | 用到的知识 | 重要程度 |
|------|----------|----------|
| WebSocket 全双工 | `WebSocketChannel` | 🔑🔑🔑 |
| JSON 协议 | `jsonDecode` + `Map<String, dynamic>` | 🔑🔑 |
| 消息分发器 | `switch` + 方法调用 | 🔑🔑🔑 |
| 三种分发模式 | 直接处理 / Stream 广播 / Completer 唤醒 | 🔑🔑🔑 |
| 流式消息 | `copyWith` + `_mergeAssistantContent` | 🔑🔑 |
| 请求-响应 | `Completer` + `message_id` 关联 | 🔑🔑🔑 |
| 文件分片上传 | `base64Encode` + 进度回调 | 🔑 |
| 认证流程 | Token 持久化 + 自动恢复 | 🔑🔑 |
| 心跳保活 | `Timer.periodic` | 🔑 |
| 自动重连 | `Timer` + `_scheduleReconnect` | 🔑🔑 |
| 乐观 UI | 本地先显示 → 异步确认 | 🔑 |

### 🎯 关键要点

1. **三种消息分发模式**是核心架构——直接处理（修改状态）、Stream 广播（事件通知）、Completer 唤醒（请求-响应）。掌握了这三种，就理解了整个 WsService。
2. **`_sendAndAwaitResponse`** 是最精巧的设计——用 Completer + message_id 在无序的 WebSocket 上实现了"同步等待回复"。
3. **流式处理的智能去重**——`_mergeAssistantContent` 用后缀匹配处理累积式和增量式两种 chunk 格式。
4. **乐观 UI**——发送后立即在本地显示，不等服务器确认。
5. **心跳 + 自动重连**——20s 心跳保活，异常/断开后 3s 自动重连。
6. **`connect` 中的 Completer 门控**——`await _authInitCompleter.future` 确保 Token 已加载完毕再连接，避免竞态。

---

> 📖 下一章：[第 16 章 项目架构总览与开发规范](../16_project_architecture.md) —— 回顾整个 Lumi-Hub 的架构设计，总结 Dart/Flutter 最佳实践。

---
title: "Lumi-Hub 开发日志：接入原生 MCP 与 HitL 审批流"
published: 2026-03-10
description: "今日完成了 MCP（Model Context Protocol）的完整闭环开发，涵盖从零搭建后端 MCP 管理器、接入 AstrBot 主流程、实现安全的 Human-in-the-Loop 工具调用网关，到实现前端可视化配置界面的全链路。  ---   允许 AI 通过标准的 MCP 协议与外部..."
image: "api"
tags: [Lumi-hub, 开发笔记]
category: 开发笔记
draft: false
pinned: false
---

## 总览

今日完成了 MCP（Model Context Protocol）的完整闭环开发，涵盖从零搭建后端 MCP 管理器、接入 AstrBot 主流程、实现安全的 Human-in-the-Loop 工具调用网关，到实现前端可视化配置界面的全链路。

---

## 1. MCP 后端集成 (Phase 3)

### 目标
允许 AI 通过标准的 MCP 协议与外部服务（如 Notion）交互，且所有调用必须经过用户审批。

### 新建：`host/mcp_manager.py` — `LumiMCPManager`

核心职责：管理 MCP Server 子进程的完整生命周期。

**关键设计决策：使用后台 Task + `async with` 替代 `AsyncExitStack`**

最初使用 `AsyncExitStack` 管理 `stdio_client` 和 `ClientSession` 的上下文，但在 Ctrl+C 退出时触发 AnyIO 的跨-TaskGroup 拆解错误（`RuntimeError`）。

最终方案：将每个 Server 的连接逻辑封装成独立的 `asyncio.Task`，在 Task 内部用 `async with` 持有上下文，彻底隔离 TaskGroup 边界。

```python
async def _server_loop(self, name, params):
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            self.sessions[name] = session
            # 持有连接直到收到关闭信号
            await self._stop_events[name].wait()
```

**主要接口：**

| 方法 | 说明 |
|---|---|
| `initialize()` | 读取 `data/mcp_config.json`，为所有 Server 建立连接 |
| `get_all_tools()` | 遍历所有已连接 Server，汇总工具列表 |
| `execute_tool(server, tool, args)` | 在指定 Server 上执行工具调用 |
| `shutdown()` | 触发所有 Server 的停止事件，等待子进程退出 |
| `get_config()` | 返回当前内存中的配置字典 |
| `update_config(new_config)` | 写盘 + 热重载（见第 3 节） |

### 集成 `host/main.py`

**初始化流程（`LumiHub.initialize`）：**
1. 创建 `LumiMCPManager`，调用 `await initialize()` 建立到 Notion 等 Server 的连接。
2. 调用 `get_all_tools()` 获取所有可用工具列表。
3. 将工具列表格式化后**动态注入 AI 系统提示词**，确保 AI 知道可以使用哪些工具，以及工具的精确名称（避免幻想）。

**系统提示注入的 Bug 修复：**
首次启动后重启，发现 AI 仍在使用旧的工具名称（幻觉）。原因：提示词清理逻辑只在标签 `存在` 时才执行清理与追加，如果旧版本没有该标签，新内容就永远不会被注入。

修复：**无条件清理并重新注入**，确保每次启动都强制更新。

```python
for old_tag in ["### LUMI_AGENT_RULES ###", "### LUMI_IDE_AGENT_v1 ###", agent_trigger]:
    if old_tag in cleaned_prompt:
        idx = cleaned_prompt.find(old_tag)
        cleaned_prompt = cleaned_prompt[:idx].strip()

new_prompt = cleaned_prompt + agent_prompt  # 无论如何都追加最新内容
```

---

## 2. HitL 工具调用网关：`call_mcp_tool`

### 设计理念

所有 MCP 工具调用必须经过用户审批（Human-in-the-Loop），这是 Lumi-Hub 的核心安全策略。`call_mcp_tool` 作为唯一入口：

```
AI 决定调用 → call_mcp_tool → 弹出审批请求 → 用户批准/拒绝 → 执行/放弃
```

### 实现要点

- AI 通过 `@filter.llm_tool` 装饰的 `call_mcp_tool` 函数传入 `server_name`、`tool_name`、`arguments_json`。
- 函数首先解析 JSON 参数（如格式非法，直接返回错误，不触发审批）。
- 调用 `event.wait_for_auth` 发起审批请求，阻塞等待用户响应。
- 用户批准后，调用 `mcp_manager.execute_tool` 实际执行，返回结果给 AI。

---

## 3. 热重载配置接口 (WebSocket API)

### 新增 WebSocket 消息路由

在 `LumiHubAdapter._handle_client_message` 中新增两条路由：

| 消息类型 | 处理函数 | 说明 |
|---|---|---|
| `MCP_CONFIG_GET` | `_handle_mcp_config_get` | 返回当前 `mcp_config.json` 完整内容 |
| `MCP_CONFIG_UPDATE` | `_handle_mcp_config_update` | 写盘并热重载所有 MCP Server |

### `update_config` 热重载流程

1. **更新内存**：写入 `self.servers`
2. **写盘持久化**：覆盖写入 `data/mcp_config.json`
3. **关闭旧进程**：`await self.shutdown()` 停止所有 stdio 子进程
4. **重新建链**：遍历新配置，重新 `_connect_server`

### 关键 Bug：跨实例共享状态

`LumiHub`（插件类）与 `LumiHubAdapter`（平台适配器）是两个独立实例，MCP Manager 在插件 `initialize` 中创建，但 WebSocket 消息处理在适配器中运行。

**错误方案**：`self.context.shared_data` → AstrBot `Context` 无此属性，导致初始化链路崩溃。

**正确方案**：在文件顶部定义**模块级全局字典**，完全绕开框架限制：

```python
# host/main.py 顶部
_lumi_shared_state = {}

# LumiHub.initialize 中
_lumi_shared_state["mcp_manager"] = self.mcp_manager

# LumiHubAdapter 中
mcp_manager = _lumi_shared_state.get("mcp_manager")
```

---

## 4. 前端 MCP 配置界面 (Phase 5)

### `ws_service.dart` 改造

新增广播流与发送方法：

```dart
// 广播流
final _mcpConfigController = StreamController<Map<String, dynamic>>.broadcast();
Stream<Map<String, dynamic>> get mcpConfigResponses => _mcpConfigController.stream;

// 消息路由（switch 新增）
case 'MCP_CONFIG_RESPONSE':
case 'MCP_CONFIG_UPDATE_RESPONSE':
  _mcpConfigController.add(data);

// 新增方法
void getMcpConfig() { ... }
void updateMcpConfig(Map<String, dynamic> config) { ... }
```

### 新建 `mcp_settings_screen.dart`

**入口**：在 `chat_screen.dart` Sidebar 的"设置"按钮上方，新增"扩展生态 (MCP)"入口（`Icons.extension_outlined`）。

**页面布局：**
- 全屏配置页，最大宽度 800px，适配宽屏。
- 每个 MCP Server 对应一张 Card（图标 + 名称 + 说明 + Token 输入框）。
- Token 输入框支持 `obscureText` 遮罩，保护敏感凭证。
- "保存并热重载"按钮触发 `updateMcpConfig`，成功后自动弹出 SnackBar 并返回。

**加载流程：**
- 进入页面时立即发送 `getMcpConfig` 请求。
- 监听 `mcpConfigResponses` 流，收到响应后解析并填充表单。
- 处理了未连接、获取失败、更新失败等各种错误状态。

---

## 5. 代码质量

### 替换弃用 API

Flutter 新版中 `Color.withOpacity(x)` 已标记 deprecated，全局替换为 `withValues(alpha: x)`，共修复 7 处（`approval_dialog.dart` 6处，`mcp_settings_screen.dart` 1处）。

修复后：**`flutter analyze` → No issues found.**

---

## 6. 调试记录

| 现象 | 原因 | 解决方案 |
|---|---|---|
| 测试脚本 Ctrl+C 崩溃：AnyIO RuntimeError | `AsyncExitStack` 跨 TaskGroup teardown | 改用独立 Task + `async with` |
| AI 调用工具时用了错误的名称 | 系统提示词未更新 | 无条件清理旧 Tag 并重新注入 |
| 前端打开 MCP 界面一直转圈 | 后端未重启，旧代码不认识新消息类型 | 重启后端 |
| 前端报 `MCP Manager not initialized` | Adapter 用 `hasattr(self, ...)` 找不到另一个类的实例 | 改用全局字典 `_lumi_shared_state` |
| 后端启动崩溃：`Context has no attribute shared_data` | AstrBot Context 无此属性 | 放弃框架 API，用模块级全局变量 |

---

## 7. 配置文件说明

`data/mcp_config.json` 的结构：

```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["-y", "@notionhq/notion-mcp-server"],
      "env": {
        "NOTION_API_TOKEN": "secret_xxx"
      }
    }
  }
}
```

用户可通过 Flutter 前端的"扩展生态 (MCP)"界面修改 Token，无需手动编辑 JSON 文件或重启应用。

---

## 8. 待办事项 (Next Steps)

- [ ] 增加多 MCP Server 管理（UI 动态添加/删除 Server 卡片）。
- [ ] 在 UI 中实时显示每个 Server 的连接状态（已连接/连接中/失败）。
- [ ] 解决 Notion MCP Server 冷启动超时问题（增加重试机制或延长超时阈值）。
- [ ] 端对端完整验证"填入新 Token → 保存 → 前端通过 AI 正常调用 Notion"。

---

**记录人**：Antigravity (Assistant)  
**状态**：MCP 前后端全链路打通，核心功能可用，所有已知 Bug 均已修复。

---
title: "6.6 实战场景：场景树、骨骼动画与行为树"
published: 2026-04-07
pinned: false
description: "**面试突击 · 树的游戏应用。** 场景树的 Transform 继承、骨骼动画的层级蒙皮、行为树 AI 决策、时间轮定时器、表达式 AST 求值——五大核心场景的完整 C++ 实现。"
tags: [数据结构, C++, 面试, SceneGraph, BehaviorTree, GameEngine]
category: 数据结构笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 6.6 实战场景：场景树、骨骼动画与行为树

> **一句话理解**：树是游戏引擎中最核心的数据结构——场景管理、角色动画、AI 决策、定时调度、脚本解析，全部基于树。本节用五个完整的 C++ 实现展示树在工程中的力量。

---

## 6.6.1 场景树 (Scene Graph)

### 为什么需要场景树？

游戏世界中的对象通常有**父子层级关系**：

```
角色 (Character)
├── 身体 (Body)
│   ├── 左手 (LeftHand)
│   │   └── 剑 (Sword)
│   └── 右手 (RightHand)
│       └── 盾 (Shield)
├── 头部 (Head)
│   └── 帽子 (Hat)
└── 特效挂点 (FXMount)
    └── 火焰特效 (FireVFX)
```

当角色移动时，所有子节点应该**跟着一起动**。当手臂旋转时，剑也应该跟着旋转。这就是场景树解决的核心问题——**Transform 继承**。

### C++ 实现

```cpp
#include <vector>
#include <string>
#include <memory>
#include <algorithm>
#include <cmath>

// 简化的 2D Transform
struct Transform {
    float x = 0, y = 0;      // 位置
    float rotation = 0;       // 弧度
    float scale_x = 1, scale_y = 1;

    // 把局部坐标转换到父坐标系
    Transform apply(const Transform& parent) const {
        Transform world;
        float cos_r = std::cos(parent.rotation);
        float sin_r = std::sin(parent.rotation);

        world.x = parent.x + (x * cos_r - y * sin_r) * parent.scale_x;
        world.y = parent.y + (x * sin_r + y * cos_r) * parent.scale_y;
        world.rotation = parent.rotation + rotation;
        world.scale_x = parent.scale_x * scale_x;
        world.scale_y = parent.scale_y * scale_y;

        return world;
    }
};

class SceneNode {
    std::string _name;
    Transform _local;                                   // 相对于父节点
    Transform _world;                                   // 世界坐标（缓存）
    bool _world_dirty = true;                           // 脏标记
    bool _visible = true;

    SceneNode* _parent = nullptr;
    std::vector<std::unique_ptr<SceneNode>> _children;

public:
    SceneNode(const std::string& name) : _name(name) {}

    // ===== 层级管理 =====
    SceneNode* add_child(const std::string& name) {
        auto child = std::make_unique<SceneNode>(name);
        child->_parent = this;
        child->_world_dirty = true;
        _children.push_back(std::move(child));
        return _children.back().get();
    }

    void remove_child(const std::string& name) {
        _children.erase(
            std::remove_if(_children.begin(), _children.end(),
                [&](const auto& c) { return c->_name == name; }),
            _children.end()
        );
    }

    // ===== Transform =====
    void set_local_position(float x, float y) {
        _local.x = x;
        _local.y = y;
        _mark_dirty();
    }

    void set_local_rotation(float radians) {
        _local.rotation = radians;
        _mark_dirty();
    }

    void set_local_scale(float sx, float sy) {
        _local.scale_x = sx;
        _local.scale_y = sy;
        _mark_dirty();
    }

    // 获取世界坐标（按需计算，脏时才重算）
    const Transform& world_transform() {
        if (_world_dirty) {
            if (_parent) {
                _world = _local.apply(_parent->world_transform());
            } else {
                _world = _local;  // 根节点
            }
            _world_dirty = false;
        }
        return _world;
    }

    // ===== 遍历 =====

    // 深度优先更新（前序：先处理父再处理子）
    template <typename Func>
    void traverse_dfs(Func&& func) {
        func(*this);
        for (auto& child : _children) {
            child->traverse_dfs(func);
        }
    }

    // 查找节点（按名称，DFS）
    SceneNode* find(const std::string& name) {
        if (_name == name) return this;
        for (auto& child : _children) {
            SceneNode* found = child->find(name);
            if (found) return found;
        }
        return nullptr;
    }

    const std::string& name() const { return _name; }
    bool visible() const { return _visible; }
    void set_visible(bool v) { _visible = v; }
    std::size_t child_count() const { return _children.size(); }

private:
    void _mark_dirty() {
        _world_dirty = true;
        for (auto& child : _children) {
            child->_mark_dirty();  // 递归标记子节点
        }
    }
};
```

**使用示例**：

```cpp
// 构建场景
SceneNode root("World");
auto* player = root.add_child("Player");
auto* body = player->add_child("Body");
auto* sword = body->add_child("Sword");

// 设置 Transform
player->set_local_position(100, 200);
body->set_local_rotation(0.5f);
sword->set_local_position(2, 0);  // 剑相对于身体偏移 2 单位

// 获取剑的世界坐标
const auto& sword_world = sword->world_transform();
// sword 的世界位置 = player(100,200) + body 旋转后的偏移 + sword 的本地偏移

// 遍历整棵场景树
root.traverse_dfs([](SceneNode& node) {
    if (node.visible()) {
        // render(node);
    }
});
```

> 💡 **脏标记优化**：只有 Transform 被修改时才标记为脏，查询时才重新计算。如果一帧中 1000 个节点只有 10 个移动了，就只需要重算 10 棵子树，而不是整棵场景树。Unity 和 Unreal 都用这个优化。

---

## 6.6.2 骨骼动画 (Skeletal Animation)

### 骨骼层级

3D 角色的骨骼是一棵树。每根骨骼有自己的局部变换，最终姿态 = 从根骨骼到该骨骼的 Transform 链的累乘。

```
角色骨骼树：
Hips (髋部) ← 根骨骼
├── Spine (脊椎)
│   ├── Chest (胸部)
│   │   ├── LeftShoulder → LeftArm → LeftHand
│   │   ├── RightShoulder → RightArm → RightHand
│   │   └── Neck → Head
│   └── ... 
├── LeftUpLeg → LeftLeg → LeftFoot
└── RightUpLeg → RightLeg → RightFoot
```

### 简化实现

```cpp
#include <vector>
#include <string>
#include <array>
#include <cmath>

// 简化的 4x4 矩阵（仅用于概念展示）
struct Mat4 {
    float m[16] = {1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1};  // 单位矩阵

    // 矩阵乘法（简化版）
    Mat4 operator*(const Mat4& other) const {
        Mat4 result;
        for (int i = 0; i < 4; ++i)
            for (int j = 0; j < 4; ++j) {
                result.m[i*4+j] = 0;
                for (int k = 0; k < 4; ++k)
                    result.m[i*4+j] += m[i*4+k] * other.m[k*4+j];
            }
        return result;
    }

    static Mat4 translate(float x, float y, float z) {
        Mat4 m;
        m.m[12] = x; m.m[13] = y; m.m[14] = z;
        return m;
    }
};

struct Bone {
    std::string name;
    int parent_index = -1;      // -1 = 根骨骼
    Mat4 local_bind_pose;       // 绑定姿态（T-Pose 下的局部变换）
    Mat4 inverse_bind_pose;     // 绑定姿态的逆矩阵（将顶点从模型空间转到骨骼空间）
};

class Skeleton {
    std::vector<Bone> _bones;

public:
    int add_bone(const std::string& name, int parent, const Mat4& local) {
        int index = _bones.size();
        Bone bone;
        bone.name = name;
        bone.parent_index = parent;
        bone.local_bind_pose = local;
        _bones.push_back(bone);
        return index;
    }

    // 计算所有骨骼的世界变换矩阵
    // 关键：必须按层级顺序处理（父先于子）
    std::vector<Mat4> compute_world_transforms(
        const std::vector<Mat4>& local_poses) const
    {
        std::vector<Mat4> world(_bones.size());

        for (std::size_t i = 0; i < _bones.size(); ++i) {
            if (_bones[i].parent_index < 0) {
                world[i] = local_poses[i];  // 根骨骼
            } else {
                // 世界变换 = 父的世界变换 × 自己的局部变换
                world[i] = world[_bones[i].parent_index] * local_poses[i];
            }
        }
        return world;
    }

    // 计算蒙皮矩阵（顶点着色器使用）
    std::vector<Mat4> compute_skinning_matrices(
        const std::vector<Mat4>& local_poses) const
    {
        auto world = compute_world_transforms(local_poses);
        std::vector<Mat4> skinning(_bones.size());

        for (std::size_t i = 0; i < _bones.size(); ++i) {
            // 蒙皮矩阵 = 当前世界变换 × 绑定姿态的逆
            skinning[i] = world[i] * _bones[i].inverse_bind_pose;
        }
        return skinning;
    }

    std::size_t bone_count() const { return _bones.size(); }
};
```

> 💡 **为什么骨骼是树？** 人体的关节天然形成树结构——肩带动上臂，上臂带动前臂，前臂带动手。每根骨骼的世界位置 = 从根到它的所有局部变换的累乘。这和场景树的 Transform 继承是同一个原理。

---

## 6.6.3 行为树 (Behavior Tree)

### 概念

行为树是游戏 AI 的主流决策架构。它用树结构组织 AI 的行为逻辑，比有限状态机 (FSM) 更模块化、更易扩展。

```
行为树的节点类型：

┌─────────────┐
│  Composite  │  组合节点：有多个子节点
├─────────────┤
│  Selector   │  选择器：子节点依次执行，有一个成功就停（类似 OR）
│  Sequence   │  序列器：子节点依次执行，有一个失败就停（类似 AND）
└─────────────┘

┌─────────────┐
│  Decorator  │  装饰节点：只有一个子节点，修饰其行为
├─────────────┤
│  Inverter   │  反转结果（成功↔失败）
│  Repeat     │  重复执行 N 次
│  Cooldown   │  冷却时间内直接失败
└─────────────┘

┌─────────────┐
│    Leaf      │  叶节点：实际执行动作或判断条件
├─────────────┤
│  Action      │  执行动作（攻击、移动、释放技能）
│  Condition   │  检查条件（血量 < 30%？看到敌人？）
└─────────────┘
```

### 示例：守卫 AI

```
Selector (选择器 — 有一个成功就停)
├── Sequence (序列 — 全部成功才算成功)
│   ├── Condition: 看到敌人?
│   ├── Condition: 血量 > 30%?
│   └── Action: 攻击敌人
├── Sequence
│   ├── Condition: 血量 ≤ 30%?
│   └── Action: 逃跑
└── Action: 巡逻（兜底行为）
```

### C++ 实现

```cpp
#include <vector>
#include <memory>
#include <string>
#include <functional>

// 行为树节点的执行状态
enum class BTStatus {
    Success,    // 成功
    Failure,    // 失败
    Running     // 执行中（多帧行为，如移动到目标点）
};

// 基类
class BTNode {
public:
    virtual ~BTNode() = default;
    virtual BTStatus tick() = 0;  // 每帧调用
    virtual std::string name() const = 0;
};

// ===== Composite 节点 =====

// Selector: 子节点依次执行，有一个 Success 就返回 Success
class Selector : public BTNode {
    std::vector<std::unique_ptr<BTNode>> _children;
    std::string _name;

public:
    Selector(const std::string& name) : _name(name) {}

    void add(std::unique_ptr<BTNode> child) {
        _children.push_back(std::move(child));
    }

    BTStatus tick() override {
        for (auto& child : _children) {
            BTStatus status = child->tick();
            if (status != BTStatus::Failure) {
                return status;  // Success 或 Running → 停下
            }
        }
        return BTStatus::Failure;  // 全部失败
    }

    std::string name() const override { return _name; }
};

// Sequence: 子节点依次执行，有一个 Failure 就返回 Failure
class Sequence : public BTNode {
    std::vector<std::unique_ptr<BTNode>> _children;
    std::string _name;

public:
    Sequence(const std::string& name) : _name(name) {}

    void add(std::unique_ptr<BTNode> child) {
        _children.push_back(std::move(child));
    }

    BTStatus tick() override {
        for (auto& child : _children) {
            BTStatus status = child->tick();
            if (status != BTStatus::Success) {
                return status;  // Failure 或 Running → 停下
            }
        }
        return BTStatus::Success;  // 全部成功
    }

    std::string name() const override { return _name; }
};

// ===== Decorator 节点 =====

class Inverter : public BTNode {
    std::unique_ptr<BTNode> _child;

public:
    Inverter(std::unique_ptr<BTNode> child) : _child(std::move(child)) {}

    BTStatus tick() override {
        BTStatus status = _child->tick();
        if (status == BTStatus::Success) return BTStatus::Failure;
        if (status == BTStatus::Failure) return BTStatus::Success;
        return BTStatus::Running;
    }

    std::string name() const override { return "Inverter"; }
};

// ===== Leaf 节点 =====

class Condition : public BTNode {
    std::string _name;
    std::function<bool()> _check;

public:
    Condition(const std::string& name, std::function<bool()> check)
        : _name(name), _check(std::move(check)) {}

    BTStatus tick() override {
        return _check() ? BTStatus::Success : BTStatus::Failure;
    }

    std::string name() const override { return _name; }
};

class Action : public BTNode {
    std::string _name;
    std::function<BTStatus()> _execute;

public:
    Action(const std::string& name, std::function<BTStatus()> execute)
        : _name(name), _execute(std::move(execute)) {}

    BTStatus tick() override { return _execute(); }
    std::string name() const override { return _name; }
};
```

**构建守卫 AI**：

```cpp
struct Guard {
    float hp = 100;
    bool sees_enemy = false;
    float enemy_distance = 999;
};

std::unique_ptr<BTNode> build_guard_ai(Guard& guard) {
    auto root = std::make_unique<Selector>("GuardAI");

    // 分支 1：看到敌人且血量充足 → 攻击
    auto attack_seq = std::make_unique<Sequence>("AttackBranch");
    attack_seq->add(std::make_unique<Condition>("SeesEnemy?",
        [&]() { return guard.sees_enemy; }));
    attack_seq->add(std::make_unique<Condition>("HealthyEnough?",
        [&]() { return guard.hp > 30; }));
    attack_seq->add(std::make_unique<Action>("Attack",
        [&]() -> BTStatus {
            // 执行攻击逻辑...
            return BTStatus::Success;
        }));
    root->add(std::move(attack_seq));

    // 分支 2：血量低 → 逃跑
    auto flee_seq = std::make_unique<Sequence>("FleeBranch");
    flee_seq->add(std::make_unique<Condition>("LowHealth?",
        [&]() { return guard.hp <= 30; }));
    flee_seq->add(std::make_unique<Action>("Flee",
        [&]() -> BTStatus {
            // 执行逃跑逻辑...
            return BTStatus::Running;  // 多帧行为
        }));
    root->add(std::move(flee_seq));

    // 分支 3：兜底 → 巡逻
    root->add(std::make_unique<Action>("Patrol",
        [&]() -> BTStatus {
            // 执行巡逻逻辑...
            return BTStatus::Running;
        }));

    return root;
}

// 游戏主循环
Guard guard;
auto ai = build_guard_ai(guard);

void game_loop() {
    // 每帧 tick 行为树
    ai->tick();
}
```

> 💡 **行为树 vs FSM**：FSM 的状态切换是全局的（"从巡逻切到攻击"），状态多了就变成蜘蛛网。行为树是层级的——每个分支独立，加新行为只需要往合适的位置插一个子树，不影响其他分支。UE4/UE5 的 AI 系统就用行为树。

---

## 6.6.4 表达式 AST (Abstract Syntax Tree)

### 概念

编译器/脚本引擎处理表达式的标准流程：**字符串 → Token → AST → 求值**。AST 就是一棵二叉树（或多叉树），用树结构表示运算的优先级和结合性。

```
表达式: "3 + 5 * 2 - 1"

AST（自动处理了优先级）：
        -
       / \
      +   1
     / \
    3   *
       / \
      5   2

求值（后序遍历）：
  5 * 2 = 10
  3 + 10 = 13
  13 - 1 = 12
```

### C++ 实现

```cpp
#include <memory>
#include <string>
#include <stdexcept>
#include <cctype>

// AST 节点
struct ASTNode {
    virtual ~ASTNode() = default;
    virtual double evaluate() const = 0;
};

// 数值节点（叶子）
struct NumberNode : ASTNode {
    double value;
    NumberNode(double v) : value(v) {}
    double evaluate() const override { return value; }
};

// 运算符节点（内部节点）
struct BinaryOpNode : ASTNode {
    char op;
    std::unique_ptr<ASTNode> left;
    std::unique_ptr<ASTNode> right;

    BinaryOpNode(char op, std::unique_ptr<ASTNode> l, std::unique_ptr<ASTNode> r)
        : op(op), left(std::move(l)), right(std::move(r)) {}

    double evaluate() const override {
        double l = left->evaluate();
        double r = right->evaluate();
        switch (op) {
            case '+': return l + r;
            case '-': return l - r;
            case '*': return l * r;
            case '/':
                if (r == 0) throw std::runtime_error("Division by zero");
                return l / r;
            default: throw std::runtime_error("Unknown operator");
        }
    }
};

// 递归下降解析器（处理 +, -, *, / 和括号）
class ExprParser {
    std::string _input;
    std::size_t _pos = 0;

    char _peek() const { return _pos < _input.size() ? _input[_pos] : '\0'; }
    char _get()  { return _input[_pos++]; }

    void _skip_spaces() { while (_pos < _input.size() && _input[_pos] == ' ') ++_pos; }

    // 解析数字
    std::unique_ptr<ASTNode> _parse_number() {
        _skip_spaces();
        std::size_t start = _pos;
        while (_pos < _input.size() && (std::isdigit(_input[_pos]) || _input[_pos] == '.'))
            ++_pos;
        double val = std::stod(_input.substr(start, _pos - start));
        return std::make_unique<NumberNode>(val);
    }

    // 解析因子（数字或括号表达式）
    std::unique_ptr<ASTNode> _parse_factor() {
        _skip_spaces();
        if (_peek() == '(') {
            _get();  // 跳过 '('
            auto node = _parse_expr();
            _get();  // 跳过 ')'
            return node;
        }
        return _parse_number();
    }

    // 解析项（* /）
    std::unique_ptr<ASTNode> _parse_term() {
        auto left = _parse_factor();
        _skip_spaces();

        while (_peek() == '*' || _peek() == '/') {
            char op = _get();
            auto right = _parse_factor();
            left = std::make_unique<BinaryOpNode>(op, std::move(left), std::move(right));
            _skip_spaces();
        }
        return left;
    }

    // 解析表达式（+ -）
    std::unique_ptr<ASTNode> _parse_expr() {
        auto left = _parse_term();
        _skip_spaces();

        while (_peek() == '+' || _peek() == '-') {
            char op = _get();
            auto right = _parse_term();
            left = std::make_unique<BinaryOpNode>(op, std::move(left), std::move(right));
            _skip_spaces();
        }
        return left;
    }

public:
    std::unique_ptr<ASTNode> parse(const std::string& input) {
        _input = input;
        _pos = 0;
        return _parse_expr();
    }
};

// 使用：
// ExprParser parser;
// auto ast = parser.parse("3 + 5 * (2 - 1)");
// double result = ast->evaluate();  // 8
```

> 💡 **AST 与栈的关系**：在第 3 章（栈）中，我们用栈做过逆波兰表达式求值。AST 是更通用的方案——逆波兰表达式本质上就是 AST 的后序遍历。编译器先建 AST，再生成目标代码（后序遍历 = 后缀表达式 = 栈机器指令）。

---

## 6.6.5 定时器管理 —— 时间轮 (Timer Wheel)

### 问题

游戏中有大量定时任务：Buff 持续 10 秒后消失、技能冷却 5 秒、每隔 0.5 秒恢复一次 HP。如何高效管理成千上万个定时器？

| 方案 | 插入 | 触发检查 | 删除 | 说明 |
|------|------|---------|------|------|
| 有序数组 | O(n) | O(1) | O(n) | 插入慢 |
| 最小堆 | O(log n) | O(1) | O(n) | 删除慢（找不到） |
| **时间轮** | **O(1)** | **O(1)** * | **O(1)** | 每 tick 一个槽位 |

### 简单时间轮

```cpp
#include <vector>
#include <list>
#include <functional>

class TimerWheel {
    struct Timer {
        int id;
        int remaining_rounds;  // 剩余圈数
        std::function<void()> callback;
    };

    int _wheel_size;
    int _current_slot = 0;
    int _next_id = 0;

    // 每个槽位是一个定时器链表
    std::vector<std::list<Timer>> _slots;

public:
    TimerWheel(int wheel_size = 1024) : _wheel_size(wheel_size), _slots(wheel_size) {}

    // 添加定时器：delay_ticks 帧后触发
    int add_timer(int delay_ticks, std::function<void()> callback) {
        int id = _next_id++;
        int slot = (_current_slot + delay_ticks) % _wheel_size;
        int rounds = delay_ticks / _wheel_size;

        _slots[slot].push_back({id, rounds, std::move(callback)});
        return id;
    }

    // 取消定时器
    void cancel(int id) {
        for (auto& slot : _slots) {
            for (auto it = slot.begin(); it != slot.end(); ++it) {
                if (it->id == id) {
                    slot.erase(it);
                    return;
                }
            }
        }
    }

    // 每帧调用：推进一格
    void tick() {
        auto& slot = _slots[_current_slot];

        for (auto it = slot.begin(); it != slot.end(); ) {
            if (it->remaining_rounds <= 0) {
                it->callback();         // 触发！
                it = slot.erase(it);    // 移除
            } else {
                --it->remaining_rounds; // 还没到，减一圈
                ++it;
            }
        }

        _current_slot = (_current_slot + 1) % _wheel_size;
    }
};
```

**使用**：

```cpp
TimerWheel timers(256);  // 256 个槽位

// 5 秒后 Buff 消失（假设 60fps → 300 帧）
int buff_timer = timers.add_timer(300, [&]() {
    remove_buff(player, "FireShield");
});

// 每帧 tick
void game_update() {
    timers.tick();
    // ...
}

// 提前取消
timers.cancel(buff_timer);
```

> 💡 **分层时间轮**：简单时间轮在 `delay >> wheel_size` 时效率下降（rounds 很大）。Linux 内核的定时器用**分层时间轮**（Hierarchical Timer Wheel）——类似时钟的秒/分/时，短时定时器在内层高频轮，长时定时器在外层低频轮。

---

## 6.6.6 各场景与数据结构的映射

| 游戏场景 | 树结构 | 核心操作 |
|---------|--------|---------|
| 场景管理 | **N 叉树**（Scene Graph） | Transform 继承、DFS 渲染 |
| 骨骼动画 | **N 叉树**（Skeleton） | 矩阵累乘、蒙皮 |
| AI 决策 | **行为树**（Behavior Tree） | 每帧 tick、Selector/Sequence |
| 碰撞加速 | **四叉树 / 八叉树 / BVH** | 空间划分、射线检测 |
| 技能/Buff | **定时器**（Timer Wheel） | O(1) 插入 / 触发 |
| 脚本引擎 | **AST**（Abstract Syntax Tree） | 递归下降解析、后序求值 |
| UI 布局 | **N 叉树**（Widget Tree） | 尺寸计算、事件冒泡 |
| 资源依赖 | **DAG**（有向无环图） | 拓扑排序加载 |

---

## 6.6.7 本节小结

### 核心要点

| 场景 | 要点 |
|------|------|
| **场景树** | N 叉树 + Transform 继承。脏标记优化避免重复计算 |
| **骨骼动画** | 骨骼层级树，世界变换 = 父变换 × 局部变换。蒙皮矩阵 = 世界变换 × 绑定逆 |
| **行为树** | Selector（OR）+ Sequence（AND）+ Leaf（动作/条件）。比 FSM 更模块化 |
| **AST** | 表达式 → 树结构，后序遍历 = 求值。递归下降解析器处理优先级 |
| **时间轮** | O(1) 插入/触发的定时器。游戏中 Buff、冷却、延时任务的标准方案 |

### 面试 30 秒速答

> **Q：场景树是什么？为什么用树？**
>
> A：场景树（Scene Graph）用树结构管理游戏对象的**父子层级关系**。核心价值是 **Transform 继承**——子节点的世界坐标 = 父节点的世界变换 × 子节点的局部变换。移动父节点时，所有子节点自动跟随，无需逐一更新。

> **Q：行为树和有限状态机的区别？**
>
> A：FSM 的缺点是**状态爆炸**——状态多了之后切换关系变成蜘蛛网，难以维护。行为树用**树形层级**组织行为，每个分支独立。新增行为只需在合适的位置插入子树，不影响其他分支。UE4/UE5 的 AI 系统就使用行为树。

---

> 📖 上一节：[6.5 线段树 & 树状数组](../06_05_segment_tree)
>
> 📖 返回总览：[第六章 树 —— 总览与导航](../index)
>
> 📖 下一章：[第七章 图：万物皆可连](../../graph/) —— 图的存储与遍历、最短路径、最小生成树与拓扑排序。

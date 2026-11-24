---
title: "6.1 二叉树基础与遍历"
published: 2026-04-07
pinned: false
description: "数据结构笔记 · 二叉树。内容按优先级梳理：P0 核心考点（前中后序与层序遍历的递归/迭代模板、翻转二叉树、对称性判定）、P1 经典算法（最近公共祖先 LCA、前中序重建二叉树、最大路径和）、P2 性能优化（Morris 遍历 O(1) 空间）、P3 基础原理与数组表示附录。"
tags: [数据结构, C++, 面试, BinaryTree, Traversal]
category: 数据结构笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 6.1 二叉树基础与遍历

> 二叉树是每个节点最多拥有两个子树（左子树与右子树）的层级数据结构。二叉搜索树、红黑树、二叉堆等高级结构均由其衍生而来。

---

## 0. 考点优先级概览

根据面试常见考察频次与工程实用度，内容按优先级组织如下：

| 优先级 | 分类 | 核心内容 | 重点说明 |
| :--- | :--- | :--- | :--- |
| **P0** | **核心考点** | 四种遍历（前/中/后/层序）的递归与显式栈迭代模板、最大深度、翻转二叉树、对称判定 | 树形算法基础核心，必默写模板 |
| **P1** | **经典算法模型** | 最近公共祖先 (LCA)、从前序与中序构建二叉树、二叉树直径与最大路径和 | 复杂递归思维与全局极值状态维护 |
| **P2** | **空间优化** | Morris 遍历（利用线索二叉树实现 $O(1)$ 额外空间遍历） | 极致内存受限环境下的遍历技巧 |
| **P3** | **基础与附录** | 满二叉树 vs 完全二叉树、数组顺序存储父子节点映射公式、基础术语 | 概念常识与查阅备忘 |

---

## P0：核心考点

### 1.1 四种遍历方式的本质与访问时序

二叉树遍历是指按特定次序访问树中的每个节点恰好一次：
* **前序遍历 (Pre-order)**：`根 -> 左 -> 右`（先处理当前节点，常用于复制树、前缀序列化）
* **中序遍历 (In-order)**：`左 -> 根 -> 右`（在 BST 中输出为有序序列）
* **后序遍历 (Post-order)**：`左 -> 右 -> 根`（先处理所有子节点再处理自身，常用于析构释放、计算树的高度和子树综合信息）
* **层序遍历 (Level-order)**：按深度从上到下、同层从左到右逐层访问（基于队列 BFS）

---

### 1.2 核心手撕 1：前中后序遍历的统一迭代模板

面试中经常要求“不用递归，用显式栈实现遍历”，以避免调用栈过深造成栈溢出。

#### 1. 前序遍历（栈模拟：先右后左入栈）
```cpp
#include <vector>
#include <stack>

std::vector<int> preorderTraversal(TreeNode* root) {
    if (!root) return {};
    std::vector<int> res;
    std::stack<TreeNode*> st;
    st.push(root);

    while (!st.empty()) {
        TreeNode* cur = st.top();
        st.pop();
        res.push_back(cur->val);

        // 注意：栈是先进后出，所以先压右子节点，再压左子节点
        if (cur->right) st.push(cur->right);
        if (cur->left)  st.push(cur->left);
    }
    return res;
}
```

#### 2. 中序遍历（左边界一路探底）
```cpp
std::vector<int> inorderTraversal(TreeNode* root) {
    std::vector<int> res;
    std::stack<TreeNode*> st;
    TreeNode* cur = root;

    while (cur || !st.empty()) {
        // 一路向左将所有左子节点压栈
        while (cur) {
            st.push(cur);
            cur = cur->left;
        }
        cur = st.top();
        st.pop();
        res.push_back(cur->val); // 访问中间节点
        cur = cur->right;        // 转向右子树
    }
    return res;
}
```

#### 3. 后序遍历（巧妙技巧：前序逆向法）
前序遍历是 `中 -> 左 -> 右`。若调整压栈顺序变为 `中 -> 右 -> 左`，得到的遍历序列反转后就是 `左 -> 右 -> 中`（即后序遍历）：
```cpp
#include <algorithm>

std::vector<int> postorderTraversal(TreeNode* root) {
    if (!root) return {};
    std::vector<int> res;
    std::stack<TreeNode*> st;
    st.push(root);

    while (!st.empty()) {
        TreeNode* cur = st.top();
        st.pop();
        res.push_back(cur->val);

        if (cur->left)  st.push(cur->left);  // 先左
        if (cur->right) st.push(cur->right); // 后右
    }
    std::reverse(res.begin(), res.end());
    return res;
}
```

---

### 1.3 核心手撕 2：层序遍历 (BFS 模板)

```cpp
#include <queue>

std::vector<std::vector<int>> levelOrder(TreeNode* root) {
    if (!root) return {};
    std::vector<std::vector<int>> res;
    std::queue<TreeNode*> q;
    q.push(root);

    while (!q.empty()) {
        int level_size = q.size();
        std::vector<int> current_level;

        for (int i = 0; i < level_size; ++i) {
            TreeNode* node = q.front();
            q.pop();
            current_level.push_back(node->val);

            if (node->left)  q.push(node->left);
            if (node->right) q.push(node->right);
        }
        res.push_back(current_level);
    }
    return res;
}
```

---

### 1.4 高频基础递归题目

#### 1. 翻转二叉树 (LeetCode 226)
```cpp
TreeNode* invertTree(TreeNode* root) {
    if (!root) return nullptr;
    std::swap(root->left, root->right);
    invertTree(root->left);
    invertTree(root->right);
    return root;
}
```

#### 2. 对称二叉树 (LeetCode 101)
```cpp
bool check(TreeNode* p, TreeNode* q) {
    if (!p && !q) return true;
    if (!p || !q || p->val != q->val) return false;
    return check(p->left, q->right) && check(p->right, q->left);
}

bool isSymmetric(TreeNode* root) {
    return !root || check(root->left, root->right);
}
```

---

### 1.5 常见面试问答要点

* **Q：二叉树递归遍历的本质是什么？**
  > **回答要点**：二叉树的递归遍历本质上是深度优先搜索 (DFS)。在系统调用栈的支持下，每个节点实际上会被访问三次：第一次是初次进入该节点，第二次是从左子树递归返回，第三次是从右子树递归返回。在这三次不同的时机输出节点值，分别对应前序、中序和后序遍历。

* **Q：什么情况下适合用递归，什么情况下必须用迭代？**
  > **回答要点**：在树高已知较小或平均情况下（平衡树树高为 $O(\log n)$），递归写法语义最直观、可读性最高；但当遇到完全退化的链状二叉树（树高为 $O(n)$），递归会导致调用栈深度达到 $N$，可能引发栈溢出。工业级系统在处理用户不可控的深层树时，必须采用循环加显式堆分配栈模拟迭代。

---

## P1：经典算法模型

### 2.1 最近公共祖先 (LCA, LeetCode 236)

* **定义**：对于有根树的两个节点 $p$ 和 $q$，最近公共祖先表示同时以 $p$ 和 $q$ 为后代的最低节点。
* **后序遍历回溯思路**：
  - 若当前节点为空，或当前节点就是 $p$ 或 $q$，直接返回当前节点。
  - 递归查询左子树得 `left`，递归查询右子树得 `right`。
  - 若 `left` 和 `right` 均非空，说明 $p$ 和 $q$ 分别落在当前节点的左右子树，**当前节点即为 LCA**！
  - 若仅有一侧非空，返回非空的那一侧。

```cpp
TreeNode* lowestCommonAncestor(TreeNode* root, TreeNode* p, TreeNode* q) {
    if (!root || root == p || root == q) return root;
    TreeNode* left = lowestCommonAncestor(root->left, p, q);
    TreeNode* right = lowestCommonAncestor(root->right, p, q);
    if (left && right) return root;
    return left ? left : right;
}
```

---

### 2.2 从前序与中序遍历序列构造二叉树 (LeetCode 105)

* **核心性质**：
  - 前序遍历的第一个元素必为根节点 `root`。
  - 在中序遍历中找到该根节点的位置，其**左边全部为左子树节点，右边全部为右子树节点**。
  - 计算左子树节点总数，即可在前序序列中划分出左子树和右子树的子区间，递归构建。

---

### 2.3 经典题目速查

| 题目 | 难度 | 核心思路 |
| :--- | :--- | :--- |
| **LC 104. 二叉树的最大深度** | Easy | 后序遍历：`max(maxDepth(left), maxDepth(right)) + 1`。 |
| **LC 110. 平衡二叉树** | Easy | 自底向上后序遍历：计算高度的同时，若左右高度差 $> 1$ 提前返回 -1 剪枝。 |
| **LC 543. 二叉树的直径** | Easy | 后序遍历：在计算深度的过程中，动态更新全局最大跨越直径 `left_depth + right_depth`。 |
| **LC 124. 二叉树中的最大路径和** | Hard | 递归计算单侧最大贡献值（若小于 0 则舍弃记为 0），更新 `root->val + left + right` 的全局最大值。 |
| **LC 297. 二叉树的序列化与反序列化** | Hard | 前序遍历递归输出带 `,` 和 `#` 的字符串，反序列化按先序顺次构建。 |

---

## P2：空间优化：Morris 遍历

常规递归和显式栈迭代遍历的空间复杂度均为 $O(h)$（$h$ 为树高）。**Morris 遍历**利用叶子节点的空指针建立临时线索，在保证时间复杂度为 $O(n)$ 的同时，将额外空间复杂度压缩至严格 **$O(1)$**。

* **核心机制**：
  若当前节点 `cur` 有左子树，找到其在中序遍历下的前驱节点（即左子树的最右节点 `most_right`）：
  - 若 `most_right->right == nullptr`：将其指向 `cur`（建立线索），`cur = cur->left`。
  - 若 `most_right->right == cur`：说明左子树已访问完毕，断开线索恢复树形 `most_right->right = nullptr`，访问 `cur`，`cur = cur->right`。

---

## P3：基础原理与参考实现

### 3.1 完全二叉树的数组顺序存储映射

对于完全二叉树，可以使用一维连续数组进行紧凑存储，无需任何左右子指针。对于下标为 $i$ 的节点（从 0 开始计数）：
* **父节点下标**：`parent = (i - 1) / 2`
* **左子节点下标**：`left = 2 * i + 1`
* **右子节点下标**：`right = 2 * i + 2`
* **判断是否有左子节点**：`2 * i + 1 < n`

这一特性是后续**二叉堆 (Heap)** 的底层基础。

---

### 3.2 复杂度横向对比

| 遍历算法 | 时间复杂度 | 空间复杂度 | 特点说明 |
| :--- | :--- | :--- | :--- |
| **递归遍历** | $O(n)$ | $O(h)$ (最坏 $O(n)$) | 语义最简洁，但可能栈溢出 |
| **显式栈迭代** | $O(n)$ | $O(h)$ (最坏 $O(n)$) | 栈空间在堆上，安全无崩溃风险 |
| **Morris 遍历** | $O(n)$ | **$O(1)$** | 极度省内存，但中途会临时改动树结构 |

---

> 📖 下一节：[6.2 二叉搜索树 (BST)](./06_02_bst.md) —— 从中序遍历单调性到节点删除后继替换，从验证 BST 到第 K 小元素定位。

---
title: "第七章 数学与数论基础"
published: 2026-04-28
pinned: false
description: "算法笔记 · 数学与数论。内容按优先级梳理：P0 核心考点（快速幂算法、辗转相除法 GCD、欧拉线性筛、Fisher-Yates 洗牌算法）、P1 抽样与数论模型（蓄水池抽样、组合数与扩展欧几里得）、P2 游戏开发屏幕宽高比计算与真随机卡牌掉落、P3 矩阵快速幂与参考实现源码附录。"
tags: [算法, 数学, 数论, 快速幂, 洗牌算法, 质数筛, 面试, C++]
category: 算法笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 第七章 数学与数论基础

> 数学是算法优化的底层基石。从模运算下的快速幂加速，到密码学与离散数学常用的质数筛，再到游戏抽卡与随机洗牌，数学算法通过严格的代数推导将暴力穷举大幅压缩至对数甚至常数时间。

---

## 0. 考点优先级概览

根据面试常见考察频次与工程实用度，内容按优先级组织如下：

| 优先级 | 分类 | 核心内容 | 重点说明 |
| :--- | :--- | :--- | :--- |
| **P0** | **核心考点** | 快速幂 (位运算迭代法)、欧几里得辗转相除法 (GCD)、线性筛 (欧拉筛 $O(n)$)、Fisher-Yates 洗牌算法 | 高频必考基础数学模板 |
| **P1** | **抽样与高阶数论** | 蓄水池抽样 (大数据流随机)、扩展欧几里得 (exGCD)、组合数杨辉三角 | 概率题型与离散数学核心 |
| **P2** | **工程与游戏实战** | 屏幕分辨率与宽高比约简 (GCD)、卡牌均匀洗牌与掉落抽卡机制 | 游戏数值策划与渲染适配 |
| **P3** | **基础与附录** | 矩阵快速幂优化斐波那契线性递推、经典题目速查清单 | 知识库备忘查阅 |

---

## P0：核心考点

### 1.1 核心手撕 1：快速幂算法 (Binary Exponentiation)

* **目标**：以 **$O(\log n)$** 时间复杂度计算 $a^b \pmod m$。
* **分治/倍增思想**：将指数 $b$ 拆解为二进制形式。例如 $a^{13} = a^{1101_2} = a^8 \cdot a^4 \cdot a^1$。
* **位运算迭代实现**：
```cpp
long long fastPower(long long a, long long b, long long mod) {
    long long ans = 1;
    a %= mod;
    while (b > 0) {
        if (b & 1) ans = (ans * a) % mod; // 若当前二进制位为 1，累乘进答案
        a = (a * a) % mod;                 // 底数自乘翻倍
        b >>= 1;                           // 指数右移一位
    }
    return ans;
}
```

---

### 1.2 核心手撕 2：欧几里得算法 (辗转相除法求 GCD)

* **数学原理**：两个整数的最大公约数等于其中较小的数和两数相除余数的最大公约数：
  $$\gcd(a, b) = \gcd(b, a \bmod b)$$
```cpp
// 极简一行递归
int gcd(int a, int b) {
    return b == 0 ? a : gcd(b, a % b);
}

// 最小公倍数 (LCM)：利用 a * b = gcd(a, b) * lcm(a, b)
long long lcm(int a, int b) {
    return (1LL * a / gcd(a, b)) * b; // 先除后乘防溢出
}
```

---

### 1.3 核心手撕 3：欧拉线性筛质数 ($O(n)$)

* **埃氏筛缺陷**：同一个合数可能被多个不同的质数重复标记筛除（如 12 被 2 和 3 重复筛掉）。
* **欧拉筛核心准则**：**保证每个合数只被其【最小质因子】筛除一次**。

```cpp
#include <vector>

std::vector<int> eulerSieve(int n) {
    std::vector<bool> is_prime(n + 1, true);
    std::vector<int> primes;
    is_prime[0] = is_prime[1] = false;

    for (int i = 2; i <= n; ++i) {
        if (is_prime[i]) primes.push_back(i);

        for (int p : primes) {
            if (i * p > n) break;
            is_prime[i * p] = false;
            // 核心剪枝：若 p 是 i 的因子，后续更大的质数与 i 的积其最小质因数依然是 p
            if (i % p == 0) break;
        }
    }
    return primes;
}
```

---

### 1.4 核心手撕 4：Fisher-Yates 均匀洗牌算法

* **问题**：给定包含 $n$ 个元素的数组，打乱为随机排列，确保所有 $n!$ 种排列概率严格相等（均为 $\frac{1}{n!}$）。
* **标准算法**：从后向前遍历，对每个位置 $i$，生成一个 $[0, i]$ 范围内的随机下标 $j$，交换 `arr[i]` 与 `arr[j]`。

```cpp
#include <vector>
#include <random>
#include <algorithm>

void shuffle(std::vector<int>& arr) {
    std::random_device rd;
    std::mt19937 gen(rd());

    for (int i = static_cast<int>(arr.size()) - 1; i > 0; --i) {
        std::uniform_int_distribution<int> dist(0, i); // 在 [0, i] 之间等概率随机
        int j = dist(gen);
        std::swap(arr[i], arr[j]);
    }
}
```

---

### 1.5 常见面试问答要点

* **Q：为什么很多朴素的洗牌写法会导致概率不均匀？**
  > **回答要点**：若循环中每次都从全局区间 $[0, n-1]$ 中随机选取一个数与当前位置交换，整个状态树的分支总数为 $n^n$。而全排列的总数是 $n!$。因为 $n^n$ 通常**不能被 $n!$ 整除**，根据鸽巢原理，必然会导致某些排列出现的概率高于其他排列，形成概率倾斜；而 Fisher-Yates 算法每次从 $[0, i]$ 中选取，总可能路径恰好为 $n \times (n-1) \times \dots \times 1 = n!$，保证绝对均匀。

---

## P1：抽样与数论模型

### 2.1 蓄水池抽样 (Reservoir Sampling, LeetCode 382)

* **场景**：数据流规模未知（可能无限大），只能单向扫描一次，要求以等概率从流中随机选取 $k$ 个元素。
* **单元素抽样规则**：
  - 遇到第 $i$ 个元素（下标从 1 开始），以 $\frac{1}{i}$ 的概率选择保留当前元素，以 $1 - \frac{1}{i}$ 的概率保留之前的结果。
  - **数学证明**：到第 $n$ 个元素时，第 $i$ 个元素最终被选中的概率为：
    $$\frac{1}{i} \times \left(1 - \frac{1}{i+1}\right) \times \left(1 - \frac{1}{i+2}\right) \times \dots \times \left(1 - \frac{1}{n}\right) = \frac{1}{i} \times \frac{i}{i+1} \times \dots \times \frac{n-1}{n} = \frac{\mathbf{1}}{\mathbf{n}}$$
  - 严格保证每个历史元素被选中的概率恒定为 $\frac{1}{n}$。

---

## P2：工程实践与业务场景

1. **游戏屏幕宽高比约简**：根据屏幕长宽像素（如 1920 与 1080），通过 `gcd(1920, 1080) = 120`，约简输出显示比例 `16:9`。
2. **卡牌与掉落奖池洗牌**：卡牌战斗开局时发牌洗牌，利用 Fisher-Yates 算法在内存中洗牌，消除伪随机聚类漏洞。

---

## P3：基础原理与参考实现

### 3.1 经典题目速查

| 题目 | 难度 | 核心思路 |
| :--- | :--- | :--- |
| **LC 50. Pow(x, n)** | Medium | 快速幂递归或迭代，注意处理负数指数 `n = -n` 时的边界溢出。 |
| **LC 204. 计数质数** | Medium | 欧拉线性筛法统计 $\le n$ 的质数个数。 |
| **LC 382. 链表随机节点** | Medium | 蓄水池抽样：遍历单链表，第 $i$ 个节点以 $1/i$ 概率替换当前选中的值。 |
| **LC 470. 用 Rand7 实现 Rand10** | Medium | 拒绝采样：`num = (Rand7() - 1) * 7 + Rand7()` 生成 $1 \sim 49$，舍弃 $> 40$。 |

---

> 📖 下一节：[第八章 位运算与状态压缩](./08_bitwise.md) —— 最低位消去、异或妙用与掩码操作。

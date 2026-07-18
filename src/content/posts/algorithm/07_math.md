---
title: "第七章 数学算法：快速幂、GCD、质数与随机"
published: 2026-04-28
pinned: false
description: "**面试突击 · 数学算法。** 快速幂与矩阵快速幂、欧几里得算法与扩展欧几里得、质数筛与质因数分解、组合数学基础与随机算法——游戏中无处不在的数学，一文打尽。"
tags: [算法, 数学, 快速幂, GCD, 质数, 随机算法, 面试, C++]
category: 算法笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 第七章 数学算法：快速幂、GCD、质数与随机

> **一句话理解**：数学算法是面试中的"送分题"——公式明确、代码短、思路固定。掌握模板就能稳定拿分，且游戏中（伤害公式、宽高比、洗牌）无处不在。

> 📋 前置知识：数据结构 Ch1（数组基础）

---

## 7.1 概念直觉 —— 这些问题为什么重要

数学类算法题在面试中的特点：**要么秒杀，要么写不出来**。它们不依赖复杂的推理，但依赖你是否见过这个模板。

```
面试中数学题的信号（识别准确率 > 90%）：

✅ 题目涉及"幂运算"、"大数"、"模" → 快速幂
✅ 题目涉及"最大公约"、"最小公倍" → GCD
✅ 题目涉及"质数"、"素数"、"筛" → 质数筛
✅ 题目涉及"随机"、"概率"、"抽样" → 随机算法
✅ 题目涉及"组合"、"排列数"、"卡特兰" → 组合数学
```

---

## 7.2 快速幂与大数运算

### 快速幂 —— 二分思想在幂运算中的应用

朴素计算 `a^n` 需要 O(n) 次乘法。快速幂通过**指数折半**做到 O(log n)：

```
a^n = a^{n/2} × a^{n/2}        （n 为偶数）
a^n = a × a^{n/2} × a^{n/2}    （n 为奇数）

每次把指数折半 → log₂(n) 次就能算完
```

```cpp
// 快速幂：计算 a^n mod MOD
// 迭代版（面试推荐，不易写错）
const int MOD = 1e9 + 7;

long long fastPow(long long a, long long n) {
    long long result = 1;
    a %= MOD;

    while (n > 0) {
        if (n & 1) {                // 当前位是 1：乘上这个 bit 对应的幂
            result = (result * a) % MOD;
        }
        a = (a * a) % MOD;          // 平方（对应下一位的幂）
        n >>= 1;                     // 右移一位
    }
    return result;
}
```

```
计算 a^13（n = 13 = 1101₂）：

bit0 (1): result = result * a^1   = a
         a = a²
bit1 (0): (跳过)
         a = a⁴
bit2 (1): result = result * a⁴   = a * a⁴ = a⁵
         a = a⁸
bit3 (1): result = result * a⁸   = a⁵ * a⁸ = a¹³
         a = a¹⁶（不再需要）

结果：a¹³，只用了 3 次乘法（而非 12 次）
```

> 💡 **面试中的表述**：「快速幂本质上是二分的应用——每次把指数折半。迭代版用二进制的视角：n 的每一位决定是否乘上对应幂次的 a。时间复杂度 O(log n)，空间 O(1)。」

### 矩阵快速幂 —— 将线性递推加速到 O(log n)

斐波那契数列的 DP 解法是 O(n)，矩阵快速幂可以做到 O(log n)：

```
[ F(n)   ]   =   [1  1] ^ (n-1)   ×   [F(1)]
[ F(n-1) ]       [1  0]               [F(0)]

矩阵的 n 次幂 → 快速幂思想（乘法换成了矩阵乘法）
```

```cpp
#include <vector>

using Matrix = std::vector<std::vector<long long>>;

Matrix matMul(const Matrix& A, const Matrix& B, int mod = 1e9 + 7) {
    int n = A.size();
    Matrix C(n, std::vector<long long>(n, 0));

    for (int i = 0; i < n; ++i) {
        for (int k = 0; k < n; ++k) {          // k 在中间（缓存优化）
            if (A[i][k] == 0) continue;
            for (int j = 0; j < n; ++j) {
                C[i][j] = (C[i][j] + A[i][k] * B[k][j]) % mod;
            }
        }
    }
    return C;
}

Matrix matPow(Matrix A, long long n) {
    int size = A.size();
    Matrix result(size, std::vector<long long>(size, 0));
    for (int i = 0; i < size; ++i) result[i][i] = 1;  // 单位矩阵

    while (n > 0) {
        if (n & 1) result = matMul(result, A);
        A = matMul(A, A);
        n >>= 1;
    }
    return result;
}

// O(log n) 求斐波那契第 n 项
long long fib(long long n) {
    if (n <= 2) return 1;
    Matrix A = {{1, 1}, {1, 0}};
    Matrix An = matPow(A, n - 1);
    return An[0][0];  // F(n) = An[0][0] * F(1) + An[0][1] * F(0)
}
```

> 💡 `i-k-j` 循环顺序让 k 在中间——这是矩阵乘法的缓存优化：A[i][k] 在内层循环不变，可以被寄存器缓存。

### 大数运算

```cpp
// 大数加法（字符串表示）
std::string addStrings(std::string num1, std::string num2) {
    std::string result;
    int i = num1.size() - 1, j = num2.size() - 1, carry = 0;

    while (i >= 0 || j >= 0 || carry) {
        int digit1 = (i >= 0) ? num1[i--] - '0' : 0;
        int digit2 = (j >= 0) ? num2[j--] - '0' : 0;
        int sum = digit1 + digit2 + carry;
        result.push_back('0' + sum % 10);
        carry = sum / 10;
    }
    std::reverse(result.begin(), result.end());
    return result;
}
```

---

## 7.3 最大公约数与扩展欧几里得

### 欧几里得算法 (GCD)

```cpp
// 辗转相除法
// gcd(a, b) = gcd(b, a % b)
// 复杂度 O(log min(a, b))
int gcd(int a, int b) {
    return b == 0 ? a : gcd(b, a % b);
}

// 迭代版（避免递归栈）
int gcd_iter(int a, int b) {
    while (b != 0) {
        int temp = b;
        b = a % b;
        a = temp;
    }
    return a;
}

// LCM: lcm(a, b) = a / gcd(a, b) * b  （先除后乘防溢出）
int lcm(int a, int b) {
    return a / gcd(a, b) * b;
}
```

### 扩展欧几里得 (Extended Euclidean)

> 求整数 x, y 使得 `ax + by = gcd(a, b)`。这是**模逆元**的基础。

```cpp
// 扩展欧几里得：返回 gcd(a, b)，同时计算出 x, y
int exgcd(int a, int b, int& x, int& y) {
    if (b == 0) {
        x = 1;
        y = 0;
        return a;
    }
    int x1, y1;
    int d = exgcd(b, a % b, x1, y1);
    x = y1;
    y = x1 - (a / b) * y1;
    return d;
}

// 求 a 在模 m 下的逆元（即 a * x ≡ 1 (mod m)）
// 条件：gcd(a, m) == 1
int modInverse(int a, int m) {
    int x, y;
    int d = exgcd(a, m, x, y);
    if (d != 1) return -1;  // 逆元不存在
    return (x % m + m) % m;  // 保证正数
}
```

```
扩展欧几里得的推导（"手算"验证）：
已知 bx' + (a%b)y' = gcd
而 a%b = a - (a/b) * b
代入：bx' + (a - (a/b)*b)y' = gcd
整理：a * y' + b * (x' - (a/b)*y') = gcd
所以：x = y',  y = x' - (a/b) * y'
```

---

## 7.4 质数与筛法

### 基础质数判断

```cpp
// O(√n) 判断质数
bool isPrime(int n) {
    if (n < 2) return false;
    if (n == 2 || n == 3) return true;
    if (n % 2 == 0 || n % 3 == 0) return false;

    // 6k±1 优化：除了 2 和 3，所有质数都是 6k±1 的形式
    for (int i = 5; i * i <= n; i += 6) {
        if (n % i == 0 || n % (i + 2) == 0) return false;
    }
    return true;
}
```

### 埃拉托斯特尼筛法

```cpp
// 筛出 [2, n] 的所有质数
// O(n log log n)
std::vector<int> sieveOfEratosthenes(int n) {
    std::vector<bool> isPrime(n + 1, true);
    isPrime[0] = isPrime[1] = false;

    for (int i = 2; i * i <= n; ++i) {
        if (!isPrime[i]) continue;
        // 从 i*i 开始（更小的倍数已被之前的质数标记）
        for (int j = i * i; j <= n; j += i) {
            isPrime[j] = false;
        }
    }

    std::vector<int> primes;
    for (int i = 2; i <= n; ++i) {
        if (isPrime[i]) primes.push_back(i);
    }
    return primes;
}
```

### 线性筛（欧拉筛）—— O(n)

```cpp
// 每个合数只被其最小质因数筛掉一次 → O(n)
std::vector<int> linearSieve(int n) {
    std::vector<int> primes;
    std::vector<bool> isComposite(n + 1, false);

    for (int i = 2; i <= n; ++i) {
        if (!isComposite[i]) {
            primes.push_back(i);
        }
        // 用 i 去筛掉后面的合数
        for (int p : primes) {
            if ((long long)i * p > n) break;
            isComposite[i * p] = true;
            if (i % p == 0) break;  // ⚠️ 关键！保证每个合数被最小质因数筛
        }
    }
    return primes;
}
```

> 💡 `if (i % p == 0) break` 是线性筛的核心。它保证了每个合数**只被自己的最小质因数筛掉**。例如 `i=6, p=2` 时筛掉 12，然后 break——不会用 `p=3` 再筛 18，因为 18 应该由 `i=9, p=2` 来筛。

| 筛法 | 时间复杂度 | 空间 | 适用场景 |
|------|----------|------|---------|
| 埃筛 | O(n log log n) | O(n) | n ≤ 1e7，简单实用 |
| 线性筛 | O(n) | O(n) | n 较大，或需要记录最小质因数 |

### 质因数分解

```cpp
// O(√n) 质因数分解
std::vector<std::pair<int, int>> factorize(int n) {
    std::vector<std::pair<int, int>> factors;  // {质因数, 次数}

    for (int i = 2; i * i <= n; ++i) {
        if (n % i == 0) {
            int count = 0;
            while (n % i == 0) {
                n /= i;
                ++count;
            }
            factors.push_back({i, count});
        }
    }
    if (n > 1) factors.push_back({n, 1});  // 剩余的大质数
    return factors;
}
```

---

## 7.5 组合数学基础

### 杨辉三角与组合数

```cpp
// 杨辉三角法求 C(n, k)
// 递推：C(n, k) = C(n-1, k-1) + C(n-1, k)
// 优点：可以一次算出一整行，且自动取模
std::vector<std::vector<long long>> pascal(int maxN, int mod = 1e9 + 7) {
    std::vector<std::vector<long long>> C(maxN + 1,
        std::vector<long long>(maxN + 1, 0));

    for (int i = 0; i <= maxN; ++i) {
        C[i][0] = C[i][i] = 1;
        for (int j = 1; j < i; ++j) {
            C[i][j] = (C[i - 1][j - 1] + C[i - 1][j]) % mod;
        }
    }
    return C;
}

// 公式法求单个组合数（需要预处理阶乘和逆元）
// C(n, k) = n! / (k! * (n-k)!)
long long comb(int n, int k, const std::vector<long long>& fact,
               const std::vector<long long>& invFact, int mod = 1e9 + 7) {
    if (k < 0 || k > n) return 0;
    return fact[n] * invFact[k] % mod * invFact[n - k] % mod;
}
```

### 卡特兰数

```
卡特兰数的前几项：1, 1, 2, 5, 14, 42, 132, 429 ...

递推公式：C(0) = 1,  C(n+1) = Σ C(i) * C(n-i)
通项公式：C(n) = C(2n, n) / (n+1)

常见应用：
  - n 对括号的合法组合数
  - n+1 个节点的不同二叉搜索树数目
  - 栈的出栈序列数
  - 凸 n+2 边形的三角剖分数
```

```cpp
// 卡特兰数：通项公式
long long catalan(int n, int mod = 1e9 + 7) {
    // C(n) = C(2n, n) / (n+1)
    auto C = pascal(2 * n, mod);
    return C[2 * n][n] * modInverse(n + 1, mod) % mod;
}
```

---

## 7.6 概率与随机算法

### Fisher-Yates 洗牌算法

```cpp
// 原地洗牌：保证每种排列等概率（n! 种排列，每种概率 1/n!）
void shuffle(std::vector<int>& arr) {
    int n = arr.size();
    for (int i = n - 1; i > 0; --i) {
        // 从 [0, i] 中随机选一个位置
        int j = rand() % (i + 1);
        std::swap(arr[i], arr[j]);
    }
}
```

> ⚠️ **常见错误**：每次从 `[0, n-1]` 随机选，然后和当前位置交换——这会导致不均匀分布（nⁿ 种可能，但只有 n! 种排列，无法均匀映射）。

### 蓄水池抽样

```cpp
// 从未知大小的数据流中随机取 k 个样本
// 保证每个元素被选中的概率相等（= k / n）
std::vector<int> reservoirSample(const std::vector<int>& stream, int k) {
    std::vector<int> reservoir(k);
    int n = stream.size();

    // 前 k 个直接放入
    for (int i = 0; i < k; ++i) {
        reservoir[i] = stream[i];
    }

    // 后续元素以 k / (i+1) 的概率替换
    for (int i = k; i < n; ++i) {
        int j = rand() % (i + 1);
        if (j < k) {
            reservoir[j] = stream[i];
        }
    }
    return reservoir;
}
```

```
证明思路（归纳法）：
第 i 个元素最终留在蓄水池的概率
= 被选入的概率 × 后续不被替换的概率
= (k / i) × [i/(i+1)] × [(i+1)/(i+2)] × ... × [(n-1)/n]
= k / n
```

### 拒绝采样 —— 用 Rand7 实现 Rand10 (LeetCode 470)

```cpp
// 给定 rand7() 生成 [1,7] 均匀随机，实现 rand10() 生成 [1,10] 均匀随机
int rand10() {
    while (true) {
        // 用两次 rand7() 生成 [1, 49] 均匀分布
        int num = (rand7() - 1) * 7 + rand7();
        if (num <= 40) {               // 拒绝 41~49
            return (num - 1) % 10 + 1;
        }
        // num 在 [41, 49] 被拒绝，重新采样
    }
}
// 期望调用 rand7() 次数 = 2 * 49/40 = 2.45
```

```cpp
// 进阶：最小化 rand7() 的调用次数
int rand10_optimized() {
    while (true) {
        int a = rand7(), b = rand7();
        int num = (a - 1) * 7 + b;   // [1, 49]
        if (num <= 40) return (num - 1) % 10 + 1;

        // 利用被拒绝的 [41, 49] → 映射到 [1, 63] 再试
        a = num - 40;                  // a ∈ [1, 9]
        b = rand7();
        num = (a - 1) * 7 + b;        // [1, 63]
        if (num <= 60) return (num - 1) % 10 + 1;

        // 再利用 [61, 63] → 映射到 [1, 21] 再试
        a = num - 60;                  // a ∈ [1, 3]
        b = rand7();
        num = (a - 1) * 7 + b;        // [1, 21]
        if (num <= 20) return (num - 1) % 10 + 1;
    }
}
```

---

## 7.7 高频面试题精讲

### 题目 1：直线上最多的点数 (LeetCode 149)

```cpp
// 暴力 O(n²)：对每个点，统计其他点与它的斜率
int maxPoints(std::vector<std::vector<int>>& points) {
    int n = points.size();
    if (n <= 2) return n;

    int ans = 0;
    for (int i = 0; i < n; ++i) {
        std::unordered_map<std::string, int> slopeCount;
        int same = 1;  // 与 i 重合的点数

        for (int j = i + 1; j < n; ++j) {
            int dx = points[j][0] - points[i][0];
            int dy = points[j][1] - points[i][1];

            if (dx == 0 && dy == 0) {
                ++same;
                continue;
            }

            // 用 gcd 约分避免浮点精度问题
            int g = gcd(std::abs(dx), std::abs(dy));
            dx /= g;
            dy /= g;

            // 统一符号：让 dx 始终非负
            if (dx < 0) { dx = -dx; dy = -dy; }
            if (dx == 0) dy = 1;  // 垂直线统一表示

            std::string key = std::to_string(dx) + "/" + std::to_string(dy);
            ++slopeCount[key];
        }

        ans = std::max(ans, same);
        for (auto& [_, cnt] : slopeCount) {
            ans = std::max(ans, cnt + same);
        }
    }
    return ans;
}
```

### 题目 2：分数到小数 (LeetCode 166)

```cpp
// 模拟长除法，余数重复出现时开始循环节
std::string fractionToDecimal(int numerator, int denominator) {
    if (numerator == 0) return "0";

    std::string result;
    if ((numerator < 0) ^ (denominator < 0)) result += '-';

    long long n = std::llabs((long long)numerator);
    long long d = std::llabs((long long)denominator);

    // 整数部分
    result += std::to_string(n / d);
    long long remainder = n % d;
    if (remainder == 0) return result;

    result += '.';

    // 小数部分：用哈希表记录余数出现的位置
    std::unordered_map<long long, int> pos;
    while (remainder != 0) {
        if (pos.count(remainder)) {
            result.insert(pos[remainder], "(");
            result += ')';
            break;
        }
        pos[remainder] = result.size();
        remainder *= 10;
        result += std::to_string(remainder / d);
        remainder %= d;
    }
    return result;
}
```

---

## 7.8 🎮 游戏实战

### 7.8.1 伤害衰减公式 —— 快速幂

```cpp
// RPG 中常见的伤害衰减：每次攻击后伤害衰减为原来的 decay 倍
// 第 n 次攻击的伤害 = baseDamage * decay^(n-1)
// 总伤害（前 N 次攻击）= baseDamage * (1 - decay^N) / (1 - decay)
float totalDamage(float baseDamage, float decay, int attacks) {
    // 用快速幂思想计算 decay^attacks
    float decayN = 1.0f;
    float base = decay;
    int exp = attacks;
    while (exp > 0) {
        if (exp & 1) decayN *= base;
        base *= base;
        exp >>= 1;
    }
    return baseDamage * (1.0f - decayN) / (1.0f - decay);
}
```

### 7.8.2 屏幕宽高比计算 —— GCD

```cpp
// 给定屏幕分辨率 1920×1080，计算宽高比
// → gcd(1920, 1080) = 120 → 1920/120 : 1080/120 = 16:9
struct AspectRatio {
    int w, h;
    std::string toString() const { return std::to_string(w) + ":" + std::to_string(h); }
};

AspectRatio calcAspectRatio(int width, int height) {
    int g = gcd(width, height);
    return {width / g, height / g};
}
```

### 7.8.3 卡牌游戏洗牌 —— Fisher-Yates

```cpp
#include <random>
#include <vector>

class Deck {
    std::vector<int> _cards;

public:
    Deck(int numCards) {
        _cards.resize(numCards);
        std::iota(_cards.begin(), _cards.end(), 0);
    }

    void shuffle() {
        std::random_device rd;
        std::mt19937 gen(rd());

        for (int i = _cards.size() - 1; i > 0; --i) {
            std::uniform_int_distribution<int> dist(0, i);
            std::swap(_cards[i], _cards[dist(gen)]);
        }
    }

    int draw() {
        if (_cards.empty()) shuffle();  // 抽完了重新洗牌
        int card = _cards.back();
        _cards.pop_back();
        return card;
    }
};
```

### 7.8.4 随机匹配对手 —— 蓄水池抽样

```cpp
// 从在线玩家列表中随机选取一个对手，不遍历两遍
struct Player {
    int id;
    int rating;
};

Player findRandomOpponent(const std::vector<Player>& onlinePlayers,
                          int myRating, int maxDiff) {
    Player selected;
    int count = 0;

    for (const auto& player : onlinePlayers) {
        if (std::abs(player.rating - myRating) > maxDiff) continue;
        ++count;
        // 蓄水池抽样：以 1/count 的概率选中当前玩家
        if (rand() % count == 0) {
            selected = player;
        }
    }
    return selected;  // 如果没找到匹配对手，count = 0
}
```

---

## 7.9 30 秒速答

---

**Q：快速幂的原理？**

> 利用指数的二进制拆分：a^n = a^(n 的每一位二进制 1 对应的幂次) 的乘积。每次循环判断 n 的最低位是否为 1，是则乘上当前的 a；然后 a 自乘（a², a⁴, a⁸...），n 右移一位。时间复杂度 O(log n)。矩阵快速幂同理，把标量乘法换成矩阵乘法。

**Q：扩展欧几里得有什么用？**

> 求解 ax + by = gcd(a, b) 的一组整数解。核心应用是求乘法逆元：如果 gcd(a, m) = 1，可以用扩展欧几里得求出 a 在模 m 下的逆元 x（满足 a*x ≡ 1 mod m）。逆元在组合数取模、RSA 加密等场景中至关重要。

**Q：埃筛和线性筛的区别？**

> 埃筛 O(n log log n)：每个合数会被其所有质因数各筛一次。线性筛 O(n)：每个合数只被其最小质因数筛一次，通过 `if (i % p == 0) break` 实现。两者在实践中 n ≤ 1e7 时差异不大，但线性筛可以同时记录每个数的最小质因数。

**Q：洗牌算法如何保证均匀？**

> Fisher-Yates 算法：从后往前，每次从未处理的位置中随机选一个交换。第 i 个位置上的元素有 1/(i+1) 的概率来自任意未处理位置，能严格证明每种排列的概率都是 1/n!。常见错误做法是从整个数组中随机选——那会导致 nⁿ / n! 种结果无法均分。

**Q：蓄水池抽样的应用场景？**

> 从数据流（不定长、一次遍历）中随机抽取 k 个样本。前 k 个直接入池，之后第 i 个以 k/i 的概率替换池中随机一个元素。游戏中常见于"从符合条件的玩家中随机选一个对手"，不需要先数一遍有多少人。

---

## 7.10 本章习题清单

```
快速幂：
  □ 50.  Pow(x, n) —— 快速幂基础
  □ 372. 超级次方 —— 快速幂 + 模运算

GCD与扩展欧几里得：
  □ 914. 卡牌分组 —— GCD 应用
  □ 365. 水壶问题 —— 裴蜀定理

质数：
  □ 204. 计数质数 —— 埃筛基础
  □ 263. 丑数 —— 质因数分解入门

组合数学：
  □ 118. 杨辉三角 —— 组合数递推
  □ 62.  不同路径 —— 组合数 C(m+n, m)

随机算法：
  □ 384. 打乱数组 —— Fisher-Yates
  □ 398. 随机数索引 —— 蓄水池抽样
  □ 470. 用 Rand7() 实现 Rand10() —— 拒绝采样

挑战：
  □ 149. 直线上最多的点数 —— 斜率 + GCD 约分
  □ 166. 分数到小数 —— 长除法 + 循环节检测
```

---

> 📖 下一章：[第八章 位运算与状态压缩](../algorithm/08_bitwise) —— 从基础位操作到布隆过滤器，从 Layer Mask 到技能冷却位图。

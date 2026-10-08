---
title: "C 语言从头速通：从变量到指针与结构体"
published: 2026-10-08
pinned: false
weight: 3
description: "为零基础队员量身定制的 C 语言实战速通：数据类型与机器人常用整型、格式化输出调试、控制流与循环、函数封装、数组与二维像素直觉、指针门牌号模型与步长秘密、堆栈生命周期陷阱、结构体与串口通信字节对齐巨坑。"
tags: [C语言, 指针, 内存模型, 字节对齐, 结构体, 数组, 函数, 教程, 新手入门]
category: RC上位机入门
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 这一章是整个新手篇的语言根基。按照本文编写的时间段来说大部分同学可能没学过c语言，所以这章会从头开始讲c语言。c语言可以说是你学软件必不可少的一环。所以认真学，虽然有一些东西之后用不上但是学了也没坏处。

---

# 一、数据类型：计算机怎么存数字

## 1.1 整型家族

C 语言的变量本质上就是**一段被命名的内存空间**。不同的数据类型决定了这段内存有多大、能存什么范围的值。

```c
#include <stdio.h>
#include <stdint.h> // 这个头文件提供了精确宽度的整型，在机器人开发中非常常用

int main() {
    int a = 42;           // 通用整型，通常占 4 字节，范围约 ±21 亿
    short s = 100;        // 短整型，2 字节
    long long big = 1000000000000000000LL; // 64位长整型，带 LL 后缀避免浮点转换警告

    // 机器人开发中更常用的写法（精确指定字节宽度）：
    uint8_t  byte_val = 255;     // 无符号 8 位整数（1 字节，0~255）
    uint16_t half_val = 65535;   // 无符号 16 位整数（2 字节）
    int16_t  signed16 = -1000;   // 有符号 16 位整数

    printf("int 占 %zu 字节\n", sizeof(int));       // 4
    printf("uint8_t 占 %zu 字节\n", sizeof(uint8_t)); // 1

    return 0;
}
```

> **为什么机器人代码里满屏幕都是 `uint8_t`、`uint16_t`？**  
> 因为和电控单片机通信时，协议里的每一个字节都要**严格对齐**——"第 3 个字节是校验和"、"第 5~8 个字节是 float 坐标"。用 `int` 这种宽度不确定的类型（在某些平台上可能是 2 字节），通信就直接炸了。所以统一使用 `stdint.h` 里的精确宽度整型。

## 1.2 浮点型

机器人坐标、角度、速度，全部都是小数：

```c
float  target_x = 1.234f;   // 单精度浮点，4 字节，精度约 6~7 位有效数字
double precise  = 3.14159265358979; // 双精度浮点，8 字节，精度约 15~16 位
```

> 在 RC 上位机里，**`float` 就够用了**。你的机械臂精度也就毫米级别，用不到 `double` 那么多位有效数字。而且串口发 `float` 只有 4 字节，发 `double` 要 8 字节，带宽直接翻倍。

## 1.3 字符型

```c
char ch = 'A';        // 字符本质上就是一个 1 字节的整数（ASCII 码值）
char msg[] = "Hello"; // 字符串就是一串字符，末尾自动带一个 '\0'（空字符）
```

字符串在机器人代码里用得不多（串口通信基本都是二进制裸字节），但调试打日志时少不了。

---

# 二、printf：你最强的调试武器

在机器人视觉开发中，还没学会用调试器之前（下一章会讲），`printf` 就是你所有问题排查的第一条生命线。

## 2.1 常用格式占位符速查

```c
int    count   = 5;
float  dist    = 1.234f;
double angle   = 45.678;
char   label   = 'R';
char   name[]  = "red_block";

printf("检测到 %d 个目标\n", count);           // %d → 十进制整数
printf("距离: %.2f 米\n", dist);               // %.2f → 浮点数保留 2 位小数
printf("角度: %.3lf 度\n", angle);             // %lf → double（printf 中 %f 也行）
printf("类别: %c\n", label);                   // %c → 单个字符
printf("名称: %s\n", name);                    // %s → 字符串
printf("十六进制: 0x%02X\n", 0x0A);            // %02X → 大写十六进制，至少两位补零
printf("指针地址: %p\n", (void*)&count);       // %p → 打印内存地址
printf("结构体大小: %zu 字节\n", sizeof(int)); // %zu → size_t 类型
```

## 2.2 调试打印实战模板

写机器人代码时，养成在关键位置打印的习惯：

```c
// 在每帧图像处理后打印当前识别结果
printf("[帧 %d] 识别到 %d 个目标, 最近目标坐标: (%.3f, %.3f, %.3f)\n",
       frame_count, target_num, x, y, z);

// 调试串口发送时，打印原始字节
printf("[串口发送] ");
for (int i = 0; i < packet_len; i++) {
    printf("%02X ", send_buffer[i]);
}
printf("\n");
```

> `\n` 是换行符。如果你不加 `\n`，`printf` 的内容可能会积攒在缓冲区里不立刻显示出来，看起来就像程序"没有输出"。调试机器人代码时，**每条 `printf` 末尾务必带 `\n`**，或者在关键位置加上 `fflush(stdout);` 强制刷新。

---

# 三、控制流：让程序做判断和重复

## 3.1 条件判断 if / else if / else

```c
// 根据识别到的颜色决定发送哪个指令
int detected_color = 1; // 假设 0=无, 1=红色, 2=蓝色

if (detected_color == 1) {
    printf("检测到红色道具，准备抓取\n");
    // send_grab_command(RED);
} else if (detected_color == 2) {
    printf("检测到蓝色道具，跳过\n");
} else {
    printf("没有检测到目标\n");
}
```

### 常用比较与逻辑运算符

| 运算符 | 含义 | 示例 |
| :---: | :--- | :--- |
| `==` | 相等（注意是两个等号！） | `if (color == 1)` |
| `!=` | 不等 | `if (target != NULL)` |
| `>` `<` `>=` `<=` | 大小比较 | `if (distance < 0.5f)` |
| `&&` | 逻辑与（两个条件都要满足） | `if (area > 100 && ratio < 3.0)` |
| `\|\|` | 逻辑或（满足一个就行） | `if (color == 1 \|\| color == 2)` |
| `!` | 逻辑非（取反） | `if (!is_running)` |

> **最经典的新手 Bug：把 `==`（比较）写成 `=`（赋值）！**  
> `if (color = 1)` 不会报错，但它的含义变成了"把 1 赋值给 color，然后判断 1 是否为真"，结果永远为真！这个 Bug 能让你排查半天。

## 3.2 循环 for / while

```c
// for 循环：已知次数的遍历（最常用）
// 比如遍历识别到的 5 个目标轮廓
for (int i = 0; i < 5; i++) {
    printf("第 %d 个目标\n", i);
}

// while 循环：不知道具体次数，满足条件就一直跑
// 比如机器人主循环：只要程序没被关就一直识别
int running = 1;
while (running) {
    // 1. 从相机取一帧图
    // 2. 图像处理
    // 3. 发串口
    // 如果按了 ESC 键就退出
    // running = 0;
}
```

### `break` 和 `continue`

```c
// break：直接跳出当前循环
for (int i = 0; i < 100; i++) {
    if (found_target) {
        printf("找到了！不再继续搜索\n");
        break;  // 立刻退出 for 循环
    }
}

// continue：跳过本次迭代，直接进入下一轮循环
for (int i = 0; i < contour_count; i++) {
    if (area[i] < 50) {
        continue; // 面积太小，跳过这个噪点轮廓，检查下一个
    }
    // 下面的代码只有面积 >= 50 的轮廓才会执行
    process_contour(i);
}
```

---

# 四、函数：把代码拆成可复用的零件

函数是代码组织的基本单位。如果你把所有逻辑全塞在 `main()` 里，两百行之后你自己都看不懂。

## 4.1 函数的声明与定义

```c
#include <stdio.h>
#include <math.h>

// 函数声明（也叫"函数原型"）：告诉编译器有这么个函数存在
// 通常放在文件顶部或者头文件里
float calculate_distance(float x, float y, float z);

int main() {
    float x = 0.5f, y = 1.2f, z = 3.0f;
    float dist = calculate_distance(x, y, z);
    printf("目标距离: %.3f 米\n", dist);
    return 0;
}

// 函数定义（具体实现）
float calculate_distance(float x, float y, float z) {
    return sqrtf(x * x + y * y + z * z);
}
```

> **返回值类型**写在函数名前面。如果函数不需要返回任何东西，用 `void`：
> ```c
> void send_serial_data(uint8_t *data, int len) {
>     // 把 data 通过串口发出去，不需要返回值
> }
> ```

## 4.2 值传递 vs 地址传递

这是后面理解指针的基础中的基础！

**C 语言的函数参数永远是"复制"（值传递）**。你传进去的只是原变量的**拷贝副本**，在函数里怎么改都不会影响外面：

```c
void try_to_modify(int val) {
    val = 999; // 改的是副本，外面的 a 纹丝不动
}

int main() {
    int a = 10;
    try_to_modify(a);
    printf("a = %d\n", a); // 依然是 10！
    return 0;
}
```

如果你需要在函数里**真正修改外部变量**，就必须传它的地址（指针）。这个我们在指针章节细讲。

---

# 五、数组：一排连续的格子

## 5.1 一维数组

```c
// 声明一个能装 10 个 float 的数组
float distances[10];

// 初始化
float scores[5] = {95.0, 87.5, 91.0, 78.0, 100.0};

// 访问元素（下标从 0 开始！）
printf("第一个成绩: %.1f\n", scores[0]); // 95.0
printf("最后一个: %.1f\n", scores[4]);   // 100.0

// 遍历数组
for (int i = 0; i < 5; i++) {
    printf("scores[%d] = %.1f\n", i, scores[i]);
}
```

> **数组越界访问（Array Out of Bounds）是 C 语言第一大隐形杀手！**  
> C 语言不会帮你检查下标是否合法！`scores[5]` 或 `scores[-1]` 不会报错，但你读到的是内存里其他变量的值（脏数据），写入更是直接踩坏别人的内存——这是段错误（Segfault）和各种诡异 Bug 的温床。

## 5.2 二维数组（图像像素的直觉来源）

```c
// 3 行 4 列的二维数组
int matrix[3][4] = {
    {1, 2, 3, 4},
    {5, 6, 7, 8},
    {9, 10, 11, 12}
};

// 访问第 2 行第 3 列（下标从 0 开始）
printf("matrix[1][2] = %d\n", matrix[1][2]); // 7

// 嵌套循环遍历
for (int row = 0; row < 3; row++) {
    for (int col = 0; col < 4; col++) {
        printf("%3d ", matrix[row][col]);
    }
    printf("\n");
}
```

> **为什么要提前建立二维数组的直觉？**  
> 因为后面学 OpenCV 时你会发现：一张灰度图像在计算机里就是一个**巨大的二维数组**——行数是图像高度（像素行），列数是图像宽度（像素列），每个元素是 0~255 的亮度值。一张彩色图像则是三维数组（行 × 列 × 3 个通道 BGR）。

---

# 六、指针：C 语言的灵魂与最大的坑

指针是大一 C 语言课上劝退率最高的内容，也是后续所有上位机代码的底层基石。但它的本质，其实只有一句话——

## 6.1 指针只是一个"门牌号"

**计算机的内存本质上就是一条巨大的街道，排满了以 1 字节为单位的小格子，每个格子都有一个固定的门牌号（地址）。**

```
物理内存（以字节为单位）：
地址:  0x1000   0x1001   0x1002   0x1003   0x1004   0x1005 ...
内容: [  0x12 ] [  0x34 ] [  0x56 ] [  0x78 ] [  0xAA ] [  0xBB ] ...
```

- **普通变量**（如 `int a = 10;`）：编译器在内存里分了 4 个连续格子，起了个名叫 `a`。
- **指针变量**（如 `int *p = &a;`）：`p` 也是个变量，但它的格子里存的**不是普通数字，而是变量 `a` 的门牌号（内存地址）**。

```c
#include <stdio.h>

int main() {
    int a = 42;
    int *p = &a;  // & 是取地址运算符，拿到 a 的门牌号

    printf("a 的值: %d\n", a);             // 42
    printf("a 的地址: %p\n", (void*)&a);   // 0x7ffee1234568（每次运行不同）
    printf("p 存的地址: %p\n", (void*)p);  // 和上面一样！
    printf("p 指向的值: %d\n", *p);        // 42（* 是解引用，顺着门牌号找到对应的值）

    *p = 100; // 通过指针修改 a 的值
    printf("修改后 a = %d\n", a); // 100！

    return 0;
}
```

三个核心运算符：
- `&variable`：取地址——"告诉我 `variable` 住在哪条街几号"。
- `*pointer`：解引用——"顺着这个门牌号去看看里面住的是什么"。
- `type *name`：声明一个指针变量——"这个变量专门用来存门牌号"。

> 在 64 位系统（你现在用的 Ubuntu、车载工控机）上，**所有指针变量本身的体积一律是 8 个字节**——不管它是 `char*`、`int*` 还是复杂结构体指针。因为 64 位系统的门牌号（地址空间）本身就是一个 64 位长整数。

---

## 6.2 指针类型的秘密：步长与视口

既然指针里存的都只是一个 8 字节的门牌号，那为什么要分 `int*`、`float*`、`char*`？

**指针类型决定了两件事：**

1. **解引用（`*p`）时，从这个门牌号开始往后读几个字节？**
   - `char* p`：读 **1 个字节**。
   - `int* p`：读 **4 个字节**并拼成一个整数。
   - `float* p`：读 **4 个字节**并解读为浮点数。
2. **指针加减（`p + 1`）时，门牌号跳多远？**
   - `char* p; p + 1;` → 地址 **+1**。
   - `int* p; p + 1;` → 地址 **+4**。
   - `double* p; p + 1;` → 地址 **+8**。

```c
int arr[4] = {10, 20, 30, 40};
int *p = arr;  // 数组名 arr 本身就是首元素的地址

printf("p 指向: %d\n", *p);       // 10
printf("p+1 指向: %d\n", *(p+1)); // 20（地址跳了 4 字节，正好是下一个 int）
printf("p+2 指向: %d\n", *(p+2)); // 30
```

### 在机器人通信中的实战意义

串口收到的数据永远是一堆裸字节。用 `uint8_t*` 逐字节遍历、解析：

```c
uint8_t recv_buffer[64]; // 从串口收到的原始字节
uint8_t *ptr = recv_buffer;

// ptr++ 每次只移动 1 个字节，精确地逐字节解析协议
uint8_t header = *ptr; ptr++;
uint8_t cmd_id = *ptr; ptr++;
// ...
```

---

## 6.3 用指针实现"函数内修改外部变量"

前面在函数章节留了一个悬念：参数是值传递，怎么让函数真正修改外面的变量？答案是——**传地址进去！**

```c
// 识别到目标后，把坐标写回调用者
void detect_target(float *out_x, float *out_y) {
    // 经过一系列图像算法计算后，得到了坐标
    *out_x = 1.5f;  // 通过指针写入调用者提供的内存
    *out_y = 2.3f;
}

int main() {
    float target_x = 0, target_y = 0;
    detect_target(&target_x, &target_y); // 把变量的地址传进去
    printf("目标: (%.1f, %.1f)\n", target_x, target_y); // (1.5, 2.3) ✓
    return 0;
}
```

---

## 6.4 数组与指针的暧昧关系

在 C 语言中，数组名在绝大多数场合下会**自动"衰退"成指向首元素的指针**：

```c
int arr[5] = {1, 2, 3, 4, 5};
int *p = arr; // arr 自动变成 &arr[0]

// 以下两种写法完全等价：
printf("%d\n", arr[2]);    // 3（数组下标方式）
printf("%d\n", *(p + 2));  // 3（指针偏移方式）
```

这就是为什么 C 语言的函数传数组时，参数写 `int arr[]` 和写 `int *arr` 是一模一样的：

```c
// 这两种写法 100% 等价
void print_array(int arr[], int len);
void print_array(int *arr, int len);
```

---

# 七、内存区域：堆 vs 栈

在写机器人代码时，内存分配主要发生在这两个地方：

## 7.1 栈（Stack）—— 自动分配、自动回收

```c
void some_function() {
    int local_var = 10;       // 栈上分配
    float coords[3] = {0};   // 栈上分配
    // 函数执行完毕后，上面所有局部变量自动回收，不用管
}
```

| 特性 | 栈 |
| :--- | :--- |
| 谁负责管理？ | 编译器全自动 |
| 速度 | 极快（CPU 指令级操作） |
| 空间大小 | 很小（通常 1~8 MB） |
| 生命周期 | 随函数结束立刻销毁 |

## 7.2 堆（Heap）—— 手动借用、手动归还

```c
#include <stdlib.h>

// 从堆上申请一块 1920×1080 字节的内存（相当于一帧灰度图）
uint8_t *frame_buffer = (uint8_t*)malloc(1920 * 1080);

if (frame_buffer == NULL) {
    printf("内存分配失败！\n");
    return -1;
}

// 使用这块内存...
frame_buffer[0] = 128;

// 用完必须归还！
free(frame_buffer);
frame_buffer = NULL; // 好习惯：释放后把指针置空，防止后续误用
```

| 特性 | 堆 |
| :--- | :--- |
| 谁负责管理？ | **程序员手动** `malloc` / `free` |
| 速度 | 比栈慢 |
| 空间大小 | 巨大（GB 级别，几乎等于系统可用内存） |
| 生命周期 | 直到你手动 `free`，否则一直占着不放 |

---

## 7.3 两大致命陷阱

### 陷阱 1：返回局部变量的指针（悬垂指针 / Dangling Pointer）

```c
// ❌ 经典送命代码！
float* get_target_coords() {
    float coords[2] = {1.5f, 3.2f}; // coords 分配在栈上
    return coords; // 函数结束，栈帧立刻被回收！
}

int main() {
    float *pos = get_target_coords();
    // 此时 pos 指向的内存已经失效
    printf("X: %f\n", pos[0]); // 可能输出乱码，也可能直接 Segfault 闪退！
    return 0;
}
```

> 栈上的局部变量，**出了函数大括号就死了**！如果你需要在函数外继续使用数据，要么让调用者传入缓冲区指针，要么用 `malloc` 在堆上分配。

### 陷阱 2：内存泄漏（Memory Leak）—— 机器人宕机元凶

如果你在主循环里每帧 `malloc` 了一块内存却忘记 `free`：

```c
while (running) {
    uint8_t *buf = (uint8_t*)malloc(1920 * 1080); // 每帧借 2MB
    // 处理图像...
    // 忘写 free(buf); 了！
}
```

- 以 60 FPS 运行：每秒泄漏 120 MB
- 跑 1 分钟：吃掉 7.2 GB
- 工控机 8GB 内存跑满，系统直接 OOM（Out of Memory）杀掉你的进程 → **赛场上车子无预警暴毙！**

> 后面学到现代 C++ 之后，我们会用**智能指针**和 **RAII 机制**彻底杜绝手动 `free` 的心智负担。但在纯 C 阶段，请务必做到**谁 `malloc` 谁 `free`，一一对应**。

---

# 八、结构体：把相关数据打包在一起

## 8.1 为什么需要结构体？

当你识别了一个目标道具，它至少有这些属性：颜色编号、中心像素坐标 $(u, v)$、三维空间坐标 $(X, Y, Z)$、置信度……如果全用零散变量，代码会变成灾难：

```c
// ❌ 散装变量，目标一多就彻底失控
int target1_color, target2_color, target3_color;
float target1_x, target1_y, target1_z;
float target2_x, target2_y, target2_z;
// ... 疯了
```

结构体的意义就是：**把一组逻辑上相关的数据捆绑成一个整体**。

```c
// ✅ 定义一个"目标信息"结构体
struct Target {
    int color;      // 颜色编号：1=红, 2=蓝
    float x, y, z;  // 空间坐标（米）
    float confidence; // 置信度 0~1
};
```

## 8.2 结构体的使用与 typedef

在纯 C 语言中，每次声明变量都必须带上 `struct` 关键字（如 `struct Target t1;`）。在实际工程中，通常使用 `typedef` 为结构体起一个简短的类型别名：

```c
#include <stdio.h>

// 纯 C 工程标准写法：使用 typedef 起别名
typedef struct {
    int color;
    float x, y, z;
    float confidence;
} Target;

int main() {
    // 使用 typedef 后，可以直接写 Target，无需每次都敲 struct
    Target t1 = {1, 0.5f, 1.2f, 3.0f, 0.95f};

    // 用 . 运算符访问成员
    printf("颜色: %d, 坐标: (%.2f, %.2f, %.2f), 置信度: %.0f%%\n",
           t1.color, t1.x, t1.y, t1.z, t1.confidence * 100);

    // 结构体数组：管理多个目标
    Target targets[10];
    targets[0].color = 2;
    targets[0].x = 1.0f;

    // 指向结构体的指针
    Target *ptr = &t1;
    printf("通过指针访问: %.2f\n", ptr->x); // 指针用 -> 运算符

    return 0;
}
```

> **`.` 和 `->` 的区别记忆法**：  
> - `t1.x`：`t1` 是结构体变量本身（一个实体），用**点号** `.`。  
> - `ptr->x`：`ptr` 是结构体指针（一个门牌号），用**箭头** `->`。  
> 本质上 `ptr->x` 等价于 `(*ptr).x`（先解引用再取成员），箭头只是语法糖。在下一章学了现代 C++ 之后，C++ 会自动允许省略 `struct` 关键字。

---

## 8.3 结构体字节对齐 —— 串口通信的头号暗坑

这是所有上位机和电控联调中 **100% 会被痛击** 的隐蔽巨坑！

假设你和电控约定了一个极简的数据包：

```c
// 约定发给下位机的包：帧头 + 道具坐标 (x, y)
struct TargetPacket {
    uint8_t header; // 帧头 0xA5（1 字节）
    float x;        // X 坐标（4 字节）
    float y;        // Y 坐标（4 字节）
};
```

你掐指一算：$1 + 4 + 4 = 9$ 个字节。但如果你在电脑上打印：

```c
printf("结构体大小: %zu 字节\n", sizeof(struct TargetPacket));
```

**输出是 12 字节！凭空多了 3 字节！**

### 为什么？

现代 CPU 读内存是按 4 字节（32 位）或 8 字节（64 位）的块来操作的。如果一个 4 字节的 `float` 没有存放在 4 的倍数的地址上，CPU 就要跨两个块拼接读取，效率很低。

为了对齐，编译器会在 1 字节的 `header` 后面**悄悄塞入 3 个空白字节（Padding）**：

```
实际内存布局：
[header: 1B] [填充: 3B 垃圾!] [float x: 4B] [float y: 4B]  → 共 12 字节！
```

### 串口通信上的灾难

- 上位机以为发了 9 字节，其实 `sizeof` 算出来发了 12 字节——多出 3 个垃圾；
- 或者上位机发了紧凑的 9 字节，但电控单片机的结构体编译器开了对齐，解析时会把填充位读成坐标的高位字节；
- **结果就是：电控收到的坐标完全是乱码，机械臂直接甩飞或撞断！**

### 解药：`#pragma pack(push, 1)` 单字节紧凑对齐

在**所有跨设备通信协议的结构体定义**中，必须强制 1 字节对齐：

```c
#pragma pack(push, 1)  // 从这里开始，编译器不许填充任何空白字节

typedef struct {
    uint8_t header; // 偏移 0, 占 1 字节
    float x;        // 偏移 1, 占 4 字节
    float y;        // 偏移 5, 占 4 字节
} TargetPacket;
// sizeof(TargetPacket) == 9 ✓ 严丝合缝！

#pragma pack(pop)  // 恢复编译器默认对齐规则（非通信的普通结构体可以继续享受对齐优化）
```

---

### 嵌入式隐形炸弹：非对齐访问与 HardFault（为什么必须用 memcpy）

在上位机 PC（x86 架构）上，CPU 内部有硬件支持非对齐内存访问，强行读取偏移为 1 的 `float` 只会损耗微弱的性能。  
**但是电控单片机（如 ARM Cortex-M0/M3 或开启了严格对齐检查的 MCU/DSP）则完全不同**：  
如果单片机代码直接用指针访问非 4 字节对齐的浮点数（如 `float val = pkt_ptr->x;`），底层硬件可能会直接触发 **`HardFault`（硬件错误异常中断），整台车当场死机！**

此外，将裸字节缓冲区强转为非对齐结构体指针还违反了 C/C++ 的严格别名规则（Strict Aliasing Rule），在 `-O2` 优化下极易被编译器负优化。

**工业级最佳实践：永远使用 `memcpy` 进行内存打包与解包**：

```c
#include <string.h>

// 发送端（上位机）：
uint8_t tx_buffer[sizeof(TargetPacket)];
TargetPacket send_pkt = {0xA5, 1.234f, 2.345f};
memcpy(tx_buffer, &send_pkt, sizeof(TargetPacket)); // 安全打包为字节流发送

// 接收端（单片机）：
TargetPacket recv_pkt;
memcpy(&recv_pkt, rx_buffer, sizeof(TargetPacket)); // 安全还原，绝不触发非对齐硬件中断！
```

---

# 九、头文件与多文件组织（预习）

到目前为止你可能把所有代码都写在一个 `main.c` 里。但一旦代码超过两三百行，你就需要拆文件了。

## 核心规则

- **`.h` 头文件**：放函数声明（原型）、结构体定义、宏定义、`#include` 其他头文件。
- **`.c` 源文件**：放函数的具体实现。
- **`#include "xxx.h"`**：本质上就是把 `xxx.h` 的内容原封不动地复制粘贴到当前位置。

```c
// ======== target.h ========
#ifndef TARGET_H    // 防止被重复包含（头文件保护宏）
#define TARGET_H

#include <stdint.h>

#pragma pack(push, 1)
struct TargetPacket {
    uint8_t header;
    float x, y, z;
    uint8_t checksum;
};
#pragma pack(pop)

// 函数声明
float calculate_distance(float x, float y, float z);

#endif // TARGET_H
```

```c
// ======== target.c ========
#include "target.h"
#include <math.h>

// 函数实现
float calculate_distance(float x, float y, float z) {
    return sqrtf(x * x + y * y + z * z);
}
```

```c
// ======== main.c ========
#include <stdio.h>
#include "target.h"

int main() {
    struct TargetPacket pkt = {0xA5, 1.0f, 2.0f, 3.0f, 0};
    float dist = calculate_distance(pkt.x, pkt.y, pkt.z);
    printf("距离: %.3f 米\n", dist);
    return 0;
}
```

编译时把所有 `.c` 一起交给编译器：
```bash
gcc main.c target.c -o my_robot -lm
```

> `-lm` 是链接数学库（`math.h` 里的 `sqrtf` 等函数需要它）。下一章我们会用 CMake 来自动管理这些编译命令，彻底告别手敲 `gcc` 长命令。

---

# 🎯 本章通关小作业

请在你的 Ubuntu 系统里创建以下文件并编译运行：

### 作业 1：结构体对齐验证
定义一个结构体：
```c
struct SensorData {
    uint8_t  sensor_id;    // 1 字节
    double   temperature;  // 8 字节
    uint8_t  status;       // 1 字节
};
```
- 先不加 `#pragma pack`，打印 `sizeof`（你会发现它是 24 字节而不是 10 字节！）；
- 加上 `#pragma pack(push, 1)` 后再次打印，确认变为 10 字节。

### 作业 2：指针逐字节查看浮点数的内存表示（与大小端序）
```c
float target_x = 1.234f;
uint8_t *byte_ptr = (uint8_t*)&target_x;
printf("float 1.234 在内存中的 4 个字节: ");
for (int i = 0; i < 4; i++) {
    printf("%02X ", byte_ptr[i]);
}
printf("\n");
```
亲眼看看一个浮点数在内存中长什么样——这就是串口发给电控时，`float` 坐标被拆成的那 4 个原始字节！

> **为什么打印出的十六进制顺序是反的？（大小端序 Little-Endian）**  
> 在 IEEE 754 标准中，`1.234f` 的十六进制表示本应是 `0x3F9DF3B6`。但在你的电脑终端打印出来的顺序通常是 `B6 F3 9D 3F`——顺序完全倒过来了！  
> 这是因为现代 x86 和绝大多数 ARM 单片机都采用**小端序（Little-Endian）**：数据的低位字节存储在低内存地址中。只要上位机和单片机都是小端序架构，直接通过 `memcpy` 发送和接收就能无缝解析；但如果对接的是大端序（Big-Endian）设备，就必须先做字节翻转。

### 作业 3（挑战）：多文件编译
把作业 1 和作业 2 拆成 `sensor.h`、`sensor.c` 和 `main.c` 三个文件，用手动 `gcc` 命令编译成功运行。

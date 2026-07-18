---
title: "第九章 调试与性能分析"
published: 2026-04-27
pinned: false
description: "**面试突击 · 调试与性能分析。** 从 ps/top/htop/proc 文件系统的进程探查到 strace/ltrace 系统调用级追踪，从 gdb 断点/多线程/core dump 调试三件套到 valgrind/ASan 内存杀手锏，从 perf 硬件计数器与火焰图的热点定位到 perf c2c 的伪共享检测——再到 UE5 Memory Report、自定义内存追踪与帧时间 CPU/GPU-bound 判定，一文覆盖面试中所有「你怎么排查？」的实战题。"
tags: [操作系统, 面试, 调试, 性能分析, gdb, perf, strace, 火焰图, valgrind, AddressSanitizer, 游戏引擎]
category: 操作系统笔记
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

# 第九章 调试与性能分析

> **一句话理解**：调试和性能分析是区分「会写代码」和「能解决线上问题」的分水岭。面试官问「你怎么排查 XXX？」时，他听的不仅是工具名，更是你的排查思路。

---

## 9.1 进程与系统信息

当一个游戏进程出问题时，第一件事永远是——**搞清楚这个进程在干什么**。

### 进程信息快照

```bash
# ===== ps —— 进程状态快照 =====
ps aux                  # 所有进程详情
ps -eLf                 # 显示所有线程（-L = 显示 LWP）
ps -p <pid> -o pid,ppid,pcpu,pmem,stat,comm,args

# 输出示例：
# PID  PPID %CPU %MEM STAT COMMAND
# 1234  567  45.2  8.3 Sl+  UE5Editor-Linux-Shippin

# STAT 字段解读：
#   第一个字符 = 进程状态:
#     R = Running (运行中 / 就绪队列中)
#     S = Sleeping (可中断睡眠——等待事件)
#     D = Disk Sleep (不可中断睡眠——等待 I/O, 无法 kill)
#     Z = Zombie (僵尸——子进程死了但父进程还没 wait)
#     T = Stopped (被 SIGSTOP 暂停)
#
#   附加标志:
#     s = 会话 Leader
#     l = 多线程
#     + = 前台进程组

# 面试常问：看到 D 状态怎么办？
# → 进程在等待磁盘 I/O，通常卡在 read/write 上
# → cat /proc/<pid>/stack 看卡在哪个内核函数
# → iostat 看磁盘负载
```

```bash
# ===== top / htop —— 实时监控 =====
top -p <pid>            # 监视指定进程
htop -p <pid>           # 更友好的界面, 支持鼠标

# top 中要注意的列：
#   RES  (常驻内存): 进程实际占用的物理内存
#   VIRT (虚拟内存): 进程申请的虚拟地址空间大小
#   SHR  (共享内存): 与其他进程共享的内存
#   当 RES 持续增长而 VIRT 稳定 → 可能的内存泄漏
#   当 VIRT 持续增长 → 可能是碎片化

# htop 额外能力：
#   F2 → Setup → Columns → 添加自定义列 (如 OOM Score)
#   F5 → Tree view → 看进程树和线程树
```

### /proc 文件系统 —— Linux 的诊断金矿

```
/proc 不是真实文件系统——它是内核向用户态暴露的运行时信息接口。
所有文件大小看似 0，read 时内核动态生成内容。
```

```bash
# ===== 进程基本信息 =====
cat /proc/<pid>/status          # 进程状态摘要
#   Name:   UE5Editor
#   State:  S (sleeping)
#   Tgid:   1234                 # 线程组 ID (PID)
#   VmRSS:  2458000 kB          # 常驻物理内存 (~2.3GB)
#   VmSize: 5200000 kB          # 虚拟内存
#   Threads: 47                 # 线程数
#   voluntary_ctxt_switches:    # 主动上下文切换 (等 I/O/yield)
#   nonvoluntary_ctxt_switches: # 被动上下文切换 (时间片到)

cat /proc/<pid>/stat             # 机器解析用 (空格分隔的一行)
cat /proc/<pid>/io               # I/O 统计 (读了写了多少字节)
#   read_bytes: 1234567890      # 从存储层读的字节
#   write_bytes: 987654321      # 写到存储层的字节
#   关键：read_bytes 远大于预期 → 可能没有利用好 Page Cache

# ===== 内存映射 =====
cat /proc/<pid>/maps             # 进程的虚拟内存映射
#   00400000-00401000 r-xp ... /path/to/engine   # 代码段
#   7f1234000000-7f1238000000 rw-p ...            # 堆 / mmap
#   7ffd00000000-7ffd00010000 rw-p ... [stack]
#   7ffd00010000-7ffd00020000 rw-p ... [vvar]     # vDSO
#
#   用途：
#   - 看哪个库加载在了哪里
#   - 看堆有多大（计算 rw-p 段总和）
#   - 发现奇怪的大段 mmap（可能是资源文件映射）

cat /proc/<pid>/smaps            # 详细的内存映射 (每个段的详细信息)
#   包含每个段的 RSS/PSS/Shared 细分 → 找内存大户

# ===== 文件描述符 =====
ls -la /proc/<pid>/fd/           # 所有打开的文件描述符
#   lrwx------ 3 -> /dev/nvidia0          (GPU)
#   lrwx------ 25 -> /game/Content/Paks/  (资源包)
#   lrwx------ 47 -> socket:[123456]      (网络连接)
#   → 如果 fd 数量持续增长 → fd 泄漏！

# ===== 线程信息 =====
ls /proc/<pid>/task/             # 每个线程一个子目录
#   /proc/<pid>/task/<tid>/      用 tid 查看线程状态
cat /proc/<pid>/task/<tid>/status | grep State

# ===== 调用栈 =====
cat /proc/<pid>/stack            # 内核调用栈 (卡在内核时超有用！)
#   看到 read() → vfs_read() → ext4_file_read() → ...
#   → 说明进程卡在磁盘 I/O 上

cat /proc/<pid>/wchan            # 阻塞时在哪个内核函数上
```

### lsof —— 打开文件与端口一览

```bash
lsof -p <pid>                    # 进程打开的所有文件和 socket
lsof -i :7777                    # 谁在用 7777 端口
lsof -i tcp                      # 所有 TCP 连接
lsof +D /game/resources/         # 哪些进程在访问这个目录

# 游戏服务器常用：
#   lsof -p <pid> | grep "PAK\|uasset"  # 打开了哪些资源文件
#   lsof -p <pid> | wc -l              # 打开了多少文件
#   → 如果数量一直在涨 → fd 泄漏！
```

### Windows 等价工具

```
Linux `ps`       →  tasklist / Get-Process
Linux `top/htop` →  任务管理器 / Process Explorer (Sysinternals)
Linux `/proc`    →  Process Explorer 右键 → Properties → Threads/Handles
Linux `lsof`     →  handle.exe (Sysinternals) / Process Explorer → Handles

Process Explorer 关键用法：
  - Ctrl+H → 按 Handle 数量排序 (高亮进程)
  - 双击进程 → Threads 标签 → 看每个线程的 CPU + 调用栈
  - 双击进程 → Performance 标签 → I/O 字节数
  - 双击进程 → TCP/IP 标签 → 网络连接
```

---

## 9.2 系统调用追踪

当一个进程「卡住了」「行为异常了」但代码看上去没问题——追踪它在内核层面在做什么。

### strace —— Linux 系统调用追踪

```bash
# ===== 基本用法 =====
strace ./my_program                  # 从启动开始追踪
strace -p <pid>                      # 附加到运行中的进程
strace -p <pid> -f                   # -f: 同时追踪子线程
strace -p <pid> -ff -o trace.log     # 每个线程输出到独立文件

# ===== 核心选项 =====
strace -e trace=open,read,write ./prog    # 只追踪指定系统调用
strace -e trace=network                    # 只追踪网络相关
strace -e trace=file                       # 只追踪文件相关
strace -c ./prog                           # 统计汇总 (时间/次数)
strace -T ./prog                           # 显示每次调用的耗时
strace -tt ./prog                          # 显示微秒级时间戳
strace -y ./prog                           # 显示 fd 对应的路径
strace -k ./prog                           # 每次 syscall 显示调用栈
```

#### strace 四大实战场景

```bash
# ===== 场景 1：文件找不到 =====
# 问题：程序报 "file not found" 但路径明明是对的
strace -e trace=open,openat,stat ./prog 2>&1 | grep ENOENT
# 输出：
#   openat(AT_FDCWD, "/game/textures/player.dds", O_RDONLY) = -1 ENOENT
#   → 立刻看到它在找哪个路径！可能是相对路径 vs 绝对路径问题

# ===== 场景 2：权限问题 =====
strace -e trace=open,openat ./prog 2>&1 | grep EACCES
# 输出：
#   openat(AT_FDCWD, "/etc/game.conf", O_RDONLY) = -1 EACCES
#   → 权限不够！ls -la /etc/game.conf 检查

# ===== 场景 3：进程卡死 —— 它在等什么？ =====
strace -p <pid>
# 输出(卡在最后一行不动)：
#   futex(0x7f..., FUTEX_WAIT, 2, NULL) = ?
#   → 它在等一个 futex (锁)！很可能是死锁！
#   或者：
#   read(25, <unfinished ...>
#   → 它在等 socket fd=25 的数据，网络可能有问题

# ===== 场景 4：性能分析 (哪些系统调用最慢？) =====
strace -c -p <pid>    # 运行一段时间后 Ctrl+C
#   % time     seconds  usecs/call     calls    syscall
#   ------ ----------- ----------- --------- ------------
#    75.23    2.345678       23456       100    read
#    15.45    0.481234          12     40000    write
#     5.12    0.159876         159      1000    futex
#   → read() 占了 75% 的时间，平均每次 23ms → 磁盘 I/O？
#   → futex 平均每次 159μs → 有锁竞争
```

```
面试中 strace 的典型表述：

"遇到进程卡死，我首先 strace -p <pid> 看最后几个系统调用——
看它是卡在 read/write (等 I/O) 还是 futex (等锁) 还是 poll/epoll_wait (等事件)。
然后结合 /proc/<pid>/stack 看内核栈双重确认。"
```

### ltrace —— 库函数追踪

```bash
ltrace -p <pid>                    # 追踪 libc 调用
ltrace -e malloc+free ./prog       # 只追踪内存分配
# 输出：
#   malloc(1048576) = 0x7f1234000000
#   free(0x7f1234000000)
#   → 直观看到内存分配模式
```

### Windows 等价工具

```
Linux strace    →  Process Monitor (ProcMon) —— 记录所有文件/注册表/网络活动
Linux ltrace    →  API Monitor —— 追踪 Win32 API 调用
高级分析         →  ETW (Event Tracing for Windows) —— 内核级事件追踪

ProcMon 关键用法：
  - Filter: Process Name is UE5Editor.exe → 只看目标进程
  - 右键事件 → Stack → 看到底是哪个函数触发的
  - 列: Operation=ReadFile/WriteFile, Result=SUCCESS/ACCESS DENIED
  - 大量 NAME NOT FOUND → 配置路径问题
```

---

## 9.3 调试

### gdb 核心用法

```bash
# ===== 启动调试 =====
gdb ./my_program                    # 调试可执行文件
gdb ./my_program core               # 分析 core dump
gdb -p <pid>                        # 附加到运行中的进程

# ===== 断点 =====
break main                          # 函数断点
break engine.cpp:347                # 文件:行号
break engine.cpp:347 if x > 100    # 条件断点
break *0x400123                     # 地址断点
info breakpoints                    # 列出所有断点
delete 2                            # 删除 2 号断点
disable/enable 2                    # 临时禁用/启用

# ===== 单步执行 =====
run                                 # 开始运行
next (n)                            # 单步执行 (跳过函数调用)
step (s)                            # 单步执行 (进入函数调用)
finish                              # 执行完当前函数
continue (c)                        # 继续运行
until 500                           # 运行到第 500 行

# ===== 检查数据 =====
print var                           # 打印变量
print/x var                         # 以十六进制打印
print ptr[0]@10                     # 打印数组的前 10 个元素
print *(Entity*)0x7f1234000000     # 将内存地址强转为类型
display var                         # 每次停下时自动打印这个变量
info locals                         # 当前栈帧的所有局部变量

# ===== 栈帧 =====
backtrace (bt)                      # 打印调用栈
backtrace full                      # 打印调用栈 + 所有局部变量
frame 3                             # 切换到第 3 号栈帧
up / down                           # 上下移动栈帧
info args                           # 当前函数的参数
```

#### 多线程调试

```bash
# ===== 多线程是 gdb 调试的难点 =====
info threads                        # 列出所有线程
#   Id   Target Id          Frame
#   1    Thread ... (LWP 1234) ... 
#   2    Thread ... (LWP 1235) ... (卡在 futex_wait)
#   3    Thread ... (LWP 1236) ... (卡在 read)

thread 3                            # 切换到线程 3
thread apply all bt                 # 所有线程的调用栈！死锁排查神器
thread apply 2-5 bt                 # 看 2~5 号线程的栈

# 为特定线程设断点
break engine.cpp:347 thread 3

# 调度器锁定模式 (防止其他线程干扰单步调试)
set scheduler-locking on            # 只运行当前线程
set scheduler-locking off           # 恢复所有线程运行
```

#### Core Dump 分析 —— 死后验尸

```bash
# ===== 启用 core dump =====
ulimit -c unlimited                  # 允许产生 core 文件
echo "/tmp/core.%e.%p" > /proc/sys/kernel/core_pattern  # 设置 core 路径

# ===== 分析 core dump =====
gdb ./my_program /tmp/core.my_program.1234

# gdb 中：
bt                                  # 崩溃时的调用栈
bt full                             # + 所有局部变量值
info registers                      # 崩溃时的寄存器状态
frame 0                             # 回到崩溃点
list                                # 崩溃点附近的代码
print ptr                           # 看看是哪个指针炸了

# 常见崩溃快速定位：
#   SIGSEGV at 0x0       → 空指针解引用
#   SIGSEGV at 0xdead... → Use-After-Free (被填充了 magic 值)
#   SIGABRT              → assert 失败 / abort()
#   SIGFPE               → 除零
```

#### Watchpoint —— 追踪谁改了变量

```bash
# ===== 监视内存变化 =====
watch myvar                         # 监视变量被写入(需要硬件支持)
watch *0x7f1234000000              # 监视地址
rwatch myvar                        # 监视被读取
awatch myvar                        # 监视被读写

# 典型场景：某个值莫名其妙被改了
# → watch 这个值 → 下次被写入时断下 → bt 看是谁改的
# 限制：硬件 watchpoint 通常最多 4 个
```

### Valgrind / AddressSanitizer —— 内存杀手锏

```
两类工具的定位：

Valgrind (memcheck)：
  运行时解释执行分析，极慢 (~10-20x)，但不需要重新编译
  适合：离线分析 / CI 流水线

AddressSanitizer (ASan)：
  编译时插桩，运行时快 (~2x)，需要重新编译 (-fsanitize=address)
  适合：日常开发 / 集成测试
```

```bash
# ===== Valgrind memcheck =====
valgrind --leak-check=full ./my_program
valgrind --leak-check=full --show-leak-kinds=all ./my_program
valgrind --leak-check=full --track-origins=yes ./my_program

# 输出：
# ==1234== 128 bytes in 1 blocks are definitely lost
# ==1234==    at 0x4C2B0E0: operator new(unsigned long)
# ==1234==    by 0x401234: Entity::create() (entity.cpp:47)
#   → 在 entity.cpp:47 分配了 128B 没释放

# 泄漏类型：
#   definitely lost: 确定泄漏 (没有任何指针指向这块内存)
#   indirectly lost: 间接泄漏 (指向它的指针本身也泄漏了)
#   possibly lost: 可能泄漏 (指针指向块内部——可能是自定义分配器)
#   still reachable: 还有指针指向它但程序结束了 (通常是全局变量)

# ===== AddressSanitizer =====
# 编译时加标志：
g++ -fsanitize=address -g -O1 -o my_program my_program.cpp
./my_program
# ASan 检测到问题时会立即打印详细报告

# 检测列表：
#   ✅ 堆缓冲区溢出 (Heap buffer overflow)
#   ✅ 栈缓冲区溢出 (Stack buffer overflow)
#   ✅ 全局缓冲区溢出 (Global buffer overflow)
#   ✅ Use-After-Free
#   ✅ Use-After-Return
#   ✅ Double-Free
#   ✅ 内存泄漏 (LeakSanitizer, 程序退出时)
```

### Windows 调试

```
Visual Studio Debugger —— 日常开发首选：
  - Parallel Stacks (Debug → Windows → Parallel Stacks)
    → 多线程调试神器——一个窗口看所有线程的调用栈
    → 快速发现哪个线程在等锁、哪个在 I/O
  - Memory Window (Debug → Windows → Memory)
    → 直接查看原始内存
  - Disassembly Window
    → 看编译器生成的汇编
  - 条件断点 + 命中计数断点
  - 数据断点 (= gdb 的 watchpoint)

WinDbg —— 分析 crash dump：
  - 打开 dump 文件 → !analyze -v
  - k → 调用栈
  - !address → 内存布局
  - !locks → 查看临界区锁
  - .ecxr → 显示崩溃时的 CPU 上下文
```

---

## 9.4 性能分析

### perf —— Linux 性能分析瑞士军刀

perf 直接读取 CPU 的硬件性能计数器（PMU），能看到缓存未命中、分支预测失败等微观事件。

```bash
# ===== perf stat：硬件计数器总览 =====
perf stat ./my_program
# 输出：
#      12,345,678,901   cycles                         #  3.500 GHz
#       8,234,567,890   instructions                   #  0.67 insn per cycle
#         123,456,789   cache-misses                   #   15% of all cache refs
#          45,678,901   branch-misses                  #   2.5% of all branches
#            1.234567   task-clock (msec)

# 关键指标解读：
#   IPC < 1.0       → CPU 经常在等内存 (cache miss)
#   IPC < 0.5       → 严重的内存瓶颈
#   cache-miss > 5% → 数据局部性差
#   branch-miss 高  → 多分支代码，分支没规律

perf stat -e cycles,instructions,cache-references,cache-misses,\
L1-dcache-loads,L1-dcache-load-misses,LLC-loads,LLC-load-misses,\
branch-instructions,branch-misses ./my_program
# 加上更多计数器 → 更精准的诊断

# 游戏场景：
#   perf stat -p <pid> -- sleep 5
#   → 采集游戏运行中 5 秒的硬件计数器
```

```bash
# ===== perf record：热点函数采样 =====
perf record ./my_program                    # 采样 CPU 时间
perf record -g ./my_program                 # -g: 记录调用图 (生成火焰图用)
perf record -e cache-misses ./my_program    # 采样缓存未命中事件
perf record -e branch-misses ./my_program   # 采样分支预测失败
perf record -F 99 -p <pid> -- sleep 30      # 99Hz 采集 30 秒

# ===== perf report：交互式查看采样结果 =====
perf report
#   Overhead  Command      Shared Object     Symbol
#     45.23%  my_program   my_program        [.] physics::step()
#     23.12%  my_program   my_program        [.] render::draw()
#      8.45%  my_program   libc.so.6         [.] malloc
#      5.34%  my_program   libm.so.6         [.] sinf

# → 45% 的时间花在物理步进 → 优化物理
# → 8.45% 在 malloc → 考虑自定义分配器
```

```bash
# ===== perf c2c：伪共享检测——多线程性能神器 =====
perf c2c record ./my_program     # 记录 Cache-to-Cache 事件
perf c2c report                  # 分析报告

# 输出：
#   Shared Data Cache Line Table
#   Index  Address     Node  Cpu  HITM ...
#   0      0x6020c0    0    0    45.2%
#                     → 共享缓存行命中修改 45.2%！
#                     → 这个地址有严重的伪共享
#   → addr2line -e my_program 0x6020c0  → 哪个变量
#   → 加 padding / alignas(64) 修复
```

```bash
# ===== perf top：实时热点函数 =====
perf top -p <pid>     # 像 top 但看的是函数！
# 实时更新的热点函数列表 → 性能瓶颈一目了然

# ===== perf annotate：函数内的汇编级热点 =====
perf annotate physics::step
# 显示函数内部每条汇编指令的采样占比
# → 精确到哪个指令/哪行 C++ 是热点
```

### 火焰图 (Flame Graph)

火焰图是 Brendan Gregg 发明的可视化性能分析方式——一眼看出 CPU 时间消耗在哪里。

```bash
# ===== 生成火焰图 =====
# 1. 采集数据
perf record -F 99 -g -p <pid> -- sleep 30
# 2. 导出调用栈
perf script > out.perf
# 3. 折叠调用栈
stackcollapse-perf.pl out.perf > out.folded
# 4. 生成 SVG
flamegraph.pl out.folded > flamegraph.svg

# 也可以一步到位 (用 Brendan Gregg 的工具)：
perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg
```

```
火焰图的解读规则：

┌──────────────────────────────────────────────────────┐
│          main()                                      │  ← 底部 = 调用者
│    ┌──────────────┐  ┌──────────────┐                │
│    │ update()     │  │ render()     │                │  ← 中间层
│    │ ┌──────────┐ │  │ ┌──────────┐ │                │
│    │ │physics() │ │  │ │drawcall()│ │                │
│    │ │ ┌───────┐│ │  │ │          │ │                │
│    │ │ │step() ││ │  │ │          │ │                │
│    │ │ │███████││ │  │ │          │ │                │
│    │ │ └───────┘│ │  │ │          │ │                │
│    │ └──────────┘ │  │ └──────────┘ │                │
│    └──────────────┘  └──────────────┘                │
└──────────────────────────────────────────────────────┘

解读：
  - X 轴宽度 = 该函数占用的 CPU 时间比例
  - Y 轴 = 调用栈深度
  - 颜色 = 通常在顶部是热点 (红色/橙色)
  - step() 最宽 → 它是最大的 CPU 消费者
  
常见模式：
  - 平顶山 (plateau)：大量时间花在叶子函数 → 考虑算法优化
  - 尖塔 (spike) ：特定路径极慢 → 可能是一次性大量分配/异常路径
  - 碎片化 (fragmented)：调用太分散 → 架构问题，不是单一瓶颈
```

### 综合性能排查管线

```
游戏性能排查的标准管线：

1. 宏观定位
   top / htop → CPU 100%? → perf top 看是哪个函数
   free -h    → 内存不够? → smaps 查大户
   iostat -x  → 磁盘 I/O 高? → iotop 看哪个进程

2. 微观采样
   perf stat  → 看 cache-miss/branch-miss 率
   perf record + report → 热点函数
   perf c2c   → 多线程有伪共享?

3. 可视化
   生成火焰图 → 快速识别主要消费者

4. 根因分析
   perf annotate → 函数内哪行代码热
   strace       → 是否在系统调用上卡住
```

---

## 9.5 🎮 游戏实战场景

### 9.5.1 游戏内存泄漏排查

内存泄漏是游戏最常见的稳定性问题——手游长时间运行后 OOM 被系统杀死。

#### 自定义内存追踪系统

```cpp
#include <cstddef>
#include <unordered_map>
#include <mutex>
#include <cstdio>
#include <execinfo.h>  // 获取调用栈 (Linux) / DbgHelp (Windows)

// ===== 轻量级内存追踪器 =====
class MemoryTracker {
    struct AllocInfo {
        size_t size;
        void* frames[16];   // 调用栈 (最多 16 层)
        int frame_count;
    };
    
    std::unordered_map<void*, AllocInfo> _allocations;
    std::mutex _mutex;
    size_t _total_allocated = 0;
    size_t _peak_allocated = 0;
    
public:
    void recordAlloc(void* ptr, size_t size) {
        std::lock_guard lock(_mutex);
        AllocInfo info;
        info.size = size;
        info.frame_count = backtrace(info.frames, 16);
        
        _allocations[ptr] = info;
        _total_allocated += size;
        if (_total_allocated > _peak_allocated) {
            _peak_allocated = _total_allocated;
        }
    }
    
    void recordFree(void* ptr) {
        std::lock_guard lock(_mutex);
        auto it = _allocations.find(ptr);
        if (it != _allocations.end()) {
            _total_allocated -= it->second.size;
            _allocations.erase(it);
        }
        // ptr 不在 map 中 → double-free / 野指针 delete
    }
    
    // 程序退出时调用：报告泄漏
    void reportLeaks() {
        std::lock_guard lock(_mutex);
        
        if (_allocations.empty()) {
            printf("[MemoryTracker] No leaks detected.\n");
            return;
        }
        
        printf("[MemoryTracker] %zu leaks found (%zu bytes total)\n",
               _allocations.size(), _total_allocated);
        
        // 按分配大小分组统计
        std::unordered_map<std::string, std::pair<int, size_t>> byCaller;
        for (auto& [ptr, info] : _allocations) {
            // 取调用栈的「签名」——最顶层的非 malloc/new 函数
            char** symbols = backtrace_symbols(info.frames, info.frame_count);
            std::string key = symbols[2];  // 跳过追踪器自身的栈帧
            free(symbols);
            
            byCaller[key].first++;          // 泄漏次数
            byCaller[key].second += info.size;  // 泄漏字节数
        }
        
        // 按泄漏量排序输出
        for (auto& [caller, count_size] : byCaller) {
            printf("  %s: %d allocs, %zu bytes\n",
                   caller.c_str(), count_size.first, count_size.second);
        }
    }
    
    size_t currentUsage() const { return _total_allocated; }
    size_t peakUsage() const { return _peak_allocated; }
};

// ===== 接入方式：重载 operator new =====
MemoryTracker g_memTracker;

void* operator new(size_t size) {
    void* ptr = malloc(size);
    if (ptr) g_memTracker.recordAlloc(ptr, size);
    return ptr;
}

void operator delete(void* ptr) noexcept {
    if (ptr) g_memTracker.recordFree(ptr);
    free(ptr);
}
```

```
游戏引擎的自定义内存追踪三件套：

1. 分配记录：重载 operator new/delete + 记录调用栈
2. 分类标签：为每个分配标记类型（Texture/Mesh/Audio/...）
   → void* Allocate(size_t size, const char* category);
3. 实时监控：游戏内的 MemReport 命令
   → 按分类显示当前使用量 / 峰值
   → UE5: "stat Memory" / "memreport -full"
```

#### UE5 的 Memory Report 命令

```
UE5 内置内存追踪命令：

  stat Memory         → 实时内存统计 (分类/峰值)
  stat MemoryAlloc    → 分配器级别统计
  memreport -full     → 完整内存报告 (输出到 Saved/MemReports/)
  obj list class=Texture2D → 列出所有 Texture2D 对象
  obj refs class=MyClass   → 查看哪些对象引用了 MyClass

排查流程：
  1. stat Memory → 看哪个分类在持续增长
  2. obj list → 看该分类下哪些具体对象没被释放
  3. obj refs → 看谁持有这些对象的引用（阻止了 GC）
  4. 修复：确保资源有正确的生命周期管理 / 智能指针
```

### 9.5.2 帧时间分析 —— CPU-bound vs GPU-bound

```
游戏卡顿的第一步诊断：到底是 CPU 还是 GPU 跟不上？

CPU-bound 的典型特征：
  - GPU 利用率 < 90%
  - 降低分辨率 → 帧率几乎不变
  - perf top 显示游戏逻辑函数占用高
  - 帧时间波动伴随线程同步等待 (futex)

GPU-bound 的典型特征：
  - GPU 利用率 > 95%
  - 降低分辨率 → 帧率显著提升
  - 降低画质设置 → 帧率提升
  - GPU 时间线工具 (RenderDoc/PIX) 显示绘制命令排队

判断方法：
  Linux:
    perf stat -e cycles,instructions -p <pid> -- sleep 1
    → 同时看 GPU 利用率 (nvidia-smi / intel_gpu_top)
    
  Windows:
    任务管理器 → Performance → GPU 利用率
    或 GPUView / PIX for Windows
```

```cpp
// 简单的帧内 Profiler
class FrameProfiler {
    struct Section {
        const char* name;
        std::chrono::nanoseconds elapsed;
    };
    
    std::vector<Section> _sections;
    std::chrono::steady_clock::time_point _section_start;
    const char* _current_section = nullptr;
    
public:
    void beginSection(const char* name) {
        _current_section = name;
        _section_start = std::chrono::steady_clock::now();
    }
    
    void endSection() {
        auto now = std::chrono::steady_clock::now();
        auto elapsed = now - _section_start;
        _sections.push_back({_current_section, elapsed});
    }
    
    void endFrame() {
        // 打印帧时间分解
        printf("=== Frame Profile ===\n");
        auto total = std::chrono::nanoseconds(0);
        for (auto& s : _sections) {
            auto ms = std::chrono::duration<double, std::milli>(s.elapsed).count();
            printf("  %-20s %8.3f ms\n", s.name, ms);
            total += s.elapsed;
        }
        printf("  %-20s %8.3f ms\n", "TOTAL",
               std::chrono::duration<double, std::milli>(total).count());
        _sections.clear();
    }
};

// 使用：
// FrameProfiler profiler;
// profiler.beginSection("Physics");   physics.step(dt);   profiler.endSection();
// profiler.beginSection("AI");        ai.update(dt);      profiler.endSection();
// profiler.beginSection("Render");    renderer.draw();    profiler.endSection();
// profiler.endFrame();
//
// 输出：
// === Frame Profile ===
//   Physics              4.523 ms
//   AI                   2.134 ms
//   Render              12.876 ms
//   TOTAL               19.533 ms
// → 渲染占了 12.9ms → 渲染瓶颈 → 优化 draw calls / shader
```

```
游戏内 Profiler 的实现原理：

1. 插入探针：
   在关键函数入口/出口记录时间戳
   → 每个子系统 (Physics/AI/Render/Audio/Network) 有独立的计时器

2. 多帧统计：
   不只记录一帧 → 记录最近 N 帧 (如 60 帧) 的统计信息
   → 显示平均值、最小值、最大值、P99

3. 可视化：
   游戏内显示叠加层 (HUD Overlay)
   → 每一帧的时间条: [Physics|AI|Render|Audio|Network|Idle]
   → 颜色编码: 绿色 < 预算, 黄色 = 接近预算, 红色 > 预算
   
   常用预算 (60fps = 16.67ms/帧):
   - Physics: 2-6ms
   - AI:      1-3ms
   - Render:  5-10ms (CPU 端提交) + GPU 时间
   - Audio:   <1ms
   - Network: <1ms
   - Other:   2-4ms (留给操作系统的余量)
```

---

## 9.6 30 秒速答

> 📋 以下是本章核心知识点的面试速答模板。每个回答控制在 30 秒内。

---

**Q：进程卡死了你怎么排查？**

> 先用 top/htop 看进程状态——D 状态是等 I/O，S 状态可能等锁。然后 strace -p 看最后几个系统调用——卡在 read 是等磁盘/网络，卡在 futex 是等锁。同时 cat /proc/<pid>/stack 看内核栈双重确认。多线程场景下 gdb attach → thread apply all bt 看所有线程的调用栈，快速定位死锁位置。

**Q：内存泄漏怎么排查？**

> 首先确认是不是泄漏——看 RES 是否随时间持续增长（top/htop 监控）。然后用 valgrind --leak-check=full 离线分析（适合测试环境），或 ASan 编译运行（适合开发环境）。自定义内存追踪器（重载 new/delete + 记录调用栈 + 分类标签）可以精确跟踪每个分配。UE5 用 stat Memory / memreport 按分类定位。最后看是忘了 delete、循环引用还是容器持续增长。

**Q：怎么调试多线程死锁？**

> gdb attach 到进程 → thread apply all bt 获取所有线程的调用栈。找卡在 pthread_mutex_lock / futex_wait 上的线程。画出等待图：线程 A 持锁 L1 等锁 L2，线程 B 持锁 L2 等锁 L1。也可以用 gdb 的 info threads 观察各线程状态，或用 TSan (ThreadSanitizer) 自动检测潜在的数据竞争和死锁。在线环境用 pstack (Linux) 快速看所有线程栈。

**Q：怎么用 perf 做性能分析？**

> 先 perf stat 看宏观指标：IPC (<1 说明 CPU 在等内存)、cache-miss 率 (>5% 说明数据局部性差)、branch-miss 率。然后 perf record -g + perf report 找热点函数——哪个函数占比最高就优化哪里。多线程场景用 perf c2c 检测伪共享。最后生成火焰图给团队可视化沟通。perf annotate 能精确到函数内哪行指令是热点。

**Q：CPU-bound 还是 GPU-bound 怎么判断？**

> GPU 利用率 < 90% 且降低分辨率帧率不变 → CPU-bound。GPU 利用率 > 95% 且降低分辨率帧率明显提升 → GPU-bound。CPU-bound 时用 perf/帧内 Profiler 定位是哪个子系统（物理/AI/渲染提交），GPU-bound 时用 RenderDoc/PIX 看 draw call 数量和 shader 复杂度。大多数游戏引擎的帧是 CPU 和 GPU 并行——瓶颈可能在任一侧，也可能在不同帧交替出现。

**Q：游戏性能调优的排查路线是什么？**

> 三步走：宏观→微观→根因。宏观：top/htop 看 CPU/内存，iostat 看磁盘，nvidia-smi 看 GPU。微观：perf stat 看硬件计数器，perf record 采样热点函数，帧内 Profiler 看各子系统耗时分布。根因：perf annotate 定位热点代码行，perf c2c 查伪共享，strace 看是否有异常系统调用。工具链齐了，优化方向自然就出来了。

---

> 📖 上一章：[第八章 协程](../08_coroutine) —— 有栈/无栈协程、C++20 co_await/co_yield、协程帧与 HALO 优化、UE5 Latent Action 与行为树协程化。

> 📖 系列首页：[操作系统笔记系列](.) —— 九章完整索引，面试导向的系统学习路线。

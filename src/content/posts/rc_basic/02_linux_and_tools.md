---
title: "终端开荒：Ubuntu 基础操作与 VSCode 远程开发"
published: 2026-10-08
pinned: false
weight: 2
description: "专为 Windows 用户设计的 Linux 破冰指南：双系统与 WSL2 抉择、国内换源、高频终端命令、免密 SSH 与 VSCode Remote 远程丝滑编码。"
tags: [ubuntu, linux, vscode, 终端, 教程, 新手入门]
category: RC上位机入门
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 很多大一小登在进队前只用过 Windows，第一次看到没有C盘D盘、全是纯文字命令行的黑框框，瞬间产生强烈的恐惧心理。这一章就是为了破除恐惧——Linux只是一个操作系统，终端也只是一个不用鼠标的高效界面。

# 为什么上位机开发必须用 Linux？

在 RC 和各类机器人竞赛中，**Ubuntu 几乎是事实上的绝对标准**。为什么不用我们最熟悉的 Windows？
- **硬件驱动与通信直通**：工业相机驱动（海康、大华等）、USB 串口、CAN 卡在 Linux 下的延时极低且无花哨的驱动冲突；
- **机器人软件生态锁定**：ROS2、OpenCV、PCL 点云库以及各类开源算法在 Linux 下的原生支持最好，Windows 下跑起来往往坑多到让人绝望；
- **车载工控机部署**：比赛现场装在机器人肚子里的工控机（Intel NUC、Mini PC、Jetson 等），为了极致的稳定性和节省内存，通常都是纯 Linux 系统。

---

## 一、 系统环境怎么选？（避坑第一步）

很多新手在第一天就死在“装环境”上。目前主流方案有以下三种，**请严格根据你的电脑配置和使用场景选择**：

| 方案 | 优点 | 缺点 | 推荐指数 |
| :--- | :--- | :--- | :---: |
| **方案 1：双系统（强烈推荐）** | 性能无损耗、GPU 算力直通、插摄像头/串口即插即用 | 需要给硬盘分区，切系统要重启电脑 | ★★★★★ |
| **方案 2：WSL2（折中方案）** | 和 Windows 无缝共存，不占独立系统分区 | 接 USB 摄像头调算法需要额外配置转发，略折腾 | ★★★★☆ |
| **方案 3：虚拟机（极不推荐）** | 不影响现有电脑，带快照备份 | 性能衰减严重，工业相机高帧率取流直接卡死 | ★☆☆☆☆ |

### 1. 系统版本建议（务必选 22.04）
- **唯一推荐：Ubuntu 22.04 LTS（代号 Jammy Jellyfish）**。
- **严厉避坑：不要贪新安装 Ubuntu 24.04！**
  1. **ROS 2 生态绑定**：机器人竞赛（RC / RoboMaster）开源算法生态几乎 99% 焊死在 **ROS 2 Humble**（专门适配 Ubuntu 22.04）。24.04 对应的 Jazzy 版本不仅大量第三方依赖包找不到，编译时还会遇到 Python 3.12 虚拟环境限制；
  2. **工业相机 SDK 灾难**：海康威视、大华等厂商的工业相机 Linux 驱动，在 24.04 的新内核与 GCC 13/14 下经常编译报错甚至无法安装；
  3. **计算卡固件脱节**：各大厂商的车载计算卡固件目前也主要停留在 20.04/22.04。
- 用 Ventoy 或 Rufus 制作系统 U 盘，在电脑 BIOS 中关闭 Secure Boot，给硬盘腾出至少 80G~100G 空间安装。安装时看清分区盘符，切勿误格式化自己的 Windows 数据盘。

### 2. WSL2 方案快捷安装
如果你在笔记本上想先学语法和命令，可以在 Windows PowerShell（管理员身份）中一行安装：
```powershell
wsl --install -d Ubuntu-22.04
```
装完后在开始菜单找到 Ubuntu 打开，设置初始用户名和密码即可。WSL 默认可以通过 `/mnt/c/` 和 `/mnt/d/` 直接访问 Windows 下的文件。

---

## 二、 装完系统第一刀：换国内源

Ubuntu 默认自带的软件源服务器在国外，使用 `apt` 下载安装软件经常几 KB/s 甚至直接连接超时。装好系统的第一件事就是**换成清华大学开源镜像源**。

### 针对 Ubuntu 22.04：
```bash
# 1. 备份系统原始源配置
sudo cp /etc/apt/sources.list /etc/apt/sources.list.bak

# 2. 一键替换为清华大学开源镜像（正则通配符吞掉可能存在的 cn. 等区域前缀）
sudo sed -i -E 's|http://[a-zA-Z0-9.-]*archive.ubuntu.com/ubuntu/|https://mirrors.tuna.tsinghua.edu.cn/ubuntu/|g' /etc/apt/sources.list
sudo sed -i -E 's|http://security.ubuntu.com/ubuntu/|https://mirrors.tuna.tsinghua.edu.cn/ubuntu/|g' /etc/apt/sources.list

# 3. 刷新软件索引并更新基础组件
sudo apt update && sudo apt upgrade -y
```

> **系统稳定性防翻车建议**：  
> `sudo apt upgrade -y` 建议只在刚装完纯净系统时跑一次。后续一旦你在车上装好了 NVIDIA 显卡驱动或工业相机底层驱动，**平时严禁随意敲 `apt upgrade`**！因为全量升级很可能会静默更新 Linux 系统内核版本，导致旧内核编译的显卡驱动模块失效，下次开机直接卡在紫屏或登录界面死循环。

---

## 三、 活命必备的终端命令

不需要把整本 Linux 指令大全背下来，日常比赛开发 95% 的时间你只需要这几条命令：

### 1. 目录穿梭与查看
```bash
pwd              # 查看当前身在哪个目录（Print Working Directory）
ls               # 列出当前目录下的文件
ls -la           # 以详细列表形式列出所有文件（包括以 . 开头的隐藏文件）
cd my_project    # 进入 my_project 文件夹
cd ..            # 返回上一级目录
cd ~             # 迅速回到当前用户的主家目录（相当于 /home/用户名）
```

> **绝对神器：Tab 键补全**！在终端里敲路径或文件名时，敲前两三个字母就狂按 `Tab` 键，系统会自动补全名字。如果按两下 `Tab`，会列出所有可能的文件。**永远不要手打冗长又容易拼错的文件名！**

### 2. 文件与目录的创建、复制、删除
```bash
mkdir -p workspace/src       # -p 会连同父级文件夹一并递归创建
touch main.cpp               # 快速创建一个空白文件
cp main.cpp main_backup.cpp  # 复制文件
cp -r src/ src_backup/       # 复制整个文件夹（-r 表示递归）
mv main.cpp src/             # 移动文件，或者给文件重命名
```

> **关于删除操作的最高警报：**
> ```bash
> rm -rf folder_name
> ```
> Linux 终端执行 `rm` 是**物理删除，没有回收站**！一旦按了回车，数据神仙难救。  
> **严禁在根目录或者不清楚当前路径的情况下执行 `sudo rm -rf ...`！敲 `rm` 之前手停一秒，看清自己在哪个路径！**

### 3. 查看与简易编辑文本
```bash
cat CMakeLists.txt     # 直接在终端打印出整个文件内容
head -n 20 main.cpp    # 只看前 20 行
tail -n 20 -f app.log  # 看后 20 行；加上 -f 可以实时追踪不断追加的日志内容！
nano config.yaml       # 极简终端文本编辑器，改完后 Ctrl+O 保存，Ctrl+X 退出
```

### 4. 权限体系与 `sudo`
Linux 对权限管理极严。有时候运行程序会报 `Permission denied`（权限被拒绝）：
- `sudo`：SuperUser DO，临时借用管理员权限执行命令。
- `chmod +x run.sh`：给脚本添加“可执行权限”（只有绿色的文件才能像程序一样运行）。
- `ls -l` 第一列看到的 `rwxr-xr-x` 就是读（r）、写（w）、执行（x）权限。

### 5. 抓取与进程清理
```bash
# 在一堆文件或输出里搜特定关键词
grep -rn "target_color" src/

# 查看某个正在运行的程序
ps -ef | grep python

# 程序死锁卡住了，暴力杀掉它的进程 PID
kill -9 <进程PID>
```

---

## 四、 优雅编码：VS Code Remote-SSH 远程开发

在真实赛车上，上位机工控机通常被装在车架内部，上面没有接显示器，也没有键盘鼠标。我们怎么给它写代码和调算法？

**答案是：在自己的笔记本上打开 VS Code，通过网线/局域网远程连接工控机！**

```mermaid
flowchart LR
    Laptop["💻 你的笔记本 (Windows / Ubuntu)\nVS Code 界面 + 代码高亮 + Git插件"] 
    -- "网线 / WiFi 局域网\nSSH (端口 22)" --> 
    Robot["🤖 车载上位机 / 工控机\n源码文件 + 编译工具链 + 摄像头硬件"]
```

### 1. 在车载上位机上开启 SSH 服务
```bash
sudo apt install openssh-server -y
sudo systemctl enable --now ssh

# 查看车载上位机的 IP 地址（比如 192.168.1.100）
ip addr show
```

### 2. 在自己电脑上配置 VS Code 远程连接
1. 在自己笔记本的 VS Code 插件市场里搜索并安装插件：**`Remote - SSH`**；
2. 按快捷键 `Ctrl + Shift + P`，输入 `Remote-SSH: Connect to Host...`；
3. 输入格式：`ssh 用户名@上位机IP`（例如 `ssh robot@192.168.1.100`）；
4. 提示输入上位机登录密码，连接成功！

### 3. 配置免密登录（告别每次输密码）
每次重连都要输密码非常烦人，生成一对 SSH 密钥即可一劳永逸：

```bash
# 在你自己的笔记本电脑终端里生成秘钥（一路回车即可）
ssh-keygen -t ed25519
```

生成完毕后，把公钥投喂给车载工控机：

```powershell
# 如果你的笔记本是 Windows（在 PowerShell 中执行以下单行命令）：
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh robot@192.168.1.100 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

```bash
# 如果你的笔记本也是 Ubuntu / macOS（在终端执行）：
ssh-copy-id robot@192.168.1.100
```

配置完成后，以后点击连接瞬间进系统，直接在 VS Code 里打开远程工控机的代码目录，写代码、跳转定义、调用远程终端编译，体验和本地开发毫无二致。

---

## 五、 配置 VS Code 的 C/C++ 开发环境

不管你是在本地 Ubuntu 双系统、WSL2、还是通过 Remote-SSH 连接到工控机，刚装好的 VS Code 只是一个“纯文本编辑器”。要让它变成强大的 C/C++ 集成开发环境（IDE），必须装好**编译工具链**和**核心插件**。

### 1. 系统底层编译工具链安装
在 Ubuntu 终端中执行一行命令，安装编译器和调试器：
```bash
sudo apt install -y build-essential gdb cmake git
```
> `build-essential` 是 Ubuntu 的基础开发包，里面打包了 `gcc`（C编译器）、`g++`（C++编译器）和 `make` 工具；`gdb` 是后续断点单步调试的底层神器。

### 2. VS Code 必装插件清单
点击 VS Code 左侧边栏的“扩展”（Extensions，快捷键 `Ctrl + Shift + X`），搜索并安装以下插件：

1. **C/C++ Extension Pack**（由 Microsoft 出品）：
   - 包含代码自动补全、按 `F12` 跳转到函数定义、鼠标悬停查看类型、代码格式化与 GDB 调试支持。
2. **CMake Tools**（由 Microsoft 出品）：
   - CMake 语法高亮与工程辅助。底部状态栏会多出快捷按钮，支持一键选择编译器、一键编译（Build）和一键运行。
3. **GitLens** 或 **Git Graph**：
   - 可视化查看代码提交历史、分支图谱和代码是由哪位队友修改的。

> **极其重要的避坑细节（针对 WSL2 和 Remote-SSH 用户）**：  
> 如果你是在 Remote-SSH 远程连接或者 WSL2 下写代码，插件市场会分为“本地（Local）”和“远程（SSH: xxx / WSL）”两个区域。  
> **C/C++ 和 CMake Tools 插件必须安装在远程那一栏（点击绿色的“Install in SSH: xxx”按钮）！**  
> 很多新手在 Windows 本地装了插件，连上远程工控机后发现依然没有代码补全和跳转定义，就是因为插件没有装在远程服务器上。

### 3. 最常用的 VS Code 快捷键
- `Ctrl + \``（数字 1 左边的反引号键）：快速调出/隐藏下方的集成终端（告别在系统窗口和编辑器之间切来切去）；
- `Ctrl + P`：快速搜索并打开项目里的任何文件；
- `Ctrl + Shift + P`：命令面板（任何功能和设置都可以在这里搜）；
- `F12`：跳转到光标所在函数或变量的定义位置；
- `Alt + ←`：跳回跳转前的位置。

---

## 六、 三个新人高频遭遇的权限与硬件“暗坑”

### 坑 1：插上串口线或者摄像头，程序报错 `Permission denied`
在 Linux 中，USB 串口设备节点通常叫 `/dev/ttyUSB0`，摄像头通常叫 `/dev/video0`。默认情况下，普通用户是没有权限直接读写这些硬件设备的。

**解决办法**：把自己加入 `dialout`（串口组）和 `video`（视频设备组）：
```bash
sudo usermod -aG dialout,video $USER
```
> 执行完上述命令后，**必须注销（Log out）当前系统账号重新登录**，组权限才会真正生效！

### 坑 2：双系统时间与 Windows 不一致
装了双系统后，切回 Windows 发现时间经常慢 8 个小时。这是因为 Windows 把硬件时钟当作本地时间，而 Linux 把硬件时钟当作 UTC 时间。
在 Ubuntu 终端执行一行命令即可纠正：
```bash
sudo timedatectl set-local-rtc 1 --adjust-system-clock
```

### 坑 3：串口杀手 `brltty` 导致 USB 串口插上 2 秒离奇消失
插上 USB 转串口模块（CH340 / CP2102），刚开始敲 `ls /dev/ttyUSB*` 确实能看到 `/dev/ttyUSB0`。但过了 2 秒钟之后，设备节点离奇消失了！

**真凶**：Ubuntu 22.04 桌面版默认预装了盲文阅读器服务 `brltty`。只要它检测到 CH340 这类常见 USB 转串口芯片，就会强行霸占并将其卸载，导致串口拔插后秒断。

**必敲救命命令**：
```bash
sudo apt remove -y brltty
```

---

## 🎯 本章通关小作业

1. 打开 Ubuntu 终端，完成以下操作：
   - 运行 `sudo apt install -y build-essential gdb cmake git` 确认开发工具链齐备；
   - 在家目录下创建 `robot_ws/src` 多级文件夹；
   - 在 `robot_ws` 下创建一个名为 `test.sh` 的脚本，内容为 `echo "Hello RC Vision!"`；
   - 用 `chmod +x test.sh` 赋予其执行权限，并用 `./test.sh` 成功在终端打印出文字。
2. 配置好 VS Code：
   - 在扩展市场里安装好 **C/C++ Extension Pack** 和 **CMake Tools**；
   - 用 VS Code 打开 `robot_ws` 文件夹，使用快捷键 `Ctrl + \`` 调出内置终端执行 `g++ --version` 验证编译器可用。
3. 执行以下命令，彻底扫清串口与硬件权限障碍：
   ```bash
   sudo apt remove -y brltty
   sudo usermod -aG dialout,video $USER
   ```

---
title: "开发环境搭建与工具链配置"
published: 2026-07-19
pinned: false
description: "跨平台编译与构建工具链：C++20 / CMake / ROS2 / Python 深度混合开发环境搭建，以及 VSCode 远程调试、Docker 容器化隔离与快捷编译脚本。"
tags: [ubuntu, 环境搭建, cmake, ros2, python, docker, 教程]
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 既然学会了 git，那接下来我们就从耳熟能详的 Windows 转到上位机开发常用的 Ubuntu 吧。本章会把 C++ / CMake / ROS2 / Python 四件套一次性配齐，并用 Docker 把环境锁死，避免"在我电脑上能跑"的悲剧。

# 为什么是 Ubuntu？

在 RC 上位机开发中，Ubuntu 几乎是事实上的标准系统。原因很简单：
- ROS/ROS2 原生支持 Linux，Windows 上跑起来非常折腾
- OpenCV、PCL 等视觉库在 Linux 下编译和性能都更好
- 大部分开源的上位机项目和算法代码都是在 Ubuntu 下写的
- 嵌入式交叉编译工具链对 Linux 支持更友好

> 当然，不是说 Windows 不能写上位机，但你迟早会碰到各种奇怪的环境问题。与其到时候再折腾，不如一开始就用 Ubuntu。

> 虽然但是如果各位用的是 Jetson 的话，那很享福了，刷机和配环境值得我单开一期，碰到的问题包括但不限于：到头来还得自己编，刷机要求主机版本等等。

---

# 安装 Ubuntu

目前主流有三种方式，各有优劣：

## 方案一：双系统（推荐）
最正经的方案，性能最好，也最接近真实上位机的使用场景。

**优点：** 性能拉满，GPU 直通，最接近真实部署环境
**缺点：** 需要分区，切换系统要重启

步骤：
1. 去 [Ubuntu 官网](https://ubuntu.com/download/desktop) 下载最新的 LTS 版本（推荐 22.04 或 24.04）
2. 用 Rufus 或 Ventoy 制作启动 U 盘
3. 重启电脑，进 BIOS 设置 U 盘启动
4. 安装时选择"与 Windows 共存"，分配至少 100G 空间

> 注意：装双系统之前一定要备份数据，分区操作有风险

## 方案二：WSL2
如果你不想折腾分区，WSL2 是个很好的折中方案。

**优点：** 不用重启切换系统，和 Windows 无缝共存
**缺点：** GPU 支持需要额外配置，GUI 应用需要 WSLg

```powershell
# 在 PowerShell（管理员）中执行
wsl --install -d Ubuntu-24.04
```
装完之后在开始菜单找到 Ubuntu，打开设置用户名密码就行了。

> WSL2 默认可以访问 Windows 的文件系统，你的代码放在 `/mnt/c/` 下就能在两个系统间共享

## 方案三：虚拟机
VMware 或 VirtualBox 都行。

**优点：** 不影响现有系统，快照功能方便回滚
**缺点：** 性能损耗大，USB 设备（摄像头等）直通麻烦

> 如果你需要接摄像头调参，虚拟机方案会很痛苦。建议用方案一或方案二。

---

# 装完系统第一件事：换源

Ubuntu 默认的软件源在国外，下载速度感人。第一步就是换成国内镜像。

```bash
# 备份原始源
sudo cp /etc/apt/sources.list /etc/apt/sources.list.bak

# 换成清华源（以 24.04 为例）
sudo sed -i 's|http://archive.ubuntu.com/ubuntu|https://mirrors.tuna.tsinghua.edu.cn/ubuntu|g' /etc/apt/sources.list

# 更新
sudo apt update && sudo apt upgrade -y
```

> 如果你用的是 Ubuntu 24.04，源配置文件可能在 `/etc/apt/sources.list.d/ubuntu.sources`，格式不一样，具体去清华源官网复制对应版本的配置。

---

# 基本的终端操作

上位机开发基本都在终端里操作，这几个命令必须会：

```bash
# 切换目录
cd /path/to/directory

# 查看当前目录下的文件
ls -la

# 创建文件夹
mkdir my_project

# 编辑文件（选一个用）
nano my_file.txt    # 简单好上手
vim my_file.txt     # 学习曲线陡但功能强

# 查看文件内容
cat my_file.txt

# 复制、移动、删除
cp src dst
mv src dst
rm -rf directory    # 慎用，删了就没了

# 查看当前路径
pwd
```

> 记住一个原则：在 Linux 下，`rm -rf` 是不可逆的。没有回收站，删了就是删了。用之前多看一眼路径。

---

# SSH 配置

上位机一般不会接显示器键盘鼠标，都是通过 SSH 远程连接的。

## 在上位机上开启 SSH 服务
```bash
# 安装 openssh-server
sudo apt install openssh-server -y

# 查看 SSH 状态
sudo systemctl status ssh

# 查看上位机的 IP 地址
ip addr show
```

## 从你的电脑连接
```bash
# 基本格式
ssh username@ip_address

# 例如
ssh robot@192.168.1.100
```

## 配置免密登录（推荐）
每次输密码太烦了，配置一下密钥：
```bash
# 在你的电脑上生成密钥（一路回车）
ssh-keygen -t ed25519

# 把公钥传到上位机
ssh-copy-id username@ip_address
```
之后再连就不需要密码了。

---

# 配置 VSCode Remote SSH

命令行写代码终究不方便，VSCode 的 Remote SSH 插件可以让你在本地 VSCode 里编辑远程上位机的代码。

1. 在 VSCode 里安装插件 `Remote - SSH`
2. 按 `Ctrl+Shift+P`，输入 `Remote-SSH: Connect to Host`
3. 输入 `username@ip_address`，回车
4. 连上之后打开上位机的项目文件夹，和本地开发体验一样

> 甚至终端也是远程的，直接在 VSCode 下面的终端里编译运行，非常方便

---

# CMake：C++ 工程的构建骨架

上位机工程不是一个 `.cpp` 文件搞定的事。多个源文件、第三方库、编译选项——靠手敲 `g++` 迟早崩溃。CMake 是 C++ 世界事实上的构建标准。

## 最小 CMake 项目

```cmake
# CMakeLists.txt
cmake_minimum_required(VERSION 3.16)
project(rc_upper VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 把 src/ 下所有 .cpp 编译成一个可执行文件
file(GLOB_RECURSE SOURCES "src/*.cpp")
add_executable(rc_upper ${SOURCES})

# 链接 OpenCV
find_package(OpenCV REQUIRED)
target_link_libraries(rc_upper ${OpenCV_LIBS})
```

```bash
# 标准三连
mkdir build && cd build
cmake ..
make -j$(nproc)
```

## 为什么用 CMake 而不是直接 g++？

| 场景 | 手敲 g++ | CMake |
|---|---|---|
| 3 个文件 | 能凑合 | 都行 |
| 30 个文件 + 多个库 | 每次编译敲一屏幕 | `cmake .. && make` |
| 换电脑/换系统 | 路径全废，重新来过 | 改一下路径就行 |
| 和队友协作 | "你编译命令是啥？" | 共享 CMakeLists.txt 即可 |

> 一个原则：项目超过 3 个源文件，就该上 CMake。

## 常用 CMake 指令速查

```cmake
# 查找并链接第三方库
find_package(Eigen3 REQUIRED)
target_link_libraries(my_app Eigen3::Eigen)

# 添加头文件搜索路径
target_include_libraries(my_app PRIVATE include/)

# 条件编译（比如 debug 模式加 -g）
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    target_compile_options(my_app PRIVATE -g -O0)
endif()

# 生成库（把通用代码编译成 .a 或 .so）
add_library(my_utils STATIC src/utils.cpp)
target_link_libraries(rc_upper my_utils)
```

---

# Python 环境管理

上位机不全是 C++——快速原型、数据处理、训练脚本经常用 Python。关键是**隔离环境**，避免系统 Python 被污染。

## Miniconda（推荐）

```bash
# 下载安装
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh

# 创建项目环境
conda create -n rc python=3.11 -y
conda activate rc

# 常用包
pip install numpy opencv-python pyserial pyyaml
```

> **不要用系统自带的 Python 直接装包。** Ubuntu 的 `apt install python3-xxx` 和 `pip install` 混着用迟早出问题。用 conda 或 venv 隔离。

## 项目级隔离（venv）

如果不想装 conda，Python 自带的 venv 也够用：

```bash
cd your_project
python3 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt
```

> 把 `.venv/` 加到 `.gitignore` 里，不要提交虚拟环境到仓库。

---

# ROS2 安装与配置

ROS2 是上位机的神经系统——节点间通信、传感器驱动、算法模块化都靠它。

## 安装 ROS2 Humble（推荐）

>虽然但是我更推荐各位去用鱼香ros的一键安装ros，可以自己下载对应版本：
```
wget http://fishros.com/install -O fishros && . fishros
```
>直接复制过去运行即可。

Ubuntu 22.04 对应 ROS2 Humble，Ubuntu 24.04 对应 ROS2 Jazzy。以 Humble 为例：

```bash
# 设置源
sudo apt install software-properties-common
sudo add-apt-repository universe

# 添加 ROS2 GPG key
sudo curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key -o /usr/share/keyrings/ros-archive-keyring.gpg

# 添加源（清华镜像）
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] https://mirrors.tuna.tsinghua.edu.cn/ros2/ubuntu $(. /etc/os-release && echo $UBUNTU_CODENAME) main" | sudo tee /etc/apt/sources.list.d/ros2.list > /dev/null

# 安装
sudo apt update
sudo apt install ros-humble-desktop -y

# 安装开发工具
sudo apt install ros-humble-ros-base python3-colcon-common-extensions -y
```

## 环境激活

每次打开终端都要 source 一下，嫌麻烦就写进 `.bashrc`：

```bash
# 写进 bashrc，开终端自动加载
echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc
source ~/.bashrc
```

## 验证安装

```bash
# 终端 1：启动一个 talker
ros2 run demo_nodes_cpp talker

# 终端 2：启动一个 listener
ros2 run demo_nodes_py listener
```

如果 listener 能收到 talker 的消息，ROS2 就装好了。

## 创建 ROS2 工作空间

```bash
# 创建工作空间
mkdir -p ~/ros2_ws/src
cd ~/ros2_ws/src

# 创建一个包
ros2 pkg create --build-type ament_cmake my_robot --dependencies rclcpp std_msgs

# 编译
cd ~/ros2_ws
colcon build --packages-select my_robot

# 加载环境
source install/setup.bash
```

> `colcon build` 是 ROS2 的编译命令，相当于 `cmake + make` 的封装。`--packages-select` 只编译指定包，省时间。

## ROS2 核心概念速览

```
┌──────────────┐    Topic: /chassis_status    ┌──────────────┐
│  serial_node │ ──────────────────────────── > │  decision    │
│  (串口驱动)  │                               │  (决策节点)  │
│              │ < ─────────────────────────── │              │
└──────────────┘    Topic: /cmd_vel           └──────────────┘
```

- **Node（节点）**：一个独立的可执行程序，负责一件事（串口通信、决策、控制……）
- **Topic（话题）**：节点间的数据管道，发布/订阅模型，异步通信
- **Service（服务）**：同步的请求/响应模式，适合偶尔调用的操作
- **Parameter（参数）**：运行时可调的配置项，不用重新编译

> RC 上位机典型节点划分：`serial_node`（串口驱动）、`lidar_node`（雷达）、`decision_node`（决策状态机）、`control_node`（运动控制）、`vision_node`（视觉识别）。

---

# 安装常用依赖

上位机开发需要装的东西大同小异，一并列出来：

## 编译工具链
```bash
sudo apt install -y build-essential cmake git
```

## OpenCV（从源码编译）

> ROS2 自带的 OpenCV 版本可能偏旧，如果需要特定版本（比如 4.9），从源码编译更可控。

```bash
# 安装依赖
sudo apt install -y libgtk-3-dev pkg-config libavcodec-dev libavformat-dev \
    libswscale-dev libtbb-dev libjpeg-dev libpng-dev libtiff-dev libdc1394-dev

# 下载源码
cd ~
git clone https://github.com/opencv/opencv.git
cd opencv
git checkout 4.9.0    # 选一个稳定版本

# 编译安装
mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/usr/local ..
make -j$(nproc)
sudo make install
```

> `make -j$(nproc)` 会用满你所有的 CPU 核心来编译，上位机如果是多核的话会快很多。

## 串口通信库

上位机和下位机（电控）通信基本靠串口：
```bash
sudo apt install -y libserial-dev
# 或者用这个轻量的
git clone https://github.com/wjwwood/serial.git
cd serial && mkdir build && cd build
cmake .. && make -j$(nproc)
sudo make install
```

## 其他常用库
```bash
# Eigen（矩阵运算）
sudo apt install -y libeigen3-dev

# yaml-cpp（读配置文件）
sudo apt install -y libyaml-cpp-dev

# spdlog（日志库）
sudo apt install -y libspdlog-dev
```

---

# Docker：把环境锁死

"Docker 有什么用？我直接装不就行了？"

直到比赛前一天，你换了一台电脑，发现 OpenCV 版本不对、ROS2 源挂了、Python 包冲突——这时候你就知道 Docker 有多香了。Docker 的核心价值：**环境可复现、可迁移、可回滚。**

## 安装 Docker

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh

# 让当前用户可以不用 sudo 执行 docker
sudo usermod -aG docker $USER

# 重新登录终端生效，或者临时用 newgrp
newgrp docker

# 验证
docker run hello-world
```

## 编写 Dockerfile

在项目根目录创建 `Dockerfile`：

```dockerfile
FROM ros:humble-ros-base

# 安装依赖
RUN apt-get update && apt-get install -y \
    libopencv-dev \
    libeigen3-dev \
    libserial-dev \
    libyaml-cpp-dev \
    libspdlog-dev \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Python 依赖
COPY requirements.txt /tmp/
RUN pip3 install -r /tmp/requirements.txt

# 挂载工作空间
WORKDIR /ros2_ws
```

## 一行命令进入开发环境

```bash
# 构建镜像
docker build -t rc_dev .

# 运行容器，把项目目录挂进去
docker run -it --rm \
    -v $(pwd):/ros2_ws \
    -v /dev:/dev \
    --privileged \
    rc_dev bash
```

> `-v /dev:/dev` 和 `--privileged` 是为了让容器能访问串口设备（`/dev/ttyUSB0`）。如果只是编译和测试算法，可以不加。

## Docker Compose：多服务编排

当你的系统需要同时跑 ROS2 节点、串口服务、Web 调试界面时，用 Docker Compose 统一管理：

```yaml
# docker-compose.yml
version: "3.8"
services:
  ros2:
    build: .
    volumes:
      - .:/ros2_ws
      - /dev:/dev
    privileged: true
    command: ros2 launch my_robot bringup.launch.py
```

```bash
docker compose up -d    # 后台启动
docker compose logs -f  # 看日志
docker compose down     # 停止
```

---

# 验证环境

装完之后跑个小程序验证一下 C++ 环境：

```cpp
// test_env.cpp
#include <iostream>
#include <opencv2/opencv.hpp>
#include <Eigen/Dense>

int main() {
    // 验证 OpenCV
    std::cout << "OpenCV version: " << CV_VERSION << std::endl;

    // 验证 Eigen
    Eigen::Matrix3d m = Eigen::Matrix3d::Identity();
    std::cout << "Eigen identity matrix:\n" << m << std::endl;

    std::cout << "环境搭建成功！" << std::endl;
    return 0;
}
```

```bash
# 编译
g++ test_env.cpp -o test_env $(pkg-config --cflags --libs opencv4)

# 运行
./test_env
```

验证 ROS2：

```bash
ros2 run demo_nodes_cpp talker
```

验证 Docker：

```bash
docker run --rm hello-world
```

如果都能正常跑，环境就没问题了。

---

# 快捷编译脚本

每次手动 `mkdir build && cd build && cmake .. && make` 太烦了。写个脚本一键搞定：

```bash
#!/bin/bash
# build.sh - 放在项目根目录

set -e  # 出错即停

BUILD_DIR="build"
BUILD_TYPE="${1:-Release}"  # 默认 Release，传 Debug 切 Debug 模式

# 如果 build 目录不存在就创建
if [ ! -d "$BUILD_DIR" ]; then
    mkdir "$BUILD_DIR"
fi

cd "$BUILD_DIR"
cmake -DCMAKE_BUILD_TYPE=$BUILD_TYPE ..
make -j$(nproc)

echo "✅ 编译完成"
```

```bash
chmod +x build.sh

# Release 模式
./build.sh

# Debug 模式
./build.sh Debug
```

> 更进一步，可以配合 VSCode 的 `tasks.json`，按 `Ctrl+Shift+B` 直接触发编译，连脚本都不用跑。

---

# 常见问题

> SSH 连不上？

检查几个东西：
- 上位机和你的电脑在不在同一个局域网（ping 一下试试）
- 防火墙有没有放行 22 端口
- openssh-server 有没有装好（`sudo systemctl status ssh`）

> OpenCV 编译报错？

大概率是依赖没装全，回去把那堆 `libxxx-dev` 都装上。如果报 `libgtk` 相关错误，确认装了 `libgtk-3-dev`。

> 编译找不到库？

确认 `pkg-config` 能找到：
```bash
pkg-config --modversion opencv4
```
如果找不到，可能需要把 `/usr/local/lib/pkgconfig` 加到 `PKG_CONFIG_PATH` 里：
```bash
export PKG_CONFIG_PATH=/usr/local/lib/pkgconfig:$PKG_CONFIG_PATH
```

> ROS2 命令找不到？

检查有没有 source 环境：
```bash
source /opt/ros/humble/setup.bash
```
如果每次开终端都要手动 source，把它写进 `~/.bashrc`。

> Docker 权限不足？

```bash
sudo usermod -aG docker $USER
# 重新登录终端
```

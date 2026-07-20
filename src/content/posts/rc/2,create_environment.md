---
title: "开发环境搭建"
published: 2026-07-19
pinned: false
description: ""
tags: [ubuntu, 环境搭建, 教程]
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

>既然学会了git，那接下来我们就从耳熟能详的Windows转到上位机开发常用的Ubuntu吧

# 为什么是Ubuntu？
在RC上位机开发中，Ubuntu几乎是事实上的标准系统。原因很简单：
- ROS/ROS2 原生支持 Linux，Windows 上跑起来非常折腾
- OpenCV、PCL 等视觉库在 Linux 下编译和性能都更好
- 大部分开源的上位机项目和算法代码都是在 Ubuntu 下写的
- 嵌入式交叉编译工具链对 Linux 支持更友好

>当然，不是说Windows不能写上位机，但你迟早会碰到各种奇怪的环境问题。与其到时候再折腾，不如一开始就用Ubuntu。

>虽然但是如果各位用的是jetson的话，那很享福了，刷机和配环境值得我单开一期，碰到的问题包括但不限于：到头来还得自己编，刷机要求主机版本等等。

---

# 安装Ubuntu
目前主流有三种方式，各有优劣：

## 方案一：双系统（推荐）
最正经的方案，性能最好，也最接近真实上位机的使用场景。

**优点：** 性能拉满，GPU直通，最接近真实部署环境
**缺点：** 需要分区，切换系统要重启

步骤：
1. 去 [Ubuntu官网](https://ubuntu.com/download/desktop) 下载最新的 LTS 版本（推荐 22.04 或 24.04）
2. 用 Rufus 或 Ventoy 制作启动U盘
3. 重启电脑，进BIOS设置U盘启动
4. 安装时选择"与Windows共存"，分配至少100G空间

>注意：装双系统之前一定要备份数据，分区操作有风险

## 方案二：WSL2
如果你不想折腾分区，WSL2 是个很好的折中方案。

**优点：** 不用重启切换系统，和Windows无缝共存
**缺点：** GPU支持需要额外配置，GUI应用需要 WSLg

```powershell
# 在PowerShell（管理员）中执行
wsl --install -d Ubuntu-24.04
```
装完之后在开始菜单找到 Ubuntu，打开设置用户名密码就行了。

> WSL2 默认可以访问Windows的文件系统，你的代码放在 `/mnt/c/` 下就能在两个系统间共享

## 方案三：虚拟机
VMware 或 VirtualBox 都行。

**优点：** 不影响现有系统，快照功能方便回滚
**缺点：** 性能损耗大，USB设备（摄像头等）直通麻烦

>如果你需要接摄像头调参，虚拟机方案会很痛苦。建议用方案一或方案二。

---

# 装完系统第一件事：换源
Ubuntu 默认的软件源在国外，下载速度感人。第一步就是换成国内镜像。

```bash
# 备份原始源
sudo cp /etc/apt/sources.list /etc/apt/sources.list.bak

# 换成清华源（以24.04为例）
sudo sed -i 's|http://archive.ubuntu.com/ubuntu|https://mirrors.tuna.tsinghua.edu.cn/ubuntu|g' /etc/apt/sources.list

# 更新
sudo apt update && sudo apt upgrade -y
```

>如果你用的是 Ubuntu 24.04，源配置文件可能在 `/etc/apt/sources.list.d/ubuntu.sources`，格式不一样，具体去清华源官网复制对应版本的配置。

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

>记住一个原则：在Linux下，`rm -rf` 是不可逆的。没有回收站，删了就是删了。用之前多看一眼路径。

---

# SSH 配置
上位机一般不会接显示器键盘鼠标，都是通过SSH远程连接的。

## 在上位机上开启SSH服务
```bash
# 安装 openssh-server
sudo apt install openssh-server -y

# 查看SSH状态
sudo systemctl status ssh

# 查看上位机的IP地址
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

# 配置VSCode Remote SSH
命令行写代码终究不方便，VSCode 的 Remote SSH 插件可以让你在本地VSCode里编辑远程上位机的代码。

1. 在 VSCode 里安装插件 `Remote - SSH`
2. 按 `Ctrl+Shift+P`，输入 `Remote-SSH: Connect to Host`
3. 输入 `username@ip_address`，回车
4. 连上之后打开上位机的项目文件夹，和本地开发体验一样

>甚至终端也是远程的，直接在VSCode下面的终端里编译运行，非常方便

---

# 安装常用依赖
上位机开发需要装的东西大同小异，一并列出来：

## 编译工具链
```bash
sudo apt install -y build-essential cmake git
```

## OpenCV（从源码编译）
```bash
# 安装依赖
sudo apt install -y libgtk2.0-dev pkg-config libavcodec-dev libavformat-dev libswscale-dev libtbb2 libtbb-dev libjpeg-dev libpng-dev libtiff-dev libdc1394-dev

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

> `make -j$(nproc)` 会用满你所有的CPU核心来编译，上位机如果是多核的话会快很多

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

# 验证环境
装完之后跑个小程序验证一下：

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

如果能正常输出版本号和矩阵，说明环境没问题了。

---

# 常见问题

> SSH连不上？

检查几个东西：
- 上位机和你的电脑在不在同一个局域网（ping一下试试）
- 防火墙有没有放行22端口
- openssh-server 有没有装好（`sudo systemctl status ssh`）

> OpenCV编译报错？

大概率是依赖没装全，回去把那堆 `libxxx-dev` 都装上。如果报 `libgtk` 相关错误，确认装了 `libgtk2.0-dev` 或 `libgtk-3-dev`。

> 编译找不到库？

确认 `pkg-config` 能找到：
```bash
pkg-config --modversion opencv4
```
如果找不到，可能需要把 `/usr/local/lib/pkgconfig` 加到 `PKG_CONFIG_PATH` 里：
```bash
export PKG_CONFIG_PATH=/usr/local/lib/pkgconfig:$PKG_CONFIG_PATH
```

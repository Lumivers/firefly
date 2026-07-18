---
title: "如何使用git"
published: 2026-07-18
pinned: false
description: ""
tags: [git, 教程]
category: RC上位机
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 如题，作者在25赛季见到了很多哥们不喜欢，不懂得，不知道使用git，所以第一节我们先写如何使用git

# 为什么第一节是git？
在机械，电控，上位机开发中，git是非常好用的一个工具，不仅是起到一个备份的作用，更是有强大的版本管理功能。

如果你不用git，可能会碰到以下场景：
- 你改好的最新一版代码，队员上来给你用旧版本的覆盖了
- 你想回滚到最后一版稳定的代码，但是你找不到你的压缩包
- 在自己电脑上好好的，为什么去上位机上面就跑不起来

git就是你的后悔药和时光机，可以让你精准的回溯到每一个文件的编写。

## git最常使用的几个指令
git那么多指令记下来显然不现实，最常用的只有这几个：

### 拉取远程仓库
```bash
git clone <你的仓库地址>
```

### 日常开发使用
1. 查看自己目前改动了哪些文件
```bash
git status
```
2. 暂存当前更改
```bash
git add .
```
3. 提交更改，必须附上这次的更改说明，记录下你改了什么。
```bash
git commit -m "修改内容"
```
4. 把你的代码推送到云端
```bash
git push
```
---
不过令人可喜的是，VScode现在的git插件已经全面把这几个指令图形化了。所以现在也用不着再去cli里面敲指令了。

只需要在侧边栏里面找到源代码管理页面，里面有ai生成提交信息，提交，推送等功能，还能显示提交历史。总之非常好用。

>重点：学会配置.gitignore

上位机开发过程中会产生许多编译中间产物，这些往往是出来占你仓库内存的。比如数据集，测试集，build文件夹等。这些都不能上传到仓库里面，要不然拉代码会很折磨
>在项目根目录下创建一个名为.gitignore的文件，把不需要上传的文件夹或者文件写进去：
```
# 忽略 CMake 编译生成的各种中间件
build/
bin/

# 忽略 VS Code 的本地配置
.vscode/

# 忽略日志文件和测试视频
*.log
*.mp4
*.avi
```
---
## 经典报错
>fatal: No configured push destination.

git根本不知道你要推送到哪，去你的仓库里面复制一下链接，然后执行：
```
# 告诉本地 Git，远程仓库的代号叫 origin，地址是后面这串
git remote add origin <你的远程仓库开源地址>
```
验证：运行**git remote -v**，如果能看到两条带origin的玩意，就跑通了

> error: failed to push some refs to ... 或者提示找不到分支。

历史遗留问题，现在平台的默认主分支为main，旧版本git init出来的分支叫master。名字对不上推不上去。

执行：
```
git branch -M main
```
即可。

>fatal: refusing to merge unrelated histories

你在云端建仓库的时候，手痒勾选了“初始化仓库/生成 README.md / 添加 .gitignore”。这就导致云端有了一个“初始提交”，而你本地也有自己的代码提交。Git 认为这是两个完全不相干的独立项目，为了安全，拒绝让你推送和合并。

方案A：允许无关历史合并，先把云端的东西拉下来再说：
```
git pull origin main --allow-unrelated-histories
```
拉下来之后再提交就行，不过可能会让你写merge说明

方案B:不管云端有什么，本地优先（前期可用，后期禁止）
```
git push -u origin main -f    # -f 代表 force（强制）
```
注意，这个会强制把云端仓库内容覆盖为上传者的当前仓库，但是前期没东西的话可以用。

>想少遭这种罪的话，最简单的是先在云端创好仓库，然后再**git clone**下来就行
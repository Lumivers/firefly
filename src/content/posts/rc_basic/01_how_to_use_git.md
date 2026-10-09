---
title: "最重要的一课：Git 版本控制与协作规范"
published: 2026-07-18
pinned: false
weight: 1
description: "为什么新人进队第一天必须学 Git？初始身份配置、日常提交流程、极简分支流、.gitignore 避坑与后补失效解药、代码抢推被拒与经典报错急救手册。"
tags: [git, 团队规范, 教程, 新手入门]
category: RC上位机入门
licenseName: "CC BY-NC-SA 4.0"
author: "lumivers"
image: ""
draft: false
---

> 如题，作者在 25 赛季见到了很多哥们不喜欢、不懂得、不知道使用 git，导致各种悲剧发生。所以新队员进队第一课，我们先讲明白如何使用 git。

# 为什么第一节是 Git？

在机械、电控、上位机开发中，Git 是极其重要的协同与版本管理工具，不仅是备份，更是团队开发的安全底线。

如果你不用 Git，很可能会在备赛过程中经历以下绝望场景：
- 你调了一整天、终于能跑起来的最新一版代码，被队友随手拷了个旧工程压缩包直接覆盖了；
- 车子突然发疯撞墙，你想回滚到上一次正常的代码，却发现桌面上一堆 `main_final.cpp`、`main_final_真的final.cpp`，根本不知道哪个是对的；
- 在自己笔记本上跑得好好的，拷到车载工控机上死活跑不起来，还不知道到底差了哪个文件。

**Git 就是你的后悔药和时光机**，它可以让你精准回溯到任何一个历史提交节点，随时撤销误操作。

---

## 开荒必做：配置你的 Git 身份

刚装好系统的纯净电脑，敲 `git commit` 时会被系统直接拒绝，并提示 `Author identity unknown`。在开始任何操作前，先在终端里告诉 Git 你是谁（只需执行一次）：

```bash
git config --global user.name "你的名字拼音或英文ID"
git config --global user.email "你的常用邮箱@xxx.com"
```

> **代码托管平台建议**：  
> 队内日常协作强烈推荐使用 **Gitee（码云）**，服务器在国内，没有网络限制，拉取速度极快。  
> 如果必须使用 GitHub，请注意：**GitHub 早已禁用了直接输入账号密码推送代码的功能**。最稳妥的方式是在第二章中配置好 SSH 秘钥后，把你的 `id_ed25519.pub` 公钥粘贴到 GitHub 的 `Settings -> SSH and GPG keys` 中，以后克隆和推送一律使用 `git@github.com:...` 形式的 SSH 链接，免密且不会鉴权失败。

---

## 一、Git 最常使用的核心指令

Git 命令虽然多，但新手日常开发能用到的 90% 场景只有以下几个：

### 1. 拉取远程仓库
第一次加入战队拿到代码仓库地址时：
```bash
git clone <你的仓库地址>
```

### 2. 日常开发标准四步走
1. **查看自己改动了哪些文件**：
   ```bash
   git status
   ```
2. **暂存当前更改**：
   ```bash
   git add .
   ```
3. **提交更改（必须写清楚更新说明）**：
   ```bash
   git commit -m "feat: 增加红蓝颜色提取阈值滑块"
   ```
4. **把代码推送到云端**：
   ```bash
   git push
   ```

---

## 二、极简分支流：不要在主分支上裸奔

战队多人协作最忌讳的是所有人都在 `main` 或 `master` 主分支上改代码，代码写到一半还没测试就推上去，其他队友一拉取直接编译报错、全队瘫痪。

**标准的工作流程是：每个人在自己的分支上开发，测试通过后再合并。**

```bash
# 1. 基于当前最新代码，新建并切换到自己的特性开发分支
# 分支命名规范：feat/功能名 或 fix/修复问题
git switch -c feat/color_tune

# 2. 在自己的分支里改代码、编译测试、正常 add 和 commit
git add .
git commit -m "feat: 完成黄色道具颜色分割"

# 3. 第一次把自己的新分支推送到云端（-u 会建立远程关联）
git push -u origin feat/color_tune

# 4. 后续在该分支下改动，直接 git push 即可
```

等算法在车上彻底跑通了，去 Gitee / GitHub 网页端提一个 Pull Request（PR）或让学长帮你合并进 `main` 分支。这样哪怕你的代码写崩了，也绝不会波及正在调试机器人的其他队友。

---

## 三、VS Code 图形化操作（新手福音）

现代 VS Code 的 Git 插件已经把上述命令全面图形化了，日常开发中你甚至不需要在终端里手动敲命令：

1. 在 VS Code 左侧边栏找到 **“源代码管理”** 图标（快捷键 `Ctrl + Shift + G`）；
2. 更改过的文件会在“更改”列表里列出，点击文件名能看到左右对比的 Diff 视图；
3. 点击文件右侧的 `+` 号就相当于 `git add`；
4. 在上方输入框填写本次提交的说明，点击“提交”按钮即完成 `git commit`；
5. 最后点击“同步更改”即可自动拉取和推送到云端。

---

## 四、重点：学会配置 .gitignore 与后补失效解药

上位机开发过程中会产生大量编译中间产物和临时测试文件，这些文件**绝对不能上传到仓库里**：
- 比如 CMake 的 `build/` 目录、二进制可执行文件；
- 动辄几百兆的数据集图片、录制的现场视频（`.mp4` / `.avi`）；
- 自己的 VS Code 本地编辑器配置。

如果把这些垃圾扔进 Git，仓库会瞬间暴增几个 G，队友 `git pull` 时会非常痛苦。

### 1. 标准的 .gitignore 模板
在项目根目录下创建一个名为 `.gitignore` 的文件，把不需要上传的内容写进去：

```gitignore
# 忽略 CMake 编译生成的各种中间文件与目录
build/
bin/
*.o
*.a
*.so

# 忽略 VS Code / CLion 的本地个性化配置
.vscode/
.idea/

# 忽略日志文件
*.log

# 忽略大型数据集与测试视频
dataset/
*.mp4
*.avi
```

### 2. 致命暗坑：后补 .gitignore 规则失效怎么办？
新手最常见的操作：先跑了代码，把编译出来的 `build/` 文件夹一股脑 `git add .` 提交了，然后才想起来建 `.gitignore`。  
此时你会发现：即使把 `build/` 写进了 `.gitignore`，每次编译完 Git 依然会疯狂提示有文件变动！

**原因**：`.gitignore` 只对**从未被追踪（Untracked）的新文件生效**。对于已经被暂存或提交过的文件，规则会自动忽略。

**必敲解药命令**：清除暂存区缓存并重新应用规则：
```bash
# 递归清除本地 Git 暂存区缓存（不会删除你的物理磁盘文件）
git rm -r --cached .

# 重新扫描并提交干净的索引
git add .
git commit -m "chore: 修复 .gitignore 忽略规则"
git push
```

---

## 五、经典报错急救指南

### 1. `[rejected] main -> main (fetch first)`（代码被拒推）
**原因**：队友刚推了新代码，你本地分支落后于云端，Git 为了防止覆盖他人成果拒绝直接推。  
**解决办法**：
推荐配置全局拉取变基策略，保持提交历史干净整洁：
```bash
git config --global pull.rebase true
```
然后先拉取远程变基，再推送：
```bash
git pull && git push
```

---

### 2. `fatal: No configured push destination.`
**原因**：本地仓库没有绑定远程地址。  
**解决办法**：去平台复制仓库链接绑定：
```bash
git remote add origin <你的远程仓库地址>
```

---

### 3. `fatal: refusing to merge unrelated histories`
**原因**：在网页端建仓库时勾选了“初始化 README.md”，导致云端和本地存在独立历史。  
**解决办法**：允许合并无关历史：
```bash
git pull origin main --allow-unrelated-histories
```
解决可能的冲突后再正常推送。

---

## 🎯 本章通关小作业

1. 打开终端，配置好你的 `git config --global user.name` 和 `user.email`；
2. 在 Gitee 或 GitHub 上新建一个测试仓库，命名为 `rc_test`；
3. 本地 `git clone` 下来，新建并切换到一个新特性分支 `feat/dev_init`；
4. 在项目根目录创建 `.gitignore`，写入 `build/` 和 `*.o`；
5. 新建一个 `test.o` 模拟编译产物，运行 `git status`，验证它是否已经被成功忽略；
6. 提交你的改动，并用 `git push -u origin feat/dev_init` 将分支推送到云端。
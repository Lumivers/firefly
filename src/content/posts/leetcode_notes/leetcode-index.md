---
title: "LeetCode 笔记索引"
published: 2026-03-19
pinned: true
description: "我的力扣刷题记录索引。按照数据结构与算法专题分类，方便查阅与复盘。"
tags: [力扣, 算法, 索引]
category: 算法
author: "lonelystar"
image: ""
draft: false
lang: "zh"
---

欢迎来到我的 **LeetCode 刷题笔记索引**！所有的题解都经过了深度美化，并包含详细的思路分析、多种解法对比以及 $O(n)$ 级别的复杂度推导。

---

## 🏗️ 数组 (Array)

| 题号 | 题目名称 | 核心考点 | 难度 |
| :--- | :--- | :--- | :--- |
| 1 | [两数之和](../1two-sum/) | 哈希表、暴力扫描 | 🟢 简单 |
| 26 | [删除有序数组中的重复项](../26remove-duplicates-from-sorted-array/) | 双指针 (快慢指针) | 🟢 简单 |
| 27 | [移除元素](../27remove-element/) | 双指针 (原地修改) | 🟢 简单 |
| 35 | [搜索插入位置](../35search-insert-position/) | 二分查找 (左闭右开) | 🟢 简单 |
| 66 | [加一](../66plus-one/) | 进位处理、数学模拟 | 🟢 简单 |
| 69 | [x 的平方根](../69sqrtx/) | 二分查找、牛顿迭代法 | 🟢 简单 |
| 70 | [爬楼梯](../70climbing-stairs/) | 动态规划、状态转移 | 🟢 简单 |
| 88 | [合并两个有序数组](../88merge-sorted-array/) | 逆向双指针、原地合并 | 🟢 简单 |

---

## 🔤 字符串 (String)

| 题号 | 题目名称 | 核心考点 | 难度 |
| :--- | :--- | :--- | :--- |
| 9 | [回文数](../9palindrome-number/) | 双指针、数学反转 | 🟢 简单 |
| 13 | [罗马数字转整数](../13roman-to-integer/) | 哈希表、映射逻辑 | 🟢 简单 |
| 14 | [最长公共前缀](../14longest-common-prefix/) | 排序比对、字典树 (Trie) | 🟢 简单 |
| 20 | [有效的括号](../20valid-parentheses/) | 栈 (Stack)、LIFO 逻辑 | 🟢 简单 |
| 28 | [找出字符串第一个匹配项](../28find-the-index-of-the-first-occurrence-in-a-string/) | KMP 算法、双指针 | 🟢 简单 |
| 58 | [最后一个单词的长度](../58length-of-last-word/) | 反向遍历、边界处理 | 🟢 简单 |

---

## 🔗 链表 (Linked List)

| 题号 | 题目名称 | 核心考点 | 难度 |
| :--- | :--- | :--- | :--- |
| 21 | [合并两个有序链表](../21merge-two-sorted-lists/) | 递归、归并迭代 | 🟢 简单 |
| 83 | [删除排序链表中的重复元素](../83remove-duplicates-from-sorted-list/) | 指针移动、节点跳过 | 🟢 简单 |

---

## 🌲 树 (Tree)

| 题号 | 题目名称 | 核心考点 | 难度 |
| :--- | :--- | :--- | :--- |
| 94 | [二叉树的中序遍历](../94binary-tree-inorder-traversal/) | 栈 (Stack)、递归/迭代、Morris | 🟢 简单 |
| 100 | [相同的树](../100same-tree/) | 递归 DFS、结构比对 | 🟢 简单 |
| 101 | [对称二叉树](../101symmetric-tree/) | 递归/层序迭代、镜像逻辑 | 🟢 简单 |
| 102 | [二叉树的层序遍历](../102binary-tree-level-order-traversal/) | 广度优先搜索 (BFS)、队列 | 🟡 中等 |
| 104 | [二叉树的最大深度](../104maximum-depth-of-binary-tree/) | 后序遍历、层序 BFS | 🟢 简单 |
| 107 | [二叉树的层序遍历 II](../107binary-tree-level-order-traversal-ii/) | BFS 模板、结果反转 | 🟡 中等 |
| 108 | [有序数组转二叉搜索树](../108convert-sorted-array-to-binary-search-tree/) | 二分查找思维、递归分治 | 🟢 简单 |

---

## 🏗️ 动态规划 (Dynamic Programming)

| 题号 | 题目名称 | 核心考点 | 难度 |
| :--- | :--- | :--- | :--- |
| 70 | [爬楼梯](../70climbing-stairs/) | 状态转移方程、滚动优化 | 🟢 简单 |

---

## 🧮 数学 (Math)

| 题号 | 题目名称 | 核心考点 | 难度 |
| :--- | :--- | :--- | :--- |
| 9 | [回文数](../9palindrome-number/) | 整数反转、溢出处理 | 🟢 简单 |
| 13 | [罗马数字转整数](../13roman-to-integer/) | 映射关系、哈希表 | 🟢 简单 |
| 66 | [加一](../66plus-one/) | 进位处理、数组模拟 | 🟢 简单 |
| 69 | [x 的平方根](../69sqrtx/) | 数值逼近、溢出处理 | 🟢 简单 |
| 70 | [爬楼梯](../70climbing-stairs/) | 斐波那契、动态规划 | 🟢 简单 |

---

## 🧠 专题汇总

### 💡 核心思想 (Top Meta-Tags)
- **双指针 (Two Pointers)**: [1.两数之和](../1.two-sum/) · [9.回文数](../9palindrome-number/) · [26.去重](../26remove-duplicates-from-sorted-array/) · [27.移除](../27remove-element/) · [28.KMP](../28find-the-index-of-the-first-occurrence-in-a-string/) · [88.合并](../88merge-sorted-array/)
- **哈希表 (Hash Table)**: [1.两数之和](../1.two-sum/) · [13.罗马数字转整数](../13roman-to-integer/)
- **专题汇总 (Special Topics)**: [20.栈](../20valid-parentheses/) · [14.字典树](../14longest-common-prefix/) · [35/69.二分法](../35search-insert-position/) · [70.滚动 DP](../70climbing-stairs/) · [83.链表指针](../83remove-duplicates-from-sorted-list/) · [94/100/101.DFS](../94binary-tree-inorder-traversal/) · [102.BFS](../102binary-tree-level-order-traversal/)

---

> [!TIP]
> 每一个题解文件内部都包含了一段精简的“避坑指南”，建议在面试前快速翻看。

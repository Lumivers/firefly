import os
import re
import datetime

base_dir = r"E:\firefly\src\content\posts\Lumi-hub_dev_notes"

def format_file(filepath, dir_name):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 如果已经有 frontmatter，跳过
    if content.startswith('---'):
        return

    # 提取标题
    title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else os.path.basename(filepath).replace('.md', '')

    # 提取日期
    # 尝试从内容中提取 "记录时间：2026-03-01"
    date_match = re.search(r'记录时间：(\d{4}-\d{2}-\d{2})', content)
    if date_match:
        date_str = date_match.group(1)
    else:
        # 尝试从目录名 "2026.3.1" 转换
        try:
            parts = dir_name.split('.')
            if len(parts) == 3:
                y, m, d = parts
                date_str = f"{y}-{int(m):02d}-{int(d):02d}"
            else:
                date_str = datetime.date.today().isoformat()
        except:
            date_str = datetime.date.today().isoformat()

    # 提取描述 (移除标题后的第一段非引用文本)
    # 或者简单的提取前 100 个字符
    desc_match = re.search(r'内容：(.+)$', content, re.MULTILINE)
    if desc_match:
        description = desc_match.group(1).strip()
    else:
        # 排除标题和引用，找第一段文字
        body = re.sub(r'#+\s+.+\n', '', content)
        body = re.sub(r'>.+\n', '', body)
        body = body.strip()
        description = body[:150].replace('\n', ' ').strip() + '...'

    # 构建 Frontmatter
    frontmatter = f"""---
title: {title}
published: {date_str}
description: '{description}'
image: 'api'
tags: [Lumi-hub, 开发笔记]
category: 开发笔记
draft: false
pinned: false
---

"""
    # 移除原始文件中的第一个 H1 标题（因为 Frontmatter 会生成标题）
    new_content = frontmatter + re.sub(r'^#\s+.+\n?', '', content, count=1).lstrip()

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Formatted: {filepath}")

for root, dirs, files in os.walk(base_dir):
    for file in files:
        if file.endswith('.md'):
            filepath = os.path.join(root, file)
            dir_name = os.path.basename(root)
            format_file(filepath, dir_name)

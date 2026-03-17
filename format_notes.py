import os
import re
import datetime

base_dir = r"E:\firefly\src\content\posts\Lumi-hub_dev_notes"

def escape_yaml_string(s):
    if not s:
        return ""
    # 转义双引号，并将换行符替换为空格
    return s.replace('"', '\\"').replace('\n', ' ').strip()

def format_file(filepath, dir_name, force=False):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 如果已经有 frontmatter 且不是强制模式，则跳过
    if content.startswith('---') and not force:
        return

    # 如果是强制模式且已有 frontmatter，先剥离它
    if content.startswith('---'):
        parts = content.split('---', 2)
        if len(parts) >= 3:
            content = parts[2].lstrip()

    # 提取标题
    title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else os.path.basename(filepath).replace('.md', '')

    # 提取日期
    date_match = re.search(r'记录时间：(\d{4}-\d{2}-\d{2})', content)
    if date_match:
        date_str = date_match.group(1)
    else:
        try:
            parts = dir_name.split('.')
            if len(parts) == 3:
                y, m, d = parts
                date_str = f"{y}-{int(m):02d}-{int(d):02d}"
            else:
                date_str = datetime.date.today().isoformat()
        except:
            date_str = datetime.date.today().isoformat()

    # 提取描述
    desc_match = re.search(r'内容：(.+)$', content, re.MULTILINE)
    if desc_match:
        description = desc_match.group(1).strip()
    else:
        body = re.sub(r'#+\s+.+\n', '', content)
        body = re.sub(r'>.+\n', '', body)
        body = body.strip()
        description = body[:150].replace('\n', ' ').strip()
        if len(body) > 150:
            description += '...'

    # 构建 Frontmatter (使用双引号包裹以增加鲁棒性)
    frontmatter = f"""---
title: "{escape_yaml_string(title)}"
published: {date_str}
description: "{escape_yaml_string(description)}"
image: "api"
tags: [Lumi-hub, 开发笔记]
category: 开发笔记
draft: false
pinned: false
---

"""
    # 移除原始文件中的第一个 H1 标题
    new_content = frontmatter + re.sub(r'^#\s+.+\n?', '', content, count=1).lstrip()

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Formatted: {filepath}")

for root, dirs, files in os.walk(base_dir):
    for file in files:
        if file.endswith('.md'):
            filepath = os.path.join(root, file)
            dir_name = os.path.basename(root)
            # 强制更新以修复之前错误的 Frontmatter
            format_file(filepath, dir_name, force=True)

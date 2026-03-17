import os
import sys
from pathlib import Path
from PIL import Image

# 配置
TARGET_DIRS = [
    "src/assets/images/DesktopWallpaper",
    "src/assets/images/MobileWallpaper"
]
TARGET_FORMAT = "webp"
QUALITY = 85  # 建议 75-85
DELETE_ORIGINAL = True  # 建议先确认效果再开启，或者手动删除

def optimize_images():
    base_path = Path(os.getcwd())
    total_original_size = 0
    total_new_size = 0
    processed_count = 0

    print(f"🚀 开始优化图片... (目标格式: {TARGET_FORMAT}, 质量: {QUALITY})")
    
    for dir_rel in TARGET_DIRS:
        dir_path = base_path / dir_rel
        if not dir_path.exists():
            print(f"⚠️ 目录未找到: {dir_rel}")
            continue

        print(f"📁 正在扫描: {dir_rel}")
        
        # 遍历所有子目录
        for img_path in dir_path.rglob("*"):
            # 排除已经是 WebP 的文件或非图片文件
            if img_path.suffix.lower() in [".webp", ".gitkeep"] or img_path.is_dir():
                continue
            
            try:
                # 检查是否是图片格式
                if img_path.suffix.lower() not in [".jpg", ".jpeg", ".png", ".avif"]:
                    continue

                with Image.open(img_path) as img:
                    # 准备新文件名
                    new_path = img_path.with_suffix(f".{TARGET_FORMAT}")
                    
                    # 获取原始大小
                    original_size = img_path.stat().st_size
                    total_original_size += original_size
                    
                    # 转换并保存
                    # 如果是 RGBA 则保留背景或转为 RGB（WebP 支持透明度）
                    img.save(new_path, format=TARGET_FORMAT, quality=QUALITY, lossless=False)
                    
                    new_size = new_path.stat().st_size
                    total_new_size += new_size
                    processed_count += 1
                    
                    reduction = (original_size - new_size) / original_size * 100
                    print(f"✅ 处理完成: {img_path.name} -> {new_path.name} ({reduction:.1f}% 缩减)")

                    if DELETE_ORIGINAL:
                        img_path.unlink()
                        
            except Exception as e:
                print(f"❌ 无法处理 {img_path.name}: {e}")

    if processed_count > 0:
        saved_mb = (total_original_size - total_new_size) / (1024 * 1024)
        print("\n" + "="*40)
        print(f"🎉 优化完成！")
        print(f"📝 处理文件数: {processed_count}")
        print(f"📉 原始总大小: {total_original_size / (1024 * 1024):.2f} MB")
        print(f"📈 优化后大小: {total_new_size / (1024 * 1024):.2f} MB")
        print(f"💎 共节省空间: {saved_mb:.2f} MB")
        print("="*40)
        if not DELETE_ORIGINAL:
            print("💡 提示: 原始高分辨率图片仍保留在原处。确认网页效果满意后，您可以手动删除它们或将脚本中的 DELETE_ORIGINAL 设为 True 再次运行。")
    else:
        print("\n✨ 未发现需要优化的新图片。")

if __name__ == "__main__":
    optimize_images()

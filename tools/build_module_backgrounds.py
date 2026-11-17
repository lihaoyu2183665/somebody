# -*- coding: utf-8 -*-
"""把 4 张雪场照片裁成模块 hero 横幅背景。

源图副本保存在 tools/backgrounds/，输出 assets/module-*.jpg。
统一做轻微降饱和与淡蓝调和处理，与护眼淡蓝主题协调，避免高饱和色块刺眼。
换图时替换对应 *-source.jpg 后重跑本脚本即可。
"""
import os
from PIL import Image, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'tools', 'backgrounds')
OUT_DIR = os.path.join(ROOT, 'assets')
SIZE = (960, 520)  # 2x 横幅，约 1.85:1
TINT = (220, 235, 247)  # #DCEBF7 主题浅蓝

# key, 源图, 垂直裁切锚点（0=贴顶, 1=贴底；竖版主体偏上时取 0.3 左右）
SOURCES = [
    ('buddy', 'buddy-source.jpg', 0.33),
    ('trip', 'trip-source.jpg', 0.50),
    ('coach', 'coach-source.jpg', 0.50),
    ('gear', 'gear-source.jpg', 0.34),
]


def crop_to_ratio(im, ratio, anchor):
    w, h = im.size
    if w / h >= ratio:
        new_w = int(round(h * ratio))
        left = (w - new_w) // 2
        return im.crop((left, 0, left + new_w, h))
    new_h = int(round(w / ratio))
    top = int(round((h - new_h) * anchor))
    top = max(0, min(top, h - new_h))
    return im.crop((0, top, w, top + new_h))


def main():
    ratio = SIZE[0] / SIZE[1]
    for key, filename, anchor in SOURCES:
        src = os.path.join(SRC_DIR, filename)
        im = Image.open(src).convert('RGB')
        im = crop_to_ratio(im, ratio, anchor)
        im = im.resize(SIZE, Image.LANCZOS)
        # 轻微柔化：降饱和 + 微提亮 + 6% 淡蓝调和
        im = ImageEnhance.Color(im).enhance(0.88)
        im = ImageEnhance.Brightness(im).enhance(1.03)
        im = Image.blend(im, Image.new('RGB', SIZE, TINT), 0.06)
        out = os.path.join(OUT_DIR, 'module-%s.jpg' % key)
        im.save(out, 'JPEG', quality=84, optimize=True)
        print('%-6s %-22s -> module-%-6s.jpg %6d bytes' % (
            key, filename, key, os.path.getsize(out)))


if __name__ == '__main__':
    main()

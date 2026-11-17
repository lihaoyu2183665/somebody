# -*- coding: utf-8 -*-
"""把 9 张雪友插画压缩为小程序内置卡通头像。

源图：剪贴板导出的 9 张 1080x1083 JPG（默认目录 SRC_DIR，可传参覆盖）
产物：assets/avatar-art-1.jpg ... avatar-art-9.jpg（240x240 正方形 JPEG）

用法：python tools/build_avatars.py [源图目录]
"""
import os
import sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC_DIR = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\Administrator\.workbuddy\clipboard-images'
OUT_DIR = os.path.join(ROOT, 'assets')
SIZE = 240
QUALITY = 82

# (序号, 源图文件名, 界面展示名) —— 展示名沿用用户提供的原始文件名
AVATARS = [
    (1, 'clipboard-2026-11-10T15-00-15-426Z-6cb88a0d.jpg', '女1'),
    (2, 'clipboard-2026-11-10T15-00-15-427Z-45e43d7c.jpg', '女2'),
    (3, 'clipboard-2026-11-10T15-00-15-432Z-a1ed31f1.jpg', '女3'),
    (4, 'clipboard-2026-11-10T15-00-15-432Z-b05bc230.jpg', '女4'),
    (5, 'clipboard-2026-11-10T15-00-15-428Z-78c150ca.jpg', '男1'),
    (6, 'clipboard-2026-11-10T15-00-15-429Z-da426906.jpg', '男2'),
    (7, 'clipboard-2026-11-10T15-00-15-431Z-c50a27dc.jpg', '男3'),
    (8, 'clipboard-2026-11-10T15-00-15-433Z-b0024d3c.jpg', '男4'),
    (9, 'clipboard-2026-11-10T15-00-15-429Z-dbba9ca9.jpg', '男5'),
]


def main():
    for index, filename, label in AVATARS:
        source = os.path.join(SRC_DIR, filename)
        if not os.path.isfile(source):
            raise SystemExit('缺少源图: ' + source)
        image = Image.open(source).convert('RGB')
        width, height = image.size
        side = min(width, height)
        left, top = (width - side) // 2, (height - side) // 2
        image = image.crop((left, top, left + side, top + side))
        image = image.resize((SIZE, SIZE), Image.LANCZOS)
        target = os.path.join(OUT_DIR, 'avatar-art-%d.jpg' % index)
        image.save(target, 'JPEG', quality=QUALITY, optimize=True)
        print('avatar-art-%d.jpg' % index, label, image.size, os.path.getsize(target), 'bytes')


if __name__ == '__main__':
    main()

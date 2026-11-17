# -*- coding: utf-8 -*-
"""由雪狸品牌 LOGO 原稿生成小程序用的透明 PNG 资源。

源图：tools/brand-source.png（透明底，908x511，可见内容约 208x304）
产物：
  assets/brand-logo.png  完整标识（蓝色图形 + 雪狸 + ARCTIC CIVET）
  assets/brand-mark.png  仅蓝色图形标记，正方形画布，用于小尺寸品牌角标

用法：python tools/build_brand_assets.py [源图路径]
更换原稿后重跑本脚本即可；若新稿构图不同，请核对 MARK_HEIGHT。
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tools', 'brand-source.png')
OUT_DIR = os.path.join(ROOT, 'assets')
SCALE = 2
PAD = 8
# 原稿中蓝色图形 y=89..294，中文「雪狸」自 y=301 起；裁掉文字即为纯图形标记。
MARK_HEIGHT = 206


def content_box(image):
    alpha = image.getchannel('A')
    return alpha.point(lambda v: 255 if v > 12 else 0).getbbox()


def padded(image, pad):
    canvas = Image.new('RGBA', (image.width + pad * 2, image.height + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(image, (pad, pad))
    return canvas


def square(image):
    side = max(image.width, image.height)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas


def save(image, name):
    output = image.resize((image.width * SCALE, image.height * SCALE), Image.LANCZOS)
    path = os.path.join(OUT_DIR, name)
    output.save(path, 'PNG', optimize=True)
    print(name, output.size, os.path.getsize(path), 'bytes')


def main():
    source = Image.open(SOURCE).convert('RGBA')
    box = content_box(source)
    if not box:
        raise SystemExit('源图没有可见内容')
    content = source.crop(box)
    mark = content.crop((0, 0, content.width, min(MARK_HEIGHT, content.height)))
    save(padded(content, PAD), 'brand-logo.png')
    save(padded(square(mark), PAD), 'brand-mark.png')


if __name__ == '__main__':
    main()

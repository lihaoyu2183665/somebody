"""生成小程序线性图标与轻量山峦插画（纯图形，无 Emoji）。

运行：python tools/generate_assets.py
产物写入 assets/，供 tabBar、页面内图标与首页横幅使用。
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets')
os.makedirs(OUT, exist_ok=True)

S = 4
BRAND = (61, 120, 168, 255)
MUTED = (143, 168, 188, 255)
WHITE = (255, 255, 255, 255)


def new(size):
    image = Image.new('RGBA', (size * S, size * S), (0, 0, 0, 0))
    return image, ImageDraw.Draw(image)


def save(image, size, name):
    image.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))


def line(draw, points, color, width=5):
    draw.line([(x * S, y * S) for x, y in points], fill=color,
              width=max(1, int(width * S)), joint='curve')


def ellipse(draw, box, color, width=5, fill=None):
    draw.ellipse(tuple(value * S for value in box), outline=color,
                 width=max(1, int(width * S)), fill=fill)


def arc(draw, box, start, end, color, width=5):
    draw.arc(tuple(value * S for value in box), start=start, end=end,
             fill=color, width=max(1, int(width * S)))


def polygon(draw, points, color, width=5, fill=None):
    scaled = [(x * S, y * S) for x, y in points]
    if fill:
        draw.polygon(scaled, fill=fill)
    draw.line(scaled + [scaled[0]], fill=color, width=max(1, int(width * S)), joint='curve')


def rect(draw, box, color, width=5):
    draw.rectangle(tuple(value * S for value in box), outline=color,
                   width=max(1, int(width * S)))


# ---------- 五个底部导航图标 ----------

def buddy(draw, color):
    ellipse(draw, (18, 16, 34, 32), color)
    arc(draw, (9, 31, 43, 64), 180, 360, color)
    ellipse(draw, (46, 16, 62, 32), color)
    arc(draw, (37, 31, 71, 64), 180, 360, color)
    line(draw, [(9, 69), (71, 69)], color, 4)


def trip(draw, color):
    line(draw, [(26, 12), (26, 69)], color)
    polygon(draw, [(26, 14), (63, 23), (26, 37)], color)
    line(draw, [(13, 69), (70, 69)], color, 4)


def coach(draw, color):
    ellipse(draw, (15, 11, 65, 61), color)
    line(draw, [(28, 36), (37, 45), (53, 27)], color, 6)


def gear(draw, color):
    polygon(draw, [(14, 34), (34, 14), (68, 14), (68, 48), (48, 68), (14, 68)], color)
    ellipse(draw, (24, 24, 33, 33), color, 4)


def mine(draw, color):
    ellipse(draw, (28, 11, 52, 35), color)
    arc(draw, (12, 40, 68, 94), 180, 360, color)


TAB_ICONS = {
    'buddy': buddy,
    'trip': trip,
    'coach': coach,
    'gear': gear,
    'mine': mine,
}


def generate_tabs():
    for name, painter in TAB_ICONS.items():
        image, draw = new(81)
        painter(draw, MUTED)
        save(image, 81, f'tab-{name}.png')
        image, draw = new(81)
        painter(draw, BRAND)
        save(image, 81, f'tab-{name}-on.png')


# ---------- 页面内线性图标 ----------

def ico_clock(draw, color):
    ellipse(draw, (6, 6, 42, 42), color, 4)
    line(draw, [(24, 13), (24, 25), (32, 30)], color, 4)


def ico_pin(draw, color):
    polygon(draw, [(24, 43), (11, 22), (37, 22)], color, 4)
    ellipse(draw, (14, 5, 34, 25), color, 4)
    ellipse(draw, (21, 12, 27, 18), color, 3)


def ico_people(draw, color):
    ellipse(draw, (8, 8, 22, 22), color, 3)
    arc(draw, (3, 22, 27, 44), 180, 360, color, 3)
    ellipse(draw, (27, 8, 41, 22), color, 3)
    arc(draw, (22, 22, 46, 44), 180, 360, color, 3)


def ico_car(draw, color):
    rect(draw, (5, 20, 43, 35), color, 4)
    line(draw, [(12, 20), (18, 11), (31, 11), (37, 20)], color, 4)
    ellipse(draw, (10, 31, 18, 39), color, 3)
    ellipse(draw, (30, 31, 38, 39), color, 3)


def ico_tag(draw, color):
    polygon(draw, [(7, 22), (21, 7), (41, 7), (41, 27), (26, 42), (7, 42)], color, 4)
    ellipse(draw, (13, 13, 18, 18), color, 3)


def ico_calendar(draw, color):
    rect(draw, (6, 10, 42, 41), color, 4)
    line(draw, [(6, 21), (42, 21)], color, 4)
    line(draw, [(15, 5), (15, 14)], color, 4)
    line(draw, [(33, 5), (33, 14)], color, 4)


def ico_arrow(draw, color):
    line(draw, [(16, 9), (32, 24), (16, 39)], color, 4)


def ico_plus(draw, color):
    line(draw, [(24, 9), (24, 39)], color, 4)
    line(draw, [(9, 24), (39, 24)], color, 4)


PAGE_ICONS = {
    'clock': ico_clock,
    'pin': ico_pin,
    'people': ico_people,
    'car': ico_car,
    'tag': ico_tag,
    'calendar': ico_calendar,
    'arrow': ico_arrow,
    'plus': ico_plus,
}


def generate_page_icons():
    for name, painter in PAGE_ICONS.items():
        image, draw = new(48)
        painter(draw, MUTED)
        save(image, 48, f'ico-{name}.png')


# ---------- 轻量山峦插画 ----------

def generate_hero():
    width, height = 750, 300
    scale = 2
    image = Image.new('RGBA', (width * scale, height * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def poly(points, fill, outline=None, outline_width=3):
        scaled = [(x * scale, y * scale) for x, y in points]
        draw.polygon(scaled, fill=fill)
        if outline:
            draw.line(scaled + [scaled[0]], fill=outline,
                      width=outline_width * scale, joint='curve')

    poly([(0, 300), (0, 218), (150, 78), (292, 218), (360, 300)], (220, 235, 247, 255))
    poly([(170, 300), (330, 120), (500, 300)], (198, 222, 239, 255))
    poly([(400, 300), (575, 92), (750, 300)], (176, 209, 232, 255))
    poly([(545, 300), (665, 175), (750, 265), (750, 300)], (210, 230, 244, 255))
    # 雪道曲线
    draw.line([(330 * scale, 120 * scale), (318 * scale, 178 * scale),
               (352 * scale, 216 * scale), (338 * scale, 300 * scale)],
              fill=(247, 251, 253, 255), width=7 * scale, joint='curve')
    draw.line([(575 * scale, 92 * scale), (560 * scale, 160 * scale),
               (596 * scale, 214 * scale), (580 * scale, 300 * scale)],
              fill=(247, 251, 253, 255), width=6 * scale, joint='curve')
    # 柔和的太阳
    draw.ellipse((620 * scale, 28 * scale, 680 * scale, 88 * scale),
                 outline=(116, 162, 196, 255), width=4 * scale)
    image.resize((width, height), Image.LANCZOS).save(os.path.join(OUT, 'hero-mountain.png'))


def generate_logo():
    size = 160
    image, draw = new(size)
    draw.rounded_rectangle((0, 0, size * S, size * S), radius=40 * S,
                           fill=(233, 243, 250, 255))
    line(draw, [(20, 116), (58, 58), (84, 92), (108, 48), (142, 116)], BRAND, 7)
    line(draw, [(20, 130), (142, 130)], BRAND, 5)
    ellipse(draw, (108, 28, 128, 48), BRAND, 5)
    save(image, size, 'logo.png')


if __name__ == '__main__':
    generate_tabs()
    generate_page_icons()
    generate_hero()
    generate_logo()
    print('generated:', len(os.listdir(OUT)), 'files in', OUT)

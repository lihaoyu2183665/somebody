"""生成「底部按钮式导航」预览图，与 custom-tab-bar 的实际尺寸/配色一一对应。"""
import os

from PIL import Image, ImageDraw, ImageFont

S = 2
W, H = 1000, 660
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.abspath(os.path.join(ROOT, '..', '底部按钮导航预览.png'))

BG = '#E4EFF7'
PAGE = '#E9F3FA'
CARD = '#F7FBFD'
LINE = '#D3E4F1'
TITLE = '#31475C'
MUTED = '#7892A8'
ACCENT = '#3D78A8'
BTN_IDLE = '#EDF5FB'
BTN_IDLE_BORDER = '#DCE9F3'
BTN_ON = '#D6E8F6'
TEXT_IDLE = '#5C7B94'
TEXT_ON = '#245C8C'

TABS = [
    ('buddy', ['滑雪', '搭子']),
    ('trip', ['俱乐部', '参团']),
    ('coach', ['教练', '平台']),
    ('gear', ['二手', '交易']),
    ('mine', ['我的']),
]


def sc(value):
    return int(round(value * S))


def font(size, bold=False):
    name = 'msyhbd.ttc' if bold else 'msyh.ttc'
    return ImageFont.truetype('C:/Windows/Fonts/' + name, sc(size))


image = Image.new('RGB', (sc(W), sc(H)), BG)
draw = ImageDraw.Draw(image)


def rect(box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(tuple(sc(v) for v in box), radius=sc(radius), fill=fill,
                           outline=outline, width=sc(width))


def center_text(cx, top, value, fnt, color):
    bbox = draw.textbbox((0, 0), value, font=fnt)
    draw.text((sc(cx) - (bbox[2] - bbox[0]) / 2, sc(top) - bbox[1]), value,
              font=fnt, fill=color)


def icon(key, active, size):
    name = 'tab-%s%s.png' % (key, '-on' if active else '')
    src = Image.open(os.path.join(ROOT, 'assets', name)).convert('RGBA')
    return src.resize((sc(size), sc(size)), Image.LANCZOS)


def phone(x, y, w, h, title, selected, caption):
    # 机身与屏幕
    rect((x + 3, y + 5, x + w + 3, y + h + 5), 26, '#C9DCEB')
    rect((x, y, x + w, y + h), 26, CARD, outline='#CEE0ED', width=1)
    rect((x + 6, y + 6, x + w - 6, y + h - 6), 21, PAGE)
    center_text(x + w / 2, y + 20, title, font(17, True), TITLE)
    draw.line((sc(x + 6), sc(y + 50), sc(x + w - 6), sc(y + 50)), fill=LINE, width=sc(1))

    # 页面内容（示意卡片）
    rect((x + 18, y + 62, x + w - 18, y + 148), 18, '#DCEBF7')
    center_text(x + w / 2, y + 80, '雪域俱乐部', font(19, True), TITLE)
    center_text(x + w / 2, y + 110, '一起上雪，结伴同行', font(13), MUTED)
    for i in range(3):
        top = y + 164 + i * 70
        rect((x + 18, top, x + w - 18, top + 58), 16, CARD)
        draw.ellipse((sc(x + 30), sc(top + 13), sc(x + 62), sc(top + 45)), fill='#DCEBF7')
        draw.rounded_rectangle((sc(x + 74), sc(top + 14), sc(x + w - 40), sc(top + 22)),
                               radius=sc(4), fill='#DCEBF7')
        draw.rounded_rectangle((sc(x + 74), sc(top + 32), sc(x + w - 90), sc(top + 40)),
                               radius=sc(4), fill='#E6F0F8')

    # 底部按钮式导航
    tab_top = y + h - 84
    draw.rectangle((sc(x + 6), sc(tab_top), sc(x + w - 6), sc(y + h - 6)), fill=CARD)
    draw.line((sc(x + 6), sc(tab_top), sc(x + w - 6), sc(tab_top)), fill='#CEE0ED', width=sc(2))
    inner = w - 12
    btn_w = inner / 5 - 4
    btn_y = tab_top + 9
    for index, (key, lines) in enumerate(TABS):
        active = index == selected
        bx = x + 6 + index * (btn_w + 4) + 2
        rect((bx, btn_y, bx + btn_w, btn_y + 66), 12,
             BTN_ON if active else BTN_IDLE,
             outline=ACCENT if active else BTN_IDLE_BORDER,
             width=2 if active else 1)
        cx = bx + btn_w / 2
        if active:
            rect((cx - 9, btn_y + 4, cx + 9, btn_y + 7), 2, ACCENT)
        art = icon(key, active, 22)
        image.paste(art, (sc(cx - 11), sc(btn_y + 10)), art)
        label_font = font(14, True)
        color = TEXT_ON if active else TEXT_IDLE
        if len(lines) == 1:
            center_text(cx, btn_y + 40, lines[0], label_font, color)
        else:
            center_text(cx, btn_y + 32, lines[0], label_font, color)
            center_text(cx, btn_y + 48, lines[1], label_font, color)
    rect((x + w / 2 - 32, tab_top + 79, x + w / 2 + 32, tab_top + 81), 2, '#C3D6E5')

    center_text(x + w / 2, y + h + 20, caption, font(15, True), TITLE)


center_text(W / 2, 30, '底部按钮式导航 · 五大模块统一规格', font(25, True), TITLE)
center_text(W / 2, 70, '标签 28rpx 加粗（原 20rpx）· 等宽圆角按钮 · 选中态仅换底色与描边', font(14), MUTED)

phone(70, 116, 360, 470, '滑雪搭子', 0, '选中：滑雪搭子')
phone(570, 116, 360, 470, '教练授课平台', 2, '选中：教练平台')

center_text(W / 2, H - 34, '护眼淡蓝主题 · 按钮尺寸 / 间距 / 字号 / 图标五模块完全一致',
            font(14), MUTED)

image.resize((W, H), Image.LANCZOS).save(OUT, 'PNG')
print('saved', OUT)

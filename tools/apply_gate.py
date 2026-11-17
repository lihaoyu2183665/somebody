"""为需要会员权限的页面接入统一访问屏障（幂等，可重复运行）。"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = [
    'pages/index/index',
    'pages/trips/trips',
    'pages/coaches/coaches',
    'pages/gears/gears',
    'pages/carpool-detail/carpool-detail',
    'pages/trip-detail/trip-detail',
    'pages/gear-detail/gear-detail',
    'pages/coach-detail/coach-detail',
    'pages/my-records/my-records',
]

for page in PAGES:
    wxml = ROOT / (page + '.wxml')
    text = wxml.read_text(encoding='utf-8')
    if '<access-gate' not in text:
        lines = text.splitlines()
        start = next(i for i, line in enumerate(lines) if line.startswith('<view class="page'))
        lines.insert(start + 1, '    <access-gate wx:if="{{gate}}" gate="{{gate}}" bind:refresh="onRefresh" />')
        lines.insert(start + 2, '    <block wx:else>')
        end = max(i for i, line in enumerate(lines) if line == '</view>')
        lines.insert(end, '    </block>')
        wxml.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        print('GATE', page)

    config_path = ROOT / (page + '.json')
    config = json.loads(config_path.read_text(encoding='utf-8'))
    components = config.setdefault('usingComponents', {})
    if components.get('access-gate') != '../../components/access-gate/access-gate':
        components['access-gate'] = '../../components/access-gate/access-gate'
        config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print('JSON', page)

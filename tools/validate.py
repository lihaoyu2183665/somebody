"""小程序工程静态校验：JSON、页面完整性、本地引用、WXML 表达式、JS 语法辅助。"""
import glob
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
errors = []
warnings = []


def rel(path):
    return os.path.relpath(path, ROOT).replace('\\', '/')


def json_files():
    for path in glob.glob(os.path.join(ROOT, '**', '*.json'), recursive=True):
        if 'node_modules' in path or '.workbuddy' in path:
            continue
        yield path


for path in json_files():
    try:
        with open(path, 'r', encoding='utf-8') as handle:
            json.load(handle)
    except Exception as error:
        errors.append(f'JSON 解析失败 {rel(path)}: {error}')

with open(os.path.join(ROOT, 'app.json'), 'r', encoding='utf-8') as handle:
    app = json.load(handle)

if app.get('lazyCodeLoading') != 'requiredComponents':
    errors.append('app.json 缺少 lazyCodeLoading: requiredComponents')

pages = app.get('pages', [])
if not pages:
    errors.append('app.json pages 为空')

for page in pages:
    for suffix in ('.wxml', '.js'):
        target = os.path.join(ROOT, page + suffix)
        if not os.path.isfile(target):
            errors.append(f'缺少页面文件 {page}{suffix}')

tab_paths = set()
for item in app.get('tabBar', {}).get('list', []):
    page = item.get('pagePath')
    tab_paths.add(page)
    if page not in pages:
        errors.append(f'tabBar 页面未在 pages 声明: {page}')
    for key in ('iconPath', 'selectedIconPath'):
        icon = item.get(key)
        if icon and not os.path.isfile(os.path.join(ROOT, icon)):
            errors.append(f'tabBar 图标不存在: {icon}')

if len(tab_paths) != 5:
    warnings.append(f'tabBar 入口数量为 {len(tab_paths)}，预期 5')

# 本地引用与 WXML 表达式检查
asset_pattern = re.compile(r'/assets/([A-Za-z0-9_\-.]+\.(?:png|jpg|jpeg|webp))')
for path in glob.glob(os.path.join(ROOT, '**', '*.wxml'), recursive=True):
    with open(path, 'r', encoding='utf-8') as handle:
        content = handle.read()
    for name in asset_pattern.findall(content):
        if not os.path.isfile(os.path.join(ROOT, 'assets', name)):
            errors.append(f'{rel(path)} 引用了不存在的资源 assets/{name}')
    for forbidden in ('?.', '??', '=>'):
        if forbidden in content:
            errors.append(f'{rel(path)} 含 WXML 不支持的表达式 {forbidden}')
    if re.search(r'\{\{[^}]*\b(?:new |Math\.|JSON\.|\.map\(|\.filter\()', content):
        errors.append(f'{rel(path)} 的 WXML 表达式含函数调用')

# 页面 JSON 的 usingComponents 路径
for path in glob.glob(os.path.join(ROOT, 'pages', '**', '*.json'), recursive=True):
    with open(path, 'r', encoding='utf-8') as handle:
        config = json.load(handle)
    for name, target in (config.get('usingComponents') or {}).items():
        resolved = os.path.normpath(os.path.join(os.path.dirname(path), target))
        if not os.path.isfile(resolved + '.wxml') or not os.path.isfile(resolved + '.js'):
            errors.append(f'{rel(path)} 组件 {name} 路径无效: {target}')

# require 相对路径
require_pattern = re.compile(r"require\(['\"](\.[^'\"]+)['\"]\)")
for path in glob.glob(os.path.join(ROOT, '**', '*.js'), recursive=True):
    if 'node_modules' in path:
        continue
    with open(path, 'r', encoding='utf-8') as handle:
        content = handle.read()
    for target in require_pattern.findall(content):
        resolved = os.path.normpath(os.path.join(os.path.dirname(path), target))
        if not (os.path.isfile(resolved) or os.path.isfile(resolved + '.js')):
            errors.append(f'{rel(path)} require 路径无效: {target}')

print(f'页面数: {len(pages)}  tabBar: {len(tab_paths)}  JSON: {len(list(json_files()))}')
print(f'错误: {len(errors)}  警告: {len(warnings)}')
for item in errors:
    print('  [ERROR]', item)
for item in warnings:
    print('  [WARN]', item)
sys.exit(1 if errors else 0)

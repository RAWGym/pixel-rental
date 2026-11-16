"""Готовит фото каталога для приложения.

Берёт ../images/map.json (скачано с pixelrental.kz) и делает src/data/photoData.ts:
  ключ — название товара как на сайте (нормализованное),
  значение — [миниатюра WebP в data:URI, ссылка на оригинал на сайте].
Миниатюры встраиваются в сборку (работают офлайн и мгновенно), оригинал грузится только на экране товара.
Запуск: python scripts/photos.py
"""
import base64, io, json, os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, '..', 'images')
SIZE, Q = 400, 70

def norm(s: str) -> str:
    s = s.lower().replace('ё', 'е').replace('fujfilm', 'fujifilm').replace('go pro', 'gopro')
    return re.sub(r'[^0-9a-zа-я]+', '', s)

items = json.load(open(os.path.join(IMG, 'map.json'), encoding='utf8'))
out, seen = {}, set()
for it in items:
    k = norm(it['name'])
    if not it.get('file') or k in seen:
        continue
    seen.add(k)
    im = Image.open(os.path.join(IMG, it['file'])).convert('RGBA')
    bb = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    W, H = im.size
    box = (0, 0, W, H)
    if bb:  # обрезаем пустые поля, оставляя небольшой воздух
        pad = int(max(bb[2] - bb[0], bb[3] - bb[1]) * 0.04)
        box = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(W, bb[2] + pad), min(H, bb[3] + pad))
        im = im.crop(box)
    im.thumbnail((SIZE, SIZE), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'WEBP', quality=Q, method=4)
    # рамка обрезки в долях оригинала — чтобы на экране товара оригинал совпал с миниатюрой
    frac = [round(box[0] / W, 4), round(box[1] / H, 4), round(box[2] / W, 4), round(box[3] / H, 4), round(W / H, 4)]
    out[k] = ['data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode(), it['url'], frac]

# Названия в приложении местами переписаны (raw.ts) — подбираем ближайший товар с сайта в той же категории
import difflib
alias = {}
# похожие названия, но другая модель — честнее показать иконку, чем чужое фото
WRONG = {norm(x) for x in ['DJI Ronin RS 2', 'DJI Osmo Mobile 4', 'Клетка для Sony A7C', 'Клетка для Sony A7 IV']}
CAT = {'Аккумуляторы': 'batteries', 'Grip': 'grip', 'Камеры': 'cameras', 'Карты памяти': 'memory', 'Мониторы': 'monitors', 'Дроны': 'drones',
       'Фильтры': 'filters', 'Наборы': 'kits', 'Объективы': 'lenses', 'Свет': 'light', 'Разное': 'misc', 'Софтбоксы': 'softboxes',
       'Звук': 'sound', 'Стабилизаторы': 'gimbals', 'Штативы/стойки': 'stands', 'Шнуры': 'cables'}
raw = open(os.path.join(ROOT, 'src', 'data', 'raw.ts'), encoding='utf8').read()
site = [(CAT.get(it['category']), norm(it['name']), it['name']) for it in items if it.get('file')]
for cat, block in re.findall(r'^(\w+): `(.*?)`', raw, re.S | re.M):
    for line in block.strip().split(chr(10)):
        name = line.split('|')[0]
        k = norm(name)
        if k in out:
            continue
        pool = [x for x in site if x[0] == cat] or site
        best = max(pool, key=lambda x: difflib.SequenceMatcher(None, k, x[1]).ratio())
        r = difflib.SequenceMatcher(None, k, best[1]).ratio()
        if r >= 0.6 and best[1] in out and k not in WRONG:
            alias[k] = best[1]
            print(f'~ {r:.2f}  {name}  ->  {best[2]}')
        else:
            print(f'- {r:.2f}  {name}  (лучшее: {best[2]}) — без фото')

dst = os.path.join(ROOT, 'src', 'data', 'photoData.ts')
with open(dst, 'w', encoding='utf8') as f:
    f.write('// Сгенерировано scripts/photos.py из фото pixelrental.kz — не редактировать вручную\n')
    f.write('export const PHOTO_DATA: Record<string, [thumb: string, full: string, box: [x0: number, y0: number, x1: number, y1: number, aspect: number]]> = ')
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    f.write('\n// название в приложении → название на сайте\nexport const PHOTO_ALIAS: Record<string, string> = ')
    json.dump(alias, f, ensure_ascii=False, separators=(',', ':'))
    f.write('\n')
print(f'{len(out)} фото + {len(alias)} синонимов, {os.path.getsize(dst) / 1024 / 1024:.1f} МБ')

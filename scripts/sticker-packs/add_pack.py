#!/usr/bin/env python3
"""
서버 배포 스티커 팩을 백엔드 정적 자산에 넣고 카탈로그를 갱신한다.

    python scripts/sticker-packs/add_pack.py <PACK_ID> <spec.tsv>

spec.tsv 한 줄 = code<TAB>label<TAB>lottie.json 경로<TAB>썸네일.png 경로 (순서가 곧 패널 순서)

- 파일 이름에 내용 해시를 붙인다(<code 소문자>.<sha256 앞 8자>.json/png). 서버는 이 경로를 1년 immutable 로
  내리고 앱은 한 번 받은 파일을 다시 받지 않으므로, <b>그림을 고치면 이름이 바뀌어야</b> 새 파일이 간다.
- 같은 PACK_ID 를 다시 넣으면 그 팩의 항목을 통째로 갈아끼운다. 안 쓰게 된 해시 파일은 지운다.
- 팩 자체(sticker_packs 행·제목·가격)는 Flyway 마이그레이션으로 따로 넣는다 — 판정이 거기 걸려 있다.
- 결과 검증: backend 의 RemoteStickerCatalogTest (파일 존재·코드 중복·팩 시드).

자세한 흐름은 docs/SERVER_STICKER_PACKS_2026-10-01.md.
"""
import hashlib
import json
import os
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ASSETS = os.path.join(ROOT, 'backend', 'src', 'main', 'resources', 'sticker-assets')
CATALOG = os.path.join(ROOT, 'backend', 'src', 'main', 'resources', 'stickers', 'catalog.json')


def hashed_copy(src, code, ext):
    data = open(src, 'rb').read()
    if ext == 'json':
        # 공백을 걷어 낸다 — 같은 그림이면 같은 바이트가 되도록(해시가 흔들리지 않게)
        data = json.dumps(json.loads(data), separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    name = f"{code.lower()}.{hashlib.sha256(data).hexdigest()[:8]}.{ext}"
    open(os.path.join(ASSETS, name), 'wb').write(data)
    return name


def main(pack_id, spec):
    os.makedirs(ASSETS, exist_ok=True)
    os.makedirs(os.path.dirname(CATALOG), exist_ok=True)
    catalog = json.load(open(CATALOG, encoding='utf-8')) if os.path.exists(CATALOG) else {'packs': []}

    items = []
    for line in open(spec, encoding='utf-8'):
        if not line.strip() or line.startswith('#'):
            continue
        code, label, lottie, thumb = line.rstrip('\n').split('\t')
        items.append({'code': code, 'label': label,
                      'file': hashed_copy(lottie, code, 'json'),
                      'thumb': hashed_copy(thumb, code, 'png')})

    packs = [p for p in catalog['packs'] if p['id'] != pack_id]
    old = next((p for p in catalog['packs'] if p['id'] == pack_id), None)
    if old is not None:
        packs.insert(catalog['packs'].index(old), {'id': pack_id, 'items': items})
    else:
        packs.append({'id': pack_id, 'items': items})
    catalog['packs'] = packs

    used = {i[k] for p in packs for i in p['items'] for k in ('file', 'thumb')}
    for f in os.listdir(ASSETS):
        if f not in used:
            os.remove(os.path.join(ASSETS, f))

    with open(CATALOG, 'w', encoding='utf-8', newline='\n') as out:
        json.dump(catalog, out, ensure_ascii=False, indent=2)
        out.write('\n')
    size = sum(os.path.getsize(os.path.join(ASSETS, f)) for p in packs if p['id'] == pack_id
               for i in p['items'] for f in (i['file'], i['thumb']))
    print(f'{pack_id}: {len(items)}종, {size // 1024}KB')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])

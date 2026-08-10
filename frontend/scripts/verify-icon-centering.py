"""
아이콘 서브셋 검증 — 서브셋 글리프가 원본과 같은 위치에 렌더되는지 확인한다.

<b>왜 필요한가</b>: 예전 서브셋 스크립트는 --recalc-bounds 플래그 탓에 98개 글리프
중 95개가 최대 -43유닛(30px 렌더 기준 약 -8.6px)까지 왼쪽으로 밀려 렌더됐다.
글리프 존재 여부(누락)만 확인하는 검증으로는 이 결함을 못 잡는다 — 폭은 정상이고
"어디에" 그려지는지만 틀렸기 때문이다. 이 스크립트는 브라우저와 무관한 독립
래스터라이저(FreeType, Pillow 경유)로 실제 잉크 위치를 원본과 비교한다.

사용법:
    python scripts/verify-icon-centering.py

fontTools 검증(글리프 좌표 직접 비교)이 아니라 <b>렌더링 결과</b>를 비교하는 이유는
글리프 데이터 자체는 정상인데 hmtx.lsb 와 glyf.xMin 불일치 때문에 래스터라이저가
보정을 적용하는 경우, 데이터만 봐서는 못 잡고 실제로 그려봐야 드러나기 때문이다.
"""
import io
import json
import os
import sys

# Windows 콘솔(cp949 등)이 em dash·한글을 못 그릴 수 있어 stdout 을 UTF-8 로 강제한다
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print('[verify] Pillow 가 없어 건너뜁니다 (pip install Pillow)')
    sys.exit(0)

ROOT = os.path.join(os.path.dirname(__file__), '..')
ORIGINAL = os.path.join(ROOT, 'assets', 'fonts', 'MaterialCommunityIcons.full.ttf')
SUBSET = os.path.join(ROOT, 'assets', 'fonts', 'MaterialCommunityIcons.ttf')
GLYPHMAP = os.path.join(ROOT, 'assets', 'icon-glyphmap.json')

SIZE = 200
# 이 값보다 어긋나면 실패로 본다. 30px 렌더 기준 1px ≈ 6.7유닛(200/30) —
# 3유닛 여유는 렌더 시 0.5px 미만이라 육안으로 안 보이는 수준이다.
TOLERANCE = 3


def measure(font, codepoint):
    ch = chr(codepoint)
    img = Image.new('L', (SIZE * 3, SIZE * 2), 0)
    draw = ImageDraw.Draw(img)
    draw.text((SIZE, SIZE // 2), ch, font=font, fill=255)
    bbox = img.getbbox()
    if not bbox:
        return None
    adv = draw.textlength(ch, font=font)
    return adv, bbox[0] - SIZE, bbox[2] - SIZE


def main():
    if not (os.path.exists(ORIGINAL) and os.path.exists(SUBSET)):
        print('[verify] 폰트 파일이 없어 건너뜁니다')
        return

    with open(GLYPHMAP, encoding='utf-8') as f:
        glyph_map = json.load(f)

    original_font = ImageFont.truetype(ORIGINAL, SIZE)
    subset_font = ImageFont.truetype(SUBSET, SIZE)

    failures = []
    for name, codepoint in glyph_map.items():
        orig = measure(original_font, codepoint)
        sub = measure(subset_font, codepoint)
        if orig is None or sub is None:
            failures.append((name, '렌더 안 됨'))
            continue
        orig_offset = (orig[1] + orig[2]) / 2 - orig[0] / 2
        sub_offset = (sub[1] + sub[2]) / 2 - sub[0] / 2
        drift = sub_offset - orig_offset
        if abs(drift) > TOLERANCE:
            failures.append((name, f'{drift:+.1f} 유닛 (원본 대비)'))

    total = len(glyph_map)
    if failures:
        print(f'[verify] 실패 {len(failures)}/{total}개 — 서브셋이 원본과 다른 위치에 렌더됩니다:')
        for name, detail in failures:
            print(f'  - {name}: {detail}')
        sys.exit(1)
    else:
        print(f'[verify] 통과 — {total}개 글리프 전부 원본과 같은 위치에 렌더됩니다')


if __name__ == '__main__':
    main()

"""더블리 앱 아이콘 — 맞댄 두 숟가락 + 하트. 벡터 원본이자 모든 아이콘 에셋의 생성기.

    python store/icon/make_icon.py

왜 숟가락인가·기각된 안들은 docs/APP_ICON_EXPLORATION_2026-09-29.md. 요약하면 앱의 매일 쓰는
고리(식단·럽슐랭·"밥 먹었어?")와 이어지고, 커플 앱 28종 사이에서 겹치는 것이 없고, 24px 에서 버틴다.
나노바나나 시안을 손잡이 62% · 8° 로 손질한 안의 치수를 재서 도형으로 다시 짰다.

왼쪽 숟가락 하나를 <b>곧은 축 + 축을 따라 변하는 폭</b>으로 정의하고 x=512 로 뒤집어 오른쪽을 만든다
(1024 좌표계). 볼·목·손잡이를 따로 붙이면 이음매에 턱이 생겼다 — 폭 함수 하나면 생길 수 없다.
SVG 와 PNG 를 같은 점 목록에서 뽑으므로 둘이 어긋나지 않는다.

<b>아이콘은 fingerprint 입력이다</b> — 에셋을 바꾸면 EAS Update 가 아니라 빌드다(docs/OTA_PREFLIGHT_2026-09-14.md).
"""
import math
import pathlib

from PIL import Image, ImageDraw


BG = '#FAF5E8'
CORAL = '#EF7757'
GREEN = '#2A7731'   # 앱 primary — 아이콘과 앱 안의 초록을 같은 값으로

# ── 왼쪽 숟가락: 곧은 축 하나 + 축을 따라 변하는 폭 ──
# 시안을 재 보니 볼의 기울기와 손잡이 방향이 한 직선 위에 있다(윗부분은 가운데로, 끝은 바깥으로).
# 그래서 볼·목·손잡이를 따로 붙이지 않고 폭 함수 하나로 그린다 — 이음매가 생길 수 없다.
TOP = (422.0, 306.0)      # 볼 꼭대기(맞대는 쪽으로 기운 끝)
END = (301.0, 826.0)      # 손잡이 끝 캡의 중심
BOWL_B = 150.0            # 볼 길이의 절반
BOWL_A = 112.0            # 볼 폭의 절반
EGG = 0.15                # 볼이 목 쪽으로 갈수록 넓어지는 정도(시안의 볼은 위가 좁다)
NECK_S = 330.0            # 손잡이가 시작되는 축 위치(볼 꼭대기에서)
NECK_W = 62.0             # 가장 잘록한 목 폭
END_W = 88.0              # 손잡이 끝 폭 — 끝으로 갈수록 살짝 넓다
SMOOTH = 6.0              # 볼과 손잡이를 잇는 부드러운 합(클수록 각진다)

HEART_BOX = (430.0, 166.0, 598.0, 310.0)   # 하트 외곽(x0, y0, x1, y1)


def spoon_outline(n=900):
    dx, dy = END[0] - TOP[0], END[1] - TOP[1]
    axis_len = math.hypot(dx, dy)
    ux, uy = dx / axis_len, dy / axis_len
    nx, ny = -uy, ux
    L = axis_len + END_W / 2                      # 캡 끝까지의 전체 길이

    def width(s_):
        u = (s_ - BOWL_B) / BOWL_B
        bw = 2 * BOWL_A * math.sqrt(max(0.0, 1 - u * u)) * (1 + EGG * u) if abs(u) <= 1 else 0.0
        if s_ < NECK_S - 60:
            hw = 0.0
        elif s_ <= axis_len:
            k = min(1.0, max(0.0, (s_ - NECK_S) / (axis_len - NECK_S)))
            hw = NECK_W + (END_W - NECK_W) * k
        else:                                      # 둥근 끝 캡
            v = (s_ - axis_len) / (END_W / 2)
            hw = END_W * math.sqrt(max(0.0, 1 - v * v))
        return (bw ** SMOOTH + hw ** SMOOTH) ** (1 / SMOOTH)

    left, right = [], []
    for i in range(n + 1):
        # 양 끝에서 촘촘하게(둥근 부분이 각지지 않게)
        t = i / n
        s_ = L * (1 - math.cos(math.pi * t)) / 2
        w = width(s_) / 2
        cx, cy = TOP[0] + ux * s_, TOP[1] + uy * s_
        left.append((cx + nx * w, cy + ny * w))
        right.append((cx - nx * w, cy - ny * w))
    return left + right[::-1]


def heart_parts():
    """통통한 하트 — 원 두 개 + 두 원에서 아래 꼭짓점으로 내린 접선 면.
    수식 하트(16sin³t…)는 이 크기에서 끝이 가늘고 길게 빠져 시안의 하트와 달랐다."""
    x0, y0, x1, y1 = HEART_BOX
    cx = (x0 + x1) / 2
    r = (x1 - x0) / 3.8
    lc, rc = (cx - r * 0.9, y0 + r), (cx + r * 0.9, y0 + r)   # 두 원을 살짝 겹쳐 가운데 홈을 얕게
    tip = (cx, y1)
    def circ(c, rr, n=160):
        return [(c[0] + rr * math.cos(2 * math.pi * i / n), c[1] + rr * math.sin(2 * math.pi * i / n)) for i in range(n)]
    def tangent(c, outer_sign):
        dx, dy = tip[0] - c[0], tip[1] - c[1]; d = math.hypot(dx, dy)
        base = math.atan2(dy, dx); off = math.acos(r / d)
        cands = [(c[0] + r * math.cos(base + k * off), c[1] + r * math.sin(base + k * off)) for k in (1, -1)]
        return min(cands, key=lambda q: outer_sign * q[0])
    tl, tr = tangent(lc, 1), tangent(rc, -1)
    # 꼭짓점을 아주 살짝 굴린다(날카로운 끝이 24px 에서 사라지지 않게)
    body = [tl, (cx - 5, y1 - 4), (cx, y1), (cx + 5, y1 - 4), tr, rc, (cx, y0 + r * 1.35), lc]
    return [circ(lc, r), circ(rc, r), body]


def mirror(pts):
    return [(1024 - x, y) for x, y in pts]


LEFT = [spoon_outline()]
RIGHT = [mirror(p) for p in LEFT]
HEART = heart_parts()
SHAPES = [(p, CORAL) for p in LEFT] + [(p, GREEN) for p in RIGHT] + [(p, CORAL) for p in HEART]


def svg(bg=True, scale=1.0, mono=None):
    def tf(p):
        return (512 + (p[0] - 512) * scale, 512 + (p[1] - 512) * scale)
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">']
    if bg:
        out.append(f'<rect width="1024" height="1024" fill="{BG}"/>')
    for pts, col in SHAPES:
        d = 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in map(tf, pts)) + ' Z'
        out.append(f'<path d="{d}" fill="{mono or col}"/>')
    out.append('</svg>')
    return '\n'.join(out)


ROOT = pathlib.Path(__file__).resolve().parent
ASSETS = ROOT.parent.parent / 'frontend' / 'assets'

# 안드로이드 어댑티브: 108dp 캔버스 중 로고는 가운데 66dp 원(61%) 안 — 공식 안전 영역.
# 마크의 가장 먼 점이 중심에서 422(1024 기준)라 0.74 면 그 원에 들어간다. 런처는 가운데 72dp 만
# 보여 주므로 실제로는 이 비율보다 커 보인다.
ANDROID_SCALE = 0.74
# 단색(테마) 아이콘은 두 숟가락이 한 색이 되어 볼 사이 좁은 틈이 작은 크기에서 붙는다 — 틈을 벌린다
MONO_GAP = 14.0


def mono_shapes():
    out = []
    for pts in LEFT:
        out.append([(x - MONO_GAP, y) for x, y in pts])
    for pts in RIGHT:
        out.append([(x + MONO_GAP, y) for x, y in pts])
    return out + HEART


def render(size, bg, scale=1.0, mono=None, shapes=None):
    S = 4; N = size * S; k = N / 1024
    img = Image.new('RGBA', (N, N), bg if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    items = [(p, mono) for p in shapes] if shapes else SHAPES
    for pts, col in items:
        d.polygon([((512 + (x - 512) * scale) * k, (512 + (y - 512) * scale) * k) for x, y in pts], fill=mono or col)
    return img.resize((size, size), Image.LANCZOS)


TS_OUT = ROOT.parent.parent / 'frontend' / 'src' / 'components' / 'dublyMarkPaths.ts'


def ts_paths():
    """인앱 로고(DoublyMark)용 SVG 경로 — 아이콘과 같은 점에서 뽑는다. 점을 솎아 번들을 가볍게 한다."""
    def thin(pts, n):
        step = max(1, len(pts) // n)
        return pts[::step]

    def d(pts):
        return 'M' + ' L'.join(f'{x:.0f},{y:.0f}' for x, y in pts) + ' Z'

    left = d(thin(LEFT[0], 220))
    right = d(thin(RIGHT[0], 220))
    # 하트는 원 둘 + 몸통으로 되어 있고 감는 방향이 서로 반대다 — 한 Path 에 합치면 nonzero 규칙에서
    # 겹친 자리가 비어 버린다(실제로 하트 가운데에 틈이 났다). 조각마다 따로 그리도록 배열로 낸다.
    heart = ', '.join("'" + d(thin(p, 60)) + "'" for p in HEART)
    # 마크 외곽을 담는 정사각 — 호출부의 size 가 곧 마크 크기가 되게. 손으로 적었다가 손잡이 끝(869)이
    # 잘린 적이 있어 점에서 직접 잰다.
    allpts = [q for part in LEFT + RIGHT + HEART for q in part]
    x0, x1 = min(q[0] for q in allpts), max(q[0] for q in allpts)
    y0, y1 = min(q[1] for q in allpts), max(q[1] for q in allpts)
    side = max(x1 - x0, y1 - y0) + 8
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    vb = f'{cx - side / 2:.0f} {cy - side / 2:.0f} {side:.0f} {side:.0f}'
    return f"""/**
 * 인앱 로고 경로 — store/icon/make_icon.py 가 생성한다. 직접 고치지 말 것(아이콘과 어긋난다).
 * 앱 아이콘(맞댄 두 숟가락 + 하트)과 같은 도형이다. 좌표는 1024 캔버스 기준.
 */
export const DUBLY_MARK_VIEWBOX = '{vb}';
export const DUBLY_MARK_LEFT = '{left}';
export const DUBLY_MARK_RIGHT = '{right}';
export const DUBLY_MARK_HEART: readonly string[] = [{heart}];
"""


if __name__ == '__main__':
    (ROOT / 'dubly-mark.svg').write_text(svg(), encoding='utf-8')
    render(1024, BG).convert('RGB').save(ASSETS / 'icon.png')                  # iOS · 기본 아이콘(알파 금지)
    render(1024, BG).convert('RGB').save(ASSETS / 'favicon.png')
    render(1024, None).save(ASSETS / 'splash-icon.png')                         # 스플래시: 흰 바탕 위 마크만
    render(432, None, ANDROID_SCALE).save(ASSETS / 'android-icon-foreground.png')
    Image.new('RGBA', (432, 432), BG).save(ASSETS / 'android-icon-background.png')
    render(432, None, ANDROID_SCALE, mono='#000000', shapes=mono_shapes()).save(ASSETS / 'android-icon-monochrome.png')
    # Play 스토어 512 — 불투명 바탕. Play 는 원 마스크에서 반지름 0.455 까지 남긴다: 422/1024*512=211 < 233
    render(512, BG).convert('RGB').save(ROOT.parent / 'play_icon_512.png')
    TS_OUT.write_text(ts_paths(), encoding='utf-8')
    print('ok')

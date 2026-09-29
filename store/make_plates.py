#!/usr/bin/env python3
"""스토어 스크린샷 캡션 배경판 + 피처 그래픽 생성기.

실제 앱 화면은 **폰에서 직접 찍는다** — 양 스토어 모두 실제 화면을 요구하고, 앱과 다른
목업은 반려 사유다. 이 스크립트가 만드는 것은 그 캡처를 얹을 <b>배경판</b>이다:
브랜드 배경 + 한 줄 카피 + 캡처가 들어갈 자리(투명하게 뚫려 있다).

    pip install pillow
    python3 store/make_plates.py

<b>Pillow 하나만 있으면 어디서든 돈다</b>(윈도우 포함). 예전엔 HTML 을 헤드리스 Chromium 으로
찍었는데, 그러면 브라우저 경로가 박혀 작업 환경 밖에서는 못 돌렸다.

문구·크기는 아래 CAPTIONS·SIZES 만 고치면 된다.
"""
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent
FONTS = ROOT.parent / "frontend" / "assets" / "fonts"
OUT = ROOT / "plates"

# 화면 비율 — 요즘 폰은 9:19.5 다. 자리를 이 비율로 잡아야 캡처가 덜 잘린다.
SHOT_RATIO = 9 / 19.5

# 브랜드 팔레트 — frontend/src/theme/colors.ts 와 같은 값
INK = (26, 29, 26)
OLIVE = (89, 119, 45)
SUB = (60, 74, 51)
# 2026-09-29: 피치 → 크림 → 하늘 — 나노바나나 시안의 배경. 앞 판(올리브 계열)은 앱 초록과 겹쳐 화면이 묻혔다
GRAD = ((255, 216, 199), (251, 245, 233), (204, 228, 243))

# (키, 너비, 높이) — iOS 는 supportsTablet:false 라 iPad 규격이 필요 없다.
SIZES = [
    ("play-phone", 1080, 1920),    # Google Play 휴대전화
    ("play-tablet7", 1200, 1920),  # Google Play 7인치 태블릿
    ("ios-6.5", 1284, 2778),       # App Store 6.5형 (iPhone 12~14 Pro Max)
    ("ios-6.5-alt", 1242, 2688),   # App Store 6.5형 — 같은 칸이 받는 다른 크기 (11 Pro Max)
    ("ios-6.7", 1290, 2796),       # App Store iPhone 6.7"
    ("ios-6.9", 1320, 2868),       # App Store iPhone 6.9"
]

# 온보딩 4축(사진 기록 / 우리 이모지 / 같이 놀기 / 럽슐랭)과 같은 줄기로 맞췄다 —
# docs/ONBOARDING_AND_STORE_ASSETS_2026-09-14.md 4절 마지막 항목.
CAPTIONS = [
    # 2026-09-29: 6장으로. 우리 이모지는 실제 얼굴을 공개할 수 없어 9/17 에 뺐었는데,
    # AI 가상 인물 얼굴(scripts/couple-emoji-experiment/make-face.mjs)로 테스트 계정
    # 서준·지민의 이모지를 만들어 되살렸다 — 실존 인물이 아니라 공개 문제가 없다.
    # 같은 날 문구를 나노바나나 시안에서 가져왔다. 앱에 없는 것(랭킹·투두)을 말하는 문구는 뺐다.
    ("01-emoji", "귀여운 캐릭터로 전하는", "우리 둘만의 마음"),
    ("02-sticker", "커플 전용 이모티콘으로", "마음을 전하세요"),
    ("03-home", "우리만의 특별한 날을", "함께 세어요"),
    ("04-play", "함께 풀어가는 즐거움,", "커플 스도쿠"),
    ("05-place", "데이트 코스 고민 끝!", "우리의 최애 장소"),
    ("06-photo", "서로의 건강을 챙겨요,", "사진 한 장 식단 기록"),
]


def font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / f"Pretendard-{weight}.otf"), size)


def diagonal_gradient(w: int, h: int) -> Image.Image:
    """135도 3색 그라데이션.

    작게 그려서 늘린다 — 픽셀마다 계산하면 큰 판에서 느리고, 어차피 부드러운 면이라
    확대해도 차이가 없다.
    """
    small = Image.new("RGB", (64, 64))
    px = small.load()
    for y in range(64):
        for x in range(64):
            t = (x + y) / 126          # 좌상 → 우하
            if t < 0.55:
                a, b, k = GRAD[0], GRAD[1], t / 0.55
            else:
                a, b, k = GRAD[1], GRAD[2], (t - 0.55) / 0.45
            px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * k) for i in range(3))
    return small.resize((w, h), Image.BICUBIC).convert("RGBA")


def blobs(im: Image.Image, w: int, h: int) -> None:
    """흰 원 두 개 — 평면 그라데이션에 숨통을 틔운다."""
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for cx, cy, r, alpha in ((0.12, 0.08, 0.20, 184), (0.92, 0.96, 0.17, 115)):
        x, y, rr = cx * w, cy * h, r * w
        d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=(255, 255, 255, alpha))
    im.alpha_composite(layer)


def text_tracked(d: ImageDraw.ImageDraw, xy, s: str, f, fill, tracking: float = 0.0) -> None:
    """자간을 준 글자 — PIL 에는 letter-spacing 이 없어 한 글자씩 놓는다."""
    x, y = xy
    for ch in s:
        d.text((x, y), ch, font=f, fill=fill)
        x += d.textlength(ch, font=f) + tracking


def slot_box(w: int, h: int) -> tuple[int, int, int, int]:
    """캡처가 들어갈 자리 — compose.py 가 같은 값을 써야 어긋나지 않는다."""
    sh = round(h * 0.72)
    sw = round(sh * SHOT_RATIO)
    return (w - sw) // 2, h - sh - round(h * 0.05), sw, sh


def radius_of(w: int) -> int:
    return round(w * 0.055)


def bezel_of(w: int) -> int:
    """휴대폰 틀 두께 — 화면 자리(slot) 바깥으로 이만큼 검은 테를 두른다."""
    return round(w * 0.022)


def plate(w: int, h: int, line1: str, line2: str, mascot: Image.Image | None = None) -> Image.Image:
    """배경 + 가운데 정렬 카피 두 줄 + 휴대폰 틀, 화면 자리는 뚫려 있다.

    2026-09-29 에 나노바나나 시안 스타일로 바꿨다 — 휴대폰 틀과 튀어나온 스티커가 화면을 "앱"으로 읽히게
    한다. <b>틀 안은 반드시 실제 캡처다</b>(스토어 심사 기준). 이미지 생성으로 화면까지 만든 시안은
    글자·숫자·기능(투두)이 지어져 있어 쓸 수 없었다. 마스코트(개구리) 줄은 아이콘이 정해질 때까지 뺀다.
    """
    im = diagonal_gradient(w, h)
    blobs(im, w, h)
    d = ImageDraw.Draw(im)

    cap = round(w * 0.074)
    f = font("SemiBold", cap)
    top = round(h * 0.058)
    for i, line in enumerate((line1, line2)):
        d.text((w / 2, top + i * round(cap * 1.25)), line, font=f, fill=INK, anchor="ma")

    drop_shadow(im, w, h)
    phone_frame(im, w, h)
    punch_slot(im, w, h)
    return im


def phone_frame(im: Image.Image, w: int, h: int) -> None:
    """검은 테 + 바깥 금속 테두리 한 줄. 화면 자리는 이후 punch_slot 이 뚫는다."""
    x, y, sw, sh = slot_box(w, h)
    b = bezel_of(w)
    r = radius_of(w)
    d = ImageDraw.Draw(im)
    rim = max(2, round(w * 0.004))
    d.rounded_rectangle((x - b - rim, y - b - rim, x + sw + b + rim, y + sh + b + rim), radius=r + b + rim, fill=(201, 170, 150, 255))
    d.rounded_rectangle((x - b, y - b, x + sw + b, y + sh + b), radius=r + b, fill=(22, 22, 24, 255))


def drop_shadow(im: Image.Image, w: int, h: int) -> None:
    """자리 바깥으로 번지는 그림자 — 뚫기 <b>전에</b> 그려야 가운데가 지워지고 테두리만 남는다.

    밝은 화면을 넣으면 캡처와 배경이 둘 다 연해 경계가 사라진다. 그림자가 그 경계를 만든다.
    """
    x, y, sw, sh = slot_box(w, h)
    blur = round(w * 0.022)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    off = round(h * 0.004)
    ImageDraw.Draw(layer).rounded_rectangle(
        (x - bezel_of(w), y + off, x + sw + bezel_of(w), y + sh + off + bezel_of(w)), radius=radius_of(w) + bezel_of(w), fill=(*INK, 70))
    im.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def punch_slot(im: Image.Image, w: int, h: int) -> None:
    """자리를 투명하게 뚫는다 — 배경판을 캡처 위에 얹으면 그대로 비친다."""
    x, y, sw, sh = slot_box(w, h)
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw - 1, sh - 1), radius=radius_of(w), fill=255)
    im.paste(Image.new("RGBA", (sw, sh), (0, 0, 0, 0)), (x, y), mask)


def edge_ring(im: Image.Image, w: int, h: int) -> None:
    """자리 경계의 얇은 테두리 — 캡처의 흰 여백이 배경으로 흘러나가는 것을 끊는다."""
    x, y, sw, sh = slot_box(w, h)
    ring = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(ring).rounded_rectangle(
        (x, y, x + sw - 1, y + sh - 1), radius=radius_of(w),
        outline=(*INK, 46), width=max(2, round(w * 0.0022)))
    im.alpha_composite(ring)


def feature_graphic(mascot: Image.Image | None = None) -> Image.Image:
    """Play 피처 그래픽 1024x500 — 2026-09-29 새 아이콘(맞댄 두 숟가락)으로.

    아이콘과 같은 크림 바탕 위에 마크를 크게 — 스토어 목록에는 바로 아래 아이콘 타일이 따로 보이므로
    타일을 또 그리지 않고 마크 자체를 주인공으로 둔다. 마크는 store/icon/make_icon.py 가 그린 것과 같은 점이다.

    <b>가운데를 비워 둔다</b>: Play 는 홍보 영상이 있으면 이 그래픽 한가운데에 재생 버튼을
    겹쳐 띄운다. 문구는 x≤450 안에, 마크는 오른쪽 끝에 둔다.
    """
    sys.path.insert(0, str(ROOT / "icon"))
    import make_icon  # noqa: E402 — 아이콘과 같은 도형을 쓴다

    w, h = 1024, 500
    im = Image.new("RGBA", (w, h), make_icon.BG)
    d = ImageDraw.Draw(im)
    f = font("SemiBold", 48)
    d.text((64, 134), "같이 먹고, 같이 웃는", font=f, fill=INK)
    d.text((64, 134 + 64), "우리 둘의 매일", font=f, fill=INK)
    d.text((64, 298), "채팅 · 식단 · 맛집 · 게임까지", font=font("Medium", 24), fill=SUB)
    d.text((64, 334), "커플을 위한 모든 것, 더블리", font=font("Medium", 24), fill=SUB)
    mark = make_icon.render(560, None)
    im.alpha_composite(mark, (w - 560 + 60, (h - 560) // 2 + 10))
    return im


def main() -> int:
    mascot = None  # 개구리 마스코트는 2026-09-29 에 뺐다 — 아이콘이 정해지면 다시 정한다
    OUT.mkdir(parents=True, exist_ok=True)

    for size_key, w, h in SIZES:
        for cap_key, l1, l2 in CAPTIONS:
            plate(w, h, l1, l2).save(OUT / f"{size_key}_{cap_key}.png", optimize=True)
        print(f"{size_key}: {len(CAPTIONS)}장")

    feature_graphic().convert("RGB").save(ROOT / "feature_graphic.png", optimize=True)
    print("피처 그래픽: feature_graphic.png (1024x500)")
    print(f"→ {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

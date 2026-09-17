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
GRAD = ((239, 244, 228), (218, 230, 193), (198, 225, 200))  # togetherBg → togetherPastel → partnerPastel

# (키, 너비, 높이) — iOS 는 supportsTablet:false 라 iPad 규격이 필요 없다.
SIZES = [
    ("play-phone", 1080, 1920),    # Google Play 휴대전화
    ("play-tablet7", 1200, 1920),  # Google Play 7인치 태블릿
    ("ios-6.7", 1290, 2796),       # App Store iPhone 6.7"
    ("ios-6.9", 1320, 2868),       # App Store iPhone 6.9"
]

# 온보딩 4축(사진 기록 / 우리 이모지 / 같이 놀기 / 럽슐랭)과 같은 줄기로 맞췄다 —
# docs/ONBOARDING_AND_STORE_ASSETS_2026-09-14.md 4절 마지막 항목.
CAPTIONS = [
    ("01-photo", "사진 한 장이면", "오늘 기록 끝"),
    # 원래는 "우리 얼굴로 만든 / 이모티콘으로"(우리 이모지)였다. 그 화면을 찍으려면 실제
    # 얼굴로 이모지를 생성해야 하고, 그 얼굴이 스토어에 그대로 공개된다 — 스크린샷에
    # 실명·애인 얼굴을 올리지 않는다는 원칙과 정면으로 부딪혀 스티커로 바꿨다(2026-09-17).
    ("02-sticker", "더비와 블리로", "마음 전하기"),
    ("03-play", "같이 놀고", "서로 응원해요"),
    ("04-place", "우리 둘만의", "맛집 가이드"),
    ("05-streak", "매일 이어지는", "우리 기록"),
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
    sh = round(h * 0.74)
    sw = round(sh * SHOT_RATIO)
    return (w - sw) // 2, h - sh - round(h * 0.045), sw, sh


def radius_of(w: int) -> int:
    return round(w * 0.055)


def plate(w: int, h: int, line1: str, line2: str, mascot: Image.Image) -> Image.Image:
    im = diagonal_gradient(w, h)
    blobs(im, w, h)
    d = ImageDraw.Draw(im)

    pad = round(w * 0.085)
    # 브랜드 줄 — 마스코트 + 이름
    mh = round(w * 0.052)
    m = mascot.resize((mh, mh), Image.LANCZOS)
    im.alpha_composite(m, (pad, round(h * 0.052)))
    text_tracked(d, (pad + mh + round(w * 0.018), round(h * 0.052) + round(mh * 0.16)),
                 "DUBLY · 더블리", font("SemiBold", round(w * 0.026)), OLIVE, tracking=w * 0.004)

    # 카피 두 줄
    cap = round(w * 0.082)
    f = font("SemiBold", cap)
    top = round(h * 0.095)
    d.text((pad, top), line1, font=f, fill=INK)
    d.text((pad, top + round(cap * 1.22)), line2, font=f, fill=INK)

    drop_shadow(im, w, h)
    punch_slot(im, w, h)
    edge_ring(im, w, h)
    return im


def drop_shadow(im: Image.Image, w: int, h: int) -> None:
    """자리 바깥으로 번지는 그림자 — 뚫기 <b>전에</b> 그려야 가운데가 지워지고 테두리만 남는다.

    밝은 화면을 넣으면 캡처와 배경이 둘 다 연해 경계가 사라진다. 그림자가 그 경계를 만든다.
    """
    x, y, sw, sh = slot_box(w, h)
    blur = round(w * 0.022)
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    off = round(h * 0.004)
    ImageDraw.Draw(layer).rounded_rectangle(
        (x - 1, y + off, x + sw + 1, y + sh + off), radius=radius_of(w), fill=(*INK, 70))
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


def feature_graphic(mascot: Image.Image) -> Image.Image:
    """Play 피처 그래픽 1024x500 — 2026-09-15 에 A 안으로 확정.

    <b>가운데를 비워 둔다</b>: Play 는 홍보 영상이 있으면 이 그래픽 한가운데에 재생 버튼을
    겹쳐 띄운다. 문구를 왼쪽에, 마스코트를 오른쪽에 두는 구성이 그 버튼을 피한다.
    """
    w, h = 1024, 500
    im = diagonal_gradient(w, h)
    blobs(im, w, h)
    d = ImageDraw.Draw(im)
    text_tracked(d, (92, 96), "DUBLY · 더블리", font("SemiBold", 26), OLIVE, tracking=6)
    f = font("SemiBold", 72)
    d.text((92, 148), "둘이서 쌓는", font=f, fill=INK)
    d.text((92, 148 + 85), "우리 기록", font=f, fill=INK)
    d.text((92, 366), "사진 한 장이면 끝나는 커플 다이어리", font=font("Medium", 26), fill=SUB)
    m = mascot.resize((340, 340), Image.LANCZOS)
    im.alpha_composite(m, (w - 54 - 340, (h - 340) // 2))
    return im


def main() -> int:
    mascot_path = ROOT / "mascot.png"
    if not mascot_path.exists():
        print(f"마스코트가 없어요: {mascot_path}", file=sys.stderr)
        return 1
    mascot = Image.open(mascot_path).convert("RGBA")
    OUT.mkdir(parents=True, exist_ok=True)

    for size_key, w, h in SIZES:
        for cap_key, l1, l2 in CAPTIONS:
            plate(w, h, l1, l2, mascot).save(OUT / f"{size_key}_{cap_key}.png", optimize=True)
        print(f"{size_key}: {len(CAPTIONS)}장")

    feature_graphic(mascot).convert("RGB").save(ROOT / "feature_graphic.png", optimize=True)
    print("피처 그래픽: feature_graphic.png (1024x500)")
    print(f"→ {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

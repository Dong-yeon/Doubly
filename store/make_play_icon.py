#!/usr/bin/env python3
"""Play Console 에 올리는 512×512 스토어 아이콘.

    python3 store/make_play_icon.py

<b>런처 아이콘에서 만든다</b> — frontend/assets/android-icon-foreground.png. 홈 화면에 실제로
깔리는 그림과 스토어 목록의 그림이 어긋나면 안 되기 때문이다. iOS 용 icon.png 는 여백이 더
넓어서 그대로 쓰면 스토어에서만 작아 보인다.

크기는 <b>내용이 중심 원 안에 들어오도록</b> 맞춘다. Play 는 표시되는 자리마다 다른 마스크를
씌우고(둥근 모서리, 곳에 따라 원), 그중 원이 가장 많이 잘라낸다. 불투명 픽셀의 중심 거리
최대값을 재서 0.455×512 에 맞추면 어느 마스크에서도 왕관과 하트가 살아남는다.

알파는 남기지 않는다 — Play 가 그림자와 모서리를 직접 입히므로 배경은 불투명해야 한다.
"""
import math
import pathlib

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT.parent / "frontend" / "assets" / "android-icon-foreground.png"
OUT = ROOT / "play_icon_512.png"

SIZE = 512
SAFE_RADIUS = 0.455          # 마스크가 원일 때도 남는 비율
BACKGROUND = (255, 255, 255)  # android-icon-background.png 와 같은 흰색


def content_radius(alpha: Image.Image) -> float:
    """불투명 픽셀이 중심에서 가장 멀리 나간 거리.

    bbox 모서리로 재면 안 된다 — 네 귀퉁이는 대개 비어 있어서 실제보다 크게 잡힌다.
    """
    px = alpha.load()
    n = alpha.width
    c = n / 2
    return max(
        (math.hypot(x - c, y - c) for y in range(n) for x in range(n) if px[x, y] > 8),
        default=c,
    )


def main() -> int:
    fg = Image.open(SRC).convert("RGBA")
    r = content_radius(fg.getchannel("A")) * SIZE / fg.width
    scale = SAFE_RADIUS * SIZE / r

    side = round(SIZE * scale)
    icon = Image.new("RGBA", (SIZE, SIZE), (*BACKGROUND, 255))
    icon.alpha_composite(fg.resize((side, side), Image.LANCZOS), ((SIZE - side) // 2,) * 2)
    icon.convert("RGB").save(OUT)

    kb = OUT.stat().st_size / 1024
    print(f"{OUT.name}  {SIZE}×{SIZE}  {kb:.0f}KB  (확대 {scale:.3f}배, 한도 1MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

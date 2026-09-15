"""비개구리 스티커의 몸통 색을 한 가지로 통일한다 — 모양은 건드리지 않는다.

**왜 생성이 아니라 후처리인가.** 이미지 모델은 호출마다 그림을 처음부터 다시 그린다. 색을
프롬프트로 지정해도 장마다 미묘하게 달라진다 — 2026-09-15 의 24장은 몸통 중앙값이
`#71BA68` 부터 `#99D490` 까지 벌어졌다. 색은 완성본 위에서 픽셀로 맞춰야 한다.

**더비(초록)/블리(노랑) 두 캐릭터도 여기서 갈린다.** 같은 그림을 색상만 돌려 두 벌로 만든다.

방식 — 초록 계열 픽셀의 **색상(H)을 목표 색으로 돌리고**, 몸통처럼 진한 픽셀은 채도·명도까지
목표값으로 눌러 평면으로 만든다. 가장자리 안티앨리어싱 픽셀(채도가 낮다)은 색상만 돌리고
밝기를 남겨 둔다 — 안 그러면 테두리가 계단처럼 깨진다.

얼굴선(검정)·흰 테두리는 무채색이라 걸리지 않는다. 볼 홍조는 분홍이라 초록 범위 밖이다.

    python scripts/couple-emoji-experiment/unify_body_color.py <입력> <출력> [green|yellow]
"""
from __future__ import annotations

import colorsys
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# 목표 몸통색. green 은 전량 교체한 24장의 중앙값 근처, yellow 는 거기서 색상만 돌린 값.
TARGETS = {
    'green': '#86CB7F',   # 더비
    'yellow': '#F2D06B',  # 블리
}

# 볼 홍조(와 하트 같은 따뜻한 색 소품). 생성물의 홍조는 #D3A18A 같은 탁한 살구색이라
# 노란 몸통 위에 얹으면 베이지처럼 묻힌다. 블리(노랑)만 진한 산호색으로 눌러 대비를 만든다.
# 더비(초록)는 원래 대비가 충분해서 건드리지 않는다(None).
BLUSH_TARGETS = {
    'green': None,
    'yellow': '#E8896F',
}

# 홍조로 볼 색상 범위 — 자홍~주황 직전. 초록 소품·회색 거울·파란 이불은 걸리지 않는다.
BLUSH_H = (0.88, 0.08)
# 이 명도 미만은 갈색 윤곽선이라 뺀다. 안 빼면 얼굴선이 장미색으로 물든다.
BLUSH_MIN_VALUE = 0.55

# 이 채도 이상이면 "몸통 안쪽" 으로 보고 평면으로 누른다. 미만은 가장자리라 색상만 돌린다.
FLAT_CHROMA = 0.12
# 이 채도 미만은 무채색(검정 선·흰 테두리)이라 건드리지 않는다.
MIN_CHROMA = 0.03
# 이 명도 미만이면 "짙은 선"이라 평면화 대상에서 뺀다. 색상만 돌리고 어둡기는 남긴다.
# 안 빼면 이목구비를 짙은 올리브로 그려 둔 장(화났어 등)의 눈·눈썹이 몸통색에 먹혀 사라진다.
MIN_VALUE = 0.55
# 초록으로 인정할 색상 범위 (HSV 의 H, 0~1). 0.20~0.47 = 연두~청록 직전.
GREEN_H = (0.20, 0.47)


def _hsv_of(hexstr: str) -> tuple[float, float, float]:
    h = hexstr.lstrip('#')
    return colorsys.rgb_to_hsv(*(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)))


def unify(src: Path, dst: Path, target: str = 'green', body_hex: str | None = None,
          blush_hex: str | None = None) -> None:
    th, ts, tv = _hsv_of(body_hex or TARGETS[target])
    blush = blush_hex if blush_hex is not None else BLUSH_TARGETS[target]
    bh, bs, bv = _hsv_of(blush) if blush else (0.0, 0.0, 0.0)

    im = Image.open(src).convert('RGBA')
    rgba = np.asarray(im).astype(np.float32) / 255.0
    rgb, alpha = rgba[..., :3], rgba[..., 3]

    chroma = rgb.max(-1) - rgb.min(-1)
    candidate = (chroma > MIN_CHROMA) & (alpha > 0.4)

    out = rgb.copy()
    idx = np.where(candidate)
    if idx[0].size:
        hsv = np.array([colorsys.rgb_to_hsv(*p) for p in rgb[idx]])
        is_green = (hsv[:, 0] >= GREEN_H[0]) & (hsv[:, 0] <= GREEN_H[1])
        solid = (hsv[:, 1] >= FLAT_CHROMA) & (hsv[:, 2] >= MIN_VALUE)

        hsv[is_green, 0] = th
        # 몸통 안쪽은 채도·명도까지 목표값 → 완전한 단색 평면
        both = is_green & solid
        hsv[both, 1] = ts
        hsv[both, 2] = tv

        if blush:
            # 홍조는 채도·명도까지 목표값으로 눌러 장마다 다른 탁한 살구색을 한 색으로 모은다
            is_pinkish = (hsv[:, 0] >= BLUSH_H[0]) | (hsv[:, 0] <= BLUSH_H[1])
            is_blush = is_pinkish & (hsv[:, 2] >= BLUSH_MIN_VALUE)
            hsv[is_blush, 0] = bh
            hsv[is_blush, 1] = bs
            hsv[is_blush, 2] = bv
        else:
            is_blush = np.zeros(len(hsv), dtype=bool)

        changed = np.array([colorsys.hsv_to_rgb(*h) for h in hsv])
        out[idx] = np.where((is_green | is_blush)[:, None], changed, rgb[idx])

    merged = np.concatenate([out, alpha[..., None]], axis=-1)
    dst.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((merged * 255).astype(np.uint8), mode='RGBA').save(dst)


if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) not in (2, 3):
        raise SystemExit(__doc__)
    unify(Path(args[0]), Path(args[1]), args[2] if len(args) == 3 else 'green')

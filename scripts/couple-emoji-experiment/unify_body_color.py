"""비개구리 스티커의 몸통 색을 한 가지로 통일한다 — 모양은 건드리지 않는다.

**왜 생성이 아니라 후처리인가.** 이미지 모델은 호출마다 그림을 처음부터 다시 그린다. 색을
프롬프트로 지정해도 장마다 미묘하게 달라진다 — 2026-09-15 의 24장은 몸통 중앙값이
`#71BA68` 부터 `#99D490` 까지 벌어졌다. 색은 완성본 위에서 픽셀로 맞춰야 한다.

**초록(남)/핑크(여) 두 캐릭터도 여기서 갈린다.** 같은 그림을 색상만 돌려 두 벌로 만든다.

방식 — 초록 계열 픽셀의 **색상(H)을 목표 색으로 돌리고**, 몸통처럼 진한 픽셀은 채도·명도까지
목표값으로 눌러 평면으로 만든다. 가장자리 안티앨리어싱 픽셀(채도가 낮다)은 색상만 돌리고
밝기를 남겨 둔다 — 안 그러면 테두리가 계단처럼 깨진다.

얼굴선(검정)·흰 테두리는 무채색이라 걸리지 않는다. 볼 홍조는 분홍이라 초록 범위 밖이다.

    python scripts/couple-emoji-experiment/unify_body_color.py <입력> <출력> [green|pink]
"""
from __future__ import annotations

import colorsys
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# 목표 몸통색. green 은 24장 중앙값 근처, pink 는 같은 채도·명도에서 색상만 돌린 값.
TARGETS = {
    'green': '#86CB7F',
    'pink': '#E58FA9',
}

# 이 채도 이상이면 "몸통 안쪽" 으로 보고 평면으로 누른다. 미만은 가장자리라 색상만 돌린다.
FLAT_CHROMA = 0.12
# 이 채도 미만은 무채색(검정 선·흰 테두리)이라 건드리지 않는다.
MIN_CHROMA = 0.03
# 이 명도 미만이면 "짙은 선"이라 평면화 대상에서 뺀다. 색상만 돌리고 어둡기는 남긴다.
# 안 빼면 이목구비를 짙은 올리브로 그려 둔 장(화났어 등)의 눈·눈썹이 몸통색에 먹혀 사라진다.
MIN_VALUE = 0.55
# 초록으로 인정할 색상 범위 (HSV 의 H, 0~1). 0.20~0.47 = 연두~청록 직전.
GREEN_H = (0.20, 0.47)


def unify(src: Path, dst: Path, target: str = 'green') -> None:
    hexstr = TARGETS[target].lstrip('#')
    tr, tg, tb = (int(hexstr[i:i + 2], 16) / 255 for i in (0, 2, 4))
    th, ts, tv = colorsys.rgb_to_hsv(tr, tg, tb)

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

        changed = np.array([colorsys.hsv_to_rgb(*h) for h in hsv])
        out[idx] = np.where(is_green[:, None], changed, rgb[idx])

    merged = np.concatenate([out, alpha[..., None]], axis=-1)
    dst.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((merged * 255).astype(np.uint8), mode='RGBA').save(dst)


if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) not in (2, 3):
        raise SystemExit(__doc__)
    unify(Path(args[0]), Path(args[1]), args[2] if len(args) == 3 else 'green')

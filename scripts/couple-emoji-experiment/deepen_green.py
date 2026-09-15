"""비개구리 스티커의 몸통 초록만 진하게 칠한다 — 모양은 건드리지 않는다.

**왜 생성이 아니라 후처리인가.** `sketch.mjs` 는 호출마다 이미지를 처음부터 다시 그린다.
모양을 글로만 설명하면 색만 바꿔달라고 해도 실루엣이 같이 흔들린다(2026-09-15 에 실제로 겪었다).
색은 이미 확정된 PNG 위에서 픽셀로 바꿔야 모양이 한 픽셀도 안 변한다.

흰 테두리·분홍 볼·검은 얼굴선은 건드리지 않는다 — 초록 계열 픽셀만 HSV 에서 채도를 올리고
명도를 낮춘다. 단계는 `STEPS` 에 있고 세트 확정값은 'b' 다.

    python scripts/couple-emoji-experiment/deepen_green.py <입력> <출력> [단계]
"""
from __future__ import annotations

import colorsys
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# (채도 배율, 명도 배율)
STEPS = {'a': (1.55, 0.93), 'b': (2.10, 0.86), 'c': (2.60, 0.78)}
DEFAULT_STEP = 'b'


def deepen(src: Path, dst: Path, step: str = DEFAULT_STEP) -> None:
    sat_mul, val_mul = STEPS[step]
    im = Image.open(src).convert('RGBA')
    rgba = np.asarray(im).astype(np.float32) / 255.0
    rgb, alpha = rgba[..., :3], rgba[..., 3]

    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    chroma = rgb.max(-1) - rgb.min(-1)
    # 초록 계열이면서 무채색이 아닌 픽셀 = 몸통
    green = (g >= r) & (g >= b) & (chroma > 0.04) & (alpha > 0.5)

    out = rgb.copy()
    idx = np.where(green)
    if idx[0].size:
        hsv = np.array([colorsys.rgb_to_hsv(*p) for p in rgb[idx]])
        hsv[:, 1] = np.clip(hsv[:, 1] * sat_mul, 0, 1)
        hsv[:, 2] = np.clip(hsv[:, 2] * val_mul, 0, 1)
        out[idx] = np.array([colorsys.hsv_to_rgb(*h) for h in hsv])

    merged = np.concatenate([out, alpha[..., None]], axis=-1)
    dst.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((merged * 255).astype(np.uint8), mode='RGBA').save(dst)


if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) not in (2, 3):
        raise SystemExit(__doc__)
    deepen(Path(args[0]), Path(args[1]), args[2] if len(args) == 3 else DEFAULT_STEP)

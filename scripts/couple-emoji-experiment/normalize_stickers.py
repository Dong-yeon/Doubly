#!/usr/bin/env python
"""손그림 스티커화 결과(1024 RGB, 흰 배경) → 번들 에셋 규격(360 RGBA, 투명 배경).

docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §15 "남은 결정: 배경 순백 통일, 크기 정규화".

배경을 그냥 투명하게 못 만든다 — 생성물의 배경(252,250,251 근방)과 캐릭터를 감싼
흰 스티커 테두리가 둘 다 흰색이고 서로 붙어 있어서, 가장자리에서 flood fill 하면
테두리까지 같이 지워진다. 그래서 **테두리를 지운 뒤 다시 그린다**:

  1. 가장자리에서 도달 가능한 흰색 = 배경 + 원래 테두리 → 지운다
  2. 남은 캐릭터를 R px 팽창시켜 테두리를 새로 칠한다 (모든 장이 같은 두께가 된다)

부수 효과로 장마다 다른 테두리(05 메롱은 보라색 테두리로 나왔다)가 한 규격으로 통일된다.
캐릭터 내부의 흰색(눈 흰자, 이불)은 가장자리에서 도달할 수 없으므로 지워지지 않는다.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

# 배경으로 볼 밝기 — 생성물 배경은 250~253, 흰 테두리는 255. 둘 다 걸리게 잡는다.
WHITE_THRESHOLD = 235
# 새로 그릴 흰 테두리 두께(1024 기준). 360 으로 줄면 약 6px.
BORDER_RADIUS = 18
# 캐릭터로 인정할 최소 덩어리 크기 — JPEG 노이즈·먼지 제거
MIN_BLOB_AREA = 400
# 최종 규격 — frontend/assets/stickers/love_bear.png 과 동일
OUTPUT_SIZE = 360
# 정사각 캔버스에서 캐릭터가 차지하는 비율(나머지는 여백)
CONTENT_RATIO = 0.92


def _disk(radius: int) -> np.ndarray:
    span = np.arange(-radius, radius + 1)
    yy, xx = np.meshgrid(span, span, indexing="ij")
    return (yy * yy + xx * xx) <= radius * radius


def normalize(src: Path, dst: Path) -> None:
    rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.uint8)

    # 1. 가장자리에서 도달 가능한 흰색 = 배경 + 원래 흰 테두리
    near_white = np.all(rgb >= WHITE_THRESHOLD, axis=-1)
    labels, count = ndimage.label(near_white)
    outside = np.zeros_like(near_white)
    if count:
        edge_ids = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
        edge_ids.discard(0)
        if edge_ids:
            outside = np.isin(labels, list(edge_ids))

    character = ~outside

    # 노이즈 제거 — 큰 덩어리만 캐릭터로 인정
    blob_labels, blob_count = ndimage.label(character)
    if blob_count:
        sizes = ndimage.sum(character, blob_labels, range(1, blob_count + 1))
        keep = [i + 1 for i, s in enumerate(sizes) if s >= MIN_BLOB_AREA]
        character = np.isin(blob_labels, keep) if keep else character

    if not character.any():
        raise SystemExit(f"{src.name}: 캐릭터를 찾지 못했다 (임계값 확인)")

    # 2. 흰 테두리를 새로 그린다
    grown = ndimage.binary_dilation(character, structure=_disk(BORDER_RADIUS))
    border = grown & ~character

    out = np.zeros((*rgb.shape[:2], 4), dtype=np.uint8)
    out[character, :3] = rgb[character]
    out[character, 3] = 255
    out[border] = (255, 255, 255, 255)

    # 3. 내용에 맞춰 자르고 정사각 여백을 준 뒤 규격으로 줄인다
    ys, xs = np.where(grown)
    top, bottom, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    cropped = Image.fromarray(out[top:bottom, left:right], mode="RGBA")

    content = int(OUTPUT_SIZE * CONTENT_RATIO)
    scale = content / max(cropped.width, cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.LANCZOS,
    )

    canvas = Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE), (0, 0, 0, 0))
    canvas.paste(
        resized,
        ((OUTPUT_SIZE - resized.width) // 2, (OUTPUT_SIZE - resized.height) // 2),
        resized,
    )
    dst.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(dst, "PNG", optimize=True)
    print(f"{src.name} -> {dst.name}  {cropped.size} -> {canvas.size}  {dst.stat().st_size // 1024}KB")


def main(argv: list[str]) -> None:
    if len(argv) % 2 or not argv:
        raise SystemExit("사용법: normalize_stickers.py <입력> <출력> [<입력> <출력> ...]")
    for src, dst in zip(argv[::2], argv[1::2]):
        normalize(Path(src), Path(dst))


if __name__ == "__main__":
    main(sys.argv[1:])

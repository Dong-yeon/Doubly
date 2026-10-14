import io
import os
import sys

import cv2
import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def make_scene(seed=1, w=1500, h=1100):
    """사물이 많은 가짜 사진 — 경계가 뚜렷한 도형(color 대상)과 무늬 있는 도형(remove·flip 대상)을 섞는다.
    실제 사진을 저장소에 넣지 않으려고 만든다(사람 얼굴·위치 정보가 섞일 수 있다)."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w]
    img = np.zeros((h, w, 3), np.uint8)
    img[..., 0] = (90 + 60 * xx / w).astype(np.uint8)
    img[..., 1] = (120 + 50 * yy / h).astype(np.uint8)
    img[..., 2] = 150
    img = cv2.add(img, rng.integers(0, 12, (h, w, 3), dtype=np.uint8))
    for _ in range(140):
        color = tuple(int(c) for c in rng.integers(20, 235, 3))
        x, y = int(rng.integers(30, w - 30)), int(rng.integers(30, h - 30))
        s = int(rng.integers(14, 40))
        if rng.random() < .5:
            cv2.circle(img, (x, y), s, color, -1)
        else:
            cv2.rectangle(img, (x - s, y - s), (x + s, y + s // 2), color, -1)
        if rng.random() < .4:  # 줄무늬 — 무늬가 있어야 remove·flip 이 티가 난다
            for k in range(-s, s, 6):
                cv2.line(img, (x - s, y + k), (x + s, y + k + 4), (255 - color[0], 255 - color[1], 40), 2)
    return img


def to_jpeg(img, exif=None):
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    out = io.BytesIO()
    kw = {"exif": exif} if exif is not None else {}
    Image.fromarray(rgb).save(out, format="JPEG", quality=92, **kw)
    return out.getvalue()


@pytest.fixture(scope="session")
def scene():
    return make_scene()

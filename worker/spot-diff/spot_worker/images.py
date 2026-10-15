"""이미지 입출력 — EXIF 방향, 크기 확인, 메타데이터 없는 JPEG 인코딩."""
import io

import cv2
import numpy as np
from PIL import Image, ImageOps

from . import config


def header_size(head: bytes):
    """파일 앞부분만으로 (가로, 세로) — EXIF 방향(90°/270° 회전)을 적용한 값. 읽지 못하면 None."""
    try:
        with Image.open(io.BytesIO(head)) as im:
            w, h = im.size
            orientation = im.getexif().get(0x0112, 1)
    except Exception:
        return None
    if orientation in (5, 6, 7, 8):
        w, h = h, w
    return w, h


def load_oriented(data: bytes) -> np.ndarray:
    """원본 바이트 → EXIF 방향을 적용한 BGR 배열(OpenCV 형식). 메타데이터는 여기서 버려진다."""
    with Image.open(io.BytesIO(data)) as im:
        im = ImageOps.exif_transpose(im)
        rgb = np.asarray(im.convert("RGB"))
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def fit_long_side(img: np.ndarray, long_side: int = config.LONG_SIDE) -> np.ndarray:
    """긴 변을 long_side 로 줄인다(작으면 그대로 — 키우지 않는다)."""
    h, w = img.shape[:2]
    scale = long_side / max(h, w)
    if scale >= 1:
        return img
    return cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)


def encode_jpeg(img: np.ndarray) -> bytes:
    """BGR → JPEG. 픽셀만 새로 인코딩하므로 EXIF(GPS 포함)·XMP·ICC 가 하나도 붙지 않는다."""
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    out = io.BytesIO()
    Image.fromarray(rgb).save(out, format="JPEG", quality=config.JPEG_QUALITY, optimize=True)
    return out.getvalue()

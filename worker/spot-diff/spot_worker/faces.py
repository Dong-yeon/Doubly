"""얼굴 보호 영역 — 얼굴에는 변형을 넣지 않는다(연인 얼굴을 바꾸는 건 게임이 아니라 실례다)."""
import cv2
import numpy as np

from . import config

_cascade = None


def _detector():
    global _cascade
    if _cascade is None:
        _cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    return _cascade


def detect(img: np.ndarray):
    """정면 얼굴 bbox 목록 [(x, y, w, h)]. 너무 작은 것(짧은 변 4% 미만)은 얼굴로 보지 않는다 — 무늬 오탐이 많다."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    min_side = max(24, int(min(img.shape[:2]) * 0.04))
    found = _detector().detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(min_side, min_side))
    return [tuple(int(v) for v in f) for f in found]


def protect_mask(shape, boxes, expand: float = config.FACE_EXPAND) -> np.ndarray:
    """bbox 를 중심 기준 expand 배로 넓힌 영역 = 255 인 마스크."""
    h, w = shape[:2]
    mask = np.zeros((h, w), np.uint8)
    for (x, y, bw, bh) in boxes:
        cx, cy = x + bw / 2, y + bh / 2
        hw, hh = bw * expand / 2, bh * expand / 2
        x0, y0 = max(0, int(cx - hw)), max(0, int(cy - hh))
        x1, y1 = min(w, int(round(cx + hw))), min(h, int(round(cy + hh)))
        mask[y0:y1, x0:x1] = 255
    return mask

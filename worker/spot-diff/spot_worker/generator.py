"""사진 한 장 → 차이 다섯 개를 넣은 B 이미지. 시제품 prototype/diff_d.py 의 D 방식을 그대로 옮기고 둘을 더했다.

  1. 얼굴 보호 — 보호 마스크(얼굴 bbox ×1.3)에 닿는 superpixel 은 고르지 않고, 실제로 바뀐 픽셀이 닿아도 버린다
     (clone·inpaint 는 지정 영역 밖으로 번질 수 있다).
  2. 최소 거리를 "저장되는 중심"(바뀐 픽셀의 평균)으로 잰다 — 시제품은 superpixel 중심으로 재서 저장값끼리는
     조금 가까워질 수 있었다.

변형 재료는 전부 같은 사진의 픽셀이라 이질감이 적다.
  color  : superpixel 하나의 색상(hue)을 돌림 — 경계가 뚜렷한 영역(objectness ≥ 2.0)에만
  remove : 작은 superpixel 을 지우고 inpaint 로 메움
  clone  : 다른 곳의 패치를 복제해 seamlessClone
  flip   : 원형 패치를 좌우 반전

같은 (이미지, seed, level, 보호 마스크)면 같은 결과가 나온다 — SLIC·OpenCV 연산은 결정적이고, 무작위는 전부
random.Random(seed) 하나에서 나온다.
"""
import random

import cv2
import numpy as np
from skimage.segmentation import slic

from . import config

LEVELS = {
    #          superpixel 면적 비율 범위         hue 회전   최소 차이(평균 abs)
    "easy":   dict(area=(.004, .015), hue=40, min_diff=24),
    "normal": dict(area=(.002, .008), hue=30, min_diff=18),
    "hard":   dict(area=(.001, .004), hue=22, min_diff=14),
}

KINDS = ["color", "remove", "clone", "flip"]
OBJECTNESS_MIN = 2.0
TEXTURE_MIN = .08
CHANGED_PIXEL = 12       # 이보다 크게 바뀐 픽셀을 "바뀐 곳"으로 본다
MIN_DIST_RATIO = .14     # 차이끼리 최소 거리 = 짧은 변 × 이 값
MARGIN_RATIO = .03       # 가장자리에서 이만큼은 비운다


class GenerationFailed(Exception):
    pass


def texture(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    return cv2.magnitude(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))


def objectness(tex, mask):
    """경계가 뚜렷한 영역(= 사물 하나)일수록 색 변경이 자연스럽다. 경계 edge / 내부 edge."""
    k = np.ones((5, 5), np.uint8)
    ring = cv2.dilate(mask, k) - cv2.erode(mask, k)
    inner = cv2.erode(mask, k)
    if inner.sum() == 0:
        return 0
    return tex[ring > 0].mean() / (tex[inner > 0].mean() + 1e-3)


def far_enough(c, used, d):
    return all((c[0] - u[0]) ** 2 + (c[1] - u[1]) ** 2 >= d * d for u in used)


def apply_color(img, mask, p, rng):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.int32)
    sel = mask > 0
    if hsv[..., 1][sel].mean() < 40:  # 무채색이면 hue 를 돌려도 티가 안 남 → 밝기 변경
        hsv[..., 2][sel] = np.clip(hsv[..., 2][sel] * rng.choice([.72, 1.28]), 0, 255)
    else:
        hsv[..., 0][sel] = (hsv[..., 0][sel] + rng.choice([-1, 1]) * p["hue"] // 2) % 180
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)


def apply_remove(img, mask, p, rng):
    m = cv2.dilate(mask, np.ones((5, 5), np.uint8))
    return cv2.inpaint(img, m, 7, cv2.INPAINT_TELEA)


def apply_clone(img, mask, p, rng, center, protect):
    h, w = img.shape[:2]
    ys, xs = np.where(mask > 0)
    bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    for _ in range(50):
        sx = rng.randint(0, w - bw - 1)
        sy = rng.randint(0, h - bh - 1)
        if abs(sx - xs.min()) < bw * 2 and abs(sy - ys.min()) < bh * 2:
            continue
        # 얼굴을 떼어다 다른 곳에 붙이는 것도 막는다
        if protect is not None and protect[sy:sy + bh, sx:sx + bw].any():
            continue
        src = img[sy:sy + bh, sx:sx + bw]
        m = mask[ys.min():ys.min() + bh, xs.min():xs.min() + bw]
        try:
            return cv2.seamlessClone(src, img, m, center, cv2.NORMAL_CLONE)
        except cv2.error:
            continue
    return img


def apply_flip(img, mask, p, rng, center):
    ys, xs = np.where(mask > 0)
    r = int(max(xs.max() - xs.min(), ys.max() - ys.min()) * .6)
    h, w = img.shape[:2]
    x0, y0 = max(0, center[0] - r), max(0, center[1] - r)
    x1, y1 = min(w, center[0] + r), min(h, center[1] + r)
    out = img.copy()
    patch = img[y0:y1, x0:x1]
    circ = np.zeros(patch.shape[:2], np.float32)
    cv2.circle(circ, (center[0] - x0, center[1] - y0), r, 1, -1)
    circ = cv2.GaussianBlur(circ, (0, 0), max(r / 8, 1))[..., None]
    out[y0:y1, x0:x1] = (patch * (1 - circ) + cv2.flip(patch, 1) * circ).astype(np.uint8)
    return out


def generate(img, seed, level=config.LEVEL, count=config.DIFF_COUNT, protect=None):
    """img(BGR) → (B 이미지, diffs). diffs = [{id, kind, cx, cy, r}] — cx·cy 는 0~1, r 은 긴 변 기준 정규화.

    protect: 변형하면 안 되는 영역 마스크(0/255, img 와 같은 크기) 또는 None.
    count 개를 못 만들면 GenerationFailed.
    """
    rng = random.Random(seed)
    h, w = img.shape[:2]
    p = LEVELS[level]
    seg = slic(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), n_segments=400, compactness=12, start_label=0)
    tex = texture(img)
    labels = list(range(seg.max() + 1))
    rng.shuffle(labels)

    out = img.copy()
    used, diffs = [], []
    margin = int(min(h, w) * MARGIN_RATIO)
    min_dist = min(h, w) * MIN_DIST_RATIO
    for lab in labels:
        if len(diffs) == count:
            break
        mask = (seg == lab).astype(np.uint8) * 255
        area = mask.sum() / 255 / (h * w)
        if not (p["area"][0] <= area <= p["area"][1]):
            continue
        if protect is not None and (protect[mask > 0] > 0).any():
            continue
        ys, xs = np.where(mask > 0)
        cx, cy = int(xs.mean()), int(ys.mean())
        if not (margin < cx < w - margin and margin < cy < h - margin):
            continue
        if not far_enough((cx, cy), used, min_dist):
            continue
        kind = KINDS[len(diffs) % len(KINDS)]
        # remove·flip 은 무늬가 있어야 티가 난다
        if kind in ("remove", "flip") and tex[mask > 0].mean() < TEXTURE_MIN:
            kind = "color"
        if kind == "color" and objectness(tex, mask) < OBJECTNESS_MIN:
            kind = "remove" if tex[mask > 0].mean() >= TEXTURE_MIN else None
        if kind is None:
            continue
        if kind == "color":
            cand = apply_color(out, mask, p, rng)
        elif kind == "remove":
            cand = apply_remove(out, mask, p, rng)
        elif kind == "clone":
            cand = apply_clone(out, mask, p, rng, (cx, cy), protect)
        else:
            cand = apply_flip(out, mask, p, rng, (cx, cy))
        # 실제로 차이가 보이는지 확인 (안 보이는 차이 = 불공정)
        d = cv2.absdiff(cand, out).max(axis=2)
        changed = d > CHANGED_PIXEL
        if changed.sum() == 0 or d[changed].mean() < p["min_diff"]:
            continue
        # 보호 영역은 1 만큼이라도 바뀌면 버린다(번짐 포함 — 눈에 안 띄는 변화도 얼굴에는 넣지 않는다)
        if protect is not None and (protect[d > 0] > 0).any():
            continue
        # 변경 영역이 지정 영역 밖으로 크게 번지면 버림 (seamlessClone 등)
        ys2, xs2 = np.where(changed)
        rr = max(xs2.max() - xs2.min(), ys2.max() - ys2.min()) / 2
        if rr > min_dist * .6:
            continue
        center = (float(xs2.mean()), float(ys2.mean()))
        if not far_enough(center, used, min_dist):
            continue
        # 정답 반지름 — 중심에서 가장 먼 "바뀐 픽셀"까지. 시제품은 bbox 절반(rr)을 썼는데, 모양이 한쪽으로 치우치면
        # 바뀐 곳 일부가 원 밖에 남아 "바뀐 데를 눌렀는데 오답"이 된다
        reach = float(np.sqrt(((xs2 - center[0]) ** 2 + (ys2 - center[1]) ** 2).max()))
        out = cand
        used.append(center)
        diffs.append(dict(id=len(diffs), kind=kind, cx=center[0] / w, cy=center[1] / h,
                          r=float((max(rr, reach) + 6) / max(w, h))))

    if len(diffs) < count:
        raise GenerationFailed(f"차이 {len(diffs)}/{count}개만 만들었어요")
    return out, diffs

"""D 방식: 사진 한 장으로 틀린그림찾기 자동 생성.

변형 재료는 전부 같은 사진의 픽셀이라 이질감이 적다.
  color  : superpixel 하나의 색상(hue)을 돌림
  remove : 작은 superpixel을 지우고 inpaint로 메움
  clone  : 다른 곳의 패치를 복제해 seamlessClone
  flip   : 원형 패치를 좌우 반전

사용: python diff_d.py <photo> <out_dir> [--count 5] [--level easy|normal|hard] [--seed 7]
"""
import argparse
import json
import os
import random

import cv2
import numpy as np
from skimage.segmentation import slic

LEVELS = {
    #          superpixel 면적 비율 범위         hue 회전   최소 차이(평균 abs)
    "easy":   dict(area=(.004, .015), hue=40, min_diff=24),
    "normal": dict(area=(.002, .008), hue=30, min_diff=18),
    "hard":   dict(area=(.001, .004), hue=22, min_diff=14),
}


def texture(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    mag = cv2.magnitude(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
    return mag


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
    if hsv[..., 1][sel].mean() < 40:  # 무채색이면 hue를 돌려도 티가 안 남 → 밝기 변경
        hsv[..., 2][sel] = np.clip(hsv[..., 2][sel] * rng.choice([.72, 1.28]), 0, 255)
    else:
        hsv[..., 0][sel] = (hsv[..., 0][sel] + rng.choice([-1, 1]) * p["hue"] // 2) % 180
    out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
    return out


def apply_remove(img, mask, p, rng):
    m = cv2.dilate(mask, np.ones((5, 5), np.uint8))
    return cv2.inpaint(img, m, 7, cv2.INPAINT_TELEA)


def apply_clone(img, mask, p, rng, center):
    h, w = img.shape[:2]
    ys, xs = np.where(mask > 0)
    bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
    for _ in range(50):
        sx = rng.randint(0, w - bw - 1)
        sy = rng.randint(0, h - bh - 1)
        if abs(sx - xs.min()) < bw * 2 and abs(sy - ys.min()) < bh * 2:
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


def run(photo, out_dir, count, level, seed):
    rng = random.Random(seed)
    img = cv2.imread(photo)
    if img is None:
        raise SystemExit(f"read fail: {photo}")
    h, w = img.shape[:2]
    p = LEVELS[level]
    seg = slic(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), n_segments=400, compactness=12, start_label=0)
    tex = texture(img)
    labels = list(range(seg.max() + 1))
    rng.shuffle(labels)

    out = img.copy()
    used, diffs = [], []
    kinds = ["color", "remove", "clone", "flip"]
    margin = int(min(h, w) * .03)
    min_dist = min(h, w) * .14
    for lab in labels:
        if len(diffs) == count:
            break
        mask = (seg == lab).astype(np.uint8) * 255
        area = mask.sum() / 255 / (h * w)
        if not (p["area"][0] <= area <= p["area"][1]):
            continue
        ys, xs = np.where(mask > 0)
        cx, cy = int(xs.mean()), int(ys.mean())
        if not (margin < cx < w - margin and margin < cy < h - margin):
            continue
        if not far_enough((cx, cy), used, min_dist):
            continue
        kind = kinds[len(diffs) % len(kinds)]
        # remove·flip은 무늬가 있어야 티가 난다
        if kind in ("remove", "flip") and tex[mask > 0].mean() < .08:
            kind = "color"
        if kind == "color" and objectness(tex, mask) < 2.0:
            kind = "remove" if tex[mask > 0].mean() >= .08 else None
        if kind is None:
            continue
        if kind == "color":
            cand = apply_color(out, mask, p, rng)
        elif kind == "remove":
            cand = apply_remove(out, mask, p, rng)
        elif kind == "clone":
            cand = apply_clone(out, mask, p, rng, (cx, cy))
        else:
            cand = apply_flip(out, mask, p, rng, (cx, cy))
        # 실제로 차이가 보이는지 확인 (안 보이는 차이 = 불공정)
        d = cv2.absdiff(cand, out).max(axis=2)
        changed = d > 12
        if changed.sum() == 0 or d[changed].mean() < p["min_diff"]:
            continue
        # 변경 영역이 지정 영역 밖으로 크게 번지면 버림 (seamlessClone 등)
        ys2, xs2 = np.where(changed)
        rr = max(xs2.max() - xs2.min(), ys2.max() - ys2.min()) / 2
        if rr > min_dist * .6:
            continue
        out = cand
        used.append((cx, cy))
        diffs.append(dict(id=len(diffs), kind=kind, cx=float(xs2.mean() / w), cy=float(ys2.mean() / h),
                          r=float((rr + 6) / max(w, h))))

    name = os.path.splitext(os.path.basename(photo))[0]
    os.makedirs(out_dir, exist_ok=True)
    base = os.path.join(out_dir, f"{name}_{level}")
    gap = np.full((h, 8, 3), 255, np.uint8)
    cv2.imwrite(base + "_pair.png", np.hstack([img, gap, out]))
    ans = out.copy()
    for dd in diffs:
        cv2.circle(ans, (int(dd["cx"] * w), int(dd["cy"] * h)), int(dd["r"] * max(w, h)), (0, 0, 255), max(2, w // 300))
    cv2.imwrite(base + "_answer.png", np.hstack([img, gap, ans]))
    cv2.imwrite(base + "_b.png", out)
    with open(base + "_layout.json", "w") as f:
        json.dump(dict(photo=photo, level=level, width=w, height=h, seed=seed, diffs=diffs), f, indent=1)
    return base, [d["kind"] for d in diffs]


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("photo")
    ap.add_argument("out_dir")
    ap.add_argument("--count", type=int, default=5)
    ap.add_argument("--level", default="normal", choices=LEVELS)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    print(run(a.photo, a.out_dir, a.count, a.level, a.seed))

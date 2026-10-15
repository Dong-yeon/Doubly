"""AI 가 바꾼 사진에서 "진짜 차이"만 골라 원본에 되붙인다 — 생성기 d3.

모델은 그림 전체를 미세하게 다시 그린다(질감·잡음·색감). 그 결과를 그대로 B 로 쓰면 원본과 수천 곳이 다르고, 서버 판정(정답 원
다섯 개)과 어긋난다. 그래서:

  1. 정렬 — 크기를 원본에 맞추고 ECC(affine)로 미세한 밀림을 바로잡는다.
  2. 후보 — Lab 색 거리(ΔE)를 흐리게 한 뒤 크게 다른 곳만 남기고, 열기·닫기로 잡음을 지운 덩어리.
     너무 작거나·크거나·길거나·약한 덩어리, 가장자리에 닿은 덩어리는 버린다. 얼굴 보호 영역과 많이 겹치면 버리고,
     조금 겹치면 **겹친 부분을 잘라 낸다**(얼굴 쪽 픽셀은 절대 바꾸지 않는다).
  3. 고르기 — 편집본 여러 장(호출 1~2회)의 후보를 합쳐, 크고 뚜렷한 순으로 서로 떨어진 5개.
  4. 되붙이기 — B = 원본에 그 5개 덩어리(조금 넓혀 경계를 부드럽게)만 각자의 편집본 픽셀을 섞는다. **나머지는 원본 픽셀 그대로.**

정답 원은 d1 과 같은 규칙: 바뀐 픽셀의 평균이 중심, 중심에서 가장 먼 바뀐 픽셀까지가 반지름(긴 변 기준 정규화).
"""
from dataclasses import dataclass

import cv2
import numpy as np

CHANGED_PIXEL = 12           # 되붙인 뒤 "바뀐 픽셀" 기준 — d1 과 같다
DELTA_E = 18.0               # 차이 지도 문턱(흐린 ΔE)
MIN_AREA = .0012             # 덩어리 면적 하한(사진 대비) — 열쇠 하나 정도
MAX_AREA = .10               # 상한 — 옷 무늬 전체 같은 것은 퍼즐 차이가 아니다
MAX_EXTENT = .40             # 덩어리 가로·세로 중 긴 쪽 상한(짧은 변 대비) — 붙어 있는 두 차이가 합쳐진 것
MIN_MEAN_DELTA = 22.0        # 덩어리 평균 ΔE 하한 — 재렌더링 잡음(옷 질감 등)은 여기서 떨어진다
FACE_OVERLAP_MAX = .35       # 얼굴 보호 영역과 이보다 많이 겹치면 버린다(적게 겹치면 겹친 부분만 잘라 낸다)
MIN_DIST_RATIO = .12         # 차이끼리 최소 거리(짧은 변 대비) — 편집본 여러 장이 같은 사물을 고르기 쉬워 d1(.14)보다 조금 좁힌다
MARGIN_RATIO = 0.0          # 가장자리도 허용 — 모델은 추가 사물을 가장자리에 자주 둔다(장난감 기차·자동차). d1 의 가장자리 금지는 inpaint 흔적 때문이었다


class NotEnoughRegions(Exception):
    pass


@dataclass
class Candidate:
    score: float
    center: tuple
    mask: np.ndarray       # 0/255
    source: int            # 몇 번째 편집본인가
    reach: float = 0.0     # 중심에서 가장 먼 픽셀까지(px) — 정답 원끼리 겹치지 않게 고를 때 쓴다


def align(src: np.ndarray, edited: np.ndarray) -> np.ndarray:
    """편집본을 원본 크기·위치에 맞춘다. 비율이 너무 다르면(5% 넘게) 실패."""
    h, w = src.shape[:2]
    eh, ew = edited.shape[:2]
    if abs((ew / eh) - (w / h)) / (w / h) > .05:
        raise NotEnoughRegions(f"편집본 비율이 다름 {ew}x{eh} vs {w}x{h}")
    resized = cv2.resize(edited, (w, h), interpolation=cv2.INTER_CUBIC)
    # ECC 는 작은 그림으로 — 1600px 그대로면 느리고 결과는 같다
    scale = 512 / max(w, h)
    a = cv2.cvtColor(cv2.resize(src, None, fx=scale, fy=scale), cv2.COLOR_BGR2GRAY).astype(np.float32)
    b = cv2.cvtColor(cv2.resize(resized, None, fx=scale, fy=scale), cv2.COLOR_BGR2GRAY).astype(np.float32)
    warp = np.eye(2, 3, dtype=np.float32)
    try:
        cv2.findTransformECC(a, b, warp, cv2.MOTION_AFFINE,
                             (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-5), None, 5)
    except cv2.error:
        return resized
    warp[:, 2] /= scale
    return cv2.warpAffine(resized, warp, (w, h), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP,
                          borderMode=cv2.BORDER_REPLICATE)


def delta_e(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    la = cv2.cvtColor(a, cv2.COLOR_BGR2LAB).astype(np.float32)
    lb = cv2.cvtColor(b, cv2.COLOR_BGR2LAB).astype(np.float32)
    # OpenCV 8bit Lab 은 L 이 0~255 로 늘어나 있다 — 0~100 으로 되돌려 사람 눈의 ΔE 에 가깝게
    la[..., 0] *= 100 / 255
    lb[..., 0] *= 100 / 255
    return np.sqrt(((la - lb) ** 2).sum(axis=2))


def candidates(src: np.ndarray, aligned: np.ndarray, protect, source: int = 0):
    """편집본 한 장의 차이 후보들"""
    h, w = src.shape[:2]
    de = cv2.GaussianBlur(delta_e(src, aligned), (0, 0), 3)
    binary = (de > DELTA_E).astype(np.uint8) * 255
    k = max(3, int(min(h, w) * .006)) | 1
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, np.ones((k, k), np.uint8))
    # 닫기는 작게 — 크게 닫으면 붙어 있는 두 차이(밥그릇과 젓가락)가 한 덩어리로 합쳐진다
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, np.ones((k * 2 - 1, k * 2 - 1), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    margin = int(min(h, w) * MARGIN_RATIO)
    out = []
    for i in range(1, n):
        x, y, bw, bh, _ = stats[i]
        if x < margin or y < margin or x + bw > w - margin or y + bh > h - margin:
            continue
        if max(bw, bh) > MAX_EXTENT * min(h, w):
            continue
        mask = (labels == i).astype(np.uint8) * 255
        if protect is not None:
            overlap = float((protect[mask > 0] > 0).mean())
            if overlap > FACE_OVERLAP_MAX:
                continue
            # 되붙일 때 넓히는 만큼 얼굴 쪽을 더 깎아 둔다 — 경계를 부드럽게 해도 얼굴 픽셀엔 닿지 않게
            guard = cv2.dilate(protect, np.ones((k * 4, k * 4), np.uint8))
            mask[guard > 0] = 0
        area = int((mask > 0).sum())
        frac = area / (h * w)
        if not (MIN_AREA <= frac <= MAX_AREA):
            continue
        mean = float(de[mask > 0].mean())
        if mean < MIN_MEAN_DELTA:
            continue
        ys, xs = np.where(mask > 0)
        cx, cy = float(xs.mean()), float(ys.mean())
        reach = float(np.sqrt(((xs - cx) ** 2 + (ys - cy) ** 2).max()))
        out.append(Candidate(area * mean, (cx, cy), mask, source, reach))
    return out


def choose(cands, count: int, shape):
    """점수 순으로, 서로 떨어진 count 개. 모자라면 NotEnoughRegions.

    떨어짐 = 중심 거리가 최소 거리 이상이고 **두 정답 원이 겹치지 않는다**. 편집본 두 장이 같은 그릇을 각각 바꾸면 덩어리
    중심은 조금 달라도 같은 자리라, 둘 다 고르면 원이 겹치고 바뀐 모습도 두 편집이 섞여 이상해진다(2026-10-15 샘플).
    """
    h, w = shape[:2]
    min_dist = min(h, w) * MIN_DIST_RATIO
    chosen = []
    for c in sorted(cands, key=lambda c: -c.score):
        if all(np.hypot(c.center[0] - u.center[0], c.center[1] - u.center[1]) >= max(min_dist, c.reach + u.reach)
               for u in chosen):
            chosen.append(c)
        if len(chosen) == count:
            return chosen
    raise NotEnoughRegions(f"쓸 만한 차이 {len(chosen)}/{count}개 (후보 {len(cands)})")


def compose(src: np.ndarray, aligned_list, chosen, protect=None):
    """원본에 고른 덩어리만 각자의 편집본을 섞는다 → (B, diffs). diffs 는 d1 과 같은 모양(kind='ai')."""
    h, w = src.shape[:2]
    out = src.astype(np.float32)
    pad = max(5, int(min(h, w) * .006)) | 1
    zones = []
    for c in chosen:
        grown = cv2.dilate(c.mask, np.ones((pad, pad), np.uint8))
        zone = cv2.dilate(grown, np.ones((pad, pad), np.uint8)) > 0
        alpha = cv2.GaussianBlur(grown.astype(np.float32) / 255, (0, 0), pad / 3)
        # 흐림 꼬리를 구역 밖으로 흘리지 않는다 — 구역 밖은 원본 픽셀 그대로여야 정답 원 밖이 정확히 같다
        alpha[~zone] = 0
        if protect is not None:
            alpha[protect > 0] = 0
        out = out * (1 - alpha[..., None]) + aligned_list[c.source].astype(np.float32) * alpha[..., None]
        zones.append(zone)
    b = np.clip(out, 0, 255).astype(np.uint8)
    d = cv2.absdiff(b, src).max(axis=2)
    diffs = []
    for i, zone in enumerate(zones):
        strong = (d > CHANGED_PIXEL) & zone
        ys, xs = np.where(strong)
        if len(xs) == 0:
            raise NotEnoughRegions("되붙인 뒤 바뀐 픽셀이 없음")
        cx, cy = float(xs.mean()), float(ys.mean())      # 중심은 또렷하게 바뀐 곳으로
        ys, xs = np.where((d > 0) & zone)                # 반지름은 희미하게 섞인 가장자리까지 — 원 밖은 원본과 같다
        reach = float(np.sqrt(((xs - cx) ** 2 + (ys - cy) ** 2).max()))
        diffs.append(dict(id=i, kind="ai", cx=cx / w, cy=cy / h, r=float((reach + 6) / max(w, h))))
    return b, diffs

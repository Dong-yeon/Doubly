"""사진 한 장으로 결과를 눈으로 보기(DB·R2 없이) — 시제품 diff_d.py 의 출력과 같은 모양.

  python -m tools.try_photo <사진> <출력폴더> [--seed 7]

<이름>_pair.jpg(A|B), <이름>_answer.jpg(정답 원 + 얼굴 보호 영역 파란 상자), <이름>_layout.json 을 만든다.
"""
import argparse
import json
import os

import cv2
import numpy as np

from spot_worker import faces, images
from spot_worker.generator import generate


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photo")
    ap.add_argument("out_dir")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()

    with open(a.photo, "rb") as f:
        img = images.fit_long_side(images.load_oriented(f.read()))
    boxes = faces.detect(img)
    protect = faces.protect_mask(img.shape, boxes)
    out, diffs = generate(img, a.seed, protect=protect)

    h, w = img.shape[:2]
    os.makedirs(a.out_dir, exist_ok=True)
    base = os.path.join(a.out_dir, os.path.splitext(os.path.basename(a.photo))[0])
    gap = np.full((h, 8, 3), 255, np.uint8)
    cv2.imwrite(base + "_pair.jpg", np.hstack([img, gap, out]))
    ans = out.copy()
    for d in diffs:
        cv2.circle(ans, (int(d["cx"] * w), int(d["cy"] * h)), int(d["r"] * max(w, h)), (0, 0, 255), max(2, w // 300))
    # 얼굴마다 보호 영역(×1.3) 상자 — 합집합의 bbox 로 그리면 실제보다 넓어 보인다
    for box in boxes:
        ys, xs = np.where(faces.protect_mask(img.shape, [box]) > 0)
        cv2.rectangle(ans, (int(xs.min()), int(ys.min())), (int(xs.max()), int(ys.max())), (255, 0, 0), 2)
    cv2.imwrite(base + "_answer.jpg", np.hstack([img, gap, ans]))
    with open(base + "_layout.json", "w") as f:
        json.dump(dict(width=w, height=h, seed=a.seed, faces=boxes, diffs=diffs), f, indent=1)
    print(base, [d["kind"] for d in diffs], "faces:", boxes)


if __name__ == "__main__":
    main()

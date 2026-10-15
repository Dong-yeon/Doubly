"""AI 편집 생성기(d3) 시험 — 사진 한 장으로 결과를 눈으로 본다. GEMINI_IMAGE_API_KEY 가 필요하다(호출 1회 ≈ $0.067).

  python -m tools.try_ai <사진> <출력폴더> [--edited a.jpg b.jpg]   # --edited 를 주면 호출 없이 그 편집본들로

<이름>_edit{n}.jpg(모델 결과), <이름>_pair.jpg(A|B), <이름>_answer.jpg(정답 원·얼굴 보호 상자)
"""
import argparse
import os
import time

import cv2
import numpy as np

from spot_worker import ai_edit, ai_generator, config, faces, images
from spot_worker.generator import GenerationFailed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photo")
    ap.add_argument("out_dir")
    ap.add_argument("--edited", nargs="*", help="이미 받은 편집본(호출 없음)")
    a = ap.parse_args()
    with open(a.photo, "rb") as f:
        img = images.fit_long_side(images.load_oriented(f.read()))
    boxes = faces.detect(img)
    protect = faces.protect_mask(img.shape, boxes)
    os.makedirs(a.out_dir, exist_ok=True)
    base = os.path.join(a.out_dir, os.path.splitext(os.path.basename(a.photo))[0])

    saved = list(a.edited or [])
    calls = []

    def edit(image, attempt=0):
        if saved:
            return cv2.imread(saved.pop(0))
        if a.edited is not None:
            raise ai_edit.AiEditFailed("저장된 편집본을 다 썼다", retryable=False)
        out = ai_edit.edit(image, attempt)
        calls.append(1)
        cv2.imwrite(f"{base}_edit{len(calls)}.jpg", out)
        return out

    t = time.time()
    try:
        b, diffs, used = ai_generator.generate(img, config.DIFF_COUNT, protect, edit=edit)
    except GenerationFailed as e:
        print(base, "FAIL", e, f"{time.time() - t:.1f}s")
        return
    h, w = img.shape[:2]
    gap = np.full((h, 8, 3), 255, np.uint8)
    cv2.imwrite(base + "_pair.jpg", np.hstack([img, gap, b]))
    ans = b.copy()
    for d in diffs:
        cv2.circle(ans, (int(d["cx"] * w), int(d["cy"] * h)), int(d["r"] * max(w, h)), (0, 0, 255), max(2, w // 300))
    for box in boxes:
        ys, xs = np.where(faces.protect_mask(img.shape, [box]) > 0)
        cv2.rectangle(ans, (int(xs.min()), int(ys.min())), (int(xs.max()), int(ys.max())), (255, 0, 0), 2)
    cv2.imwrite(base + "_answer.jpg", np.hstack([img, gap, ans]))
    print(base, "OK", f"편집 {used}회", [round(d["r"], 3) for d in diffs], f"{time.time() - t:.1f}s")


if __name__ == "__main__":
    main()

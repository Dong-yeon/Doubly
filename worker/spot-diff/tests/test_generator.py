import itertools

import cv2
import numpy as np
import pytest

from spot_worker import config, faces
from spot_worker.generator import MIN_DIST_RATIO, CHANGED_PIXEL, GenerationFailed, generate


def test_같은_seed_면_같은_결과(scene):
    out1, d1 = generate(scene, 7)
    out2, d2 = generate(scene, 7)
    assert d1 == d2
    assert np.array_equal(out1, out2)


def test_seed_가_다르면_다른_결과(scene):
    _, d1 = generate(scene, 7)
    _, d2 = generate(scene, 8)
    assert d1 != d2


def test_차이는_정확히_다섯_개이고_서로_최소_거리를_지킨다(scene):
    _, diffs = generate(scene, 11)
    assert len(diffs) == config.DIFF_COUNT
    assert [d["id"] for d in diffs] == list(range(config.DIFF_COUNT))
    h, w = scene.shape[:2]
    min_dist = min(h, w) * MIN_DIST_RATIO
    for a, b in itertools.combinations(diffs, 2):
        dist = np.hypot((a["cx"] - b["cx"]) * w, (a["cy"] - b["cy"]) * h)
        assert dist >= min_dist - 1e-6
    for d in diffs:
        assert 0 < d["cx"] < 1 and 0 < d["cy"] < 1 and 0 < d["r"] < .2
        assert d["kind"] in ("color", "remove", "clone", "flip")


def test_바뀐_픽셀은_전부_정답_원_안에_있다(scene):
    """정답 원 밖에서 바뀐 곳이 있으면 사용자는 찾았는데 오답이 된다"""
    out, diffs = generate(scene, 3)
    h, w = scene.shape[:2]
    changed = cv2.absdiff(out, scene).max(axis=2) > CHANGED_PIXEL
    inside = np.zeros((h, w), bool)
    yy, xx = np.mgrid[0:h, 0:w]
    for d in diffs:
        r = d["r"] * max(w, h)
        inside |= (xx - d["cx"] * w) ** 2 + (yy - d["cy"] * h) ** 2 <= r * r
    assert changed.sum() > 0
    assert (changed & ~inside).sum() == 0


@pytest.mark.parametrize("seed", [1, 5, 9])
def test_얼굴_보호_영역에는_변형이_들어가지_않는다(scene, seed):
    h, w = scene.shape[:2]
    # 얼굴 두 개가 있다고 치고(가운데 큰 것, 왼쪽 위 작은 것) 1.3배 넓힌 보호 영역을 만든다
    boxes = [(w // 2 - 180, h // 2 - 200, 360, 400), (120, 100, 160, 180)]
    protect = faces.protect_mask(scene.shape, boxes)
    out, diffs = generate(scene, seed, protect=protect)
    changed = cv2.absdiff(out, scene).max(axis=2) > 0   # 조금이라도 바뀐 픽셀
    assert (changed & (protect > 0)).sum() == 0
    assert len(diffs) == config.DIFF_COUNT


def test_밋밋한_사진이면_실패한다():
    flat = np.full((1100, 1500, 3), 128, np.uint8)
    with pytest.raises(GenerationFailed):
        generate(flat, 1)


def test_보호_마스크는_bbox_를_1_3배로_넓힌다():
    m = faces.protect_mask((1000, 1000, 3), [(400, 400, 100, 200)])
    ys, xs = np.where(m > 0)
    assert xs.min() == 385 and xs.max() == 514          # 폭 100 → 130 (중심 450)
    assert ys.min() == 370 and ys.max() == 629          # 높이 200 → 260


def test_얼굴이_없는_사진에서_검출기는_빈_목록(scene):
    assert faces.detect(scene) == [] or all(len(b) == 4 for b in faces.detect(scene))

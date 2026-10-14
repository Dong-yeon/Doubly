import numpy as np
import pytest

from conftest import make_scene, to_jpeg
from spot_worker import config, fetch, pipeline


def cand(i):
    return {"type": "POST", "id": i, "url": f"https://res.cloudinary.com/demo/image/upload/v1/fitto/p{i}.jpg"}


class FakeStore:
    """URL → JPEG 바이트. 크기 확인(앞부분)과 전체 받기를 따로 센다"""

    def __init__(self, photos):
        self.photos = photos
        self.heads = []
        self.fulls = []

    def head(self, url):
        self.heads.append(url)
        return self.photos[url][: config.HEADER_BYTES]

    def full(self, url):
        self.fulls.append(url)
        return self.photos[url]


@pytest.fixture(scope="module")
def big_jpeg():
    return to_jpeg(make_scene(5, 1500, 1100))


@pytest.fixture(scope="module")
def small_jpeg():
    return to_jpeg(make_scene(6, 900, 700))       # 짧은 변 700 < 1000


@pytest.fixture(scope="module")
def flat_jpeg():
    return to_jpeg(np.full((1100, 1500, 3), 128, np.uint8))


def no_faces(img):
    return []


def test_조건을_채운_사진이_5장_미만이면_NOT_ENOUGH_PHOTOS(big_jpeg, small_jpeg):
    cands = [cand(i) for i in range(8)]
    photos = {c["url"]: (big_jpeg if i < 4 else small_jpeg) for i, c in enumerate(cands)}
    store = FakeStore(photos)
    out = pipeline.build(cands, 42, store.head, store.full, {}, no_faces)
    assert out.status == "NOT_ENOUGH_PHOTOS"
    assert store.fulls == []                                  # 원본은 하나도 받지 않았다
    assert len(out.new_sizes) == 8                            # 본 크기는 캐시에 남긴다
    assert {(w, h) for _, w, h in out.new_sizes} == {(1500, 1100), (900, 700)}


def test_크기_캐시가_있으면_앞부분도_받지_않는다(big_jpeg):
    cands = [cand(i) for i in range(5)]
    store = FakeStore({c["url"]: big_jpeg for c in cands})
    cached = {c["url"]: (1500, 1100) for c in cands}
    out = pipeline.build(cands, 1, store.head, store.full, cached, no_faces)
    assert out.status == "READY"
    assert store.heads == []
    assert out.new_sizes == []


def test_사진은_되는데_차이를_못_만들면_다른_사진으로_3번까지_그래도_안되면_FAILED(flat_jpeg):
    cands = [cand(i) for i in range(6)]
    store = FakeStore({c["url"]: flat_jpeg for c in cands})
    out = pipeline.build(cands, 9, store.head, store.full, {}, no_faces)
    assert out.status == "FAILED"
    assert len(store.fulls) == config.PHOTOS_PER_JOB
    assert out.reason.count("시드") == config.PHOTOS_PER_JOB * config.SEEDS_PER_PHOTO
    assert len(out.reason) <= 500


def test_첫_사진이_안_되면_다음_사진으로_만든다(flat_jpeg, big_jpeg):
    cands = [cand(i) for i in range(5)]
    store = FakeStore({c["url"]: big_jpeg for c in cands})
    out0 = pipeline.build(cands, 3, store.head, store.full, {}, no_faces)
    first = out0.candidate["url"]
    # 같은 seed 면 같은 순서로 고른다 — 그 첫 사진만 밋밋하게 바꾼다
    store2 = FakeStore({c["url"]: (flat_jpeg if c["url"] == first else big_jpeg) for c in cands})
    out = pipeline.build(cands, 3, store2.head, store2.full, {}, no_faces)
    assert out.status == "READY"
    assert out.candidate["url"] != first
    assert len(store2.fulls) == 2


def test_READY_결과는_재현_정보와_EXIF_없는_두_이미지를_가진다(big_jpeg):
    cands = [cand(i) for i in range(5)]
    store = FakeStore({c["url"]: big_jpeg for c in cands})
    a = pipeline.build(cands, 77, store.head, store.full, {}, no_faces)
    b = pipeline.build(cands, 77, store.head, store.full, {}, no_faces)
    assert a.status == "READY"
    assert (a.width, a.height) == (1500, 1100)
    assert a.layout["diffs"] == b.layout["diffs"]            # 같은 작업 seed → 같은 결과
    assert a.seed == b.seed and a.candidate == b.candidate
    assert a.layout["generator"] == config.GENERATOR_VERSION
    assert len(a.layout["diffs"]) == config.DIFF_COUNT
    assert a.image_a[:2] == b"\xff\xd8" and b"Exif" not in a.image_a[:64] and b"Exif" not in a.image_b[:64]


def test_원본_주소는_https_와_허용_호스트만_받는다():
    fetch.check_url("https://res.cloudinary.com/x/image/upload/a.jpg")
    fetch.check_url("https://media.dubly.co.kr/fitto/a.jpg")
    for bad in ["http://res.cloudinary.com/a.jpg", "https://postgres.railway.internal/a",
                "https://evil.example.com/a.jpg", "file:///etc/passwd", "https://169.254.169.254/latest"]:
        with pytest.raises(ValueError):
            fetch.check_url(bad)

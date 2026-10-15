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


def test_후보는_일상_방문운동_식단_순서로_고르고_같은_순위_안에서만_섞는다():
    cands = ([{"type": "MEAL", "id": i, "url": f"m{i}"} for i in range(5)]
             + [{"type": "WORKOUT", "id": 1, "url": "w1"}, {"type": "PLACE_VISIT", "id": 1, "url": "v1"}]
             + [{"type": "POST", "id": i, "url": f"p{i}"} for i in range(3)])
    order = pipeline.prioritized(cands, 42)
    assert [c["type"] for c in order[:3]] == ["POST"] * 3
    assert {c["type"] for c in order[3:5]} == {"WORKOUT", "PLACE_VISIT"}
    assert [c["type"] for c in order[5:]] == ["MEAL"] * 5
    assert order == pipeline.prioritized(cands, 42)          # 같은 작업 = 같은 순서
    assert order != pipeline.prioritized(cands, 7)           # 시드가 다르면 순위 안 순서가 달라진다


def test_앞_순위에서_5장이_차면_식단_사진은_보지도_않는다(big_jpeg, small_jpeg):
    posts = [{"type": "POST", "id": i, "url": f"https://res.cloudinary.com/demo/image/upload/v1/fitto/p{i}.jpg"} for i in range(5)]
    meals = [{"type": "MEAL", "id": i, "url": f"https://res.cloudinary.com/demo/image/upload/v1/fitto/m{i}.jpg"} for i in range(5)]
    store = FakeStore({c["url"]: big_jpeg for c in posts + meals})
    out = pipeline.build(meals + posts, 5, store.head, store.full, {}, no_faces)
    assert out.status == "READY"
    assert out.candidate["type"] == "POST"
    assert all("/m" not in u for u in store.heads + store.fulls)


def test_AI_경로는_작업_호출_상한을_지키고_실패해도_쓴_호출을_남긴다(big_jpeg):
    cands = [cand(i) for i in range(5)]
    store = FakeStore({c["url"]: big_jpeg for c in cands})
    seen = []

    def weak_edit(img, attempt=0):        # 바꾸는 게 거의 없는 편집 — 차이를 못 채운다
        seen.append(attempt)
        return img.copy()

    out = pipeline.build(cands, 3, store.head, store.full, {}, no_faces, ai_edit=weak_edit, ai_budget=4)
    assert out.status == "FAILED"
    assert out.ai_calls == 4 and len(seen) == 4      # 사진1 3회 + 사진2 1회에서 멈춘다
    assert out.generator == config.AI_GENERATOR_VERSION


def test_AI_경로_성공은_d3_로_기록된다(big_jpeg):
    import cv2
    cands = [cand(i) for i in range(5)]
    store = FakeStore({c["url"]: big_jpeg for c in cands})
    spots = [(250, 250), (750, 220), (1250, 260), (400, 800), (1100, 820)]

    def good_edit(img, attempt=0):
        out = img.copy()
        for (x, y), color in zip(spots, [(255, 0, 0), (0, 0, 255), (0, 255, 0), (0, 255, 255), (255, 0, 255)]):
            cv2.circle(out, (x, y), 45, color, -1)
        return out

    out = pipeline.build(cands, 3, store.head, store.full, {}, no_faces, ai_edit=good_edit, ai_budget=4)
    assert out.status == "READY" and out.ai_calls == 1
    assert out.layout["generator"] == "d3" and len(out.layout["diffs"]) == 5
    assert all(d["kind"] == "ai" for d in out.layout["diffs"])


def test_원본_주소는_https_와_허용_호스트만_받는다():
    fetch.check_url("https://res.cloudinary.com/x/image/upload/a.jpg")
    fetch.check_url("https://media.dubly.co.kr/fitto/a.jpg")
    for bad in ["http://res.cloudinary.com/a.jpg", "https://postgres.railway.internal/a",
                "https://evil.example.com/a.jpg", "file:///etc/passwd", "https://169.254.169.254/latest"]:
        with pytest.raises(ValueError):
            fetch.check_url(bad)

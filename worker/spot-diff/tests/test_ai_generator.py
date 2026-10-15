"""AI 편집 생성기(d3) — 모델 대신 가짜 편집을 끼워 고르기·되붙이기 규칙을 본다(호출 비용 없음)."""
import cv2
import numpy as np
import pytest

from conftest import make_scene
from spot_worker import ai_edit, ai_generator, faces, regions

H, W = 1100, 1500


def fake_edit_factory(scene, plans, noise=2, shift=(0, 0)):
    """plans[k] = k 번째 호출에서 그릴 [(x, y, 반지름, BGR)]. 모델처럼 그림 전체에 약한 잡음을 얹고, 조금 밀리게 할 수 있다."""
    rng = np.random.default_rng(0)
    calls = []

    def edit(img, attempt=0):
        k = len(calls)
        calls.append(attempt)
        out = img.copy()
        for (x, y, r, color) in plans[min(k, len(plans) - 1)]:
            cv2.circle(out, (x, y), r, color, -1)
        out = cv2.add(out, rng.integers(0, noise + 1, out.shape, dtype=np.uint8))
        if shift != (0, 0):
            m = np.float32([[1, 0, shift[0]], [0, 1, shift[1]]])
            out = cv2.warpAffine(out, m, (out.shape[1], out.shape[0]), borderMode=cv2.BORDER_REPLICATE)
        return out
    edit.calls = calls
    return edit


FIVE = [(250, 250, 45, (255, 0, 0)), (750, 220, 45, (0, 0, 255)), (1250, 260, 45, (0, 255, 0)),
        (400, 800, 45, (0, 255, 255)), (1100, 820, 45, (255, 0, 255))]


@pytest.fixture(scope="module")
def scene():
    return make_scene(21, W, H)


def test_다섯_군데만_바뀌고_나머지_픽셀은_원본_그대로(scene):
    edit = fake_edit_factory(scene, [FIVE])
    b, diffs, calls = ai_generator.generate(scene, 5, None, edit=edit)
    assert calls == 1 and len(diffs) == 5
    # 정답 원 밖(조금 넉넉히)은 원본과 한 픽셀도 다르지 않다 — 모델의 전체 잡음이 새지 않는다
    yy, xx = np.mgrid[0:H, 0:W]
    inside = np.zeros((H, W), bool)
    for d in diffs:
        r = d["r"] * max(W, H) + 4
        inside |= (xx - d["cx"] * W) ** 2 + (yy - d["cy"] * H) ** 2 <= r * r
    changed = cv2.absdiff(b, scene).max(axis=2) > 0
    assert (changed & ~inside).sum() == 0
    # 정답 중심이 그린 자리와 맞는다
    for (x, y, _, _) in FIVE:
        assert min(np.hypot(d["cx"] * W - x, d["cy"] * H - y) for d in diffs) < 10


def test_편집본이_조금_밀려도_정렬해서_고른다(scene):
    edit = fake_edit_factory(scene, [FIVE], shift=(5, -4))
    b, diffs, _ = ai_generator.generate(scene, 5, None, edit=edit)
    assert len(diffs) == 5
    # 밀림이 그대로 남았다면 사진 전체 가장자리가 차이로 잡혀 정답 밖 변화가 생긴다
    for (x, y, _, _) in FIVE:
        assert min(np.hypot(d["cx"] * W - x, d["cy"] * H - y) for d in diffs) < 12


def test_얼굴_보호_영역은_한_픽셀도_바뀌지_않는다(scene):
    face = (600, 450, 260, 260)
    protect = faces.protect_mask(scene.shape, [face])
    plan = FIVE + [(730, 580, 60, (0, 0, 0))]          # 얼굴 한가운데를 바꾸는 편집 하나
    edit = fake_edit_factory(scene, [plan])
    b, diffs, _ = ai_generator.generate(scene, 5, protect, edit=edit)
    assert (cv2.absdiff(b, scene).max(axis=2)[protect > 0] > 0).sum() == 0
    assert all(protect[int(d["cy"] * H), int(d["cx"] * W)] == 0 for d in diffs)


def test_한_번에_모자라면_두_번째_편집과_합친다(scene):
    first = FIVE[:3]
    second = [FIVE[3], FIVE[4], (1300, 600, 40, (30, 30, 30))]
    edit = fake_edit_factory(scene, [first, second])
    b, diffs, calls = ai_generator.generate(scene, 5, None, edit=edit)
    assert calls == 2 and len(diffs) == 5
    assert edit.calls == [0, 1]                         # 두 번째 호출은 다른 지시(VARIATIONS[1])로


def test_두_편집이_같은_자리를_바꾸면_원이_겹치지_않게_하나만(scene):
    same = [(250, 250, 45, (255, 0, 0))]
    edit = fake_edit_factory(scene, [same + FIVE[1:3], [(255, 255, 50, (0, 128, 255))] + FIVE[3:]])
    b, diffs, _ = ai_generator.generate(scene, 5, None, edit=edit)
    for i in range(5):
        for j in range(i + 1, 5):
            a, c = diffs[i], diffs[j]
            dist = np.hypot((a["cx"] - c["cx"]) * W, (a["cy"] - c["cy"]) * H)
            assert dist >= (a["r"] + c["r"]) * max(W, H) - 14   # 원끼리 겹치지 않는다(반올림 여유)


def test_호출_상한을_넘지_않고_실패하면_쓴_호출_수를_알려_준다(scene):
    edit = fake_edit_factory(scene, [FIVE[:2]])       # 매번 두 개뿐 — 다섯을 못 채운다
    with pytest.raises(ai_generator.AiGenerationFailed) as e:
        ai_generator.generate(scene, 5, None, edit=edit, max_calls=2)
    assert e.value.calls == 2 and len(edit.calls) == 2


def test_키_문제는_바로_멈추고_안전_필터는_다른_사진으로(scene):
    def no_key(img, attempt=0):
        raise ai_edit.AiEditFailed("HTTP 403: key invalid", retryable=False)

    def unsafe(img, attempt=0):
        raise ai_edit.AiEditFailed("안전 필터: SAFETY", retryable=False)

    with pytest.raises(ai_generator.AiGenerationFailed) as e1:
        ai_generator.generate(scene, 5, None, edit=no_key)
    assert e1.value.calls == 1 and e1.value.stop
    with pytest.raises(ai_generator.AiGenerationFailed) as e2:
        ai_generator.generate(scene, 5, None, edit=unsafe)
    assert not e2.value.stop


def test_너무_크거나_긴_변화와_비율이_다른_편집본은_버린다(scene):
    flat = np.full((H, W, 3), 140, np.uint8)
    huge = flat.copy()
    cv2.circle(huge, (750, 550), 420, (0, 0, 0), -1)   # 사진 3분의 1 — 퍼즐 차이가 아니다
    assert regions.candidates(flat, huge, None) == []
    long_bar = flat.copy()
    cv2.rectangle(long_bar, (100, 500), (1300, 540), (0, 0, 255), -1)   # 붙어 있는 두 차이가 합쳐진 것 같은 긴 덩어리
    assert regions.candidates(flat, long_bar, None) == []
    ok = flat.copy()
    cv2.circle(ok, (750, 550), 50, (0, 0, 255), -1)
    assert len(regions.candidates(flat, ok, None)) == 1
    with pytest.raises(regions.NotEnoughRegions):
        regions.align(scene, cv2.resize(scene, (1000, 1000)))   # 비율이 다른 편집본

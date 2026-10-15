"""작업 하나 처리 — 사진 고르기 → 크기 확인 → 생성. DB·네트워크는 함수로 받아서 테스트가 가짜를 끼운다.

결과는 셋 중 하나다(docs/spot-diff-design_2026-10-14.md 3절).
  READY             — A/B 이미지와 정답
  NOT_ENOUGH_PHOTOS — 짧은 변 1000px 이상인 공유 사진이 5장 미만
  FAILED            — 사진 3장 × 시드 3개를 해 봐도 차이 5개를 못 만듦(사유를 남긴다)
"""
import logging
import random
from dataclasses import dataclass, field
from typing import Callable, Optional

from . import config, faces, images
from .generator import GenerationFailed, generate

log = logging.getLogger(__name__)


@dataclass
class Outcome:
    status: str
    reason: Optional[str] = None
    candidate: Optional[dict] = None
    seed: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    layout: Optional[dict] = None
    image_a: Optional[bytes] = None
    image_b: Optional[bytes] = None
    new_sizes: list = field(default_factory=list)  # [(url, w, h)] — 크기 캐시에 넣을 것


# 사진 출처 우선순위(2026-10-15 사용자 결정) — 일상 → 럽슐랭 방문·공유 운동 → 식단.
# 식단은 하루 2~3장씩 쌓여 그냥 섞으면 퍼즐 대부분이 접시 클로즈업이 된다. 앞 순위에서 조건(짧은 변 1000px)을 채운
# 사진이 5장이 안 될 때만 식단까지 내려간다. 모르는 출처는 맨 뒤.
TYPE_RANK = {"POST": 0, "PLACE_VISIT": 1, "WORKOUT": 1, "MEAL": 2}


def prioritized(candidates: list, job_seed: int) -> list:
    """순위별로 묶고, 같은 순위 안에서만 시드로 섞는다(같은 작업 = 같은 순서)."""
    tiers = {}
    for c in candidates:
        tiers.setdefault(TYPE_RANK.get(c.get("type"), 9), []).append(c)
    order = []
    for rank in sorted(tiers):
        group = list(tiers[rank])
        random.Random(job_seed * 31 + rank).shuffle(group)
        order.extend(group)
    return order


def attempt_seed(job_seed: int, photo_index: int, attempt: int) -> int:
    """시도마다 쓰는 시드 — 작업 시드에서 정해지므로 같은 작업을 다시 돌리면 같은 순서로 같은 결과가 나온다."""
    return (job_seed * 1_000_003 + photo_index * 101 + attempt) % (2 ** 31)


def build(candidates: list, job_seed: int,
          fetch_head: Callable[[str], bytes],
          fetch_full: Callable[[str], bytes],
          cached_sizes: dict,
          detect_faces: Callable = faces.detect) -> Outcome:
    order = prioritized(candidates, job_seed)

    # 1) 크기 — 캐시에 없으면 앞부분만 받아 헤더에서 읽는다. 5장이 모이면 그만 본다(다 받을 필요가 없다)
    qualified, new_sizes = [], []
    for c in order:
        url = c["url"]
        size = cached_sizes.get(url)
        if size is None:
            try:
                size = images.header_size(fetch_head(url)) or (0, 0)
            except Exception as e:  # 못 받은 사진은 이번엔 건너뛴다(캐시하지 않는다 — 일시 장애일 수 있다)
                log.info("크기 확인 실패 %s: %s", url, e)
                continue
            new_sizes.append((url, size[0], size[1]))
        if min(size) >= config.MIN_SHORT_SIDE:
            qualified.append(c)
            if len(qualified) >= config.MIN_PHOTOS:
                break
    if len(qualified) < config.MIN_PHOTOS:
        return Outcome("NOT_ENOUGH_PHOTOS", reason=f"조건을 채운 사진 {len(qualified)}장", new_sizes=new_sizes)

    # 2) 생성 — 사진 하나에 시드 3개, 안 되면 다음 사진(최대 3장)
    reasons = []
    for pi, c in enumerate(qualified[:config.PHOTOS_PER_JOB]):
        try:
            img = images.fit_long_side(images.load_oriented(fetch_full(c["url"])))
        except Exception as e:
            reasons.append(f"사진{pi + 1} 읽기 실패: {e}")
            continue
        protect = faces.protect_mask(img.shape, detect_faces(img))
        for k in range(config.SEEDS_PER_PHOTO):
            seed = attempt_seed(job_seed, pi, k)
            try:
                out, diffs = generate(img, seed, protect=protect)
            except GenerationFailed as e:
                reasons.append(f"사진{pi + 1} 시드{k + 1}: {e}")
                continue
            h, w = img.shape[:2]
            return Outcome(
                "READY", candidate=c, seed=seed, width=w, height=h,
                layout=dict(width=w, height=h, level=config.LEVEL, generator=config.GENERATOR_VERSION, diffs=diffs),
                image_a=images.encode_jpeg(img), image_b=images.encode_jpeg(out), new_sizes=new_sizes)
    return Outcome("FAILED", reason=" / ".join(reasons)[:500] or "만들 수 있는 사진이 없어요", new_sizes=new_sizes)

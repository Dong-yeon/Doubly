"""생성기 d3 — AI 편집(ai_edit) + 차이 고르기(regions). docs/spot-diff-design §9-2 안 B.

편집 한 번에 쓸 만한 차이가 5개 안 나오면 지시를 바꿔(ai_edit.VARIATIONS) 한 번 더 편집해 **여러 장의 후보를 합쳐** 고른다
(서로 떨어져 있으면 함께 쓸 수 있다 — 각 덩어리는 원본 기준이다). 사진 한 장에 최대 MAX_CALLS 번이고, 작업 전체 상한은
호출자(pipeline)가 max_calls 로 준다 — 비용 상한이다(1K ≈ $0.067/회).
"""
from . import ai_edit, regions
from .generator import GenerationFailed

MAX_CALLS = 3


class AiGenerationFailed(GenerationFailed):
    """실패해도 이미 쓴 호출 수를 알려 준다 — 비용은 실패해도 나간다"""

    def __init__(self, reason: str, calls: int, stop: bool = False):
        super().__init__(reason)
        self.calls = calls
        self.stop = stop    # 다른 사진으로 넘어가도 소용없는 실패(키 없음·인증 실패 등)


def generate(img, count, protect=None, edit=ai_edit.edit, max_calls: int = MAX_CALLS):
    """img(BGR) → (B, diffs, 호출 수). 실패하면 AiGenerationFailed(쓴 호출 수 포함)."""
    aligned_list, cands, reasons = [], [], []
    calls = 0
    for attempt in range(min(MAX_CALLS, max_calls)):
        calls += 1
        try:
            edited = edit(img, attempt)
            aligned = regions.align(img, edited)
        except ai_edit.AiEditFailed as e:
            reasons.append(f"편집{calls}: {e}")
            if not e.retryable:
                # 안전 필터 거절은 이 사진만의 문제 — 다른 사진은 된다. 키·인증 문제는 작업을 멈춘다
                raise AiGenerationFailed(" / ".join(reasons), calls, stop="안전 필터" not in str(e))
            continue
        except regions.NotEnoughRegions as e:
            reasons.append(f"편집{calls}: {e}")
            continue
        aligned_list.append(aligned)
        cands += regions.candidates(img, aligned, protect, source=len(aligned_list) - 1)
        try:
            chosen = regions.choose(cands, count, img.shape)
        except regions.NotEnoughRegions as e:
            reasons.append(f"편집{calls}: {e}")
            continue
        out, diffs = regions.compose(img, aligned_list, chosen, protect)
        return out, diffs, calls
    raise AiGenerationFailed(" / ".join(reasons) or "AI 편집 실패", calls)

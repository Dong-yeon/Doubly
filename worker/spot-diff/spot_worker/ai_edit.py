"""Gemini 이미지 편집으로 "바뀐 사진"을 받는다 — 생성기 d3 (2026-10-15, docs/spot-diff-design §9-2 안 B).

superpixel 생성기(d1)는 사물이 아니라 색 조각을 바꿔 "번진 얼룩·미세한 모양 차이"만 만들었다. 사물 단위의 자연스러운 차이
(색이 바뀐 컵, 사라진 토마토, 하나 더 생긴 쿠키)는 이미지 편집 모델이 잘 만든다. 다만 모델은 그림 전체를 미세하게 다시 그리므로
결과를 그대로 쓰지 않는다 — regions.py 가 원본과 맞춰 정렬하고 **크게 바뀐 덩어리만** 원본에 되붙인다.

키·모델은 서버(우리 이모지)와 같은 결제 키를 쓴다: GEMINI_IMAGE_API_KEY, GEMINI_IMAGE_MODEL.
해상도가 곧 단가다(1K ≈ $0.067/장, application.yml 주석) — 퍼즐은 512px 로는 너무 작아 1K.
"""
import base64

import cv2
import numpy as np
import requests

from .storage import env

API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEFAULT_MODEL = "gemini-3.1-flash-image"
IMAGE_SIZE = "1K"
TIMEOUT = 150

# 바꿀 개수를 넉넉히(6~7) 시킨다 — 몇 개는 너무 작거나 얼굴 근처라 버려지므로, 그 가운데서 5개를 고른다
PROMPT = """You are making a "spot the difference" puzzle from this photo.
Edit the photo to introduce 7 separate differences. Rules:
- Each difference changes ONE distinct object. Make every change BOLD and high-contrast so it is easy to notice side by side:
  recolor the object to a strongly contrasting color (e.g. red to blue, white to black), remove the object completely,
  or add a new, clearly contrasting small object that fits the scene.
- Spread the differences across the whole picture, far apart from each other, and away from people's heads.
- Each difference should cover roughly 1% to 4% of the picture area. No tiny details, no huge areas, no long thin objects.
- Do NOT touch any person's face, hair, skin or expression. Do NOT change clothing patterns, textures or fabric. Do NOT add or remove people. Do NOT add text.
- Keep everything else exactly the same: same framing, composition, camera angle, lighting, colors, sharpness and image size. Do not crop, zoom, rotate or restyle.
Return only the edited photo."""


# 두 번째·세 번째 호출에 덧붙이는 말 — 같은 지시를 반복하면 모델이 같은 사물(가장 눈에 띄는 그릇)을 또 바꿔
# 후보가 겹친다(2026-10-15 음식 샘플). 다른 자리를 바꾸도록 방향을 돌린다.
VARIATIONS = [
    "",
    "\nThis time, leave the main objects unchanged. Instead ADD several new small, contrasting objects in empty areas"
    " (empty table, floor, wall, sky, background), and change small background items.",
    "\nThis time, do NOT change the largest or most noticeable objects. Change smaller secondary objects and details"
    " elsewhere in the picture.",
]


class AiEditFailed(Exception):
    def __init__(self, reason: str, retryable: bool = True):
        super().__init__(reason)
        self.retryable = retryable


def configured() -> bool:
    return bool(env("GEMINI_IMAGE_API_KEY"))


def edit(img: np.ndarray, attempt: int = 0) -> np.ndarray:
    """BGR 원본 → 편집된 BGR(모델이 준 크기 그대로 — 정렬은 regions.align). attempt 마다 지시를 조금 바꾼다."""
    key = env("GEMINI_IMAGE_API_KEY")
    if not key:
        raise AiEditFailed("GEMINI_IMAGE_API_KEY 없음", retryable=False)
    model = env("GEMINI_IMAGE_MODEL", DEFAULT_MODEL)
    ok, jpg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if not ok:
        raise AiEditFailed("원본 인코딩 실패", retryable=False)
    body = {
        "contents": [{"parts": [
            {"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(jpg.tobytes()).decode()}},
            {"text": PROMPT + VARIATIONS[attempt % len(VARIATIONS)]},
        ]}],
        "generationConfig": {"responseModalities": ["IMAGE"], "temperature": 0.6,
                             "imageConfig": {"imageSize": IMAGE_SIZE}},
    }
    try:
        r = requests.post(API.format(model=model), params={"key": key}, json=body, timeout=TIMEOUT)
    except requests.RequestException as e:
        raise AiEditFailed(f"요청 실패: {type(e).__name__}")
    if r.status_code != 200:
        # 키가 응답에 섞여 나오지 않게 본문 앞부분만, 상태 코드와 함께
        raise AiEditFailed(f"HTTP {r.status_code}: {r.text[:200]}", retryable=r.status_code in (429, 500, 502, 503, 504))
    root = r.json()
    block = root.get("promptFeedback", {}).get("blockReason")
    if block:
        raise AiEditFailed(f"안전 필터: {block}", retryable=False)
    for cand in root.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            data = part.get("inlineData", {}).get("data")
            if data:
                out = cv2.imdecode(np.frombuffer(base64.b64decode(data), np.uint8), cv2.IMREAD_COLOR)
                if out is None:
                    raise AiEditFailed("결과 이미지 디코딩 실패")
                return out
    reason = ",".join(c.get("finishReason", "?") for c in root.get("candidates", [])) or "이미지 없음"
    raise AiEditFailed(f"이미지 없는 응답({reason})", retryable=reason not in ("SAFETY", "PROHIBITED_CONTENT", "IMAGE_SAFETY"))

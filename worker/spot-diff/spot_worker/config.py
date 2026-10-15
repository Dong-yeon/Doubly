"""틀린그림찾기 worker 상수 — docs/spot-diff-design_2026-10-14.md.

서버(Spring) 쪽 상수는 backend 의 SpotDiffRules.java 에 있다. 둘이 같이 봐야 하는 값은 DIFF_COUNT 하나다.
"""

GENERATOR_VERSION = "d1"  # 생성 규칙을 바꾸면 올린다 — 퍼즐 행에 남아 재현할 때 어느 규칙이었는지 알 수 있다

DIFF_COUNT = 5            # SpotDiffRules.DIFF_COUNT 와 같아야 한다
LEVEL = "normal"

MIN_PHOTOS = 5            # 조건을 채우는 사진이 이보다 적으면 NOT_ENOUGH_PHOTOS
MIN_SHORT_SIDE = 1000     # 원본 짧은 변(px, EXIF 방향 적용 후)
LONG_SIDE = 1600          # 결과 이미지 긴 변
JPEG_QUALITY = 88

SEEDS_PER_PHOTO = 3       # 한 사진에서 시드를 바꿔 다시 해 보는 횟수
PHOTOS_PER_JOB = 3        # 그래도 안 되면 다른 사진으로 바꿔 보는 횟수

FACE_EXPAND = 1.3         # 얼굴 bbox 를 이만큼 넓힌 영역에는 변형하지 않는다

HEADER_BYTES = 256 * 1024  # 크기 확인용으로 받는 앞부분 — JPEG 의 EXIF(최대 64KB)와 SOF 가 들어간다
MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
HTTP_TIMEOUT = 20

STALE_RUNNING_MINUTES = 15  # RUNNING 인 채 이보다 오래된 작업은 worker 가 죽은 것으로 보고 다시 집는다
MAX_ATTEMPTS = 3            # 작업을 집은 횟수 상한 — 넘으면 FAILED
RUN_BUDGET_SECONDS = 240    # cron 한 번에 쓰는 시간(5분 주기보다 짧게)

SIZE_CACHE_DAYS = 90        # spot_photo_sizes 를 이보다 오래 두지 않는다

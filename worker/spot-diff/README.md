# 틀린그림찾기 생성 worker

커플의 공유 사진 한 장에서 "원본(A) / 다섯 군데 바꾼 사진(B)"을 만든다. 설계는 `docs/spot-diff-design_2026-10-14.md`.
생성 규칙은 시제품 `prototype/diff_d.py`(D 방식: SLIC superpixel + color/remove/clone/flip)를 `spot_worker/generator.py` 로
옮긴 것이고, 얼굴 보호와 저장 중심 기준 최소 거리를 더했다.

```
Spring (KST 0시 / 목록을 열 때)          worker (5분마다)                       R2
spot_puzzles  PENDING  ───────────┐     claim: FOR UPDATE SKIP LOCKED
spot_puzzle_jobs QUEUED (후보 목록) ┴──▶ 크기 확인(spot_photo_sizes 캐시)
                                        생성(사진 3장 × 시드 3개)  ─────────▶ {루트}/spot-diff/{초}-{무작위}.jpg ×2
spot_puzzles READY + layout_json ◀───── 결과 쓰기 (PENDING 일 때만)
```

worker 는 **DB 와 R2, 원본 사진 주소(res.cloudinary.com·media.dubly.co.kr)에만** 접근한다. 원본 주소는 https + 허용 호스트만
받는다(`fetch.py` — 사설망의 다른 서비스를 두드리지 못하게).

## 운영 (Railway Cron 서비스)

1. 같은 프로젝트에 새 서비스 → 이 저장소 연결
   - **Root Directory**: `worker/spot-diff` (Dockerfile 을 자동으로 쓴다)
   - **Watch Paths**: `/worker/spot-diff/**` — 백엔드 배포와 서로 다시 빌드하지 않게
   - **Cron Schedule**: `*/5 * * * *` (UTC 기준이지만 5분 주기라 상관없다)
   - Restart Policy: Never(끝나는 게 정상이다)
2. 환경 변수

| 이름 | 값 | 비고 |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | 사설망 주소면 egress 비용이 없다 |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | 백엔드 서비스와 같은 값 | 쓰기 권한 필요 |
| `R2_PUBLIC_BASE_URL` | `https://media.dubly.co.kr` | 백엔드 `r2.public-base-url` 과 같아야 서버가 지운다 |
| `CLOUDINARY_FOLDER` | 백엔드와 같은 값(기본 `fitto`) | R2 키의 루트 폴더 — 서버 삭제기가 "우리 파일"로 알아보는 기준 |
| `SPOT_ALLOWED_HOSTS` | (선택) 기본 `res.cloudinary.com,media.dubly.co.kr` | 원본 사진을 받을 호스트 |

3. 배포 순서: **서버(V143) → worker → 앱**. worker 가 먼저 뜨면 테이블이 없어 실패한다.

R2 폴더는 따로 만들 필요가 없다(키 접두어일 뿐이다). Cloudinary 에는 아무것도 올리지 않는다.

## 로컬

```bash
# 단위 테스트 — Docker 로 운영과 같은 파이썬에서
docker run --rm -v "$PWD":/app -w /app python:3.12-slim sh -c "pip install -q -r requirements-dev.txt && pytest -q"

# PostgreSQL 대기열 테스트까지(SKIP LOCKED) — 접속 문자열을 주면 돈다
SPOT_TEST_DATABASE_URL=postgresql://... pytest -q tests/test_jobs_pg.py

# 사진 한 장으로 결과 보기(DB·R2 없이)
python -m tools.try_photo <사진> <출력폴더> [--seed 7]
```

## 결과가 달라지는 변경

`generator.py`·`images.py`·`requirements.txt` 의 OpenCV/scikit-image 버전을 바꾸면 같은 seed 라도 결과가 달라질 수 있다.
그때는 `config.GENERATOR_VERSION` 을 올린다(퍼즐 행에 남아 어느 규칙으로 만든 판인지 알 수 있다).

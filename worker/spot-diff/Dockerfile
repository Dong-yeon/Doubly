# 틀린그림찾기 생성 worker — Railway Cron 서비스용 이미지 (docs/spot-diff-design_2026-10-14.md, README.md)
#
# Railway 서비스 설정: Root Directory = worker/spot-diff, Cron Schedule = */5 * * * *
# 컨테이너는 대기 작업을 처리하고 종료한다(상주하지 않는다 — Railway 비용은 메모리 × 시간이라 일할 때만 낸다).

# 파이썬 3.12 슬림 이미지 — requirements.txt 의 바이너리 휠(OpenCV·scikit-image·numpy)이 모두 이 버전용으로 나와 있다
FROM python:3.12-slim

# .pyc 파일을 만들지 않는다(한 번 돌고 끝나는 컨테이너라 캐시가 쓸모없다)
ENV PYTHONDONTWRITEBYTECODE=1
# 로그를 버퍼에 쌓지 않고 바로 내보낸다 — 실행이 끝나기 전에 죽어도 Railway 로그에 남게
ENV PYTHONUNBUFFERED=1
# OpenCV·numpy 가 코어 수만큼 스레드를 띄우지 않게 한다(작은 컨테이너에서 메모리·문맥 전환만 늘어난다)
ENV OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1

# 작업 폴더 — 아래 COPY 와 실행이 모두 여기 기준이다
WORKDIR /app

# 의존성 먼저 설치 — 코드만 바뀐 배포에서는 이 층을 캐시로 재사용한다. --no-cache-dir 로 pip 캐시를 이미지에 남기지 않는다
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# worker 코드만 넣는다(tests·prototype 은 이미지에 필요 없다)
COPY spot_worker ./spot_worker

# root 가 아닌 사용자로 실행한다 — 이 컨테이너는 외부 사진을 받아 디코딩하므로 권한을 최소로
RUN useradd --create-home --uid 10001 worker
USER worker

# 대기 작업을 처리하고 끝낸다. 로컬에서 계속 돌리려면 `--loop` 를 붙인다
CMD ["python", "-m", "spot_worker.main"]

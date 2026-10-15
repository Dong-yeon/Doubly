"""틀린그림찾기 worker 진입점.

  python -m spot_worker.main          # 대기 작업을 처리하고 끝낸다(Railway Cron 이 5분마다 띄운다)
  python -m spot_worker.main --loop   # 로컬 — 끝내지 않고 30초마다 다시 본다

환경 변수: DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
          R2_PUBLIC_BASE_URL(기본 https://media.dubly.co.kr), CLOUDINARY_FOLDER(기본 fitto),
          SPOT_ALLOWED_HOSTS(기본 res.cloudinary.com,media.dubly.co.kr). 자세한 건 README.md.
"""
import argparse
import logging
import sys
import time

import psycopg

from . import config, fetch, jobs, pipeline
from .storage import R2Uploader, require

log = logging.getLogger("spot_worker")


def process(conn, job, uploader):
    sizes = jobs.cached_sizes(conn, [c["url"] for c in job.candidates])
    outcome = pipeline.build(job.candidates, job.seed, fetch.head_bytes, fetch.full_bytes, sizes)
    jobs.save_sizes(conn, outcome.new_sizes)
    if outcome.status != "READY":
        jobs.finish_status(conn, job, outcome.status, outcome.reason)
        log.info("puzzle=%s %s (%s)", job.puzzle_id, outcome.status, outcome.reason)
        return outcome.status
    a_url = uploader.put_jpeg(outcome.image_a)
    b_url = uploader.put_jpeg(outcome.image_b)
    if not jobs.finish_ready(conn, job, outcome, a_url, b_url):
        # 그사이 퍼즐이 닫혔다(관계 삭제 등) — 아무도 가리키지 않을 이미지를 남기지 않는다
        for u in (a_url, b_url):
            try:
                uploader.delete(u)
            except Exception as e:
                log.warning("버린 이미지 삭제 실패 %s: %s", u, e)
        return "DISCARDED"
    log.info("puzzle=%s READY photo=%s:%s seed=%s", job.puzzle_id, outcome.candidate["type"],
             outcome.candidate["id"], outcome.seed)
    return "READY"


def run_once(conn, uploader, budget=config.RUN_BUDGET_SECONDS):
    started = time.monotonic()
    done = 0
    while time.monotonic() - started < budget:
        job = jobs.claim(conn)
        if job is None:
            break
        try:
            process(conn, job, uploader)
        except Exception as e:
            log.exception("puzzle=%s 처리 중 오류 — 다시 대기열로", job.puzzle_id)
            jobs.release(conn, job, e)
        done += 1
    jobs.prune_sizes(conn)
    return done


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--loop", action="store_true")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s", stream=sys.stdout)

    uploader = R2Uploader()
    with psycopg.connect(require("DATABASE_URL"), autocommit=True) as conn:
        while True:
            n = run_once(conn, uploader)
            log.info("작업 %d건 처리", n)
            if not args.loop:
                return 0
            time.sleep(30)


if __name__ == "__main__":
    sys.exit(main())

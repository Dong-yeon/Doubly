"""틀린그림찾기 worker 진입점.

  python -m spot_worker.main          # 대기 작업을 처리하고 끝낸다(Railway Cron 이 5분마다 띄운다)
  python -m spot_worker.main --loop   # 로컬 — 끝내지 않고 30초마다 다시 본다

환경 변수: DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
          R2_PUBLIC_BASE_URL(기본 https://media.dubly.co.kr), CLOUDINARY_FOLDER(기본 fitto),
          SPOT_ALLOWED_HOSTS(기본 res.cloudinary.com,media.dubly.co.kr).
          AI 생성기(d3): SPOT_AI_ENABLED=true + GEMINI_IMAGE_API_KEY(+ GEMINI_IMAGE_MODEL),
          SPOT_AI_DAILY_CALL_LIMIT(기본 200). 자세한 건 README.md.
"""
import argparse
import logging
import sys
import time

import psycopg

from . import ai_edit, config, fetch, jobs, pipeline
from .storage import R2Uploader, env, require

log = logging.getLogger("spot_worker")

DEFERRED = "DEFERRED"


def ai_enabled() -> bool:
    return env("SPOT_AI_ENABLED").lower() in ("1", "true", "yes") and ai_edit.configured()


def ai_daily_limit() -> int:
    try:
        return int(env("SPOT_AI_DAILY_CALL_LIMIT", str(config.AI_DAILY_CALL_LIMIT)))
    except ValueError:
        return config.AI_DAILY_CALL_LIMIT


def process(conn, job, uploader):
    sizes = jobs.cached_sizes(conn, [c["url"] for c in job.candidates])
    edit, budget = None, 0
    if ai_enabled():
        used = jobs.ai_calls_last_day(conn)
        limit = ai_daily_limit()
        if used >= limit:
            # 비용 안전장치 — 오늘은 더 만들지 않는다. 작업은 대기열로 돌려 24시간 창이 비면 다시 집는다
            jobs.defer(conn, job, f"AI 일일 호출 상한 {used}/{limit}")
            log.warning("AI 일일 호출 상한 %d/%d — puzzle=%s 미룸", used, limit, job.puzzle_id)
            return DEFERRED
        edit, budget = ai_edit.edit, min(config.AI_CALLS_PER_JOB, limit - used)
    outcome = pipeline.build(job.candidates, job.seed, fetch.head_bytes, fetch.full_bytes, sizes,
                             ai_edit=edit, ai_budget=budget)
    jobs.record_ai_calls(conn, job, outcome.ai_calls)
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
    log.info("puzzle=%s READY photo=%s:%s seed=%s generator=%s ai_calls=%d", job.puzzle_id, outcome.candidate["type"],
             outcome.candidate["id"], outcome.seed, outcome.generator, outcome.ai_calls)
    return "READY"


def run_once(conn, uploader, budget=config.RUN_BUDGET_SECONDS):
    started = time.monotonic()
    done = 0
    while time.monotonic() - started < budget:
        job = jobs.claim(conn)
        if job is None:
            break
        try:
            if process(conn, job, uploader) == DEFERRED:
                break
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

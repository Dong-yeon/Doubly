"""DB — 작업 집기(SKIP LOCKED)·퍼즐 결과 쓰기·크기 캐시. PostgreSQL 전용(운영 DB 에만 붙는다).

Flyway 의 "H2 와 같이 돌 것" 규칙은 마이그레이션에만 걸린다 — worker SQL 은 PostgreSQL 문법(SKIP LOCKED·ON CONFLICT)을 쓴다.
테이블 정의는 backend/src/main/resources/db/migration/V143__spot_diff.sql.
"""
import json
from dataclasses import dataclass

from psycopg.rows import dict_row

from . import config


@dataclass
class Job:
    id: int
    puzzle_id: int
    candidates: list
    seed: int
    attempts: int


def claim(conn):
    """대기 작업 하나를 집는다. 다른 worker 가 잠근 행은 건너뛴다(SKIP LOCKED) — cron 실행이 겹쳐도 같은 작업을 두 번 하지 않는다.

    RUNNING 인 채 오래된 작업(worker 가 죽었다)도 다시 집는다. 집은 횟수가 상한을 넘은 작업은 FAILED 로 닫는다.
    """
    while True:
        with conn.transaction(), conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select id, puzzle_id, candidates, seed, attempts from spot_puzzle_jobs
                where status = 'QUEUED'
                   or (status = 'RUNNING' and locked_at < now() - make_interval(mins => %s))
                order by created_at, id
                limit 1
                for update skip locked
                """,
                (config.STALE_RUNNING_MINUTES,))
            row = cur.fetchone()
            if row is None:
                return None
            if row["attempts"] >= config.MAX_ATTEMPTS:
                _close(cur, row["id"], row["puzzle_id"], "FAILED", "FAILED", "작업을 여러 번 시도했지만 끝내지 못했어요")
                continue
            cur.execute("update spot_puzzle_jobs set status = 'RUNNING', locked_at = now(), attempts = attempts + 1, "
                        "updated_at = now() where id = %s", (row["id"],))
            return Job(row["id"], row["puzzle_id"], json.loads(row["candidates"]), row["seed"], row["attempts"] + 1)


def cached_sizes(conn, urls):
    if not urls:
        return {}
    with conn.cursor() as cur:
        cur.execute("select url, width, height from spot_photo_sizes where url = any(%s)", (list(urls),))
        return {u: (w, h) for u, w, h in cur.fetchall()}


def save_sizes(conn, entries):
    if not entries:
        return
    with conn.transaction(), conn.cursor() as cur:
        cur.executemany(
            "insert into spot_photo_sizes (url, width, height, checked_at) values (%s, %s, %s, now()) "
            "on conflict (url) do update set width = excluded.width, height = excluded.height, checked_at = now()",
            entries)


def finish_ready(conn, job, outcome, a_url, b_url):
    """READY 로 바꾼다 — 퍼즐이 아직 PENDING 일 때만(그사이 만료·삭제됐으면 False: 올린 이미지는 호출자가 지운다)."""
    c = outcome.candidate
    with conn.transaction(), conn.cursor() as cur:
        cur.execute(
            """
            update spot_puzzles set status = 'READY', source_type = %s, source_id = %s, source_url = %s,
                   image_a_url = %s, image_b_url = %s, width = %s, height = %s, layout_json = %s,
                   seed = %s, level = %s, generator_version = %s, fail_reason = null, updated_at = now()
            where id = %s and status = 'PENDING'
            """,
            (c["type"], c["id"], c["url"], a_url, b_url, outcome.width, outcome.height,
             json.dumps(outcome.layout), outcome.seed, config.LEVEL, config.GENERATOR_VERSION, job.puzzle_id))
        ok = cur.rowcount == 1
        cur.execute("update spot_puzzle_jobs set status = 'DONE', error = %s, updated_at = now() where id = %s",
                    (None if ok else "퍼즐이 더는 PENDING 이 아니라 결과를 버렸어요", job.id))
        return ok


def finish_status(conn, job, status, reason):
    """NOT_ENOUGH_PHOTOS / FAILED — 퍼즐이 아직 PENDING 일 때만 바꾼다."""
    with conn.transaction(), conn.cursor() as cur:
        _close(cur, job.id, job.puzzle_id, status, "DONE" if status == "NOT_ENOUGH_PHOTOS" else "FAILED", reason)


def release(conn, job, error):
    """뜻밖의 오류 — 다시 대기열로(다음 실행이 집는다). 횟수 상한은 claim 이 본다."""
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("update spot_puzzle_jobs set status = 'QUEUED', locked_at = null, error = %s, updated_at = now() "
                    "where id = %s", (str(error)[:500], job.id))


def prune_sizes(conn):
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("delete from spot_photo_sizes where checked_at < now() - make_interval(days => %s)",
                    (config.SIZE_CACHE_DAYS,))


def _close(cur, job_id, puzzle_id, puzzle_status, job_status, reason):
    cur.execute("update spot_puzzles set status = %s, fail_reason = %s, updated_at = now() "
                "where id = %s and status = 'PENDING'", (puzzle_status, (reason or "")[:500], puzzle_id))
    cur.execute("update spot_puzzle_jobs set status = %s, error = %s, updated_at = now() where id = %s",
                (job_status, (reason or "")[:500], job_id))

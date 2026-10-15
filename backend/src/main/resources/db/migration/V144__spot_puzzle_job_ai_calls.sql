-- 틀린그림찾기 AI 편집 호출 수 (2026-10-15) — docs/spot-diff-design_2026-10-14.md §9-2 안 B
--
-- worker 가 작업마다 Gemini 이미지 편집을 몇 번 불렀는지 남긴다. 최근 24시간 합계가 상한(SPOT_AI_DAILY_CALL_LIMIT)을 넘으면
-- worker 가 새 생성을 멈춘다 — 이미지 편집은 호출마다 돈이 나가는(1K ≈ $0.067) 유일한 경로라 비용 안전장치다.
-- 엔티티(SpotPuzzleJob)에는 매핑하지 않는다 — 서버는 이 값을 읽지 않는다(validate 는 남는 컬럼을 문제 삼지 않는다).
ALTER TABLE spot_puzzle_jobs ADD COLUMN ai_calls INTEGER NOT NULL DEFAULT 0;

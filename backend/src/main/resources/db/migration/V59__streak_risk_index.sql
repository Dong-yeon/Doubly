-- 21시 스트릭 위기 리마인드(StreakRiskNotifier)가 매일 도는 조회
-- (streak_type, last_workout_date 로 필터) 를 커버하는 인덱스.
-- 기존 idx_streaks_user(user_id)/idx_streaks_relation(relation_id) 로는 이 조회가
-- 시퀀셜 스캔이 된다 — 지금 규모에선 무해하지만 스케줄러가 매일 도는 쿼리라 미리 잡아둔다.
CREATE INDEX idx_streaks_type_last_workout ON streaks (streak_type, last_workout_date);

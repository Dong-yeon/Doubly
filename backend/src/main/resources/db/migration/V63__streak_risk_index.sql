-- 재방문 리마인드의 스트릭 위기 조회(ReengagementNotifier — 매일 21:00 KST)를 커버하는 인덱스.
--
-- StreakRepository.findPersonalAtRisk 는 streak_type IN (...) AND last_workout_date = ? 로
-- 훑는데, 기존 인덱스는 idx_streaks_user(user_id) / idx_streaks_relation(relation_id) 뿐이라
-- 이 조회가 시퀀셜 스캔이 된다. 지금 규모에선 무해하지만 스케줄러가 매일 도는 쿼리이고
-- streaks 는 사용자 수에 비례해 계속 자라므로 미리 잡아둔다.
CREATE INDEX idx_streaks_type_last_workout ON streaks (streak_type, last_workout_date);

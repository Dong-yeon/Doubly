-- 식단 목표 방향(감량·유지·증량) — 지금까지는 목표 칼로리 자동 계산 마법사가 계산에만 쓰고 버렸다.
-- 그래서 앱은 이 사람이 감량 중인지 증량 중인지 몰랐다(docs/LOVEBODY_REVIEW_2026-10-02.md §2-1-1).
-- NULL = 미설정. 값은 DietGoalType(LOSE / MAINTAIN / GAIN) 이름 그대로.
ALTER TABLE nutrition_goals ADD COLUMN goal_direction VARCHAR(10);

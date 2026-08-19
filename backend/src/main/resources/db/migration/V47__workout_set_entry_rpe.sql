-- 세트 실기록에 RPE(자각 강도, Rate of Perceived Exertion) 컬럼 추가.
-- 1.0~10.0, 보통 0.5 단위로 기록하지만 값 자체를 강제하진 않고 범위만 검증한다
-- (weight_kg 도 같은 이유로 별도 step 제약이 없다 — 기존 패턴 유지).
ALTER TABLE workout_set_entries ADD COLUMN rpe DECIMAL(3, 1);
ALTER TABLE workout_set_entries ADD CONSTRAINT chk_workout_set_entries_rpe_range
    CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10));

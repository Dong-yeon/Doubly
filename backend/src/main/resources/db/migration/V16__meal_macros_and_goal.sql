-- 식단 매크로 저장 + 영양 목표 (목표 대비 남은 양 대시보드)
ALTER TABLE meals ADD COLUMN carbs   INTEGER;
ALTER TABLE meals ADD COLUMN protein INTEGER;
ALTER TABLE meals ADD COLUMN fat     INTEGER;

CREATE TABLE nutrition_goals (
    user_id         BIGINT    PRIMARY KEY REFERENCES users (id),
    target_calories INTEGER,
    target_carbs    INTEGER,
    target_protein  INTEGER,
    target_fat      INTEGER,
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

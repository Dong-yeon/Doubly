-- 데이트 식단(같이 먹기) — 한 사람이 등록하면 파트너 몫도 절반 칼로리로 자동 등록된다.
-- shared_group_id 로 커플 양쪽 레코드를 묶고(짝 찾기용), created_by 로 실제 등록한 사람을
-- 남긴다 — 내 명의가 아닌 기록이 생기는 첫 번째 경로라 감사(audit) 목적으로 필요하다.
ALTER TABLE meals ADD COLUMN shared_group_id VARCHAR(36);
ALTER TABLE meals ADD COLUMN created_by BIGINT REFERENCES users (id);
CREATE INDEX idx_meals_shared_group_id ON meals (shared_group_id);

-- mood_statuses.couple_emoji_id(V81) 는 FK 인데 인덱스가 없었다. couple_emojis 행을 지울 때
-- (트레이에서 숨기기가 아니라 관계 삭제·탈퇴의 Purger) PostgreSQL 이 참조 무결성을 확인하려고
-- mood_statuses 를 지우는 행마다 순차 스캔한다 — 무드는 전 커플이 누적되는 원장이라 커진다
-- (2026-09-08 점검 #16). 대부분 NULL 인 컬럼이지만 B-tree 는 NULL 도 담으므로 조건 없이 건다.
-- (H2 호환 구문만 사용 — 테스트가 동일 마이그레이션을 적용한다)
CREATE INDEX idx_mood_statuses_couple_emoji ON mood_statuses (couple_emoji_id);

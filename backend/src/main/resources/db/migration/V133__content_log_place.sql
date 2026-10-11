-- 관람 기록에 "어디서 봤어요?"(선택) — 저장된 장소(places) 하나를 가리킨다.
-- 설계: docs/LOVELICHELIN_AI_COURSE_2026-10-07.md §5(3단계 관람 장소 연결)
--
-- 장소·콘텐츠 테이블은 합치지 않는다. 관람 기록 쪽에서 장소를 선택적으로 가리킬 뿐이다.
-- ON DELETE SET NULL: 장소를 지워도 관람 기록은 남는다(어디서 봤는지만 잊는다).
-- 관계 단위 삭제(RelationRecordPurger)는 content_logs 를 places 보다 먼저 지운다(자식 → 부모).
-- H2·PostgreSQL 공통 문법만(CLAUDE.md 4절). V121(journal_entries.shared_post_id)과 같은 모양.
-- 롤백: alter table content_logs drop constraint fk_content_logs_place; drop index idx_content_logs_place; alter table content_logs drop column place_id;
ALTER TABLE content_logs ADD COLUMN place_id BIGINT;
ALTER TABLE content_logs
    ADD CONSTRAINT fk_content_logs_place FOREIGN KEY (place_id) REFERENCES places (id) ON DELETE SET NULL;
-- 장소 상세 "여기서 본 것" — place_id 로 찾는다
CREATE INDEX idx_content_logs_place ON content_logs (place_id);

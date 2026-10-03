-- V121 — 하루 기록 → 일상 공유(1차-b, docs/PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md §1-1·§4-3)
--
-- 공유는 원본을 가리키지 않는 독립된 복사본(feed_posts 한 행 + 서버가 복사한 사진)이다. 여기 남기는 건
-- "이 기록은 이미 공유했다 — 그 글은 이것"뿐이다. 한 기록에서 공유는 한 번만(서버 측 사진 복사의 상한).
--
-- ON DELETE SET NULL: 피드 글은 "지난 기록 삭제"(RelationRecordPurger)·고치기 화면의 삭제로 지워질 수 있다.
-- 그냥 FK 면 그 삭제가 막히고, FK 가 없으면 사라진 글을 가리킨다. 지워지면 다시 공유할 수 있게 된다.
ALTER TABLE journal_entries ADD COLUMN shared_post_id BIGINT;
ALTER TABLE journal_entries
    ADD CONSTRAINT fk_journal_entries_shared_post FOREIGN KEY (shared_post_id) REFERENCES feed_posts (id) ON DELETE SET NULL;

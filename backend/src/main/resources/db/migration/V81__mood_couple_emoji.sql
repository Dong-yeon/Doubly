-- 무드에 우리 이모지 쓰기 — docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §7 "2단계 — 무드 연동".
--
-- mood_statuses.emoji 는 VARCHAR(10) 이라 Cloudinary URL 이 들어가지 않는다. 컬럼을 늘리는 대신
-- 참조를 붙인다 — 있으면 이미지로, 없으면 예전처럼 유니코드로 그린다.
--
-- emoji 는 NOT NULL 을 그대로 유지한다. 우리 이모지를 골라도 서버가 감정에 대응하는 유니코드를
-- 함께 저장하므로, 푸시 미리보기("지금 기분: 😤")와 이 컬럼을 모르는 화면이 계속 읽을 수 있다
-- (StickerPack 이 코드가 아니라 이모지 문자를 그대로 저장하는 것과 같은 이유).
--
-- 삭제 순서 주의: RelationRecordPurger 가 mood_statuses 를 couple_emojis 보다 먼저 지운다.
-- 이 FK 때문에 그 순서가 이제 필수다 — 뒤집으면 관계 삭제가 FK 위반으로 실패한다.
-- (H2 호환 구문만 사용 — 테스트가 동일 마이그레이션을 적용한다)

ALTER TABLE mood_statuses ADD COLUMN couple_emoji_id BIGINT;

ALTER TABLE mood_statuses ADD CONSTRAINT fk_mood_statuses_couple_emoji
    FOREIGN KEY (couple_emoji_id) REFERENCES couple_emojis (id);

-- 문구 스티커(TEXT_STICKER) — 캐릭터 스티커 위에 사용자가 쓴 짧은 문구를 얹어 보낸다 (2026-09-28)
--
-- content 에는 <b>문구 그대로</b>를 담고, 어느 스티커 위에 얹었는지는 이 새 컬럼에 담는다.
-- content 에 코드를 섞지 않는 이유: 이 타입을 모르는 스토어의 옛 앱은 모르는 타입을 content 그대로
-- 글 말풍선으로 그린다 — 문구만 담아 두면 옛 앱에서도 "지민아 사랑해" 가 평범한 말로 읽힌다
-- (STREAK_CARD·GAME_CARD 와 같은 규칙, docs/TEXT_STICKER_2026-09-28.md).
--
-- 다른 타입에서는 NULL 이다. 관계 복원(RelationRecordRestorer)은 행째 relation_id 만 바꾸므로 함께 옮겨진다.
-- (H2 호환 구문만 사용 — 테스트가 동일 마이그레이션을 적용한다)
ALTER TABLE chat_messages ADD COLUMN sticker_code VARCHAR(40);

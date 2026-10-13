-- 일상 카드(FEED_CARD) → 원본 일상 포스트 참조.
--
-- 일상을 올리면 서버가 커플 채팅에 카드(첫 사진 + 글)를 자동으로 남긴다(FeedService.createPost,
-- 식단 MEAL_CARD 와 같은 자동 공유). 식단 카드의 meal_id·럽슐랭 카드의 place_id 와 같은 역할 —
-- (1) 일상을 고치면 카드의 글·사진도 따라 바꾸고, (2) 일상을 지우면 카드를 삭제 표시한다.
-- 카드가 지운 일상의 사진 URL 을 계속 들고 있으면 삭제기가 파일을 남기므로(StoredMediaReferences) 꼭 끊어야 한다.
--
-- FK 의 ON DELETE 는 두지 않는다(meal_id·place_id 와 같은 이유 — 앱이 삭제 표시까지 해야 한다).
-- 관계 삭제(RelationRecordPurger)는 feed_posts 를 chat_messages 보다 먼저 지우므로 그 앞에서 참조를 끊는다.
--
-- 영향 행 수: 0 (컬럼 추가만, 기존 데이터 변경 없음)
-- 롤백:
--   drop index idx_chat_messages_feed_post;
--   alter table chat_messages drop column feed_post_id;
alter table chat_messages add column feed_post_id bigint references feed_posts (id);
create index idx_chat_messages_feed_post on chat_messages (feed_post_id);

-- V123 — 일상 포스트를 고친 시각. 카드가 "수정됨"을 보여 준다.
--
-- 반응이 달린 글의 내용이 조용히 바뀌면 상대는 자기가 무엇에 반응했는지 모르게 된다. 고칠 때 푸시는 보내지
-- 않으므로(소음) 대신 카드에 흔적을 남긴다. 실제로 글·사진·기록일이 바뀌었을 때만 찍는다(FeedService.updatePost).
-- 고친 적 없으면 NULL.
ALTER TABLE feed_posts ADD COLUMN edited_at TIMESTAMP;

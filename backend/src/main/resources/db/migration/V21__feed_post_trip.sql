-- 커플 여행 앨범 (PLAN.md: Trip Album) — 일상 피드 포스트를 여행 단위로 큐레이션한다.
-- 여행 삭제 시 포스트는 피드에 그대로 남기고 연결만 해제한다.
ALTER TABLE feed_posts ADD COLUMN trip_id BIGINT REFERENCES trips (id) ON DELETE SET NULL;

CREATE INDEX idx_feed_posts_trip ON feed_posts (trip_id, created_at DESC);

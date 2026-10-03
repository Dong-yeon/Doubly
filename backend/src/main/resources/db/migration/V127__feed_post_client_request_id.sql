-- 일상 저장 멱등키 — 같은 저장 요청이 두 번 들어와도 글이 한 번만 생기게 DB 차원에서 막는다.
--
-- 왜 필요한가: 앱의 저장 요청은 10초에 끊긴다. 서버가 그보다 늦게 커밋하면 앱은 실패로 보고 사용자는 다시
-- 누르며, 글이 두 개 생기고 상대에게 푸시도 두 번 갔다(docs/first-experience-audit.md #24). 식단(V118)·
-- 채팅(V89)과 같은 처방이다.
--
-- 범위는 작성자 단위(author_id, client_request_id). NULL 은 PostgreSQL·H2 모두 서로 다른 값으로 보므로
-- 기존 행(전부 NULL)과 키를 보내지 않는 옛 앱은 이 인덱스에 걸리지 않는다 — 백필·기본값이 필요 없다.
-- ON CONFLICT 같은 DB 전용 문법은 쓰지 않는다(CLAUDE.md 4절).
--
-- 영향 행 수: 0 (컬럼 추가만, 기존 데이터 변경 없음)
-- 롤백:
--   drop index ux_feed_posts_author_client_request_id;
--   alter table feed_posts drop column client_request_id;
alter table feed_posts add column client_request_id varchar(64);

create unique index ux_feed_posts_author_client_request_id
    on feed_posts (author_id, client_request_id);

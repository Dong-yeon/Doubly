-- 채팅 메시지 멱등키 — 같은 메시지가 여러 번 저장되는 것을 DB 차원에서 막는다.
--
-- 왜 필요한가: STOMP 발행은 fire-and-forget 이라 클라이언트가 서버 저장을 기다리지 않는다.
-- 서버가 밀리면 화면에 아무것도 안 뜨고(표시 경로가 서버 에코뿐이다) 사용자는 다시 누르며,
-- 누른 만큼 프레임이 쌓여 전부 INSERT 됐다. 클라이언트 가드만으로는 구조적으로 못 막는다.
--
-- NULL 은 PostgreSQL·H2 모두 서로 다른 값으로 보므로, 기존 행(전부 NULL)은 이 인덱스에
-- 걸리지 않는다. 그래서 백필도 기본값도 필요 없다. ON CONFLICT 같은 DB 전용 문법은
-- 쓰지 않는다(CLAUDE.md 4절 — CI 가 H2 로 Flyway 를 돌린다).
--
-- 영향 행 수: 0 (컬럼 추가만, 기존 데이터 변경 없음)
-- 롤백:
--   drop index ux_chat_messages_client_message_id;
--   alter table chat_messages drop column client_message_id;
alter table chat_messages add column client_message_id varchar(64);

create unique index ux_chat_messages_client_message_id
    on chat_messages (relation_id, client_message_id);

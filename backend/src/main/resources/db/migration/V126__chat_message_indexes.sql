-- 채팅 인덱스 보강 (docs/chat-current-state.md §8-3)
--
-- PostgreSQL 16, 메시지 40만 건(커플 2,000 × 170 + 한 커플 6만)으로 EXPLAIN ANALYZE 를 떠서 고른 것들이다.
-- 숫자는 그 실측이다(이 마이그레이션 전 → 후).
--
-- ① 가장 큰 문제는 읽기가 아니라 <삭제>였다. reply_to_id 는 자기 자신을 가리키는 FK(ON DELETE SET NULL)인데
--    인덱스가 없어, 메시지 한 건을 지울 때마다 chat_messages 전체를 훑는다. 관계 단위 삭제(탈퇴·지난 기록
--    완전 삭제, RelationRecordPurger)가 메시지 수의 제곱으로 느려진다:
--      170건 커플 3.3초 → 14ms, 6만 건 커플 10분 넘게(중단) → 3.4초.
--    고정 공지·예약 전송이 메시지를 가리키는 FK 도 같은 이유로 함께 건다.
-- ② workout_id·routine_id·sender_id 도 FK 인데 인덱스가 없어, 운동 기록 하나를 지울 때마다 chat_messages
--    전체를 훑었다(18ms → 1.5ms, 메시지가 늘수록 비례해 커진다). 앱이 지금 이 카드를 보내지 않아도
--    FK 검사는 매번 돈다.
-- ③ 메시지 목록·커서 페이징은 id 순인데 기존 인덱스는 (relation_id, created_at) 이라, 커플의 메시지 전부를
--    읽어 정렬한 뒤 30건을 잘랐다. (relation_id, id) 면 정렬 없이 거꾸로 30건만 읽는다
--    (가벼운 커플 첫 페이지 0.87 → 0.10ms, 6만 건 커플 커서 7.5 → 2.7ms — 대화가 길수록 차이가 커진다).
-- ④ 안 읽은 수(방 목록 배지, 메시지를 받을 때마다 다시 센다)와 읽음 처리는 is_read = false 만 필요한데
--    커플 메시지 전부를 걸렀다(4.2 → 0.12ms, 6.1 → 1.2ms).
--
-- 기존 (relation_id, created_at) 은 대화 내보내기의 기간 조건이 쓰므로 그대로 둔다.
-- 대화 검색(lower(content) like '%…%')은 B-tree 로 못 받는다 — trigram 등은 PostgreSQL 전용이라 여기서 다루지 않는다.
-- H2·PostgreSQL 공용 문법만 쓴다(CLAUDE.md 4절). CONCURRENTLY 는 Flyway 트랜잭션·H2 와 맞지 않아 쓰지 않는다 —
-- 운영 테이블 크기에서는 잠금이 짧다.

CREATE INDEX idx_chat_messages_relation_cursor ON chat_messages (relation_id, id);
CREATE INDEX idx_chat_messages_relation_unread ON chat_messages (relation_id, is_read);

CREATE INDEX idx_chat_messages_reply_to ON chat_messages (reply_to_id);
CREATE INDEX idx_chat_messages_workout ON chat_messages (workout_id);
CREATE INDEX idx_chat_messages_routine ON chat_messages (routine_id);
CREATE INDEX idx_chat_messages_sender ON chat_messages (sender_id);

CREATE INDEX idx_chat_pinned_messages_message ON chat_pinned_messages (message_id);
CREATE INDEX idx_scheduled_chat_messages_sent_message ON scheduled_chat_messages (sent_message_id);

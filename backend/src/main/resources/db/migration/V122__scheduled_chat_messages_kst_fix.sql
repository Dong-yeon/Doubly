-- 예약 전송 시각 9시간 밀림 보정 (docs/chat-current-state.md §8-1 T1)
--
-- 이 마이그레이션 전까지 앱은 사용자가 고른 시각을 오프셋 없는 기기 현지 시각(KST)으로 보냈고,
-- 서버는 그것을 UTC 로 읽었다. 운영 JVM 은 UTC 라 scheduled_at 에는 "KST 21:00" 이 "UTC 21:00" 으로
-- 들어가 있다 — 실제 의도한 순간보다 정확히 9시간 뒤다.
--
-- 앞으로 들어오는 값은 ScheduleMessageRequest 의 KstInputLocalDateTimeDeserializer 가 바로잡는다.
-- 여기서는 이미 쌓여 있는 대기 중인 예약만 9시간 당긴다. 발송·취소된 행은 기록이라 두고,
-- 당긴 결과가 이미 지난 시각이면 다음 스위퍼 주기(5초)에 곧바로 나간다 — 이미 늦은 메시지를
-- 9시간 더 늦게 보내는 것보다 낫다.
--
-- 전제: 운영 JVM 시간대가 UTC(backend/Dockerfile -Duser.timezone=UTC, JacksonConfig 전제와 같다).
-- 되돌리기: 같은 조건으로 + INTERVAL '9' HOUR.
UPDATE scheduled_chat_messages
SET scheduled_at = scheduled_at - INTERVAL '9' HOUR
WHERE sent_at IS NULL
  AND canceled_at IS NULL;

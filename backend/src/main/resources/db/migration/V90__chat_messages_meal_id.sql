-- 식단 카드(MEAL_CARD) → 원본 식단 기록 참조.
--
-- 식단 기록을 저장하면 서버가 커플 채팅에 카드를 자동으로 남긴다(MealService.postMealCard,
-- docs/AUTO_SHARE_WORKOUT_2026-09-13.md). 운동 카드는 V1 부터 workout_id 로 원본을 가리켰지만
-- 식단 카드는 참조가 없어, 기록을 지워도 "먹었다"는 카드가 채팅에 그대로 남았다. 이 컬럼이
-- 있어야 기록 삭제 시 카드를 같이 정리할 수 있다(운동과 같은 규칙 — ChatMessage.detachDeletedWorkout).
--
-- FK 의 ON DELETE 는 두지 않는다 — 삭제 시 단순히 참조를 끊는 게 아니라 카드를 삭제 표시까지
-- 해야 하므로 앱(MealService.delete)이 처리한다. 순서를 어기면 FK 위반이 나서 바로 드러난다.
--
-- 영향 행 수: 0 (컬럼 추가만, 기존 데이터 변경 없음)
-- 롤백:
--   drop index idx_chat_messages_meal;
--   alter table chat_messages drop column meal_id;
alter table chat_messages add column meal_id bigint references meals (id);
create index idx_chat_messages_meal on chat_messages (meal_id);

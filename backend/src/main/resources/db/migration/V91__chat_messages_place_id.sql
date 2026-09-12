-- 럽슐랭 카드(PLACE_CARD) → 원본 장소 참조.
--
-- 장소 찜·방문·첫 평점·등극을 서버가 커플 채팅에 카드로 자동으로 남긴다(PlaceService,
-- docs/AUTO_SHARE_LOVELICHELIN_ANALYSIS_2026-09-13.md). 운동 카드의 workout_id(V1)·식단 카드의
-- meal_id(V90)와 같은 역할 — (1) 카드를 탭하면 장소 상세로 가고, (2) 장소를 지울 때 카드를 함께
-- 정리하고, (3) 같은 사람이 같은 장소로 연달아 남기는 카드를 하나로 접는(fold) 판정에 쓴다.
--
-- 방문 기록(place_visits)은 따로 가리키지 않는다 — 참조 둘에 정리 경로 둘은 과하다. 방문 하나를
-- 지워도 카드는 남고, 장소를 지우면 그 장소의 카드가 전부 삭제 표시된다.
--
-- FK 의 ON DELETE 는 두지 않는다(V90 과 같은 이유 — 앱이 삭제 표시까지 해야 한다).
--
-- 영향 행 수: 0 (컬럼 추가만, 기존 데이터 변경 없음)
-- 롤백:
--   drop index idx_chat_messages_place;
--   alter table chat_messages drop column place_id;
alter table chat_messages add column place_id bigint references places (id);
create index idx_chat_messages_place on chat_messages (place_id);

-- 외식 기록 단일 API(P0) — 방문 저장 멱등키, 식단 1개당 방문 1개, 믿을 수 없는 재방문 의사 비우기.
-- 설계: docs/LOVEBODY_LOVELICHELIN_LINK_2026-10-05.md §4 P0-1·P0-2, 결정 Q8(§5-1).
--
-- ① place_visits.client_request_id — "방문만"(식단 없이) 외식 기록은 meals.client_request_id(V118)에 기댈 수 없어
--    방문 쪽에 키를 둔다. 범위는 방문한 사람 단위(visited_by, client_request_id). NULL 은 PostgreSQL·H2 모두 서로 다른
--    값으로 보므로 기존 행(전부 NULL)과 키를 안 보내는 옛 앱(POST /places/{id}/visits)은 걸리지 않는다.
--
-- ② place_visits.meal_id UNIQUE — 식단 하나에 방문 하나. 읽는 쪽(식단 📍, 데이트 식사 달력, 피드)은 모두 "첫 방문"만
--    써 왔다. 운영 중복 점검 SQL 결과 0행(2026-10-05) → 정리할 데이터 없이 바로 건다. NULL(식단 없는 방문)은 여러 행 허용.
--
-- ③ place_ratings.revisit_intent → NULL — 앱 어디에도 재방문 의사를 묻는 입력이 없고, 식단 기록 화면만 장소를 붙일 때
--    항상 true 를 보냈다(DietRecordScreen). 지금 있는 non-null 값은 전부 그 하드코딩이라 사용자의 뜻이 아니다.
--    나중에 재방문 의사 기능을 만들 때 깨끗한 바닥에서 시작한다. content_ratings 는 보내는 곳이 없어 손대지 않는다.
--
-- ON CONFLICT·JSONB 같은 DB 전용 문법 없음(CLAUDE.md 4절).
-- 롤백:
--   drop index ux_place_visits_meal_id;
--   drop index ux_place_visits_visitor_client_request_id;
--   alter table place_visits drop column client_request_id;
--   (③ 은 되돌릴 수 없다 — 되돌릴 값 자체가 의미 없는 하드코딩이었다)
alter table place_visits add column client_request_id varchar(64);

create unique index ux_place_visits_visitor_client_request_id
    on place_visits (visited_by, client_request_id);

create unique index ux_place_visits_meal_id
    on place_visits (meal_id);

update place_ratings set revisit_intent = null where revisit_intent is not null;

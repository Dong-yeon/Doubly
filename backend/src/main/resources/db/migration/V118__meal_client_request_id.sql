-- 식단 저장 멱등키 — 같은 저장 요청이 두 번 들어와도 끼니가 한 번만 생기게 DB 차원에서 막는다.
--
-- 왜 필요한가: 앱의 저장 요청은 10초(DEFAULT_TIMEOUT)에 끊긴다. 서버가 그보다 늦게 커밋하면 앱은 실패로
-- 보고 사용자는 다시 누르며, 그 끼니가 한 번 더 저장됐다. 앱의 재진입 가드(useRef)는 "응답을 기다리는 동안"의
-- 두 번째 탭만 막으므로 이 경우를 구조적으로 못 막는다(docs/lovebody-current-state.md §4-3). 채팅의
-- client_message_id(V89)와 같은 처방이다.
--
-- 범위는 사용자 단위(user_id, client_request_id). NULL 은 PostgreSQL·H2 모두 서로 다른 값으로 보므로
-- 기존 행(전부 NULL)과 키를 보내지 않는 옛 앱은 이 인덱스에 걸리지 않는다 — 백필·기본값이 필요 없다.
-- 데이트 식단의 파트너 복제본·어제 복사본은 키를 갖지 않는다(NULL). ON CONFLICT 같은 DB 전용 문법은
-- 쓰지 않는다(CLAUDE.md 4절).
--
-- 영향 행 수: 0 (컬럼 추가만, 기존 데이터 변경 없음)
-- 롤백:
--   drop index ux_meals_user_client_request_id;
--   alter table meals drop column client_request_id;
alter table meals add column client_request_id varchar(64);

create unique index ux_meals_user_client_request_id
    on meals (user_id, client_request_id);

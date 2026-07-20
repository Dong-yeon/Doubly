-- 푸시 알림 수신 설정 (SET-01)
--
-- 기존 사용자는 지금까지 알림을 받아왔으므로 기본값 TRUE 로 둔다.
-- 우선 전체 on/off 하나만 둔다 — 카테고리별(채팅·운동·기념일) 분리가 필요해지면
-- 이 컬럼을 유지한 채 세부 컬럼을 추가하고, 전체 off 일 때는 세부값과 무관하게 차단한다.
ALTER TABLE users ADD COLUMN notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

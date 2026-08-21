-- 카테고리별 알림 설정 — V25 가 미리 계획해둔 확장("전체 off 일 때는 세부값과 무관하게
-- 차단한다"). notifications_enabled 는 마스터 스위치로 그대로 두고 세부 컬럼만 추가한다.
-- 기존 사용자는 지금까지 전 카테고리를 받아왔으므로 기본값 TRUE.
ALTER TABLE users ADD COLUMN notify_chat BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN notify_anniversary BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN notify_partner_activity BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN notify_reminder BOOLEAN NOT NULL DEFAULT TRUE;

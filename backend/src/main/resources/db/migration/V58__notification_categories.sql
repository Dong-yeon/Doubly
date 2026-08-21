-- 알림 카테고리별 수신 설정 — 2026-08 진단 리포트 "알림 인프라 2종" 중 (2).
--
-- 지금까지 설정은 users.notifications_enabled 하나뿐이었다. 푸시 종류는 20종이 넘는데
-- "전부 켜거나 전부 끄거나"밖에 없어서, 채팅 알림 하나가 성가시면 기념일·상대 활동까지
-- 통째로 꺼진다 — 알림 피로 → 전체 끄기 → 이탈로 이어지는 구조였다.
--
-- 분류는 보내는 도메인(운동/식단/맛집…)이 아니라 사용자가 체감하는 성가심의 결로 나눈다
-- (com.fitto.common.notification.NotificationCategory 참고).
-- 기본값은 전부 TRUE — 기존 사용자는 어제까지 받던 알림을 그대로 받아야 한다.
ALTER TABLE users ADD COLUMN notify_chat        BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN notify_anniversary BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN notify_partner     BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN notify_reminder    BOOLEAN NOT NULL DEFAULT TRUE;

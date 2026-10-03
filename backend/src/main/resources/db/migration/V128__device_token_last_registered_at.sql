-- 푸시 토큰 마지막 등록 시각 — 사용자마다 최근에 등록된 토큰 몇 개만 남기기 위한 기준.
--
-- 왜 필요한가: 죽은 토큰은 "그 사용자에게 보낼 때" 받는 영수증(DeviceNotRegistered)으로만 지워졌다.
-- 받을 알림이 없는 사용자(예: 커플 미연결)는 재설치·dev 빌드마다 토큰이 쌓이기만 해서 운영에서 한 사람에게
-- 안드로이드 토큰 52개가 쌓였다(docs/first-experience-audit.md #28). 앱은 시작할 때마다 토큰을 다시
-- 등록하므로, 이 값이 "아직 쓰이는 기기인지"를 가르는 기준이 된다.
--
-- 오래된 토큰을 "기간"으로 지우지 않는 이유: 오래 접속하지 않은 사용자에게 보내는 재방문 알림까지 끊긴다.
-- 그래서 DeviceTokenService 는 사용자당 최근 N개만 남긴다.
--
-- 기존 행은 created_at 으로 채운다(지금까지는 재등록 = 삭제 후 재삽입이라 created_at 이 곧 마지막 등록 시각이다).
-- 영향 행 수: device_tokens 전체(운영 2026-10-03 기준 59행) — 값 채우기만, 삭제 없음
-- 롤백:
--   alter table device_tokens drop column last_registered_at;
alter table device_tokens add column last_registered_at timestamp;

update device_tokens set last_registered_at = created_at;

alter table device_tokens alter column last_registered_at set not null;

-- 약관·개인정보 동의 기록 (AUTH-09)
-- 동의 "여부"가 아니라 "시각 + 약관 버전"을 남긴다.
-- 약관이 개정되면 저장된 버전과 비교해 재동의를 받을 수 있어야 하기 때문이다.
ALTER TABLE users ADD COLUMN terms_agreed_at     TIMESTAMP;
ALTER TABLE users ADD COLUMN terms_version       VARCHAR(20);
ALTER TABLE users ADD COLUMN privacy_agreed_at   TIMESTAMP;
ALTER TABLE users ADD COLUMN privacy_version     VARCHAR(20);
-- 마케팅 수신은 선택 동의 — 철회 가능해야 하므로 NULL 이면 미동의/철회 상태
ALTER TABLE users ADD COLUMN marketing_agreed_at TIMESTAMP;

-- 기존 가입자는 동의 이력이 없어 NULL 로 남는다.
-- 이들에게는 다음 접속 시 재동의를 받아야 한다(별도 게이트 필요 — README 참고).

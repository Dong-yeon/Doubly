-- 탈퇴 유예기간 (2026-09-30) — 탈퇴를 요청하면 바로 지우지 않고 삭제 예정 시각만 기록한다.
-- 그 전에 다시 로그인하면 NULL 로 되돌아가고(탈퇴 취소), 지나면 AccountWithdrawalSweeper 가
-- 기존 즉시 삭제 경로(UserDataPurger)를 그대로 실행한다. 한 명의 탈퇴가 상대의 추억까지
-- 예고 없이 지우지 않게 하려는 것이다 (docs/DATA_SAFETY_INFRA_2026-09-30.md).
ALTER TABLE users ADD COLUMN withdrawal_scheduled_at TIMESTAMP;

CREATE INDEX idx_users_withdrawal_scheduled_at ON users (withdrawal_scheduled_at);

-- 대결 종료 자동 판정 — 2026-08 진단 리포트 "대결 종료 자동 판정 푸시".
--
-- 지금까지 대결은 기간이 끝나도 아무 일도 일어나지 않았다. 점수는 원본 기록에서
-- 매번 실시간 집계라 화면을 열면 누가 이겼는지 보이긴 하지만, "끝났다"고 알려주는
-- 순간이 없어서 대결에 클라이맥스가 없었다.
--
-- 승자를 저장하는 이유는 두 가지다. ① 발송 이력을 겸한다 — settled_at 이 채워진
-- 대결은 스케줄러가 다시 집지 않으므로 별도 이력 테이블 없이 중복 발송이 막힌다.
-- ② 기간이 끝난 뒤 소급 입력(어제 운동을 오늘 기록)이 들어와도 발표된 결과가 바뀌지
-- 않는다 — 알림으로 "이겼다"고 알린 뒤 화면에서 뒤집히면 그게 더 나쁘다.
--
-- winner_user_id NULL 의 의미는 settled_at 로 구분한다:
--   settled_at IS NULL  → 아직 판정 전
--   settled_at 있고 winner NULL → 무승부
ALTER TABLE couple_challenges ADD COLUMN settled_at     TIMESTAMP;
ALTER TABLE couple_challenges ADD COLUMN winner_user_id BIGINT REFERENCES users (id);

-- 스케줄러가 매일 "끝났는데 아직 판정 안 된" 대결만 훑는다.
CREATE INDEX idx_couple_challenges_unsettled ON couple_challenges (settled_at, end_date);

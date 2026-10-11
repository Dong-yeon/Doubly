-- 게임 재촉·리마인더 (2026-09-30) — docs/GAME_NUDGE_2026-09-30.md
--
-- 번갈아 두는 게임(오목·길막기·캐치마인드·연쇄 퍼즐 대전)과 같이 푸는 스도쿠는 상대가 안 들어오면
-- 할 수 있는 게 "판 접기"뿐이었다. 기다리는 쪽이 하루 한 번 "살짝 찌르기"를 보내고, 24시간 멈춘 판에는
-- 서버가 한 번 알린다.
--
-- 시각만 남긴다. 판이 "움직인" 게 아니므로 updated_at 을 건드리지 않게 앱은 벌크 update 로 쓴다 —
-- updated_at 은 "2분 조용하면 차례 알림"(GameQuiet)과 멈춘 판 판정의 기준이다.
-- couple_games 단일 테이블이라 Purger 변경은 없다.

-- 판을 연 사람 / 상대가 마지막으로 찌른 시각 — 하루 한 번 제한
ALTER TABLE couple_games ADD COLUMN nudged_by_creator_at TIMESTAMP;
ALTER TABLE couple_games ADD COLUMN nudged_by_partner_at TIMESTAMP;

-- 멈춘 판 리마인더를 보낸 시각 — updated_at 보다 뒤면 "이번 멈춤에는 이미 알렸다"
ALTER TABLE couple_games ADD COLUMN reminded_at TIMESTAMP;

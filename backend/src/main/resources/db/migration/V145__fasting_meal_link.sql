-- 간헐적 단식 ↔ 끼니 기록 연동 (2026-10-16, docs/LOVEBODY_FASTING_WATER_ANALYSIS_2026-10-16.md)
-- ended_by: 어떻게 끝났나(MANUAL = 종료 버튼, MEAL = 식사 기록으로 자동 종료). 되돌리기는 MEAL 만 허용한다.
-- target_notified_at: "목표 시간 채웠어요" 본인 푸시를 보낸 시각 — 같은 단식에 두 번 보내지 않는다.
ALTER TABLE fasting_sessions ADD COLUMN ended_by VARCHAR(10);
ALTER TABLE fasting_sessions ADD COLUMN target_notified_at TIMESTAMP;

-- 이력 조회(최근 N일)·"최근 30일 안에 단식해 본 적 있나" 판정
CREATE INDEX idx_fasting_sessions_user_started ON fasting_sessions (user_id, started_at);

-- 사용자 설정 — null 은 켜짐(기본값). 영양 목표 표가 사용자당 한 줄(user_id PK)이라 거기에 둔다.
ALTER TABLE nutrition_goals ADD COLUMN fasting_auto_end BOOLEAN;
ALTER TABLE nutrition_goals ADD COLUMN fasting_offer_dinner BOOLEAN;

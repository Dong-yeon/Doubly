-- 클린식/치팅데이 구분 (Place Map 필터 + 지도 핀 색상) — PLAN.md Place Map 확장
-- CLEAN(클린식/고단백) / CHEAT(치팅데이) / NEUTRAL(구분 없음, 기본값)
ALTER TABLE places
    ADD COLUMN diet_tag VARCHAR(20) NOT NULL DEFAULT 'NEUTRAL'
        CHECK (diet_tag IN ('CLEAN', 'CHEAT', 'NEUTRAL'));

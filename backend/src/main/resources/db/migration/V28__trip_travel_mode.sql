-- 커플 여행 모드 (PLAN.md Travel Mode) — 여행 기간 동안 식단 목표 표시를 잠시 끄는 스위치
ALTER TABLE trips ADD COLUMN travel_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE;

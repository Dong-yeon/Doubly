-- 식단 사진 자동 분석 (2026-09-09) — docs/DIET_USAGE_ANALYSIS_2026-09-09.md 5절
--
-- 사진을 올려 저장하면 백그라운드에서 AI 가 칼로리를 채운다. 자동으로 채워진 값과
-- 사용자가 직접 적은 값을 영구히 구분할 수 있어야 하므로(운동 인증샷의 "자동 저장 금지"
-- 원칙을 식단에서 출처 표시로 대체한다) 끼니마다 출처를 남긴다.
--
-- NULL = 사용자 입력(레거시 기록 포함). 값이 있는 경우만 화면에 배지를 띄운다.
alter table meals add column nutrition_source varchar(20);

-- 자동 분석을 끌 수 있는 스위치. 기본 켬 — 이 경로의 존재 이유가 "버튼을 한 번 더 누르지
-- 않는 것"이라 꺼진 상태가 기본이면 기능 자체가 무의미하다.
alter table users add column auto_analyze_meal_photo boolean default true not null;

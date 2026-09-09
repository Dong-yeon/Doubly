-- 유산소 종목(러닝·트레드밀·사이클…)의 기록 축을 세트에서 "시간·거리"로 바꾼다.
--
-- 지금까지는 모든 종목이 세트 × 횟수 × 무게 한 벌뿐이라, 러닝을 기록하려면 "3세트 10회"처럼
-- 아무 의미 없는 숫자를 넣어야 했다. 유산소에서 실제로 남기고 싶은 값은 <b>얼마나 오래,
-- 얼마나 멀리</b> 뛰었나이므로 두 축을 따로 둔다.
--
-- 근력 컬럼(sets/reps/weight_kg)을 재활용하지 않은 이유: 같은 칸에 다른 뜻을 담으면 볼륨 합계·
-- PR 판정·기록 추이가 전부 "무게 없는 세트"를 어떻게 다룰지 매번 다시 판단해야 한다. 컬럼이
-- 나뉘어 있으면 기존 계산식은 유산소 행을 자연스럽게(null 이라) 건너뛴다.
--
-- 초 단위로 저장하는 이유: 입력은 분이지만 인터벌·트레드밀 기록은 30초 단위가 흔하고,
-- 정수 초로 두면 반올림 손실 없이 합산할 수 있다. 거리는 소수 둘째 자리(10m)까지.

ALTER TABLE workout_sets ADD COLUMN duration_sec INT;
ALTER TABLE workout_sets ADD COLUMN distance_km DECIMAL(6,2);

ALTER TABLE workout_set_entries ADD COLUMN duration_sec INT;
ALTER TABLE workout_set_entries ADD COLUMN distance_km DECIMAL(6,2);

-- 루틴에도 유산소 목표를 담는다 — 목표가 "3세트"로만 잡히면 세션 화면이 다시 세트를 그린다.
ALTER TABLE workout_routine_exercises ADD COLUMN target_duration_min INT;
ALTER TABLE workout_routine_exercises ADD COLUMN target_distance_km DECIMAL(6,2);

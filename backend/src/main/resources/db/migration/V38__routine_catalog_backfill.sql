-- 루틴 종목과 카탈로그를 연결 — 지금까지 이름이 카탈로그와 똑같은데도
-- muscle_group/exercise_catalog_id 가 비어 있었다. 루틴 작성 폼이 운동 이름을 자유
-- 텍스트로만 받았고(카탈로그는 대체 종목 고를 때만 썼다), 시스템 템플릿 시드(V30)와
-- AI 추천 저장 경로도 이 컬럼을 채우지 않았기 때문이다.
--
-- 그 결과 세션 중 "대체 종목으로 교체"를 열면 muscleGroup 이 항상 비어 있어
-- MUSCLE_GROUPS[0](가슴)으로 고정 — 하체 운동을 대체하려 열어도 가슴 종목이 떴다
-- (WorkoutSessionScreen.openSubstitute 의 `e.muscleGroup ?? MUSCLE_GROUPS[0]`).
--
-- 이름이 정확히 일치하는 것만 채운다. 다르면(자유 입력·오타) 손대지 않고 지금처럼 비워둔다.
UPDATE workout_routine_exercises re
SET muscle_group = (SELECT ec.muscle_group FROM exercise_catalog ec WHERE ec.name = re.exercise_name),
    exercise_catalog_id = (SELECT ec.id FROM exercise_catalog ec WHERE ec.name = re.exercise_name),
    equipment = COALESCE(re.equipment, (SELECT ec.equipment FROM exercise_catalog ec WHERE ec.name = re.exercise_name))
WHERE re.muscle_group IS NULL
  AND EXISTS (SELECT 1 FROM exercise_catalog ec WHERE ec.name = re.exercise_name);

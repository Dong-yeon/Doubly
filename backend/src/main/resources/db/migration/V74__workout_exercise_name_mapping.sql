-- 기존 운동 기록·루틴의 종목 이름을 카탈로그에 맞춘다 (V73 카탈로그 확장 후속)
--
-- 왜: 지금까지 종목을 자유 텍스트로 받아 왔다. 그래서 같은 운동이 "벤치" / "벤치 프레스" /
-- "벤치프레스"로 갈라져 있는데, 조회는 전부 exercise_name <b>문자열</b>로 묶는다
-- (WorkoutSetRepository 의 findPersonalBests / findPreviousBestWeights / findRecentByExerciseName).
-- 이름이 셋으로 갈라지면 종목별 추이도 셋으로 토막 나고, PR 기준값은 그 토막 안에서만 잡혀
-- 실제로는 신기록이 아닌데 신기록이라고 뜨고, 직전 기록 프리필도 안 걸린다.
--
-- 하나 더: workout_sets.muscle_group 이 비어 있으면 근육 회복이 그 기록을 아예 못 본다
-- (findLastTrainedByMuscleGroup 이 muscle_group IS NOT NULL 인 것만 센다). 자유 입력으로
-- 남긴 과거 기록은 지금 전부 이 상태다 — workout_sets 는 한 번도 백필된 적이 없다.
--
-- V40 이 루틴에만 같은 일을 했지만 (가) 이름이 <b>정확히</b> 일치하는 것만 봤고
-- (나) workout_sets 는 손대지 않았다. V73 으로 카탈로그가 34 -> 245개가 됐으니 다시 훑는다.
--
-- 매칭은 두 단계뿐이고, 둘 다 "완전히 같은 문자열"이다 — 부분 일치·유사도는 쓰지 않는다.
-- 기록의 종목 이름을 바꾸는 일이라, 틀리면 남의 기록이 엉뚱한 종목의 추이에 섞인다.
--   1) 공백·대소문자만 무시한 이름 일치  ("벤치 프레스" -> "벤치프레스")
--   2) 별칭 한 칸과 통째로 일치          ("턱걸이"     -> "풀업")
-- 어느 쪽도 아니면 손대지 않는다. 카탈로그에 없는 진짜 커스텀 종목이라 그대로 두는 게 맞다.

-- 0) 먼저 카탈로그 자체의 오타 하나.
--    '행잉 니레이즈'가 '행잉 레그레이즈'의 별칭으로 들어가 있는데, 그건 별칭이 아니라
--    카탈로그에 따로 있는 <b>다른 종목</b>이다(무릎을 접어 올리는 동작 vs 다리를 편 채 올리는 동작).
--    아래 2)가 1) 뒤에 오므로 기록이 잘못 매핑되진 않지만, 피커에서 "행잉 니레이즈"를 검색하면
--    엉뚱한 종목이 같이 뜬다. 별칭 중 이름이 겹치는 건 이 한 건뿐이다(245개 전수 확인).
UPDATE exercise_catalog SET aliases = 'hanging leg raise' WHERE name = '행잉 레그레이즈';

-- 1) 공백·대소문자를 무시한 이름 일치.
--    lower(replace(...)) 는 표준 함수라 PostgreSQL·H2 양쪽에서 같게 돈다 (CLAUDE.md 4절).
--    이름이 이미 정확히 같은 행도 여기 걸리는데, 그 경우 exercise_name 갱신은 무해한 제자리 쓰기다.
--    created_by IS NULL = 시스템 기본 제공만. 커스텀 종목까지 후보에 넣으면 남이 만든 종목으로
--    내 기록이 끌려갈 수 있다(커스텀 종목 기능이 열리는 순간 문제가 된다).
--    muscle_group 은 <b>덮어쓰고</b> equipment 는 COALESCE 로 비어 있을 때만 채운다(V40 과 같은 처방).
--    둘을 다르게 다루는 이유: 기구는 사용자가 실제로 바꿔서 할 수 있지만(카탈로그의 스쿼트는
--    바벨이어도 나는 스미스머신에서 했다) 자극 부위는 종목의 성질이라 수행 방식에 따라 안 변한다.
--    카탈로그가 그 태그의 출처이므로(ExerciseCatalog javadoc) 연결한 이상 카탈로그 값이 맞다.
--    실제로 클라이언트가 'chest' 같은 7개 밖의 값을 보낸 행이 있는데, 그대로 두면 그 기록은
--    근육 회복에서 영영 안 보인다 — MUSCLE_GROUPS 7개와 대조하기 때문이다.
UPDATE workout_sets ws
SET exercise_name = (SELECT ec.name FROM exercise_catalog ec
                      WHERE ec.created_by IS NULL
                        AND lower(replace(ec.name, ' ', '')) = lower(replace(ws.exercise_name, ' ', ''))),
    exercise_catalog_id = (SELECT ec.id FROM exercise_catalog ec
                            WHERE ec.created_by IS NULL
                              AND lower(replace(ec.name, ' ', '')) = lower(replace(ws.exercise_name, ' ', ''))),
    muscle_group = (SELECT ec.muscle_group FROM exercise_catalog ec
                     WHERE ec.created_by IS NULL
                       AND lower(replace(ec.name, ' ', '')) = lower(replace(ws.exercise_name, ' ', ''))),
    equipment = COALESCE(ws.equipment, (SELECT ec.equipment FROM exercise_catalog ec
                                         WHERE ec.created_by IS NULL
                                           AND lower(replace(ec.name, ' ', '')) = lower(replace(ws.exercise_name, ' ', ''))))
WHERE ws.exercise_catalog_id IS NULL
  AND EXISTS (SELECT 1 FROM exercise_catalog ec
               WHERE ec.created_by IS NULL
                 AND lower(replace(ec.name, ' ', '')) = lower(replace(ws.exercise_name, ' ', '')));

UPDATE workout_routine_exercises re
SET exercise_name = (SELECT ec.name FROM exercise_catalog ec
                      WHERE ec.created_by IS NULL
                        AND lower(replace(ec.name, ' ', '')) = lower(replace(re.exercise_name, ' ', ''))),
    exercise_catalog_id = (SELECT ec.id FROM exercise_catalog ec
                            WHERE ec.created_by IS NULL
                              AND lower(replace(ec.name, ' ', '')) = lower(replace(re.exercise_name, ' ', ''))),
    muscle_group = (SELECT ec.muscle_group FROM exercise_catalog ec
                     WHERE ec.created_by IS NULL
                       AND lower(replace(ec.name, ' ', '')) = lower(replace(re.exercise_name, ' ', ''))),
    equipment = COALESCE(re.equipment, (SELECT ec.equipment FROM exercise_catalog ec
                                         WHERE ec.created_by IS NULL
                                           AND lower(replace(ec.name, ' ', '')) = lower(replace(re.exercise_name, ' ', ''))))
WHERE re.exercise_catalog_id IS NULL
  AND EXISTS (SELECT 1 FROM exercise_catalog ec
               WHERE ec.created_by IS NULL
                 AND lower(replace(ec.name, ' ', '')) = lower(replace(re.exercise_name, ' ', '')));

-- 2) 별칭 한 칸과 통째로 일치 — "턱걸이" -> "풀업"처럼 글자가 하나도 안 겹치는 경우다.
--
--    aliases 는 "턱걸이, pull up" 처럼 쉼표로 이어 붙인 한 칸이라, 양끝에 쉼표를 덧대고
--    ',턱걸이,' 가 들어있는지 본다. 이렇게 해야 <b>한 칸 전체</b>가 같을 때만 걸린다 —
--    그냥 LIKE '%턱걸이%' 로 하면 별칭 'pull up' 이 'pull' 에도 걸려 엉뚱한 종목에 붙는다.
--
--    이름에 % 나 _ 가 들어 있는 기록은 건너뛴다. LIKE 패턴 자리에 그대로 들어가면 와일드카드로
--    해석돼 아무 별칭에나 걸린다(자유 입력이라 "런닝 50%" 같은 게 실제로 들어올 수 있다).
--
--    1) 을 먼저 돌린 뒤라 이름으로 이미 붙은 행은 exercise_catalog_id 가 차 있어 제외된다.
--    이름 일치가 별칭 일치보다 항상 우선이어야 한다 — 위 0) 의 '행잉 니레이즈' 가 그 예다.
--
--    245개 전수 확인 결과 같은 별칭을 두 종목이 나눠 갖는 경우는 없다. 만에 하나 생기면
--    스칼라 서브쿼리가 에러를 내며 마이그레이션이 멈춘다 — 조용히 잘못 붙는 것보다 낫다.
UPDATE workout_sets ws
SET exercise_name = (SELECT ec.name FROM exercise_catalog ec
                      WHERE ec.created_by IS NULL AND ec.aliases IS NOT NULL
                        AND (',' || lower(replace(ec.aliases, ' ', '')) || ',')
                            LIKE ('%,' || lower(replace(ws.exercise_name, ' ', '')) || ',%')),
    exercise_catalog_id = (SELECT ec.id FROM exercise_catalog ec
                            WHERE ec.created_by IS NULL AND ec.aliases IS NOT NULL
                              AND (',' || lower(replace(ec.aliases, ' ', '')) || ',')
                                  LIKE ('%,' || lower(replace(ws.exercise_name, ' ', '')) || ',%')),
    muscle_group = (SELECT ec.muscle_group FROM exercise_catalog ec
                     WHERE ec.created_by IS NULL AND ec.aliases IS NOT NULL
                       AND (',' || lower(replace(ec.aliases, ' ', '')) || ',')
                           LIKE ('%,' || lower(replace(ws.exercise_name, ' ', '')) || ',%')),
    equipment = COALESCE(ws.equipment, (SELECT ec.equipment FROM exercise_catalog ec
                                         WHERE ec.created_by IS NULL AND ec.aliases IS NOT NULL
                                           AND (',' || lower(replace(ec.aliases, ' ', '')) || ',')
                                               LIKE ('%,' || lower(replace(ws.exercise_name, ' ', '')) || ',%')))
WHERE ws.exercise_catalog_id IS NULL
  AND ws.exercise_name NOT LIKE '%!%%' ESCAPE '!'
  AND ws.exercise_name NOT LIKE '%!_%' ESCAPE '!'
  AND EXISTS (SELECT 1 FROM exercise_catalog ec
               WHERE ec.created_by IS NULL AND ec.aliases IS NOT NULL
                 AND (',' || lower(replace(ec.aliases, ' ', '')) || ',')
                     LIKE ('%,' || lower(replace(ws.exercise_name, ' ', '')) || ',%'));

UPDATE workout_routine_exercises re
SET exercise_name = (SELECT ec.name FROM exercise_catalog ec
                      WHERE ec.created_by IS NULL AND ec.aliases IS NOT NULL
                        AND (',' || lower(replace(ec.aliases, ' ', '')) || ',')
                            LIKE ('%,' || lower(replace(re.exercise_name, ' ', '')) || ',%')),
    exercise_catalog_id = (SELECT ec.id FROM exercise_catalog ec
                            WHERE ec.created_by IS NULL AND ec.aliases IS NOT NULL
                              AND (',' || lower(replace(ec.aliases, ' ', '')) || ',')
                                  LIKE ('%,' || lower(replace(re.exercise_name, ' ', '')) || ',%')),
    muscle_group = (SELECT ec.muscle_group FROM exercise_catalog ec
                     WHERE ec.created_by IS NULL AND ec.aliases IS NOT NULL
                       AND (',' || lower(replace(ec.aliases, ' ', '')) || ',')
                           LIKE ('%,' || lower(replace(re.exercise_name, ' ', '')) || ',%')),
    equipment = COALESCE(re.equipment, (SELECT ec.equipment FROM exercise_catalog ec
                                         WHERE ec.created_by IS NULL AND ec.aliases IS NOT NULL
                                           AND (',' || lower(replace(ec.aliases, ' ', '')) || ',')
                                               LIKE ('%,' || lower(replace(re.exercise_name, ' ', '')) || ',%')))
WHERE re.exercise_catalog_id IS NULL
  AND re.exercise_name NOT LIKE '%!%%' ESCAPE '!'
  AND re.exercise_name NOT LIKE '%!_%' ESCAPE '!'
  AND EXISTS (SELECT 1 FROM exercise_catalog ec
               WHERE ec.created_by IS NULL AND ec.aliases IS NOT NULL
                 AND (',' || lower(replace(ec.aliases, ' ', '')) || ',')
                     LIKE ('%,' || lower(replace(re.exercise_name, ' ', '')) || ',%'));

-- 3) 남은 것(카탈로그에 없는 이름)은 그대로 둔다. 인덱스도 새로 두지 않는다 —
--    조회는 여전히 exercise_name 으로 묶고, 그 컬럼을 쓰는 쿼리는 이미 workout_id 인덱스를 탄다.

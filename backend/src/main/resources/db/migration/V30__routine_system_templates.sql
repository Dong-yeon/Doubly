-- ⑤ 검증된 분할 템플릿 — 시스템이 기본 제공하는 루틴. 사용자 소유가 아니므로 user_id 를 비울 수 있어야 한다.
ALTER TABLE workout_routines ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE workout_routines ADD COLUMN is_system_template BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_workout_routines_system ON workout_routines (is_system_template);

-- 시드 — 루틴 짜기가 막막한 초보 유저를 위한 완성도 높은 기본 템플릿 3종.
-- "복사해서 담기"로 내 루틴에 그대로 가져간 뒤 자유롭게 편집해서 쓴다.
INSERT INTO workout_routines (user_id, title, is_system_template) VALUES
    (NULL, '3분할 Day1 · 가슴/삼두', TRUE),
    (NULL, '3분할 Day2 · 등/이두', TRUE),
    (NULL, '3분할 Day3 · 하체/어깨', TRUE),
    (NULL, '4분할 Day1 · 가슴', TRUE),
    (NULL, '4분할 Day2 · 등', TRUE),
    (NULL, '4분할 Day3 · 하체', TRUE),
    (NULL, '4분할 Day4 · 어깨/팔', TRUE),
    (NULL, '20분 전신 퀵 루틴', TRUE);

INSERT INTO workout_routine_exercises (routine_id, exercise_name, category, target_sets, reps, order_no) VALUES
    ((SELECT id FROM workout_routines WHERE title = '3분할 Day1 · 가슴/삼두' AND is_system_template = TRUE), '벤치프레스', '근력', 4, 8, 1),
    ((SELECT id FROM workout_routines WHERE title = '3분할 Day1 · 가슴/삼두' AND is_system_template = TRUE), '인클라인 벤치프레스', '근력', 3, 10, 2),
    ((SELECT id FROM workout_routines WHERE title = '3분할 Day1 · 가슴/삼두' AND is_system_template = TRUE), '케이블 크로스오버', '근력', 3, 12, 3),
    ((SELECT id FROM workout_routines WHERE title = '3분할 Day1 · 가슴/삼두' AND is_system_template = TRUE), '딥스', '근력', 3, 10, 4),
    ((SELECT id FROM workout_routines WHERE title = '3분할 Day1 · 가슴/삼두' AND is_system_template = TRUE), '트라이셉스 익스텐션', '근력', 3, 12, 5),

    ((SELECT id FROM workout_routines WHERE title = '3분할 Day2 · 등/이두' AND is_system_template = TRUE), '데드리프트', '근력', 4, 6, 1),
    ((SELECT id FROM workout_routines WHERE title = '3분할 Day2 · 등/이두' AND is_system_template = TRUE), '바벨 로우', '근력', 4, 8, 2),
    ((SELECT id FROM workout_routines WHERE title = '3분할 Day2 · 등/이두' AND is_system_template = TRUE), '랫풀다운', '근력', 3, 10, 3),
    ((SELECT id FROM workout_routines WHERE title = '3분할 Day2 · 등/이두' AND is_system_template = TRUE), '시티드 케이블 로우', '근력', 3, 12, 4),
    ((SELECT id FROM workout_routines WHERE title = '3분할 Day2 · 등/이두' AND is_system_template = TRUE), '바벨 컬', '근력', 3, 12, 5),

    ((SELECT id FROM workout_routines WHERE title = '3분할 Day3 · 하체/어깨' AND is_system_template = TRUE), '스쿼트', '근력', 4, 8, 1),
    ((SELECT id FROM workout_routines WHERE title = '3분할 Day3 · 하체/어깨' AND is_system_template = TRUE), '레그프레스', '근력', 3, 12, 2),
    ((SELECT id FROM workout_routines WHERE title = '3분할 Day3 · 하체/어깨' AND is_system_template = TRUE), '레그컬', '근력', 3, 12, 3),
    ((SELECT id FROM workout_routines WHERE title = '3분할 Day3 · 하체/어깨' AND is_system_template = TRUE), '오버헤드 프레스', '근력', 4, 8, 4),
    ((SELECT id FROM workout_routines WHERE title = '3분할 Day3 · 하체/어깨' AND is_system_template = TRUE), '사이드 레터럴 레이즈', '근력', 3, 15, 5),

    ((SELECT id FROM workout_routines WHERE title = '4분할 Day1 · 가슴' AND is_system_template = TRUE), '벤치프레스', '근력', 4, 8, 1),
    ((SELECT id FROM workout_routines WHERE title = '4분할 Day1 · 가슴' AND is_system_template = TRUE), '인클라인 벤치프레스', '근력', 3, 10, 2),
    ((SELECT id FROM workout_routines WHERE title = '4분할 Day1 · 가슴' AND is_system_template = TRUE), '딥스', '근력', 3, 10, 3),
    ((SELECT id FROM workout_routines WHERE title = '4분할 Day1 · 가슴' AND is_system_template = TRUE), '케이블 크로스오버', '근력', 3, 12, 4),

    ((SELECT id FROM workout_routines WHERE title = '4분할 Day2 · 등' AND is_system_template = TRUE), '데드리프트', '근력', 4, 6, 1),
    ((SELECT id FROM workout_routines WHERE title = '4분할 Day2 · 등' AND is_system_template = TRUE), '바벨 로우', '근력', 4, 8, 2),
    ((SELECT id FROM workout_routines WHERE title = '4분할 Day2 · 등' AND is_system_template = TRUE), '풀업', '근력', 3, 8, 3),
    ((SELECT id FROM workout_routines WHERE title = '4분할 Day2 · 등' AND is_system_template = TRUE), '랫풀다운', '근력', 3, 10, 4),

    ((SELECT id FROM workout_routines WHERE title = '4분할 Day3 · 하체' AND is_system_template = TRUE), '스쿼트', '근력', 4, 8, 1),
    ((SELECT id FROM workout_routines WHERE title = '4분할 Day3 · 하체' AND is_system_template = TRUE), '레그프레스', '근력', 3, 12, 2),
    ((SELECT id FROM workout_routines WHERE title = '4분할 Day3 · 하체' AND is_system_template = TRUE), '레그컬', '근력', 3, 12, 3),
    ((SELECT id FROM workout_routines WHERE title = '4분할 Day3 · 하체' AND is_system_template = TRUE), '레그익스텐션', '근력', 3, 12, 4),

    ((SELECT id FROM workout_routines WHERE title = '4분할 Day4 · 어깨/팔' AND is_system_template = TRUE), '오버헤드 프레스', '근력', 4, 8, 1),
    ((SELECT id FROM workout_routines WHERE title = '4분할 Day4 · 어깨/팔' AND is_system_template = TRUE), '사이드 레터럴 레이즈', '근력', 3, 15, 2),
    ((SELECT id FROM workout_routines WHERE title = '4분할 Day4 · 어깨/팔' AND is_system_template = TRUE), '바벨 컬', '근력', 3, 12, 3),
    ((SELECT id FROM workout_routines WHERE title = '4분할 Day4 · 어깨/팔' AND is_system_template = TRUE), '트라이셉스 익스텐션', '근력', 3, 12, 4),

    ((SELECT id FROM workout_routines WHERE title = '20분 전신 퀵 루틴' AND is_system_template = TRUE), '스쿼트', '근력', 3, 15, 1),
    ((SELECT id FROM workout_routines WHERE title = '20분 전신 퀵 루틴' AND is_system_template = TRUE), '푸시업', '근력', 3, 12, 2),
    ((SELECT id FROM workout_routines WHERE title = '20분 전신 퀵 루틴' AND is_system_template = TRUE), '바벨 로우', '근력', 3, 12, 3),
    ((SELECT id FROM workout_routines WHERE title = '20분 전신 퀵 루틴' AND is_system_template = TRUE), '플랭크', '근력', 3, 30, 4);

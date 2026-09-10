-- 무드 피커에 올릴 이모지를 고른다 — 감정이 6종에서 17종이 되면서 전부 올리면 선택지가
-- 기본 12 + 우리 이모지 17 = 29개가 된다. moodEmojis.ts 의 "12종 원칙" 자체가 "처음부터 다
-- 만들면 선택 마비만 생긴다"에서 나온 것이라, 늘어난 만큼 고를 수 있어야 한다.
--
-- 기본값 TRUE 인 이유: 기존 행은 전부 표정 6종(ANGRY/HAPPY/EXCITED/SAD/SLEEPY/LOVE)이라
-- 지금 무드 피커에 보이는 것과 정확히 같은 상태가 된다 — 이미 쓰던 사람의 화면이 바뀌지 않는다.
-- 새로 만드는 행의 기본값은 코드가 정한다(CoupleEmojiEmotion.defaultMoodVisible) — 상황 11종은
-- "지금 기분"이라기보다 활동이라 꺼진 채로 시작하고, 원하면 켜서 올린다.
-- (H2 호환 구문만 사용 — 테스트가 동일 마이그레이션을 적용한다)

ALTER TABLE couple_emojis ADD COLUMN mood_visible BOOLEAN NOT NULL DEFAULT TRUE;

-- 럽슐랭 카테고리 통합 — 한식/중식/일식/양식을 "음식점" 하나로 합친다.
-- 국가별 세분화가 실사용 대비 카테고리 칩만 늘리는 과한 분류였다는 판단
-- (docs/LOVELICHELIN_IA_SIMPLIFICATION.md). 프론트 PLACE_CATEGORIES 축소와 짝을 맞춘다.
UPDATE places
SET category = '음식점'
WHERE category IN ('한식', '중식', '일식', '양식');

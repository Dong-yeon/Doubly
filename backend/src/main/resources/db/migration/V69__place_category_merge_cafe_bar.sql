-- 럽슐랭 카테고리 2차 통합 — 카페+디저트를 "카페·디저트"로, 술집을 "음식점"으로 합친다.
-- V68(한식/중식/일식/양식 -> 음식점)에 이어 카테고리 12 -> 7개로 축소
-- (docs/LOVELICHELIN_IA_SIMPLIFICATION.md).
UPDATE places
SET category = '카페·디저트'
WHERE category IN ('카페', '디저트');

UPDATE places
SET category = '음식점'
WHERE category = '술집';

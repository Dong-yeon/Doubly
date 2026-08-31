-- 콘텐츠(영화·공연·드라마)도 Place와 같은 이유로 위시리스트/완료 상태 개념을 없앤다
-- (docs/LOVELICHELIN_IA_SIMPLIFICATION.md, V70__drop_place_status.sql과 같은 결정 —
-- ContentStatus는 애초에 "Place의 WISHLIST/VISITED와 같은 축"으로 설계됐다).
ALTER TABLE contents DROP COLUMN status;

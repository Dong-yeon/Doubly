-- 콘텐츠 포스터 이미지 — TMDB 검색 연동(2026-08-25)으로 채워진다. 제목 직접 입력 시엔 null.
ALTER TABLE contents ADD COLUMN poster_url VARCHAR(500);

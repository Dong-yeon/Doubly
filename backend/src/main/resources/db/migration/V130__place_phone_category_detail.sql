-- 럽슐랭 장소에 "무엇을 파는 곳인지"(세부 분류)와 전화번호 — 카카오 검색 결과에 있는데 버리던 값이다.
-- 설계: docs/LOVELICHELIN_PLACE_INFO_2026-10-06.md
--
-- category_detail: 카카오 category_name("음식점 > 한식 > 냉면")의 마지막 1~2단계("한식 · 냉면"). 7종 카테고리(category)는 그대로.
-- phone: 카카오 phone. 장소 상세의 [전화] 버튼.
-- 상세 링크는 저장하지 않는다 — kakao_place_id 로 서버가 만든다(PlaceLinks).
--
-- 둘 다 nullable, 기존 행은 비워 둔다(백필하지 않는다 — 다시 검색해 담을 때부터 채워진다).
-- H2·PostgreSQL 공통 문법만(CLAUDE.md 4절).
-- 롤백: alter table places drop column phone; alter table places drop column category_detail;
alter table places add column phone varchar(30);
alter table places add column category_detail varchar(50);

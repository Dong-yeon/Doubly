-- 같은 커플 안에서 카카오 장소 하나는 한 행뿐이다 — docs/LOVELICHELIN_CHAT_LINK_2026-10-02.md §1.
--
-- 앱 쪽 중복 방지(PlaceService.save 의 findExisting)는 "찾아보고 없으면 넣는다"라 두 사람이 같은
-- 장소를 동시에 담으면 둘 다 들어갈 수 있었다. 이제 늦은 쪽이 이 제약에 막히고, 서비스가 그 위반을
-- 잡아 먼저 들어간 행을 돌려준다(ON CONFLICT 는 H2 와 공통 문법이 아니라 쓰지 않는다).
--
-- kakao_place_id 가 NULL 인 행(직접 입력한 장소)은 몇 개든 허용된다 — 표준 UNIQUE 는 NULL 끼리
-- 같다고 보지 않는다. H2·PostgreSQL 둘 다 그렇다는 것은 PlaceDedupeFlowTest 가 확인한다.
--
-- V72 의 일반 인덱스는 이 제약이 만드는 인덱스와 열이 같아 지운다.
DROP INDEX idx_places_couple_kakao;
ALTER TABLE places ADD CONSTRAINT uk_places_couple_kakao UNIQUE (couple_id, kakao_place_id);

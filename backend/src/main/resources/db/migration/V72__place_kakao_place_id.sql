-- 식단 기록 화면 등에서 카카오 검색 결과를 그대로 저장할 때 같은 장소가 중복
-- 등록되는 문제를 막는다 — 카카오 장소 고유 id를 남겨 같은 커플 안에서는
-- 같은 장소를 다시 저장해도 기존 행을 재사용하도록 PlaceService.save()가 참조한다.
-- 직접 입력한 장소나 예전에 등록된 장소는 값이 없을 수 있어 nullable.
ALTER TABLE places ADD COLUMN kakao_place_id VARCHAR(50);
CREATE INDEX idx_places_couple_kakao ON places (couple_id, kakao_place_id);

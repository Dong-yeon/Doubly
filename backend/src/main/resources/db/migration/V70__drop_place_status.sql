-- 럽슐랭 위시리스트/방문완료 상태 개념 자체를 없앤다(2026-08-31 결정).
-- "다녀왔어요/가고 싶어요"를 정하는 경로가 두 개(추가 화면 수동 선택 vs 방문 기록 저장 시
-- 자동 전환)라 서로 어긋날 수 있었고(docs/LOVELICHELIN_IA_SIMPLIFICATION.md), 사용자
-- 결정으로 상태 구분 없이 "그냥 등록"만 하도록 단순화한다. 실제 방문 여부가 필요한 곳
-- (여행 회고의 "다녀온 장소 수")은 place_visits 존재 여부로 판정하도록 바꿨다
-- (PlaceRepository.countVisitedByTripId).
ALTER TABLE places DROP COLUMN status;

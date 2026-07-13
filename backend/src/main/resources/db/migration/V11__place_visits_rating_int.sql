-- place_visits.rating 를 SMALLINT → INTEGER 로 정렬.
-- JPA 엔티티(PlaceVisit.rating: Integer)는 INTEGER 를 기대하는데 V8 에서 SMALLINT 로
-- 만들어져, ddl-auto=validate 가 부팅을 막았다(Schema-validation: found int2, expecting integer).
-- 1~5 범위 CHECK 제약은 타입 변경 후에도 유지된다.
ALTER TABLE place_visits ALTER COLUMN rating TYPE integer;

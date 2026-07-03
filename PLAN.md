# Fitto 기능 계획 (PLAN)

> 로드맵 단계별 진행 상태는 [README.md](README.md) 참고. 이 문서는 예정된 기능의 상세 스펙을 담는다.

---

## Feature: 커플 맛집 지도 (Place Map)

### 목표
커플이 함께 방문한 맛집과 가고 싶은 장소를 공유 지도에 기록하는 기능.
기존 식단 기록(meals — 칼로리 분석)과 연동.

### 핵심 기능 (MVP)
1. 장소 핀 등록 — 방문완료 / 위시리스트 구분
2. 커플 공유 — 두 사람 모두 추가/수정 가능
3. 방문 기록 — 사진, 메모, 별점(1~5), 식단 기록(meal) 연동

### 스택
- 지도: 카카오맵 SDK (React Native)
- 백엔드: Spring Boot REST API
- DB: PostgreSQL (places, place_visits 테이블 추가)

### Non-goals (이번 MVP 제외)
- AI 데이트 코스 추천
- 외부 맛집 DB 연동 (네이버, 카카오 플레이스 검색)
- 리뷰 공개/소셜 기능

### DB 스키마

```sql
CREATE TABLE places (
    id          BIGSERIAL PRIMARY KEY,
    couple_id   BIGINT REFERENCES relations(id),
    name        VARCHAR(100) NOT NULL,
    address     TEXT,
    lat         DECIMAL(10,7) NOT NULL,
    lng         DECIMAL(10,7) NOT NULL,
    category    VARCHAR(30),
    status      VARCHAR(20) DEFAULT 'wishlist', -- visited | wishlist
    added_by    BIGINT REFERENCES users(id),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE place_visits (
    id          BIGSERIAL PRIMARY KEY,
    place_id    BIGINT REFERENCES places(id) ON DELETE CASCADE,
    visited_by  BIGINT REFERENCES users(id),
    visited_at  DATE NOT NULL DEFAULT CURRENT_DATE,
    rating      SMALLINT CHECK (rating BETWEEN 1 AND 5),
    memo        TEXT,
    image_url   TEXT,
    -- 원안은 food_logs(id) 참조였으나, 현재 코드베이스의 식단 테이블은 meals (V6__meals.sql)
    meal_id     BIGINT REFERENCES meals(id),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_places_couple ON places(couple_id);
CREATE INDEX idx_places_location ON places(lat, lng);
```

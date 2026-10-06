# 럽슐랭 장소 — "무엇을 파는 곳인지"와 외부 상세 링크 (2026-10-06)

> 먼저 읽은 문서: `docs/lovechelin-current-state.md`, `docs/LOVELICHELIN_COMPETITIVE_ANALYSIS_2026-10-02.md`.
> 1단계(세부 분류·전화·상세 링크)와 2단계(장소 상세 액션, 앱 안 브라우저)를 구현했다. 3단계("우리가 쌓는 메뉴·사진")는
> 사용자 판단으로 1~2단계를 먼저 써 본 뒤에 한다(§6).

---

## 0. 시작 전 확인

| 확인 | 결과 |
|---|---|
| 장소 검색 경로 통일(JS SDK → 서버 `GET /places/search`) | **이미 끝나 있었다**(2026-10-02 P0). `PlaceAddScreen` 은 `placeApi.search`, 지도 HTML 에 `keywordSearch` 없음 |
| `expo-web-browser` | **이미 의존성**(`~56.0.6`, 구글 로그인이 사용). 네이티브 모듈이 1.0.6 빌드에 들어 있어 `openBrowserAsync` 는 **빌드 없이** 쓸 수 있다. `app.json` 플러그인 항목은 없는데 필요 없다(구글 로그인이 같은 조건에서 동작 중) |
| 마이그레이션 번호 | 원격 최대 V129, 선점 0 → **V130** |

### kakao_place_id 가 없는 장소 비율 — 운영에서 돌릴 SQL(실행하지 않았다)
```sql
select count(*)                                                     as total,
       count(*) filter (where kakao_place_id is null)               as without_kakao_id,
       round(100.0 * count(*) filter (where kakao_place_id is null) / nullif(count(*), 0), 1) as pct
from places;
```
(`filter` 는 PostgreSQL 문법 — 운영 확인용이라 Flyway 에 넣지 않는다.) 이 비율의 장소는 상세 링크가 없어 [메뉴·정보 보기]가 카카오맵 **검색**으로 열린다.

---

## 1. 결정

| 결정 | 이유 |
|---|---|
| **메뉴·사진을 우리 앱에 가져오지 않는다** | 카카오 로컬 API 는 이름·주소·좌표·분류·전화·place_url 까지만 준다. **메뉴·사진·영업시간 API 는 없다.** 네이버 지도 장소 정보도 공개 API 가 없다(네이버 검색 API 의 지역 검색은 5건·기본 정보뿐) |
| 스크래핑 보류 | 두 서비스 약관이 금지하고, 페이지 구조가 바뀌면 조용히 깨진다. 운영 서버가 대량 요청 주체가 되는 위험도 있다 |
| AI 메뉴 요약 보류 | 근거가 될 실제 메뉴 데이터가 없다 — 지어낸 메뉴를 보여 주게 된다(AI 맛집 추천이 가게 이름을 AI 에게 묻지 않는 것과 같은 원칙) |
| **상세 URL 을 저장하지 않고 카카오 id 로 만든다** | `https://place.map.kakao.com/{id}` 규칙을 서버 한 곳(`PlaceLinks.detailUrl`)에 둔다. 카카오가 주소 형식을 바꾸면 그 한 줄만 고치면 저장된 모든 장소가 따라온다. 검색 응답의 `place_url` 을 저장했다면 행마다 고쳐야 한다. id 가 숫자가 아니면 만들지 않는다(엉뚱한 주소 방지) |
| 세부 분류 = category_name 의 마지막 1~2단계 | "음식점 > 한식 > 냉면" → "한식 · 냉면". 첫 단계(대분류)는 7종 카테고리가 이미 말한다. 7종 매핑(`mapCategory`)은 그대로 |
| 기존 장소 백필 안 함 | 카카오 재검색이 이름만으로는 다른 지점을 집을 수 있다. 다시 담을 때부터 채워진다 |
| **앱 안 브라우저로 연다**(2단계 수정) | 메뉴·사진을 볼 수 있는 곳은 카카오·네이버 장소 페이지뿐이다. 앱을 떠나 외부 브라우저로 보내면 돌아오기 어렵다 — iOS SFSafariViewController / Android Custom Tab 은 앱 위에 떠서 닫으면 그대로 돌아온다. "네이버지도처럼" 에 지금 가장 가까운 방법이다. expo-web-browser 는 이미 빌드에 있다 |
| WebView 임베드 시트 보류 | 카카오·네이버 페이지가 임베드를 막거나(앱 유도·로그인), 우리 WebView 쿠키·스크롤·뒤로가기를 다 다뤄야 한다. 실패하면 빈 시트가 된다. 앱 안 브라우저는 OS 가 이것들을 맡는다 |
| 구글 Places 사진 보류 | 유료(사진 요청당 과금), 국내 맛집은 카카오·네이버보다 데이터가 적다. 약관상 구글 지도와 함께 표시해야 하는 조건도 있다 |
| 앱 스킴(kakaomap:// · nmap://) 안 씀 | 앱이 없는 사람에게 깨지고, 스킴 조회(canOpenURL)는 iOS `LSApplicationQueriesSchemes` 가 필요해 app.json = 빌드다 |

---

## 2. URL 형식 (2026-10-06 curl 로 확인)

| 쓰임 | 모바일(앱 안 브라우저) | 웹(PC) | 비고 |
|---|---|---|---|
| 카카오 상세 | `https://place.map.kakao.com/{kakao_place_id}` | 같음 | 서버 `PlaceLinks` 가 만든다. 200 |
| 카카오 검색(상세 id 없을 때) | `https://m.map.kakao.com/actions/searchView?q={이름 구}` | `https://map.kakao.com/?q={이름 구}` | `map.kakao.com/link/search/…`·`map.kakao.com/?q=` 는 **모바일 UA 에서 `applink.map.kakao.com`(앱 설치 안내)로 넘긴다** — 그래서 모바일은 m.map |
| 네이버 지도 검색 | `https://m.map.naver.com/search?query={이름 구}` | `https://map.naver.com/p/search/{이름 구}` | `m.map.naver.com/search2/search.naver` 는 `/search` 로 넘어간다. 검색어 = 이름 + 도로명 주소의 **구까지**("을지면옥 서울 중구") — 번지까지 넣으면 검색이 좁아져 못 찾는다 |

검색어는 `encodeURIComponent`. 만드는 곳은 `frontend/src/utils/placeLinks.ts`(검색 링크만 — 상세 링크는 서버).

---

## 3. 무엇이 바뀌었나

### 1단계 — 서버
- `KakaoLocalClient.KakaoPlace` 에 `categoryDetail`·`phone`(기존 7개 인자 생성자 유지).
- `GET /places/search` 결과·채팅 링크 해석 후보·AI 추천 장소에 `categoryDetail`·`phone`·`detailUrl`(AI 추천은 `placeUrl` 을 같은 규칙으로 + `kakaoPlaceId`).
- **V130** `places.phone varchar(30)`·`places.category_detail varchar(50)` nullable. 저장 요청(`SavePlaceRequest`)·엔티티·`PlaceResponse`(+`detailUrl`).

### 1단계 — 앱
- 검색 결과 행(장소 추가·지도 검색·럽바디 장소 시트·채팅 링크 후보): "이름" 아래 **"세부 분류 · 동네"**(`placeSubtitle`) — 동네는 주소의 동/읍/면/가, 없으면 구.
- 저장 요청을 `toSavePlacePayload` 한 곳에서 만든다 — 화면마다 손으로 옮기다 `kakaoPlaceId`·새 필드가 빠지던 것(AI 추천 담기는 카카오 id 를 안 보내고 있었다 → 중복 방지가 안 됐다).

### 2단계 — 장소 상세
- 정보 카드: 카테고리 칩 옆 세부 분류 칩. 주소 아래 버튼 줄 **[메뉴·정보 보기] [전화] [네이버에서 보기]**(글자 버튼 — 새 아이콘 글리프는 폰트 = fingerprint 입력).
- 메뉴·정보: `detailUrl` 있으면 그것, 없으면 카카오맵 검색. 네이버: 네이버 지도 검색. **앱 안 브라우저**(툴바 = 앱 surface, 컨트롤 = primary, 닫기 버튼).
- 웹: `openBrowserAsync` 는 웹에서 **창 크기를 지정한 팝업**으로 연다(`ExpoWebBrowser.web.js` — `window.open(url, '_blank', features)`). 새 탭이 아니라 `window.open(url, '_blank')` 로 직접 연다. `null` 이면 팝업 차단 토스트.
- 실패: 앱 안 브라우저가 던지면 토스트 + `Linking.openURL` 로 대신.
- 전화: 번호가 있을 때만. `tel:` 은 `Linking.openURL`. `canOpenURL` 은 안 쓴다 — Android 11+ 는 매니페스트 `<queries>` 없으면 false 라 멀쩡한 폰에서 "못 건다"가 된다(넣으려면 빌드).
- AI 추천 카드의 "지도에서 보기" 링크도 앱 안 브라우저.

---

## 4. 검증

- 백엔드: `KakaoLocalClientMappingTest` +2(세부 분류 규칙·전화·빈 값, 상세 링크 규칙·숫자 아닌 id), `MealVisitTest` +1(저장·응답·직접 추가는 링크 null). **H2 전체·PostgreSQL 16 전체 통과.**
- 앱: typecheck · lint(오류 88건 그대로, 새 경고 0) · build:web(폰트 변경분 되돌림) · verify:nested-buttons.
- 웹(로컬 서버): 을지면옥(카카오 id·세부 분류·전화 있음) — 칩 "음식점"·"한식 · 냉면", 버튼 셋, [메뉴·정보] → `https://place.map.kakao.com/11223344` 새 탭, [네이버] → `https://map.naver.com/p/search/을지면옥 서울 중구` 새 탭.
  동네 분식(직접 추가) — [전화] 없음, [메뉴·정보] → `https://map.kakao.com/?q=동네 분식 서울 마포구`, 팝업 막힘 → 토스트.
- 검색 결과 행의 "세부 분류 · 동네"는 로컬 서버에 카카오 REST 키가 없어 화면으로는 못 봤다(함수·타입만) — 실기기에서 확인.

## 5. 배포 순서와 호환

1. **백엔드 먼저**(V130) — `main 485a6689` 로 이미 푸시, Railway 가 배포한다. 새 컬럼은 nullable 이고 응답 필드는 추가뿐이라 **구앱은 새 필드를 무시**한다(앱 JSON 파싱은 모르는 키를 버린다). 구앱이 보내는 저장 요청에는 새 필드가 없어 null 로 저장된다 — 문제없다.
2. **앱 EAS Update** — JS 만(expo-web-browser 는 이미 빌드에 있음, app.json·package.json 무변경) → fingerprint 1.0.6 그대로면 업데이트로 나간다.

## 6. 3단계(다음) — "우리가 쌓는 메뉴·사진"

사용자 요청으로 미뤘다(1~2단계를 먼저 써 본 뒤). 범위 메모:
- 장소 상세 상단 우리 사진 갤러리(방문 사진 최신순 가로 스크롤, 탭 = 크게).
- "우리가 먹은 메뉴" — **이미 있다**: P1 의 "여기서 먹은 것"(`GET /places/{id}/menu`, 장소 단위 1회 쿼리, docs/LOVEBODY_LOVELICHELIN_LINK_2026-10-05.md §8). 3단계에서 메뉴판과 합쳐 보여 줄지 정한다.
- [메뉴판 찍기] — 럽바디 메뉴판 AI 분석 재사용 → 편집 확인 화면 → 새 테이블 `place_menu_items`(place_id FK CASCADE, name, price, source MENU_BOARD|MEAL, created_by, created_at) + RelationRecordPurger 순서 + 기존 PlanGuard 메뉴판 분석 키.
- 범위 밖: 구글 Places 사진, 외부 이미지 검색, WebView 임베드, 스크래핑, AI 메뉴 추정.

## 7. 실기기 체크리스트
- [ ] iOS·Android, **카카오맵 앱이 있을 때/없을 때** [메뉴·정보 보기] — 앱 안 브라우저(Safari 뷰/Custom Tab)로 열리고 닫으면 상세로 돌아오는지(카카오 페이지가 앱 열기를 권해도 앱으로 튕기지 않는지)
- [ ] [네이버에서 보기] — 네이버 지도 앱 유무와 상관없이 앱 안 브라우저
- [ ] [전화] — 다이얼 화면이 뜨는지(iPad·웹은 안내 토스트)
- [ ] 웹(PC 앱)에서 두 버튼이 새 탭으로
- [ ] 검색 결과 행에 "한식 · 냉면 · 연남동" 처럼 보이는지(장소 추가·지도 검색·럽바디 장소 시트·채팅 링크)
- [ ] 다크 모드에서 앱 안 브라우저 툴바 색

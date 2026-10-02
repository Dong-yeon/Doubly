# 럽슐랭 P0 — 카카오 검색 통일 + 채팅 링크 칩 (2026-10-02)

> 선행 문서: `docs/lovechelin-current-state.md`(코드 분석), `docs/LOVELICHELIN_COMPETITIVE_ANALYSIS_2026-10-02.md`(백로그·결정),
> `docs/LOVELICHELIN_IA_SIMPLIFICATION.md`(status 컬럼을 V70 에서 지운 이유 — 이번에도 다시 넣지 않았다)

## 0. 결론

| 단계 | 바뀐 것 | 마이그레이션 |
|---|---|---|
| 1 | 장소 추가 검색을 서버 카카오 검색(`GET /places/search`)으로 통일 → `kakao_place_id` 가 항상 저장된다. 검색 결과 탭 = 바로 저장. 저장 응답의 `created` 로 중복을 가려 "이미 럽슐랭에 있어요" → 그 장소 상세. 카테고리 매핑은 서버 `KakaoLocalClient.mapCategory` 한 곳 | **V117** `UNIQUE (couple_id, kakao_place_id)` |
| 2 | 채팅 텍스트 말풍선의 지도 링크 아래 "럽슐랭에 추가할까요?" 칩 → 누르면 `POST /places/resolve-link` → 후보 시트 → 고르면 `POST /places` 로 저장 | 없음 |

**배포**: 서버는 `main` 에 push 하면 Railway 가 배포한다. **앱은 OTA 로 나가지 않는다** — `package.json` 의 `scripts` 에
`verify:place-link` 를 등록했고, 그 한 줄이 EAS fingerprint 를 바꾼다(실측: origin/main 대비 유일한 차이가
`packageJson:scripts`). 사용자 결정(2026-10-02): 등록을 유지하고 다음 네이티브 빌드에 싣는다. 그 전까지 기존 앱(1.0.4/1.0.5)은
예전 동작 그대로다 — 서버 변경은 하위 호환이라(새 필드 `created` 는 추가뿐, 새 엔드포인트는 안 부르면 그만) 깨지지 않는다.

## 1. 운영 중복 데이터 점검 (UNIQUE 제약 추가 전)

`UNIQUE (couple_id, kakao_place_id)` 는 운영에 중복 행이 하나라도 있으면 마이그레이션이 실패한다(그러면 Railway 배포가 헬스체크에서
멈춘다). 배포 전에 운영 DB(PostgreSQL)에서 아래 쿼리를 돌린다. 읽기만 하는 쿼리다.

```sql
-- ① 같은 커플 안에서 kakao_place_id 가 겹치는 묶음
SELECT couple_id, kakao_place_id, COUNT(*) AS n,
       STRING_AGG(id::text, ',' ORDER BY id) AS place_ids
FROM places
WHERE kakao_place_id IS NOT NULL
GROUP BY couple_id, kakao_place_id
HAVING COUNT(*) > 1;

-- ② 겹치는 행마다 딸린 데이터 — 병합할지 판단하는 근거
SELECT p.id, p.couple_id, p.name, p.kakao_place_id, p.trip_id, p.lovelichelin_tier, p.created_at,
       (SELECT COUNT(*) FROM place_visits v WHERE v.place_id = p.id)  AS visits,
       (SELECT COUNT(*) FROM place_ratings r WHERE r.place_id = p.id) AS ratings
FROM places p
WHERE (p.couple_id, p.kakao_place_id) IN (
  SELECT couple_id, kakao_place_id FROM places
  WHERE kakao_place_id IS NOT NULL
  GROUP BY couple_id, kakao_place_id HAVING COUNT(*) > 1)
ORDER BY p.couple_id, p.kakao_place_id, p.id;
```

- SDK 경로로 추가된 장소는 `kakao_place_id` 가 NULL 이라 ①에 잡히지 않는다. 이름만 같은 중복은 제약 대상이 아니다.
- **정리 방식(사용자 결정)**: 중복이 있으면 가장 오래된 행으로 병합한다 — 방문 기록·반응을 옮기고, 평점은 사람마다 최근 값 하나만
  남기고, 등급을 다시 계산한 뒤 나머지 행을 지운다.
- **점검 결과**: _사용자가 운영에서 돌린 결과를 기다리는 중 — 받으면 여기 적는다._

NULL 은 몇 개든 허용된다(표준 UNIQUE 는 NULL 끼리 같다고 보지 않는다). H2 는 `PlaceDedupeFlowTest`
(`DB_제약_kakaoPlaceId가_NULL인_수동_장소는_여러_개_허용된다`)로, PostgreSQL 은 같은 테스트를 PG 로 돌려 확인했다(§6).

## 2. 동시 저장 — 왜 이렇게 했나

두 사람이 같은 장소를 거의 동시에 담으면 둘 다 "없다"를 보고 INSERT 한다. 늦은 쪽은 V117 에 막힌다. `ON CONFLICT` 는 H2 와
공통 문법이 아니라 못 쓴다(CLAUDE.md 4절). 그래서 `PlaceService.save` 는 트랜잭션을 걸지 않고(`NOT_SUPPORTED`)
`TransactionTemplate` 으로 저장을 시도하다가 `DataIntegrityViolationException` 이면 **새 트랜잭션에서** 먼저 들어간 행을
돌려준다(`created=false`). 같은 트랜잭션은 롤백 표시가 붙어 재사용할 수 없다 — `JournalService.save` 와 같은 패턴.

남는 것: 경합으로 진 쪽도 `PlanGuard.requireCapacity` 를 이미 지나 `FEATURE_USED` 가 한 번 더 찍힌다(계측 1건 과다, 한도는 안 깎임).

## 3. 왜 칩을 눌렀을 때만 해석하나

- 메시지가 그려질 때마다 서버를 부르면 스크롤 한 번에 요청이 수십 개가 되고, 과거 메시지를 불러올 때마다 다시 나간다.
  해석 한 번이 외부 요청(지도 페이지 최대 6 hop + 카카오 검색 1~2회)이라 비용이 링크 수에 비례한다.
- 사용자가 관심 없는 링크까지 서버가 대신 열어 볼 이유가 없다(개인정보·SSRF 노출면도 줄어든다).
- 그래서 칩 노출은 **문자열만** 보고(`utils/placeLinkHosts.ts`, 순수 함수 + `npm run verify:place-link`) 정하고, 서버는
  시트가 열릴 때 한 번 부른다. 레이트리밋은 사용자당 10분 20회(Redis, fail-open — `AuthRateLimiter` 와 같은 방식).

## 4. 링크 해석 — 카카오·네이버

**허용 호스트**(서버 `PlaceLinkHosts.ALLOWED_HOSTS` = 프론트 `PLACE_LINK_HOSTS`, 두 곳을 함께 고친다):
`place.map.kakao.com`, `kko.to`, `map.kakao.com`, `naver.me`, `map.naver.com`, `m.place.naver.com`.
콘텐츠·인스타는 2차 — 두 목록에 한 줄씩 더하면 된다.

**SSRF 방어**(`PlaceLinkFetcher`): https·기본 포트만, `user@host` 금지, 리다이렉트는 따라가지 않고(JDK `Redirect.NEVER`)
hop 마다 허용 목록·DNS 를 다시 본다(최대 5회). DNS 결과에 사설(10/8·172.16/12·192.168/16)·루프백·링크로컬(169.254 — 클라우드
메타데이터)·CGNAT(100.64/10)·0/8·멀티캐스트·IPv6 ULA(fc00::/7)·IPv4-mapped 사설이 하나라도 있으면 차단. 연결 3s, 응답 5s
(본문까지), 본문 512KB 상한. **남는 틈**: DNS 검사와 실제 연결 사이의 리바인딩 — 허용 목록이 카카오·네이버 소유 도메인뿐이라
기댄다. 남의 도메인(범용 단축 URL 등)을 목록에 넣는다면 연결 IP 를 고정하는 방식으로 바꿔야 한다.

**카카오**: 장소 id 로 상세를 주는 **공식 카카오 로컬 API 는 없다**(공식 문서의 로컬 API 는 주소↔좌표·좌표→행정구역·좌표계 변환,
키워드·카테고리 검색뿐 — 2026-10-02 확인). 그래서 링크에서 id 를 꺼내고(`/{id}`, `/m/{id}`, `/link/map/{id}`, `?itemId=`),
`place.map.kakao.com/{id}` 페이지의 og:title(가게 이름)로 키워드 검색해 **id 가 같은 결과**를 고른다. 이름만으로 못 찾으면
og:description(주소)의 앞 두 마디를 붙여 한 번 더 찾는다. 찾으면 후보는 그 하나(`matched=true`).
- 실측: 카카오 장소 페이지는 브라우저 UA 에 403, 미리보기 UA(`DublyLinkPreview/1.0`)에는 og:title·og:description 을 준다.
  지도 화면 링크(`map.kakao.com/?itemId=`)의 og:title 은 "카카오맵"뿐이라 열지 않고 정본 페이지로 바로 간다.
- 실측 확인(라이브): `place.map.kakao.com/634902312`, `map.kakao.com/?itemId=634902312`, `map.kakao.com/link/map/634902312`
  모두 정본으로 가서 "누데이크 성수" / 주소를 읽었다.

**네이버**: 네이버 장소 id 로 조회하는 **공식 API 는 없다고 가정했고, 확인한 범위에서 그렇다**(검색 API 의 지역 검색은 키워드
검색이고 네이버 장소 id 를 돌려주지 않는다). 그래서 이름(+지역)으로 **카카오** 검색 후보 1~3개를 보여 주고 사용자가 고른다 —
서로 다른 지도의 장소를 기계가 같은 곳이라 단정하지 않는다(`matched=false`, 최상위 `existingPlaceId` 도 비운다. 후보마다의
`existingPlaceId` 는 채운다).
- 실측: `map.naver.com/p/entry/place/{id}` 의 og:title 은 "네이버지도"뿐 → id 를 꺼내 `m.place.naver.com/place/{id}/home`
  (→ 업종별 `/restaurant/{id}/home` 리다이렉트)을 연다. 거기 og:title 이 "못 MOAT : 네이버"(접미사를 뗀다), 주소는 og 가 아니라
  페이지 JSON 의 `roadAddress`(512KB 안, 366KB 지점).
- **네이버는 미리보기 봇이 아닌 UA 에 429 를 준다**(우리 UA 는 429, `facebookexternalhit` 는 200). 다른 회사 크롤러로 위장하지
  않았다 — 사용자가 판단할 일이다. 대신 **공유 문구 차선**을 넣었다: 앱이 링크가 붙은 메시지 본문을 함께 보내고(`messageText`,
  저장 안 함), 페이지에서 이름을 못 읽으면 "[네이버 지도] / 가게 이름 / 주소 / 링크" 형태의 공유 문구에서 이름·주소를 꺼낸다
  (`PlaceLinkPageParser.fromShareText`). 머리표("[네이버 지도]"·"[카카오맵]")나 주소 줄(광역 지자체 + 시·군·구)이 있을 때만
  믿는다 — "여기 가보자 https://naver.me/…" 같은 대화를 검색어로 쓰지 않는다. 허용 목록 밖·내부망 차단으로 막힌 링크는
  공유 문구로 우회하지 않는다.
- 따라서 **지금 네이버 링크는 사실상 공유 문구에 기대어 동작한다**. 링크만 붙여 넣은 경우는 장소 추가 화면(빈 검색어)으로 간다.

**실패**는 예외가 아니라 빈 후보다. 앱은 시트를 닫고 읽은 이름(`ogTitle`)을 검색어로 채운 장소 추가 화면을 연다(열리자마자 검색).

## 5. 앱 동작

- 칩: 텍스트 말풍선(보내는 중·삭제됨 제외) 아래 한 줄, 보낸 쪽·받는 쪽 모두. 닫기(X)는 그 메시지에만, 기기 저장(최근 300개).
  **연달아 3번 닫으면 한 번만** "채팅 링크 제안을 끌까요?"를 묻고, 다시 켜는 자리는 **설정 > 기능 > 채팅 링크 제안**
  (채팅 전용 설정 화면이 없어 맞춤법 제안 옆에 둔다). 칩을 눌러 쓰면 연속 횟수는 0으로.
- 시트: 이미 있음 → "이미 럽슐랭에 있어요 · 보러 가기", 후보 → 누르면 저장(별점 묻지 않음 = 방문 0건 = 가고 싶은 곳),
  저장 응답이 `created=false`(그 사이 상대가 담음) → 그 장소로. 402 → 시트를 닫고 기존 업그레이드 시트(iOS 에서 시트 둘이
  겹치면 뒤의 것이 안 뜬다). status 0 → "연결이 불안정해요" + 다시 시도.
- 저장이 새 장소를 만들면 서버가 `CoupleEvent.PLACE` 를 발행 → 상대 앱(채팅방·홈)이 럽슐랭 목록 캐시를 비운다.
  "OO님이 추가함" 같은 표시는 메시지에 영구 저장하지 않았다(범위 밖).
- 채팅 → 장소 추가는 다른 탭에서 여는 경로라 `PlaceStackNavigator` 가 `returnTo` 일 때 iOS 네이티브 모달 대신 일반 push 를
  쓴다(`crossTabModalOptions`, 2026-10-01 럽바디와 같은 처방). 홈 → 장소 추가 경로에도 같이 적용된다.
- 아이콘은 이미 서브셋에 있는 것만 썼다(새 글리프 = 폰트 변경 = fingerprint 변경). `build:web` 후 `assets/fonts` 무변경 확인.

## 6. 검증

- 백엔드 H2 전체: **997건 통과**. 첫 실행에서 6건이 깨졌다 — `save()` 를 `NOT_SUPPORTED` 로 두어 바깥 트랜잭션(테스트)이 만든
  커플이 안 보였다. `SUPPORTS` 로 고쳐 다시 돌렸다(§2).
- 백엔드 PostgreSQL 16 전체: 997건 중 80건이 컨텍스트 로드 단계 `FATAL: sorry, too many clients already` — 알려진 PG 전체 실행
  한계(코드 문제 아님). 실패 클래스만 다시 돌려 모두 통과(83건 중 7건이 또 커넥션 한도 → 그 2클래스만 다시 → 통과).
  `com.fitto.place.*` 80건은 빈 DB 에서 따로 통과 — V117 제약 생성, V72 인덱스 삭제, NULL 여러 행 허용, 동시 저장 확인.
- 라이브(외부 HTTP, 임시 테스트로 돌리고 지움): 카카오 링크 3형태 → 정본 페이지 → "누데이크 성수"·주소. 네이버는 429(§4).
- 로컬 스택(localhost 백엔드 + 웹, 로컬 테스트 계정): 지도 링크 2개에만 칩이 뜨고 유튜브에는 안 뜸 / 칩 탭 때만
  `resolve-link` 1회(말풍선 렌더 중 0회) / 후보 없음 → "링크의 장소를 직접 찾아볼게요" + 장소 추가 화면에 "누데이크 성수" 자동 검색 /
  닫으면 채팅으로 복귀 / 연달아 3번 닫자 끄기 안내 → 끄기 → 설정의 스위치 꺼짐 / 중복 저장 `created=false`·"이미 럽슐랭에 있는
  장소예요.". 로컬에 카카오 REST 키가 없어 **후보 목록·이미 있음 화면은 웹에서 보지 못했다**(단위 테스트로만).
- 프론트: `npm run typecheck` 통과, 새 파일 lint 오류 없음(ChatRoomScreen·DietRecordScreen 의 기존 오류는 origin/main 에도 있다),
  `verify:place-link` 29/29, `verify:linkify` 24/24(linkify.ts 는 안 고쳤다), `verify:nested-buttons` 통과, `build:web` 통과,
  `assets/fonts` 무변경.
- fingerprint(android): origin/main 과 이 브랜치의 차이는 `packageJson:scripts` 하나 → 앱은 다음 빌드(§0).

## 7. 남은 리스크

1. **네이버 링크의 해석률** — 페이지가 429 라 공유 문구에 기댄다. UA 정책을 정해야 한다(§4).
2. 실기기·iOS 미검증 — 앱은 다음 빌드에 실린다. 칩 위치(말풍선 아래 + 리액션 칩 위), 시트, 크로스탭 push 를 그때 본다.
3. 로컬에 카카오 REST 키가 없어 후보 시트는 단위 테스트로만 검증했다. 운영에 배포된 뒤 실제 링크 몇 개로 확인한다.
4. 카카오 페이지 구조(og 태그)·네이버 리다이렉트 모양이 바뀌면 해석이 조용히 빈 후보가 된다 → 장소 추가 화면으로 가므로
   막히지는 않는다.

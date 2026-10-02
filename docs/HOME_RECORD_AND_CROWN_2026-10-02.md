# 홈 — "최근 기록 한 줄" 정리 + 이름 옆 럽슐랭 왕관 (2026-10-02)

> 선행 문서: `docs/HOME_SCREEN_ANALYSIS_2026-09-12.md`(홈 칩 3개 결정 — 유지), `docs/FEED_AND_CALENDAR_UX_2026-09-14.md`,
> `docs/lovechelin-current-state.md`

## 1단계 — 홈 열의 "최근 기록 한 줄"

### 문제
- 홈은 `feedApi.timeline(null, 12)` 의 가장 최근 1건을 썼다 — 종류를 가리지 않아 럽슐랭 방문·콘텐츠 관람을 남기면 그날의
  식단·운동이 밀려났다.
- 한 줄 규칙(`recordLabel`)이 content 를 title 보다 먼저 썼는데, 방문·관람의 content 는 "★★★★ 메모"
  (`FeedItemMapper` 방문·관람 매핑)라 메모가 없으면 홈에 "★★★★"만 떴다.

### 결정
| 항목 | 결정 | 이유 |
|---|---|---|
| 제외 대상 | `PLACE_VISIT`, `CONTENT_LOG` (FeedItemType) — 프론트 `utils/feedSummary.ts` 의 `HOME_RECORD_EXCLUDE` 한 곳 | |
| 거르는 자리 | **서버 선택 파라미터** `GET /feed?exclude=PLACE_VISIT,CONTENT_LOG` + 클라이언트에서도 한 번 더 | 클라이언트 필터 + limit 상향은 그 종류가 limit 을 다 채운 날(맛집 투어) 빈 줄이 된다. 서버는 그 소스의 쿼리 자체를 건너뛰어 일도 줄어든다. 예전 앱은 파라미터를 안 보내 그대로, 파라미터를 모르는 서버가 응답해도 클라이언트 필터가 기준을 지킨다 |
| 걸러서 비면 | 지금처럼 줄을 비운다("아직 기록이 없어요" 안 띄움) | |
| 한 줄 요약 | 서버가 `FeedItemResponse.summary` 를 싣는다 — 방문·관람은 "이름 ★4"(별점 없으면 이름만), 나머지는 content → title | 한 줄 자리가 늘어도 규칙이 한 곳. 피드 카드 본문(title/content)은 그대로 — FeedTimelineScreen 표시는 안 바뀐다 |
| 예전 서버 대비 | summary 가 없으면 방문·관람은 title("트라토리아 방문"), 나머지는 content → title | |

### content 만 쓰던 다른 곳 — 찾은 결과
- `screens/home/components/RecentPeek.tsx` — 같은 규칙이었다. **현재 어디서도 마운트되지 않는다**(주석에만 이름이 남음).
  규칙만 `feedSummary` 로 맞췄다.
- 안드로이드 홈 위젯(`widget/`) — D-day·스트릭만 그린다. 최근 기록을 쓰지 않아 **변경 없음**.
- `utils/messagePreview.ts` — 채팅 메시지 전용(피드와 무관). 변경 없음.
- 알림 — 방문·관람 푸시는 이미 "이름 — 장소 ★4" 형식(PlaceService/ContentService.recordVisit/recordLog). 변경 없음.
- 사진첩 캡션(`FeedService.captionOf`)은 title 이 먼저라 해당 없음.

### 남은 것
- 식단의 한 줄은 예전 규칙 그대로 content 먼저다. 항목 없이 메모만 남긴 끼니는 content 가 "점심"(끼니)이고 메모는 title 이라
  홈에 "점심"이 뜬다(로컬 확인). 이번 범위(장소·콘텐츠) 밖이라 두었다 — 바꾸려면 식단 summary 를 title 우선으로.

## 2단계 — 이름 옆 럽슐랭 왕관

### 표시 규칙(서버 `LovelichelinPulseService`, `GET /places/lovelichelin/pulse`)
| 상태 | 조건 | 표시 |
|---|---|---|
| CERTIFIED | 그 사람이 대표 평점을 남긴 장소·콘텐츠가 최근 24시간 안에 등극(`lovelichelin_certified_at`) | 처음 볼 때 한 번 반짝, 이후 정지 |
| TODAY | 오늘(KST) 그 사람이 방문 기록·관람 기록·대표 평점(재평가 포함) 중 하나라도 남김 | 정지 |
| 없음 | — | 표시 없음 |

- 둘 다면 CERTIFIED. 등극은 둘 다 평가해야 하므로 **보통 두 사람 왕관이 같이 반짝인다**(같은 열쇠).
- 누를 곳: CERTIFIED 면 그 등극한 곳(여럿이면 가장 최근), TODAY 면 오늘 가장 마지막에 손댄 곳.
- 시간대: 기록 시각은 서버 벽시계(운영 UTC)로 저장된다. KST 하루 경계를 `fitto.storage-zone`(기본 JVM TZ)으로 바꿔 비교한다 —
  `GameStreakService`·`MemoryDates` 와 같은 규칙. 24시간은 저장 TZ 의 지금 기준(등극 시각도 같은 벽시계).
- 미연결이면 빈 신호(404 아님) — 홈이 매번 부르므로.
- 새 테이블·마이그레이션 없음 → Purger·Flyway 변경 없음.

### PRO 왕관과 헷갈리지 않게
- 자리: CoupleHero 이름 줄, 스트릭(HeartSproutIcon) 옆. 아바타 모서리(무드 배지), 운동/식단 줄(매일의 과제)은 피했다. 홈 칩 3개 결정 유지.
- 색: `colors.togetherText`(LovelichelinBadge 와 같음, 다크 #C9DA97 확인). PRO 왕관은 primary 계열.
- 이름 줄을 **아바타 버튼 밖으로 뺐다** — 왕관 버튼이 아바타 버튼 안에 있으면 웹에서 버튼 안 버튼(`verify:nested-buttons`).
  이름을 눌러도 예전처럼 그 사람 기록으로 가도록 이름·스트릭을 같은 동작으로 감싸고 스크린리더에는 숨겼다(아바타 버튼 라벨이 같은 말).

### 반짝임
- 본 등극 열쇠(`PLACE:id:certifiedAt`)를 AsyncStorage 에 기억(최근 50개). **못 읽으면 반짝이지 않는다.**
- `AccessibilityInfo.isReduceMotionEnabled()` 를 반짝이는 순간 직접 묻는다(훅은 처음 false 로 시작해 늦게 바뀌어 그 사이에
  반짝일 수 있다). 묻지 못하면 줄인 것으로 친다.
- RN Animated + native driver(`useOneShotMotion` 과 같은 방식), 한 번 커졌다 돌아오고 끝 — 루프 없음.
- **끝까지 돈 뒤에만 '봤음'**으로 적는다. 처음엔 시작할 때 적었는데, 화면이 가려져 있으면(웹 탭이 뒤) 애니메이션 프레임이 돌지
  않아 아무도 못 본 반짝임이 '봤음'이 됐다(검증 중 발견, §검증).

### 누르면
- 럽슐랭 탭 스택의 PlaceDetail / ContentDetail(`navigate('Place', { screen, initial: false })`).
- **상대 왕관인데 내 대표 평점이 없으면** `openRating: true` 로 평가 영역을 펼친 채 진입. 기존 화면에 그 파라미터가 없어 두 상세
  화면에 선택 파라미터를 추가했다(사용자 메시지가 이 지점에서 끊겨 있어 이렇게 가정했다 — 다르면 고친다). 웹은 URL 에 실려
  문자열로 오므로 `String(...) === 'true'` 로 읽는다.

## 검증
- 백엔드 H2 전체 **967건 통과**. 새 테스트: `FeedHomeSummaryTest` 6건(요약·제외·한도 채운 날), `LovelichelinPulseTest` 8건
  (없음·오늘 방문·평점만·콘텐츠·등극·24시간 경과·KST 자정 경계·미연결).
- PostgreSQL 16: feed·place·content 133건 통과(새 JPQL 포함).
- 프론트: typecheck 통과, 새/수정 파일 lint 오류 없음(경고는 기존), `verify:nested-buttons` 통과, `build:web` 통과, 아이콘 폰트 무변경.
- 로컬 스택 웹(로컬 테스트 계정): 내 줄은 나중에 남긴 방문 대신 식단 / 상대 줄은 방문뿐이라 빈 줄 / 두 이름 옆 왕관(togetherText,
  버튼 중첩 없음) / 상대 왕관 → `place/3?openRating=true` 로 평가 영역 펼침 / 5점 → 3스타 등극 → 홈 두 왕관 CERTIFIED·같은 열쇠 /
  내 왕관 → openRating 없이 진입.
- **반짝임 자체는 눈으로 못 봤다** — 브라우저 패널이 가려진 상태라 requestAnimationFrame 이 0프레임이었다. 재생 시작
  (동작 줄이기 false·첫 등극 true)과 "가려진 동안 '봤음'으로 적지 않음"까지만 확인했다. 실기기에서 한 번 볼 것.
- 배포: fingerprint 입력(package.json·app.json·assets·modules) 변경 없음 → **EAS Update 로 배포 가능**. 서버를 먼저(push) 올린다 —
  새 앱이 부르는 `/places/lovelichelin/pulse`·`exclude`·`summary` 가 서버에 있어야 한다(없어도 왕관이 안 뜨고 한 줄이 예전처럼 나올 뿐 깨지진 않는다).

# Doubly UX·UI 종합 감사 보고서

> 2026-08-04. 프론트엔드 화면 54개 전체를 대상으로 한 코드 기반 감사.
> UX 8개 영역(온보딩·인증 / 공용 컴포넌트·네비게이션 / 홈·채팅 / 운동 / 식단·피드 / 맛집·여행 /
> 마이·트레이너 / 모바일 제스처) + UI 3개 영역(스타일 일관성 / Duo 컬러·다크모드 / 타이포·여백 위계).
> 위치 표기는 `파일:라인` (분석 시점 기준 — 코드 변경 시 어긋날 수 있음).

---

## 총평

개별 화면의 완성도 — 파괴적 액션의 안내 문구, 대비 실측 주석, 햅틱 74곳, 당겨서 새로고침
16화면, 낙관적 UI, `runBusy` 전역 잠금 — 는 수준이 높다. 문제는 **화면을 가로지르는 규칙이
없어 같은 결함이 도메인마다 복제**된 것. 발견의 대부분은 개별 버그가 아니라 아래 8개 패턴의
반복이며, 패턴 단위(공용 컴포넌트·프리셋·훅)로 고치면 수십 건이 한 번에 해소된다.

---

## 1. 스와이프 뒤로가기 진단 (사용자 제보 이슈)

"뒤로가기 버튼을 꼭 눌러야만 뒤로가기가 된다" — 원인 3중 복합, 전부 해결 가능.

| 원인 | 근거 | 해법 |
|---|---|---|
| **A. 웹 PWA (확정·최우선)** — `NavigationContainer`에 `linking` 없음 → 화면을 깊이 들어가도 브라우저 히스토리 1개 → 가장자리 스와이프 = 앱 전체 이탈 | `RootNavigator.tsx:37`, `src` 전체에 linking 설정 0건 | linking 경로 맵 추가 (`prefixes: ['doubly://', 'https://<배포도메인>']` + screens 맵) |
| **B. Android 네이티브 (확정)** — native-stack은 Android 스와이프백 미지원 + predictive back off → 스와이프해도 시각 피드백 0 | `app.json:70` `predictiveBackGestureEnabled: false` | `true` 한 줄 (EAS 리빌드 필요) |
| **C. iOS 위험 요인** — 전 스택 `headerBackVisible:false` + 커스텀 `headerLeft`는 iOS 스와이프백을 죽이는 고전 패턴. 도입 사유(웹 백버튼 아이콘 미표시)는 App.tsx 아이콘 폰트 로드로 이미 해소됨 | `headerOptions.tsx:45-51` → 4개 탭 스택 전체 적용 | 커스텀 백버튼 제거(기본 백버튼 복귀), 유지 시 `gestureEnabled/fullScreenGestureEnabled: true` 명시 |

- 무혐의: 카카오맵 WebView(스택 루트에만 렌더), gesture-handler 구성(정상).
- **⚠️ 선행 조건**: 이탈 가드(`usePreventRemove`)가 앱 전체 0건 → 스와이프백을 살리기 전에
  폼 화면 가드부터(§2-①). 순서를 지키지 않으면 입력 유실 경로가 늘어난다.
- 온보딩 스택은 `headerShown:false`로 Register/ResetPassword에 상단 이탈구가 없음
  (`OnboardingNavigator.tsx:17`) — 함께 정리.

---

## 2. 반복되는 구조적 문제 8가지

### ① 데이터 유실 가드 전무 (최고 심각)

`beforeRemove` / `usePreventRemove` 사용 **0건**.

- 운동 세션: 이탈 확인이 하단 "종료" 버튼에만 (`WorkoutSessionScreen.tsx:170-179`) —
  헤더 백·하드웨어 백·스와이프로 나가면 체크한 세트 전량 소실.
- 모달 스와이프 이탈 시 입력 소실: `WorkoutRecord`, `WorkoutRoutineForm` (modalOptions 등록).
- 입력 모달 백드롭 = 닫기: 키보드 닫으려 바깥 탭 → 폼째 증발
  (`WorkoutSessionScreen:272`, `WorkoutRoutineFormScreen:125`, `BodyMetricScreen:211`,
  `ChallengeScreen:174`, `CoupleCalendarScreen:313-391`, `DietScreen:338` 영양목표 모달).
- 세션 상태 메모리 전용(영속화 없음), 휴식 타이머 백그라운드 정지·알림 없음.
- 운동 완료 공유 Alert를 dismiss하면 goBack이 안 돼 중복 저장 가능 (`WorkoutRecordScreen:109-126`).

### ② 키보드 처리 3단 편차

- KAV 자체가 없는 곳: 커플연결(`CoupleConnectScreen:67`), 피드작성(`FeedComposeScreen:58`),
  오늘의질문(`DailyQuestionScreen:98-120`), 장소상세(`PlaceDetailScreen:120`),
  여행폼(`TripFormScreen:87`), 트레이너연결(`TrainerConnectScreen:41`), 위 입력 모달들.
- 있어도 Android `behavior: undefined` — 전 화면 공통 패턴.
- `keyboardDismissMode` 앱 전체 0건 (채팅방 스크롤로 키보드 못 내림 — `ChatRoomScreen:330`).
- 오늘의질문: `keyboardShouldPersistTaps` 미지정 → **제출 버튼을 두 번 눌러야** 동작.
- 채팅 `keyboardVerticalOffset: 90` 하드코딩 → SE류 과보정 (`ChatRoomScreen:325-329`,
  `useHeaderHeight()`로 교체).

### ③ 롱프레스 전용 삭제 + 발견성 제로

삭제·수정이 11개 화면에서 롱프레스 전용인데, 안내 문구가 **빈 목록일 때만** 렌더
(`PlaceMapScreen:190`, `TripListScreen:114`, `TrainerMemberDetailScreen:100` 등) —
삭제할 항목이 생기는 순간 힌트가 사라진다. 힌트가 아예 없는 곳:
`WorkoutScreen:63`, `BodyMetricScreen:182`, `ChallengeScreen:141`, `FeedTimelineScreen:100`,
`DietRecordScreen:355`(즐겨찾기). 스와이프 액션(gesture-handler `Swipeable`)은 앱 전체 0건.

### ④ 이미지 뷰어 부재 + 비율 불일치

- 라이트박스/핀치줌 컴포넌트가 앱에 없음. 채팅 사진 200×200 고정 크롭 + 탭 무반응 —
  **원본을 볼 방법이 없음** (`ChatRoomScreen:268,470`). 여행 앨범 사진 탭 무반응
  (`TripAlbumScreen:113`). 사진첩 큰 보기: 좌우 스와이프·핀치줌·닫기 X 없음, 사진 탭 = 닫힘
  (`PhotoAlbumScreen:122-153`).
- 미리보기 vs 결과 비율 불일치: 식단 입력 1:1 → 카드 1.9:1(`MealCard:67`),
  피드 작성 4:3 → 타임라인 4:5(`FeedCard:179`). 체성분 진행 사진이 가로형 컨테이너라
  전신 세로 사진 잘림 (`BodyMetricScreen:286-304`), 썸네일 52px 확대 불가.
- 원격 이미지 전반에 placeholder/onError/페이드 없음 → `expo-image` 일괄 교체 가치.

### ⑤ 터치 타깃 44pt 미달 (누적)

| 요소 | 실측 | 위치 |
|---|---|---|
| 운동 탭 상단 링크 6개 | ~20px | `WorkoutScreen.tsx:85-109` |
| 식단 통계/캘린더 링크 | ~17px | `DietScreen.tsx:178-183` |
| "사진 제거/지우기" | ~15px | `DietRecordScreen:305`, `FeedComposeScreen:67` |
| 채팅 리액션 칩 | ~20px | `ChatRoomScreen.tsx:534-547` |
| 여행 일정 ▲▼✕ | 26×18px, gap 2 (오탭=삭제) | `TripDetailScreen.tsx:471-491,850-854` |
| 끼니·즐겨찾기·카테고리·필터 칩류 | ~30px | Diet/Place/Trip/Workout 전반 |
| 피드 반응 이모지 칩 | 30×30px | `FeedCard.tsx:190-199` |
| Button sm/md | 38/46px | `Button.tsx:85` |
| 별점 | 32px, 간격 8 | `PlaceDetailScreen.tsx:131-137` |
| 여행상세 "수정" 링크 | ~16px | `TripDetailScreen.tsx:345-347` |
| **FAB (핵심)** | 부모 밖 absolute → Android 터치 미수신 위험 | `MainTabNavigator.tsx:116-127,185-198` |

### ⑥ 로딩·에러 상태

- 스켈레톤/로딩 컴포넌트 0건 — 전 화면 "빈 화면 → 팝인".
- 통계류 로딩 중 "0일" 플래시 (`WorkoutStatsScreen:39`, `DietStatsScreen:38`).
- `catch`가 에러를 빈 상태로 위장: 홈 5개 API(`HomeScreen:87-98`), 캘린더 3종, 통계 2종,
  사진첩(`PhotoAlbumScreen:52`), 회고(`TripRecapScreen:55`) — "네트워크 끊김"이 "기록 없음"으로 보임.
- 홈 콜드 스타트마다 연결된 커플에게 "커플을 연결해보세요" 플래시 (`HomeScreen:83` + relationStore 미영속).
- AI 작업(최대 60초)이 취소 불가 전역 오버레이 — Android 백까지 삼킴 (`BusyOverlay`).

### ⑦ 캘린더·날짜 공통 결함

- 캘린더 3종(운동·식단·커플) 날짜 셀 **탭 불가**(`View`) — 그날 기록을 볼 수 없음.
- "오늘로" 복귀 없음, 월 스와이프 없음, 커플캘린더 선택 셀 대비 미미(`cellSelected` surfaceAlt).
- **오늘 날짜로만 기록 가능**: 운동(`WorkoutRecordScreen:89`), 체성분(`BodyMetricScreen:110`),
  식단(`DietRecordScreen:228`), 방문기록(`PlaceDetailScreen:79`) — `DateField` 재사용으로 해결.
- 여행 일정 시간이 자유 텍스트("09:00"만 통과) + 제출 후 토스트 검증 (`TripDetailScreen:579-588`).

### ⑧ 디자인 시스템 규칙 부재 (UI 감사 종합)

토큰 채택률은 높음(spacing 89%, radius 88%, 색 hex 리터럴 11건). 문제는 조합 규칙:

**타이포·여백**
- 섹션 제목 5종(12/700 ~ 16/800). fontWeight '800' 47%·'700' 40%·'400/500' 0건 —
  위계 소실. 식단 화면 텍스트 80%가 볼드. 모달 제목만 유일하게 8화면 일관(16/800) — 프리셋의 증거.
- 같은 14px 본문에 lineHeight 20/21/22/24 4종, 미지정 7곳(한국어 답답). 채팅 1.31 vs 피드 1.50.
- 카드 간 간격 8/16/24 3종, 하단 패딩 120/100/96/48/32/없음 6종
  (PlaceMap은 한 파일에서 96·120 혼용). `marginTop: 2` 리터럴 39건 → `spacing.xxs` 부재 신호.
- kcal 표기가 식단 한 화면에 3종(`1250/2000kcal`·`750kcal`·`총 1250 kcal`),
  천단위 콤마는 TripExpense 로컬 `money()`뿐.
- 즉시 버그: MY 제목 "MY" 이중 렌더(`MyScreen:294`+헤더), MY SafeArea top 중복(`MyScreen:292`),
  `nutLabel` width 36에 "칼로리" 3글자 줄바꿈(`DietScreen:399`).

**컴포넌트 이원화**
- 카드: 공용 `Card`(12화면, hairline 보더+그림자) vs 자체 스타일(24화면, 1px 보더+무그림자) —
  다수파가 자체 쪽. 모달 컨테이너 스타일 11곳 복제(`modalCard`/`sheet` 두 이름).
- 버튼: 캘린더 `addBtn`이 Button primary와 역할 동일한데 높이·반경·크기·굵기 4축 전부 다름
  (`CoupleCalendarScreen:470-481`). 아이콘 버튼 40/46 2종.
- 그림자: 화면 레벨 사용 0건 — depth 언어가 없고 Card 사용 여부의 부산물.

**Duo Color System (나=Coral·상대=Indigo·함께=Violet)**
- 삼항 방향(`mine ? coral : indigo`)은 21곳 전수 정상. 모범: `WeeklyRecapCard`(3색 정석).
- 🔴 **로고가 규칙 밖 색**(Pink `#FF7EB9`/Sky `#7DD3F0`, `DoublyLogo.tsx:23-24`) —
  CoupleHero에서 Coral/Indigo 얼굴 사이에 배치돼 색 코드 충돌.
- 🔴 `secondary`(=Indigo)/`accent`(=Violet) 별칭이 46곳에서 무의미한 강조색으로 소비 —
  상대색·함께색의 학습 가치 소실 (별점=Violet, 필터칩=Violet, 카테고리칩=Indigo 등).
- 🔴 핵심 "함께" 요소에 Violet 부재: 커플 스트릭이 내 스트릭과 동일 색(`DietScreen:239-244`),
  D+ 히어로 white 고정, 위젯에 together 키 없음.
- 채팅 한 화면에 소유자 표현 4갈래(인용 Coral/Indigo ✅, 운동카드 Indigo/Indigo ❌,
  식단카드 Violet/Violet ❌, 말풍선 Ink) (`ChatRoomScreen:466-518`).
- 오늘의질문 상대 답변 박스가 Violet(상대색이어야 함, `DailyQuestionScreen:143`).
- Card 틴트 이름 거짓(`pink`→회색, `mint`→상대색, `yellow`→함께색) + 내 통계 3카드가
  Ink→Indigo→Violet 배경 (`WorkoutStatsScreen:39-41`, `DietStatsScreen:38-40`).
- 두 달력의 일요일 색 불일치(Coral vs danger), Switch 트랙에 데이터색(coral).
- 🔴 **라이트 모드 대비 미검증**: coral on white 2.83:1, violet on white 4.04:1 등 AA 미달
  10여 곳 (다크는 전부 통과 — 역전 현상). 다크 `white on primary` 4.21:1 미달
  (`FeedCard:204` 주석은 통과라고 단언 — 사실과 다름).

**다크모드**
- `colors`가 모듈 로드 시 1회 평가(`colors.ts:126-128`) — 실행 중 전환 불가, 설정 항목도 없음.
- 하드코딩으로 다크 붕괴: `Badge.tsx:13-18`(8색 전부), `TripExpenseScreen:306`(#E7F5EE),
  `WorkoutRecordScreen:274`(#E6F7F2 — 형제 화면은 primaryBg), `ChatRoomScreen:499`(#E0A020).

---

## 3. 영역별 특기 사항 (패턴 외 개별 발견)

**온보딩·인증**
- 로그인 실패 에러가 항상 비밀번호 필드 아래(이메일 오류·구글 로그인 실패 포함) (`LoginScreen:66,76`).
- 재설정 서버 에러가 "확인" 필드에 표시(원인은 코드 필드) (`ResetPasswordScreen:118`).
- 초대코드 붙여넣기 위생 없음(공백·문장 → 조용히 실패) + `expiresAt` 미사용("24시간" 하드코딩)
  (`CoupleConnectScreen:102-105,73`).
- returnKeyType/다음 필드 포커스 온보딩 전멸, 회원가입 autoComplete·비밀번호 확인 필드 없음.
- 스플래시 1600ms 고정 대기 (`SplashScreen:31`).

**홈·채팅**
- 홈 고정 레이아웃: fontScale 1.3에서 ~40pt 잘림(heroSlot만 shrink), D+ 64px에만
  `allowFontScaling:false`(역전) (`HomeScreen:338`, `CoupleHero:61`).
- 채팅 과거 메시지 페이징 미연결(백엔드 커서 준비됨, `chatStore:50` + `onEndReached` 부재).
- 새 메시지 배지·읽음 구분선·날짜 구분선 없음. 첨부 아이콘 camera인데 동작은 갤러리.
- 전송 버튼이 텍스트+패딩으로 76pt — 320dp에서 입력창 112pt.
- 딥링크로 채팅방 직진입 시 뒤로가기·탭바 둘 다 없는 막다른 화면 가능 (`ChatScreen:46` replace + 탭바 숨김 + canGoBack 조건부 헤더).
- 리액션 줄+스티커+배너+맞춤법 바가 최대 4겹(~300pt) 동시 노출 가능.

**운동**
- 이전 기록 프리필 전무 + 스테퍼 없음 → 1종목 9~10탭.
- 세션 중 무게/횟수 수정 불가(읽기 전용). 루틴 순서 변경·항목 편집·저장 후 루틴 수정 전부 불가.
- 체중 차트 라벨 9px·14개 막대 중첩·X축 날짜 없음 (`BodyMetricScreen:260`).
- 운동 종목: 하드코딩 8종 칩, 검색·최근 이력 없음 → 표기 흔들림("벤치프레스"/"벤치 프레스").

**식단·피드**
- 🐛 텍스트 AI 분석 매크로가 화면에 미표시(photoUri 조건 안에 갇힘) (`DietRecordScreen:311-339`).
- 🐛 사진 제거 후 매크로·업로드 캐시 잔존 → 다른 음식에 이전 탄단지 저장 (`DietRecordScreen:305`).
- FAB "음식 촬영"이 카메라가 아닌 빈 폼 → 사진 저장까지 8~9탭. 저장마다 공유 Alert.
- 음식 DB 검색 자체가 없음(AI 60초 호출이 유일한 칼로리 조회 수단).
- 피드 사진 1장 제한(프론트·API·피커 3단 단수), 타임라인 포커스마다 1페이지 리셋+스피너.
- 사진첩 마지막 행이 탭바에 가림(SafeArea 미적용, `PhotoAlbumScreen:86`).

**맛집·여행**
- 지도: 마커 변경마다 WebView 전체 리로드(`KakaoMap.tsx:17-22` useMemo deps) — 줌·중심 리셋.
  현재 위치 기능 전무(기본 중심 서울시청). ScrollView 안 지도 제스처 충돌.
- 장소 추가에서 방문기록(별점·사진) 못 남김 → 6스텝 우회.
- 여행 상세: 경비·준비물·앨범·회고가 각각 push 화면 — 상호 이동 불가 왕복 지옥.
  탭·Day 바 비고정(스크롤과 함께 사라짐).
- AI 일정 생성이 기존 일정을 확인 다이얼로그 없이 전부 대체 (`TripDetailScreen:312-328`).
- 경비 금액 입력 콤마 없음, "정산 완료" 기록 액션 없음, 체크리스트 연속 추가 불가(blurOnSubmit).
- 상태 라벨 3종 혼재("다녀왔어요"/"다녀옴"/"가보고파").

**마이·트레이너**
- 트레이너 화면 5개 라우트 주석 처리 — 전부 진입 불가(복구 시 §체크리스트 필요:
  루틴 삭제 롱프레스 힌트 역전, 루틴이 자유 텍스트 한 칸, 날짜 오늘/내일/모레 3개뿐,
  초대코드가 Alert 본문 텍스트, 대시보드 완료/미완료 색 무구분).
- 회원 탈퇴: 가장 파괴적인데 1단계 확인 + 로딩 없음(기록 삭제는 2단계) (`MyScreen:274-289`).
  로그아웃 바로 아래 파괴 액션 연속 배치.
- MY 탭 없음 — 홈 우상단 32px 아바타로만 진입, 설정까지 탭 전환+3탭.
- 아바타: 권한 거부 시 무피드백 종료, 정사각 크롭 미적용 (`imageUpload.ts:9-16`).
- 알림 토글 낙관적 업데이트 없음(굼떠 보임). 다크모드 설정 항목 부재.
- 비밀번호 변경 서버 에러가 "새 비밀번호 확인" 필드 아래(실제 원인은 현재 비밀번호) (`ChangePasswordScreen:101`).

**접근성 공통**: 대비는 토큰 레벨에서 실측·기록돼 있으나 `accessibilityLabel/Role/State`가
FAB·탭·메뉴 행·별점·체크박스 등 전반에 부재 — "대비는 맞는데 스크린리더는 빈" 비대칭.
`textTertiary/textMuted`(#9A98A4)는 배경 위 2.6:1로 미달인데 10px 텍스트에 사용.

---

## 4. 우선순위 로드맵

### P0 — 즉시 (버그·데이터 유실·막힘)

| # | 항목 | 위치 |
|---|---|---|
| 1 | `usePreventRemove` 이탈 가드: 세션 + 폼 5곳(WorkoutRecord/RoutineForm/DietRecord/FeedCompose/TripForm/PlaceAdd) | — |
| 2 | 스와이프백 3종 복원 (linking → predictive back → headerLeft 제거) ※ 1번 이후 | `RootNavigator:37`, `app.json:70`, `headerOptions:45-51` |
| 3 | 키보드 일괄: 입력 모달 4곳+캘린더+영양목표 KAV·백드롭 확인, 화면 6곳 KAV, Android behavior, 오늘의질문 persistTaps | §2-② |
| 4 | 식단 매크로 버그 2건 (표시 조건·사진 제거 시 리셋) | `DietRecordScreen:311,305` |
| 5 | MY 이중 제목·SafeArea, nutLabel 줄바꿈, 다크 하드코딩 3건, FAB 터치 영역 | §2-⑧, `MainTabNavigator:185` |
| 6 | 채팅 과거 메시지 페이징 (`onEndReached`) | `ChatRoomScreen:330` |
| 7 | 회원 탈퇴 2단계 확인 + 로딩, 파괴 액션 카드 분리 | `MyScreen:274,439` |

### P1 — 핵심 UX

| # | 항목 |
|---|---|
| 8 | 이미지 뷰어 컴포넌트 신설(핀치줌·좌우 스와이프·닫기 X) → 채팅/사진첩/여행앨범/체성분 재사용 |
| 9 | 캘린더 3종 날짜 탭 → 해당 일 기록 시트, "오늘로" 버튼 |
| 10 | 기록 날짜 선택 4곳 (DateField 재사용) |
| 11 | 운동 입력: 이전 기록 프리필 + 스테퍼, 세션 중 무게/횟수 수정 |
| 12 | 삭제 발견성: 카드 `⋯` 메뉴 병행 |
| 13 | Chip/IconButton 공용 컴포넌트 → 터치 타깃 미달 일괄 해소 |
| 14 | 홈 콜드 스타트 플래시 제거, 에러/빈 상태 구분 + 재시도 |
| 15 | 여행 상세 탭 통합(일정|장소|경비|준비물|앨범|회고) + sticky |
| 16 | AI 일정 생성 대체 확인 다이얼로그, 여행 시간 피커, 경비 콤마 |
| 17 | 지도: 마커 갱신 injectJavaScript 방식, 현재 위치 버튼 |

### P2 — 디자인 시스템

| # | 항목 |
|---|---|
| 18 | `typography.ts` 프리셋(screenTitle/sectionTitle/cardTitle/cardBody/cardMeta/metricValue/metricUnit — lineHeight 내장) |
| 19 | `layout.ts` 상수(SCREEN_PADDING/CARD_GAP/LIST_BOTTOM_FAB/ROW_ICON) + `format.ts`(콤마·kcal) |
| 20 | Card 재정의(다수파 B안) + Sheet/Modal 컴포넌트 추출(11곳 복제 해소) |
| 21 | 토큰 추가: `spacing.xxs=2`, `colors.backdrop`, onScrim 스케일, `radius.full`, iconSize |
| 22 | Duo 컬러 재정착: semantic(me/partner/together)만 사용, secondary/accent 별칭 정리, 로고 색 교정, 커플 스트릭·D+에 함께색, Card 틴트 이름 수정 |
| 23 | 라이트 모드 대비 보정(coral/violet 텍스트 AA), 다크 primary 조합 재검 |
| 24 | 다크모드 런타임 전환 + 설정 항목(시스템/라이트/다크) |

### P3 — 폴리시·후속

스와이프 삭제(reanimated 도입), 채팅 날짜 구분선·새 메시지 배지·읽음 구분선, 세션 영속화·휴식
타이머 알림, 회고 카드 이미지 공유, 사진첩 라이트박스 → 포스트 이동, 음식 검색/최근 이력,
피드 다중 사진(백엔드 포함), 트레이너 복구 체크리스트, MY 탭 승격 검토, 접근성 라벨 일괄.

---

## 5. 잘 되어 있는 부분 (유지·확산할 것)

- **근거가 코드에 남는 문화**: 대비 실측 주석(`colors.ts:44,100`), 회귀 이력(`Toast.tsx:8-13`),
  대안 폐기 사유(`headerOptions`, `DatePickerSheet`) — 같은 버그 재생산을 막는다.
- **실패 지점을 앞당기는 판단**: FAB `requiresCouple` 가드, 커플 방 자동 진입,
  삭제 메시지 자리 보존, ConfirmDialog cancel 후순위 정렬.
- **견고한 비동기 처리**: `runBusy` 전역 잠금, `uploadedRef` 중복 업로드 방지,
  커서 페이지네이션(busy 잠금+경계 중복 제거), 낙관적 토글+실패 롤백.
- **모바일 기본기**: 햅틱 74곳, 당겨서 새로고침 16화면, 세이프에어리어 42화면,
  채팅 long-press 액션시트, DatePickerSheet(경계 처리·a11y 라벨).
- **잘 통한 프리셋의 증거**: 모달 제목 16/800이 8화면 동일 — 나머지 위계도 같은 방식으로.

> 요약: 문제의 본질은 "옳은 패턴을 한 곳에 만들고 확산하지 못한 일관성 결손".
> 공용 컴포넌트·프리셋·훅으로 끌어올리는 것이 개별 화면 수정보다 우선이다.

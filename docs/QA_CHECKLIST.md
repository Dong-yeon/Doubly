# Doubly QA 체크리스트 — 화면별 버튼·상태 점검

> MVP 이후 "버튼 하나하나, 기능 하나하나"를 다듬기 위한 작업 문서.
> 49개 화면 전수 코드 감사(2026-08) 결과이며, **신규 사용자가 밟는 순서**로 정렬돼 있다.
> 기능 스펙은 [PLAN.md](../PLAN.md), 아키텍처는 [README.md](../README.md) 참고.

## 이 문서 쓰는 법

- `☐` 칸은 **실기기에서 직접 눌러보고** 체크한다. 코드만으로는 확인 못 하는 게 많다
- 표의 ✅ ⚠️ ❌ 는 **코드에 방어 로직이 있는지**이지, 실제로 잘 동작한다는 뜻이 아니다
- **[확정]** 은 코드로 검증한 결함, **(추정)** 은 코드만으론 단정 못 한 것. 추정은 실기기 확인이 먼저다
- 한 화면을 고칠 때 [전역 반복 패턴](#전역-반복-패턴--한-번에-고칠-것)을 먼저 보라. 같은 결함이 다른 48개 화면에도 있다

| 기호 | 뜻 |
| --- | --- |
| ✅ | 방어 로직 있음 |
| ⚠️ | 부분적 · 일관성 없음 |
| ❌ | 없음 |
| — | 해당 없음 |

---

## 0. 먼저 할 일 — 프론트엔드 안전망

**현재 프론트엔드에는 테스트·린트·타입체크 스크립트가 하나도 없다.** (`devDependencies` = `typescript`, `@types/react` 둘뿐)
백엔드는 도메인별 flow 테스트 12종이 있어 안전망이 있지만, 49개 화면이 사는 프론트는 무방비다.
**화면을 손대기 전에 이걸 먼저 깔아야** 고친 만큼 새로 깨지는 걸 막을 수 있다.

```jsonc
// frontend/package.json — scripts 에 추가
"typecheck": "tsc --noEmit",
"lint": "eslint src --ext .ts,.tsx"
```

- 현재 `tsc --noEmit` 결과: **오류 1건** — `react-native-svg` 가 `package.json` 에 있는데
  `node_modules` 에 없음. 로컬에서 `npm install` 부터 하면 해소된다
- ESLint 는 `eslint-plugin-react-hooks` 를 반드시 포함할 것. 아래 반복 패턴 중
  **의존성 배열·cleanup 누락은 기계가 잡아준다**
- 이후 `no-restricted-syntax` 로 hex 색상 리터럴 금지, `accessibilityLabel` 규칙 추가

---

## 확정 결함 — 우선순위

코드로 검증이 끝난 것만. 순서는 **사용자가 실제로 잃는 것**의 크기 순.

### P0 — 데이터가 사라지거나 잘못 저장됨

> **2026-08-26 재확인 — 5건 전부 해소.** 아래 표는 감사 당시(2026-08-10) 기준 기록으로 원문 그대로 남겨둔다.
> 해소 경위는 각 행의 "해결" 열 참고.

| # | 위치 | 내용 | 해결 |
| --- | --- | --- | --- |
| 1 | `WorkoutSessionScreen.tsx:150` | 무게 입력에 숫자 필터가 없어 `"1.2.3"` 같은 값이 `Number()` 에서 `NaN` 이 되고, `NaN != null` 은 `true` 라 **문자열 `"NaN"` 이 그대로 서버로 전송**된다 | ✅ `b6797af`(2026-08-26). 저장 경로(`onFinish`)는 이미 `toNum()` 이 `NaN` 을 걸러 문자열 전송 자체는 없었지만, 입력 시점 필터가 없어 값이 조용히 사라지는 문제는 남아 있었다 — `weightKg`/`reps`/`rpe`(세션 카드)와 `fSets`/`fReps`/`fWeight`("+ 운동 추가" 모달) 전부에 `sanitizeDecimalInput`/`sanitizeIntegerInput`(`utils/numericInput.ts` 신설, BodyMetric·NumberStepper 공용화) 적용 |
| 2 | `WorkoutRecordScreen.tsx:206` | 무게 필터가 `[^0-9.]` 라 점을 여러 개 허용 → `Number()` 가 `NaN` → `JSON.stringify(NaN)` 은 `null` → **사용자는 입력했다고 믿는데 서버엔 조용히 누락** | ✅ `ef3526f`(2026-08-11). `NumberStepper` 의 sanitize 가 두 번째 점부터 버리도록 수정됨 |
| 3 | 전 화면 (`beforeRemove` 사용 0건) | `WorkoutSessionScreen` 의 이탈 경고는 화면 안 "종료" 버튼에만 있다. **헤더 뒤로가기·iOS 스와이프백·안드로이드 하드웨어백은 전부 우회**되어 체크한 세트가 확인 없이 전부 소실된다 | ✅ `c74f161`(2026-08-05). `useDirtyGuard` 훅(`usePreventRemove` 기반) 신설, `WorkoutSessionScreen` 에 적용돼 헤더/스와이프/하드웨어백 전부 커버 |
| 4 | `DietRecordScreen.tsx:232-235` | 사진으로 AI 분석해 탄단지를 채운 뒤 **사진만 지우고 저장하면** 화면에선 매크로가 사라졌는데 이전 분석 결과가 그대로 전송된다 (`macros` state 가 초기화되지 않음) | ✅ `1db4881`(2026-08-18)로 항목 자체가 obsolete. 단일 `macros` state 를 없애고 반찬별 `items` 배열 모델로 리팩터되면서, 사진 삭제 시 항목별 값을 그대로 유지하는 게(잘못된 항목은 개별 삭제) 의도된 동작으로 바뀜(코드 주석에 근거 명시) |
| 5 | `MyScreen.tsx:466` | **회원 탈퇴** 메뉴에만 `disabled`/로딩이 없다. 같은 화면의 연결끊기(458)·기록삭제(423)·복원(399)은 전부 막는데, 되돌릴 수 없는 가장 위험한 동작만 빠졌다 → 네트워크 지연 시 중복 탈퇴 요청 | ✅ `c74f161`(2026-08-05). `withdrawing` 상태로 `disabled` + `ActivityIndicator` 추가 |

### P1 — 실패가 사용자에게 안 보임

> **2026-08-26 재확인 — 12건 전부 해소.** `ef3526f`(2026-08-11)에서 6~12 중 7개 화면을 한 번에
> 고쳤는데, P1-6 이 지목한 8개 화면 중 `TrainerDashboard` 만 빠져 있었다(`2a76698`, 2026-08-26).
> 나머지는 전부 코드로 재검증 완료.

| # | 위치 | 내용 | 해결 |
| --- | --- | --- | --- |
| 6 | 리스트형 화면 다수 | 로드 실패 시 데이터를 초기값(`[]`/`null`)으로 두고 toast 만 띄운다 → **"네트워크 오류"와 "진짜 빈 목록"이 화면상 구분 불가**. `TripList`·`TripExpense`·`TripChecklist`·`TripAlbum`·`PlaceMap`·`PlaceDetail`·`TrainerDashboard`·`ChatScreen` 공통 | ✅ `ef3526f`(7개) + `2a76698`(`TrainerDashboard`, 2026-08-26 누락분). `PlaceMap` 은 이후 `PlaceScreen` 으로 통합됐지만(`7ae791f`) `loadError` 처리는 그대로 이관됨 |
| 7 | `WorkoutStatsScreen.tsx:22-28`, `DietStatsScreen.tsx:16-24` | 통계 조회 실패 시 `stats=null` → `?? 0` 폴백으로 **"0일"이 표시되어 API 실패와 진짜 0을 구분할 수 없다**. `DietStats` 는 EmptyState 조건이 `stats &&` 라 에러일 땐 그것마저 안 뜬다 | ✅ `ef3526f`. `error` 상태 분리 + 실패 시 전체를 재시도 EmptyState 로 교체 |
| 8 | `WorkoutCalendarScreen.tsx:16-29`, `DietCalendarScreen.tsx:16-29` | 캘린더 조회 실패를 조용히 빈 Set 으로 흡수 → 사용자는 "이번 달 운동 안 했나?"로 오해 | ✅ `ef3526f`. `loadError` + 탭하면 재시도되는 오류 배너 |
| 9 | `TripRecapScreen.tsx:55-61` | 로드 실패 시 `loading=false`+`recap=null` 이 되어 **완전히 빈 화면**이 되고, `ScrollView` 라 당겨서 새로고침도 없어 **재시도 수단이 아예 없다** | ✅ `ef3526f`. `loadError` + 재시도 EmptyState |
| 10 | `HomeScreen.tsx:88` | `refresh()` 안의 `fetchAll()` 에 `.catch()` 가 없고 `relationStore.fetchAll` 도 catch 없음 → unhandled rejection, 화면엔 아무 알림 없음 | ✅ `ef3526f`. `fetchAll().catch(noteOffline)` 로 처리 |
| 11 | `CoupleConnectScreen.tsx:40,47` | 복사·공유가 try/catch 없이 실행되어 **실패해도 아무 피드백이 없다** | ✅ `ef3526f`. 복사·공유 모두 try/catch + 에러 토스트 |
| 12 | `OnboardingScreen.tsx:70` | `finish()` 가 try/catch 없이 fire-and-forget → `storage.setItem` 실패 시 `navigation.replace` 가 실행되지 않아 **온보딩 화면에 갇힐 수 있다** | ✅ `ef3526f`. 저장 실패해도 화면 전환은 계속 진행 |

### P2 — 오동작·혼란

> **2026-08-26 재확인 — 14건 전부 해소.** 전부 `9a3c3737`(2026-08-11, "QA_CHECKLIST P2 확정
> 결함 14건 해소")에서 한 번에 처리됐다. 22번의 TripAlbumScreen 부분만 그보다도 전인
> `c74f161`(2026-08-05)에서 다른 작업의 부수 효과로 먼저 고쳐져 있었다 — 즉 감사(8/10) 시점에
> 이미 일부는 낡은 기록이었다.

| # | 위치 | 내용 | 해결 |
| --- | --- | --- | --- |
| 13 | `HomeScreen.tsx:83,100` | `connected` 판정이 store 의 `loading` 을 안 보고 `couple?.partner` 만 본다 → 앱 진입 직후 **연결된 커플에게도 "커플을 연결해보세요"가 순간 노출** | ✅ `9a3c3737`. `relationLoading` 인 동안 `connected` 를 강제로 `true` 로 둠 |
| 14 | `CoupleCalendarScreen.tsx:81-90` | `load(y,m)` 완료 시 현재 `year/month` 와 일치하는지 검사 안 함 → 월을 빠르게 넘기면 **헤더와 표시되는 일정이 다른 달**로 어긋난다 (같은 파일의 `DietCalendarScreen:16-29` 는 `active` 플래그로 올바르게 처리 — 이쪽을 참고) | ✅ `9a3c3737`. `latestRequestRef` 로 최신 요청만 반영 |
| 15 | `ChangePasswordScreen.tsx:101`, `ResetPasswordScreen.tsx:118`, `LoginScreen.tsx:66` | 서버 에러가 **엉뚱한 입력창 아래** 표시된다. "현재 비밀번호 불일치"가 *새 비밀번호 확인* 필드에, "가입되지 않은 이메일"이 *비밀번호* 필드에 | ✅ `9a3c3737`. 세 화면 모두 올바른 필드(또는 LoginScreen 은 폼 전체 상단)로 이동 |
| 16 | `TripDetailScreen.tsx:231-265` | Day 이동을 동반한 일정 수정에서 `updateItem` 성공 후 `reorderItems` 가 실패하면 바깥 catch 로 빠져 `load()` 가 안 돌아간다 → **서버엔 반영됐는데 화면은 옛날 상태** | ✅ `9a3c3737`. `reorderItems` 를 내부 try/catch 로 감싸 실패해도 `load()` 로 재동기화 |
| 17 | `TripDetailScreen.tsx:288-309` | `moveItem` 이 렌더 시점 배열을 클로저로 캡처. ▲▼ 연타 시 스왑 전 배열 기준으로 계산된 `sortOrder` 가 경합 상태로 전송된다 (in-flight 가드 없음) | ✅ `9a3c3737`. `movingRef` in-flight 가드 추가 |
| 18 | `TripDetailScreen.tsx:226` | 시간 검증 정규식 `/^\d{1,2}:\d{2}$/` 가 자릿수만 봐서 **`25:99` 도 통과** | ✅ `9a3c3737`. `/^([01]?\d\|2[0-3]):[0-5]\d$/` 로 교체 |
| 19 | `ChatRoomScreen.tsx:114-130` | 메시지 **수정** 모드에서 응답 대기 중 전송 버튼이 비활성화되지 않아 중복 PUT 가능 | ✅ `9a3c3737`. `editSaving` 가드 + 버튼 `disabled` 반영 |
| 20 | `ChatRoomScreen.tsx:104-112` | 읽음 처리 실패 시 재시도가 `messages` 변경(=새 메시지 도착) 시에만 트리거 → 조용하면 실패가 방치됨 | ✅ `9a3c3737`. 실패 시 5초 뒤 자체 재시도 타이머 추가 |
| 21 | `TrainerMemberDetailScreen.tsx:99-101` | 문구 위치 오류 — `"(길게 눌러 삭제)"` 안내가 **루틴이 0개일 때** 뜬다. 정작 삭제할 게 있는 화면엔 힌트가 없다 | ✅ `9a3c3737`. `routines.length > 0` 조건으로 이동 |
| 22 | `TripAlbumScreen.tsx:113`, `PlaceDetailScreen.tsx:174`, `BodyMetricScreen.tsx:182`, `ChallengeScreen.tsx:141` | `activeOpacity` 로 **눌리는 피드백은 주면서 `onPress` 가 없다** → "눌러지는데 아무 일도 안 남" | ✅ 4곳 전부. TripAlbumScreen 은 `c74f161`(8/5, 감사보다 먼저)에서 부수적으로 해결, 나머지 3곳은 `9a3c3737` |
| 23 | `PlaceDetailScreen.tsx:160,167` | 방문 기록 폼을 취소해도 별점·메모·사진이 초기화되지 않아, 다시 열면 이전 입력이 그대로 남아 있다 | ✅ `9a3c3737`. 취소 시 `resetForm()` 호출 |
| 24 | `PlaceAddScreen.tsx:52-68` | 카카오 검색이 6초 타임아웃 후 **스피너만 사라지고 실패 안내가 없다** | ✅ `9a3c3737`. 타임아웃 시 에러 토스트 추가 |
| 25 | `PhotoAlbumScreen.tsx:33` | `CELL` 크기를 컴포넌트 밖에서 `Dimensions.get()` 로 1회만 계산 → 회전·창 크기 변경 시 그리드가 어긋난다 | ✅ `9a3c3737`. `useWindowDimensions` + `useMemo` 로 교체 |
| 26 | `FeedTimelineScreen.tsx:100` | 본인 글이 아닌 항목을 길게 누르면 **아무 피드백 없이 조용히 종료** | ✅ `9a3c3737`. `toast.info('내가 쓴 글만 삭제할 수 있어요.')` 추가 |

### 확인해봤더니 문제 아니었던 것

감사 중 결함으로 의심됐으나 **검증 결과 정상**. 다시 파지 말 것.

| 의심 | 검증 결과 |
| --- | --- |
| AI 기능이 `client.ts` 의 10초 타임아웃에 걸린다 | **정상** — AI 호출 7곳(`workout/recommend`, `meal/analyze`, `meal/analyze-text`, `meal/coach`, `places/date-course`, `summary/ai-letter`, `trips/…/generate`)이 전부 `{ timeout: 60000 }` 으로 개별 오버라이드하고 있다 |
| `CoupleCalendarScreen:133` 의 `event.eventDate` 가 `undefined` 라 크래시 | **정상** — `CoupleCalendarEvent` 타입에 `date`(그 달의 발생일)와 `eventDate`(원본 기준일)가 **둘 다** 있다. 반복 일정 수정 시 원본 날짜를 쓰는 게 맞는 동작 |
| `console.log` 잔존 | **0건** — 전역에 없음 |
| 제출 버튼 연타 방어 | **대체로 양호** — 공용 `Button`(`Button.tsx:34,38`)이 `loading` 시 자동 `disabled`. 예외는 위 P0-5, P2-19 와 모달 저장 버튼 몇 곳 |

---

## 전역 반복 패턴 — 한 번에 고칠 것

화면 하나씩 고치기 전에 이걸 먼저 처리하는 게 효율이 훨씬 높다.

### 패턴 1: 로드 실패가 "빈 상태"로 위장 — 최우선

> **2026-08-26 해소.** `EmptyState` 에 이미 있던 `error`/`onRetry` variant(P1-6 수정 때 도입)를
> 표준 레시피로 삼아 P1-6이 지목한 8개 화면 이후로 남아있던 나머지 화면까지 전부 적용했다.
> 공용 `useAsyncList` 훅은 만들지 않았다 — 화면마다 `load()`의 모양(스토어 함수 호출/여러 API
> 병렬 조회/커서 페이지네이션 등)이 제각각이라 훅 하나로 뽑기보다 `loadError` state + 분기
> 렌더 패턴을 화면마다 직접 반복하는 편이 오히려 각 화면의 실제 로드 로직과 어긋나지 않았다.
> `WorkoutScreen`/`DietScreen`은 근본 원인이 각각 `workoutStore.ts`/`dietStore.ts`의
> `fetchToday`/`fetchHistory`에 `catch` 자체가 없어 실패가 unhandled rejection이 되던 것이라
> 스토어 레벨에서 고쳤다.
>
> **해소 화면**: `WorkoutScreen`(`a98524c`, 스토어 레벨), `DietScreen`(`1559533`, 스토어 레벨),
> `TripDetailScreen`(`45429e7`), `WorkoutProgramDetailScreen`(`a98524c`, "찾을 수 없음"과
> "로드 실패"를 분리 — 전자였는데 네트워크 오류를 삭제됨으로 오인시켰음), `WorkoutRoutineListScreen`·
> `BodyMetricScreen`(연결 없음, 패턴 7만)·`ChallengeScreen`(`a98524c`), `CoupleCalendarScreen`
> (기존 월이동 레이스 가드에 맞춰 최신 요청 기준으로만 반영)·`TrainerMemberDetailScreen`·
> `FeedTimelineScreen`·`PhotoAlbumScreen`(`2f5e308`), `DailyQuestionScreen`·
> `FavoriteFoodGiftInboxScreen`·`WorkoutRoutineGiftInboxScreen`·`WorkoutRoutineTemplatesScreen`·
> `MemoriesScreen`(`4821327`). `WorkoutStatsScreen`/`DietStatsScreen`/`WorkoutCalendarScreen`/
> `DietCalendarScreen`/`TripRecapScreen`/`PlaceScreen`/`HomeScreen`(P1-10 unhandled rejection
> 부분)은 이미 P1 해소 때 처리돼 있었다.
>
> **의도적으로 그대로 둔 것**: `PlaceAddScreen`(로드가 아니라 검색 폼이라 해당 없음),
> `MyScreen`의 여러 위약 요약 수치(리스트 화면이 아니라 대시보드 위젯이라 이 패턴의
> 전형적인 형태와 달라 범위에서 제외 — 필요하면 별도로 다룰 것)

### 패턴 2: 숫자 입력에 `NaN` 검증 없음

> **2026-08-26 재확인 — 6개 파일 전부 해소.** `utils/numericInput.ts`(신설)의
> `sanitizeDecimalInput`/`sanitizeIntegerInput` 을 공용으로 써서 타이핑 시점에 걸러내는
> 방식으로 통일했다 — 원래 제안이던 저장 시점 `toNumberOrUndefined` 헬퍼보다, 애초에
> 잘못된 문자가 입력란에 들어가지 못하게 막는 쪽이 사용자 피드백이 즉각적이라 이 방식을
> 택함. `WorkoutRecordScreen`/`DietRecordScreen`은 이미 `NumberStepper` 정수 전용 구조로
> 리팩터돼 있어 애초에 위험이 없었다.

- **범위(당시)**: **20건 / 7개 파일** — `DietRecordScreen:99,232`, `DietScreen:116-119`,
  `BodyMetricScreen:111-113`, `WorkoutRoutineFormScreen:54-56`, `WorkoutRecordScreen:90,95-97`,
  `WorkoutSessionScreen:131-132`
- **증상**: `calories ? Number(calories) : undefined` 는 빈 문자열만 거르고 `"1,2"`·`"abc"` 는 통과.
  `JSON.stringify(NaN)` 이 `null` 이라 **에러 없이 값만 사라진다**
- **양호 사례**: `TripExpenseScreen:94-98` 은 `!amount || amount <= 0` 로 제대로 거른다. 이걸 표준으로
- **해결**: ✅ `BodyMetricScreen`(`ccae37f`) · `WorkoutSessionScreen`(`b6797af`) ·
  `DietScreen`/`WorkoutRoutineFormScreen`(`908c2b9`) 신규 수정. `WorkoutRecordScreen`(`ef3526f`,
  `NumberStepper` sanitize) · `DietRecordScreen`(`1db4881` 리팩터로 전량 `NumberStepper`
  정수 전용화)는 이미 해결돼 있었음

### 패턴 3: 이탈 시 입력 소실 (`beforeRemove` 사용 0건)

> **2026-08-26 해소.** 제안된 `useUnsavedGuard`와 거의 같은 모양의 `frontend/src/hooks/useDirtyGuard.ts`
> (`usePreventRemove` 기반)가 이미 만들어져 있었다 — `WorkoutSessionScreen`·`WorkoutRecordScreen`·
> `TripFormScreen`·`DietRecordScreen`은 전부 이미 이 훅으로 처리돼 있었고(재확인 완료),
> **`WorkoutRoutineFormScreen`만 빠져 있어 이번에 추가**(`f0c828d`). 화면(스크린) 레벨 이탈은
> `useDirtyGuard`, 화면 안 **모달**의 배드롭/Android 백 이탈은 성격이 달라(내비게이션 전환이
> 아니라 로컬 상태 토글) 기존에 있던 `confirmDiscard` 유틸로 처리한다 — `TripDetailScreen`·
> `TripExpenseScreen`의 일정/경비 모달이 아무 확인 없이 닫히던 것도 이번에 이 방식으로
> 보강했다(`45429e7`, `b9096ee`). `TripChecklistScreen`의 이름 수정 모달은 이미 처리돼 있었음

### 패턴 4: 키보드 회피 불일치

> **2026-08-26 재확인 — 16개 중 남은 6개(TripDetailScreen·TripExpenseScreen·TripChecklistScreen·
> DietScreen 전면 미해결 4곳, WorkoutRoutineFormScreen·WorkoutSessionScreen 핵심 입력부만
> 부분 미해결 2곳) 전부 해소.** 나머지 10개(`PlaceDetailScreen`, `TrainerConnectScreen`,
> `MyScreen`(입력 자체가 없어졌음), `TripFormScreen`, `DailyQuestionScreen`, `CoupleConnectScreen`,
> `CoupleCalendarScreen`, `FeedComposeScreen`, `ChallengeScreen`, `BodyMetricScreen`,
> `WorkoutRoutineFormScreen`/`WorkoutSessionScreen`의 서브모달 부분)는 이미 처리돼 있었다.
>
> 안드로이드 미대응 문제도 이미 해결책이 있었다 — `FormKeyboardView`(ScrollView 기반 폼 전용) /
> `useAndroidKeyboardHeight`(FlatList를 직접 감싸는 화면 전용, 안드로이드 15+ edge-to-edge에서
> `KeyboardAvoidingView`의 자동 높이 보정이 안 먹는 걸 실기기로 확인하고 만든 훅 — 실측 키보드
> 높이만큼 `paddingBottom` 직접 부여) 두 공용 도구가 이미 있어, 제안됐던 `FormScreenLayout`/
> `FormModal` 신설 대신 이 두 도구로 통일했다. `app.json`의 `windowSoftInputMode`엔 더 이상
> 단독 의존하지 않음.
>
> `TripDetailScreen`/`TripExpenseScreen`/`DietScreen`의 모달들은 `KeyboardAvoidingView`+
> `ScrollView`로(`45429e7`, `b9096ee`, `1559533`), `TripChecklistScreen`은 이름 수정 모달만
> (인라인 추가 입력창은 리스트 헤더 안이라 낮은 우선순위로 스킵, `b9096ee`),
> `WorkoutRoutineFormScreen`은 루틴 이름/저장 버튼 영역(`f0c828d`), `WorkoutSessionScreen`은
> 세트별 무게/횟수/RPE 입력부(가장 자주 쓰는 핵심 영역이었는데 빠져 있었음, `useAndroidKeyboardHeight`
> 적용, `f0c828d`)를 해소했다.

### 패턴 5: 접근성 라벨 4.3%

- **범위**: `TouchableOpacity` 92건 + `Pressable` 69건 = **161건 중 `accessibilityLabel` 7건**.
  그마저 5개 파일에 몰려 있다 (`ChatRoomScreen` 4, `SettingsScreen`·`LegalDocumentScreen`·`OnboardingScreen` 각 1)
- **증상**: 아이콘·기호만 있는 버튼(`✕` `▲` `▼` `‹` `›` `★` 체크박스 카메라)을 스크린리더가 읽지 못함
- **일괄 수정**: 텍스트 없는 터치 요소에 `accessibilityLabel` + `accessibilityRole="button"`,
  선택형 칩엔 `accessibilityState={{ selected }}`. ESLint 규칙으로 강제

### 패턴 6: 모달 저장 버튼에 in-flight 가드 없음

> **2026-08-26 해소.** `TripDetailScreen` 일정 저장(`savingItem` 신설, `45429e7`), `TripExpenseScreen`
> 경비 저장(`saving` 신설, `b9096ee`), `TripChecklistScreen` 이름 수정(기존 `adding`은 추가 버튼
> 전용이라 재사용하지 않고 `renaming` 신설, `b9096ee`)에 각각 `loading` 상태를 연결했다.
> `WorkoutSessionScreen`의 "+ 운동 추가"는 이미 `adding`/`loading`으로 막혀 있었다.
> `WorkoutRoutineFormScreen`의 "+ 운동 추가"는 재확인 결과 **애초에 네트워크 호출이 없는
> 로컬 상태 변경**이라(실제 POST는 뒤의 "루틴 저장" 버튼에서 일어나고 그건 이미 `loading={saving}`)
> 원 지적이 부정확했음 — 조치 불필요로 판정.

### 패턴 7: 삭제 흐름에 진행 표시 없음

> **2026-08-26 해소.** 제안된 그대로 공용 `useDeleteAction` 훅(`frontend/src/hooks/useDeleteAction.ts`,
> `b177b86`)을 신설해 `deletingId` + `runDelete(id, action)`으로 in-flight 가드·행 흐림·실패
> 토스트를 한 곳에서 처리한다. 원 목록의 13개 화면(`PlaceMap`은 이후 `PlaceScreen`으로 통합)
> 전부에 적용 완료, 재조사 중 발견된 추가 삭제 흐름(`TripDetailScreen`의 장소 빼기,
> `WorkoutScreen`/`WorkoutRoutineList`/`PlaceScreen`/`PlaceDetailScreen`의 서로 다른 두 종류
> 엔티티 삭제 등 총 8곳)도 같이 적용해, 실제로는 원래 범위보다 넓게 해소됐다.
> `WorkoutCard`/`FeedCard`처럼 카드 컴포넌트 자체가 흐림 표시용 prop이 없는 곳은 감싸는
> `View`에 조건부 스타일을 얹었고, `MealCard`는 `deleting` prop을 새로 받게 했다(패턴 7만을
> 위해 컴포넌트를 건드린 유일한 예외). 커밋: `45429e7`(TripDetail) · `b9096ee`(경비/준비물/
> 목록/앨범) · `a98524c`(운동 메인/프로그램/루틴목록/몸변화/대결) · `1559533`(식단) ·
> `2f5e308`(피드) · `071263d`(장소, 같은 커밋의 ChatRoomScreen 부분은 패턴 10 전용).

### 패턴 8: 하드코딩 색상 리터럴

> **2026-08-26 재확인 — 원 목록 중 실제로 남아있던 2개 파일 해소, 나머지는 이미 정상이었거나
> 원 지적 자체가 부정확했음.** `TripChecklistScreen`·`ChatRoomScreen`·`WorkoutRecordScreen`은
> 재확인 결과 리터럴이 없었다(이미 리팩터됐거나 애초에 있던 적이 없었던 것으로 보임 — git
> 히스토리로도 확인 안 됨). `HomeScreen`의 그라디언트는 원래도 의도적으로 라이트/다크 각각
> 다른 배열을 쓰고 있어 대상이 아니다. 실제로 남아있던 건 `TripDetailScreen`의 `'#fff'` 2곳
> (`travelModeKnob`/`tabTextOn`) → `colors.white`로 교체(`45429e7`). 새로 발견된 것으로, 모달
> `backdrop`의 `rgba(0,0,0,0.4)` 하드코딩이 이미 있던 테마 인지 토큰 `colors.backdrop`을 안 쓰고
> 앱 전역 10곳에 퍼져 있었다 — `TripDetailScreen`·`TripExpenseScreen`·`DietScreen`은 이번에
> `colors.backdrop`으로 교체(`45429e7`, `b9096ee`, `1559533`). `colors.warning` 같은 신규
> 토큰은 필요 없었다(실제로 만난 값은 전부 기존 `colors.white`/`colors.backdrop`으로 대체
> 가능했음). `BarcodeScanScreen`/`HomeScreen`/`BodyMetricScreen`/`ChallengeScreen`/
> `WorkoutRoutineFormScreen`/`WorkoutSessionScreen`/`CoupleCalendarScreen`의 나머지 backdrop
> 하드코딩은 이번 스코프 밖 — 필요하면 후속으로.

### 패턴 9: 배열 인덱스를 `key` 로 사용

> **2026-08-26 해소.** 지적대로 `WorkoutSessionScreen`만 고쳤다(`f0c828d`) — `SessionSet`에
> optional `key` 필드를 추가하고 세트 생성 지점(`buildSet`/`addSetRow`) 양쪽에서 채운다.
> 재확인 결과 지금은 세트를 **중간에서 지우는 기능 자체가 없어서**(끝에 추가만 가능) 실제
> 리마운트 증상은 현재 없지만, 나중에 세트 삭제 기능이 생기면 바로 재발할 수 있어 선제적으로
> 막아둔 것. 나머지 4곳(정적 배열)은 그대로 둠.

### 패턴 10: `EmptyState` 미사용 리스트

> **2026-08-26 재확인 — 원 목록 7개 중 실제로 남아있던 3개(`ChatRoomScreen`, `DailyQuestionScreen`,
> `TripDetailScreen`) 전부 해소.** `PlaceDetailScreen`·`TripAlbumScreen`·`TripChecklistScreen`·
> `TripExpenseScreen`은 재확인 결과 이미 `EmptyState`를 쓰고 있었다(원 지적이 이미 낡았던
> 것으로 보임). `ChatRoomScreen`은 메시지 목록에 `EmptyState`를 아예 새로 도입(`inverted`
> 리스트라 `scaleY(-1)`로 다시 뒤집어 정방향으로 보이게 처리, `071263d`). `DailyQuestionScreen`은
> `EmptyState` import 자체가 없어 `today`·`history`가 모두 비면 완전히 텅 빈 화면이 되던
> 문제를 그대로 재현 확인 후 해소(`4821327`). `TripDetailScreen`은 4곳(일정/장소/모달 내
> 리스트 2곳) 전부 새로 도입(`45429e7`).

---

## 경로 1 — 신규 사용자 진입 (온보딩 8화면)

여기서 막히면 나머지 48개 화면을 아무리 다듬어도 사용자가 보지 못한다. **최우선.**

### SplashScreen — 스플래시
`frontend/src/screens/onboarding/SplashScreen.tsx` · 진입: 앱 콜드 스타트
호출 API: 없음 (`storage.getItem(onboardingSeen)` 로컬 읽기)

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| (누를 요소 없음 — 1.6초 후 자동 전환) | `replace('Login'\|'Onboarding')` | — | ⚠️ `.catch(()=>null)` 로 실패를 삼킴 | — | ☐ |

**상태 커버리지**: 로딩 — · 빈 상태 — · 에러 ⚠️ · 오프라인 — · 키보드 — · 접근성 —

**의심 지점**
- `SplashScreen.tsx:26-31` — `.catch` 는 reject 만 처리하고 **hang 은 처리 못 한다**. `storage.getItem` 이 영원히 pending 이면 스플래시에 멈춘다 (추정 — `storage` 구현 확인 필요). 타임아웃 레이스를 걸어두는 게 안전

---

### OnboardingScreen — 첫 실행 인트로
`frontend/src/screens/onboarding/OnboardingScreen.tsx` · 진입: Splash(미확인 사용자)
호출 API: 없음 (`storage.setItem(onboardingSeen)`)

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 건너뛰기 (100-107) | `finish()` | ❌ | ❌ try/catch 없음 | ❌ 연타 시 중복 실행 | ☐ |
| 다음/시작하기 (144) | 마지막이면 `finish()`, 아니면 `scrollToIndex` | — | ❌ 동일 | ❌ 동일 | ☐ |
| 슬라이드 좌우 스와이프 (110-129) | `onMomentumScrollEnd` 로 index 동기화 | — | — | — | ☐ |

**상태 커버리지**: 로딩 ❌ · 빈 상태 — · 에러 ❌ · 오프라인 — · 키보드 — · 접근성 ⚠️ 건너뛰기만 라벨 있음

**의심 지점**
- **[확정] `OnboardingScreen.tsx:70-73`** — `finish()` 에 try/catch 가 없고 호출부도 결과를 기다리지 않는다. `storage.setItem` 실패 시 `navigation.replace` 가 실행되지 않아 **온보딩에 갇힌다**. catch 에서도 `replace('Login')` 은 실행되도록 폴백 필요 (P1-12)
- `OnboardingScreen.tsx:113` — `keyExtractor={(s) => s.title}`. 지금은 유일하지만 문구가 중복되면 깨진다

---

### LoginScreen — 로그인
`frontend/src/screens/onboarding/LoginScreen.tsx` · 진입: Splash / Onboarding 종료 / Register 뒤로 / ResetPassword 성공
호출 API: `POST /auth/login` (`authStore.login`)

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 비밀번호 표시 토글 | `reveal` 토글 | — | — | — | ☐ |
| 로그인 버튼 (68) | `login(email, password)` | ✅ `loading` | ✅ 인라인 `errorText` | ✅ `canSubmit` + `disabled` 이중 | ☐ |
| 구글 로그인 (76) | `GoogleLoginButton` 내부 | (컴포넌트 확인 필요) | ⚠️ `onError={setError}` 만 | (확인 필요) | ☐ |
| 비밀번호를 잊으셨나요 (83) | `navigate('ForgotPassword')` | — | — | — | ☐ |
| 이메일로 회원가입 (89) | `navigate('Register')` | — | — | — | ☐ |

**상태 커버리지**: 로딩 ✅ · 빈 상태 — · 에러 ✅ · 오프라인 ⚠️ 일반 문구 · 키보드 ✅ · 접근성 ⚠️

**의심 지점**
- **[확정] `LoginScreen.tsx:66`** — 로그인 실패 메시지가 **비밀번호 입력창** 아래에만 뜬다. "가입되지 않은 이메일"도 여기 표시되어 원인을 오인한다 (P2-15)
- `LoginScreen.tsx:38,53-59` — 이메일 형식 검증이 없고 `length > 0` 만 체크. 오타로도 서버 왕복이 발생

---

### RegisterScreen — 회원가입
`frontend/src/screens/onboarding/RegisterScreen.tsx` · 진입: Login "이메일로 회원가입"
호출 API: `POST /auth/register`

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 비밀번호 표시 토글 | `reveal` | — | — | — | ☐ |
| 성별 칩 남/여 (100-113) | `setGender` (재탭 시 해제) | — | — | — | ☐ |
| 전체 동의 (117-122) | `toggleAll` | — | — | — | ☐ |
| [필수] 이용약관 (124) / 개인정보 (137) | 각각 토글 | — | — | — | ☐ |
| 약관 "보기" (129-135) / 개인정보 "보기" (141-147) | `navigate('LegalDocument', {doc})` | — | — | — | ☐ |
| [선택] 마케팅 (150) | 토글 | — | — | — | ☐ |
| 가입하고 시작하기 (163) | 8자 검증 후 `register` | ✅ | ✅ 인라인 | ✅ 이중 | ☐ |
| 이미 계정이 있어요 (166) | `goBack()` | — | — | — | ☐ |

**상태 커버리지**: 로딩 ✅ · 빈 상태 — · 에러 ✅ · 오프라인 ⚠️ · 키보드 ✅ · 접근성 ⚠️ 성별 칩에 `accessibilityState` 없음

**의심 지점**
- `RegisterScreen.tsx:47-50` — 비밀번호 길이 검증이 제출 시 1회만. 에러가 화면 하단 `Text` 에만 뜨고 **필드에 시각 피드백이 없다**(`ResetPasswordScreen` 은 필드 인라인 — 불일치)
- `RegisterScreen.tsx:82-86` — 이메일 형식 클라이언트 검증 없음

---

### ForgotPasswordScreen — 비밀번호 찾기
`frontend/src/screens/onboarding/ForgotPasswordScreen.tsx` · 진입: Login
호출 API: `POST /auth/forgot-password`

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 인증코드 받기 (64-70) | `forgotPassword` → `navigate('ResetPassword')` | ✅ | ✅ 인라인 | ✅ | ☐ |
| 이미 코드를 받았어요 (74-79) | API 없이 바로 이동 | — | — | ❌ **항상 활성** | ☐ |
| 로그인으로 돌아가기 (80-85) | `goBack()` | — | — | — | ☐ |

**상태 커버리지**: 로딩 ✅ · 빈 상태 — · 에러 ✅ · 오프라인 ⚠️ · 키보드 ✅ · 접근성 ⚠️

**의심 지점**
- `ForgotPasswordScreen.tsx:74-79` — 이메일이 비어도 눌리고 빈 문자열이 다음 화면으로 넘어간다. `disabled` 필요
- `ForgotPasswordScreen.tsx:62` — 주석(27행)은 "가입 여부와 무관하게 항상 성공"이라는데 catch 는 에러를 노출한다. 네트워크 오류와 계정 없음이 같은 경로로 섞임 — 설계 의도 재확인 필요

---

### ResetPasswordScreen — 비밀번호 재설정
`frontend/src/screens/onboarding/ResetPasswordScreen.tsx` · 진입: ForgotPassword
호출 API: `POST /auth/reset-password`, `POST /auth/forgot-password`(재발송)

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 인증코드 입력 (92-101) | 숫자 필터 + 6자 제한 | — | — | — | ☐ |
| 비밀번호 표시 토글 ×2 | `reveal` | — | — | — | ☐ |
| 비밀번호 변경 (120-126) | `resetPassword` → `reset(Login)` | ✅ | ✅ 필드 인라인 | ✅ | ☐ |
| 인증코드 다시 받기 (130-137) | `forgotPassword` + `setCode('')` | ✅ 별도 `resending` | ✅ | ✅ | ☐ |
| 로그인으로 돌아가기 (138-143) | `reset(Login)` | — | — | — | ☐ |

**상태 커버리지**: 로딩 ✅ 분리 · 빈 상태 — · 에러 ✅ · 오프라인 ⚠️ · 키보드 ✅ · 접근성 ⚠️

**의심 지점**
- **[확정] `ResetPasswordScreen.tsx:118`** — "인증코드 만료/불일치" 서버 에러가 **"새 비밀번호 확인" 필드** 아래 뜬다. 원인은 코드 필드인데 (P2-15)
- `ResetPasswordScreen.tsx:47-59` — 제출과 재발송의 로딩 상태가 독립적이라 서로를 막지 않는다. 제출 중 "다시 받기"를 눌러 코드가 비워지는 레이스 가능
- `ResetPasswordScreen.tsx:20` — `route.params?.email ?? ''` 인데 `types.ts:14` 는 `{ email: string }` 필수. 옵셔널 처리와 타입 선언 불일치

---

### LegalDocumentScreen — 약관 전문
`frontend/src/screens/onboarding/LegalDocumentScreen.tsx` · 진입: Register "보기"(모달), Settings, ConsentGate 내부 Modal
호출 API: 없음 (`constants/legal.ts` 정적)

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 닫기 (31-38) | `goBack()` | — | — | — | ☐ |
| 본문 스크롤 | ScrollView | — | — | — | ☐ |

**상태 커버리지**: 접근성 ✅ **이 화면만 닫기 버튼에 라벨이 제대로 붙어 있다** — 나머지 화면의 본보기

**의심 지점**
- ⚠️ **README 경고 사항**: `constants/legal.ts` 의 약관 본문은 아직 **초안 골격**이고 `[[운영 주체가 입력]]` 자리표시자가 남아 있다. 출시 전 필수 (README「약관 본문」참고)

---

### ConsentGateScreen — 약관 재동의 게이트
`frontend/src/screens/onboarding/ConsentGateScreen.tsx` · 진입: `RootNavigator` (`user.requiresConsent`)
호출 API: `PUT /auth/me/consent`, `authStore.logout()`

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 전체 동의 (59) | `toggleAll` | — | — | — | ☐ |
| 약관/개인정보 동의 (61-76) | 각 토글 | — | — | — | ☐ |
| 약관·개인정보 "보기" (66,74) | Modal 오픈 | — | — | — | ☐ |
| 동의하고 계속하기 (83-89) | `agreeToCurrentTerms` → `setUser` | ✅ | ✅ | ✅ | ☐ |
| **로그아웃 (92)** | `logout()` 직결 | ❌ | ❌ try/catch 없음 | ❌ 연타 가능 | ☐ |
| Modal 닫기 / 뒤로가기 (96-103) | `setViewingDoc(null)` | — | — | — | ☐ |

**상태 커버리지**: 로딩 ⚠️ 제출만 · 빈 상태 — · 에러 ⚠️ 제출만 · 오프라인 ⚠️ · 키보드 — · 접근성 ⚠️

**의심 지점**
- **[확정] `ConsentGateScreen.tsx:92`** — `onPress={logout}` 이 try/catch·로딩·disabled 없이 직결. `authStore.ts:111-112` 의 `clearTokens()`/`set()` 은 try 밖이라 실패 시 unhandled rejection → 버튼이 먹통처럼 보인다

---

## 경로 2 — 커플 연결 & 홈 (4화면)

### HomeScreen — 홈
`frontend/src/screens/home/HomeScreen.tsx` · 진입: MainTab 첫 화면
호출 API: `relationApi.list`, `workoutApi.today/partnerToday`, `streakApi.me/partner`, `feedApi.timeline` + 커플 소켓 구독

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 배경 변경 (연결 시) | `pickImage`→`upload`→`setBackground` | ⚠️ `runBusy` 오버레이만 | ✅ toast | ❌ | ☐ |
| 프로필 아이콘 | `navigate('My')` | — | — | — | ☐ |
| D-day 히어로 탭 | 기념일 모달 | — | — | — | ☐ |
| 최근 기록 카드 | `navigate('FeedTimeline')` | — | — | — | ☐ |
| 바로가기 5종 (우리기록/일상/질문/캘린더/사진첩) | 각 `navigate` | — | — | — | ☐ |
| 커플 연결하기 (미연결) | `navigate('CoupleConnect')` | — | — | — | ☐ |
| 혼자 시작 3종 (운동/식단/맛집) | nested `navigate` | — | — | — | ☐ |
| 기념일 모달 배경/취소 | 닫기 | — | — | ⚠️ 저장 중에도 닫힘 | ☐ |
| 기념일 저장 | `setAnniversary` | ✅ | ✅ toast, 모달 유지 | ✅ | ☐ |

**상태 커버리지**: 로딩 ❌ · 빈 상태 ✅ 미연결 전용 UI · 에러 ⚠️ 5개 API 무음 실패 · 오프라인 ❌ · 키보드 — · 접근성 ❌

**의심 지점**
- **[확정] `HomeScreen.tsx:88`** — `fetchAll()` 에 `.catch()` 없음 + store 도 catch 없음 → unhandled rejection, 무음 (P1-10)
- **[확정] `HomeScreen.tsx:83,100`** — `connected` 가 store `loading` 을 안 봄 → 진입 직후 연결된 커플에게 "커플을 연결해보세요"가 깜빡임 (P2-13)
- `HomeScreen.tsx:62-66` — `new Date(connectedAt)` 로컬 타임존 계산. `YYYY-MM-DD` 문자열은 JS 가 UTC 자정으로 파싱하므로 음수 타임존에서 D-day 가 하루 어긋날 수 있다 (추정 — 실제 응답 포맷 확인 필요)
- `HomeScreen.tsx:103-112` — 위젯 갱신 effect 의존성에 `couple` 객체가 그대로 들어가 매 포커스마다 재실행 (성능)

---

### CoupleConnectScreen — 커플 연결
`frontend/src/screens/home/CoupleConnectScreen.tsx` · 진입: Home 미연결 버튼, FAB `requiresCouple` 우회
호출 API: `relationApi.createCoupleInvite`, `relationApi.connectCouple`

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 초대코드 생성 | `createInvite` | ✅ | ⚠️ Alert 만, 화면 복구 없음 | ✅ | ☐ |
| 복사 | `copyText` | ❌ | ❌ try/catch 없음 | — | ☐ |
| 공유 | `shareText` | ❌ | ❌ try/catch 없음 | ⚠️ 시트 중복 오픈 | ☐ |
| 연결하기 | `connectCouple` | ✅ | ✅ 인라인 | ✅ `disabled`(<6자) | ☐ |

**상태 커버리지**: 로딩 ✅ · 빈 상태 — · 에러 ⚠️ · 오프라인 ❌ · 키보드 ⚠️ `KeyboardAvoidingView` 없음 · 접근성 ❌

**의심 지점**
- **[확정] `CoupleConnectScreen.tsx:40-45,47-50`** — 복사·공유에 try/catch 없음. 실패해도 피드백 0 (P1-11)
- `CoupleConnectScreen.tsx:34` — 코드 생성 실패가 Alert 로만. 닫으면 실패 사실이 사라져 재시도 유도가 약함

---

### CoupleCalendarScreen — 커플 캘린더
`frontend/src/screens/home/CoupleCalendarScreen.tsx` · 진입: Home 바로가기
호출 API: `GET/POST/PUT/DELETE /calendar/events`

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| ‹ / › 월 이동 | `moveMonth(±1)` → 재조회 | ❌ | ⚠️ 빈 배열로 흡수 | ❌ **연타 시 경합** | ☐ |
| 날짜 셀 | `setSelectedDate` 토글 | — | — | — | ☐ |
| 전체 보기 칩 | `setSelectedDate(null)` | — | — | — | ☐ |
| 일정 카드 | `openEdit` 모달 | — | — | — | ☐ |
| ＋ 일정 추가 | `openCreate` 모달 | — | — | — | ☐ |
| 모달 배경 탭 / 취소 | 닫기 | — | — | — | ☐ |
| 종류 칩 4종 | `eventType` | — | — | — | ☐ |
| 매년 반복 스위치 | `repeatYearly` | — | — | — | ☐ |
| 삭제 (수정 모드) | Alert → `remove` | ❌ | ✅ toast, 모달 유지 | ⚠️ | ☐ |
| 저장 | `create`/`update` | ✅ | ✅ | ✅ | ☐ |

**상태 커버리지**: 로딩 ❌ · 빈 상태 ✅ · 에러 ⚠️ 조회는 무음 · 오프라인 ❌ · 키보드 ❌ 모달에 없음 · 접근성 ❌

**의심 지점**
- **[확정] `CoupleCalendarScreen.tsx:81-90`** — 월 이동 응답 레이스. `DietCalendarScreen:16-29` 의 `active` 플래그 패턴을 그대로 가져오면 된다 (P2-14)
- `CoupleCalendarScreen.tsx:313-391` — 모달에 `KeyboardAvoidingView`/내부 스크롤 없음 → 작은 화면에서 삭제/취소/저장이 가림
- `CoupleCalendarScreen.tsx:125-127` — 커플 미연결이어도 "＋ 일정 추가"가 활성. FAB(`requiresCouple`)와 달리 저장 시점에야 실패

---

### DailyQuestionScreen — 오늘의 질문
`frontend/src/screens/home/DailyQuestionScreen.tsx` · 진입: Home 바로가기
호출 API: `questionApi.today/history/answer`

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 당겨서 새로고침 | `load()` | ✅ | ⚠️ toast 만 | ⚠️ | ☐ |
| 답 남기기 | `answer(draft)` | ✅ | ✅ toast, 초안 유지 | ✅ | ☐ |

**상태 커버리지**: 로딩 ✅ · 빈 상태 ❌ · 에러 ⚠️ · 오프라인 ❌ · 키보드 ⚠️ 없음 · 접근성 ❌

**의심 지점**
- **[확정] `DailyQuestionScreen.tsx:60,106-111`** — `today` 가 null 이고 `history` 도 비면 헤더까지 빈 View 가 되어 **화면이 완전히 텅 빈다**. `EmptyState` 필요 (패턴 10)
- `DailyQuestionScreen.tsx:27-39` — 실패 시 toast 만. 재시도 수단이 pull-to-refresh 뿐

---

## 경로 3 — 첫 운동 기록 (운동 10화면)

> 이 도메인은 [PLAN.md 의 Workout Log v2](../PLAN.md) 로 구조 전환이 예정돼 있다.
> **세트 저장 구조를 바꾸는 항목(P0-1, P0-3)은 v2 작업과 함께 처리**하는 게 중복이 없다.

### WorkoutScreen — 운동 메인
`frontend/src/screens/workout/WorkoutScreen.tsx` · 진입: 하단 탭 "운동"
호출 API: `workoutStore.fetchToday/fetchHistory/loadMoreHistory/remove`

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 링크 6종 (내 루틴/몸 변화/대결/AI 추천/통계/캘린더) | 각 `navigate` | — | — | — | ☐ |
| 당겨서 새로고침 | `fetchToday`+`fetchHistory` | ✅ | ⚠️ 화면에 표시 없음 | ✅ | ☐ |
| 무한스크롤 | `loadMoreHistory` | ⚠️ `loadingMore` | ⚠️ | ❌ 화면단 가드 없음 | ☐ |
| WorkoutCard 길게 누르기 | Alert → `remove` | ❌ | ✅ Alert | ⚠️ | ☐ |
| 세션 시작 / ＋ 기록하기 | 각 `navigate` | — | — | — | ☐ |

**상태 커버리지**: 로딩 ⚠️ · 빈 상태 ✅ · 에러 ⚠️ · 오프라인 ❌ · 키보드 — · 접근성 ❌ 0건

**의심 지점**
- `WorkoutScreen.tsx:14,19` — `trainerApi`·`TrainerRoutine` import 가 주석(죽은 코드) 안에서만 쓰임 → 린트 도입 시 경고
- `WorkoutScreen.tsx:120-121` — `onEndReached` 화면단 가드 없음

---

### WorkoutSessionScreen — 운동 세션 ⚠️ 최우선
`frontend/src/screens/workout/WorkoutSessionScreen.tsx` · 진입: WorkoutScreen "세션 시작", RoutineList 카드 탭
호출 API: `workoutStore.save()`

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 휴식 프리셋 60/90/120s | `setRestSeconds` | — | — | — | ☐ |
| 운동 카드 ✕ | `removeExercise` | — | — | — | ☐ |
| 세트 셀 탭 | `toggleSet` + 휴식 시작 | — | — | — | ☐ |
| 세트 ＋ | `addSetRow` (상한 없음) | — | — | — | ☐ |
| ＋ 운동 추가 | 모달 | — | — | — | ☐ |
| 타이머 -15 / +15 / 건너뛰기 | `setRest` (+15 상한 없음) | — | — | — | ☐ |
| 종료 | `confirmExit` (미완료 시 Alert) | — | — | ✅ | ☐ |
| 운동 완료 | `save()` | ✅ | ⚠️ Alert | ✅ | ☐ |
| 모달 배경 탭 | 닫기 (입력 리셋 안 됨) | — | — | — | ☐ |
| 부위 칩 3종 | `setFCategory` | — | — | — | ☐ |
| 모달 추가 | `onAddExercise` | — | — | ❌ 연타 시 중복 행 | ☐ |
| **헤더 뒤로가기** | `goBack()` — **경고 없음** | — | — | ❌ | ☐ |

**상태 커버리지**: 로딩 ⚠️ · 빈 상태 ✅ · 에러 ⚠️ · 오프라인 ❌ · 키보드 ❌ **모달 3개 입력이 가림** · 접근성 ❌

**의심 지점**
- **[확정] `:150`** — `String(NaN)` → 문자열 `"NaN"` 이 서버로 전송 (P0-1)
- **[확정] `:124,131-132`** — 세트/횟수/무게 입력에 숫자 필터 없음. `WorkoutRecordScreen` 은 필터가 있는데 여기만 없다
- **[확정] `:267` + `headerOptions.tsx:27`** — 이탈 경고가 화면 안 "종료" 버튼에만. **헤더 뒤로가기·스와이프백·하드웨어백이 전부 우회** (P0-3)
- **[확정] `:81-93`** — `AppState` import 가 없다. 백그라운드에서 `setInterval` 이 멈춰 **복귀 시 휴식 시간이 실제보다 적게 줄어든 채 이어진다**. 타임스탬프 기반 보정 필요
- **[확정] `:221`** — 세트 배열에 인덱스 `key`. 중간 삭제 시 리마운트 어긋남 (패턴 9)
- `:105` — `setExercises` 업데이터 안에서 `setRest` 부수효과 호출. Strict Mode 에서 두 번 실행될 수 있는 패턴 (값이 멱등이라 증상은 없을 가능성)

---

### WorkoutRecordScreen — 운동 기록 입력
`frontend/src/screens/workout/WorkoutRecordScreen.tsx` · 진입: WorkoutScreen "＋ 기록하기"(모달)
호출 API: `workoutStore.save()`, 커플 연결 시 `publishEnsuringConnection`

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 프리셋 칩 8종 | `applyPreset` | — | — | — | ☐ |
| 세트 카드 삭제 | `removeSet` | — | — | — | ☐ |
| 카테고리 칩 3종 | `updateSet` | — | — | — | ☐ |
| 세트/횟수 입력 | 숫자 필터 `[^0-9]` | — | — | — | ☐ |
| 무게 입력 | `[^0-9.]` — **점 중복 허용** | — | — | — | ☐ |
| ＋ 운동 추가 / 총 시간 / 메모 | 각 로컬 | — | — | — | ☐ |
| 완료! | `save()` → 커플 공유 Alert | ✅ | ⚠️ Alert | ✅ | ☐ |
| 공유 Alert "공유하기" | `publishEnsuringConnection` | ❌ | ❌ **try/catch 없음** | ❌ | ☐ |
| 헤더 X | `goBack()` — 경고 없음 | — | — | — | ☐ |

**상태 커버리지**: 로딩 ⚠️ · 빈 상태 — · 에러 ⚠️ · 오프라인 ❌ · 키보드 ✅ (iOS 만) · 접근성 ❌

**의심 지점**
- **[확정] `:206`** — 무게 필터가 점 중복 허용 → `NaN` → `null` 로 조용히 유실 (P0-2)
- **[확정] `:109-123`** — 공유 콜백에 try/catch 없음. 실패 시 피드백 없이 대기
- **[확정]** 헤더 X 가 입력값과 무관하게 즉시 `goBack()` (패턴 3)

---

### WorkoutCalendarScreen / WorkoutStatsScreen
`WorkoutCalendarScreen.tsx` · `WorkoutStatsScreen.tsx` · 진입: WorkoutScreen 링크

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| (캘린더) ‹ / › 월 이동 | `changeMonth` | ❌ | ❌ **무음 실패** | — | ☐ |
| (통계) 누를 요소 없음 | 읽기 전용 | ❌ | ❌ **무음 실패** | — | ☐ |

**의심 지점**
- **[확정] `WorkoutCalendarScreen.tsx:16-29`** — 실패를 빈 Set 으로 흡수, 안내 없음 (P1-8)
- **[확정] `WorkoutStatsScreen.tsx:22-28`** — 실패 시 `?? 0` 폴백 → **API 실패와 진짜 0이 구분 불가** (P1-7)
- `WorkoutStatsScreen.tsx:48-56` — `last7Days` 는 빈 배열 안내가 없는데 `categoryBreakdown` 은 있다 (불일치)

---

### WorkoutRecommendScreen — AI 운동 추천
`frontend/src/screens/workout/WorkoutRecommendScreen.tsx` · 진입: WorkoutScreen 링크
호출 API: `POST /workout/recommend` (**timeout 60s 확인됨**), `workoutApi.saveRoutine`

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 오늘 뭐하지? (1일) | `recommend(1)` | ✅ `runBusy` 전체 블로킹 | ⚠️ toast | ✅ | ☐ |
| 5일 루틴 만들기 | `recommend(5)` | ✅ | ⚠️ | ✅ | ☐ |
| 내 루틴으로 저장 | `saveAsRoutine(day)` | ✅ | ⚠️ | ✅ | ☐ |

**상태 커버리지**: 로딩 ✅ **이 화면이 앱에서 로딩 처리가 가장 잘 된 편** · 빈 상태 ✅ · 에러 ⚠️ · 접근성 ❌

**의심 지점**
- `:57-68` — 타임아웃(`ECONNABORTED`)·429 한도초과 분기가 없어 서버 `message` 에 전적으로 의존
- `:98` — `result.days.map()` 에 옵셔널 체이닝 없음. 계약 불일치 시 렌더 중 TypeError (추정)

---

### WorkoutRoutineListScreen / WorkoutRoutineFormScreen

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| (List) 루틴 카드 탭 | `navigate('WorkoutSession', {exercises})` | — | — | ⚠️ 연타 시 중복 push | ☐ |
| (List) 카드 길게 누르기 | Alert → `removeRoutine` | ❌ | ⚠️ toast | ⚠️ | ☐ |
| (List) ＋ 루틴 만들기 | `navigate` | — | — | — | ☐ |
| (List) 당겨서 새로고침 | `load()` | ✅ | ⚠️ toast | ✅ | ☐ |
| (Form) 운동 행 ✕ / ＋ 운동 추가 | 로컬 | — | — | — | ☐ |
| (Form) 루틴 저장 | `saveRoutine` | ✅ | ⚠️ Alert | ✅ | ☐ |
| (Form) 모달 추가 | `onAddExercise` | — | — | ❌ 연타 시 중복 | ☐ |
| (Form) 헤더 X | `goBack()` — 경고 없음 | — | — | — | ☐ |

**의심 지점**
- **[확정] `WorkoutRoutineFormScreen.tsx:54-56`** — 세트/횟수/무게에 숫자 필터 없음 (패턴 2)
- **[확정]** Form 모달에 `KeyboardAvoidingView` 없음 (패턴 4)

---

### BodyMetricScreen / ChallengeScreen

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| (Body) 기록 카드 | **탭 무반응**, 롱프레스만 삭제 | ❌ | ⚠️ toast | ⚠️ | ☐ |
| (Body) ＋ 측정 추가 | 모달 | — | — | — | ☐ |
| (Body) 사진 선택 | `pickImage` | ❌ | ⚠️ toast | ❌ | ☐ |
| (Body) 저장 | 업로드 → `bodyApi.save` | ✅ `runBusy` | ⚠️ Alert | ✅ | ☐ |
| (Body) 당겨서 새로고침 | `load()` | ✅ | ⚠️ toast | ✅ | ☐ |
| (Chal) 대결 카드 | **탭 무반응**, 롱프레스만 삭제 | ❌ | ⚠️ toast | ⚠️ | ☐ |
| (Chal) ＋ 대결 만들기 | 모달 | — | — | — | ☐ |
| (Chal) 타입 칩 / 제목 / 시작일 / 종료일 / 벌칙 | 로컬 | — | — | — | ☐ |
| (Chal) 대결 시작 | `challengeApi.create` | ✅ | ⚠️ Alert | ✅ | ☐ |
| (Chal) 당겨서 새로고침 | `load()` | ✅ | ⚠️ toast | ✅ | ☐ |

**의심 지점**
- **[확정] `BodyMetricScreen.tsx:111-113`** — 체중·체지방·허리에 숫자 필터도, 상한/하한 검증도 없음 (패턴 2)
- **[확정] `BodyMetricScreen.tsx:182`, `ChallengeScreen.tsx:141`** — `activeOpacity` 만 있고 `onPress` 없음 (P2-22)
- **[확정] `ChallengeScreen.tsx` 전체** — `useRelationStore`/`couple` 참조가 **하나도 없다**. 커플 미연결 상태에서도 "＋ 대결 만들기"가 그대로 노출되고, 폼을 다 채운 뒤 서버 에러로만 알게 된다
- **[확정]** 두 화면 모두 모달에 `KeyboardAvoidingView` 없음

---

## 경로 4 — 식단 & 피드 (7화면)

### DietScreen — 식단 메인
`frontend/src/screens/diet/DietScreen.tsx` · 진입: WorkoutScreen 상단 세그먼트

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 통계 / 캘린더 링크 | 각 `navigate` | — | — | — | ☐ |
| AI 주간 식단 코칭 | `GET /meal/coach` (60s) | (AiInsightButton 확인 필요) | (확인 필요) | (확인 필요) | ☐ |
| AI 커플 주간 레터 | `GET /summary/ai-letter` (60s) | (확인 필요) | (확인 필요) | (확인 필요) | ☐ |
| 당겨서 새로고침 | `fetchToday`+`fetchHistory` | ✅ | ⚠️ | ❌ 화면단 락 없음 | ☐ |
| 무한스크롤 | `loadMoreHistory` | ✅ | ⚠️ | ⚠️ | ☐ |
| 오늘 영양 카드 | 영양목표 모달 | — | — | — | ☐ |
| MealCard 롱프레스 | Alert → `remove` | ❌ | ✅ Alert | ⚠️ | ☐ |
| 커플 목표 카드 | 목표 모달 | — | — | — | ☐ |
| ＋ 식단 기록하기 | `navigate('DietRecord')` | — | — | — | ☐ |
| 목표 모달 요일 칩 1~7 | `setDietGoal` | ⚠️ `disabled` 만 | ✅ Alert | ✅ | ☐ |
| 영양목표 저장 | `setNutritionGoal` | ✅ | ✅ toast | ✅ | ☐ |

**상태 커버리지**: 로딩 ⚠️ · 빈 상태 ✅ · 에러 ⚠️ · 오프라인 ❌ · 키보드 ❌ 모달 · 접근성 ❌ 0건

**의심 지점**
- **[확정] `:97-102`** — 스트릭·커플목표·영양 4개 조회가 전부 `.catch(() => setX(null))` 무음 실패
- **[확정] `:115-120,345-356`** — 영양 목표 입력 4개에 숫자 필터 없음 (패턴 2)
- **[확정] `:338-362`** — 영양목표 모달에 `KeyboardAvoidingView` 없음
- **[확정] `:61`** — 인덱스 `key` (정적 배열이라 위험은 낮음)

---

### DietRecordScreen — 식단 기록 입력
`frontend/src/screens/diet/DietRecordScreen.tsx` · 진입: DietScreen, FAB "음식 촬영"

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 끼니 칩 4종 | `setMealType` | — | — | — | ☐ |
| 사진 박스 | `pickImage`/`takePhoto` | ❌ | ✅ toast | ❌ | ☐ |
| 사진 제거 | `setPhotoUri(null)` | — | — | — | ☐ |
| AI로 음식 분석 | `POST /meal/analyze` (60s) | ✅ + `runBusy` | ✅ toast | ✅ | ☐ |
| ＋ 현재 저장 (즐겨찾기) | `saveFavorite` | ❌ | ✅ toast | ❌ **연타 시 중복 저장** | ☐ |
| 즐겨찾기 칩 탭 / 롱프레스 | 추가 / Alert → 삭제 | ❌ | ✅ toast | ⚠️ | ☐ |
| 추천 칩 | 로컬 메모 추가 | — | — | — | ☐ |
| AI로 칼로리 계산 | `POST /meal/analyze-text` (60s) | ✅ | ✅ toast | ✅ | ☐ |
| 완료! | 업로드 + `save` | ✅ + `runBusy` | ✅ Alert | ✅ | ☐ |
| 저장완료 Alert "공유하기" | `publishEnsuringConnection` | ❌ | ❌ **try/catch 없음** | — | ☐ |

**상태 커버리지**: 로딩 ✅ 대부분 · 빈 상태 ✅ · 에러 ⚠️ · 오프라인 ❌ · 키보드 ✅ (iOS 만) · 접근성 ❌

**의심 지점**
- **[확정] `:232-235` vs `:304-308`** — 사진을 지워도 `macros` 가 초기화되지 않아 **화면에 없는 탄단지가 전송된다** (P0-4)
- **[확정] `:245-260`** — 공유 콜백 try/catch 없음
- **[확정] `:90-110,344-346`** — 즐겨찾기 저장에 락 없음

---

### DietCalendarScreen / DietStatsScreen

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| (Cal) ‹ / › 월 이동 | `changeMonth` | ❌ | ❌ 무음 | ✅ **`active` 플래그로 stale 응답 무시** | ☐ |
| (Stats) 누를 요소 없음 | 읽기 전용 | ⚠️ `loaded` 만 | ❌ 무음 | — | ☐ |

**의심 지점**
- ✅ **`DietCalendarScreen.tsx:16-29` 의 `active` 플래그는 앱에서 유일하게 레이스를 제대로 막은 코드다.** `CoupleCalendarScreen`·`WorkoutCalendarScreen` 에 그대로 이식할 것
- **[확정] `DietStatsScreen.tsx:67-69`** — EmptyState 조건이 `loaded && stats && totalDays===0`. 실패로 `stats=null` 이면 **에러도 EmptyState 도 안 뜨고 0값 카드만** 보인다 (P1-7)

---

### FeedTimelineScreen — 우리 기록
`frontend/src/screens/feed/FeedTimelineScreen.tsx` · 진입: Home "우리 기록"

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 당겨서 새로고침 | `load()` | ✅ | ✅ toast | ✅ `busy.current` 락 | ☐ |
| 무한스크롤 | `loadMore()` | ✅ | ✅ toast | ✅ 락 + 키 Set 중복 제거 | ☐ |
| 이모지 반응 | `feedApi.react` | ❌ | ✅ toast | ❌ **연타 시 응답 역전** | ☐ |
| 카드 롱프레스 (본인 POST) | Alert → `removePost` | ❌ | ✅ Alert | ⚠️ | ☐ |
| 카드 롱프레스 (그 외) | 조기 return — **무반응** | — | — | — | ☐ |

**상태 커버리지**: 로딩 ✅ · 빈 상태 ✅ · 에러 ✅ · 오프라인 ❌ · 키보드 — · 접근성 ❌

**의심 지점**
- ✅ **페이징 처리가 앱에서 가장 견고하다** (`busy.current` 락 + `hasMore` + 키 기반 중복 제거). 다른 무한스크롤 화면의 표준으로 삼을 것
- **[확정] `:88-98`** — 반응 토글에 락 없음. 응답 순서가 뒤바뀌면 최종 상태가 마지막 탭과 달라짐
- **[확정] `:100-101`** — 남의 글 롱프레스가 무반응 (P2-26)

---

### FeedComposeScreen / PhotoAlbumScreen

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| (Compose) 사진 박스 / 지우기 | `pickImage` / null | ❌ | ✅ toast | ❌ | ☐ |
| (Compose) 남기기 | 업로드 → `createPost` | ✅ + `runBusy` | ✅ Alert | ✅ | ☐ |
| (Album) 당겨서 새로고침 | `load()` | ✅ | ❌ **무음 → EmptyState** | ✅ | ☐ |
| (Album) 무한스크롤 | `loadMore()` | ✅ | ✅ toast | ✅ | ☐ |
| (Album) 사진 셀 탭 / 모달 닫기 | 큰 보기 / 닫기 | — | — | — | ☐ |

**의심 지점**
- **[확정] `FeedComposeScreen.tsx:56-83`** — **이 화면만** `KeyboardAvoidingView` 가 없다. 같은 "사진+멀티라인" 패턴인 `DietRecordScreen:272`·`PlaceAddScreen:114`·`WorkoutRecordScreen:136` 은 전부 있다
- **[확정] `PhotoAlbumScreen.tsx:44-61` vs `:63-81`** — 같은 API 인데 초기 로드 실패는 무음, 더보기 실패는 toast (불일치)
- **[확정] `PhotoAlbumScreen.tsx:33`** — `CELL` 이 모듈 로드 시 1회 계산 → 회전 시 어긋남 (P2-25)

---

## 경로 5 — 채팅 & 마이 (5화면)

### ChatScreen — 채팅방 목록

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 채팅방 아이템 | `navigate('ChatRoom')` | — | — | ⚠️ | ☐ |
| 당겨서 새로고침 | `loadRooms()` | ✅ | ❌ **실패해도 EmptyState** | ✅ | ☐ |

**의심 지점**
- **[확정] `:98-102`** — 로드 실패와 진짜 빈 목록이 구분 안 됨 (패턴 1)
- `:44-54` — 커플 방 자동 리다이렉트를 `enteredRef` 로 1회만 막는다. `replace` 후 화면이 언마운트되지 않는 예외 상황에선 반복 호출 위험 (추정)

---

### ChatRoomScreen — 채팅 대화
`frontend/src/screens/chat/ChatRoomScreen.tsx` (25KB, 화면 중 두 번째로 큼)
호출 API: `chatApi.edit/remove/react` + STOMP `send`/`openRoom`/`closeRoom`/`markRead`

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 메시지 롱프레스 | 액션시트 (147-167) | — | — | — | ☐ |
| └ 리액션 달기 / 답장 / 수정 | 각 상태 세팅 | — | — | — | ☐ |
| └ 삭제 → 확인 | `chatApi.remove` | ❌ | ✅ toast | ❌ | ☐ |
| 리액션 칩 토글 | `chatApi.react` | ❌ | ✅ toast | ❌ **연타 시 상태 꼬임** | ☐ |
| 빠른 리액션 5종 | `send(TEXT, emoji)` | — | ⚠️ `ok=false` 만 Alert | — | ☐ |
| 스티커 토글 / 이모지 더 보기 | 패널 · 피커 | — | — | — | ☐ |
| 스티커 16종 | `send(STICKER)` | — | ⚠️ | — | ☐ |
| 답장/수정 배너 X | 상태 초기화 | — | — | — | ☐ |
| 맞춤법 제안 적용 / 닫기 | 로컬 | — | — | — | ☐ |
| 카메라 (이미지 전송) | `pickImage`→`upload`→`send(IMAGE)` | ✅ | ✅ toast | ✅ `disabled={uploading}` | ☐ |
| **전송 버튼 (수정 모드)** | `chatApi.edit` | ❌ | ✅ toast | ❌ **중복 PUT** | ☐ |
| 전송 버튼 (신규) | STOMP publish | — | ✅ Alert | ⚠️ `!text.trim()` 만 | ☐ |

**상태 커버리지**: 로딩 ⚠️ 업로드만 · 빈 상태 ❌ **`ListEmptyComponent` 없음** · 에러 ⚠️ · 오프라인 ⚠️ Alert 만 · 키보드 ✅ (iOS offset 90) · 접근성 ⚠️ 스티커·닫기는 있고 **카메라는 없음**

**의심 지점**
- **[확정] `:114-130`** — 수정 모드 전송 버튼에 in-flight 가드 없음 (P2-19)
- **[확정] `:186-194`** — 리액션 칩에 락 없음
- **[확정] `:104-112`** — 읽음 처리 실패 재시도가 새 메시지 도착 시에만 (P2-20)
- **[확정] `:412-418`** — 카메라 버튼만 `accessibilityLabel` 누락 (같은 줄 스티커 버튼은 있음)
- **[확정] `:499`** — 하드코딩 `'#E0A020'`
- `:330-337` — `onEndReached` 가 없다. 과거 메시지 페이징이 store 에 있는지 확인 필요
- `:105` — `messages.find(m => m.senderId !== myId)` 가 "배열이 항상 최신순"을 전제. 정렬이 깨지면 읽음 처리가 오래된 id 에 고정 (추정)
- **WebSocket 생명주기** — 구독/해제/재연결이 전부 `chatStore` 안에 있다. **중복 구독·백그라운드 복귀 재연결은 store 를 따로 감사해야 한다** ← 다음 라운드 과제

---

### MyScreen — 마이
`frontend/src/screens/my/MyScreen.tsx` (22KB)

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 프로필 사진 | `pickImage`→`upload`→`updateProfile` | ✅ | ✅ Alert | ✅ | ☐ |
| 이름 수정 / 취소 | 편집 모드 | — | — | — | ☐ |
| 저장 | `updateProfile({name})` | ✅ | ✅ Alert | ✅ | ☐ |
| 주간 리포트 공유 | `publishEnsuringConnection` | ⚠️ 자식 컴포넌트 의존 | ✅ toast | ⚠️ | ☐ |
| 지난 기록 불러오기 | `restoreRecords` | ✅ | ✅ Alert | ✅ | ☐ |
| 기록 완전 삭제 | `purgeRecords` (2단계 확인) | ✅ | ✅ Alert | ✅ | ☐ |
| 설정 | `navigate('Settings')` | — | — | ⚠️ | ☐ |
| **로그아웃** | `logout()` | ❌ | ⚠️ 내부에서 삼킴 | ❌ | ☐ |
| 커플 연결 끊기 | `endRelation` | ✅ | ✅ Alert | ✅ | ☐ |
| **회원 탈퇴** | `withdraw()` | ❌ | ✅ Alert | ❌ | ☐ |

**상태 커버리지**: 로딩 ⚠️ · 빈 상태 — · 에러 ⚠️ 진입 시 5개 API 무음 · 오프라인 ❌ · 키보드 ⚠️ · 접근성 ❌

**의심 지점**
- **[확정] `:466`** — **회원 탈퇴에만** `disabled`/로딩 없음. 같은 화면의 다른 위험 동작 3개는 전부 막는데 (P0-5)
- **[확정] `:133-138`** — 로그아웃도 동일. `authStore.ts:108-109` 가 네트워크 오류를 삼켜 실패가 드러나지도 않는다
- **[확정] `:63-72`** — 진입 시 5개 API 가 각각 무음 catch. 재시도 버튼 없음

---

### SettingsScreen / ChangePasswordScreen

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| (Set) 푸시 알림 스위치 | `updateNotificationSetting` | ⚠️ `disabled` 만 | ✅ Alert | ✅ | ☐ |
| (Set) 마케팅 스위치 | `updateMarketingConsent` | ⚠️ | ✅ Alert | ✅ | ☐ |
| (Set) 맞춤법 제안 스위치 | 로컬 | — | — | — | ☐ |
| (Set) 비밀번호 변경 / 약관 / 개인정보 | 각 `navigate` | — | — | ⚠️ | ☐ |
| (Set) 문의·버그 신고 | `Linking.openURL(mailto:)` | — | ✅ **`canOpenURL` 실패까지 Alert** | — | ☐ |
| (Pwd) 표시 토글 ×3 | `reveal` | — | — | — | ☐ |
| (Pwd) 비밀번호 변경 | `changePassword` → `logout()` | ✅ | ✅ 필드 인라인 | ✅ 이중 | ☐ |
| (Pwd) 기억나지 않나요 | 로컬 Alert | — | — | — | ☐ |

**의심 지점**
- ✅ `SettingsScreen.tsx:67-86` 의 문의 링크 처리(`canOpenURL` 실패 + 예외 모두 Alert)가 **앱에서 가장 견고한 에러 처리**다. 본보기로 삼을 것
- **[확정] `ChangePasswordScreen.tsx:94-102`** — "현재 비밀번호 불일치" 에러가 **"새 비밀번호 확인"** 필드에 뜬다. 정작 "현재 비밀번호" 필드엔 `errorText` 가 전달되지도 않음 (P2-15)
- `SettingsScreen.tsx:37-47` — 낙관적 업데이트가 아니라 서버 응답 후 반영(pessimistic). 응답이 늦으면 탭이 씹힌 것처럼 보이는데 스피너가 없다
- **[확정] `TextField.tsx:44-52`** — 표시/숨김 토글에 라벨 없음. 이 화면에서만 3번 반복

---

## 경로 6 — 여행 & 맛집 (10화면)

### TripListScreen / TripFormScreen

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| (List) 여행 카드 탭 | `navigate('TripDetail')` | — | — | ❌ | ☐ |
| (List) 카드 롱프레스 | Alert → `remove` | ❌ | ✅ Alert | ❌ | ☐ |
| (List) 당겨서 새로고침 | `load()` | ✅ | ⚠️ toast | ✅ | ☐ |
| (List) ＋ 여행 만들기 | `navigate('TripForm')` | — | — | ❌ | ☐ |
| (Form) 커버 사진 | `pickImage` | ❌ | ✅ toast | ❌ | ☐ |
| (Form) 시작일 / 종료일 | 시작일 변경 시 종료일 자동 보정 | — | — | — | ☐ |
| (Form) 메모 | 로컬 | — | — | — | ☐ |
| (Form) 저장 | `save`/`update` | ✅ | ✅ Alert | ✅ | ☐ |

**의심 지점**
- **[확정] `TripFormScreen.tsx:45-81`** — `onSave` 가 `startDate <= endDate` 를 **재검증하지 않는다**. 자동 보정(33행)은 사용자가 시작일을 건드렸을 때만 동작하므로, 이미 역전된 여행을 불러와 메모만 고치면 역전 상태가 그대로 재전송된다
- **[확정] `TripFormScreen.tsx:86`** — `KeyboardAvoidingView` 없음 (`PlaceAddScreen:114` 은 있음)

---

### TripDetailScreen — 여행 상세 ⚠️ 38KB, 최대 화면
`frontend/src/screens/trip/TripDetailScreen.tsx`

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| 수정 링크 | `navigate('TripForm', {trip})` | — | — | ❌ | ☐ |
| 경비/준비물/앨범/회고 카드 4개 | 각 `navigate` | — | — | ❌ | ☐ |
| 탭 (일정/장소) | `setTab` | — | — | — | ☐ |
| AI로 일정 짜기 | 모달 오픈 | — | — | — | ☐ |
| Day 선택 칩 | `setSelectedDay` | — | — | — | ☐ |
| 지도 마커 | `placeId` 있으면 `navigate` | — | ⚠️ **없으면 무반응** | — | ☐ |
| 일정 카드 탭 | `openEdit` | — | — | — | ☐ |
| ▲ / ▼ 순서 | `moveItem` | ⚠️ 낙관적만 | ✅ toast + `load()` 롤백 | ❌ **경합** | ☐ |
| ✕ 삭제 | Alert → `removeItem` | ❌ | ✅ Alert | ❌ | ☐ |
| ＋ 일정 추가 | 모달 | — | — | — | ☐ |
| ＋ 장소 담기 | `placeApi.list()` | ❌ | ✅ toast | ❌ | ☐ |
| 담긴 장소 카드 탭 / 롱프레스 | `navigate` / Alert → `detachPlace` | ❌ | ✅ Alert | ❌ | ☐ |
| [일정모달] Day 칩 / 이름 / 시간 / 종류 / 메모 | 로컬 | — | — | — | ☐ |
| [일정모달] 장소 연결 | `placeApi.list()` | ❌ | ✅ toast | ❌ | ☐ |
| **[일정모달] 추가/수정** | `saveItem()` | ❌ | ✅ Alert | ❌ **중복 등록** | ☐ |
| [AI모달] 백드롭/취소 | `aiLoading` 이면 차단 | — | — | ✅ | ☐ |
| [AI모달] 일정 생성 | `POST /trips/{id}/items/generate` (60s) | ✅ ActivityIndicator | ✅ Alert | ✅ 버튼 언마운트 | ☐ |
| [장소담기모달] 후보 탭 | `attachPlace` | ❌ | ✅ Alert | ❌ | ☐ |

**상태 커버리지**: 로딩 ⚠️ · 빈 상태 ✅ · 에러 ⚠️ `detail=null` 이면 빈 화면 · 오프라인 ❌ · 키보드 ❌ **모달 3개 전부** · 접근성 ❌

**의심 지점**
- **[확정] `:626`** — 일정 저장 버튼에 `loading`/`disabled` 미연결 (패턴 6)
- **[확정] `:231-265`** — Day 이동 시 `reorderItems` 실패가 바깥 catch 로 빠져 `load()` 미실행 → 서버·화면 불일치 (P2-16)
- **[확정] `:288-309`** — `moveItem` 클로저 캡처 + in-flight 가드 없음 (P2-17)
- **[확정] `:226`** — 시간 정규식이 `25:99` 통과 (P2-18)
- **[확정] `:440-441`** — `placeId` 없는 마커 탭이 무반응
- ✅ AI 모달의 로딩 처리(백드롭 차단·입력 비활성·버튼 언마운트)는 **앱에서 가장 잘 만든 블로킹 UX**. 다른 AI 기능에 이식할 것
- **실시간 협업 없음** — PLAN.md 는 TRIP 이벤트로 실시간 갱신한다고 쓰여 있는데 이 화면엔 소켓 코드가 없고 `useFocusEffect` 재조회뿐이다. 모달을 열어둔 사이 상대가 수정하면 **내가 덮어쓴다**. 스펙과 구현 불일치 — 확인 필요

---

### TripExpenseScreen / TripChecklistScreen / TripAlbumScreen / TripRecapScreen

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| (Exp) 경비 행 탭 / 롱프레스 | `openEdit` / Alert → 삭제 | ❌ | ✅ Alert | ❌ | ☐ |
| (Exp) ＋ 경비 추가 / 당겨서 새로고침 | 모달 / `load()` | ✅ | ✅ toast | ✅ | ☐ |
| (Exp) 금액 입력 | ✅ **숫자만 필터 + `<=0` 검증** | — | — | — | ☐ |
| (Exp) 나/상대 · 종류 칩 · 메모 | 로컬 | — | — | — | ☐ |
| **(Exp) 추가/수정** | `save()` | ❌ | ✅ Alert | ❌ **중복 등록** | ☐ |
| (Chk) 인라인 추가 / 추가 버튼 | `add()` | ⚠️ | — | ✅ **`disabled` 제대로 있음** | ☐ |
| (Chk) 체크박스 | `toggle` 낙관적 | ⚠️ | ✅ toast + `load()` 롤백 | ❌ | ☐ |
| (Chk) 롱프레스 → 이름수정/삭제 | Alert | — | ✅ Alert | ❌ | ☐ |
| (Chk) 이름수정 모달 저장 | `saveRename` | ❌ | ✅ Alert | ❌ | ☐ |
| (Alb) ＋ 사진 담기 / 후보 탭 | `albumCandidates` / `attachAlbum` | ❌ | ✅ | ❌ | ☐ |
| (Alb) 사진 셀 탭 | **`onPress` 없음 — 무반응** | — | — | — | ☐ |
| (Alb) 사진 셀 롱프레스 | Alert → `detachAlbum` | ❌ | ✅ Alert | ❌ | ☐ |
| (Rec) 누를 요소 없음 | 읽기 전용 | ✅ 최초만 | ❌ **실패 시 빈 화면** | — | ☐ |

**의심 지점**
- ✅ **`TripExpenseScreen.tsx:94-98` 의 금액 검증(`!amount || amount <= 0`)이 앱에서 유일하게 제대로 된 숫자 처리다.** 패턴 2 수정 시 이걸 표준으로
- **[확정] `TripExpenseScreen.tsx:288`, `TripChecklistScreen.tsx:107-122`** — 모달 저장 버튼 락 없음 (패턴 6)
- **[확정] `TripExpenseScreen.tsx:85`** — 수정 모달이 `String(e.amount)` 로 초기화. 서버가 소수 금액을 주면 편집 시 숫자 필터가 소수점을 지워 **값이 잘린다** (서버 응답 포맷 확인 필요)
- **[확정] `TripAlbumScreen.tsx:113`** — 사진 셀 탭 무반응 (P2-22)
- **[확정] `TripRecapScreen.tsx:55-61`** — 실패 시 완전히 빈 화면 + `ScrollView` 라 새로고침도 불가 → **재시도 수단 0** (P1-9)
- ✅ `TripChecklistScreen.tsx:56-59` 의 `disabled={!newText.trim() || adding}` 는 패턴 6 의 모범 사례
- `TripExpenseScreen` — 금액 `maxLength=12` 뿐, 상한 검증 없어 1조 원도 저장됨

---

### PlaceMapScreen / PlaceAddScreen / PlaceDetailScreen

| 요소 | 동작 | 로딩 | 에러 | 중복탭 방어 | 확인 |
| --- | --- | --- | --- | --- | --- |
| (Map) AI 데이트 코스 | `GET /places/date-course` (60s) | (AiInsightButton 확인 필요) | (확인 필요) | (확인 필요) | ☐ |
| (Map) 필터칩 3종 / 지도 칩 / 여행 칩 | 각 상태·`navigate` | — | — | ❌ | ☐ |
| (Map) 지도 마커 / 리스트 카드 탭 | `navigate('PlaceDetail')` | — | — | — | ☐ |
| (Map) 카드 롱프레스 | Alert(방문기록 함께 삭제 안내) → `remove` | ❌ | ✅ Alert | ❌ | ☐ |
| (Map) ＋ 장소 추가하기 | `navigate` | — | — | ❌ | ☐ |
| (Add) 검색 입력 / 검색 버튼 | WebView `search()` + 6초 타임아웃 | ✅ | ❌ **타임아웃 시 무음** | ✅ | ☐ |
| (Add) 검색 결과 카드 | 자동 입력 + 핀 이동 | — | — | — | ☐ |
| (Add) 이름 / 주소 / 지도 탭 | 로컬 · `onMapSelect` | — | (WebView 확인 필요) | — | ☐ |
| (Add) 카테고리 칩 / 상태 칩 | 로컬 | — | — | — | ☐ |
| (Add) 추가하기 | `placeApi.save` | ✅ | ✅ Alert | ✅ 이중 | ☐ |
| (Det) 방문 기록 남기기 / 취소 | 폼 토글 — **입력 초기화 안 함** | — | — | — | ☐ |
| (Det) 별점 1~5 | 재탭 시 0 해제 | — | — | — | ☐ |
| (Det) 사진 추가 / 메모 | `pickImage` / 로컬 | ❌ | ✅ toast | ❌ | ☐ |
| (Det) 기록 저장 | 업로드 → `recordVisit` | ✅ | ✅ Alert, 실패 시 폼 보존 | ✅ | ☐ |
| (Det) 방문 기록 카드 탭 | **`onPress` 없음 — 무반응** | — | — | — | ☐ |
| (Det) 카드 롱프레스 | Alert → `removeVisit` | ❌ | ✅ Alert | ❌ | ☐ |
| (Det) 당겨서 새로고침 | `load()` | ✅ | ✅ | ✅ | ☐ |

**의심 지점**
- **[확정] `PlaceMapScreen.tsx:133-149`** — 지도 모드에선 `FlatList` 가 렌더되지 않아 **당겨서 새로고침이 없다**. 장소를 추가/삭제해도 재포커스 전까지 지도에 반영 안 됨
- **[확정] `PlaceAddScreen.tsx:52-68`** — 검색 6초 타임아웃 후 스피너만 사라지고 안내 없음 (P2-24)
- **[확정] `PlaceDetailScreen.tsx:160,167`** — 폼 취소 시 별점·메모·사진 미초기화 → 다시 열면 이전 입력이 남아 **모르고 저장할 수 있다** (P2-23)
- **[확정] `PlaceDetailScreen.tsx:174`** — 방문 기록 카드 탭 무반응. 사진 확대가 불가능
- **[확정] `PlaceDetailScreen`** — `KeyboardAvoidingView` 없음 (폼이 `ListHeaderComponent` 안)
- `PlaceMapScreen.tsx:29` — 인덱스 `key` (정적)
- **KakaoMap WebView** — `postMessage` 파싱 실패·키 미설정 시 폴백은 `components/KakaoMap.tsx` 를 따로 감사해야 한다 ← 다음 라운드 과제

---

## 부록 — 트레이너 (5화면, 현재 비활성)

> **5개 화면 전부 도달 불가.** `HomeStackNavigator.tsx:17-85` 에 `Stack.Screen` 5개와 import 가 주석 처리돼 있고,
> 진입점인 `MyScreen.tsx:347-387`·`WorkoutScreen.tsx:26-54` 도 주석 블록이다.
> **되살릴 때 이 목록을 먼저 볼 것.**

| 화면 | 도달 | 주요 의심 지점 |
| --- | --- | --- |
| `TrainerRegisterScreen` | 불가 | `:37` 성공 시 `replace('TrainerDashboard')` — 라우트가 미등록이라 **되살리는 순간 이 줄이 먼저 터진다** |
| `TrainerConnectScreen` | 불가 | `:41-59` `KeyboardAvoidingView` 없음 (같은 폴더 Register·RoutineAssign 은 있음) |
| `TrainerDashboardScreen` | 불가 | `:30-35` 로드 실패가 "아직 연결된 회원이 없어요"로 위장 (패턴 1) |
| `TrainerMemberDetailScreen` | 불가 | **`:99-101` 문구 위치 오류** — `"(길게 눌러 삭제)"` 가 루틴 0개일 때 뜬다 (P2-21) / `:49-67` 삭제에 진행 상태 없음 |
| `TrainerRoutineAssignScreen` | 불가 | `:72-82` 날짜 칩이 색상만으로 선택 표현, `accessibilityState` 없음 |

---

## 감사 진행 방법

### 라운드 구성

| 라운드 | 범위 | 산출물 |
| --- | --- | --- |
| 0 | typecheck·lint 스크립트 도입, `npm install` | CI 에서 돌아가는 안전망 |
| 1 | **전역 패턴 1~3** 일괄 수정 (에러 상태 분리 · `toNumberOrUndefined` · `useUnsavedGuard`) | 공용 훅 3개 |
| 2 | 경로 1~2 (온보딩·홈, 12화면) 손으로 전수 클릭 + P0/P1 수정 | 이 문서의 ☐ 채우기 |
| 3 | 경로 3 (운동 10화면) — **PLAN.md 의 Workout Log v2 와 묶어서** | v2 1단계 |
| 4 | 경로 4~6 (식단·피드·채팅·마이·여행·맛집, 22화면) | |
| 5 | 미감사 영역 (아래) | |

### 아직 감사하지 않은 것

이번 라운드는 **화면(screens/) 49개 + navigation** 만 봤다. 아래는 다음 대상이다.

| 영역 | 왜 중요한가 |
| --- | --- |
| `store/` (`chatStore`·`workoutStore`·`dietStore`) | **WebSocket 구독/해제/재연결**, 무한스크롤 중복 요청 방어, 낙관적 업데이트 롤백이 전부 여기 있다 |
| `components/` 19개 (`FeedCard`·`WorkoutCard`·`MealCard`·`AiInsightButton`·`DateField`·`KakaoMap`·`WeeklyRecapCard`) | 화면 표의 "(확인 필요)" 칸이 전부 여기서 결정된다 |
| `utils/` (`imageUpload`·`storage`·`date`·`haptics`) | 이미지 권한 거부·대용량·Cloudinary 폴백, 타임존 처리 |
| 백엔드 검증 규칙 | 프론트 검증(비밀번호 8자 등)이 서버와 실제로 일치하는지 |
| 다크모드 전수 | 하드코딩 색상 8건 외에 실제로 대비가 깨지는 화면 |

### 손으로 확인할 때 매 화면 공통 체크

각 화면 표의 ☐ 를 채우면서 아래도 함께 본다.

- [ ] 비행기 모드에서 진입 → 에러가 보이고 **재시도할 수 있는가**
- [ ] 느린 네트워크(개발자 도구 3G)에서 제출 버튼 연타 → 중복 생성되는가
- [ ] 폼 작성 중 **헤더 뒤로가기 / 스와이프백 / 안드로이드 백** → 경고가 뜨는가
- [ ] 입력창에 `"1.2.3"`, `"-"`, `"abc"`, 아주 큰 수 붙여넣기 → 저장 결과가 맞는가
- [ ] 키보드를 올렸을 때 **제출 버튼이 보이는가** (특히 모달)
- [ ] 다크모드 전환 → 대비가 깨지는 요소가 있는가
- [ ] 커플 **미연결** 계정으로 진입 → 화면이 깨지지 않는가
- [ ] 데이터가 **0건**일 때 안내가 뜨는가 (빈 화면이 아니라)

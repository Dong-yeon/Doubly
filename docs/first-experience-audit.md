# 신규 커플 첫 경험 경로 점검 + 기능 사용량 (2026-10-03)

- 기준 소스: `main` `cc6f13d7`. 코드는 고치지 않았고, 이 문서만 새로 만들었습니다.
  - 병합 시점의 `origin/main` (`96987b74`, Cloudinary 고아 정리·채팅 멱등키 전 타입) 에서 `HomeScreen.tsx`(약 400행 이후 +3),
    `FeedService.java`(780행 이후 +6), `ChatRoomScreen.tsx`, `DietRecordScreen.tsx` 의 라인이 조금 밀렸습니다.
    발견 사항은 그 커밋에서도 유효함을 확인했습니다 — 사진은 discard 로 지워도 PHOTO_UPLOAD 한도는 돌아오지 않습니다.
- DB 조회: 운영 Railway PostgreSQL. 세션 전체에 `default_transaction_read_only=on` 을 걸고 SELECT 만 실행했습니다.
- 우리 커플: `relations.id = 3` (users 1·5)

---

## 0. 요약

**경로 전체를 막는 S1 은 사실상 없습니다.** 대신 *처음 쓰는 커플이 이탈하기 쉬운* S2 가 연결 단계에 몰려 있습니다.

1. **초대가 링크가 아니라 텍스트 코드입니다.** 딥링크와 디퍼드 딥링크가 없어서, 앱이 없는 상대는 설치 → 가입 → 홈 → "커플 연결하기" → 코드 입력까지 직접 해야 합니다.
2. **연결돼도 초대한 쪽은 모릅니다.** 푸시도 소켓 이벤트도 폴링도 없어서 코드 화면에 그대로 머뭅니다.
3. **옛 초대코드가 계속 유효하고, 수락할 때 초대자 쪽의 활성 커플 여부를 보지 않습니다.** 이 때문에 한 사람이 활성 커플 2개에 속할 수 있습니다. 운영 DB 에는 아직 그런 사례가 0건입니다.
4. **로그아웃해도 푸시 토큰이 남습니다.** 또 OS 설정에서 알림을 나중에 켜면, 앱 프로세스를 다시 띄우기 전까지 토큰이 등록되지 않습니다.
5. **PRO 체험은 지금 없습니다.** `PLAN_FREE_TRIAL=false`, `PLAN_TRIAL_DAYS=0` 이 기본값입니다. 핵심 경로(연결·일상·무드·채팅 텍스트·푸시·반응)는 게이팅이 없습니다. 신규 FREE 커플이 가장 먼저 부딪칠 한도는 **커플 합산 사진 월 60장**입니다.

**운영 데이터에서 본 실제 신호**

- 2026-08-20 에 가입한 사용자 한 명이 6주 동안 **초대코드를 8번 만들었지만 한 번도 연결되지 않았습니다** (§3.4).
- 같은 사용자에게 **안드로이드 푸시 토큰이 52개** 쌓여 있습니다. 토큰을 정리하는 계기가 "상대에게 푸시를 보낼 때"뿐이라, 미연결 사용자는 영원히 정리되지 않습니다.

---

## 조치 현황

**2026-10-03 — 초대·연결 묶음 (#3·#4·#5·#6·#15·#16·#17) 수정**

서버는 Railway 배포 완료(`d25a8eb3`), 앱은 같은 커밋으로 production OTA 완료(2026-10-03, 1.0.6 빌드 대상 —
fingerprint 일치 확인, iOS 업데이트 그룹 `2e57953d`·Android `7767f4c5`). 새 앱이 옛 서버를 만나도 코드 조회만
조용히 실패할 뿐 동작은 그대로입니다.

- **#4·#15 — 사람마다 살아 있는 코드는 하나:** "새 코드 만들기"는 대기 중인 같은 행의 코드를 바꿉니다
  (`RelationService.createCoupleInvite`). 옛 코드는 그 순간 무효가 됩니다.
  - 수락할 때 초대한 쪽의 활성 커플 여부도 확인합니다.
  - 연결되면 두 사람이 따로 만들어 둔 다른 코드를 모두 비웁니다 (`RelationRepository.clearOtherCoupleInvites`).
- **#5 — 동시 수락 직렬화:** 연결은 두 사용자 행을 id 오름차순으로 잠근 뒤에 판단합니다
  (`UserRepository.findByIdForUpdate`). 관계 행은 잠금 뒤에 `findByInviteCodeForUpdate` 로 다시 읽습니다.
  - 같은 코드를 두 사람이 동시에 넣거나, 서로의 코드를 동시에 넣어도 활성 커플은 하나만 생깁니다.
  - 이 두 경우를 `CoupleInviteFlowTest` 가 고정합니다(H2·PostgreSQL 16 모두 통과).
- **#3 — 초대한 쪽에 알림:**
  - 서버: 연결이 커밋되면 초대한 쪽에 PARTNER 푸시("커플로 연결됐어요", 홈)를 보냅니다.
  - 앱: 코드를 띄워 둔 동안 4초 간격과 앱 복귀 시점에 연결 여부를 확인하고, 연결되면 화면을 닫습니다.
- **#6·#16 — 코드를 서버에서 받아 옴:** 앱 메모리에만 있던 코드를 서버의 `GET /relations/couple/invite` 에서
  받아 옵니다. 앱을 재시작해도 남고, 다른 계정으로 로그인하면 섞이지 않습니다.
- **#17 — 연결 실패 표시 정리:**
  - 연결이 성공한 뒤 목록 갱신만 실패하면 더 이상 실패로 표시하지 않습니다.
  - 409 `ALREADY_CONNECTED` 가 오면 실제 상태를 다시 보고, 연결돼 있으면 성공으로 마무리합니다.

**2026-10-03 — 나머지 S2 (#1·#8·#9·#11·#12·#13·#14) 수정**

서버는 Railway 배포 완료(`836a7b7f`), 앱은 `0ddd5a0e` 로 production OTA 완료(2026-10-04, 1.0.6 빌드 대상 —
fingerprint 일치 확인, iOS 업데이트 그룹 `32771986`·Android `b5bdab01`).

- **#7 — 로그아웃 시 푸시 토큰 삭제:** 다른 세션이 먼저 고쳤습니다 (`0878a2f2`·`fee97f41`).
- **#1 — 부팅 무한 스피너 (S1):** 저장소에서 토큰을 읽다 실패하면 토큰을 지우고 로그인 화면으로 보냅니다 (`authStore.bootstrap`).
- **#8 — 알림을 나중에 켠 경우:** 앱으로 돌아왔을 때 권한이 꺼짐→켜짐으로 바뀌었으면 그 자리에서 토큰을 등록합니다
  (`push.registerPushTokenOnResume`, RootNavigator). 켜져 있던 상태 그대로면 서버를 부르지 않습니다.
- **#9 — 기록 목록 실시간 갱신:** 기록 목록이 FEED·DIET·WORKOUT 이벤트를 듣고, 첫 페이지를 받아 위에 합칩니다.
  - 이때 드러난 더 큰 문제도 함께 고쳤습니다. 커플 채널은 목적지 하나에 핸들러 하나라서, 나중에 구독한 화면이
    앞의 것을 덮어쓰고 한 화면의 해제가 남은 화면의 구독까지 끊었습니다.
  - 이제 `subscribeCouple` 이 해제 함수를 돌려주고, 채널 하나를 여러 리스너가 나눠 씁니다. 호출부 10곳을 모두 옮겼습니다.
- **#11 — 사진 업로드 타임아웃:** Cloudinary 업로드에 60초 타임아웃을 걸고, 실패 문구를 한국어로 바꿨습니다.
- **#12 — 이메일 정규화:** 가입·로그인·비밀번호 재설정·구글 로그인의 이메일을 요청 DTO 에서 trim + 소문자로 바꿉니다
  (`EmailNormalizer`, `EmailNormalizationTest`). 운영 이메일 10건은 이미 모두 소문자였습니다(읽기 전용 조회로 확인).
  같은 커밋에서 #21(로그인 검증 문구 영어 노출)도 한국어 문구로 고쳤습니다.
- **#13 — 관계를 못 불러온 경우:** 한 번도 못 불러왔으면 홈에 연결 안내 대신 다시 시도 화면을 띄웁니다.
  로그아웃할 때 관계 스토어도 비웁니다.
- **#14 — 플랜 재조회:** 플랜 화면에 포커스가 올 때, 그리고 앱으로 돌아올 때(1분 간격) `/plan/me` 를 다시 읽습니다.
  재조회가 실패해도 받아 둔 값은 유지합니다.

**2026-10-04 — S3 (#18·#19·#22~#28·#30~#32) 수정**

서버는 Railway 배포 완료(`7738e3cb`, V127·V128 운영 적용 확인), 앱은 `5a74b7b2` 로 production OTA 완료
(2026-10-05, 1.0.6 빌드 대상 — fingerprint 일치, iOS 업데이트 그룹 `00afff43`·Android `5b4e5e84`).
이 OTA 에는 그 사이 main 에 병합된 다른 세션의 앱 변경(관계를 부팅 때 읽기·채팅 전송 거절 알림)도 함께 실렸다.

- **#18·#19 — 가입:**
  - 같은 이메일로 가입이 동시에 들어오면 500 대신 409 를 줍니다.
  - 가입 화면이 409 를 받으면 로그인 화면으로 보내고 이메일을 채워 줍니다.
  - 타임아웃 문구는 가입 상황에 맞는 것으로 바꿨습니다.
- **#22 — 부팅 지연:** 부팅이 5초를 넘기면 스피너 아래에 "연결 중이에요…"를 보여 줍니다.
- **#23 — 미연결 채팅 탭:** 빈 화면에 "커플 연결하기" 버튼을 추가했습니다.
- **#24 — 일상 저장 멱등키 (V127):**
  - 작성 화면마다 `clientRequestId` 를 보내고, `(author_id, client_request_id)` 에 unique 를 겁니다.
  - 같은 키로 다시 온 저장에는 먼저 저장된 글을 그대로 돌려줍니다. 푸시는 다시 보내지 않습니다.
- **#25·#26 — 연타 가드:**
  - 무드 전송, 그리고 기록 목록·추억·식단 화면의 반응 버튼에 진행 중 가드를 걸었습니다.
  - 반응이 동시에 도착해 unique 위반이 나면 500 대신 현재 상태를 돌려줍니다.
  - 같은 사람이 같은 기록에 다는 반응 푸시는 10분에 한 번만 보냅니다(서버 메모리 기준).
- **#27 — 푸시 재시도:**
  - Expo 5xx·연결 실패만 5초, 30초 뒤에 재시도합니다.
  - 응답 대기 시간 초과는 재시도하지 않습니다. Expo 가 이미 받았을 수 있어서 같은 알림이 두 번 갈 수 있습니다.
- **#28 — 푸시 토큰 (V128):**
  - `last_registered_at` 을 추가했습니다. 재등록은 지우고 넣는 대신 기존 행을 갱신합니다.
  - 사용자당 최근 5개만 남깁니다. 기간 기준으로 지우면 오래 접속하지 않은 사람에게 가는 재방문 알림까지 끊겨서 쓰지 않았습니다.
  - 앱이 실행 중일 때 기기 토큰이 바뀌면 다시 등록합니다.
- **#30 — 식단 사진 미리 올리기:** 사진 한도가 0이면 미리 올리기를 건너뜁니다. 저장할 때 올리면서 결제 시트를 띄웁니다.
- **#31 — 402 겹침:** 402 일 때는 업그레이드 시트만 띄우고, 오류 Alert·토스트를 겹치지 않습니다 (`isPlanGateError`).
- **#32 — 채팅 사진 여러 장:**
  - 남은 한도보다 많이 고르면 보내기를 시작하지 않습니다.
  - 중간에 실패하면 못 보낸 사진을 미리보기로 되돌립니다.
- **하지 않기로 한 것 (2026-10-05 판단):**
  - **#20 — 하지 않음, #19 로 사실상 해소.** 탈퇴 유예 중인 사람이 막히는 경우는 로그인 대신 다시 가입하려 할 때뿐인데,
    이제 가입 화면이 409 를 받으면 로그인으로 보내고 이메일을 채워 준다. 로그인하면 탈퇴가 자동으로 취소된다
    (`AuthService.issueTokensOnLogin` → `cancelIfPending`). "탈퇴 예정 계정"이라고 따로 알리면 이메일만 아는 남에게
    그 사람이 떠나려 한다는 사실까지 드러나므로 넣지 않는다.
  - **#29 — 보류.** 우리 커플의 일상 글은 전 기간 1건이라 글 상세 화면을 새로 만들 근거가 약하다. 일상을
    첫 기록으로 계속 밀기로 정하면 그때 함께 만든다.
  - **#33 — 2026-10-05 개수형으로 변경(사용자 결정).** FREE 는 "다가오는 일정 10개"다(`Feature.CALENDAR_EVENT = upTo(10)`,
    `CalendarEventRepository.countUpcoming`). 매년 반복(기념일·생일)과 끝나는 날이 오늘 이후인 일정만 세고,
    지난 일정은 세지 않는다 — 세면 기록이 쌓일수록 지워야만 새로 넣을 수 있다. 지우면 바로 다시 넣을 수 있어
    월 환불 로직(`createdThisQuotaMonth`)은 없앴다. 서버만 바뀌었고 앱 문구는 서버 카탈로그를 따르므로 OTA 불필요.
  - **#34 — 하지 않음.** 체험이 꺼져 있다(`PLAN_TRIAL_DAYS=0`). **체험을 켤 때 반드시 함께 처리할 것:**
    탈퇴 후 재가입·재연결로 체험을 다시 받는 길과, 화면의 체험 표시(개인 기준)와 판정(커플 기준)의 어긋남.

**2026-10-05 — #2 딥링크 1단계 (빌드 없이)**

소개 사이트 `/i/CODE` 배포 확인 뒤 production OTA 완료(2026-10-05, 소스 `22ad1f32`, 1.0.6 빌드 대상 — fingerprint 일치,
iOS 업데이트 그룹 `f7c26a04`·Android `c1b36ef8`). 소개 사이트는 **Git 자동 배포가 아니다** — `landing/` 을 Netlify 에 직접 올린다.
주 체크아웃이 뒤처져 있으면 옛 파일이 올라가므로 `git archive origin/main landing` 으로 뽑은 폴더를 올린다.

- **초대 문구:** `https://dubly.co.kr/i/CODE` 링크와 코드를 함께 보냅니다 (`CoupleConnectScreen.onShare`).
- **소개 사이트 `/i/CODE`** (`landing/invite.html`, `_redirects`): 코드를 크게 보여 주고 세 가지로 잇습니다.
  - "앱에서 열기": 지금 빌드에도 있는 `doubly://couple/connect/CODE` 스킴입니다.
  - "코드 복사"
  - 스토어 설치: Play 링크에는 2단계용 `referrer=invite%3DCODE` 를 미리 실어 둡니다.
- **앱:** 초대 링크는 내비게이션에 넘기지 않고 맡겨 둡니다 (`utils/pendingInvite.ts`, `linking.ts`).
  - 로그인·가입이 끝나면 RootNavigator 가 연결 화면을 열고 코드를 채웁니다.
  - 누르는 것은 사용자 몫입니다. 누구와 연결되는지 보고 누르게 하기 위해서입니다.
  - 이미 커플이면 연결 화면을 열지 않고 안내만 띄웁니다.
  - 맡겨 둔 코드는 24시간 동안 유지되고, 앱을 껐다 켜도 남습니다.
- **2단계 (빌드 필요):** App Links·Universal Links(링크를 누르면 브라우저 없이 앱이 바로 열림)와 Android 설치 후 코드 이어받기입니다.
  - 받아야 할 값: **Play 앱 서명 키 SHA-256**, **Apple Team ID**.
  - 할 일 목록은 `docs/EAS_BUILD.md` "다음 빌드에 묶을 것"에 있습니다.

**2026-10-05 — #10 사진 한도: 식단 사진을 별도 주머니로**

- 새 기능 `MEAL_PHOTO`: 사람 단위 **하루 10장**, FREE·PRO 같음 → 비교표에서 빠지고 넘겨도 업셀하지 않는다(429).
  `JOURNAL_PHOTO` 와 같은 "기록은 무료" 원칙. 커플 공용 `PHOTO_UPLOAD`(월 60장)는 이제 일상·채팅 등에만 쓰인다.
- 서버 `POST /uploads/meal-signature`. 폴더는 공용과 같다 — 버린 미리 올리기 사진 정리(`UploadDiscardPolicy`)가
  업로드 폴더 바로 아래만 허용하기 때문이다.
- 앱: 식단 기록(끼니 사진·영양성분표)·홈의 사진으로 식단 남기기가 `uploadImage(uri, { purpose: 'meal' })` 를 쓴다.
  옛 서버(404)면 공용 서명으로 넘어간다. 옛 앱은 지금처럼 공용 한도에서 빠진다.
- 오운완(운동 체크인) 사진은 그대로 공용 한도다 — 이번 범위는 식단만.
- 같은 날 소개 사이트의 "음성·영상 통화" 문구를 지웠다 — 통화는 2026-09-28 에 앱에서 뺐다(docs/CALL_REMOVAL_2026-09-28.md).

**남은 것**

- **#10 사진 한도(커플 합산 월 60장):** 식단 사진을 별도 주머니로 뺄지, 한도를 올릴지는 요금 정책 결정이 필요합니다.
- **#2 딥링크·디퍼드 링크:** 네이티브 설정(`intentFilters`·`associatedDomains`, 즉 빌드)과 dubly.co.kr 의
  `assetlinks.json`·`apple-app-site-association` 배포가 필요한 별도 작업입니다.
- **운영 데이터:** 이미 쌓인 PENDING 행은 그대로 둡니다. 코드가 만료돼 있어 쓰일 길이 없고,
  다음에 "코드 만들기"를 누르면 그 사용자의 최신 행이 재사용되며 나머지는 코드가 비워집니다.

---

## 1. 경로 추적 (클라이언트 → API → DB)

경로는 모두 저장소 루트 기준입니다. 백엔드 Java 경로는 `backend/src/main/java/com/fitto/` 를 생략했습니다.

### 1.1 설치 · 첫 실행

| 순서 | 위치 | 내용 |
|---|---|---|
| 부팅 | `frontend/src/navigation/RootNavigator.tsx:88-94` | `bootstrap()` 을 호출합니다. |
| 토큰 확인 | `frontend/src/store/authStore.ts:82-86` | 토큰이 없으면 `isAuthenticated=false` → 온보딩 스택으로 갑니다 (`RootNavigator.tsx:221-224`). |
| 스플래시 | `frontend/src/screens/onboarding/SplashScreen.tsx:35-40` | `onboardingSeen` 이 없으면 인트로, 있으면 Login 으로 갑니다. 읽기에 실패해도 `.catch` 로 진행합니다. |
| 인트로 | `frontend/src/screens/onboarding/OnboardingScreen.tsx:114-123` | 저장에 실패해도 Login 으로 replace 합니다. 갇히는 길은 없습니다. |

- **실패 처리:** 세션 복원 중 네트워크가 끊기면 토큰은 남겨 두고 "다시 시도" 화면을 보여 줍니다 (`RootNavigator.tsx:163-185`). 이 부분은 정상입니다.
- `meWithRetry` 는 4회 × 10초에 대기 1+2+4초를 더해 **최대 약 47초 동안 스피너**를 보여 줍니다 (`authStore.ts:187-197`).
- ⚠ `storage.getItem` 이 try 밖에 있습니다 (`authStore.ts:82`, 확인함). SecureStore 가 예외를 던지면 `isLoading=true` 로 영구히 멈춥니다. 발생 빈도는 추정입니다.

### 1.2 회원가입 · 로그인

실제로 쓸 수 있는 가입 수단은 **이메일 하나**입니다.

- 구글: `GOOGLE_AUTH.webClientId: ''` 라 버튼이 숨겨져 있습니다 (`frontend/src/constants/config.ts:110-114`, `LoginScreen.tsx:76`).
- 카카오·애플: 앱의 `api/auth.ts:18-24` 는 호출하는 곳이 없고, 서버에는 엔드포인트 자체가 없습니다 (`auth/controller/AuthController.java:39` "추후 구현").

**가입**

| 계층 | 위치 | 내용 |
|---|---|---|
| 클라이언트 | `frontend/src/screens/auth/RegisterScreen.tsx:159-184` | 8자 미만이면 앱에서 막고, 필수 동의 2개를 받습니다. `finally` 에서 loading 을 해제합니다. |
| API | `POST /auth/register` → `AuthController.java:58-63` → `AuthService.register` (`AuthService.java:73-94`) | IP 당 시간당 10회 한도 (`AuthRateLimiter.java:76-80`), 이미 있는 이메일이면 409, 동의 버전을 기록하고 토큰을 발급합니다. |
| DB | `V1__init_schema.sql:7` | `users.email UNIQUE` |

- 세션 저장: `authStore.setSession` (`authStore.ts:114-126`) 이 가입 응답의 user 를 그대로 씁니다. 이메일 가입자는 동의 게이트 없이 `Main` 으로 들어갑니다.

**로그인**

- 위치: `LoginScreen.tsx:27-37` → `AuthService.java:96-114`
- 실패만 세서, IP+이메일 기준 15분에 5회 실패하면 429 입니다.
- 탈퇴 유예 중인 계정은 로그인하면 탈퇴가 취소됩니다 (`AuthService.java:292-296`). 앱은 "다시 오셨네요"를 띄웁니다 (`authStore.ts:117-119`).

**미연결 착지**

- 별도 분기 없이 홈 탭으로 갑니다. 연결 여부는 화면 안에서 `connected = relationLoading ? true : !!couple?.partner` 로 판정합니다 (`frontend/src/screens/home/HomeScreen.tsx:254`).
- 미연결이면 "커플을 연결해보세요" 버튼과 "혼자서도 시작할 수 있어요" 목록이 나옵니다 (`HomeScreen.tsx:1067-1080`). 막다른 곳은 아닙니다.
- 채팅 탭의 빈 화면에는 연결 버튼이 없습니다 (`frontend/src/screens/chat/ChatScreen.tsx:111`).

### 1.3 상대 초대 (코드 생성)

| 계층 | 위치 | 내용 |
|---|---|---|
| 진입 | `HomeScreen.tsx:1073` | 진입점은 하나뿐입니다. 온보딩이나 가입 흐름에는 페어링 단계가 없습니다. |
| 화면 | `frontend/src/screens/home/CoupleConnectScreen.tsx:56-67` `onGenerate` | 화면에 들어가도 자동 생성하지 않습니다. 코드는 모듈 변수 `lastInvite` (`:43`) 에만 보관합니다. |
| 스토어/API | `frontend/src/store/relationStore.ts:47` → `api/relation.ts:7` | `POST /relations/couple/invite` |
| 서버 | `relation/service/RelationService.java:80-95` | 내가 이미 활성 커플이면 409 입니다. **매번 새 PENDING relation 행과 멤버 행을 만듭니다.** 6자리 SecureRandom 코드 (`:382-394`), 유효기간 24시간. |
| DB | `V1__init_schema.sql:26` | `invite_code UNIQUE` 입니다. "사용자당 활성 커플 1개" 제약은 **없습니다**. |

- 공유 문구는 `CoupleConnectScreen.tsx:83` 의 `Dubly에서 커플로 연결해요! 초대코드: XXXXXX (24시간 유효)` 입니다. **링크가 없습니다.**
- 실패 처리: `Alert('오류', getErrorMessage)` 를 띄우고 `finally` 로 loading 을 해제합니다. 정상입니다.

### 1.4 상대 설치 → 초대 수락 (딥링크)

**딥링크 설정**

- `app.json:14` 에 `scheme: "doubly"` 만 있습니다. Android `intentFilters` 와 iOS `associatedDomains` 는 없습니다.
- `frontend/src/navigation/linking.ts:131` 에 `CoupleConnect: 'couple/connect'` 경로는 있습니다. 하지만 파라미터가 `undefined` 라 (`navigation/types.ts:23`) **코드를 실어 보낼 수 없습니다**.
- `landing/` 에는 `assetlinks.json`, `apple-app-site-association`, 초대 경로 핸들러가 모두 없습니다.

**디퍼드 딥링크**

- 없습니다. Branch, AppsFlyer, Install Referrer, 클립보드 읽기 중 어느 것도 쓰지 않습니다.
- 로그아웃 상태에서 들어온 링크는 버려집니다. Main 스택이 인증된 뒤에만 그려지기 때문입니다 (`RootNavigator.tsx:221-228`).
- 붙여넣은 공유 문구에서 코드를 골라내는 `extractInviteCode` (`CoupleConnectScreen.tsx:29-35`) 만 수동 입력을 조금 덜어 줍니다.

**수락**

| 계층 | 위치 | 내용 |
|---|---|---|
| 화면 | `CoupleConnectScreen.tsx:90-103` | 연결 요청 후 `fetchAll` 을 부릅니다. |
| 스토어/API | `relationStore.ts:49-52` | `POST /relations/couple/connect` |
| 서버 | `RelationService.java:98-122` (`@Transactional`) | 코드 조회 → 타입 COUPLE·PENDING 확인 → 만료 확인 → 자기 코드 거부 → **입력한 사람(B)만** 활성 커플인지 확인 → `relation.connect` (`Relation.java:106-112`) |

- 수락 단계에는 잠금도 `@Version` 도 조건부 UPDATE 도 없습니다 (확인함).

### 1.5 페어링 완료

- 수락한 B 는 `fetchAll` 결과로 연결 상태가 바로 반영됩니다.
- **초대한 A 에게는 알릴 길이 없습니다.**
  - 서버의 `connectCouple` 은 `eventLogService.log` 만 남깁니다 (`RelationService.java:119`). 푸시도 `CoupleEventPublisher` 호출도 없습니다.
  - A 는 아직 relationId 가 없어서 `/sub/couple/{id}` 를 구독할 수 없습니다 (`frontend/src/api/chatSocket.ts:266-268`).
  - 홈은 `useFocusEffect` 일 때만 `fetchAll` 을 부릅니다 (`HomeScreen.tsx:435-440`). 그래서 A 는 다른 탭에 갔다가 홈으로 돌아와야 연결을 봅니다.

### 1.6 첫 기록 — "일상"(피드 글)

**왜 일상인가:** 연결 후 홈 바로가기 3칸의 첫 칸이고 (`HomeScreen.tsx:1046`), 주석이 "피드 쓰기의 유일한 진입점"이라고 명시합니다. 무드는 상단바 아이콘 (`:692`), 채팅은 별도 탭입니다.

| 계층 | 위치 | 내용 |
|---|---|---|
| 화면 | `frontend/src/screens/feed/FeedComposeScreen.tsx:184` `onSave` | `savingRef` (`:66`) 로 연타를 막습니다. 사진은 순차 업로드하고 (`:241`), `uploadedRef` 캐시로 재시도 때 다시 올리지 않습니다. 실패하면 `Alert('오류')` (`:266`) 를 띄웁니다. |
| 사진 | `frontend/src/utils/imageUpload.ts:276` | 서명 발급 `POST /uploads/signature` (`upload/.../UploadController.java:47`, 이때 PHOTO_UPLOAD 1장 차감) → Cloudinary 로 업로드 (`imageUpload.ts:213-222`). **타임아웃이 없습니다.** |
| API | `frontend/src/api/feed.ts:100-101` | `POST /feed/posts` (타임아웃 10초, `api/client.ts:15`) |
| 서버 | `feed/service/FeedService.java:673-707` (`@Transactional`) | `feed_posts` (`:689`), `feed_post_photos` (`:691`) 를 저장하고, 상대 푸시 (`:701`) 와 FEED 실시간 이벤트 (`:704`) 를 보냅니다. |
| DB | `feed_posts` | 멱등키·UNIQUE 가 없습니다. |

참고로 비교하면 이렇습니다.

- 채팅 (`chat/service/ChatService.java:281`) 은 `clientMessageId` 멱등과 `(relation_id, client_message_id)` UNIQUE 가 있습니다.
- 무드 (`HomeScreen.tsx:576` → `MoodService.java:108-156`) 는 같은 사람의 푸시를 10분에 1회로 제한하지만, 전송 중 잠금은 없습니다.

### 1.7 상대에게 푸시

**토큰 등록**

- 세션 복원 시 (`authStore.ts:93`) 와 로그인·가입 직후 (`authStore.ts:121`) 에 등록합니다. 둘 다 **권한이 이미 허용돼 있을 때만**입니다 (`frontend/src/utils/push.ts:121-130`).
- 커플 연결 시점에는 등록하지 않습니다. 토큰이 사용자 단위라 상관은 없습니다.

**권한 요청**

- 홈에 들어오고 1.2초 뒤 안내 모달에서 "알림 받기"를 누를 때만 요청합니다 (`PushPermissionPrimer.tsx:30-62`).
- "나중에"를 누르면 다시 묻지 않습니다. 설정 화면 (`SettingsScreen.tsx:127-135`) 에서만 다시 켤 수 있습니다.

**토큰 저장**

- `device_tokens` 는 `token` 만 UNIQUE 이고 여러 기기를 허용합니다 (`V5__device_tokens.sql`, `DeviceTokenService.java:22-29`).
- 토큰 갱신 리스너 (`addPushTokenListener`) 는 없습니다.

**발송**

- Expo Push 를 씁니다. 트랜잭션 안에서 불리면 커밋 뒤에 예약하고, 전용 스레드 풀에서 보냅니다 (`notification/.../ExpoPushNotificationService.java:92-110`).
- 대기열(1000건)이 차면 버립니다 (`:75`). 예외는 WARN 로그만 남깁니다 (`:141`). 재시도는 없습니다.
- 수신 설정은 전체 스위치와 카테고리 4종입니다 (`User.java:233-241`). 방해 금지 시간대는 없습니다.

**토큰 정리**

- 영수증에 `DeviceNotRegistered` 가 오면 삭제합니다 (`:182`).
- 탈퇴하면 전부 삭제합니다 (`AccountWithdrawalService.java:95`).
- **로그아웃할 때는 삭제하지 않습니다** (`authStore.ts:155-165` 에서 확인함, `AuthService.java:187-193`).

### 1.8 상대가 확인 · 반응

**알림 탭 → 화면 이동**

- 서버가 `data.link` 에 경로를 싣습니다 (`ExpoPushNotificationService.java:284-293`).
- 앱이 떠 있으면 `linking.ts:74-92` 의 `subscribe`, 콜드 스타트면 `linking.ts:53-71` 의 `getInitialURL` 이 받습니다. 인증이 끝나야 내비게이션이 마운트되므로, 준비 전에 이동하는 경합은 없습니다.
- 일상 링크 `feed` 는 **기록 목록**으로 갑니다. 해당 글로 가지는 않습니다 (`linking.ts:211`, `PushLinks.java:18`).

**실시간 갱신**

- 홈 (`HomeScreen.tsx:529-555`), 채팅방, 캘린더, 게임 화면만 FEED 이벤트를 구독합니다.
- **기록 목록 (`FeedTimelineScreen`) 은 구독하지 않습니다.**

**반응**

- 흐름: `FeedTimelineScreen.tsx:138-148` → `POST /feed/items/{type}/{refId}/reactions` → `FeedService.toggleReaction` (`:847-869`)
- 토글 방식입니다. 새로 달 때만 작성자에게 PARTNER 푸시를 보냅니다.
- DB 제약은 UNIQUE `(target_type, target_id, user_id, emoji)` 입니다 (`V60__feed_reactions_all_types.sql:25`).

### 1.9 PRO 체험 · 게이팅

**체험: 지금 운영 기본값으로는 없습니다.**

- `application.yml:128` `free-trial: ${PLAN_FREE_TRIAL:false}`, `:133` `trial-days: ${PLAN_TRIAL_DAYS:0}` 입니다. `docs/BILLING_STATUS_2026-09-25.md:45-46` 의 기록과도 같습니다.
- `PLAN_TRIAL_DAYS` 를 켤 경우의 동작은 다음과 같습니다.
  - 체험은 **가입 시점** (`users.created_at`) 부터 계산합니다.
  - 커플 기능은 **늦게 가입한 사람**의 체험을 따릅니다 (`common/plan/PlanResolver.java:183-203`).
  - 체험 상태를 저장하지 않고 조회할 때 계산합니다. 그래서 탈퇴 후 재가입하면 체험을 다시 받습니다.
- 스토어 쪽 7일 체험은 콘솔 설정에만 달려 있습니다 (`docs/GOOGLE_PLAY_BILLING.md:78-84`). 안드로이드는 첫 번째 offerToken 을 씁니다 (`frontend/src/utils/iap.ts:309-311`).
- 만료를 처리하는 스케줄러는 없습니다. 조회할 때 `expires_at > now` 로 판정합니다 (`SubscriptionRepository.java:22-29`).

**핵심 경로 게이팅**

- 연결, 일상 글, 반응, 무드, 채팅 텍스트, 푸시에는 PlanGuard 호출이 없습니다. **체험이 끝나도 핵심 경로는 막히지 않습니다.**

**첫 주에 닿을 수 있는 FREE 한도**

| 기능 | 한도 | 위치 |
|---|---|---|
| 사진 | 커플 합산 월 60장. 피드·채팅·식단·오운완·프로필·맛집 사진이 한 주머니 | `common/plan/Feature.java:95,111` |
| 캘린더 일정 | 월 10개, 소비형이라 지워도 돌아오지 않음 | `calendar/.../CalendarService.java:112` |
| 음성 메시지 | 하루 5개 | `ChatController.java:76` |
| AI 음식 사진 분석 | 하루 5회 | `Feature.java:36` |

**클라이언트 표시**

- 402 는 `api/client.ts:275-279` → `planStore.gate` → 전역 `UpgradeSheet` (`App.tsx:127`) 로 처리합니다.
- 429 는 화면마다 토스트나 Alert 로 보여 줍니다.

---

## 2. 발견 사항

**심각도 기준**
- **S1** 경로가 막힘
- **S2** 기능 오류이거나, 첫 경험에서 이탈이 큼
- **S3** 사소함

**표기**
- *(확인)*: 이번 세션에서 소스를 직접 다시 읽어 확인한 항목
- *(추정)*: 발생 조건이나 빈도를 코드만으로 확정할 수 없는 항목

| # | 단계 | 문제 | 위치(파일:라인) | 심각도 | 수정 방향 한 줄 |
|---|---|---|---|---|---|
| 1 | 첫 실행 | 토큰 읽기 `storage.getItem` 이 try 밖에 있어서, SecureStore 가 예외를 던지면 스피너가 영구히 돈다 *(확인, 빈도는 추정)* | `frontend/src/store/authStore.ts:82`, `RootNavigator.tsx:89` | **S1** (조건부) | getItem 을 try 안으로 옮기고, 실패하면 토큰을 지운 뒤 비로그인으로 진행 |
| 2 | 초대 → 수락 | 초대가 텍스트 코드뿐이다. 딥링크·유니버설 링크·디퍼드 링크가 없고, `CoupleConnect` 라우트는 코드를 파라미터로 받지 못한다 | `CoupleConnectScreen.tsx:83`, `app.json:14`, `navigation/linking.ts:131`, `navigation/types.ts:23` | S2 | `dubly.co.kr/i/CODE` 앱·유니버설 링크를 두고, `CoupleConnect{code}` 파라미터를 받고, 비로그인 상태에서 받은 코드를 저장했다가 가입 후 자동으로 채움 |
| 3 | 페어링 완료 | 초대한 쪽에 연결 알림이 없다(푸시·소켓·폴링 모두 없음). 코드 화면에 계속 머문다 *(확인)* | `RelationService.java:117-121`, `HomeScreen.tsx:435-440` | S2 | 커밋 뒤 A 에게 푸시를 보내고, 연결 화면에서 폴링하거나 AppState 복귀 때 `fetchAll`, 연결되면 화면을 자동으로 닫음 |
| 4 | 수락 | 초대자(userA)의 활성 커플 여부를 확인하지 않는다. 옛 PENDING 코드도 살아 있어서 A 가 활성 커플 2개에 속할 수 있다. 이후 `findFirst` 가 아무 관계나 고른다 *(확인, 운영 0건)* | `RelationService.java:113`, `:82-92`, `:228-233` | S2 | 수락할 때 `hasActiveCouple(userA)` 도 확인하고, 연결·재발급 때 같은 사용자의 다른 PENDING 을 만료 |
| 5 | 수락 | 동시 수락 경합. 잠금·`@Version`·조건부 UPDATE 가 없어서, 같은 코드를 두 명이 동시에 넣으면 둘 다 200 을 받는다. 서로의 코드를 동시에 넣으면 같은 두 사람 사이에 ACTIVE 가 2개 생긴다 | `RelationService.java:98-121`, `Relation.java:106-112` | S2 (드묾) | 비관 락으로 조회하거나 `UPDATE … WHERE status='PENDING'` 후 1행인지 확인 |
| 6 | 초대 | 사용자가 같은 기기에서 다른 계정으로 로그인해도 `lastInvite` 모듈 캐시가 비워지지 않는다. 그래서 이전 계정의 코드가 보이고, 그 코드를 공유하면 상대가 이전 계정과 연결된다 | `CoupleConnectScreen.tsx:43-49`, `authStore.ts:51-67` | S2 | 캐시를 store 로 옮기고 `clearTokens` 에서 리셋 |
| 7 | 푸시 | 로그아웃해도 푸시 토큰이 남아서, 로그아웃한 폰에 상대의 일상·채팅 미리보기가 계속 간다 *(확인)* | `authStore.ts:155-165`, `AuthService.java:187-193` | S2 (사생활) | 로그아웃 때 `DELETE /notifications/token` 을 불러 해당 토큰 삭제 |
| 8 | 푸시 | 권한을 "나중에" 거절한 뒤 OS 설정에서 켜도, 앱 프로세스를 다시 띄우기 전까지 토큰이 등록되지 않는다. 그 사이 푸시가 조용히 사라진다 | `RootNavigator.tsx:141-149`, `utils/push.ts:121` | S2 | 포그라운드로 복귀할 때마다 `registerPushTokenIfGranted` 호출 |
| 9 | 확인·반응 | 상대가 기록 목록을 보고 있으면 `feed` 알림 배너가 "지금 보는 화면"이라 억제된다. 그런데 그 화면은 실시간 구독이 없어 새 글도 안 뜬다. 결국 아무 신호가 없다 | `utils/push.ts:59-76`, `FeedTimelineScreen.tsx:136` | S2 | 기록 목록에서도 FEED 이벤트를 구독해 다시 불러오기 |
| 10 | 첫 기록 | 커플 합산 사진 월 60장 한도가 식단 사진과 같은 주머니라 빨리 소진된다. 이후에는 일상·채팅 사진에도 402 가 뜬다. 우리 커플은 30일에 209장을 올렸다 (§3.3) | `common/plan/Feature.java:95,111` | S2 | 식단 사진을 별도 주머니로 빼거나 실측 분포로 한도를 재조정 |
| 11 | 첫 기록 | Cloudinary 업로드에 타임아웃이 없어서, 네트워크가 멈추면 "사진 올리는 중…" 가림막이 끝나지 않을 수 있다 *(추정)* | `utils/imageUpload.ts:213-217`, `store/busyStore.ts:41-48` | S2 | `AbortController` 로 60초 타임아웃을 걸고 재시도 안내 |
| 12 | 가입·로그인 | 이메일 대소문자를 정규화하지 않는다(trim 만 함). PostgreSQL UNIQUE 는 대소문자를 구분하므로 `A@x.com` 과 `a@x.com` 이 별개 계정이 된다 *(운영 중복 0건)* | `AuthService.java:76,100`, `RegisterScreen.tsx:168`, `LoginScreen.tsx:31` | S2 | 서버 진입부에서 `toLowerCase(Locale.ROOT)` |
| 13 | 페어링 완료 | 첫 `fetchAll` 이 실패하면 이미 연결된 사용자에게도 "커플을 연결해보세요"가 뜬다 | `HomeScreen.tsx:254,309`, `relationStore.ts:37-45` | S2 (기존 사용자) | 한 번도 불러오지 못했으면 "모름" 상태로 두고 재시도 화면 |
| 14 | PRO | 상대가 결제해도 내 앱은 재시작 전까지 FREE 로 보인다. 그래서 `couplePlan` 이 막으려던 이중 결제가 여전히 가능하다 | `screens/my/PlanScreen.tsx:173-196`, `authStore.ts:95,123` | S2 | 플랜 화면 포커스와 포그라운드 복귀 때 `planStore.load()` |
| 15 | 초대 | "새 코드 만들기"를 누를 때마다 PENDING 행이 쌓이고 정리되지 않는다. 화면은 새 코드가 옛 코드를 대체하는 것처럼 보이지만 실제로는 옛 코드도 유효하다(#4 의 원인). 운영에 PENDING 8행이 쌓여 있다 | `RelationService.java:85-93` | S3 | FAMILY `issueInviteCode` 처럼 기존 PENDING 을 갱신하고, 활성 초대 조회 API 추가 |
| 16 | 초대 | 코드가 메모리에만 있어 앱을 재시작하면 사라진다. 다시 보려면 새로 만들어야 하고, 그러면 #15 가 커진다 | `CoupleConnectScreen.tsx:43-49` | S3 | 서버의 활성 초대 조회로 대체 |
| 17 | 수락 | 연결은 성공했는데 응답이 유실되거나 `fetchAll` 이 실패하면 오류가 뜬다. 다시 누르면 409 "이미 연결된 관계"가 뜨고 화면에 머문다. 멱등성이 없다 | `relationStore.ts:49-52`, `CoupleConnectScreen.tsx:98-100` | S3 | 409 를 받으면 `fetchAll` 후 화면을 닫고, 같은 코드·같은 사용자면 서버가 성공으로 응답 |
| 18 | 가입 | `existsByEmail` 확인과 `save` 사이의 경합에서 UNIQUE 위반이 500 "서버 오류"로 나간다 | `AuthService.java:76-91`, `common/exception/GlobalExceptionHandler.java:92-96` | S3 | `DataIntegrityViolation` 을 `EMAIL_ALREADY_EXISTS` 로 매핑 |
| 19 | 가입 | 응답이 타임아웃되면 AI 용 문구("응답이 늦어 기다리다 멈췄어요")가 보인다. 다시 누르면 409 다 | `utils/error.ts:34`, `RegisterScreen.tsx:176-178` | S3 | 가입에서 409 를 받으면 "이미 가입돼 있어요" 안내 후 Login 으로 이동 |
| 20 | 가입 | 탈퇴 유예 중에 같은 이메일로 가입하면 "이미 가입된 이메일"만 뜨고, 로그인하면 복구된다는 안내가 없다 | `AuthService.java:76-78` | S3 | 안내 문구 추가(가입 여부가 드러나는 문제는 결정 필요) |
| 21 | 가입·로그인 | Bean Validation 메시지가 영어로 노출될 수 있다 *(추정, JVM 로케일에 달림)* | `LoginRequest.java`, `RegisterRequest.java`, `GlobalExceptionHandler.java:36-42` | S3 | 한국어 message 를 명시 |
| 22 | 첫 실행 | 연결 상태가 나쁘면 부팅 스피너가 최대 약 47초 동안 돈다 | `authStore.ts:187-197` | S3 | 재시도 중 "연결 중…" 표시와 취소 버튼 |
| 23 | 미연결 | 채팅 탭 빈 화면에 연결 버튼이 없다 | `screens/chat/ChatScreen.tsx:111` | S3 | EmptyState 에 CoupleConnect 버튼 |
| 24 | 첫 기록 | 일상 저장에 멱등키가 없다. 서버가 10초를 넘기면 앱은 오류를 띄우지만 글은 이미 저장됐을 수 있고, 다시 누르면 글 2개·푸시 2회가 된다 | `FeedComposeScreen.tsx:259`, `FeedService.java:673` | S3 | 채팅·식단(V118)처럼 클라이언트 요청 ID + UNIQUE |
| 25 | 첫 기록 | 무드 전송에 진행 중 가드가 없어 연타하면 `mood_statuses` 행이 여러 개 생긴다. 푸시는 10분 제한으로 막힌다 | `HomeScreen.tsx:576-581` | S3 | 전송 중 잠금 |
| 26 | 반응 | 반응 버튼에 진행 중 가드가 없다. 동시에 도착하면 UNIQUE 위반이 500 이 되고, 달기·지우기를 반복하면 매번 푸시가 간다 | `FeedTimelineScreen.tsx:138-148`, `FeedService.java:847-865` | S3 | 앱에서 진행 중 잠금, 서버에서 무결성 위반을 멱등 처리, 같은 대상 푸시 간격 제한 |
| 27 | 푸시 | 대기열이 메모리에만 있고 재시도가 없다. Expo 5xx 나 Railway 재배포 때 대기 중인 푸시가 사라진다 | `ExpoPushNotificationService.java:75,141` | S3 | 짧은 백오프 재시도 |
| 28 | 푸시 | 토큰 정리가 "보낼 때 받는 영수증"에만 의존한다. 그래서 받을 일이 없는 사용자의 토큰은 계속 쌓인다(운영 1명 52개, §3.4). 토큰 갱신 리스너도 없다 | `ExpoPushNotificationService.java:182`, `utils/push.ts` | S3 | 등록할 때 같은 사용자·플랫폼의 오래된 토큰을 정리하고 `addPushTokenListener` 추가 |
| 29 | 확인 | 일상·반응 푸시가 특정 글이 아니라 목록(`feed`)으로 간다 | `PushLinks.java:18`, `FeedService.java:702,864` | S3 | `feed/{id}` 경로 |
| 30 | PRO | 식단 사진은 고르기만 해도 미리 올려서 한도가 차감된다. 402 면 사용자가 아무것도 누르지 않았는데 결제 시트가 뜬다 | `screens/diet/DietRecordScreen.tsx:768-778` | S3 | 미리 올리기 전에 잔여 한도를 확인하거나 게이트를 띄우지 않음 |
| 31 | PRO | 402 일 때 결제 시트와 오류 Alert·토스트가 겹친다 | `FeedComposeScreen.tsx:264`, `ChatRoomScreen.tsx:1708-1710` | S3 | `notifyUnless402` 패턴 적용 |
| 32 | PRO | 채팅에서 사진 여러 장을 보낼 때 잔여 한도를 미리 확인하지 않는다. 중간에 402 가 나면 대기 목록이 비워져 못 보낸 사진이 사라진다 | `ChatRoomScreen.tsx:1690-1705` | S3 | `remainingOf('PHOTO_UPLOAD')` 프리체크 |
| 33 | PRO | 캘린더 월 10개가 소비형이라, 첫날 기념일·생일을 넣다 보면 금방 닿는다 | `CalendarService.java:112` | S3 | 개수형 `requireCapacity` 로 바꾸거나 한도 상향 |
| 34 | PRO (잠재) | `PLAN_TRIAL_DAYS` 를 켜면 탈퇴 후 재가입·재연결로 체험을 다시 받을 수 있다. 화면의 체험 표시는 개인 기준인데 판정은 커플 기준이다 | `PlanResolver.java:61,196-203` | S3 | 체험 이력을 별도로 기록하고 커플 기준으로 내려줌 |

**확인했는데 정상인 것**

- 자기 코드로 연결, 만료된 코드, 이미 쓴 코드, 트레이너·패밀리 코드는 모두 거부됩니다.
- 이미 페어링된 B 가 초대를 받으면 409 입니다.
- 커밋 뒤에 푸시를 보내므로 롤백된 작업의 유령 푸시는 없습니다.
- 콜드 스타트에서 알림을 탭할 때 내비게이션 준비 경합이 없습니다.
- 일상 작성이 실패해도 글 초안과 올라간 사진 URL 이 보존됩니다.
- 핵심 경로가 PRO 게이팅에 막히지 않습니다.

---

## 3. 기능 사용량 (운영 DB, 읽기 전용)

조회 시각은 2026-10-03 21:42 KST (12:42 UTC) 입니다. `created_at` 은 UTC `timestamp` 이고, 표시만 +9h 로 바꿨습니다.

### 3.1 기능별 기록 수 · 최근 30일 · 마지막 사용일

```sql
-- 우리 커플: relations.id = 3, users 1·5
with u as (
  select '캘린더 일정' as feature, 'couple_events' as tbl, created_at, created_by as uid from couple_events where couple_id = 3
  union all select '럽슐랭 장소',     'places',          created_at, added_by   from places where couple_id = 3
  union all select '럽슐랭 방문',     'place_visits',    v.created_at, v.visited_by from place_visits v join places p on p.id = v.place_id where p.couple_id = 3
  union all select '럽슐랭 별점',     'place_ratings',   r.rated_at, r.user_id from place_ratings r join places p on p.id = r.place_id where p.couple_id = 3
  union all select '콘텐츠(럽슐랭)',  'contents',        created_at, added_by   from contents where couple_id = 3
  union all select '무드',            'mood_statuses',   created_at, user_id    from mood_statuses where couple_id = 3
  union all select '럽바디 식단',     'meals',           created_at, user_id    from meals where user_id in (1,5)
  union all select '럽바디 운동',     'workouts',        created_at, user_id    from workouts where user_id in (1,5)
  union all select '럽바디 체중',     'body_metrics',    created_at, user_id    from body_metrics where user_id in (1,5)
  union all select '우리 기록(피드)', 'feed_posts',      created_at, author_id  from feed_posts where couple_id = 3
  union all select '  └ 사진 있는 글','feed_posts+image',created_at, author_id  from feed_posts where couple_id = 3 and image_url is not null
  union all select '피드 반응',       'feed_reactions',  created_at, user_id    from feed_reactions where user_id in (1,5)
  union all select '채팅 메시지',     'chat_messages',   created_at, sender_id  from chat_messages where relation_id = 3
  union all select '채팅 반응',       'chat_message_reactions', r.created_at, r.user_id from chat_message_reactions r join chat_messages m on m.id = r.message_id where m.relation_id = 3
  union all select '예약 메시지',     'scheduled_chat_messages', created_at, sender_id from scheduled_chat_messages where relation_id = 3
  union all select '오늘의 질문 답',  'daily_answers',   created_at, user_id    from daily_answers where couple_id = 3
  union all select '커플 게임',       'couple_games',    created_at, created_by from couple_games where couple_id = 3
  union all select '하루 기록(개인)', 'journal_entries', created_at, user_id    from journal_entries where user_id in (1,5)
  union all select '여행',            'trips',           created_at, created_by from trips where couple_id = 3
  union all select '우리 이모지',     'couple_emojis',   created_at, created_by from couple_emojis where relation_id = 3
  union all select '통화',            'call_sessions',   created_at, caller_id  from call_sessions where couple_id = 3
)
select feature, tbl,
       count(*) as total,
       count(*) filter (where created_at >= now() at time zone 'UTC' - interval '30 days') as last30,
       count(*) filter (where created_at >= now() at time zone 'UTC' - interval '30 days' and uid = 1) as last30_u1,
       count(*) filter (where created_at >= now() at time zone 'UTC' - interval '30 days' and uid = 5) as last30_u5,
       to_char(max(created_at) + interval '9 hours', 'YYYY-MM-DD HH24:MI') as last_used_kst
from u group by feature, tbl
order by last30 desc, total desc;
```

| 기능 | 테이블 | 전체 | 최근 30일 | └ user 1 | └ user 5 | 마지막 사용 (KST) |
|---|---|---:|---:|---:|---:|---|
| 채팅 메시지 | chat_messages | 6,233 | **5,513** | 2,532 | 2,981 | 2026-10-03 20:49 |
| 럽바디 식단 | meals | 104 | 72 | 49 | 23 | 2026-10-03 19:12 |
| 우리 이모지 | couple_emojis | 40 | 40 | 21 | 19 | 2026-09-30 13:05 |
| 무드 | mood_statuses | 45 | 34 | 22 | 12 | 2026-10-02 18:59 |
| 오늘의 질문 답 | daily_answers | 37 | 34 | 19 | 15 | 2026-10-03 21:12 |
| 커플 게임 | couple_games | 32 | 32 | 23 | 9 | 2026-10-01 15:20 |
| 통화 | call_sessions | 22 | 21 | 16 | 5 | 2026-09-23 23:37 |
| 럽슐랭 장소 | places | 18 | 12 | 12 | 0 | 2026-10-02 09:04 |
| 럽바디 운동 | workouts | 15 | 10 | 10 | 0 | 2026-10-02 07:18 |
| 럽슐랭 방문 | place_visits | 8 | 5 | 5 | 0 | 2026-09-16 17:00 |
| 럽슐랭 별점 | place_ratings | 7 | 4 | 4 | 0 | 2026-09-16 17:00 |
| 캘린더 일정 | couple_events | 7 | 3 | 3 | 0 | 2026-09-28 11:25 |
| 콘텐츠(럽슐랭) | contents | 6 | 3 | 3 | 0 | 2026-10-02 14:26 |
| 피드 반응 | feed_reactions | 5 | 2 | 2 | 0 | 2026-09-13 21:44 |
| 하루 기록(개인) | journal_entries | 1 | 1 | 1 | 0 | 2026-10-02 18:59 |
| 우리 기록(일상 글) | feed_posts | 1 | 0 | 0 | 0 | 2026-09-02 11:17 |
| └ 사진 있는 글 | feed_posts.image_url | 1 | 0 | 0 | 0 | 2026-09-02 11:17 |
| 채팅 반응 · 예약 메시지 · 체중 · 여행 | 각 테이블 | 0 | 0 | – | – | – |

`feed_post_photos` 를 조인해도 0장입니다. 0건인 테이블은 위 쿼리의 GROUP BY 결과에서 빠지므로 따로 셌습니다.

```sql
select 'chat_message_reactions' t, count(*) from chat_message_reactions r join chat_messages m on m.id=r.message_id where m.relation_id=3
union all select 'scheduled_chat_messages', count(*) from scheduled_chat_messages where relation_id=3
union all select 'body_metrics', count(*) from body_metrics where user_id in (1,5)
union all select 'trips', count(*) from trips where couple_id=3;
```

**집계 시 주의할 점**

- `meals`, `workouts`, `body_metrics`, `journal_entries` 에는 커플 컬럼이 없어 `user_id in (1,5)` 로 셌습니다.
- 그래서 **'같이 먹기'로 복제된 식단은 사람마다 1건씩 셉니다** (V50 `shared_group_id`).
- `feed_reactions` 는 대상이 4종(일상·식단·운동 등)이라 일상 글 반응만 따로 센 값이 아닙니다.

### 3.2 서버 계측 (event_logs, 최근 30일, 두 사람 합계 상위)

```sql
select event_type, coalesce(detail,'') detail, count(*) n,
       to_char(max(created_at)+interval '9 hours','MM-DD HH24:MI') last_kst
from event_logs where user_id in (1,5) and created_at >= now() at time zone 'UTC' - interval '30 days'
group by 1,2 order by n desc limit 40;
```

| event_type · detail | 건수 | 마지막 (KST) |
|---|---:|---|
| HOME_VIEWED | 1,561 | 10-03 21:12 |
| FEATURE_USED · PHOTO_UPLOAD | **209** | 10-03 19:32 |
| FEATURE_USED · PREMIUM_STICKER | 95 | 09-21 16:25 |
| FEATURE_USED · AI_FOOD_PHOTO | 54 | 10-03 19:12 |
| FEATURE_USED · COUPLE_GAME | 32 | 10-01 15:20 |
| LOGIN · EMAIL | 24 | 10-01 14:34 |
| FEATURE_USED · VIDEO_CALL | 16 | 09-23 23:37 |
| FEATURE_USED · AI_FOOD_TEXT | 14 | 10-02 08:34 |
| FEATURE_USED · AI_COUPLE_EMOJI | 13 | 09-30 13:04 |
| FEATURE_USED · PLACE_PIN | 12 | 10-02 09:04 |
| FEATURE_USED · AI_WEEKLY_LETTER | 6 | 10-02 08:34 |
| FEATURE_USED · CUSTOM_BACKGROUND / CALENDAR_EVENT / CONTENT_ITEM | 4 / 4 / 3 | – |
| PAYWALL_VIEWED · plan_screen | 4 | 10-03 08:41 |
| PURCHASE_STARTED · monthly | 2 | 10-01 09:36 |
| STICKER_SUGGEST_SHOWN / PICKED (합계) | 100+ / 7 | 10-03 |

### 3.3 읽은 것

1. **이 앱의 실제 중심은 채팅입니다.** 30일에 5,513건, 하루 평균 약 184건입니다. 그다음이 식단·무드·오늘의 질문·이모지·게임 순입니다.
2. **"가장 기본 기록"으로 설계된 일상(피드 글)은 전체를 통틀어 1건이고, 최근 30일은 0건입니다.** 홈 바로가기 첫 칸이 우리가 실제로 쓰는 기록과 맞지 않습니다. 신규 커플 첫 경험의 "첫 기록"을 일상으로 둘지, 무드·오늘의 질문으로 둘지 다시 판단할 근거입니다.
3. **우리 커플은 30일 동안 사진을 209장 올렸습니다.** FREE 한도인 커플 합산 월 60장의 약 3.5배입니다. 같은 패턴의 FREE 커플은 약 9일 만에 사진이 막힙니다(#10). 우리 커플은 user 1 이 PRO 라(구독 ACTIVE, 만료 2026-10-31 UTC) 막히지 않았습니다.
4. 럽슐랭·운동·캘린더·콘텐츠는 최근 30일 기록이 **user 1 쪽에만** 있습니다. 한 사람만 쓰는 기능입니다.
5. 전 기간 `FEATURE_BLOCKED` 는 1건(AI_COUPLE_EMOJI) 뿐입니다. 아직 FREE 한도에 막힌 실사용자 데이터가 거의 없다는 뜻이고, 표본이 작습니다.

### 3.4 미연결 사용자 · 퍼널 (참고)

```sql
select u.id user_id, to_char(u.created_at+interval '9 hours','YYYY-MM-DD') joined_kst,
  count(r.id) filter (where r.status='PENDING') pending_invites,
  count(r.id) filter (where r.status='ACTIVE')  active_relations
from users u left join relations r on u.id in (r.user_a_id, r.user_b_id)
group by u.id, u.created_at order by u.id;

select user_id, platform, count(*) from device_tokens group by 1,2 order by 1,2;
```

**사용자 10명의 연결 현황**

- 활성 커플 4쌍 (relations 3·7·8·9)
- 미연결 2명: user 13, user 14

**user 14 (2026-08-20 가입)**

- 9/03부터 9/29까지 **초대코드를 8번 생성**했습니다. 전부 만료된 PENDING 상태로 남아 있습니다.
- 그동안 로그인 53회, 홈 조회 306회, 결제 시트 노출 17회가 있었습니다.
- 테스트 계정인지 실사용자인지는 이 데이터로 판단할 수 없습니다.
- 다만 "코드를 만들고 → 상대가 들어오지 않고 → 만료되어 다시 만드는" 패턴은 #2·#15·#16 과 정확히 겹칩니다.

**device_tokens**

- user 14 에게 android 토큰이 **52개**(모두 서로 다름) 있습니다. 나머지 사용자는 1~2개입니다.
- `DeviceNotRegistered` 정리는 그 사용자에게 푸시를 보낼 때만 일어나는데, 미연결 사용자는 받을 푸시가 없어 쌓이기만 합니다(#28).

**교차 확인 결과 (현재 0건)**

- 활성 커플이 2개 이상인 사용자: 0명 (#4·#5 는 잠재 위험)
- 대소문자만 다른 이메일 중복: 0건 (#12 는 잠재 위험)
- `COUPLE_CONNECTED` 이벤트: 3건 (relations 7·8·9). relation 3 은 계측 도입 전에 연결됐습니다.

---

## 4. 코드만으로 확인할 수 없는 것

1. **Railway 운영 환경변수:** `PLAN_FREE_TRIAL`, `PLAN_TRIAL_DAYS` 의 실제 값. 이 문서는 기본값(false/0)과 `docs/BILLING_STATUS_2026-09-25.md` 기록을 근거로 했습니다.
2. **스토어 체험 설정:** Play Console 과 App Store Connect 에 7일 무료 체험(도입 혜택)이 걸려 있는지, `pro_yearly` 가 등록돼 있는지.
3. **안드로이드 결제창의 offer 순서:** 체험 혜택 토큰이 첫 번째로 오는지 (`iap.ts:309-311`). 실기기 결제창으로 확인해야 합니다.
4. **dubly.co.kr 실제 배포본:** Netlify 에 `/.well-known/assetlinks.json`·`apple-app-site-association` 이 없다는 것은 저장소 기준으로만 확인했습니다. 배포본과 DNS 는 직접 확인해야 합니다.
5. **메신저 공유 실사용 동작:** 카카오톡에서 초대 문구를 받아 길게 눌러 복사 → 앱에 붙여넣기 → `extractInviteCode` 로 추출되는지.
6. **Android 알림 채널·우선순위:** `setNotificationChannelAsync` 도 `channelId`·`priority` 지정도 없습니다. 헤드업 배너가 뜨는지, Doze 에서 늦게 도착하는지는 실기기로 확인해야 합니다.
7. **Android 13 `POST_NOTIFICATIONS`:** expo-notifications 플러그인이 넣는 것으로 추정합니다. 빌드된 매니페스트로 확인해야 합니다. 라이브러리 권한은 `expo introspect` 에 보이지 않으니 그걸 근거로 쓰지 않습니다.
8. **iOS APNs 키 유효성·실제 전달률:** 운영 로그의 Expo 영수증 실패 줄로 집계해야 합니다.
9. **콜드 스타트 알림 재처리:** 일반 아이콘으로 실행했을 때 `getLastNotificationResponseAsync` 가 예전 알림을 다시 돌려줘 엉뚱한 화면으로 가는지. 플랫폼·SDK 동작입니다.
10. **SecureStore 예외 빈도 (#1 의 실제 영향):** 백업 복원, 키스토어 초기화, 기기 이전 등에서 얼마나 자주 나는지.
11. **서버 로케일:** 운영 JVM·컨테이너 기본 로케일, 그리고 앱이 `Accept-Language` 를 붙이는지 (#21 영어 노출 여부).
12. **Railway 프록시의 `X-Forwarded-For` 처리:** 가입 레이트리밋 키의 신뢰성.
13. **iOS 심사:** 소셜 로그인을 열 경우 애플 로그인 동반 요구(가이드라인 4.8). 지금은 이메일만이라 해당하지 않습니다.
14. **푸시 권한 안내 모달의 실제 화면:** 가입 직후 홈 위에 다른 모달과 겹쳐 뜨는지.
15. **user 14 의 정체:** 테스트 계정인지 실사용자인지 (§3.4 해석에 영향).

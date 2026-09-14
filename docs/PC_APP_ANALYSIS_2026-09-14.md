# Dubly PC 앱화 분석 (2026-09-14)

> 질문: "출근하면 폰보다 PC 앱을 많이 쓰는데, Dubly 의 PC 앱화는 어느 정도 일인가?"
>
> 결론 한 줄: **코드는 이미 웹을 겨냥하고 있으나(플랫폼 분기 7파일, 배포 문서, URL 라우팅), 현재
> 웹 빌드는 부팅 직후 죽어 있었고(9/7 이후, 이 세션에서 수정), 살려 놓아도 1440px 화면에
> 폰 UI 가 그대로 늘어난다.** PC 앱화의 본체는 "웹으로 뜨게 하기"가 아니라 **"큰 화면·키보드·
> 알림에 맞는 셸을 얹는 것"**이며, 브라우저(PWA) → 필요하면 Tauri 래핑 순서를 권한다.

---

## 0. 이 세션에서 실측한 것

| 항목 | 결과 |
| --- | --- |
| `expo export --platform web` | **통과**. JS 6.4MB(단일 청크) + 에셋 9.7MB, 총 16MB |
| `expo start --web` 부팅 | **흰 화면** — 콘솔 `requireNativeComponent is not a function`, 이어서 `Cannot find native module 'ExpoMediaLibraryNext'` |
| 원인 1 | `frontend/index.ts` 가 `@stream-io/video-react-native-sdk` 를 최상단 import (f221b13, 9/7 iOS 벨 웨이크업). `if (Platform.OS === 'ios')` 는 *호출*만 막고 import 는 웹 번들에 실린다 — `callStore.web.ts` 주석이 경고한 그대로. 웹 스토어에는 `createVideoClient` 도 없다 |
| 원인 2 | `ImageViewer.tsx` 의 `expo-media-library` 56 `Asset` 클래스 import (5eaeed9, 9/9). import 시점에 네이티브 모듈을 찾는다 |
| 수정 | 둘 다 플랫폼 분기 안 지연 `require` 로 이동 — 커밋 `a29459f`. 이후 온보딩 → 로그인까지 정상 부팅 확인 |
| 왜 몰랐나 | `tsc` 는 네이티브 파일 기준으로 해석해 통과하고, CI(`.github/workflows/ci.yml`)에 웹 번들 검사가 없다 |
| CORS | `localhost:19006` 에서 운영 백엔드 `/api/v1/health` 200 — Railway `CORS_ALLOWED_ORIGINS` 에 로컬 오리진이 이미 들어 있다. WebSocket `/ws/chat` 은 `*` |
| 1440×900 렌더링 | 온보딩 "다음" 버튼이 화면 전폭, 로그인 폼이 1400px 로 늘어남. 최대 폭 컨테이너·브레이크포인트·hover·키보드 단축키 **전부 0건** |

교훈: 웹은 "한 번 살려 둔 타깃"이지 "지켜지는 타깃"이 아니었다. 네이티브 기능을 붙일 때마다
(통화, 사진 저장) 웹이 조용히 죽는다. 4절 0단계의 CI 검사가 그래서 첫 순서다.

---

## 1. PC 에서 무엇을 하려는가 — 사용 맥락부터

"출근해서 PC 앞" 상황을 가정하면 Dubly 기능은 세 부류로 갈린다.

| 부류 | 기능 | PC 에서의 비중 |
| --- | --- | --- |
| **PC 가 주력** | 채팅, 오늘의 질문 답하기, 우리 기록(피드) 보기·반응, 캘린더·D-day 확인, 럽슐랭 저장·검색(지도), 여행 계획, 미니게임(스도쿠·오목) | 높음 — 카카오톡 PC 버전과 같은 "업무 중 짬" 사용 |
| **PC 가 보조** | 식단 기록(점심 — 사진은 폰, 텍스트·바코드 검색은 PC 가 편함), 무드 기록, 스트릭 확인 | 중간 |
| **PC 와 무관** | 운동 세션(체육관), 통화(폰이 낫다), 음성 메시지 녹음, 홈 위젯, 인앱결제 | 낮음 — 포기해도 된다 |

즉 PC 클라이언트는 **읽기 + 텍스트 입력 중심**이다. 이 전제가 뒤의 우선순위를 결정한다:
통화·IAP·네이티브 사전을 PC 에 옮기는 데 힘을 쓰지 않고, 채팅·피드·캘린더의 **큰 화면 경험**에
집중한다.

---

## 2. 현재 코드가 웹을 어디까지 지원하는가 (인벤토리)

### 2.1 이미 되어 있는 것

- **플랫폼 파일 분기 7건**: `callStore.web.ts`(통화 무효화), `CallOverlay.web.tsx`, `iap.web.ts`,
  `sentry.web.ts`(번들 2MB 절감), `AnimatedSticker.web.tsx`(Lottie → 정지 PNG),
  `KakaoMap.web.tsx`(**진짜 웹 구현** — Kakao JS SDK 직접 로드), `modules/korean-spell/.../KoreanSpellModule.web.ts`(사전·띄어쓰기 층 무효화, 규칙 층만 동작).
- **`Platform.OS === 'web'` 런타임 가드 25건 / 17파일**: 푸시 6건(웹 푸시 전무), IAP 4건, 테마 저장(localStorage) 3건, 업로드 FormData 3건, 공유·토스트·다이얼로그·드래그 재정렬(웹은 FlatList)·식단 사진 선택 각 1건.
- **URL 라우팅**: `navigation/linking.ts` 가 약 50개 화면에 경로를 준다. 브라우저 뒤로가기·새로고침·북마크가 동작한다. PC 앱화의 가장 큰 선행 자산.
- **토큰 저장 분기**: `utils/storage.ts` — 웹은 AsyncStorage(=localStorage), 네이티브는 SecureStore.
- **배포 경로**: `docs/WEB_DEPLOY.md`(Netlify, SPA fallback `public/_redirects`), `app.config.js` 의 Netlify 환경 감지, 아이콘 폰트 서브셋 스크립트.
- **백엔드**: CORS 화이트리스트(`CorsProperties`, `application-prod.yml`), WebSocket 은 STOMP CONNECT 의 JWT 로 인증(오리진 무관). 순수 WebSocket(`@stomp/stompjs`, SockJS 없음).

### 2.2 없는 것 / 깨진 것

| 영역 | 상태 | 비고 |
| --- | --- | --- |
| 반응형 레이아웃 | **없음** | 브레이크포인트 0, 앱 셸 max-width 0. `useWindowDimensions` 9파일은 전부 컴포넌트 내부 계산용 |
| 데스크톱 내비 | **없음** | 하단 탭 5개(`MainTabNavigator.tsx`)만. 드로어·사이드 레일 없음 |
| hover / 키보드 단축키 | **0건** | Enter 전송조차 없음(채팅 입력이 멀티라인 TextInput) |
| PWA manifest / 서비스 워커 | **없음** | `app.json` 의 `web.display: standalone` 등은 Metro 웹 번들러에서 manifest 를 만들어 주지 않는다 → 설치 불가 상태일 가능성 높음(빌드 산출물에 manifest.json 없음 확인) |
| 웹 푸시 | **없음** | `expo-notifications` 만 있고 Web Push(VAPID) 경로는 백엔드·프론트 모두 0줄 |
| 웹 에러 리포팅 | **없음** | `sentry.web.ts` 가 no-op. `@sentry/browser` 를 그 자리에 끼우면 된다 |
| 통화 | **불가(의도적)** | Stream 브라우저 SDK(`@stream-io/video-react-sdk`)는 별개 통합 |
| 인앱결제 | **불가** | 웹 결제 없음 — 웹은 스토어에서 산 PRO 상태만 반영 |
| 채팅 내보내기 | **깨짐** | `utils/chatExport.ts` 가 `expo-file-system` `File`/`Paths` 를 웹 분기 없이 사용 |
| 웹 번들 크기 | 6.4MB JS | 회사 네트워크에서 첫 로드 체감. 청크 분리·큰 모듈 확인 필요(맞춤법 규칙·사전 JSON 여부) |
| CI | 웹 미검사 | 이번 크래시가 일주일 잠복한 원인 |

### 2.3 소셜 로그인

- 이메일/비번은 웹에서 그대로 동작(이번 세션 로그인 화면까지 확인).
- Google 은 `expo-auth-session` 코드가 있으나 `GOOGLE_AUTH.webClientId` 가 비어 있어 전 플랫폼 비활성.
- Kakao·Apple 은 백엔드 엔드포인트만 있고 클라이언트 구현 0줄.

---

## 3. 선택지 비교

| | A. 브라우저 웹 + PWA | B. A 를 Tauri/Electron 으로 래핑 | C. 별도 데스크톱 코드베이스 |
| --- | --- | --- | --- |
| 설치 | URL 접속, 크롬 "앱 설치" | 인스톨러(.msi/.exe) | 인스톨러 |
| 코드 재사용 | 100% (Expo 웹) | 100% + 얇은 셸 | 화면 전부 재작성 |
| 알림 | Web Push(VAPID) — 백엔드 발송 경로 신규, 브라우저 꺼지면 안 옴 | OS 네이티브 알림·트레이·시작 시 자동 실행 | 동일 |
| 토큰 보관 | localStorage(XSS 노출) | OS 키체인(Windows Credential Manager) 가능 | 동일 |
| 회사 PC 제약 | 설치 권한 불필요 — **가장 큰 장점** | 관리 PC 는 설치 불가일 수 있음 | 동일 |
| CORS | 오리진 등록 1줄 | `Origin: null` 또는 `tauri://localhost` 처리 필요 | — |
| 레이아웃 작업 | 필요 | **똑같이 필요**(래퍼는 레이아웃을 안 고쳐 준다) | 새로 |
| 추정 규모 | 아래 4절 | A + 1~2일 | 수 주 |

**권장: A 를 완성한 뒤, "알림이 브라우저에 묶이는 게 불편하다"가 실제로 확인되면 B(Tauri).**
이유는 세 가지다. (1) 회사 PC 는 설치가 막힌 경우가 많아 URL 접속이 사실상 유일한 보편 경로다.
(2) 레이아웃·키보드·알림 작업은 어느 길을 가도 똑같이 해야 하고, B 는 A 위에 얹는 얇은 층이다.
(3) 데스크톱 코드베이스를 따로 두면 1인 개발에서 두 앱을 유지하게 된다.

Tauri 를 Electron 보다 앞에 둔 이유: 인스톨러 수 MB vs 150MB, Rust 셸이지만 우리 쪽 코드는
JS 그대로, Windows 알림·트레이·자동 시작·키체인 플러그인이 공식 제공. 다만 Windows 는 WebView2
(Edge 기반) 위에서 돌아가므로 크롬에서 검증한 것이 그대로 간다.

---

## 4. 단계별 작업 — PC 카카오톡을 기준점으로

목표 이미지: **PC 카카오톡처럼 작은 창으로 화면 구석에 띄워 두고, 채팅과 오늘의 질문·피드를
짬짬이 보는 클라이언트.** 전체 화면 대시보드가 아니다.

### 0단계 — 웹을 다시 "지켜지는 타깃"으로 (0.5일) — **완료**

- [x] 부팅 크래시 2건 수정 (`a29459f`).
- [x] CI 에 `frontend-web-build` 잡 추가(`npm run build:web`). 번들만 만들어도 import 시점
  크래시의 절반(모듈 해석 실패)은 잡힌다. 런타임 크래시까지 잡는 Playwright 검사는 선택으로
  남겨 둔다 — 지금은 번들 크기도 로그에 찍는다.
- [x] `chatExport.ts` 웹 분기 — `chatExport.web.ts`(Blob 다운로드) 신설, 순수 조립 로직은
  `chatTranscript.ts` 로 분리. 호출자(`ChatRoomScreen`)의 `Sharing.isAvailableAsync()` 직접
  호출을 `canExportTranscript()` 로 바꿔, **웹에서 내보내기가 막히지 않고 .txt 로 떨어진다**
  (윈도우 메모장 한글 깨짐 방지로 BOM 을 붙인다).
- [x] 웹 번들 구성 확인 — 아래 표.

#### 번들 구성 (`--dump-sourcemap` + source-map-explorer, 2026-09-14)

메인 청크 **5.1MB**. 0절의 6.4MB 는 크래시 수정 *전* 수치이고, `a29459f` 로 Stream SDK·WebRTC 가
빠지면서 1.3MB 가 줄었다 — **웹에서 안 쓰는 네이티브 SDK 가 번들에 실려 있었다는 뜻이기도 하다.**

| 구성 | 크기 | 비중 |
| --- | --- | --- |
| (소스맵 미매핑 — metro 런타임·polyfill 등) | 1982KB | 39.9% |
| `react-native-reanimated` | 665KB | 13.4% |
| **`src/screens`** (앱 화면 77개) | 635KB | 12.8% |
| `react-native-web` | 265KB | 5.3% |
| `react-native-gesture-handler` | 204KB | 4.1% |
| `react-dom` | 175KB | 3.5% |
| `src/components` | 135KB | 2.7% |
| 나머지(내비게이션·svg·expo-*) | 각 50KB 미만 | — |

확인된 것: `@stream-io/*`·`react-native-webrtc`·`react-native-iap`·`lottie`·Sentry 는 웹 번들에
**0바이트**다(파일 분리가 실제로 먹고 있다). 줄일 여지는 화면 코드 분할(`src/screens` 635KB)과
reanimated 인데, 둘 다 0단계 범위가 아니라 필요해지면 따로 다룬다.

### 1단계 — 큰 화면 셸 (3~5일, 본체)

> 6절 1번 확정: **기본 형태는 420~480px 폭의 작은 세로 창.** 2열 레이아웃은 만들지 않는다.
> 아래 최대 폭·사이드 레일은 사용자가 창을 넓혔을 때 깨지지 않게 하는 상한선이지, 넓은 창을
> 겨냥한 별도 설계가 아니다.

- **앱 셸 컨테이너**: 폭 ≥ 1024px 에서 콘텐츠를 중앙 정렬하고 최대 폭을 둔다. 채팅은 720px,
  나머지 화면은 560~640px 이 폰 디자인을 깨지 않는 안전선. 한 곳(`RootNavigator` 아래 래퍼)에
서 처리하면 77개 화면이 상속한다.
- **하단 탭 → 사이드 레일**: ≥ 1024px 에서 `CustomTabBar` 를 왼쪽 세로 레일(아이콘+라벨,
  안 읽은 배지 유지)로 바꾼다. 같은 컴포넌트가 `useWindowDimensions` 로 방향만 바꾸면 된다.
- **채팅 버블 폭**: `ChatRoomScreen` 의 `maxWidth: '82%'` 를 절대값(≤ 560px)으로. 지금은
  1400px 버블이 나온다.
- **모달·시트 중앙 배치**: 바텀시트류(`DatePickerSheet`, 업그레이드 시트 등)는 데스크톱에서
  중앙 다이얼로그가 자연스럽다. 이미 `maxWidth: 340~360` 인 다이얼로그는 그대로 간다.
- **PWA manifest + 서비스 워커**: `public/manifest.json` 수기 작성 + `index.html` 템플릿에
  `<link rel="manifest">`. 작은 창(예: 420×800)으로 "앱 설치"되게 `display: standalone`.
  서비스 워커는 오프라인 셸 캐시만(데이터 캐시는 하지 않는다 — 리프레시 토큰 회전과 충돌).
- **`SwipeBackView`**: 마우스에서는 발견 불가. 데스크톱에서는 비활성화하고 헤더 뒤로가기 +
  브라우저 뒤로가기(이미 `linking.ts` 로 동작)에 맡긴다.

### 2단계 — 키보드와 마우스 (1~2일)

- 채팅 입력: **Enter 전송, Shift+Enter 줄바꿈**(카톡 PC 관습). `onKeyPress` 를 웹에서만 건다.
- **클립보드 이미지 붙이기(Ctrl+V)** 와 **드래그앤드롭 업로드** — 회사 PC 에서 스크린샷 공유가
  가장 흔한 사용. `imageUpload.ts` 의 웹 FormData 경로(`fetch(uri).blob()`)를 그대로 쓴다.
- hover 상태: 피드 카드 반응 버튼, 탭 레일, 메시지 시각 표시. `Pressable` 의 `hovered` 상태로
  구현(react-native-web 지원).
- 이모티콘·스티커 피커는 마우스 클릭 크기(≥ 32px) 확인.

### 3단계 — 알림과 재접속 (0.5~1일) — 6절 2번 결정으로 축소됨

- **탭 제목 미읽음 배지**: `document.title = '(3) Dubly'` — 브라우저에서 가장 싼 알림.
  **이번 범위는 여기까지다.**
- ~~**Web Push(VAPID)**~~ — **보류(6절 2번)**. 되살릴 때 할 일만 남겨 둔다: 백엔드에 웹
  구독(endpoint·p256dh·auth) 저장 테이블 + 발송 경로 신규, 기존 `notification` 패키지의 Expo
  발송과 나란히 두고 발송 팬아웃에서 기기 타입별 분기, Purger 규칙(CLAUDE.md 4절)에 새 테이블
  추가 필수, 프론트는 `push.ts` 의 웹 분기 6곳을 Web Push 등록으로 교체. 2~3일.
- **`AppState` → `visibilitychange`**: `MainTabNavigator` 가 `AppState 'active'` 로 방 목록을
  다시 읽는데, 웹에서는 탭 전환이 이 이벤트를 안 낸다. `document.visibilityState` 로 보강.
- **소켓 재접속**: `chatSocket.ts` 의 `forceBinaryWSFrames` / `appendMissingNULLonIncoming` 은 RN
  호환 플래그다. 브라우저에서 부작용 없는지 확인. 회사 프록시가 `wss` 를 막는 경우가 있어
  "연결 안 됨" 배너 + 폴링 폴백(REST `loadRooms`)을 표시한다 — SockJS 는 넣지 않는다.

### 4단계 — 공용·회사 PC 보안 (1~2일)

- **JWT 가 localStorage 에 그대로**: XSS 한 건이면 access·refresh 둘 다 유출. 최소 조치는
  access 토큰을 메모리에만 두고 refresh 만 저장. 완전한 조치는 refresh 를 httpOnly 쿠키로 —
  이 경우 백엔드 `setAllowCredentials(false)` 와 오리진 화이트리스트를 함께 바꿔야 한다.
- **"이 PC 기억하기" 체크박스**: 미체크 시 탭 닫으면 로그아웃(sessionStorage). 회사 공용 PC 전제.
- **화면 프라이버시**: 사진 블러 모드 또는 "조용한 모드"(미리보기 텍스트 숨김). 카톡 PC 의
  잠금 모드가 참고 사례. 필수는 아니다.

### 5단계 — 선택 항목

- 통화: `@stream-io/video-react-sdk` 를 `callStore.web.ts` 자리에 통합. Android↔Android 전제
  설계(`docs/CALL_STATUS.md`)를 깨는 일이라 별도 결정 사안. PC 카메라·마이크 권한 UX 추가.
- Google 로그인: `webClientId` 채우고 오리진 등록(0.5~1일). **6절 3번에서 이번엔 안 하기로 결정** —
  이메일 로그인이 이미 웹에서 되므로 급하지 않다. 회사 PC 에서 비번 입력이 불편해지면 그때.
- Tauri 래핑: 3단계까지 끝난 뒤 알림 불만이 확인되면.

### 규모 합계

6절 결정을 반영한 수치다(Web Push·Google 로그인 제외).

| 단계 | 일수(대략) |
| --- | --- |
| 0. 웹 지키기 | 0.5 |
| 1. 큰 화면 셸 | 3~5 |
| 2. 키보드·마우스 | 1~2 |
| 3. 알림·재접속 (배지까지) | 0.5~1 |
| 4. 보안 | 1~2 |
| **합계** | **6~10.5일** |

보류분을 나중에 붙이면: Web Push +2~3일, Google 로그인 +0.5~1일, Tauri 래핑 +1~2일.
4단계(보안)도 혼자 쓰는 동안에는 급하지 않으므로, **실사용까지의 최단 경로는 0~2단계의 5~7.5일**이다.

---

## 5. 하지 않기로 하는 것 (명시)

- 운동 세션·음성 메시지 녹음·홈 위젯·IAP 를 PC 에 맞추지 않는다. 화면은 뜨되 "폰에서 해요"
  안내로 충분하다.
- 맞춤법 **사전·띄어쓰기 층**(네이티브 Kiwi/Hunspell)은 웹에 안 올린다. 규칙 층만 동작.
  WASM 빌드는 `docs/SPELLCHECK_NATIVE_ENGINE_REANALYSIS_2026-09-03.md` 에서 이미 접은 방향.
- Lottie 스티커는 정지 PNG 유지(웹 Lottie 는 번들 크기 대가가 크다).
- 데스크톱 전용 코드베이스(선택지 C)는 만들지 않는다.

---

## 6. 결정 사항 (2026-09-14 확정)

| # | 항목 | 결정 | 이유 / 영향 |
| --- | --- | --- | --- |
| 1 | 창 형태 | **작은 세로 창(PC 카톡형, 420~480px 폭)** | 커플은 방이 하나라 2열이 줄 정보가 적다. 1단계가 셸 컨테이너만으로 끝나고 화면 설계 추가분이 없다 |
| 2 | 알림 수준 | **탭 제목 배지만. Web Push 는 보류** | 백엔드 테이블·발송 팬아웃·Purger 등록이 전부 빠진다. 3단계가 2~3일 → 0.5~1일 |
| 3 | Google 로그인 웹 | **활성화하지 않음** | 이메일 로그인이 이미 웹에서 동작한다. 회사 PC 에서 비번 입력이 불편해지면 그때 0.5~1일로 붙인다 |
| 4 | CI 웹 검사 | **추가(0단계에 포함)** | 이번 부팅 크래시 재발 방지. 반대 사유가 없어 결정 대기로 두지 않았다 |

즉 **전부 가벼운 쪽**을 택했고, 그 결과가 7절의 최소 범위와 맞아떨어진다. Web Push 와 Google
로그인은 "안 한다"가 아니라 **"몇 주 써 보고 불편이 실제로 확인되면"** 으로 미룬 것이다 —
되살릴 때 필요한 작업 내용은 4절 3단계·5단계에 그대로 남겨 둔다.

---

## 7. 문답 정리 — "수정할 게 많나? 다운로드도 필요한가?"

**많지 않다.** 꼭 해야 하는 건 1단계(큰 화면 셸) 하나다. 셸 컨테이너와 사이드 레일을 한 곳에서
처리하면 77개 화면이 상속하므로 화면을 하나씩 고치는 일이 아니다(3~5일). 여기에 Enter 전송과
Ctrl+V 이미지 붙이기(1~2일)만 얹으면 PC 에서 쓸 만한 수준이 된다 — **최소 범위 5~7일.**
웹 푸시·토큰 보안은 써 보고 불편이 확인되면 붙이고, 통화·결제·운동은 PC 에서 하지 않는다.

**다운로드는 선택이다.**

| 경로 | 다운로드 | 비고 |
| --- | --- | --- |
| 브라우저(PWA) — 권장 | **없음** | 주소만 열면 된다. 크롬 "앱 설치" 버튼으로 별도 창을 띄우는 것도 설치 파일 없이 브라우저가 처리한다. 회사 PC 설치 권한 불필요. 단 그 버튼이 뜨려면 지금 없는 manifest 를 추가해야 한다(반나절) |
| Tauri 래핑 | 인스톨러(.msi) | Windows 알림·트레이·자동 실행이 필요할 때만. 브라우저 경로 완성 후 1~2일 추가 |

순서: 브라우저에서 5~7일 작업 → 회사에서 몇 주 사용 → 알림이 아쉬우면 Tauri. 처음부터
다운로드 앱을 만들 이유는 없다.

---

## 부록 — 참고 파일

- 엔트리·분기: `frontend/index.ts`, `frontend/src/store/callStore.web.ts`, `frontend/src/utils/storage.ts`,
  `frontend/src/utils/push.ts`, `frontend/src/navigation/linking.ts`, `frontend/src/navigation/MainTabNavigator.tsx`
- 배포·CORS: `docs/WEB_DEPLOY.md`, `frontend/public/_redirects`, `backend/.../common/config/CorsProperties.java`,
  `backend/.../common/config/SecurityConfig.java`, `backend/src/main/resources/application-prod.yml`
- 관련 결론: `docs/UX_UI_AUDIT.md`(웹 PWA 최우선 항목·`linking` 도입 배경), `docs/CALL_STATUS.md`,
  `docs/LANDING_SITE.md`(앱 사이트와 소개 사이트가 별개인 이유)

# Doubly → Dubly 브랜드 표기 전환 분석

> 결론 먼저: 사용자가 제시한 4단 분류(표기 Dubly / 앱ID com.doubly.app / 백엔드 com.fitto / 인프라 fitto-*)는 코드베이스 실태와 정확히 맞습니다. 다만 그 사이에 **"doubly" 자체가 이미 인프라 식별자로도 쓰이고 있는 계층**이 하나 더 있어서, 이를 명시적으로 "유지" 항목에 추가해야 합니다. 즉 실제로는 3-계층 구조(Dubly 표기 / doubly 식별자 / fitto 레거시 식별자)입니다.

---

## 0. 배경

- 최초 브랜드는 `Fitto` → `Doubly`로 한 번 전환된 이력이 있고, 그때 세운 원칙이 [README.md](../README.md) 101~132행 "이름 전환 범위"에 문서화돼 있음: **"표기(사람이 읽는 것)와 식별자(기계가 읽는 것)를 분리 관리한다."**
- 이번 `Doubly → Dubly`도 같은 원칙을 재적용하는 것 — 즉 리브랜딩이 아니라 **표기 전환**이고, 식별자 마이그레이션은 별도 작업으로 분리한다는 게 사용자 제안의 핵심.
- 동기: "Doubly"를 사용자들이 "두블리"로 발음하는 경향 → 철자를 "Dubly"로 바꿔 의도한 발음("더블리")에 시각적으로 더 가깝게 맞추려는 시도.

---

## 1. 3-계층 모델 (제안 확정안)

| 계층 | 값 | 적용 대상 | 변경 여부 |
|---|---|---|---|
| **① 브랜드 표기** | `Dubly` (더블리) | 사업자 등록(있다면), 스토어 표시명, 앱 내 UI 문구, 이메일 발신자명, 약관/방침 서비스명, README/문서 제목 | ✅ 변경 |
| **② 앱 식별자** | `com.doubly.app` | Android Package ID / iOS Bundle ID / Firebase `project_id: doubly-5f40c` / Sentry `project: doubly` / 딥링크 스킴 `doubly://` / AsyncStorage 키 `doubly.*` | ⛔ 유지 (표에 없던 부분 — 아래 2-1 참고) |
| **③ 레거시 내부 식별자** | `com.fitto` | 백엔드 Java 패키지, `@ConfigurationProperties(prefix="fitto.*")`, Railway 도메인(`fitto-production...`), DB명/유저명 `fitto`, Cloudinary preset `fitto_unsigned` | ⛔ 유지 |

### 2-1. 캡처에 없던 "②doubly 식별자" 세부 목록 (전수조사 결과)

Package ID 외에도 "doubly"라는 문자열 자체가 이미 여러 인프라 식별자로 박혀 있습니다. **①을 Dubly로 바꾼다고 이 값들까지 "dubly"로 바꾸면 안 됩니다** — Firebase 프로젝트 이전, Sentry 프로젝트 이전, 로컬 저장소 마이그레이션이 함께 발생해 기존 로그인 세션/크래시 로그 이력이 끊깁니다.

- `frontend/app.json` — `scheme: "doubly"`, `slug: "doubly"`, iOS `bundleIdentifier` / Android `package`: `com.doubly.app`
- `frontend/google-services.json` — Firebase `project_id: "doubly-5f40c"`, `storage_bucket: "doubly-5f40c.firebasestorage.app"`
- `frontend/app.json` Sentry 설정 — `organization: "happyeon"`, `project: "doubly"` / `frontend/src/utils/sentry.ts` — `release: doubly@{APP_VERSION}`
- `frontend/src/navigation/linking.ts` — `prefixes: ['doubly://']`
- `frontend/src/constants/config.ts` — AsyncStorage 키 `doubly.onboardingSeen`, `doubly.pushPrimed`, `doubly.theme.mode`, `doubly.spellCheckEnabled`, `doubly.widgetData` 등

> 참고로 `fitto.accessToken`/`fitto.refreshToken` 같은 세션 관련 스토리지 키는 ③(fitto) 쪽에 남아있어 이미 표기/식별자가 혼재된 상태입니다. 이번 전환에서 이 혼재를 더 늘리지 않는 게 중요합니다.

---

## 2. 실제로 "Dubly"로 바꿔야 하는 지점 (①번, 표시 텍스트)

| 파일 | 내용 |
|---|---|
| `frontend/app.json` | `name: "Doubly"` → `"Dubly"`, `web.name`/`web.shortName`/`web.description` |
| `frontend/src/screens/onboarding/SplashScreen.tsx:51` | `<Text style={styles.brand}>Doubly</Text>` |
| `frontend/src/screens/onboarding/LoginScreen.tsx:47` | 동일 워드마크 |
| `frontend/src/components/DoublyLogo.tsx:149` | 워드마크 텍스트 (컴포넌트/함수명 `DoublyMark`, `DoublyLogo` 자체는 ②/③처럼 식별자 성격이라 유지해도 무방) |
| `frontend/src/widget/DoublyWidget.tsx:68` | 홈 화면 위젯 워드마크 `text="Doubly"` |
| `frontend/src/screens/my/MyScreen.tsx:602` | `Doubly · 둘이라서, 두 배로` |
| `frontend/src/screens/my/SettingsScreen.tsx:82, 232` | 문의 메일 제목 `[Doubly 문의]`, 버전 표기 `Doubly v{APP_VERSION}` |
| `frontend/src/screens/home/CoupleConnectScreen.tsx:56`, `TrainerDashboardScreen.tsx:60` | 초대 공유 문구 `Doubly에서 커플로 연결해요!` |
| `frontend/src/constants/legal.ts:26, 68` | 이용약관/개인정보처리방침 서비스명 |
| `backend/.../SmtpPasswordResetMailSender.java`, `ResendMailSender.java` | `FROM_NAME = "Doubly"`, 메일 제목 `[Doubly] ...`, 서명 `— Doubly` |
| `backend/.../ResendProperties.java`, `application.yml` | `RESEND_FROM=Doubly <onboarding@resend.dev>` |
| `backend/.../GooglePlayDeveloperApiClient.java:133` | `.setApplicationName("Doubly")` — Google Play Developer API에 앱 이름으로 전송되는 값 |
| `README.md`, `PLAN.md`, `docs/*.md` 제목/본문 | 문서 표기 다수 |

→ 대부분 단순 문자열 치환(`Doubly` → `Dubly`)이라 기계적으로 처리 가능. 코드 식별자(변수명·컴포넌트명·패키지명)는 안 건드려도 됨.

---

## 3. 절대 건드리면 안 되는 지점 (②③번)

- `com.doubly.app` (Android/iOS 앱 ID) — **스토어에 이미 등록 완료 확인됨.** 변경 시 신규 앱 취급(기존 설치·리뷰·랭킹 전부 소실)이므로 절대 변경 불가.
- Firebase `doubly-5f40c` 프로젝트, Sentry `doubly` 프로젝트, `doubly://` 딥링크, `doubly.*` AsyncStorage 키
- `com.fitto` 백엔드 패키지, `fitto.*` 설정 프리픽스, Railway `fitto-production...` 도메인, DB/Cloudinary `fitto` — 이건 이미 한 번 "유지"로 결정 난 사안, 이번 전환과 무관

---

## 4. 확인 결과 / 남은 확인 항목

1. **스토어 제출 이력 → 확정됨**: `com.doubly.app`으로 **이미 스토어에 등록 완료**. 따라서 ②(Package ID / Firebase / Sentry / 딥링크 스킴 / AsyncStorage 키)는 "유지"가 아니라 **변경 불가 확정 사항**입니다. Package ID를 `com.dubly.app`으로 바꾸는 옵션은 폐기 — 바꾸면 기존 설치·리뷰·랭킹이 전부 소실되고 신규 앱 취급됩니다. 이제 이 프로젝트는 확정적으로 **"Dubly(표기) 위에 com.doubly.app(식별자)이 얹힌 구조"**가 최종 형태입니다.
2. **사업자등록 여부**: `legal.ts`에는 "개인 개발자가 운영"이라고만 돼 있고 법인/개인사업자 상호(예: "더블리")가 명시된 곳이 없습니다. 이미 사업자등록증에 상호를 올려두셨나요? 있다면 "Dubly"로 정정신고가 필요하고, 없다면 지금이 처음부터 "Dubly"로 등록할 좋은 타이밍입니다.
3. **도메인/소셜 핸들**: `dubly.app`, `dubly.com` 등 도메인 및 SNS 핸들 확보 여부 — 미확인.
4. **상표**: 기존 KIPRIS 조사([memory: doubly-trademark-search-2026-08](../.claude 밖 개인 메모리 참고))는 "더블리" 발음(한글) 기준으로 진행됐습니다. "Dubly"는 영문 철자가 달라도 국내에서는 발음(더블리)이 동일 계열로 취급될 가능성이 높아 기존 조사 결과(9류 렌즈 전용 선행상표와 공존 가능)가 유효할 확률이 높지만, **정식 출원 전 "Dubly" 텍스트 표장으로 재검색을 권장**합니다.

---

## 5. 발음 문제가 실제로 해결되는지 (언어학적 체크)

- "Doubly"의 정확한 영어 발음은 `/ˈdʌbli/`로 한글 표기는 "더블리"에 가깝습니다. 이용자들이 "두블리"로 읽는 건 "Do-"를 영어 do(두)처럼 오독하거나, 이중모음 그대로 "도우블리→두블리"로 축약해 읽는 현상으로 추정됩니다.
- "Dubly"로 바꿔도 "Du-"를 여전히 "두"로 읽는 사람이 있을 수 있어(예: Duty→"듀티/두티" 식 혼동), **철자 변경만으로 발음 통일이 100% 보장되진 않습니다.**
- 가장 확실한 방법은 스토어명·앱 내 워드마크에 **"Dubly (더블리)"처럼 한글 발음을 병기**하는 것입니다. ASO에도 도움이 됩니다.

---

## 6. 리스크 및 전환기 완화책

- 이번이 `Fitto → Doubly → Dubly`로 **세 번째 표기 변경**이라 기존 사용자에게는 "또 이름이 바뀌었다"는 혼란이 누적될 수 있음 → 전환 공지, 스토어 설명에 "(구 Doubly)" 병기 등으로 완화 권장.
- 스토어 표시 이름 변경은 메타데이터 수준이라 앱 자체 재심사는 있어도 Package ID를 유지하면 신규 앱 취급은 아님. 단, ASO 키워드 순위는 초기화될 수 있음.
- 캡처/스크린샷/마케팅 자료 등 "Doubly" 텍스트가 박힌 기존 산출물 재제작 비용 발생.

---

## 7. 제안 실행 순서 (확정판)

1. `com.doubly.app`은 스토어 등록 완료로 **영구 고정** — 이 문서의 ②/③ 계층은 더 이상 논의 대상이 아니며, "①표시 텍스트만 치환"이 유일한 실행 범위.
2. "Dubly" 단독 KIPRIS 재검색으로 상표 리스크 최종 확인.
3. 도메인/SNS 핸들 확보.
4. 코드 내 2절 목록(app.json name, 스플래시/로그인/설정/위젯 하드코딩 텍스트, 이메일 발신자명, 약관·방침, README/docs 제목)을 `Doubly` → `Dubly` 일괄 치환. `scheme`/`slug`/Package ID/Firebase/Sentry/AsyncStorage 키의 `doubly` 문자열은 절대 건드리지 않음.
5. 스토어 콘솔(App Store Connect / Play Console)에서 **표시 이름**만 "Dubly"로 변경(부제·설명에 "(구 Doubly)" 과도기 병기 권장). Package ID 필드는 손대지 않음 — 애초에 스토어 콘솔에서도 이 필드는 수정 불가.
6. 사업자등록 상호 변경(해당 시).

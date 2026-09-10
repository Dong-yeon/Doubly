# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. 개발 워크플로우 (1인 개발)
- PR(Pull Request)을 생성하지 않습니다 (`gh pr create` 절대 금지)[cite: 4, 8].
- 완료된 작업은 `main`에 직접 병합(`git merge --no-ff`) 후 브랜치를 즉시 삭제합니다[cite: 4, 8].

## 2. 에이전트(AI) 작업 및 보고 규칙
- **Git Clean State**: 에이전트 실행 전 워킹 디렉토리는 항상 커밋되어 비워져 있어야 합니다[cite: 4].
- **논리적 커밋**: 한 번에 거대한 커밋을 남기지 말고, 클린하고 논리적인 단계로 나누어 커밋합니다[cite: 4].
- **리포트 작성**: 대규모 작업 완료 후에는 항상 작업 요약 리포트(예: `PROGRESS_REPORT.md`)를 남겨 리뷰를 돕습니다[cite: 4].

## 3. 명명 규칙 (Naming Boundaries)
- 사용자 노출 UI 및 문서는 **Dubly (더블리)**를 사용합니다[cite: 8].
- 인프라 단절 방지를 위해 앱 식별자(`com.doubly.app`) 및 백엔드 시스템 식별자(`com.fitto`, `fitto.*`)는 절대 변경하지 않습니다[cite: 8].

## 4. 백엔드 및 DB 필수 규칙 (CRITICAL)
- **Flyway 호환성**: PostgreSQL과 H2 환경 모두에서 동작하도록 `JSONB`, `ON CONFLICT` 등 특정 DB 전용 문법 사용을 금지합니다[cite: 4, 7, 8].
- **FK 무결성 (Purger)**: DB 테이블(엔티티) 추가 시 `UserDataPurger.java`와 `RelationRecordPurger.java`의 삭제 순서를 반드시 업데이트하여 회원 탈퇴 에러를 방지합니다[cite: 4, 7, 8].
- **상태 필터링**: `WorkoutRepository` 등 기록 조회 쿼리 작성 시, 진행 중인 데이터가 반영되지 않도록 반드시 `status = 'COMPLETED'` 조건 필터링을 포함해야 합니다[cite: 4, 7].

## 5. 세션 운영 규칙
- **한 세션을 길게 끌고 갑니다**: 컨텍스트가 차면 자동 요약되어 계속 이어지므로 길이 자체는 세션을 끊을 이유가 아닙니다. 이어 쓰면 맥락을 다시 설명할 필요가 없습니다.
- **새 세션을 만드는 경우는 세 가지뿐입니다**: ① 주제가 완전히 다를 때 ② 저장소가 다를 때 ③ 두 작업을 동시에 병렬로 굴려야 할 때. 판단 기준은 "컨텍스트가 찼는가"가 아니라 **"이 대화의 앞부분이 지금 하는 일과 무관해졌는가"**입니다.
- **결론은 세션이 아니라 저장소에 남깁니다 (CRITICAL)**: 길게 끌수록 중간 결정이 자동 요약에 눌립니다. 커밋은 *결과*만 남기고 "왜 A 대신 B를 택했는지"는 남기지 않으므로, **분석·설계처럼 산출물이 코드가 아닌 작업은 종료 시 반드시 `docs/`에 결론을 남깁니다.** 세션이 사라져도 문서는 남습니다. (2절 "리포트 작성" 규칙의 확장)
- **세션 제목을 실제 내용과 맞춥니다**: 작업이 다른 방향으로 흘러가면 제목을 바꿉니다. 제목과 내용이 어긋난 세션은 나중에 검색으로 찾을 수 없습니다.
- **병렬 작업은 반드시 각자 워크트리에서 합니다**: 여러 세션이 주 워크트리(`D:\happyeon\99.Happyeon\Doubly`)를 동시에 건드려 미커밋 편집분이 유실된 이력이 있습니다.
- **주기적으로 아카이브합니다**: 완료된 세션은 아카이브합니다(삭제가 아니라 보관 — 대화는 Archived 목록에서 다시 열 수 있고, 워크트리 폴더만 정리됩니다). 단 워크트리에 미커밋 변경이 있으면 그건 사라지므로 먼저 확인합니다.

## 6. 명령어

모노레포입니다 — 명령은 `backend/` 또는 `frontend/`에서 실행합니다. 저장소 루트의 `Dockerfile`·`src/`는
Railway가 Root Directory 미설정으로 빌드할 때를 위한 백엔드용이며, 앱 소스가 아닙니다.

### 백엔드 (`backend/`, Java 21 + Gradle)

```bash
./gradlew bootRun                          # 로컬 기동 (기본 8080, PostgreSQL+Redis 필요 → 루트에서 docker compose up -d)
./gradlew test                             # 전체 테스트 (기본 H2, 외부 인프라 불필요)
./gradlew test --tests "com.fitto.chat.ChatFlowTest"          # 단일 테스트 클래스
./gradlew test --tests "*.ChatFlowTest.메서드명"               # 단일 테스트 메서드
./gradlew bootJar                          # 배포 산출물 (plain jar는 비활성화됨)
```

- **쿼리를 건드렸으면 PostgreSQL로도 한 번 돌립니다.** 테스트 기본값은 H2지만 운영은 PostgreSQL이고,
  H2에서 통과한 쿼리가 운영에서만 500을 낸 전례가 있습니다(`:param is null` → PostgreSQL이
  `could not determine data type of parameter`로 거절). `build.gradle`이 `-Dspring.*` 시스템
  프로퍼티를 테스트 JVM으로 넘기므로 설정 파일 수정 없이 데이터소스만 갈아끼울 수 있습니다.
  전체 명령은 `docs/RUNNING.md` 참고.

### 프론트엔드 (`frontend/`, Expo + TypeScript)

```bash
npm start                                  # Metro 개발 서버 (a=Android, i=iOS, w=web)
npm run typecheck                          # tsc --noEmit  ← 테스트 러너가 없으므로 이게 사실상의 검증 게이트
npm run lint                               # expo lint
npm run verify:spellcheck                  # 한국어 맞춤법 규칙 검증 — 규칙/사전 수정 시 필수
npm run build:web                          # 아이콘 폰트 서브셋 + 웹 export
npm run build:android / build:ios          # EAS production 빌드 (건당 과금 — 네이티브가 바뀔 때만)
npm run update:production                  # EAS Update — JS/에셋만 바뀐 변경을 빌드 없이 배포
```

- **빌드 vs 업데이트**: 의존성 추가·삭제, `app.json`의 plugins/permissions, `modules/` 네이티브 코드·`.so`,
  Expo SDK 업그레이드는 **빌드**. 화면·로직·문구·이미지 변경은 **업데이트**로 충분합니다.
  런타임 버전이 `fingerprint` 정책이라 네이티브가 바뀐 커밋에서 업데이트를 올려도 기존 빌드에는
  배달되지 않을 뿐 깨지지 않습니다. 상세는 `docs/EAS_BUILD.md` §8.

- 프론트에는 테스트 러너가 없습니다. `scripts/verify-spellcheck.mjs`가 맞춤법 모듈의 테스트 역할을
  대신하며, 정탐과 **오탐 방지** 문장을 함께 검증합니다.
- 백엔드 주소는 `src/constants/config.ts`의 `USE_LOCAL_BACKEND` 한 줄로 전환합니다(기본값 false =
  배포된 Railway). 이 값을 켠 채로 커밋하지 않도록 주의합니다.

### CI (`.github/workflows/ci.yml`)

PR이 없는 워크플로라 **모든 브랜치의 push마다** 돕니다. 검사는 두 가지뿐입니다 —
백엔드 `./gradlew test`(H2/Flyway)와 프론트엔드 `npm run typecheck`.

## 7. 아키텍처 요점

여러 파일을 읽어야 보이는 것들만 적습니다. 도메인별 상세는 `README.md`, 진행 중 설계는 `PLAN.md`,
과거 세션 결론은 `docs/`(특히 `docs/SESSION_DIGEST.md`)에 있습니다.

### 모든 것이 `relations` 위에 올라간다

커플·트레이너-회원·(구상 중인) 패밀리가 전부 하나의 `relations` 테이블을 공유합니다
(`RelationType`, `user_a_id`/`user_b_id`, 초대코드, `RelationStatus`). 채팅·피드·맛집·여행·기념일 등
"둘의 것"은 모두 `relation_id`(코드에서는 `couple_id`)로 스코프됩니다. **새 커플 콘텐츠 테이블을 만들면
관계 단위 삭제 경로가 자동으로 늘어나지 않습니다** — 4절의 Purger 규칙이 여기서 나옵니다.

- `RelationRecordPurger`: 관계에 속한 콘텐츠 삭제(탈퇴 + "지난 기록 삭제" 공용). 자식 → 부모 순서이며
  순서를 바꾸면 FK 위반이 납니다. FK가 없는 `feed_reactions`(대상 4종이라 FK 불가)는 DB가 대신
  지워주지 않으므로 명시적으로 거둡니다.
- 이미지는 트랜잭션 안에서 지우지 않습니다. Purger는 삭제할 URL을 **반환**하고, 커밋 이후 Cloudinary
  삭제는 호출자 책임입니다(외부 호출 실패가 DB 삭제를 되돌리면 안 되므로).

### 백엔드는 패키지 by feature, 공통 관문은 `common/`

`com.fitto.<feature>`(auth, relation, workout, diet, chat, place, feed, trip, streak, call, mood,
question, challenge, body, voice, content, calendar, summary, notification, reengagement, trainer, user)
아래에 controller/domain/dto/repository/service가 함께 있습니다. 횡단 관심사는 `common/`에 모입니다.

- `common/response/ApiResponse` — 모든 응답의 `{ success, data, message }` 봉투.
- `common/exception/ErrorCode` — HTTP 상태와 사용자 노출 한국어 메시지가 한 곳에 묶여 있습니다.
- `common/plan/PlanGuard` — **모든 FREE/PRO 판정이 여기를 지납니다**(`require` / `consume` /
  `requireCapacity`). 402(`PLAN_UPGRADE_REQUIRED`·`PLAN_LIMIT_EXCEEDED`)와 429(`USAGE_LIMIT_EXCEEDED`)를
  나누는 이유는 **돈 낸 사용자에게 결제를 또 권하지 않기 위해서**입니다. 이 세 메서드가 기능 사용량
  계측(`FEATURE_USED`/`FEATURE_BLOCKED`)도 겸하므로, 게이팅을 우회해 구현하면 지표에서도 사라집니다.
- `common/ai` — Gemini 호출(`GeminiClient`), 비동기 작업 큐(`AiJobService`), 결과 캐시, 쿼터.
  AI 한도는 두 겹(플랜 한도 + Gemini 자체 실패)이며, 과거 "AI가 끊긴다"의 실제 주범은 Gemini 503
  이었습니다 — 추측 대신 Actuator/Micrometer 지표를 먼저 봅니다(`docs/STABILITY_ANALYSIS_2026-09-01.md`).
- `common/event/CoupleEventPublisher` — `/sub/couple/{relationId}`로 실시간 이벤트를 발행합니다.
  상대 화면을 즉시 갱신해야 하는 변경(기록 추가 등)은 REST 응답만으로 끝나지 않고 여기를 함께 호출합니다.
- `common/security` — JWT 필터 + STOMP 채널 인터셉터. WebSocket도 같은 토큰으로 인증합니다.

### Flyway 마이그레이션

`backend/src/main/resources/db/migration/V{n}__*.sql`. **번호는 매번 직접 확인하고 붙입니다** —
병렬 세션이 같은 번호를 동시에 쓰는 충돌이 반복적으로 발생했습니다.

```bash
ls backend/src/main/resources/db/migration | sed 's/^V//; s/__.*//' | sort -n | tail -1
```

4절의 H2/PostgreSQL 양립 규칙(`JSONB`·`ON CONFLICT` 금지)이 여기 걸립니다. CI가 H2로 Flyway를 돌리므로
PostgreSQL 전용 문법은 CI에서 바로 터집니다.

### 프론트엔드

- `api/client.ts` — axios가 아닌 fetch 래퍼(웹 번들 146KB 절감). 401 시 refresh 후 재시도하고, 동시 401은
  단일 refresh를 공유합니다. 네트워크 끊김·타임아웃도 `ApiError(status: 0)`로 흡수해 영문 fetch 메시지가
  사용자에게 새지 않게 합니다 — 새 API 모듈도 이 클라이언트를 통해서만 호출합니다.
- 상태는 Zustand 스토어(`store/`)에 도메인별로 있고, 화면은 `screens/<도메인>`, 네비게이션은
  탭별 스택(`navigation/*StackNavigator.tsx`)입니다.
- `web`·`native` 분기가 필요한 모듈은 `callStore.ts` / `callStore.web.ts`처럼 확장자로 나눕니다.

### 이름 경계 (3절의 실무 형태)

`fitto`는 레거시가 아니라 **배포된 인프라와 짝이 맞아야 하는 식별자**입니다 — Java 패키지 `com.fitto`,
설정 prefix `fitto.*`, 스토리지 키 `fitto.accessToken`, Railway 호스트 `fitto-production…`,
Cloudinary preset `fitto_unsigned`. 문자열만 일괄 치환하면 기존 사용자 세션과 업로드가 끊깁니다.
바꿔도 되는 곳과 두어야 할 곳의 전수 목록은 `docs/BRAND_RENAME_DUBLY.md`에 있습니다.

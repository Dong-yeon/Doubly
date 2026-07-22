# Doubly

> **둘이라서, 두 배로.** 커플 운동·식단·여행·일상 공유 앱 + 트레이너 플랫폼

Doubly는 **관계(Relation) 기반 커플 라이프 공유 앱**입니다. 커플은 운동·식단·맛집·여행·일상을
함께 기록하며 서로를 응원하고, 트레이너는 여러 회원의 운동을 관리합니다.
모든 연결은 동일한 `relations` 구조 위에서 동작합니다.

> **향후 구상 (미착수)**: 커플로 시작한 관계를 **아이가 생기면 패밀리로 확장**하는 방향을
> 검토했습니다. 커플과 패밀리는 서로를 대체하지 않고 **공존**하며, 둘만의 공간(기념일·
> 오늘의 질문·경비 반반 정산)은 그대로 유지된 채 가족 단위 기록이 그 위에 얹히는 구조입니다.
> 설계안과 착수 시 주의사항은 [관계 모델](#관계-모델--커플--패밀리아이-공존) 참고.

> **브랜드**: Duo Color System — 나=Coral·상대=Indigo·함께=Violet, 배경은 Cream, 텍스트는 Ink.
> (내부 Java 패키지는 히스토리 보존을 위해 `com.fitto` 유지, 앱 식별자는 `com.doubly.app`)

## 기술 스택

| 구분 | 기술 |
| --- | --- |
| 모바일 | React Native + Expo (TypeScript) |
| 상태관리 | Zustand |
| 백엔드 | Spring Boot 3.4 (Java 21) |
| DB | PostgreSQL (Flyway 마이그레이션 V1~V24) |
| 캐시 | Redis — AI 사용량 일일 카운터 (미가용 시 인메모리 폴백) |
| 실시간 | WebSocket (STOMP) — 채팅 + 커플 이벤트(`/sub/couple/{id}`) |
| 인증 | JWT (Access/Refresh) + 역할 기반 접근 제어(RBAC) |
| 푸시 | Expo Push Notifications |
| 이미지 | Cloudinary — 백엔드 서명(signed) 업로드, 미설정 시 unsigned 폴백 |
| 지도 | 카카오맵 JS SDK (WebView) |
| AI | Google Gemini — 음식 사진 칼로리 분석, 운동 추천 |

## 모노레포 구조

```
fitto/
├── frontend/   # Expo (React Native) 앱
└── backend/    # Spring Boot API + WebSocket 서버
```

### frontend/ (Expo)

```
src/
├── api/          # 도메인별 REST 클라이언트 (auth, relation, workout, diet, chat, place, trip, feed, streak, trainer, summary, upload, notification)
├── components/   # 공용 UI (Button, Card, TextField, KakaoMap, …)
├── constants/    # theme(컬러/스페이싱), config(API URL·Cloudinary·카카오맵 키)
├── hooks/        # 커스텀 훅
├── navigation/   # Root / Onboarding / MainTab(홈·운동+식단·FAB·채팅·맛집) 네비게이터
├── screens/      # onboarding, home, workout, diet, chat, place, trip, feed, trainer, my
├── store/        # Zustand 스토어 (auth, relation, chat, diet, toast)
├── types/        # 공용 도메인 타입
└── utils/
```

### backend/ (Spring Boot — 패키지 by feature)

```
com.fitto
├── common/        # 공통 응답/예외/설정(Security·Web·WebSocket)·AI(Gemini)·업로드 서명·커플 이벤트
├── user/          # 사용자, Role(USER/TRAINER/ADMIN)
├── auth/          # 로그인·회원가입·JWT (phase 2)
├── relation/      # 관계: 커플 / 트레이너-회원, 배경·기념일·식단 목표 (phase 2)
├── workout/       # 운동 기록·히스토리·캘린더·통계·AI 추천 (phase 3)
├── diet/          # 식단 기록·AI 사진 분석 (확장)
├── chat/          # 관계별 실시간 채팅 (phase 4)
├── streak/        # 개인·커플 스트릭 — 운동/식단 (phase 5)
├── place/         # 커플 맛집 지도 — 장소 핀·방문 기록 (PLAN.md)
├── trip/          # 커플 여행 — 여행 계획·장소 그룹핑 (PLAN.md)
├── feed/          # 커플 일상 피드 — 통합 타임라인·포스트·반응 (PLAN.md)
├── summary/       # 주간 결산·레벨
├── notification/  # Expo 푸시·디바이스 토큰
└── trainer/       # 트레이너 프로필·대시보드·루틴 (phase 6~7)
```

DB 스키마는 `backend/src/main/resources/db/migration/` 의 Flyway 마이그레이션(V1~V24)에 정의되어
있습니다. 핵심 테이블: users / relations / trainer_profiles / workouts / workout_sets /
trainer_routines / chat_messages / streaks / device_tokens / meals / places / place_visits /
feed_posts(+trip_id 앨범 연동) / feed_reactions / trips / trip_items(일자별 일정표) /
trip_expenses(경비 정산) / trip_checklist_items(준비물 체크리스트) /
password_reset_tokens(비밀번호 재설정 인증코드).

## 관계 모델 — 커플 · 패밀리(아이) 공존

> **상태: 보류 (미착수).** 아래는 지향하는 구조이며 현재 코드는 커플(2인) 전용입니다.
> 착수 전에 **[착수 시 주의사항](#착수-시-주의사항)** 을 먼저 읽으세요 —
> 이 문서를 처음 쓴 이후 관계(relations) 주변 코드가 크게 바뀌었습니다.

### 원칙

1. **커플은 사라지지 않습니다.** 패밀리는 커플을 대체하는 게 아니라 **동시에 존재**합니다.
   한 사용자는 `COUPLE` 관계와 `FAMILY` 관계에 **동시에 소속**될 수 있습니다.
2. **둘만의 공간은 보존합니다.** 기념일 D-day, 오늘의 질문, 경비 반반 정산, 1:1 채팅은
   커플 관계에 그대로 남습니다. 아이가 볼 수 없습니다.
3. **아이는 처음부터 계정을 갖지 않습니다.** 신생아·미취학 아동은 로그인 주체가 아니라
   **보호자가 대신 기록하는 프로필**입니다. 나이가 차면 계정으로 승격합니다.

### 아이 프로필의 3단계 수명주기

| 단계 | 구분 | 로그인 | 설명 |
| --- | --- | --- | --- |
| 1 | **관리 대상 프로필** (managed) | ✗ | 보호자가 대신 기록. 성장·수유·수면·예방접종 기록의 대상. 계정 없음 |
| 2 | **연동 계정** (linked) | ○ | 아이가 자기 계정으로 로그인. 보호자는 여전히 조회·응원 가능 |
| 3 | **독립 계정** (independent) | ○ | 성인. 보호자 열람 권한 해제, 일반 사용자와 동일 |

승격은 되돌릴 수 없으며, 2→3 전환 시 보호자의 열람 범위를 아이가 직접 통제합니다.

### 관계 유형

```
RelationType
├── COUPLE          기존 — 2인 고정. 기념일·오늘의질문·반반정산
├── TRAINER_MEMBER  기존 — 트레이너 1 : 회원 N (관계를 N개 생성)
└── FAMILY          신규 — N인. 보호자(GUARDIAN) + 아이(CHILD)
```

`FAMILY` 관계는 멤버 수 상한이 없고, 각 멤버는 `member_role`(`GUARDIAN` / `CHILD`)을 가집니다.
`GUARDIAN`만 아이 프로필을 생성·수정하고 가족 설정을 변경할 수 있습니다.

### 아이 기능 (구상)

| 영역 | 내용 |
| --- | --- |
| **성장 기록** | 키·몸무게·머리둘레 기록 + 표준 성장곡선(백분위) 대비 그래프 |
| **식사 기록** | 수유(모유/분유·양)·이유식·간식. 기존 `meals` 구조 재사용 |
| **수면 기록** | 취침/기상 시각, 낮잠 횟수, 총 수면시간 추이 |
| **예방접종** | 국가 표준 접종 일정 기반 체크리스트 + 접종일 D-day 알림 |
| **함께 운동** | 아이와 함께한 활동(산책·놀이터·자전거)을 가족 스트릭에 반영 |
| **가족 피드** | 기존 피드에 아이 태그. 커플 전용 게시물과 가족 공개 게시물 분리 |
| **가족 여행** | 인원수 기반 경비 정산(반반 → N분할), 아이 준비물 체크리스트 프리셋 |
| **성장 앨범** | 월령별 사진 자동 그룹핑, 1년 회고 카드 |

### 집계 규칙 — "함께"의 정의

커플에서 "함께"는 **두 사람 모두**를 뜻했지만, 패밀리에서는 재정의가 필요합니다.

- **가족 스트릭**: 보호자 **전원** 달성 시 인정 (아이는 집계에서 제외 — 강박 방지)
- **아이 활동**: 별도 트랙으로 기록하되 스트릭에 부담을 주지 않음
- **경비 정산**: 아이는 **분할 대상에서 제외**, 보호자끼리 N분할

> ⚠️ **아동 데이터 취급**: 아이 프로필은 미성년자 개인정보에 해당합니다.
> 보호자 동의 절차, 최소 수집 원칙, 계정 승격 시 데이터 이관·삭제 정책이
> 구현 전에 확정되어야 합니다. 국내 개인정보보호법 및 스토어 아동 정책(COPPA 등) 검토 필요.

### 색상 체계 확장

현재 Duo Color System(나=Coral·상대=Indigo·함께=Violet)은 참가자 2인에 고정되어 있습니다.
패밀리에서는 **인덱스 기반 팔레트**로 확장하되, 커플 화면에서는 기존 Coral/Indigo가
그대로 배정되도록 하위 호환을 유지합니다.

`colorForUser(userId)` 같은 헬퍼가 코드베이스에 없고, 모든 색이 `colors.me` / `colors.partner`
리터럴이나 `mine ? … : …` 삼항으로 정해집니다. 브랜드 자체도 2인 전제입니다 —
로고(`DoublyLogo.tsx`)가 원 2개 겹침이고, 앱 이름이 "Doubly", 슬로건이 "둘이라서, 두 배로"입니다.
**패밀리는 기술 리팩터링이 아니라 브랜드 결정을 포함합니다.**

### 착수 시 주의사항

> 이 절은 커플 기반 코드를 N인으로 넓힐 때 **실제로 발목을 잡는 지점**을 모아둔 것입니다.
> 위 설계안을 쓴 이후 관계 주변 코드가 여러 차례 바뀌었으므로, 착수 전 반드시 확인하세요.

**1. 2인 가정이 모이는 3개 지점**

| 위치 | 문제 |
| --- | --- |
| `relations.user_a_id` / `user_b_id` | 3번째 멤버가 들어갈 자리가 물리적으로 없음 |
| `Relation.partnerOf()` | "상대방"이 1명이라는 전제로 스칼라 반환 |
| `relationStore.couple` (프론트) | 활성 커플 1개만 담는 단일 객체 |

`Relation.connect(userBId)` 도 **비어있는 B 슬롯을 채우는** 방식이라, 두 번째 사람이 들어오면
첫 번째를 덮어씁니다.

**2. `relation_members` 조인 테이블로 바꾸면 함께 고쳐야 하는 곳**

관계를 N인으로 넓히면 아래가 전부 깨집니다. 모두 `user_a_id` / `user_b_id` 를 직접 참조합니다.

| 파일 | 역할 | 왜 깨지나 |
| --- | --- | --- |
| `auth/service/UserDataPurger.java` | 탈퇴 시 정리 | 관계 조회가 A/B 컬럼 기준 |
| `relation/service/RelationRecordPurger.java` | 기록 완전 삭제 | 관계 단위 삭제 — 멤버 수와 무관하나 호출부가 2인 전제 |
| `relation/service/RelationRecordRestorer.java` | 기록 불러오기 | 동일 |
| `RelationRepository.findEndedCoupleBetween` | 재회 판별 | `(A=x and B=y) or (A=y and B=x)` 양방향 매칭 |
| `relations.restore_requested_by` | 불러오기 동의 | **"다른 사람이 요청하면 실행"이 2인에서만 성립.** N인은 전원 동의 판별이 필요해 컬럼 하나로는 불가 |

**3. 조회 스코프가 "활성 관계 1개" 전제**

`activeCouple(userId)` 패턴이 8개 서비스에 복제돼 있고 모두 `findFirst()` 로 **여러 관계 중
하나를 조용히 고릅니다**. 한 사용자가 커플과 패밀리에 동시 소속되면 여기서부터 어긋납니다.
관계 목록 반환 또는 명시적 `relationId` 파라미터로 바꿔야 합니다.

**4. 재설계가 필요한 집계 로직 (치환으로 해결 안 됨)**

여행 경비 정산(`TripExpenseService.settlement` 의 `divide(2)`), 커플 스트릭(2인 AND),
식단 목표(두 집합 `retainAll`), 챌린지(`ME|PARTNER|TIE`), 주간 결산(my/partner/both 3열),
오늘의 질문(`bothAnswered`), 채팅 읽음(`senderId <> 나 = 읽음`) — 산술 자체가 2인에 묶여 있습니다.

**5. 스키마 제약**

- `streaks` 의 `UNIQUE (relation_id, streak_type)` 는 그룹 내 개인 스트릭을 표현할 수 없고,
  `UNIQUE (user_id, streak_type)` 는 개인 스트릭이 관계 스코프가 아니라 **전역**이라
  한 사용자가 여러 그룹에 속하면 즉시 깨집니다
- `relations` 참조 FK 가 두 갈래 이름(`relation_id` / `couple_id`)으로 9개 테이블에 흩어져 있습니다
- `chat_messages.is_read` 가 단일 boolean 이라 N명 읽음 상태를 담을 수 없습니다
  (`chat_message_reads` 테이블 필요)

**6. 마이그레이션 작성 시**

테스트가 운영과 동일한 Flyway 마이그레이션을 H2 에 적용하므로
(→ [테스트 스키마](#테스트-스키마)), **H2 에서 동작하는 구문만** 사용해야 합니다.
`relation_members` 도입 시 기존 `user_a_id` / `user_b_id` 에서 backfill 한 뒤 컬럼을 제거하세요.

## 개발 로드맵 (설계서 6.3 + 확장)

| 단계 | 내용 | 상태 |
| --- | --- | --- |
| 1단계 | Expo + Spring Boot 세팅, DB 구성, 공통 구조 | ✅ 완료 |
| 2단계 | 인증(이메일·JWT) + 커플 연결 (relations 기반) | ✅ 완료 |
| 3단계 | 운동 기록, 히스토리, 캘린더 | ✅ 완료 |
| 4단계 | 실시간 채팅(STOMP), 알림 추상화 | ✅ 완료 |
| 5단계 | 스트릭(개인·커플), 홈 화면 완성 | ✅ 완료 |
| 6~7단계 | 트레이너 등록·대시보드·루틴 배정 | ✅ 완료 (결제만 출시 후) |
| 확장 | 식단 기록 + AI 칼로리 분석 + 커플 목표 | ✅ 완료 |
| 확장 | 커플 맛집 지도 (카카오맵) — PLAN.md Place Map | ✅ 완료 |
| 확장 | 커플 일상 피드 (통합 타임라인) — PLAN.md Couple Feed | ✅ 완료 |
| 확장 | 커플 여행 (장소 그룹핑·D-day) — PLAN.md Trip | ✅ 완료 |
| 확장 | 커플 여행 일자별 일정표 (Trip Itinerary) — PLAN.md | ✅ 완료 |
| 확장 | AI 여행 일정 생성 (Gemini — Day 바이 Day) — PLAN.md | ✅ 완료 |
| 확장 | 커플 여행 경비 정산 (반반 정산) — PLAN.md | ✅ 완료 |
| 확장 | 커플 여행 준비물 체크리스트 — PLAN.md | ✅ 완료 |
| 확장 | 커플 여행 앨범 (피드 연동) — PLAN.md | ✅ 완료 |
| 확장 | 커플 여행 회고 카드 (집계 요약) — PLAN.md | ✅ 완료 |
| 출시 준비 | Cloudinary 서명 업로드, Redis 카운터, 테스트 보강 | ✅ 완료 |
| 확장 | 카카오 플레이스 검색 (장소 추가 자동 입력) | ✅ 완료 |
| 출시 준비 | 비밀번호 재설정(이메일 인증코드) + 비밀번호 변경 | ✅ 완료 |
| 출시 준비 | 약관·개인정보 동의(가입 시 필수 동의·버전 관리) | ✅ 완료 (본문은 초안) |
| 출시 준비 | 에러 바운더리 + 전역 예외 수집 | ✅ 완료 (리포팅 도구 연동은 예정) |
| 버그 수정 | 회원 탈퇴 FK 위반 — 커플 콘텐츠 미정리로 탈퇴 실패 | ✅ 완료 |
| 테스트 | 테스트에 Flyway 적용 (운영과 동일 스키마 검증) | ✅ 완료 |
| 출시 후 | 트레이너 결제, 소셜 로그인 | 예정 |
| 패밀리(보류) | 관계 모델 N인 확장 (`relation_members` 조인 테이블) | ⏸ 보류 |
| 패밀리(보류) | 아이 프로필 (관리 대상 → 연동 계정 승격) | ⏸ 보류 |
| 패밀리(보류) | 성장 기록 (키·몸무게·성장곡선 백분위) | ⏸ 보류 |
| 패밀리(보류) | 수유·이유식·수면 기록 | ⏸ 보류 |
| 패밀리(보류) | 예방접종 체크리스트 + D-day 알림 | ⏸ 보류 |
| 패밀리(보류) | 가족 스트릭 · 가족 피드 (커플 전용 게시물 분리) | ⏸ 보류 |
| 패밀리(보류) | 가족 여행 (N분할 정산, 아이 준비물 프리셋) | ⏸ 보류 |
| 패밀리(보류) | 성장 앨범 (월령별 그룹핑, 1년 회고) | ⏸ 보류 |

## 실행 방법

전체 단계는 **[docs/RUNNING.md](docs/RUNNING.md)** 참고. 요약:

```bash
# 1) 인프라 (PostgreSQL + Redis)
docker compose up -d

# 2) 백엔드 (스키마는 Flyway 자동 생성)
cd backend && ./gradlew bootRun
#   확인: curl http://localhost:8080/api/v1/health

# 3) 프론트엔드
cd frontend && npm install && npm start   # a: Android, i: iOS, w: Web
```

- 백엔드 환경변수: `backend/.env.example` 참고 (`DB_*`, `REDIS_*`, `JWT_SECRET`, `GEMINI_*`, `CLOUDINARY_*`, `MAIL_*`)
- 비밀번호 재설정 메일: `MAIL_HOST` 미설정 시 인증코드가 **서버 로그로 출력**됩니다(개발 전용).
  운영 배포 전 `MAIL_*` 설정이 필요합니다 — 미설정 상태로 두면 로그 열람자가 임의 계정의
  비밀번호를 재설정할 수 있습니다.

### ⚠️ 약관 본문 — 출시 전 필수 작업

`frontend/src/constants/legal.ts` 의 이용약관·개인정보처리방침은 **초안 골격**입니다.
`[[운영 주체가 입력]]` 자리 표시자(사업자 정보·연락처·보유기간·인프라 수탁사)를 실제 값으로
채우고 **법률 검토를 받은 뒤** 배포해야 합니다.

약관을 개정할 때는 **두 곳의 버전을 함께** 올려야 기존 사용자에게 재동의를 받을 수 있습니다.

| 위치 | 상수 |
| --- | --- |
| `frontend/src/constants/legal.ts` | `TERMS_VERSION` / `PRIVACY_VERSION` |
| `backend/.../common/policy/PolicyVersion.java` | `TERMS` / `PRIVACY` |

**재동의 게이트**: 버전이 올라가면(또는 V23 이전 가입자처럼 동의 이력이 `NULL` 이면)
`GET /auth/me` 의 `requiresConsent` 가 `true` 로 내려오고, 앱은 메인 대신
재동의 화면(`ConsentGateScreen`)을 띄워 동의(`PUT /auth/me/consent`) 전까지 진입을 막습니다.

### 테스트 스키마

테스트는 **운영과 동일한 Flyway 마이그레이션**을 H2(PostgreSQL 모드)에 적용하고,
`ddl-auto: validate` 로 엔티티↔스키마 불일치까지 검증합니다.

이전에는 Flyway 를 끄고 `ddl-auto: create-drop` 을 썼는데, 엔티티가 `@ManyToOne` 대신
평범한 `Long` 컬럼을 쓰는 구조라 **Hibernate 가 외래키를 생성하지 않았습니다.**
그 결과 테스트 스키마에는 FK 가 하나도 없어, 운영에서만 터지는 FK 위반을 테스트가
원천적으로 잡을 수 없었습니다 — 실제로 회원 탈퇴가 그렇게 깨져 있었습니다.

새 마이그레이션을 추가할 때는 **H2 에서도 동작하는 구문**을 써야 합니다
(`JSONB`, 부분 인덱스, `ON CONFLICT` 등은 사용 불가).

### 계정 삭제

`users` / `relations` 를 참조하는 외래키가 20개가 넘습니다. 삭제 순서와 대상은
`auth/service/UserDataPurger.java` 한 곳에 모여 있으니, **테이블을 추가하면 여기도
함께 갱신**해야 합니다. 하나라도 빠지면 탈퇴 전체가 FK 위반으로 실패합니다.

> ⚠️ **한쪽이 탈퇴하면 커플 공동 기록(맛집·피드·여행)이 양쪽 모두에서 삭제됩니다.**
> `couple_id` 가 `NOT NULL` 이라 관계 없이는 존재할 수 없기 때문입니다.
> 상대의 개인 기록(운동·식단·체중)은 보존되며 관계 참조만 끊깁니다.

### 지난 기록 — 숨김 · 삭제 · 불러오기

연결을 끊어도 기록은 **삭제되지 않고 보이지 않는 상태**로 남습니다
(모든 커플 콘텐츠 조회가 `ACTIVE` 관계 기준이기 때문). 재회 시 불러오기 위한 설계입니다.

| 동작 | 상태 |
| --- | --- |
| 연결 끊기 → 기록 숨김 | ✅ 동작 중 |
| 지난 기록 완전 삭제 (`DELETE /relations/{id}/records`) | ✅ 완료 |
| 재연결 후 불러오기 (`POST /relations/couple/records/restore`) | ✅ 완료 |

**불러오기 규칙 (REL-07)**
- 재연결하면 **새 관계**가 생기고 기본값은 빈 상태입니다. 재연결에 동의한 것과
  옛 기록을 다시 보는 데 동의한 것은 다르므로, 자동 복원하지 않습니다
- **양쪽이 모두 요청해야** 복원됩니다. 첫 요청은 `WAITING_PARTNER` 로 접수만 되고,
  같은 사람이 두 번 눌러도 실행되지 않습니다 (`relations.restore_requested_by`)
- 행을 복사하지 않고 `couple_id` 참조만 새 관계로 옮기므로 사진·메시지 원본은 그대로입니다
- **커플 스트릭은 복원하지 않습니다.** 헤어져 있던 기간만큼 실제로 끊겼으므로,
  그대로 가져오면 공백을 건너뛴 가짜 연속 기록이 됩니다 (개인 스트릭은 영향 없음)
- 기념일·배경은 새 관계에 값이 없을 때만 승계합니다
- 다른 사람과 재연결한 경우 이전 상대와의 기록은 대상이 아닙니다

**완전 삭제 규칙**
- 연결을 끊은 관계에만 가능 (활성 관계는 `409 RELATION_STILL_ACTIVE`)
- **한쪽이 지우면 양쪽 모두에서 사라지고 되돌릴 수 없습니다.** 개인정보 삭제 요구를
  상대 동의에 묶을 수 없어 단독 삭제를 허용하되, 앱에서 2단계로 확인받습니다
- Cloudinary 이미지까지 삭제하며, **트랜잭션 커밋 이후**에 지웁니다
  (트랜잭션 안에서 지우면 롤백 시 파일만 사라진 상태가 됩니다)

> ⚠️ **Cloudinary 미설정 시 이미지가 남습니다.** `fitto.cloudinary.*` 가 비어 있으면
> DB 행만 지워지고 이미지 URL 은 계속 살아있어 "완전 삭제"가 되지 않습니다.
> 삭제하지 못한 건수는 경고 로그로 남습니다.

### 에러 처리

| 파일 | 역할 |
| --- | --- |
| `src/components/ErrorBoundary.tsx` | 렌더 예외를 잡아 화이트스크린 대신 복구 화면 표시 |
| `src/utils/globalErrorHandler.ts` | 바운더리가 못 잡는 예외(이벤트 핸들러·비동기·Promise 거부) 수집 |
| `src/utils/errorReporter.ts` | 리포팅 seam — 현재는 콘솔 출력 |

**Sentry 연동 완료** — `src/utils/sentry.ts` 가 seam 에 구현을 주입합니다.
호출부(ErrorBoundary·전역 핸들러)는 Sentry 를 모르므로 교체·제거가 쉽습니다.

| 항목 | 설정 |
| --- | --- |
| 패키지 | `@sentry/react-native` ~7.11 (`expo install` 이 고른 SDK 56 호환 버전) |
| 활성 조건 | **네이티브 + 배포 빌드에서만** (`enabled: !__DEV__`) |
| PII | `sendDefaultPii: false` + `beforeSend` 에서 `user`·쿠키·헤더 제거 |

> ⚠️ **웹 PWA 는 수집되지 않습니다.** `@sentry/react-native` 는 Expo Web 을 공식
> 지원하지 않아 웹에서는 초기화를 건너뛰고 콘솔 폴백을 씁니다.
> 웹까지 수집하려면 `@sentry/browser` 를 별도로 붙여야 합니다.

> ⚠️ **소스맵 업로드는 미설정입니다.** 현재는 오류가 수집되지만 스택트레이스가
> 난독화된 상태로 보입니다. 읽을 수 있게 하려면 EAS 빌드에 `SENTRY_AUTH_TOKEN` 과
> `app.json` 플러그인 옵션(`organization`·`project`)이 필요합니다.

**개인정보처리방침**: Sentry 는 처리 위탁 대상이므로 `legal.ts` 위탁 목록에 추가했고,
`PRIVACY_VERSION` 을 1.1 로 올렸습니다(백엔드 `PolicyVersion.PRIVACY` 와 동기화).
- 앱 API 주소: `frontend/src/constants/config.ts` (iOS/웹=localhost, Android 에뮬=10.0.2.2, 실기기=PC LAN IP)
- 커플·채팅 기능 확인에는 계정 2개가 필요합니다.

### 웹 배포 (빠른 공유 — PWA)

`npm run build:web` → `frontend/dist/` 정적 빌드 → Netlify/Vercel 등에 배포하면
폰 브라우저에서 URL로 바로 사용(앱스토어 불필요). 단계는 **[docs/WEB_DEPLOY.md](docs/WEB_DEPLOY.md)**.

### 네이티브 앱 빌드 (EAS Build — 안드로이드 APK)

Expo 클라우드 빌드로 `.apk` 를 만들어 폰에 직접 설치(Play 스토어 불필요, QR/Expo Go 불필요).
단계는 **[docs/EAS_BUILD.md](docs/EAS_BUILD.md)**.

### 클라우드 배포 (Railway)

`DATABASE_URL`(URI)이 있으면 자동으로 클라우드 DB에 연결됩니다(없으면 로컬 설정 사용).
Railway 배포 단계는 **[docs/RAILWAY.md](docs/RAILWAY.md)** 참고 — 백엔드 서비스 Root Directory=`backend`,
변수 `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `SPRING_DATA_REDIS_URL=${{Redis.REDIS_URL}}`, `JWT_SECRET` 설정.

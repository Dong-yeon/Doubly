# 💑 Fitto

> 커플 운동·식단·일상·여행 공유 앱 + 트레이너 플랫폼 — 설계서 v2.0 기준

Fitto는 **관계(Relation) 기반 커플 라이프 공유 앱**입니다. 커플은 운동·식단·맛집·여행·일상을
함께 기록하며 서로를 응원하고, 트레이너는 여러 회원의 운동을 관리합니다.
모든 연결은 동일한 `relations` 구조 위에서 동작합니다.

## 기술 스택

| 구분 | 기술 |
| --- | --- |
| 모바일 | React Native + Expo (TypeScript) |
| 상태관리 | Zustand |
| 백엔드 | Spring Boot 3.4 (Java 21) |
| DB | PostgreSQL (Flyway 마이그레이션 V1~V10) |
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

DB 스키마는 `backend/src/main/resources/db/migration/` 의 Flyway 마이그레이션(V1~V10, 15개 테이블:
users / relations / trainer_profiles / workouts / workout_sets / trainer_routines / chat_messages /
streaks / device_tokens / meals / places / place_visits / feed_posts / feed_reactions / trips)에
정의되어 있습니다.

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
| 출시 준비 | Cloudinary 서명 업로드, Redis 카운터, 테스트 보강 | ✅ 완료 |
| 출시 후 | 트레이너 결제, 카카오 플레이스 검색, 소셜 로그인 | 예정 |

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

- 백엔드 환경변수: `backend/.env.example` 참고 (`DB_*`, `REDIS_*`, `JWT_SECRET`, `GEMINI_*`, `CLOUDINARY_*`)
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

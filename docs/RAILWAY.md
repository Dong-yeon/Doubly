# Railway 배포 가이드 (백엔드)

Railway에 **PostgreSQL**, **Redis** 플러그인을 이미 추가한 상태를 가정합니다.
백엔드는 `DATABASE_URL`(URI)을 JDBC로 변환해 연결하고, Redis는 `SPRING_DATA_REDIS_URL`로 연결합니다.

> 코드: `DATABASE_URL` 이 있으면 `DataSourceConfig` 가 이를 파싱해 DataSource 를 구성하고,
> 없으면(로컬) `application.yml` 의 `spring.datasource.*`(DB_HOST 등) 기본값으로 동작합니다.
> 두 경로 모두 실제 PostgreSQL 16 부팅 + Flyway 마이그레이션으로 검증되었습니다.

## 1. 백엔드 서비스 생성

1. Railway 프로젝트 → **New → GitHub Repo** → `Dong-yeon/fitto` 선택
2. 서비스 **Settings → Root Directory** 를 **`backend`** 로 지정 (모노레포이므로 필수)
3. 빌드: `backend/Dockerfile` 이 포함되어 있어 Railway 가 이를 사용합니다
   (railpack/Nixpacks 자동 감지 대신 Dockerfile 로 결정적 빌드).
   - Root Directory 가 `backend` 여야 이 Dockerfile 이 인식됩니다.
   - 빌드 실패 시 가장 흔한 원인은 Root Directory 미설정입니다.

## 2. 환경변수 설정 (백엔드 서비스 → Variables)

서비스 이름이 `Postgres`, `Redis` 라고 가정합니다(실제 이름에 맞게 바꾸세요).

| 변수 | 값 |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `SPRING_DATA_REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `JWT_SECRET` | **필수** — 32자 이상 무작위 값 (예: `openssl rand -hex 32`) |
| `CORS_ALLOWED_ORIGINS` | 웹 배포 도메인(쉼표 구분, 예: `https://fitto.netlify.app`). 웹 미배포 시 생략 가능 |

- **Dockerfile 이 `SPRING_PROFILES_ACTIVE=prod` 를 기본 설정**합니다. prod 프로파일에서는
  `JWT_SECRET` 이 없거나 약하면(32자 미만, 예시 값 포함) **부팅이 의도적으로 실패**합니다.
- `CORS_ALLOWED_ORIGINS` 가 비어 있으면 브라우저(웹)의 교차 출처 요청이 전부 차단됩니다.
  네이티브 앱(Expo/APK)은 CORS 대상이 아니므로 영향이 없습니다.
- `PORT` 는 Railway 가 자동 주입합니다(앱이 `${PORT}` 로 리스닝하도록 이미 설정됨).
- `${{서비스.변수}}` 는 Railway 의 변수 참조 문법입니다.
- DB 스키마는 **첫 기동 시 Flyway 가 자동 생성**합니다(수동 DDL 불필요).

## 3. 배포 확인

배포 후 서비스 **Settings → Networking → Generate Domain** 으로 공개 URL 생성:

```
https://<your-app>.up.railway.app/api/v1/health
→ {"success":true,"data":{"status":"UP",...}}
```

로그에 다음이 보이면 정상입니다:
```
Successfully applied 2 migrations to schema "public", now at version v2
Tomcat started on port ...
Started FittoApplication
```

## 4. 프론트엔드 연결

배포된 백엔드 URL 로 앱의 API 주소를 바꿉니다 — `frontend/src/constants/config.ts`:

```ts
export const API_BASE_URL = 'https://<your-app>.up.railway.app/api/v1';
export const WS_BASE_URL = 'wss://<your-app>.up.railway.app/ws/chat'; // TLS 이므로 wss
```

> 운영에서는 위 값을 하드코딩 대신 `app.json` 의 `extra` 또는 빌드 환경변수로 분리하는 것을 권장합니다.

## 트러블슈팅

| 증상 | 원인 / 해결 |
| --- | --- |
| 부팅 실패: `JWT_SECRET ... 반드시 설정` | prod 프로파일 안전장치 — Variables 에 32자 이상 무작위 `JWT_SECRET` 설정 |
| 웹 브라우저에서 API CORS 오류 | `CORS_ALLOWED_ORIGINS` 에 웹 배포 도메인 추가 (네이티브 앱은 무관) |
| 빌드 실패(루트에서 Gradle 못 찾음) | Root Directory 가 `backend` 인지 확인 |
| `DATABASE_URL 이 비어 있습니다` | 변수 참조 `${{Postgres.DATABASE_URL}}` 오타/서비스명 확인 |
| Redis 인증 오류 | `SPRING_DATA_REDIS_URL` 이 `${{Redis.REDIS_URL}}`(비밀번호 포함)인지 확인 |
| `validate failed` | 기존 DB 스키마 불일치 → 새 DB이거나, 마이그레이션 충돌 점검 |
| 앱에서 연결 안 됨 | 프론트의 `API_BASE_URL`/`WS_BASE_URL` 이 배포 도메인+`https/wss` 인지 확인 |

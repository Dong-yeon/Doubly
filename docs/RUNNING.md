# Doubly 로컬 실행 가이드

백엔드(Spring Boot) + 프론트엔드(Expo)를 로컬에서 실제로 구동하는 방법입니다.
(이 구성은 실제 PostgreSQL 16 + Redis 7 에서 부팅 및 핵심 API end-to-end 동작이 검증되었습니다.)

## 0. 사전 준비

| 도구 | 버전 |
| --- | --- |
| JDK | 21 |
| Node.js | 20+ (LTS) |
| Docker / Docker Compose | (인프라용, 선택) |
| Expo Go 앱 또는 Android/iOS 에뮬레이터 | 모바일 실행용 |

> 모바일 실기기로 테스트하려면 휴대폰에 **Expo Go** 앱을 설치하세요.

---

## 1. 인프라 (PostgreSQL + Redis)

저장소 루트에 `docker-compose.yml` 이 있습니다.

```bash
docker compose up -d        # postgres(5432) + redis(6379) 기동
docker compose ps           # 상태 확인 (healthy)
```

도커 없이 직접 설치한 PostgreSQL/Redis 를 써도 됩니다. DB/계정만 맞추면 됩니다.

```sql
CREATE USER fitto WITH PASSWORD 'fitto';
CREATE DATABASE fitto OWNER fitto;
```

> 스키마는 백엔드 기동 시 **Flyway 가 자동 생성**합니다 (`V1`, `V2`). 수동 DDL 불필요.

---

## 2. 백엔드 (Spring Boot)

```bash
cd backend
cp .env.example .env          # 필요 시 값 수정

# 환경변수를 셸에 로드 후 실행 (macOS/Linux)
export $(grep -v '^#' .env | xargs)
./gradlew bootRun
```

기동 확인:

```bash
curl http://localhost:8080/api/v1/health
# {"success":true,"data":{"status":"UP","service":"fitto"},...}
```

- 기본 포트: **8080**
- 환경변수 미설정 시 기본값(localhost DB/Redis, dev JWT 시크릿)으로 동작합니다.
- 운영 배포 시에는 `JWT_SECRET` 을 반드시 안전한 값으로 설정하세요 (prod 프로파일에서 dev 시크릿이면 기동이 차단됩니다).

### 테스트 — H2 와 PostgreSQL 양쪽으로

```bash
cd backend
./gradlew test                                    # 기본: H2 (빠름, 외부 인프라 불필요)
```

기본 테스트는 H2 를 쓰지만 **운영은 PostgreSQL** 입니다. 두 DB 는 SQL 해석이 달라
H2 에서 통과한 쿼리가 운영에서만 터지는 경우가 있습니다.
(실제로 피드 타임라인이 그렇게 500 을 냈습니다 — `:param is null` 을 PostgreSQL 이
`could not determine data type of parameter` 로 거절합니다.)

쿼리를 건드렸다면 릴리스 전에 PostgreSQL 로도 한 번 돌리세요.

```bash
docker run --rm -d -p 55432:5432 -e POSTGRES_USER=doubly \
  -e POSTGRES_PASSWORD=doubly -e POSTGRES_DB=doubly_test --name doubly-pg postgres:16

./gradlew test \
  -Dspring.datasource.url=jdbc:postgresql://127.0.0.1:55432/doubly_test \
  -Dspring.datasource.driver-class-name=org.postgresql.Driver \
  -Dspring.datasource.username=doubly \
  -Dspring.datasource.password=doubly \
  -Dspring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect

docker rm -f doubly-pg
```

> `build.gradle` 이 `-Dspring.*` 시스템 프로퍼티를 테스트 JVM 으로 넘겨주므로
> 테스트 설정 파일을 고치지 않고도 데이터소스만 바꿔 끼울 수 있습니다.

### 빠른 스모크 테스트 (선택)

```bash
B=http://localhost:8080/api/v1
# 회원가입 → accessToken 획득
curl -s -X POST $B/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"me@fitto.com","password":"password123","name":"나"}'
```

---

## 3. 프론트엔드 (Expo)

```bash
cd frontend
npm install
npm start                     # Expo 개발 서버 (Metro)
```

Metro 화면에서:
- **a** → Android 에뮬레이터 / **i** → iOS 시뮬레이터 / **w** → 웹
- 또는 터미널의 QR 코드를 **Expo Go** 앱으로 스캔 (실기기)

### API 주소 설정 (중요)

`src/constants/config.ts` 가 플랫폼별로 백엔드 주소를 자동 설정합니다:

| 실행 환경 | 백엔드 호스트 | 비고 |
| --- | --- | --- |
| iOS 시뮬레이터 / 웹 | `localhost:8080` | 자동 |
| Android 에뮬레이터 | `10.0.2.2:8080` | 자동 (에뮬레이터→호스트) |
| **실기기 (Expo Go)** | **PC의 LAN IP** | 수동 설정 필요 |

실기기로 테스트할 때는 PC와 폰이 같은 Wi‑Fi 에 있어야 하며,
`config.ts` 의 `LOCAL_HOST` 를 PC의 LAN IP(예: `192.168.0.10`)로 바꾸세요.
(WebSocket `WS_BASE_URL` 도 동일 호스트를 따릅니다.)

---

## 4. 동작 확인 흐름

1. 회원가입 → 자동 로그인 → 홈 진입
2. 홈 **커플 연결하기** → 초대코드 생성 (다른 계정으로 그 코드 입력 → 연결)
3. **운동** 탭 → ＋ 기록 → 세트 입력 후 완료 → 홈 스트릭 🔥 증가
4. **채팅** 탭 → 커플 방 입장 → 실시간 메시지 송수신
5. **MY** 탭 → 로그아웃 / 탈퇴

> 채팅(WebSocket)·커플 기능을 보려면 계정 2개가 필요합니다.
> 두 번째 기기/시뮬레이터 또는 웹+모바일 조합으로 동시에 로그인해 테스트하세요.

---

## 5. 트러블슈팅

| 증상 | 원인 / 해결 |
| --- | --- |
| 백엔드 기동 시 `Connection refused` | PostgreSQL/Redis 미기동 → `docker compose up -d` |
| `Flyway ... validate failed` | 기존 DB 스키마 충돌 → 개발 DB 초기화 `docker compose down -v` 후 재기동 |
| 앱에서 네트워크 오류 | API 호스트 불일치 → 위 "API 주소 설정" 표 확인 (특히 실기기 LAN IP) |
| 채팅이 실시간 안 됨 | 실기기에서 `ws://` 주소가 PC LAN IP 인지 확인 / 방화벽 8080 허용 |
| Android 에뮬레이터 연결 안 됨 | `10.0.2.2` 자동 적용됨 — 백엔드가 호스트 8080 에 떠 있는지 확인 |

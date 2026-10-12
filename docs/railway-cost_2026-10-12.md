# Railway 비용 — 어디서 나오고 어떻게 줄이나 (2026-10-12)

## 실측 (railway usage · metrics)

| 결제 기간 | 사용액 |
|---|---|
| 07-28 ~ 08-28 | **$88.47** (사용자가 기억하는 "10만원") |
| 08-28 ~ 09-28 | $46.63 |
| 09-28 ~ 10-28 | 10-12 기준 $8.03, 예상 $13.97 — **하드 리밋 $10**(넘으면 서비스 정지), 소프트 $5 |

- 이번 기간 $8.03 중 **메모리 $7.87(98%)**, CPU $0.13, 나머지 거의 0. 메모리 단가 $0.000231/GB·분 ≈ 1GB 를 하루 켜 두면 $0.33, 한 달 $10.
- 서비스별 메모리(최근 7일): Doubly-Back **2.71GB**, Doubly-Spike 671MB, Postgres 100MB, Postgres-8osF 59MB, Redis 6MB.
- 원인: `backend/Dockerfile` 이 `java -jar` 그대로 — 힙 상한이 없어 JVM 이 컨테이너가 보여주는 8GB 의 1/4 까지 키우고 돌려주지 않는다.
  배포 때는 옛·새 인스턴스가 겹쳐 10GB 가까이 튄다.
- Doubly-Spike(+Postgres-8osF)는 통화 실험(8/25) 서버 — 통화는 9/28 앱에서 제거됐는데 계속 켜져 있고 푸시마다 재배포된다.

## 조치

1. **Doubly-Spike·Postgres-8osF 끄기** — 사용자가 대시보드에서(Settings → Source → Disconnect, Deployments → Remove).
   에이전트의 `railway down` 은 권한 분류기에 막혔다.
2. **JVM 메모리 상한** — `backend/Dockerfile` 에 `JAVA_TOOL_OPTIONS`(-Xmx384m, SerialGC, 메타스페이스·코드캐시·다이렉트 메모리 상한,
   OOM 이면 즉시 종료 → Railway 가 재시작). Railway 변수 `JAVA_TOOL_OPTIONS` 로 코드 배포 없이 덮어쓸 수 있다.
   **로컬 실측**(Docker 엔진이 안 떠서 테스트 프로파일 = H2 로 같은 상한을 걸고 실제 서버를 띄움): 기동 23초,
   가입·커플 연결 뒤 식단 저장 240건 + 조회 1,200건을 동시 40개로 몰아넣음 → OutOfMemoryError 0건
   (실패 175건은 전부 H2 커넥션 풀 대기 초과 — 동시 40 쓰기라는 인위적 부하 탓, 메모리와 무관).
   부하 뒤 살아 있는 데이터(tenured used) 105MB, 힙 committed 263MB / 상한 384MB, 메타스페이스 139MB / 192MB,
   JVM 전체 committed 544MB(NMT), 프로세스 RSS 631MB. → 운영 2.71GB 의 약 1/4. 여유가 있어 -Xmx256m 까지도 가능하지만 384 로 둔다.
   예상: Back ~0.6GB + Postgres 0.1GB ≈ 월 $7.
3. 한도는 $10 유지(사용자 결정). 남은 16일 예산 $1.97 → 평균 0.37GB 이하여야 해서, 1·2 를 해도 기간 말에 한도에 닿을 수 있다 — 닿으면 10/28 까지 서비스가 멈춘다.

## 더 싼 서버로 옮긴다면 (비교 — 미결정)

| 선택 | 월 비용 | 대가 |
|---|---|---|
| Railway + 위 조치 | ~$6~7 | 지금 그대로(배포·DB·백업 관리형) |
| Oracle Cloud Always Free (ARM VM) | $0 | 가입·리전 용량 문제가 잦고, 놀고 있는 무료 VM 은 회수될 수 있다. PostgreSQL·Redis·HTTPS·배포·백업을 직접 운영 |
| 소형 VPS(Hetzner·Vultr·Lightsail 등) | $4~6 | 위와 같은 직접 운영 부담, 대신 안정적 |
| Render 등 PaaS 무료 | $0 | 15분 무활동이면 잠든다 — 채팅 웹소켓·예약 작업(@Scheduled 알림)이 깨진다 |

이전 시 공통 작업: DB 덤프·복원, Redis, 환경변수, 앱의 서버 주소(`fitto-production…` — 앱 설정이라 OTA 필요, 옛 주소는 이전 기간 동안 살려 둬야 함),
CORS·도메인, 배포 파이프라인. 하루 이상 걸리고 장애 위험이 있다.

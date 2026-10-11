# Railway 배포 조건 — backend 변경만 배포 + 헬스체크 (2026-09-30)

## 왜
main 에 무엇을 푸시하든(문서·앱 화면) 백엔드가 재배포돼 30초가량 끊겼다. 같은 날 세 번 — 그중 한 번은
연쇄 퍼즐 결과 제출이 502 를 받았고, 채팅 전송이 재연결 대기에 걸렸다. 헬스체크도 없어서 새 서버가 뜨기 전에
옛 서버가 내려갔다(코드 주석은 "Railway 헬스체크는 /api/v1/health"라고 했지만 실제 설정은 비어 있었다).

## 설정 (서비스 `Doubly-Back`, production)
| 항목 | 값 |
| --- | --- |
| Watch paths | `/backend/**` — Root Directory 가 `backend` 여도 **패턴은 저장소 루트 기준**이다(Railway 문서) |
| Healthcheck path | `/api/v1/health` — 얕은 헬스체크. `/actuator/health` 는 DB·Redis 까지 봐서 Redis 가 잠깐 흔들려도 재시작되므로 쓰지 않는다(application.yml 주석) |
| Healthcheck timeout | 180초 — Spring 기동이 30초 안팎 |

적용 확인: 프론트만 바꾼 푸시(`120682d7`)의 배포가 `SKIPPED`.

## 어떻게 바꿨나 (다시 바꿀 때)
`railway environment edit --service-config ... build.watchPatterns ...` 는 이 값을 "No changes to apply" 로 무시했다.
Railway GraphQL `serviceInstanceUpdate(serviceId, environmentId, input: { watchPatterns, healthcheckPath, healthcheckTimeout })`
로 설정했다(토큰은 로그인한 CLI 의 `~/.railway/config.json` → `user.accessToken`). Git Bash 에서는 `/` 로 시작하는 값이
Windows 경로로 바뀌므로 `MSYS_NO_PATHCONV=1`.

## 주의
- `backend/` 밖의 파일(루트 `Dockerfile`·`src/`)은 이 서비스 빌드에 안 쓰인다 — Root Directory 가 `backend`.
- `Doubly-Spike` 서비스(Root Directory `/backend`)는 건드리지 않았다 — 여전히 모든 푸시에 배포된다. 쓰지 않는 서비스면 정리 대상.

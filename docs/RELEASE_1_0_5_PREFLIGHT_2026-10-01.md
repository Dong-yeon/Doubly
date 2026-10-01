# 1.0.5 빌드 전 점검 (2026-10-01)

범위: 1.0.4 빌드 소스 `85868c57` → origin/main `05e46c52` (커밋 112개, frontend/backend 약 9천 줄).
방법: 자동 검사 + 영역별 코드 리뷰 4갈래(채팅·스티커 / 인증·탈퇴·공지·내보내기 / 식단·홈·게임 / 빌드 준비).

## 자동 검사

| 항목 | 결과 |
|---|---|
| CI (백엔드 테스트·typecheck·build:web) | 최근 8회 모두 초록 |
| verify:* 8종 | 전부 통과 |
| lint | error 89건 — 거의 1.0.4 이전부터 있던 react-hooks 규칙(refs·set-state-in-effect). 변경 파일분 9건도 동작 버그 아님 |

## 블로커 (빌드·제출 전에 반드시)

1. **`frontend/app.json` version 1.0.4 → 1.0.5.** 자동 증가 안 된다. buildNumber/versionCode 는 EAS remote + autoIncrement 라 손대지 않는다.
   안 올리면 같은 versionName 으로 나가고, 나중에 `minAppVersion` 을 1.0.5 로 걸면 최신 빌드 사용자까지 잠긴다.
2. **landing 재배포.** 저장소의 `landing/` 은 9/30 판인데 운영(dubly.co.kr)은 그 전 판이다.
   - `/status.json` 404 → 공지·강제 업데이트가 원격으로 켜지지 않는다(앱은 404 를 "공지 없음"으로 처리하므로 크래시는 없음).
   - `/privacy` 가 아직 "시행일 2026-09-01, 탈퇴 시 지체 없이 파기". 서버는 이미 14일 유예(V110)로 돌고 앱 안 방침은 1.4 —
     **공개 방침과 실제 동작이 지금도 어긋나 있다.** 스토어 심사에서 방침 URL 을 본다.
3. 이번 빌드는 OTA 로 대체 불가(`expo-application` 직접 의존성 추가). 서버 이모티콘 팩·강제 업데이트가 여기서 처음 나간다.

## 고칠 것 (빌드 전 권장 — 전부 JS/백엔드라 OTA·서버 배포로도 가능하지만 이번 빌드에 실을 수 있음)

| # | 영역 | 내용 | 위치 |
|---|---|---|---|
| A | 채팅 | 카탈로그를 한 번 받은 뒤 새 서버 팩 코드가 오면 말풍선에 코드 글자("ANIMAL_XXX")가 찍히고 스스로 복구되지 않는다 — `RemoteAnimatedSticker` 의 강제 refresh 경로가 마운트 조건 때문에 죽어 있다. "앱 배포 없이 팩 추가"의 목적과 정면 충돌 | `ChatRoomScreen.tsx:1698` |
| B | 채팅 | 전송 버튼이 `onPressIn` 만 있어 TalkBack(접근성 탭은 onPress 만 호출)으로 전송 불가. `onPress` 병행 — `isDuplicateSend` 가 중복을 거른다 | `ChatRoomScreen.tsx:2361` |
| C | 내보내기 | 안드로이드에서 받다 끊긴 사진·음성이 `target.exists` 로 "받음" 처리 → 깨진 파일이 ZIP 에 | `recordExport.ts:332` |
| D | 내보내기 | 기록 시각이 9시간 이르게 찍힘 — 운영 JVM 은 UTC 인데 `plain()` 이 KST 로 가정 | `DataExportService.java:217` |
| E | 홈 | 홈→럽바디 링크 4곳이 DietMain 을 스택에 계속 쌓는다(맨 위일 때만 재사용). `pop: true` | `HomeScreen.tsx:826,840,957,1017` |
| F | 신체 정보 | 체중·체지방 범위 검증 없음 → NUMERIC overflow 500(키·성별만 반쯤 저장), 0kg 이면 BMR 엉터리, 체지방만 넣으면 저장 안 됐는데 "저장했어요" | `SaveBodyMetricRequest.java`, `MyScreen.tsx:162` |
| G | 게임 | 멈춘 판 리마인더에 하한 없음 → 몇 달 묵은 판마다 푸시가 한꺼번에. `updatedAt > now-7d` 하한 | `GameNudgeService.java:122` |
| H | 식단 | 바코드 한 번에 음식 두 번 추가 가능(state 잠금만 있음 → useRef 잠금) | `BarcodeScanScreen.tsx:70` |

## 결정 필요

- **1.0.4 사용자에게 서버 팩 이모티콘이 코드 글자로 보인다**(서버는 이미 운영 중). 1.0.4 코드는 못 고치므로
  (a) 1.0.5 보급 뒤 minAppVersion 올리기 (b) 출시 직후 한동안 서버 팩 감추기 (c) 감수 — 중 선택.
- Android `eas submit` 은 즉시 전체 출시(`releaseStatus: completed`). 내보내기·강제 업데이트·iOS 식단 수정이 실기기 미검증이라
  preview/내부 테스트 트랙으로 먼저 보는 것을 권한다.
- iOS 사진 저장 권한 문구(`app.json:81`)에 내보내기 용도가 없다 — 바꾸려면 이번 빌드 전에만 가능.

## minor (다음으로 미뤄도 됨)

- 탈퇴 스위퍼와 로그인 취소가 겹치면 취소한 계정이 지워질 수 있음(창 매우 좁음, 비관적 잠금으로 해결) — `AccountWithdrawalService.java:128`
- refresh 요청에 타임아웃 없음 → 서버가 응답 없이 붙잡으면 콜드 스타트 스피너가 끝나지 않음 — `client.ts`
- "서버에 연결하지 못했어요" 화면이 점검 중에도 "인터넷 확인"이라고 말함
- 큰 채팅 기록의 ZIP 묶기 메모리(`utf8()` 이 number[] 에 바이트마다 push) — `recordExport.ts:386,414`
- 찌르기 버튼이 네트워크 오류에도 "알렸어요"로 굳음, "내일 다시" 문구 vs 서버 24시간 롤링 — `GameNudgeButton.tsx:39`
- iOS 카메라 권한 영구 거부 시 설정 열기 버튼 없음(1.0.4부터) — `BarcodeScanScreen.tsx:148`
- 길막기에서 내가 접어도 "상대가 접었어요"가 뜰 수 있음(경합) — `WallRaceScreen.tsx:301`
- Open Food Facts 1회 제공량 판정이 열량 필드 하나에 의존 → 탄단지 빈칸
- 우리 이모지 배경 백필: 일시 실패가 영구 포기, 일부 실패는 같은 20장 무한 반복 — `CoupleEmojiCutoutBackfill.java`
- 스티커 상점에 서버 팩이 빈 아이콘·잘못된 개수로 표시, 오프라인 받기 전부 실패해도 "받음" 처리

## 문제없음으로 확인

강제 업데이트 버전 비교(숫자 비교, 웹·읽기 실패·형식 오류면 잠그지 않음), status.json 404/깨짐 → 공지 없음,
탈퇴 유예(로그인 시 취소·상대 알림·스위퍼 재확인), V108~V112 새 테이블 없음(Purger 변경 불요), 세션 수정(401/403 만 로그아웃, 무한 재시도 없음),
스티커 카탈로그 DTO 계약, 마이그레이션 PG 호환, BMR Katch-McArdle·NaN 없음, iOS 크로스탭 push, 권한 문구(카메라·사진 저장),
`USE_LOCAL_BACKEND=false`, `exp/sticker-trial` 미병합, 새 console/`__DEV__`/localhost 0건.

실기기에서만 볼 수 있는 것: 이미지 든 Lottie 3종(펭귄·토끼·코기), 내보내기 ZIP·갤러리 저장, 강제 업데이트 화면.

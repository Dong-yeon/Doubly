# iPhone 알림 침묵 조사 — 2026-09-10

> "아이폰에서 왜 여전히 알림이 안 올까?" 를 서버 → Expo → APNs → 기기 순으로 끝까지 따라간 기록.
> 9/8 의 발송 응답 로깅(`a893c6c`)으로도 답이 안 나온 이유와, 그 다음에 무엇을 고쳤는지.

## 1. 결론

| 단계 | 확인 방법 | 결과 |
|---|---|---|
| 서버 발송 경로 | `ChatService.notifyRecipient` → `ExpoPushNotificationService.send` | "온라인이면 건너뜀" 같은 조건 없음. 수신자 토큰 전부에 발송 |
| 수신자 설정 | `users.notifications_enabled / notify_chat / notify_partner` | user 1(iOS 토큰 주인) 전부 `true` |
| iOS 토큰 | `device_tokens WHERE platform='ios'` | 1건, user 1, **9/3 등록 뒤 갱신 없음** |
| Expo 접수 | 토큰으로 직접 `POST /push/send` | 티켓 `ok` |
| APNs 전달 | `POST /push/getReceipts` | 영수증 `ok` — APNs 키·빌드·토큰 모두 정상 |
| 기기 | (남은 유일한 단계) | **앱의 알림 권한이 "아직 안 물어봄"(undetermined) 상태로 추정** |

APNs 가 받아줬는데 기기에 안 뜨면 기기가 버린 것이고, 앱에는 그렇게 되는 경로가 있었다.

**근본 원인 — 재설치 뒤 권한 안내가 다시 뜨지 않는다.**
iOS 는 앱을 지우면 알림 권한을 "아직 안 물어봄"으로 되돌린다. 그런데 "권한 안내를 이미 봤다"는
플래그 `doubly.pushPrimed` 가 SecureStore(= iOS Keychain)에 있어 **앱을 지워도 남는다**(로그인 토큰이
재설치 뒤에도 살아 있는 것과 같은 이유). 그래서 재설치 뒤:

1. `PushPermissionPrimer` 는 플래그를 보고 안내를 건너뛴다.
2. `registerPushTokenIfGranted` 는 권한이 없으니 조용히 종료한다(빈 `catch`).
3. 설정 화면은 "거부됨"만 안내하고 undetermined 는 정상처럼 보여준다.
4. 서버에는 9/3 토큰이 남아 발송은 계속되고 APNs 도 받아주지만, 허용 안 된 앱의 알림은 iOS 가 소리 없이 버린다.

9/3 이후 iOS 빌드 17(9/9)·20(9/10)이 나갔는데 토큰이 한 번도 갱신되지 않은 점이 이 그림과 맞는다.
(테스트 알림이 기기에 떴는지는 세션 종료 시점까지 확인받지 못했다. 떴다면 위 추정이 틀린 것이므로
그때는 §4 의 진단 순서를 다시 탄다.)

## 2. 부수 발견 — "리프레시 토큰 재사용 감지 — 전체 세션 폐기: userId=5"

조사 중 유일하게 눈에 띈 운영 WARN. 푸시와 무관하지만 실제 피해가 있는 버그였다.

- 서버는 리프레시 토큰을 1회용으로 회전시키고, 이미 쓴 토큰이 다시 오면 무조건 탈취로 보고 **그 사용자의
  모든 기기 세션을 폐기**했다. 유예가 전혀 없었다.
- 클라이언트는 동시 갱신을 한 줄로 모으므로(`client.ts` `refreshPromise`) 같은 앱 안의 경쟁은 아니다.
  남는 경우는 **갱신 요청이 서버에 닿아 회전됐는데 응답이 못 돌아간 상황** — iOS 가 백그라운드 앱을
  그 사이에 죽이거나 네트워크가 끊기면 옛 토큰이 Keychain 에 남고, 다음 실행에서 그대로 다시 보낸다.
- 실제로 userId 5 는 19:09 전체 폐기 직후인 19:47 에 Android 토큰을 새로 등록했다 = 로그아웃됐다가
  다시 로그인한 흔적.

## 3. 고친 것

| # | 변경 | 파일 |
|---|---|---|
| 1 | `pushPrimed` 를 AsyncStorage 로 이동 — 앱과 함께 지워져 재설치 시 안내가 다시 뜬다. 기존 Keychain 플래그 사용자는 권한이 undetermined 일 때만 한 번 더 본다 | `frontend/src/components/PushPermissionPrimer.tsx` |
| 2 | 설정 화면에 "기기 알림 허용이 아직 안 됐어요" 행 — 누르면 권한창을 바로 띄우고 토큰 등록까지 | `frontend/src/screens/my/SettingsScreen.tsx` |
| 3 | 발송 성공 로그(`Expo push 접수 recipient= platforms=`) — 성공이 조용하면 "토큰 없음"과 "보냈음"이 구분되지 않는다 | `ExpoPushNotificationService.handleTickets` |
| 4 | **영수증 조회** — 티켓 `ok` 뒤 15분(`fitto.push.receipt-delay`) 후 `getReceipts`. `DeviceNotRegistered` 는 토큰 삭제, `InvalidCredentials` 등은 error 로그. iOS 키 문제는 티켓이 아니라 영수증에만 나온다 | `ExpoPushNotificationService.handleReceipts` |
| 5 | 리프레시 **응답 유실 복구** — 회전 시 "옛 jti → 새 jti" 계보를 기록하고, 옛 토큰이 다시 오면 새 토큰이 아직 안 쓰였을 때만 받아준다(새 토큰 폐기 후 재발급). 이미 쓰였으면 진짜 재사용이라 전체 폐기 유지. 시간 창이 아니라 계보 판정이라 며칠 뒤 다시 켜도 복구된다 | `RefreshTokenStore.consume/markRotated`, `AuthService.refresh` |

테스트: `RefreshTokenStoreTest`(Redis 모킹, 6건), `ExpoPushTicketTest` 에 영수증 계약·삭제 2건 추가.

## 4. 다음에 같은 리포트가 오면

1. Railway 로그에서 `Expo push` 를 검색한다. 이제 성공도 남으므로 **한 줄도 없으면 발송 자체가 안 된 것**
   (수신자 토큰 없음 / 알림 스위치 꺼짐 / 발송 경로 미호출).
   - `Expo push 접수` — Expo 가 받았다. 15분 뒤 `전달 실패(영수증)` 이 없으면 APNs/FCM 까지 갔다.
   - `Expo push 거절` / `전달 실패(영수증) reason=InvalidCredentials` — 키 문제. `eas credentials -p ios`.
   - `토큰 폐기` — 기기에 앱이 없다. 정상 정리.
2. 그래도 모호하면 서버를 건너뛰고 직접 쏜다.
   ```bash
   curl -H "Content-Type: application/json" -X POST https://exp.host/--/api/v2/push/send \
     -d '{"to":"ExponentPushToken[...]","title":"테스트","body":"직접 발송","sound":"default"}'
   curl -H "Content-Type: application/json" -X POST https://exp.host/--/api/v2/push/getReceipts \
     -d '{"ids":["<위 응답의 id>"]}'
   ```
   영수증 `ok` 인데 기기에 안 뜨면 **기기 설정**(iOS 설정 > 알림 > Dubly, 집중 모드)이다.
3. `device_tokens` 의 iOS 행 `created_at` 이 최근 빌드보다 오래됐으면 권한 undetermined 를 의심한다.

## 5. 남은 것

- `device_tokens` 가 38행(사용자 몇 명)까지 쌓여 있다. 같은 기기가 로그인할 때마다 새 토큰이 생기는 게
  아니라(토큰은 재할당된다) Android 가 토큰을 자주 바꾸는 것으로 보인다. 지금은 `DeviceNotRegistered`
  로만 정리되는데, 영수증 조회가 붙었으니 죽은 토큰은 이제 발송할 때마다 걸러진다. 오래된 행을
  주기적으로 지우는 배치는 필요하면 추가.
- 영수증 조회 예약은 프로세스 메모리에만 있어 재배포하면 사라진다. 부가 진단이라 감수했다.
- 9/8 `.easignore` 이슈(`423ccc6`)는 Android `android/` 폴더 문제였고 iOS 빌드와는 무관했다.

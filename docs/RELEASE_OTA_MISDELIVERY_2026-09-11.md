# OTA 업데이트 2건이 아무에게도 안 갔다 (2026-09-11)

커밋 이력에는 남지 않는 운영 사고라 따로 남긴다. `eas update` 는 **성공했는데 전달은 0명**일 수
있고, 그때 아무 에러도 나지 않는다.

## 1. 무엇이 잘못됐나

2026-09-11 오전, 스토어 배포 상태를 점검하다 발견했다.

- App Store 라이브 = **Dubly 1.0.1**, 릴리스 2026-09-10 16:27 KST.
  그 라이브 바이너리는 **iOS 빌드 17**(`23db1dc6`, 커밋 `519b933`, 9/9 14:42 빌드,
  fingerprint `3bf98efa…`)이다.
- 그런데 `production` 브랜치에 올라간 EAS Update 는 **전체 4건**이고, 그중 iOS 2건의 런타임이
  각각 `3de8d00b…`(빌드 20 — **제출한 적 없음**)와 `bb5af814…`(빌드 21 — **취소된 빌드**)였다.
- 즉 라이브 빌드의 런타임 `3bf98efa…` 를 대상으로 한 업데이트는 **0건**. iOS 사용자는 9/9 이후
  올린 것을 **하나도 받지 못했다**(9/9 → HEAD 사이 80커밋: 새 앱 아이콘, iPhone 알림 침묵 수정,
  곰돌이 이모티콘 10종, 우리 이모지 17종, 채팅 사진 스와이프 등).

업데이트 4건과 그 대상 빌드의 실제 운명:

| 올린 시각 | 플랫폼 | 런타임 | 그 런타임의 빌드 | 스토어에 있나 | 전달 |
|---|---|---|---|---|---|
| 9/11 ~09:30 | ios | `bb5af814` | 빌드 21 `be06d510` | **canceled** | ❌ 0명 |
| 9/11 ~09:30 | android | `be7589ce` | vc30 `303d1f70` | **canceled** | ❌ 0명 |
| 9/10 ~21:00 | ios | `3de8d00b` | 빌드 20 `6179c13a` | 빌드만 성공, **미제출** | ❌ 0명 |
| 9/10 ~21:00 | android | `66ab4890` | vc29 `f454e329` | 제출·출시됨 | ✅ 전달 |

Android 는 vc29 가 실제로 production 트랙에 올라가 있었던 덕에 4건 중 1건만 살았다. iOS 는 2건
모두 죽었다.

## 2. 원인

업데이트를 **"그 시점 HEAD"에서 올렸을 뿐, 그 커밋으로 만든 빌드가 스토어에 출시돼 있는지를
확인하지 않았다.** 런타임 버전 정책이 `fingerprint` 이므로 배달 조건은 "커밋이 최신인가"가 아니라
**"이 번들의 fingerprint 와 같은 fingerprint 로 만든 빌드를 사용자가 깔고 있는가"** 다.

빌드를 돌렸다가 취소하거나, 빌드는 성공했는데 제출을 안 하면 그 fingerprint 는 EAS 대시보드에서
**가장 최신처럼 보인다.** 실제로 사람이 깔고 있는 건 며칠 전 빌드인데도 그렇다. `eas update` 는
대상 빌드의 존재 여부를 검사하지 않으므로 그냥 성공한다.

`EAS_BUILD.md` §8-5 의 사고(9/10)와는 층위가 다르다. 그때는 **fingerprint 계산이 흔들린** 것이고,
이번엔 fingerprint 는 정확했고 **그 fingerprint 를 가진 빌드가 세상에 없었다.**

## 3. 규칙 — 업데이트 전에 "라이브 빌드의 fingerprint" 를 먼저 본다

```bash
# ① 스토어에 지금 뭐가 살아 있나
curl -s "https://itunes.apple.com/lookup?id=6807249370&country=kr" | grep -o '"version":"[^"]*"'
node scripts/check-play-track.mjs

# ② 그 버전에 해당하는 빌드의 Fingerprint 를 읽는다
cd frontend && npx eas-cli build:list --platform ios --limit 8 --non-interactive \
  | grep -E "^Build number|^Status|^Fingerprint|^Commit"

# ③ 올리려는 커밋의 fingerprint
npx expo-updates fingerprint:generate --platform ios

# ②와 ③이 같아야 배달된다. 다르면 그건 업데이트가 아니라 "빌드 + 제출" 작업이다.
```

올린 뒤 확인:

```bash
npx eas-cli update:list --branch production --limit 4 --non-interactive
# Runtime Version 이 ②에서 읽은 라이브 빌드의 Fingerprint 와 같은지 눈으로 본다
```

체크포인트 세 가지:

1. **빌드 목록에서 `canceled`·`errored` 를 런타임 기준으로 삼지 않는다.** 최신 줄이 아니라
   *제출이 `finished` 인* 빌드의 줄을 본다(`npx eas-cli status` 의 Submissions).
2. **제출까지 끝나야 그 fingerprint 가 "살아 있는 런타임"이 된다.** 빌드 성공 ≠ 배포.
3. 네이티브가 바뀐 커밋에서 올린 업데이트는 조용히 버려진다 — 경고가 없으니 위 확인을 사람이
   대신한다.

## 4. 이 건의 후속 조치

- iOS: 1.0.1 트레인이 이미 닫혀(`Invalid Pre-Release Train`) 빌드 22 제출이 4회 errored →
  버전을 **1.0.2** 로 올리고(`13a76bf`) 빌드 23(`9588868e`, fingerprint `714bbf46…`)을 만들었다.
  **이 빌드 제출이 유일한 복구 경로다. OTA 로는 못 메운다** — 라이브 빌드 17 을 대상으로 업데이트를
  올리려면 `519b933` 로 되돌아가서 올려야 하는데, 그 사이 변경에 네이티브(아이콘 등)가 섞여 있다.
- Android: production 트랙 vc31 `completed` 로 정상. vc31 에는 `049d7bd` 까지 다 들어 있다.
- 1.0.2 출시 후 첫 OTA 는 **빌드 23 과 같은 커밋(`13a76bf`, fingerprint `714bbf46…`)** 기준으로
  올린다. 워크트리에서 올리면 줄바꿈 차이로 또 어긋난다(§8-5 참고).

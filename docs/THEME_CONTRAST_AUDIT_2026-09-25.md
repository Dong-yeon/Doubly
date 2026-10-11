# 앱 팔레트 대비 전수 점검 (2026-09-25)

화면 점검(`SCREEN_DESIGN_PASS_2026-09-23.md`) 여덟 절마다 "다크는 미검증"이 쌓였다. 실기기 대신 **코드로
잴 수 있는 것**부터 잰다 — 라이트/다크 × 액센트 3종(그린·민트·피치) = 6벌 × 토큰 쌍 30 = 180쌍.
채팅 배경 테마는 이미 `verify-chat-theme-contrast.mjs` 가 보고 있었고, 이번에 앱 팔레트에도 같은 검증을
붙였다: `npm run verify:theme` (`frontend/scripts/verify-theme-contrast.mjs`). `theme/colors.ts` 를 고치면
돌린다(CLAUDE.md 6절).

## 결과 — 처음 30건 미달, 토큰 6개 조정 + 규칙 2개 정정 후 전부 통과

| 묶음 | 미달 | 원인 | 한 것 |
| --- | --- | --- | --- |
| 다크 `primary` 글자 (링크·선택 칩·soft 버튼) | 9건, 3.7~4.2 | 다크 `primary` 가 채움용 명도였다 — 글자로는 어둡다 | 세 액센트 모두 명도만 올림: 그린 `#3E8E6B→#459E77`, 민트 `#3D8F74→#439D80`, 피치 `#3D8F4B→#45A154`. surface 위 4.5 이상, 배경·`primaryBg` 위 5.0 |
| `danger` 글자 (탈퇴 행·입력 오류 — 27곳) | 6건, 라이트 3.91 · 다크 4.41 | 아이콘 겸 글자로 쓰는데 글자 기준에 못 미쳤다 | 라이트 `#E5484D→#E12D33`(4.54), 다크 `#F2555A→#F25A5F`(4.54) |
| `success` 글자 (배지 6곳) | 3건, 4.35 | 근소 미달 | 라이트 `#1F8A55→#1E8652`(4.58) |
| 소유자 글자 / 파스텔 웰 | 9건, 3.4~4.2 | **규칙이 틀렸다** — 파스텔 웰 위 글자는 실제로 ink 다(`ChatRoomScreen.tsx:2330` 주석이 이미 그 이유를 적어 뒀다) | 규칙을 실제 조합(ink / 파스텔)으로 고침. 팔레트는 그대로 |
| 주 버튼 채움 / 흰 카드 | 3건, 2.0~2.6 | 비텍스트 3.0 을 요구했는데, 글자가 버튼을 식별하므로 과한 기준 | "면으로 보이는가" 1.5 로 낮추고 이유를 규칙 옆에 적음 |

**조정 원칙**: 색상(hue)과 채도는 두고 명도만 목표 대비를 처음 넘기는 값까지 옮겼다(`colorsys` HLS 로 0.5%씩).
그래서 눈에 띄는 색 변화는 없고, 다크 primary 만 조금 밝아진 게 보일 수 있다.

## 같이 잡힌 것 둘 (코드 고침)

1. **오늘 넣은 버튼 아이콘 4개가 흰색이었다** — 럽바디·럽슐랭 하단 버튼의 `plus`, 체크인 카드의
   `calendar-check-outline`. `Button` 글자는 `onColor(primaryFill)`(라이트 그린에선 ink)인데 아이콘만
   `colors.white` 라 글자와 아이콘 색이 달랐고 흰 아이콘은 2.3 이었다. `onColor(colors.primaryFill)` 로.
2. **UpgradeSheet 의 결제 버튼**이 `primary` 채움 + 흰 글자였다 — 다크에서 3.3. 주 `Button` 과 같은
   규칙(`primaryFill` + `onColor`)으로. 결제 퍼널의 첫 버튼이라 먼저 고쳤다.

## 남은 것 — `backgroundColor: colors.primary` 39곳

`primary` 는 2026-09-23 부터 **글자용**이고 채움은 `primaryFill` 이다(`colors.ts` 주석). 그 전에 쓴 39곳이
아직 `primary` 를 채움으로 쓴다. 다크 `primary` 를 밝힌 지금 그 위의 **흰 글자는 3.3** 이다(검증 규칙
"onColor / primary" 는 통과한다 — onColor 가 ink 를 고르기 때문이고, 문제는 onColor 를 안 쓰고 white 를
박은 자리다). 파일별 수:

```
3 SudokuScreen · 2 WorkoutStatsScreen · 2 WorkoutScreen · 2 FeedCard · 2 DietStatsScreen · 2 ChatRoomScreen
1 씩: WorkoutRoutineListScreen, WorkoutRoutineGiftInboxScreen, WorkoutProgramDetailScreen, WorkoutCalendarScreen,
      ExerciseHistoryScreen, BodyMetricScreen, TripDetailScreen, PlaceScreen(courseNum), StickerShopScreen,
      PuyoScreen, MiniGamesScreen, CoupleCalendarScreen, FavoriteFoodGiftInboxScreen, DietScreen, DietRecordScreen,
      ChatScreen, MainTabNavigator, ActiveWorkoutBar, StickerPanel, VoiceRecordSheet, VoiceMessageBubble,
      LevelCard, ErrorBoundary, EmojiPicker
```

전부 기계적으로 `primaryFill` + `onColor` 로 바꿀 수 있지만, 진행 막대(`LevelCard.fill`)처럼 글자가 없는
채움은 바꿀 이유가 없고 탭바 인디케이터처럼 어두운 게 맞는 자리도 있다. **한 화면씩 보면서** 바꾼다 —
다음 디자인 패스의 항목. 우선순위는 흰 글자를 얹은 자리(EmojiPicker 탭, ErrorBoundary 버튼, VoiceRecordSheet
마이크, PlaceScreen courseNum).

## 검증

`verify:theme`·`verify:chat-theme`·typecheck·린트·웹 export 통과. **실기기·다크는 여전히 미검증**이지만
"숫자로 잡히는 것"은 이제 CI 에서 잡힌다 — 이 스크립트를 CI 에 넣으려면 `.github/workflows/ci.yml` 프론트
잡에 한 줄이면 된다(지금은 넣지 않았다: 다른 verify 스크립트도 CI 밖이라 규칙을 맞췄다).

# 색 교체 설계안 — 보는 사람 기준 (2026-10-05)

> **기준 커밋: `010ded8611a1a0c8dc688af6e4f7e901cdffeae9`** (origin/main). 현황은 `docs/color-current-state.md`(이하 **현황 문서**) 참고 — 절 번호를 그대로 인용한다.
>
> **상태: D1~D5 권장안으로 확정(2026-10-05). 1단계(main `76a775ac`)·2단계 완료, production OTA 배포(2026-10-05, 소스 `052c7965`, iOS 그룹 `133e10e9` · Android 그룹 `d153a8a5`). 실기기 확인 전.** 아래 §8·§9 참고.
>
> (작성 당시 상태: 설계안, 착수 전.) 코드 수정 없음. 아래 색 값은 전부 `scripts/verify-theme-contrast.mjs` 와 같은 식(WCAG 대비 · CIE76 ΔE)으로
> 미리 재 본 값이다. 결정이 필요한 곳은 **[결정 Dn]** 으로 표시했다.

## 0. 한 줄 요약

**나 = 코랄(아이콘 왼쪽 숟가락), 상대 = 하늘(오른쪽 숟가락), 함께 = 라벤더(둘을 섞은 색), 크롬(primary) = 잉크(무채색).**
판별 로직은 지금 그대로(서버 `mine`/클라 `myId` 비교 — 현황 3-2) 두고, **토큰 값을 바꾸기 전에 소유자 토큰을 다른 뜻으로 쓰던 자리를 먼저 떼어 낸다.**
서버·DB·네이티브 빌드 변경 없음 → EAS Update 로 배포 가능(fingerprint 확인 전제).

---

## 1. 원칙

1. **색의 뜻은 셋만 둔다 — 나 / 상대 / 함께.** 크롬(버튼·탭·링크·선택 상태)은 이 셋 어느 것과도 겹치지 않는다.
   지금 primary 와 partner 가 ΔE 3.1 로 같은 색인 문제(현황 6-3 ①)를 구조로 막는다.
2. **보는 사람 기준.** 내 폰에서 나는 항상 코랄이다. 같은 사람이 상대 폰에서는 하늘이다. 판별은 기존 그대로라 서버 작업이 없다.
3. **"선택됨"은 크롬, "누구 것"은 소유자 색.** 내가 누른 리액션·선택 칩은 primary, 내가 쓴 별점·내 말 말풍선은 me.
   (지금은 섞여 있다 — 현황 3-4 ④)
4. **소유자 토큰을 다른 뜻에 빌려 쓰지 않는다.** 캘린더 종류·요일·차트·성취·지도 핀은 자기 토큰을 갖는다(현황 6-1 C).
5. **값 교체와 의미 분리를 다른 커밋으로.** 1단계(의미 분리)는 화면이 거의 안 바뀌어야 하고, 2단계(값 교체)는 토큰 파일 위주여야 한다.
   그래야 2단계 화면 차이가 전부 "의도한 색 변화"로 읽힌다.

---

## 2. 새 팔레트

### 2-1. 소유자 색 (light / dark)

아이콘 색(`DoublyLogo.tsx:35` 코랄 `#F28472` = OKLCH h 30°, 하늘 `#62A8EC` = h 249°)에서 hue 를 따고, 역할별로 명도만 맞췄다.
함께는 두 hue 사이의 라벤더(h 305°).

| 키 | 나 (코랄) | 상대 (하늘) | 함께 (라벤더) |
| --- | --- | --- | --- |
| `me`/`partner`/`together` = `…Text` (글자·아이콘) | `#B94834` | `#2470B5` | `#815CA8` |
| `…Bg` (연한 웰, 그 위 …Text) | `#FFF3F0` | `#F0F7FE` | `#F8F3FF` |
| `…Fill` (아바타·완료 칩, 위에 ink) | `#FC7961` | `#53A5F5` | `#B78EE6` |
| `…PastelBg` (ink 전용 파스텔) | `#FFD5CC` | `#C9E3FE` | `#E8D7FE` |
| dark `…`/`…Text`/`…Fill` (파스텔) | `#FEC6BB` | `#B2D7FF` | `#E1C9FF` |
| dark `…Bg`/`…PastelBg` | `#3D241F` | `#1C2D3F` | `#30263B` |

실측(verify:theme 규칙과 같은 쌍):

| 규칙 | 나 | 상대 | 함께 | 기준 |
| --- | --- | --- | --- | --- |
| 글자 / surfaceAlt `#F1F2F0`(가장 어두운 라이트 바탕) | 4.63 | 4.61 | 4.64 | 4.5 |
| 글자 / 자기 웰 | 4.79 | 4.79 | 4.78 | 4.5 |
| ink / Fill | 6.52 | 6.54 | 6.50 | 4.5 |
| ink / PastelBg | 12.67 | 12.88 | 12.62 | 4.5 |
| dark 글자 / dark surfaceAlt `#31332D` | 8.53 | 8.56 | 8.53 | (현행 7.6~8.5) |
| dark 글자 / dark 웰 | 9.53 | 9.39 | 9.55 | 4.5 |

구분(ΔE, 10 이상이면 한눈에 다른 색):
나↔상대 **89.0** · 나↔함께 71.9 · 상대↔함께 29.7 · 나Fill↔상대Fill 97.0 · dark 나↔상대 42.5 ·
나 글자↔danger `#E12D33` **23.8** · 나Fill↔danger 25.4 · 왕관 `#B8860B`↔나 46.2 · success `#1E8652`↔상대 76.5.

> 나Fill `#FC7961` 은 아이콘 코랄 `#F28472`, 상대Fill `#53A5F5` 는 아이콘 하늘 `#62A8EC` 와 거의 같은 색이다 — 아바타·말풍선처럼
> 면이 큰 자리에서 아이콘과 같은 인상이 난다. 글자용은 대비 때문에 한 단계 어둡다(코랄 → 벽돌, 하늘 → 코발트).

**정당 색 우려**(`colors.ts:10`, `APP_ICON_COLOR_2026-10-02.md` "피한 것"): 원색 빨강·파랑을 피하려고 채도를 OKLCH C 0.13~0.15 로 묶었다
(danger C 0.21 보다 낮다). 면적이 큰 자리(Fill)는 아이콘과 같은 파스텔 톤이라 아이콘 결정과 같은 근거로 피해 간다고 본다 — **실기기 확인 대상**.

### 2-2. 크롬 — primary **[결정 D1]**

| 안 | 값 (light / dark) | 장점 | 단점 |
| --- | --- | --- | --- |
| **A. 잉크 (권장)** | primary `#1A1D1A` · primaryFill `#1A1D1A`(위 white 17.0) · primaryBg `#E0E2DE` / dark primary·Fill `#ECEEEA` · primaryBg `#40433C` | 색이 소유자에게만 남아 "누구 것"이 가장 잘 읽힌다. 아이콘(흰 판 + 코랄·하늘)과 같은 문법. **다크 primary 의 4.5 미달 상충(`colors.ts:24`, `:215-222`)이 사라진다**(dark 버튼 위 글자 14.6, 표면 위 글자 12.8) | 링크·선택 글자가 본문과 같은 색 → 굵기·밑줄로 구분해야 한다. 탭 활성(ink) 대 비활성(textSecondary) 대비 2.56(dark 1.94)로 색만으로 약하다 → 아래 2-5 |
| B. 초록 유지 | 현행 `#2A7731` 등 그대로 | 크롬 316참조가 그대로라 작업·위험 최소 | 앱 안에 빨강·파랑·보라·초록 네 hue. 아이콘에 없는 초록이 가장 넓은 면(버튼·탭)을 차지 — 지금 문제("아이콘은 바뀌었는데 앱은 초록")가 남는다. success 와 ΔE 12.7 그대로 |
| C. 나 색을 크롬으로 | primary = me | 아이콘 첫인상(코랄)과 가장 가깝다 | 원칙 1 위반 — 버튼이 전부 "내 것"처럼 보인다. 지금 크롬=상대 문제의 거울상 |

이하 설계는 **A 기준**이다. B 를 고르면 2-2 만 현행 값으로 두고 나머지는 같다(1단계 전체와 2단계 대부분이 공통).

### 2-3. 새 목적 토큰 (소유자 토큰에서 떼어 낼 것)

1단계에서는 **현재 화면에 보이는 값 그대로** 만든다(화면 변화 없음). 2단계에서 필요한 것만 값을 바꾼다.

| 새 키 | 1단계 값 (light / dark) = 지금 보이는 색 | 2단계 값 | 쓰는 자리 |
| --- | --- | --- | --- |
| `eventAnniversary` | `#59772D` / `#C9DA97` | together 와 같은 값으로 **연결하지 않고** 그대로 유지 **[결정 D3]** | 캘린더 기념일 |
| `eventBirthday` | `#8A6817` / `#F1C999` | 유지 | 캘린더 생일 |
| `eventDate` | `#2C7D33` / `#A7D2A9` | 유지 | 캘린더 데이트 |
| (기타) | textSecondary | 유지 | |
| `achievement` | `#8A6817` / `#F1C999` (지금의 couple·Gold) | 유지 — 금색은 "성취"로 남긴다 | PR·목표 카드(`ChatRoomScreen.tsx:3161,3203`), 스트릭 불꽃(`WorkoutScreen.tsx:317,550,560`), 스트릭 배너(`ChatRoomScreen.tsx:2008`), 배지(`BadgeCard.tsx:65,87` — 지금 accent) |
| `achievementBg` | `#F6E2B2` / `#332811` (지금 mePastelBg) | 유지 | PR·목표 카드 배경 |
| `warning`/`warningBg` | `#8A6817`/`#FBF3DF` (지금 meText/meBg) | 유지 | 장애 공지 배너(`ServiceStatusBanner.tsx:84`) |
| `sunday` | 지금 값(coral `#8A6817` / danger) → **danger 로 통일** | = danger | `AlbumCalendar.tsx:126,143`(지금 금색 — 버그성), `DatePickerSheet.tsx:324` |
| `saturday` | `#2C7D33` / `#A7D2A9` (지금 indigo) | `#2470B5` / `#B2D7FF` — 달력 관행의 파랑. 값은 partner 와 같지만 **키는 별개** | `DatePickerSheet.tsx:325` |
| `chart1~3` | 근력 primary · 유산소 secondary · 유연성 accent (근력↔유산소 ΔE 3.1 — **지금도 구분 안 됨**) | 서로 ΔE ≥ 20, 소유자 3색과도 ≥ 15 인 3색을 새로 고른다(예: 잉크 `#1A1D1A` · 청록 `#1E7F86` · 호박 `#A86A12` — **값 미검증, 구현 때 verify 규칙으로 확정**) | `WorkoutStatsScreen.tsx:24-26`, `DietStatsScreen.tsx:276-277`(나트륨·당), `DietStatsScreen.tsx:89` |
| `rating` | `#59772D` (지금 accent) | `lovelichelinGold` 와 같은 값 `#B8860B` / `#F5C518` 로 연결 | 입력 별(`DietRecordScreen.tsx:2001`, `ContentDetailScreen.tsx:557`) — **럽슐랭의 나/상대 별은 소유자 색 그대로** |
| `mapPin` | danger / coral (지금 값) | together | 럽슐랭 지도 핀(`PlaceScreen.tsx:230` — 지금 danger), 앨범 지도(`AlbumMap.tsx:51`), 경로선(`kakaoMapHtml.ts:230`, `KakaoMap.web.tsx:195` `#4A5BFF`) |

`success`·`danger` 는 값 유지. primary 를 잉크로 하면 앱 안의 초록은 **success 하나만 남아** 완료 상태가 지금보다 분명해진다.

### 2-4. 채팅

- 'default' 테마 **내 말풍선 = `meFill`**(지금 primaryFill, `chatTheme.ts:587`) — 원칙 3. 글자는 onColor(→ ink 6.52). 배경 대비 2.50(지금 2.07 보다 높다).
  `chatTheme.ts:157` 의 정적 리터럴(검증 스크립트가 읽는 값)도 같이 바꾼다.
- 안 읽음 하트 = partner(`:591` 은 자동). 하드코딩 20곳(`chatTheme.ts:167~496`의 `readMark: '#2C7D33'`/`'#A7D2A9'`)을 새 상대 값 `#2470B5`/`#B2D7FF` 로.
  `npm run verify:chat-theme` 의 "하트 vs 배경 ≥ 3" 이 테마별로 판정한다 — 진한 배경 테마에서 걸리면 그 테마만 밝은 쪽을 쓴다.
- 강조 행(`:589` partnerPastelBg)은 자동.
- 나머지 9개 테마의 bubbleMine 은 **건드리지 않는다**(취향 테마 — 현황 3-5 미확인 항목과 같은 판단). 리액션 mine(`ChatRoomScreen.tsx:3295`)은 선택 상태라 primary 유지.

### 2-5. 탭·링크 — 잉크 크롬의 보완

- **탭**: 활성/비활성이 지금은 hue(초록 vs 회색)로 갈린다. 잉크면 명도 차만 남아(2.56) 약하다. 활성 탭에 **채운 아이콘 또는 라벨 굵기 800 + 상단 2px 막대**를 더한다.
  아이콘을 채운 버전으로 바꾸려면 글리프 서브셋 재생성이 필요하다(`EventPeek.tsx:25` 주석, `npm run build:web` 의 서브셋 단계) — 막대·굵기만으로 하면 서브셋 불필요.
- **링크·"더 보기"**: primary 글자 178곳(현황 2-2). 잉크면 본문과 같은 색이 되므로 이 중 **링크 역할**은 굵기 700 이상 + 화살표/밑줄. 대상 목록은 구현 때 grep 으로 뽑는다(`color: colors.primary` 가 Text 에 붙은 곳).
- **선택 칩**(`Chip.tsx:62,66`): primaryBg `#E0E2DE` + ink 테두리·글자. 비선택(surfaceAlt) 대비 1.16 이라 테두리가 구분을 맡는다(지금도 같은 구조).

---

## 3. 바꾸는 자리 — 전수

### 3-1. 별칭 정리 (1단계 — 화면 변화 없음, `sunday`·`saturday` 2곳 제외)

`theme/colors.ts` 에서 `coral`·`indigo`·`violet`·`couple`·`food`·`health`·`secondary`·`secondarySoft`·`accent`·`accentSoft` 를 **삭제**한다.
`Palette` 타입에서 키가 빠지므로 남은 참조는 **`npm run typecheck` 가 전부 잡는다**(빠뜨릴 수 없는 구조). `food`·`health` 는 참조 0건.

| 별칭 | 참조 | 옮길 곳 |
| --- | --- | --- |
| coral → | 21~23 | 사진 뷰어 제목·답장 인용 mine(`AlbumScreen.tsx:289`, `TripAlbumScreen.tsx:77`, `ChatPhotoGalleryScreen.tsx:59`, `ChatRoomScreen.tsx:279,3267`) → **meText/me** · 일요일(`AlbumCalendar.tsx:126,143`) → sunday · 생일(`CoupleCalendarScreen.tsx:71`) → eventBirthday · 오늘 D-day 배지(`:751,758`) → achievement · 스위치(`:945,961`) → primary · 홈 일정 아이콘(`EventPeek.tsx:57`) → 종류별 event 색 · 불꽃·스트릭(`WorkoutScreen.tsx:317,550,560`, `ChatRoomScreen.tsx:2008`) → achievement · 부재중 통화(`ChatRoomScreen.tsx:2219`) → danger · 당 추세(`DietStatsScreen.tsx:277`) → chart · 남은 무게(`PlateCalculatorSheet.tsx:157`) → textSecondary **[확인: 경고 의도인지]** · 앨범 지도(`AlbumMap.tsx:51`) → mapPin |
| indigo → | 8 | 뷰어 제목·인용 theirs → **partnerText/partner** · 토요일(`DatePickerSheet.tsx:325`) → saturday · 나트륨(`DietStatsScreen.tsx:276`) → chart · 데이트(`CoupleCalendarScreen.tsx:72`) → eventDate |
| violet → | 4 | 기념일(`CoupleCalendarScreen.tsx:70`) → eventAnniversary · 다녀온 곳 바·테두리(`:667,1063`) → together · 알림 권한 아이콘(`PushPermissionPrimer.tsx:69`) → together |
| couple → | 2 | `ChatRoomScreen.tsx:3161,3203` → achievement (배경 mePastelBg 도 `achievementBg` 로 — 안 그러면 2단계에서 상대 PR 카드 배경이 코랄이 된다) |
| accent → | 34 | 여행 전반(`TripPeek.tsx:72`, `TripDetailScreen.tsx:557,837,946-960,1026,1032,1054,1144,1147`, `TripRecapScreen.tsx:66`, `TripExpenseScreen.tsx:377,472,475`, `CoupleCalendarScreen.tsx:625,1034`) → together · 배지(`BadgeCard.tsx:65,87`) → achievement · 입력 별(`DietRecordScreen.tsx:2001`, `ContentDetailScreen.tsx:557`) → rating · 식단 완료일·완료 막대(`DietCalendarScreen.tsx:212,215`, `DietStatsScreen.tsx:89`) → success **[변화 있음: 올리브→success 초록]** · kcal(`DietRecordScreen.tsx:2047`) → textPrimary · 체중 증가(`BodyMetricScreen.tsx:401`) → textSecondary · 트레이너 날짜 칩(`TrainerRoutineAssignScreen.tsx:120`) → primary · 유연성(`WorkoutStatsScreen.tsx:26`) → chart · **스도쿠·질문**은 3-2 |
| secondary → | 12 | 여행 일차·결제자 칩(`TripDetailScreen.tsx:1011,1015,1133`, `TripExpenseScreen.tsx:458,462`) → primary(선택 상태) · 장소·링크 글자(`TripDetailScreen.tsx:1067,1158`) → primary · 유산소(`WorkoutStatsScreen.tsx:25,197`) → chart |

1단계에서 **값이 같은 토큰으로 옮기는 것**(예: accent → together 는 둘 다 `#59772D`)은 화면이 그대로다. 표의 "[변화 있음]" 과 sunday·saturday 만 1단계에서 보이는 차이다.

### 3-2. 규칙 이탈 수정 (2단계와 함께 — 현황 3-4)

| 자리 | 지금 | 바꿀 것 |
| --- | --- | --- |
| 스도쿠 `SudokuScreen.tsx:694-695`, 범례 `:423-425` | 나 primary · 상대 accent | 나 me · 상대 partner |
| 오늘의 질문 `DailyQuestionScreen.tsx:277` | 상대 답 테두리 accent | partner |
| 벽 레이스 `WallRaceScreen.tsx:47-48,362-363` | 나 `#2F6FEB` · 상대 `#E5484D` 하드코딩 (**새 체계와 정반대**) | `palettes.light.me`/`partner`(판은 다크에서도 같은 판이어야 하므로 light 고정 — `:41` 주석 유지). CELL_BG `#FBF8F1` 위 4.90/4.88. 목표줄 → `palettes.light.meBg`/`partnerBg` |
| 콘텐츠 관람 기록 별 `ContentDetailScreen.tsx:593` | 누구 것이든 togetherText | 럽슐랭 방문 기록(`PlaceDetailScreen.tsx:658`)처럼 작성자별 me/partner — **[결정 D4]** 기록에 작성자 필드가 있는지 먼저 확인(미확인) |
| 여행 결제자 칩 | 나/상대 모두 secondary | 3-1 에서 primary(선택 상태)로 — 누구인지는 라벨이 이미 말한다 |
| `components/Badge.tsx` | 사용처 0건, me/partner 참조 | 삭제 |

### 3-3. 값 교체 (2단계)

- `theme/colors.ts` light·dark 의 me/partner/together 15키 × 2 + primary 6키 × 2 + 3-1 의 새 목적 토큰 2단계 값.
- 헤더 주석(`:1-32`) 다시 쓰기 — Gold/Green 경위, 낡은 다크모드 문장(현황 6-3 ⑬), 다크 primary ⚠️(A 안이면 해소).
- `chatTheme.ts` — 2-4.
- `components/DoublyLogo.tsx` — 변경 없음(이미 아이콘 색).

### 3-4. 액센트 변형 폐지 **[결정 D2]**

green/mint/peach(`colors.ts:294-346`, 설정 `SettingsScreen.tsx:45,289-292`)는 "소유자 hue 취향"이었다. 소유자 색이 아이콘에 묶이고 크롬이 무채색이 되면
고를 것이 남지 않는다 — **폐지 권장**.

- `ACCENT_OVERRIDES` 삭제, `palette()` 가 변형을 무시. 저장된 `'mint'`/`'peach'`(`doubly.theme.accent`)는 읽어도 무시 — 마이그레이션 불필요.
- 설정의 "액센트" 행 삭제(라이트/다크 테마 선택은 유지).
- `themedStyles` 캐시 키(`themedStyles.ts:112,149`)는 변형 축을 지워도 되고 남겨도 동작한다 — 정리는 후속.
- `verify-theme-contrast.mjs:51-62` 가 변형 블록을 파싱하므로 함께 고친다(6벌 → 2벌).
- 유지를 고르면: 세 변형 모두 소유자 값은 같게 두고 **primary 만** 갈아끼우는 변형으로 의미를 바꾼다. 6벌을 다 채워야 한다(`colors.ts:291-292`).

### 3-5. 앱 밖·위젯

| 자리 | 할 일 | 배포 |
| --- | --- | --- |
| 홈 위젯 `widget/DoublyWidget.tsx:19-23` | 손 복사 hex 를 없앤다. `colors.ts` 는 Appearance·AsyncStorage 를 import 하므로 위젯(헤드리스 JS)에서 바로 쓸 수 있는지 **미확인** → light/dark 원본 객체만 담은 `theme/palette.ts`(의존성 없음)로 떼고 colors.ts·위젯이 함께 import | JS — OTA 로 위젯 렌더 코드가 바뀌는지 **미확인**, 실기기 확인 |
| 지도 HTML `utils/kakaoMapHtml.ts:144,230`, `KakaoMap.web.tsx:195` | 티어 배지 `#D4A017` → lovelichelinGold, 경로선 → mapPin(호출부에서 문자열로 넘김) | OTA |
| `app.json` | **변경 없음** — 스플래시 흰색, 알림 색 `#F28472`(이미 코랄) 그대로 | — |
| `landing/*.html` | `--brand #2a7731` → 잉크, `--accent #8a6817` → 나 코랄 `#B94834`, 다크 헤더 초록 그라데이션 교체 | Netlify(별개) — 3단계 |
| `store/` 그래픽 | 다음 스토어 등록정보 갱신 때 | 3단계 |
| PWA manifest | 변경 없음 | — |

### 3-6. 서버·DB

**변경 없음.** 서버는 이미 보는 사람 기준으로 내려준다(현황 4-4). 마이그레이션·Purger 영향 없음.

---

## 4. 검증

### 4-1. 자동

- `verify-theme-contrast.mjs` 의 `DISTINCT` 에 규칙 추가 — 지금 없는 것이 사고의 원인이었다(현황 6-3 ①):
  - primary ≠ me · partner · together (ΔE ≥ 15) — A 안이면 잉크 대 유채색이라 여유가 크다
  - me ≠ partner (≥ 40), together ≠ me · partner (≥ 20)
  - me ≠ danger (≥ 15) — 현재 설계 23.8, dark 50.2
  - 같은 규칙을 Fill 쌍에도
- `npm run verify:theme` · `verify:chat-theme` · `typecheck`(별칭 삭제 누락을 잡는다) · `lint` · `build:web`.
- `verify:theme` 의 기존 대비 규칙은 그대로 통과해야 한다 — 2-1 표의 값이 그 규칙으로 잰 것이다.

### 4-2. 실기기 (라이트·다크 둘 다)

홈(CoupleHero 아바타·링·배경 그라데이션 `HomeScreen.tsx:108`) · 채팅(내 말풍선 코랄, 하트, 운동 카드) · 럽슐랭 목록·상세 별 · 무드 달력 범례 ·
럽바디 주간 점 · 챌린지 막대 · 스도쿠 · 벽 레이스 · 캘린더(종류 점·요일) · 탭바(2-5) · 설정(액센트 행 사라짐) · **홈 위젯**.
확인할 것: ① 나·상대가 한눈에 갈리는가 ② 코랄 글자가 danger(삭제 버튼)와 헷갈리지 않는가 ③ 정당 색으로 읽히지 않는가 ④ 아이콘 → 스플래시 → 홈 전환.

---

## 5. 단계와 작업량

| 단계 | 내용 | 파일 | 화면 변화 | 배포 |
| --- | --- | --- | --- | --- |
| **1. 의미 분리** | 목적 토큰 추가(현재 값), 별칭 10개 삭제 → tsc 가 가리키는 ~80자리 이동, Badge.tsx 삭제, DISTINCT 규칙 추가(현 팔레트에선 primary≠partner 가 **실패**하므로 2단계와 같이 켠다) | colors.ts + 약 30파일 | 거의 없음(일요일·토요일·식단 완료색) | OTA 가능 |
| **2. 값 교체** | 2-1·2-2·2-3 값, 채팅 2-4, 규칙 이탈 3-2, 탭·링크 2-5, 액센트 폐지 3-4, 위젯 3-5 | colors.ts · chatTheme.ts · SettingsScreen · themePreference · verify 스크립트 · 위젯 · 벽 레이스·스도쿠·질문 · 탭 네비 · 링크 자리들 | 전면 | OTA(사전에 fingerprint 비교 — CLAUDE.md 6절) |
| **3. 앱 밖** | landing, store 그래픽 | landing/, store/ | 웹사이트·스토어 | Netlify / 스토어 등록정보 |

작업량 감: 1단계는 기계적(타입 오류를 따라가며 치환) — 반나절. 2단계는 값이 이미 정해져 있어 토큰 교체 자체는 짧고, **시간은 탭·링크 보완(2-5)과 실기기 확인**에 든다.
B 안(초록 유지)을 고르면 2-5 가 통째로 빠진다.

---

## 6. 결정 필요

| | 질문 | 권장 |
| --- | --- | --- |
| **D1** | 크롬 primary — 잉크 / 초록 유지 / 나 색 | **잉크(A)** — 원칙 1, 다크 primary 상충 해소. 단 탭·링크 보완 필요 |
| **D2** | 액센트 변형(green/mint/peach) | **폐지** |
| **D3** | 캘린더 종류색 | **지금 값 유지, 토큰만 분리**(생일 금·데이트 초록·기념일 올리브). 초록 두 개(데이트·기념일)가 가깝다는 지금 문제는 그대로 — 바꾸려면 따로 |
| **D4** | 콘텐츠 관람 기록 별을 작성자별로 | 데이터에 작성자가 있으면 예, 없으면 together 유지 |
| D5 | 함께 = 라벤더 | 둘을 섞은 색이라는 설명이 가장 쉽다. 대안은 금색(성취와 겹침)·중립(구분 약함) |

## 7. 위험

1. **나 코랄 ↔ danger** — ΔE 23.8 로 다른 색이지만 둘 다 따뜻한 빨강 계열이다. 삭제 버튼 옆에 내 별점이 있는 화면(럽슐랭 상세)에서 실기기 확인. 부족하면 danger 를 더 차가운 크림슨으로 미는 쪽을 먼저 본다(소유자 색은 아이콘에 묶여 있으므로).
2. **잉크 크롬의 신호 약화** — 2-5. 보완 없이 값만 바꾸면 탭·링크가 본문처럼 보인다.
3. **상대 하늘 ↔ 토요일·지도** — 2단계 saturday 값이 partner 와 같다. 소유자 의미가 없는 달력 자리라 허용했지만, 거슬리면 saturday 만 남색으로.
4. **1단계에서 DISTINCT 규칙을 먼저 켜면 CI 가 빨개진다** — 현 팔레트가 primary≈partner 이기 때문. 2단계와 같은 커밋에서 켠다.
5. 위젯이 OTA 로 갱신되는지·위젯 헤드리스 런타임에서 테마 모듈을 import 할 수 있는지 미확인(3-5).
6. 채팅 진한 테마 10종 중 일부에서 새 하트 색이 배경 3:1 에 못 미칠 수 있다 — verify:chat-theme 결과를 보고 테마별로 고른다.
7. 병렬 세션이 같은 화면 파일(채팅·캘린더·럽슐랭)을 고치는 중이면 1단계 치환이 충돌한다 — 1단계는 짧게, 한 번에 병합·푸시.

---

## 8. 1단계 결과 (2026-10-05, main `76a775ac`)

결정: D1 잉크 · D2 액센트 변형 폐지 · D3 캘린더 종류색 유지 · D4 작성자 있으면 사람별 · D5 라벤더 — 전부 권장안.

**한 것**
- `theme/colors.ts`: 목적 토큰 16개(eventAnniversary·eventBirthday·eventDate·achievement·achievementBg·warning·warningBg·sunday·saturday·chart1~4·rating·mapPin·highlightBg)를
  **지금 보이던 값 그대로** light/dark 에 추가. 별칭 10개(coral·indigo·violet·couple·food·health·secondary·secondarySoft·accent·accentSoft)를 Palette 와 mint·peach 변형에서 삭제.
- 별칭 참조 92곳을 33파일에서 목적 토큰 또는 소유자 토큰으로 이동(§3-1 표대로). 남은 참조 0 — `typecheck` 가 보장.
- 홈 일정 미리보기 아이콘을 일정 종류색으로(`EventPeek.tsx` `typeColor`).
- 죽은 코드 `components/Badge.tsx` 삭제(별도 커밋 `99705af8`).

**의도한 화면 변화**(그 밖에는 값이 같다 — green 변형 기준)
일요일(앨범 달력)·앨범 지도 핀·부재중 통화 금색 → danger 빨강 · 캘린더 스위치·트레이너 날짜 칩 → primary · 식단 완료일·완료 막대 올리브 → success ·
식단 kcal 올리브 → 본문색 · 체중 증가 올리브 → 보조 글자색 · 배지 올리브 → 성취 금색 · 홈 일정 아이콘 금색 → 종류색 ·
여행 일차·결제자 칩 secondary → primary(ΔE 3.1, 사실상 같음).
mint·peach 사용자는 목적 토큰 자리가 green 값으로 보인다(변형은 2단계에서 폐지).

**검증**: `typecheck` · `verify:theme`(6벌 × 32규칙) · `verify:chat-theme` · `build:web` 통과. `lint` 오류 88건은 기존 React 규칙 위반(setState in effect 등)으로 이번 변경과 무관하고 CI 대상 아님.
화면 실측(브라우저·실기기)은 **안 했다** — 대부분 같은 값으로의 치환이라 2단계 실기기 확인 때 함께 본다.

**2단계로 넘긴 것**
- 스도쿠·오늘의 질문의 상대 색: 1단계에선 값 유지를 위해 together 로 옮겼다 → 2단계에서 partner 로(§3-2).
- 여행 화면 전반이 together(라벤더가 된다) — 선택 칩(`catSelectOn`)은 원칙 3 상 primary 가 맞을 수 있다. 2단계에서 화면 보고 결정.
- 프로그램·추천 카드 `highlightBg` 의 2단계 값(지금 올리브 연한 바탕).
- DISTINCT 규칙(§4-1) — 현 팔레트에선 primary≈partner 라 실패하므로 2단계 값과 같은 커밋에서 켠다.

**발견**: `build:web` 이 아이콘 서브셋을 다시 만들며 `head` 글리프를 추가한다 — main 에 서브셋에 없는 아이콘을 쓰는 코드가 이미 있다는 뜻(이번 변경과 무관, 커밋하지 않음).

---

## 9. 2단계 결과 (2026-10-05)

**한 것**
- 값: 2-1(소유자)·2-2 A안(잉크 크롬)·2-3(목적 토큰 2단계 값) 그대로. 차트 4색은 잉크 `#1A1D1A`·청록 `#1E7F86`·호박 `#A86A12`·초록 `#2C7D33`
  (다크 `#ECEEEA`·`#7FD3D9`·`#F0B567`·`#A7D2A9`)으로 확정 — 서로 ΔE ≥ 45(다크 ≥ 27), 소유자 색과 ≥ 32(다크 ≥ 25).
  강조 카드 `highlightBg` 는 웜그레이 `#F3F1EC`/`#2E2C27`.
- 구조: 값은 **`theme/palette.ts`**(import 없는 순수 값 모듈)로 옮기고 `colors.ts` 는 스킴 선택만. 위젯·벽 레이스·지도·verify 스크립트가 같은 원본을 읽는다.
- 액센트 변형 폐지(D2): `ACCENT_OVERRIDES`·themeStore 의 accent·설정의 액센트 행·themePreference 의 저장 함수 삭제, themedStyles 캐시 키에서 변형 축 제거.
- **새 토큰 `onPrimary`**(라이트 white / 다크 `#1A1D1A`) — 설계에 없던 것. 다크의 primary 가 밝은 잉크라 primary 면 위 흰 글자가 1.2:1 로 사라지는 자리가
  **31곳** 있었다(전송 버튼·배지·오늘 표시·수락 버튼 등). 예전 초록에서도 다크 3.3~3.97 로 미달이던 자리다. verify 에 `onPrimary / primary` 규칙 추가.
- 스위치: 켜진 트랙(primaryFill)이 다크에서 밝아 흰 손잡이가 묻힌다 → 손잡이 `onColor(primaryFill)`(설정 목록·캘린더 2곳·여행 모드).
- 탭 바(2-5): 활성 막대(하단 바 위쪽 가로 24×3, 레일 왼쪽 세로 3×28) + 라벨 굵기 600→800. 글리프 서브셋은 안 건드렸다.
- primary 글자만으로 선택을 표시하던 칩·탭 라벨 12곳에 굵기 800.
- 채팅(2-4): 기본 테마 내 말풍선 = meFill, 하트·강조 행 = 상대 계열, 20벌 하트 리터럴 교체.
- 규칙 이탈(3-2): 스도쿠·오늘의 질문·벽 레이스·콘텐츠 관람 별(D4 — `loggedBy` 가 있어 사람별로).
- §8 의 2단계 이월: 여행 카테고리 칩·여행 모드 토글은 **primary**(선택 상태), 여행 아이콘·AI 버튼·정산 "받을 돈"은 together 유지.
- 그 밖: 영양 링 primaryLight(회색이 됨) → 나 색, 스티커 상점 PRO 왕관 primaryDark → primary.
- 위젯·지도(3-5): 하드코딩 → 팔레트. app.json·landing·store 는 손대지 않았다(3단계).

**검증**: `typecheck` · `verify:theme`(2벌 × 33규칙 + 구분 규칙 16) · `verify:chat-theme`(20벌 240건) · `build:web` 통과.
브라우저(웹 dev 서버)로 **로그인 전 화면만** 라이트·다크 확인 — 온보딩 잉크 버튼·코랄 점, 로그인 화면 코랄/하늘 마크. 로그인 이후 화면은 운영 백엔드라
자격 증명을 넣지 않았다 → **실기기 확인 필요**(§4-2 목록).

**남은 것**
- 실기기 확인(§4-2) — 특히 탭 바 막대, 채팅 코랄 말풍선, 다크 스위치, 위젯.
- `primary` 글자를 링크로 쓰는 자리 중 굵기가 낮은 곳은 위 12곳 외에 인라인 스타일에 더 있을 수 있다(정적 스타일만 grep 했다).
- ~~OTA~~ — 2026-10-05 배포 완료. fingerprint 가 1.0.6 빌드와 일치(Android `5025c62d…` · iOS `810b9a8b…`). 직전 OTA(`80426076`) 이후 커밋은 이 작업뿐이었다.
  워크트리에서 `npm ci` 한 node_modules 로 번들했고 fingerprint 는 주 체크아웃과 같았다(junction 이 아니면 문제없다).
- ~~3단계~~ — §10.
- 기존 사용자 영향: mint·peach 를 골랐던 사람은 기본으로 돌아간다(설정 항목이 사라짐).

---

## 10. 3단계 결과 (2026-10-05)

**설계(§3-5)와 달라진 점**: 소개 페이지(`landing/index.html`)는 같은 날 다른 세션이 이미 새 아이콘 색으로 개편했다(`441ee7ba` —
코랄 버튼 `#B8473A`·하늘 링크 `#2A6AAE`, 흰 글자 대비 5.25/5.57). 설계의 "`--brand` → 잉크"는 개편 전(초록) 기준이었으므로
**index·invite 는 건드리지 않았다.** 앱(버튼 잉크)과 소개 사이트(버튼 코랄)의 CTA 색이 다르다 — 사이트에는 나/상대 의미가
없어 원칙 1 과 충돌하지 않는다고 보고 두었다. → **같은 날 사용자 요청으로 잉크로 맞췄다**: index `--button` `#1a1d1a`(흰 글자) /
다크 `#eceeea`(잉크 글자, `--on-button` 신설), invite `.primary` 같은 값. 코랄·하늘은 마크·태그에만 남는다.

**한 것**
- 약관·개인정보·지원 페이지 링크: 초록 `#2f8f5b` → 하늘 `#2a6aae`(다크 `#8cc2f5` 새로 추가) — index 의 `--link` 와 같은 값.
- 스토어 피처 그래픽: 보조 글자 올리브 `(60,74,51)` → 무채색 `(88,94,88)`(palette.ts textSecondary), 피처 그래픽만 재생성.
  배경판(`plates/`)은 색 상수를 쓰지 않아(피치→크림→하늘 그라데이션·잉크) 그대로다.
- `store/README.md` 에 `shots/` 재촬영 필요 경고.

**사용자 작업으로 남은 것**
- **소개 사이트 재배포** — `landing/` 은 Git 자동 배포가 아니다(Netlify 에 직접 올린다).
- **스토어 스크린샷 재촬영** — `store/shots/` 는 초록 시절 실기기 캡처다. 다시 찍어 `python3 store/compose.py store/shots` → 스토어 등록정보 갱신.
- **Play 피처 그래픽 업로드** — 새 `store/feature_graphic.png`.

**앱 밖에서 바꿀 필요가 없던 것**: `app.json` 스플래시(흰색)·알림 색(`#F28472` 코랄)·어댑티브 아이콘(흰색), PWA manifest(흰색·`#FAFAF9`).

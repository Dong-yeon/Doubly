# 앱 색상 체계 — 현재 상태 분석 (2026-10-05)

> **기준 커밋: `2a9bd0bf8473dde05efe5292b27a08b6ae3c977f`** (main = origin/main, 갈라짐 없음)
>
> 코드 수정 없음 — 분석 문서. 배경: 앱 아이콘이 연한 코랄·하늘(`APP_ICON_COLOR_2026-10-02.md`)로 바뀌었고 앱 안은
> 초록 primary 그대로다. 빨강·파랑을 "나/상대" 색으로, primary 는 따로 정하는 방향을 검토하기 위한 현황.
>
> 경로는 `frontend/src/` 아래면 `src/` 를 생략한다(예: `theme/colors.ts:45`). 백엔드는 `backend/src/main/java/com/fitto/` → `J/`,
> 마이그레이션 `backend/src/main/resources/db/migration/` → `M/`. 확인 못 한 것은 **미확인**으로 적었다.
> 하드코딩 개수는 grep 집계(따옴표로 시작하는 `#rgb`/`#rrggbb`/`#rrggbbaa`/`rgb(`/`rgba(` 리터럴, `.ts`·`.tsx`)라 주석 속 리터럴도 포함된다.

---

## 1. 프론트 구조

### 1-1. 플랫폼·스타일링

- **Expo + React Native**(웹은 react-native-web 으로 같은 코드를 export). `frontend/package.json`: `expo ~56.0.12`, `react-native 0.85.3`.
- **스타일링은 `StyleSheet` + 자체 테마 래퍼.** styled-components·Tailwind/NativeWind·react-native-paper·ThemeProvider(Context) 없음
  (grep 0건). `NavigationContainer`(`navigation/RootNavigator.tsx:243`)에 theme prop 을 쓰는지는 미확인.
- 테마 전달은 Context 가 아니라 **모듈 수준 가변값 + Proxy** 다.
  - `theme/colors.ts:359` `currentScheme`, `:366` `currentVariant` — 모듈 변수.
  - `theme/colors.ts:403-408` `colors` 프록시 — 속성을 **읽는 시점**에 현재 팔레트에서 꺼낸다(JSX 인라인 `color={colors.primary}` 가 즉시 전환을 따라옴).
  - `theme/themedStyles.ts:106-122` `themedStyles(factory)` — `StyleSheet.create` 대체. 캐시 키 `액센트:스킴`(`:112`).
  - `theme/themedStyles.ts:134-159` `chatThemedStyles` — 채팅 배경 위 요소 전용, 캐시 키 `액센트:스킴:채팅테마:사진유무`(`:149`).
  - `theme/onColor.ts:217-220` `onColor(bg)` — 배경 휘도로 위 글자색(ink `#1A1D1A` / white) 자동 선택.
  - 화면 갱신은 `store/themeStore.ts` 의 `version` 증가(`:55`,`:61`,`:69`,`:85`)가 맡는다.
- `themedStyles(` 를 쓰는 screens/components 파일 157개. `StyleSheet.create` 를 직접 쓰는 15개 중 실제 토큰을 굳히는 곳은 **0** —
  `MemoriesScreen` 등 6개는 주석 속 문구이고, 나머지 9개(`components/AvatarCropSheet.tsx:349`, `Badge.tsx:37`, `IconButton.tsx:58`,
  `DuoOrbitSpinner.tsx:71` 등)는 시트 안에 `colors.` 참조가 없다.
- 진입점: `theme/index.ts:5` 가 `colors` 를 내보내고, `constants/theme.ts:7` 이 그대로 re-export(구 경로 호환).

### 1-2. 토큰 정의 파일

| 파일 | 역할 |
| --- | --- |
| `theme/colors.ts` (408줄) | 앱 팔레트 light/dark + 액센트 변형 3종 |
| `theme/chatTheme.ts` (593줄) | 채팅방 배경 테마 10종 × light/dark — 앱 팔레트와 **의도적으로 분리**(`:4-7`) |
| `theme/onColor.ts` | 색 위 글자색 선택 |
| `theme/themePreference.ts` | 저장 키 `doubly.theme.mode`(`:25`), `doubly.theme.accent`(`:29`) — **기기별(AsyncStorage/localStorage), 서버 저장 아님** |
| `theme/index.ts:64-79` | `shadow` — `shadowColor: '#000000'` 고정 |

#### `theme/colors.ts` light 팔레트 전체 (`:36-170`) — green 변형 기준

| 그룹 | 키 = 값 |
| --- | --- |
| 코어(구 이름) | cream `#FFFFFF` · ink `#1A1D1A` · **coral `#8A6817`(=나 Gold)** · **indigo `#2C7D33`(=상대 Green)** · **violet `#59772D`(=함께 Olive)** |
| 나 | me `#8A6817` · meBg `#FBF3DF` · meFill `#E0B248` · mePastelBg `#F6E2B2` · meText `#8A6817` |
| 상대 | partner `#2C7D33` · partnerBg `#E8F3E9` · partnerFill `#60C769` · partnerPastelBg `#C6E1C8` · partnerText `#2C7D33` |
| 함께 | together `#59772D` · togetherBg `#EFF4E4` · togetherFill `#9EC464` · togetherPastelBg `#DAE6C1` · togetherText `#59772D` |
| 럽슐랭 왕관 | lovelichelinGold `#B8860B` |
| 크롬 | **primary `#2A7731`** · primaryDark `#1F5A25` · primaryLight `#4E9E56` · primaryFill `#4DC76E` · primaryBg `#E9F2EA` |
| 텍스트 | textPrimary `#1A1D1A` · textSecondary `#585E58` · textMuted `#767C76` · textTertiary `#767C76` |
| 표면 | surface `#FFFFFF` · surfaceCard `#FFFFFF` · surfaceAlt `#F1F2F0` · background `#FAFAF9` · shellBackdrop `#EDEEEB` |
| 보더·덮개 | border `#E4E6E3` · borderStrong `rgba(26,29,26,0.15)` · backdrop `rgba(0,0,0,0.42)` |
| 호환 별칭 | couple `#8A6817`(=나) · food `#59772D`(=함께) · health `#2C7D33`(=상대) · primarySoft `#E9F2EA` · **secondary `#2C7D33`(=상대)** · secondarySoft `#E8F3E9` · **accent `#59772D`(=함께)** · accentSoft `#EFF4E4` |
| 기능색 | success `#1E8652` · successBg `#E7F5EE` · danger `#E12D33` · dangerBg `#FFF0EF` · dangerText `#9B3330` · white `#FFFFFF` |

#### dark 팔레트 (`:179-266`) — 같은 키

coral/me/meText/meFill `#F1C999` · indigo/partner/partnerText/partnerFill `#A7D2A9` · violet/together/togetherText/togetherFill `#C9DA97` ·
meBg/mePastelBg `#332811` · partnerBg/partnerPastelBg `#1D2E1F` · togetherBg/togetherPastelBg `#2A2F19` · lovelichelinGold `#F5C518` ·
primary `#459E77` · primaryDark `#2F7A55` · primaryLight/primaryFill `#68B58B` · primaryBg/primarySoft `#12211A` ·
textPrimary/ink `#ECEEEA` · textSecondary `#A8AEA6` · textMuted/textTertiary `#868C84` · surface/surfaceCard `#262823` · surfaceAlt `#31332D` ·
background `#1E201C` · border `#3A3D36` · borderStrong `rgba(236,238,234,0.18)` · backdrop `rgba(0,0,0,0.62)` · shellBackdrop `#141613` ·
couple `#F1C999` · food/accent `#C9DA97` · health/secondary `#A7D2A9` · secondarySoft `#1D2E1F` · accentSoft `#2A2F19` ·
success `#3FBF80` · successBg `#1C3327` · danger `#F25A5F` · dangerBg `#3A1F20` · dangerText `#F2A0A0` · cream/white `#FFFFFF`.

#### 액센트 변형 (`:294-346`) — 설정 > 화면 > 액센트(`screens/my/SettingsScreen.tsx:45`, `:289-292`)

`green`(기본, 위 값) / `mint` / `peach`. 변형은 **me·partner·together·primary 계열과 그 별칭만** 덮어쓴다(`:296-333`). 값 전체는 `colors.ts:297-332`.
- mint light: me `#8C6918` · partner `#2E7A61` · together `#487A2E` · **primary `#2E7A61`**
- peach light: me `#B74E1A` · partner `#407749` · together `#7A6B1F` · **primary `#407749`**

→ **mint·peach 는 primary 와 partner 가 같은 hex 다**(아래 6-3 위험 ①).

#### 채팅 테마 (`theme/chatTheme.ts`)

10종(default·rose·sky·lavender·peach·mint·charcoal·forest·indigo·plum) × light/dark, 각각 배경·내 말풍선·상대 말풍선·글자·구분선 등 묶음.
- 'default' 의 **내 말풍선 = 앱 `primaryFill`**(`:587`), 안 읽음 하트 `readMark = app.partner`(`:591`), 강조 행 = `partnerPastelBg`(`:589`).
- 나머지 9종은 고정 hex(예: rose 내 말풍선 `#F7C6D6` `:189`, sky `#BCD7F5` `:221`).
- 테마 파일 내부 리터럴 475개(`theme/` 폴더 전체) — 정의 자체라 하드코딩 집계에서 뺐다.

### 1-3. 다크 모드

- **지원한다.** `ThemeMode = 'system' | 'light' | 'dark'`(`theme/themePreference.ts:23`), 설정 화면 칩(`SettingsScreen.tsx:38`, `:284`).
- 시작 시 `readThemeModeSync()` + `Appearance.getColorScheme()`(`colors.ts:359-363`), 실행 중 시스템 변경은
  `Appearance.addChangeListener`(`store/themeStore.ts:79-85`)로 즉시 반영.
- `colors.ts:28-31` 주석("다시 시작해야 반영")은 **낡았다** — 지금은 프록시·themedStyles 로 즉시 전환(`colors.ts:351-358` 주석이 현행).
- 다크 미지원 자리: 홈 위젯(5-4), 네이티브 스플래시(5-1), 게임판(오목·벽 레이스 — 의도, `WallRaceScreen.tsx:41`).
- 대비 검증: `npm run verify:theme`(`scripts/verify-theme-contrast.mjs`) — 3변형 × 2스킴 WCAG 대비 + 왕관 금색 ΔE 구분 규칙(`:153-156`).
  **나 vs 상대, primary vs 상대의 ΔE 규칙은 없다.**

---

## 2. 색 사용 현황

### 2-1. 토큰을 거치지 않은 직접 색 — 162건 / 43파일 (`theme/` 제외)

색 이름 리터럴(`'white'`, `'red'` 등)을 색 속성에 쓴 곳은 0건, `'transparent'` 25건(집계 제외).

| 순 | 파일 | 건 | 내용 |
| --- | --- | --- | --- |
| 1 | `components/PuyoBoard.tsx` | 18 | 뿌요 조각 5색(`:34-48` 빨 `#E5484D`·파 `#3B82F6`·초 `#22A06B`·노 `#F5B301`·회 + 어두운 짝), 하이라이트 흰색 |
| 2 | `screens/home/WallRaceScreen.tsx` | 12 | 판 색(`:43-46`), **내 말 `#2F6FEB`(파랑)·상대 말 `#E5484D`(빨강)**(`:47-48`), 목표줄 `#DCE8FF`/`#FFE1E2`(`:362-363`) |
| 3 | `components/AvatarCropSheet.tsx` | 12 | 검정 크롭 화면의 흰 글자·마스크 |
| 4 | `screens/home/OmokScreen.tsx` | 8 | 바둑판 `#E8C48A`·선 `#8B6A3A`·돌 흑백(`:583-596`) |
| 5 | `screens/workout/WorkoutSessionScreen.tsx` | 7 | 요약 카드 위 반투명 흰 글자, 그림자, 백드롭 |
| 6 | `utils/kakaoMapHtml.ts` | 6 | 지도 마커 흰 테두리, 티어 배지 `#D4A017`(`:144`), 경로선 `#4A5BFF`(`:230`) |
| 7 | `screens/home/HomeScreen.tsx` | 6 | 그라데이션 페이드 — background 값을 rgba 로 손으로 복사(`:134-146`) |
| 8 | `screens/diet/BarcodeScanScreen.tsx` | 6 | 카메라 위 반투명 검정 |
| 9 | `components/ImageViewer.tsx` | 6 | 뷰어 검정·반투명 흰색 |
| 10 | `widget/DoublyWidget.tsx` | 5 | 위젯 팔레트(5-4) |
| 11 | `screens/album/AlbumScreen.tsx` | 4 | 사진 위 그라데이션·흰 글자 |
| 12 | `screens/album/AlbumCalendar.tsx` | 4 | 사진 위 날짜 |
| 13 | `components/KakaoMap.web.tsx` | 4 | 웹 지도 마커·경로선 `#4A5BFF`(`:195`) |
| 14 | `components/DrawingCanvas.tsx` | 4 | 캐치마인드 펜 6색(`:26`), 캔버스 흰 바탕 |
| 15~22 | `CoupleEmojiCreateScreen`·`ChatRoomScreen`·`AlbumMap`·`chat/TextSticker`·`Toast`·`HeartSproutIcon`·**`DoublyLogo`**·`DatePickerSheet` | 각 2 | `DoublyLogo.tsx:35-36` 마크 코랄 `#F28472`·하늘 `#62A8EC`(onDark `#F69A8A`·`#8CC0F2`), `HeartSproutIcon.tsx:18` 분홍 `#E8829E` |
| 23~43 | 21개 파일 | 각 1 | 대부분 백드롭 `rgba(0,0,0,0.4~0.55)` 또는 그림자 `#000` |

**성격별로 묶으면**
- 백드롭 `rgba(0,0,0,0.4~0.45)` 직접 사용 ≈ 20곳 — `colors.backdrop` 토큰이 있는데 안 쓴 곳(`AiInsightButton.tsx:146`, `ConfirmDialog.tsx:83`, `HomeScreen.tsx:1297` 등).
- 사진·카메라·검정 화면 위 흰색/반투명 — 테마와 무관하게 고정이 맞는 자리.
- 게임판·조각·펜 — 의도적 고정(`WallRaceScreen.tsx:41` 주석).
- **브랜드 마크·위젯 — 색 체계를 바꾸면 손으로 고쳐야 하는 자리.**
- 하드코딩 중 **나/상대 의미를 가진 것은 `WallRaceScreen`(파랑/빨강)과 `widget/DoublyWidget.tsx`(Gold/Green) 두 곳**.

### 2-2. 초록 계열 값과 용도

| 값(light) | 토큰 | 용도 분류 | 근거 |
| --- | --- | --- | --- |
| `#2A7731` | primary | **primary** — 글자/아이콘 178 · 테두리 67 · 채움 43 · 스피너/RefreshControl 29 (총 316참조/109파일) | 탭 활성 `navigation/MainTabNavigator.tsx:127,135`, Toast info `components/Toast.tsx:17` |
| `#4DC76E` | primaryFill | primary 채움(버튼·칩) 36참조, **기본 채팅 내 말풍선** | `chatTheme.ts:587` |
| `#E9F2EA` | primaryBg/primarySoft | 선택 칩·soft 버튼 배경 65+15 | |
| `#1F5A25` / `#4E9E56` | primaryDark / primaryLight | 8 / 2 참조, 영양 링 `NutritionRing.tsx:61` | |
| `#2C7D33` | partner/partnerText/indigo/secondary/health | **상대** 18+3+8, 그리고 상대 의미 없이 쓰는 별칭 secondary 12 | 여행 일차 칩 `TripDetailScreen.tsx:1011`, 운동 통계 "유산소" `WorkoutStatsScreen.tsx:25`, 토요일 `DatePickerSheet.tsx:325` |
| `#60C769` / `#E8F3E9` / `#C6E1C8` | partnerFill / partnerBg / partnerPastelBg | 상대 아바타·칩 | `ChatRoomScreen.tsx:1981,2053` |
| `#59772D` (올리브) | together/accent/violet/food | **함께** 20+20, 그리고 장식 별칭 accent 34 | 배지 `BadgeCard.tsx:65`, 별점 별 `DietRecordScreen.tsx:2001`, 여행 모드 `TripDetailScreen.tsx:946-960`, "유연성" `WorkoutStatsScreen.tsx:26`, 기념일 `CoupleCalendarScreen.tsx:70` |
| `#1E8652` | success | **success** 16참조 — 체크·완료·정산 완료·체중 감소 | `TripChecklistScreen.tsx:342`, `WorkoutSessionScreen.tsx:2150`, `BodyMetricScreen.tsx:400` |
| `#E7F5EE` | successBg | 3참조 | |
| `#22A06B`·`#177A50` / `#30A46C` | (하드코딩) | 장식 — 뿌요 조각 / 캐치마인드 펜 | `PuyoBoard.tsx:36,46`, `DrawingCanvas.tsx:26` |
| 채팅 mint·forest 테마 | chatTheme | 장식(취향) | `chatTheme.ts` |
| landing `--brand #2a7731` 등 | (앱 밖) | primary | 5-6 |

**primary 316참조의 성격 분류는 속성 기준 자동 집계**다(위 표). 개별 의미(버튼인지 "선택됨"인지 장식 아이콘인지)는 109파일을 다 보지 않아 **미확인**. 다만
`SudokuScreen.tsx:694` `cellMine: colors.primary` 처럼 **primary 가 '나'를 뜻하는 자리**가 섞여 있다(3절).

### 2-3. 빨강 계열 용도

**토큰 `danger`(`#E12D33`) 47참조** — 용도별:
- 입력 오류·경고: `TextField.tsx:102,105`, `DateField.tsx:94,97`, `LoginScreen.tsx:123`, `RegisterScreen.tsx:227`, `ConsentGateScreen.tsx:127`, `ScheduleMessageSheet.tsx:304`, 로드 실패 배너 `DietCalendarScreen.tsx:202`·`WorkoutCalendarScreen.tsx:209`, `EmptyState.tsx:52`
- 삭제·파괴적 동작: `ConfirmDialog.tsx:17`, `MessageActionSheet.tsx:156,200`, `SettingsList.tsx:196`, `PlaceDetailScreen.tsx:201`, `ContentDetailScreen.tsx:271`, `TripDetailScreen.tsx:651`, `JournalDayScreen.tsx:406,542`, `VoiceClipsScreen.tsx:301`, `WorkoutProgramDetailScreen.tsx:216` 등
- 새 소식 배지·점: `StickerPanel.tsx:643`, 선물 수 배지 `DietRecordScreen.tsx:2079`·`WorkoutRoutineListScreen.tsx:371`
- 초과: `NutritionRing.tsx:61,109`, 글자 수 초과 `TextStickerSheet.tsx:151`
- 녹음 중 점: `VoiceRecordSheet.tsx:173`, `VoiceClipsScreen.tsx:385`
- 일요일·공휴일: `DatePickerSheet.tsx:324`, `CoupleCalendarScreen.tsx:1046`(주석 `:1044-1045` — "coral 은 이름과 달리 금색이라 빨간 날로 안 읽힌다")
- 게임: 스도쿠 오답 `SudokuScreen.tsx:696`, 뿌요 대기 방해 `PuyoScreen.tsx:1218-1219`
- **럽슐랭 지도 핀 전부**: `PlaceScreen.tsx:230` `color: colors.danger`

**토큰 `dangerBg`/`dangerText`** 3/6참조(배지 'rose').

**하드코딩 빨강**: 벽 레이스 상대 말 `#E5484D`(`WallRaceScreen.tsx:48`), 뿌요 조각 1번 `#E5484D`(`PuyoBoard.tsx:34`), 펜 `#E5484D`(`DrawingCanvas.tsx:26`).

**하트**: 하트 아이콘에 빨강을 쓰는 곳은 없다. `UpgradeSheet.tsx:59` 는 `colors.together`, 채팅 안 읽음 하트는 상대 색(`chatTheme.ts:591`),
`HeartSproutIcon.tsx:18` 분홍 `#E8829E`, 앱 아이콘·`DoublyLogo` 의 하트는 코랄 `#F28472`.

**`coral` 은 이름만 빨강이고 값은 '나' Gold** — 그런데 "빨강"을 기대하고 쓴 흔적이 남아 있다: 앨범 달력 일요일 `AlbumCalendar.tsx:126,143`,
오늘 D-day 배지 `CoupleCalendarScreen.tsx:751`, 불꽃 `WorkoutScreen.tsx:317`, 당 추세 `DietStatsScreen.tsx:277`, 전화 부재 `ChatRoomScreen.tsx:2219`,
남은 무게 `PlateCalculatorSheet.tsx:157`, 앨범 지도 `AlbumMap.tsx:51`. (coral 23참조 중 소유자 의미는 일부 — 3절)

### 2-4. 캘린더 카테고리 4색

`screens/home/CoupleCalendarScreen.tsx:68-74` `typeMeta()`(렌더 시점에 팔레트를 읽는 함수):

| 타입(`types/index.ts:300`) | 라벨 | 색 토큰 | light | dark |
| --- | --- | --- | --- | --- |
| ANNIVERSARY | 기념일 | `colors.violet` | `#59772D` | `#C9DA97` |
| BIRTHDAY | 생일 | `colors.coral` | `#8A6817` | `#F1C999` |
| DATE | 데이트 | `colors.indigo` | `#2C7D33` | `#A7D2A9` |
| ETC | 기타 | `colors.textSecondary` | `#585E58` | `#A8AEA6` |

- **카테고리 3색이 소유자 색과 같은 토큰이다** — 생일 = 나 색, 데이트 = 상대 색, 기념일 = 함께 색. 같은 화면에서 누구 일정인지도 표시하므로(3절) 색 의미가 겹친다.
- 사용처: 날짜 점 `:572`, 필터 칩 `:869,874`, 기념일 바 `:667`, 여행 바 `:625`(accent), D-day 오늘 `:751`(coral).
- 홈 미리보기 `screens/home/components/EventPeek.tsx:26-31` 은 색이 아니라 **아이콘**으로 구분, 아이콘 색은 전부 `colors.coral`(`:57`).
- 액센트 변형을 바꾸면 카테고리 색도 같이 바뀐다(토큰을 공유하므로).

---

## 3. 나/상대 구분

### 3-0. 결론

- **모든 화면이 보는 사람 기준이다.** frontend/src 에 userA/userB·user1/user2·requester·ownerId 같은 고정 슬롯 분기는 0건.
  판별은 두 가지뿐이다 — ① 서버가 요청자 기준으로 `mine`/`myX`/`partnerX` 를 내려준다(4-4) ② 클라이언트가 `useAuthStore().user.id` 를
  `senderId`/`createdBy`/`visitedBy` 와 비교한다.
- 구분 수단은 **색(me/partner 토큰) + 위치(왼쪽 나·오른쪽 상대) + 라벨("나"/상대 이름)** 의 조합이고, 화면마다 섞는 비율이 다르다.
- 토큰 사용량(colors.ts 제외): coral 21 · me 20 · together 20 · togetherText 20 · partner 18 · togetherBg 12 · indigo 8 · meBg 7 · partnerBg 6 ·
  meFill 5 · violet 4 · meText 4 · togetherFill/partnerText/partnerFill 각 3 · mePastelBg/togetherPastelBg/couple 각 2.
  이 중 **together 계열 대부분은 나/상대 구분이 아니라 "함께"·브랜드 장식**이다(럽슐랭 배지·팡파르, 추억, 잠금 카드, 업그레이드 시트, 스티커 상점 등).

### 3-1. 화면별

| 화면 | 구분 방식 | "나" 판별 | 근거 |
| --- | --- | --- | --- |
| **럽슐랭 목록·상세** | 별점 글자 me/partner 색, "내 픽/상대 픽" 배지 | 서버 `myRating`/`partnerRating`(`J/place/dto/PlaceResponse.java:31-32`, `PlaceService.ratingPairOf` `:464-474` 가 `userId.equals`) | `screens/place/PlaceScreen.tsx:477,480`, `PlaceDetailScreen.tsx:456,459`, 입력 별 `:488`, `components/SoloPickBadge.tsx:24-25` |
| 럽슐랭 방문 기록 | 별 색 me/partner | 클라 `item.visitedBy === myUserId` | `PlaceDetailScreen.tsx:85,658` |
| 콘텐츠 | 평점 요약 me/partner, 관람 기록 별은 **누구 것이든 togetherText** | 서버 `myRating`/`partnerRating`(`J/content/dto/ContentResponse.java:24-25`) | `screens/content/ContentDetailScreen.tsx:314,317,342,593` |
| **캘린더 누구 일정** | **텍스트 배지만**("내 일정/나만 보기/{이름} 일정"), 배지 색은 중립(surfaceAlt+textSecondary). 우리(SHARED) 일정은 배지 없음 | 클라 `event.createdBy === myId` | `screens/home/CoupleCalendarScreen.tsx:84-94,139,418`, 스타일 `:1092-1102`, 다녀온 곳 `visitedBy === myId` `:684` |
| 홈 일정 미리보기 | 같은 규칙, 텍스트 | `useAuthStore` | `screens/home/components/EventPeek.tsx:38-45` |
| **무드 달력** | 칸 왼쪽 나·오른쪽 상대(위치), 범례 "왼쪽 나" me 색·상대 이름 partner 색, 그날 흐름 이름 색 | 서버 `MoodCalendarDay(date, mine, partner)`(`J/mood/dto/MoodCalendarResponse.java:27`), `MoodDayEntry.mine`(`MoodDayResponse.java:21`) | `screens/mood/MoodCalendarScreen.tsx:184,186,243-244,258` |
| **채팅 말풍선** | 위치(내 것 오른쪽·row-reverse, 상대 왼쪽+아바타) + 말풍선 색. **내 말풍선 = primaryFill(초록), 상대 = 회색 `bubbleTheirs`** — me/partner 토큰 아님 | 클라 `item.senderId === myId` | `screens/chat/ChatRoomScreen.tsx:242,1900,3120,3256,2050-2053`, `theme/chatTheme.ts:587` |
| 채팅 운동·식단 공유 카드 | mine meBg/me/meText, theirs partnerBg/partner/partnerText | 같은 비교 | `ChatRoomScreen.tsx:3154-3157,3198-3199` |
| 채팅 PR·목표 카드 | **보낸 사람과 무관하게** couple(=나 Gold) 테두리 + mePastelBg | — | `ChatRoomScreen.tsx:3161,3203` |
| 채팅 답장 인용 바 | mine coral / theirs indigo | 같은 비교 | `ChatRoomScreen.tsx:3267-3268` |
| 채팅 사진 뷰어 제목 | coral / indigo | 같은 비교 | `ChatRoomScreen.tsx:279`, `ChatPhotoGalleryScreen.tsx:59` |
| 채팅 리액션 칩 | 내가 누른 것 = **primary/primarySoft** | `r.userIds.includes(myId)` `:2319` | `ChatRoomScreen.tsx:3295` |
| 채팅 안 읽음 하트 | 기본 테마 = app.partner, 그 외 테마는 하드코딩 | — | `chatTheme.ts:591` |
| 채팅 검색 결과 | 라벨 "나"/상대 이름 | `senderId === myId` | `components/ChatSearchModal.tsx:172` |
| **럽바디 주간 점** | 위치(왼 나·오 상대) + 모양(채움/빈 원) + 색 me/partner | 서버 `myDates`/`partnerDates`(`J/workout/.../CoupleWeekResponse.java:15`, `CoupleMealGoalResponse.java:22`) | `components/WeekStrip.tsx:4-11,77,81` |
| 대결(챌린지) | 막대 "나"/"상대" + me/partner, 리드·내기는 together | 서버 `myCount`/`partnerCount`(`ChallengeResponse.java:24`) | `screens/workout/ChallengeScreen.tsx:147,153,295-301` |
| 식단 화면 상대 식사 | FeedCard, 소유자 색 없음(텍스트) | — | `screens/diet/DietScreen.tsx:862-875,914,960` |
| 체성분·운동/식단 통계 | 나만 봄 — 구분 없음 | — | `BodyMetricScreen.tsx:80` |
| **사진첩 그리드** | 소유자 표시 없음(접근성 라벨만 "내/{이름} 사진") | 서버 `mine`(`J/feed/dto/FeedPhotoResponse.java:30`) | `screens/album/AlbumScreen.tsx:671-672` |
| 사진첩 누구 필터 | 공용 Chip — primary | — | `AlbumScreen.tsx:604-606` |
| 사진 뷰어 제목 | `p.mine ? coral : indigo` | 서버 mine | `AlbumScreen.tsx:289`, `TripAlbumScreen.tsx:77` |
| 피드 카드 | "나"/이름/"둘이" 텍스트(textSecondary), 리액션 mine = primary | 서버 mine(`FeedItemResponse.java:22`) | `screens/home/components/FeedCard.tsx:127,271,407,459` |
| 피드 댓글 | 내 댓글 오른쪽 정렬 + surfaceAlt, 작성자 이름 me/partner | 서버 mine(`FeedCommentResponse.java:14`) | `screens/feed/FeedCommentsScreen.tsx:144,200` |
| **홈 CoupleHero** | 위치(왼 나·오 상대) + 아바타 채움 meFill/partnerFill + 오늘 링 me/partner | 나 = authStore user, 상대 = couple.partner | `screens/home/components/CoupleHero.tsx:127-149,198-204` |
| 홈 배경 | 그라데이션 [meBg, partnerBg] | — | `screens/home/HomeScreen.tsx:108` |
| 홈 왕관 | 둘 다 lovelichelinGold, mine 은 햅틱만 | — | `screens/home/components/AvatarCrown.tsx:82,123` |
| **오목** | 흑/백 돌(의도적 하드코딩) + 차례 칩 "나"/이름, 활성 칩 primary | 서버 stones 'M'/'P', `myColor` | `screens/home/OmokScreen.tsx:216,591-592` |
| **스도쿠** | **나 = primary, 상대 = accent(=함께 Olive)** | 서버 owners 'M'/'P' | `screens/home/SudokuScreen.tsx:423-425,694-695` |
| **벽 레이스** | **나 = 파랑 `#2F6FEB`, 상대 = 빨강 `#E5484D` 하드코딩**, 목표줄 `#DCE8FF`/`#FFE1E2` | 서버 `myPawn`/`myTurn` | `screens/home/WallRaceScreen.tsx:47-48,362-363,415,526,533` |
| 캐치마인드·뿌요 | 텍스트(역할·이름)만 | `role === 'DRAWER'`, `senderId === myId` | `screens/home/CatchMindScreen.tsx:239`, `screens/home/PuyoScreen.tsx:621` |
| **오늘의 질문** | 라벨 "나"/이름, 상대 답 박스 테두리만 **accent(Olive)** | 서버 `myAnswer`/`partnerAnswer` | `screens/home/DailyQuestionScreen.tsx:171,176,277` |
| 스트릭 | 홈은 사람별 색 없음(HeartSproutIcon+textSecondary) | — | `CoupleHero.tsx:221-225` |
| **홈 위젯** | "나 🔥" me, 상대 partner — 하드코딩 hex | 위젯 데이터 | `widget/DoublyWidget.tsx:22-23,70,84,88` |
| 일상·하루 기록 | 내 기록만 — 구분 없음, primary | — | `screens/journal/JournalScreen.tsx:295` |
| MY | 내 아바타 meFill, 주간 리캡 행 점 me/partner/together | 서버 `myWorkoutDays` 등(`WeeklyRecapResponse.java:9`) | `screens/my/MyScreen.tsx:477,617`, `components/WeeklyRecapCard.tsx:33,40,43` |
| 여행 정산 | 라벨 "내가 결제"/"{이름}님이 결제", 결제자 칩은 **나든 상대든 secondary(=상대 Green)** | 서버 mine(`TripExpenseResponse.java:13`) | `screens/trip/TripExpenseScreen.tsx:246,458,462` |


### 3-2. 보는 사람 기준인가

전부 그렇다. 서버 DTO 는 요청자 id 로 mine/partner 를 계산하고(`PlaceService:464-474`, `MoodCalendarService.java:116,135`, `FeedItemMapper.java:77`
`viewerId.equals`, `WorkoutService.java:557-560`), 클라 비교도 로그인 사용자 id 다. 그래서 **같은 사람이 내 폰에선 Gold, 상대 폰에선 Green** 으로 보인다.
user_a/user_b(4-3)를 색 결정에 쓰는 곳은 없고, 프론트로 내려오지도 않는다.

### 3-3. 아바타·이니셜

- `components/Avatar.tsx:16-27` — 이미지가 있으면 원형 사진(배경 surfaceAlt), 없으면 `name.charAt(0)` 이니셜 + 배경 `color` prop(기본 surfaceAlt), 글자 `onColor(color)`.
  → **소유자 색은 프로필 사진이 없을 때만 보인다.**
- 소유자 색을 넘기는 곳: 나 meFill — `HomeScreen.tsx:758`, `MyScreen.tsx:477,617`, `CoupleHero.tsx:131→201/204` / 상대 partnerFill — `ChatRoomScreen.tsx:1981,2053`, `CoupleHero.tsx:144→201/204`.
  CoupleHero 는 바깥 오늘 링(`:200`)·링 없을 때 테두리(`:198`)도 소유자 색이라 사진이 있어도 색이 보인다.
- 중립 아바타: `screens/chat/ChatScreen.tsx:80`(방 목록 상대), `CoupleEmojiCreateScreen.tsx:606`, `TrainerDashboardScreen.tsx:116`.
- 럽슐랭·캘린더·무드·사진첩·피드·게임·질문에는 아바타가 없다 — 이름 텍스트로 구분.

### 3-4. 토큰 규칙에서 벗어난 곳

1. 스도쿠 나=primary·상대=accent(`SudokuScreen.tsx:694-695`) / 오늘의 질문 상대=accent(`DailyQuestionScreen.tsx:277`) — partner 토큰을 안 쓴다.
2. 벽 레이스 파랑/빨강 하드코딩(`WallRaceScreen.tsx:47-48`) — `colors.ts:10` 이 정당 색 소지로 버린 바로 그 조합.
3. 위젯 hex 하드코딩(`DoublyWidget.tsx:22-23`).
4. 채팅 내 말풍선·리액션·피드 리액션·`components/MealCard.tsx:225` 의 "내 것" = primary(크롬), me 아님.
5. 여행 결제자 칩 나/상대 모두 secondary(`TripExpenseScreen.tsx:458`).
6. PR·목표 카드가 상대 것도 Gold(`ChatRoomScreen.tsx:3161,3203` — 주석상 "성취 색"으로 의도).
7. 콘텐츠 관람 기록 별은 together 고정(`ContentDetailScreen.tsx:593`)인데 럽슐랭 방문 기록은 사람별(`PlaceDetailScreen.tsx:658`) — 불일치.
8. 소유자 별칭을 다른 뜻으로 — 캘린더 종류(2-4), 일요일 coral(`AlbumCalendar.tsx:126,143`)·토요일 indigo(`DatePickerSheet.tsx:325`), 앨범 지도 핀 전부 coral(`AlbumMap.tsx:51`),
   나트륨 indigo·당 coral(`DietStatsScreen.tsx:276-277`), 경고 배너 meBg/meText(`components/ServiceStatusBanner.tsx:84`).
9. `components/Badge.tsx:22-23` tint green=partner·amber=me 계열 — `<Badge` 사용처 0건(죽은 코드).

### 3-5. 미확인

- 비기본 채팅 테마 9종의 bubbleMine 이 me 색과 무관한 것이 의도인지 — 주석(`chatTheme.ts:4-7`)으로만 확인.
- `ChatPhotoGalleryScreen` 의 myId 는 route param(`ChatRoomScreen.tsx:2952`)으로 오는데 다른 진입 경로 유무.

---

## 4. 백엔드와 DB

### 4-1. 테이블·엔티티

**users** — `V1:6-17` id·email·password·name·birth_date·gender·profile_image_url·role·social_type·social_id·created_at·updated_at,
이후 `V23:4-9` 약관 동의 4컬럼, `V25:6` notifications_enabled, `V34:2` height_cm, `V58:10-13` notify_chat/anniversary/partner/reminder,
`V85:12` auto_analyze_meal_photo, `V110:5` withdrawal_scheduled_at.
엔티티 `J/user/domain/User.java`(필드 `:34-129`), created/updated 는 `J/common/domain/BaseTimeEntity.java:21,25`.

**relations** — `V1:22-31` id·relation_type·**user_a_id**(NOT NULL)·**user_b_id**(연결 전 NULL)·invite_code·code_expires_at·status·connected_at·ended_at·created_at,
`V3:2` background_image_url, `V4:2` anniversary_date, `V7:16` diet_goal_days, `V24:9` restore_requested_by, `V32:16` relation_name.
엔티티 `J/relation/domain/Relation.java`(필드 `:35-90`, `partnerOf()` `:192`). updated_at 없음.

**relation_members** — 존재한다. `M/V32__relation_members.sql:5-13` id·relation_id·user_id·member_role(PARTNER/TRAINER/MEMBER/GUARDIAN/CHILD)·joined_at,
UNIQUE(relation_id,user_id). 백필(`V32:20-33`)은 COUPLE 두 사람 모두 PARTNER, joined_at = `COALESCE(connected_at, created_at)`.
엔티티 `J/relation/domain/RelationMember.java`(`:36-50`). 이후 ALTER 없음.

### 4-2. 사람별 색·표시 설정 필드

**없다.** 전 마이그레이션(SQL + Java)과 엔티티에서 color/theme/accent/nickname/avatar 검색 0건. 별도 설정 테이블(user_settings 등)도 없다.
비슷한 이름은 사람 설정이 아니다 — 오목 돌 `myColor`(BLACK/WHITE, `J/game/dto/OmokGameResponse.java:14,28`), AI 프롬프트 hairColor(`J/coupleemoji/service/CoupleEmojiPrompts.java:40`).
앱 쪽 테마·액센트도 **기기별 로컬 저장**이다(`themePreference.ts:25,29`) — 두 사람이 서로의 설정을 알 수 없다.

### 4-3. 두 사람의 순서

- **user_a = 초대 코드를 만든 사람, user_b = 수락한 사람.** 엔티티 주석 `Relation.java:41`("요청자"), `:45`("수락자 — 연결 전 NULL").
  - 생성: `J/relation/service/RelationService.java:105-111` `createCoupleInvite` → `.userAId(userId)`
  - 수락: 같은 파일 `:168` `relation.connect(userId)` → `Relation.connect()`(`:106-112`)가 userBId·connectedAt 설정, invite_code·code_expires_at 을 비운다.
  - 트레이너도 같음(`:194-196` userAId=trainer, `:233` connect(member)).
- 순서 근거로 쓸 때 주의:
  - 연결 후 invite_code 가 NULL → **남는 근거는 user_a_id 뿐**.
  - connected_at 은 관계당 하나라 사람 구분 불가.
  - relation_members.joined_at 은 사람별이지만 V32 백필분은 두 사람이 같은 값.
  - FAMILY 는 `reassignOwner`(`Relation.java:139-144`)로 user_a 가 바뀔 수 있다. COUPLE 에서 호출되는지는 **미확인**.
  - 게임 owner_map 의 '1'/'2' 는 user_a/b 가 아니라 created_by 기준(`M/V86` 주석 `:7`).

### 4-4. 서버가 '나/상대'를 내려주는 방식 — 이미 **보는 사람 기준**

- mine/partner 쌍: `J/relation/dto/RelationResponse.java:20`(주석 `:14` "조회 주체 기준 상대방"), `J/chat/dto/ChatRoomResponse.java:10`,
  `J/mood/dto/MoodResponse.java:5-6`, `J/mood/dto/MoodCalendarResponse.java:27`, `J/place/dto/LovelichelinPulseResponse.java:7`,
  게임 winner "ME"/"PARTNER"(`J/game/dto/PuzzleBattleResponse.java:24`, `WallRaceGameResponse.java:53`)
- myRating/partnerRating: `J/place/dto/PlaceResponse.java:31-32`, `J/content/dto/ContentResponse.java:24-25`
- `boolean mine`: `J/mood/dto/MoodDayResponse.java:21`, `J/feed/dto/FeedItemResponse.java:22`, `FeedCommentResponse.java:14`, `FeedPhotoResponse.java:30`,
  `ReactionSummary.java:7`, `J/trip/dto/AlbumPostResponse.java:19`, `TripExpenseResponse.java:13`
- id 만(프론트가 비교): 채팅 `J/chat/dto/ChatMessageResponse.java:13` senderId, 캘린더 `J/calendar/dto/EventResponse.java:31` createdBy
- `PartnerUserResponse`(`J/auth/dto/PartnerUserResponse.java:17-21`) 는 id·name·profileImageUrl·withdrawalScheduledDate 뿐 — user_a/b 여부는 **내려오지 않는다**.

### 4-5. Flyway

- origin/main 최대 **V128**(`V128__device_token_last_registered_at.sql`). Java 마이그레이션은 `backend/src/main/java/db/migration/V119__feed_post_record_date.java` 하나.
- 중복 없음. 빈 번호 V48·V114. **다음은 V129** — 단 병렬 세션이 여럿 돌고 있으므로 쓰기 직전 CLAUDE.md 7절 명령으로 다시 셀 것.

---

## 5. 앱 밖으로 보이는 부분

### 5-1. 스플래시·상태바·내비게이션 바

- 네이티브 스플래시: `frontend/app.json:17-25` expo-splash-screen 플러그인 `backgroundColor: "#FFFFFF"`, 이미지 `assets/splash-icon.png`(투명 바탕 마크).
  **다크용 `dark` 설정 없음** → 다크 기기에서도 흰 스플래시.
- JS 스플래시 `screens/onboarding/SplashScreen.tsx:50` `<DoublyMark size={72} />`, 배경 `colors.background`(`:59`) = `#FAFAF9`/다크 `#1E201C`.
  → 네이티브 `#FFFFFF` → JS `#FAFAF9`(다크면 `#1E201C`)로 넘어간다.
- `userInterfaceStyle: "automatic"`(`app.json:15`).
- 상태바: `frontend/App.tsx:104` `<StatusBar style="auto" />`, 배경색 지정 없음. src 내 StatusBar·NavigationBar API 사용 0건.
  `app.json` 에 androidStatusBar·androidNavigationBar·primaryColor 없음.
- 웹: `app.json:132-141` themeColor·backgroundColor `#FFFFFF`. PWA `frontend/public/manifest.json:9-10` background_color `#FAFAF9`, theme_color `#FFFFFF`(둘이 다름).

### 5-2. Android 네이티브 리소스

- `frontend/android`·`frontend/ios` 는 **gitignore(CNG)**(`frontend/.gitignore:45-46`), 커밋 0건 — EAS 가 app.json 으로 다시 생성.
- 로컬에만 있는 prebuild 산출물(2026-09-23): `res/values/colors.xml` splashscreen_background·iconBackground `#FFFFFF`, **colorPrimary `#023c69`**(Expo 기본값),
  `values-night/colors.xml` 비어 있음, `styles.xml` statusBar·navigationBar transparent. 최신 app.json 과 일치하는지는 **미확인**(오래된 산출물).
- 어댑티브 아이콘 배경 `#FFFFFF`(`app.json:115`), 전경·단색 PNG(`:116-118`).
- 알림 아이콘 색: `app.json:75-81` expo-notifications `color: "#F28472"`(코랄 — 이미 새 아이콘 색).

### 5-3. iOS

- `app.json:102-109` ios 블록에 색 키 없음. ios 폴더가 로컬에도 없어 AccentColor·SplashScreenBackground colorset **미확인**(CNG 생성물).

### 5-4. 홈 위젯

`widget/DoublyWidget.tsx:18-24` — background `#FBF8F3`(구 크림) · ink `#14162B` · sub `#62687A` · **me `#8A6817` · partner `#2C7D33`**.
라이트 고정(주석 `:10-11`). 앱 팔레트를 import 하지 않고 복사했으며 ink·sub·background 는 이미 현 팔레트(`#1A1D1A`·`#585E58`·`#FAFAF9`)와 **어긋나 있다**.
액센트 변형도 따르지 않는다. 위젯 플러그인 설정(`app.json:56-73`)에 색 없음. 나머지 위젯 파일에는 색 없음.

### 5-5. 푸시·공유 이미지

- 백엔드 푸시 payload(`J/notification/service/ExpoPushNotificationService.java:321-331`) — to·title·body·sound·data.link 뿐, color·channelId 없음.
  프론트 `setNotificationChannelAsync`·lightColor 0건. → 알림 강조색 출처는 `app.json` 의 `#F28472` 하나.
- 공유 카드 이미지 생성(view-shot·captureRef·서버 이미지) **없음**. 유일한 이미지 생성은 캐치마인드 그림 PNG(`components/DrawingCanvas.tsx:167-189`) — 흰 바탕(`:285`) + 펜 6색(`:26`).
  `utils/catchMindShare.ts` 에 색 없음.

### 5-6. 아이콘·마크·랜딩·스토어

- 아이콘 원본 `store/icon/make_icon.py:24-26` BG `#FFFFFF` · CORAL `#F28472` · SKY `#62A8EC`. 산출물 목록 `:187-200`(icon.png, splash-icon.png, android-icon-*, notification-icon.png, favicon, play_icon_512).
- 인앱 마크 `components/DoublyLogo.tsx:34-37` 같은 코랄·하늘(왼쪽 숟가락+하트 = 코랄, 오른쪽 = 하늘, `:45-57`). **아이콘의 "왼쪽/오른쪽"이 나/상대 중 어느 쪽인지 정의된 곳은 없다.**
- 랜딩 `landing/index.html:23-30` `--brand #2a7731` · `--brand-dark #1f5a25` · `--accent #8a6817`, 다크 `:116-124`(`--brand #4e9e56`, 헤더 초록 그라데이션 `#256a2b→#17421c`).
  privacy/support/terms 링크 `#2f8f5b`. → **랜딩은 아직 초록·금색**.
- 스토어 그래픽(`store/`)은 옛 색(`APP_ICON_COLOR_2026-10-02.md` "남은 것"). 스크린샷 합성 스크립트(`store/compose.py` 등) 색은 **미확인**.

---

## 6. 정리

### 6-1. 영향 범위

**A. 토큰 값만 바꾸면 따라오는 곳**
- `theme/colors.ts` 의 me/partner/together 계열(5키×3) + 별칭 coral/indigo/violet/couple/health/food/secondary/accent → 소유자 색 참조 전부
  (me 20 · partner 18 · together 20 · togetherText 20 · meBg 7 · partnerBg 6 · coral 23 · indigo 8 · accent 34 · secondary 12 등).
- primary 계열(316+65+36+15+8+2 참조) → 버튼·탭·링크·선택 상태·스피너 전부.
- 기본 채팅 테마 내 말풍선(primaryFill)·안 읽음 하트(partner)(`chatTheme.ts:587,591`).
- 3변형 × 2스킴 = **6벌**을 모두 채워야 한다(`colors.ts:291-292` 경고: Partial 이라 빠뜨려도 컴파일러가 못 잡는다). `npm run verify:theme` 로 대비 확인.

**B. 하드코딩이라 직접 고쳐야 하는 곳**
| 자리 | 위치 |
| --- | --- |
| 홈 위젯 me/partner·배경 | `widget/DoublyWidget.tsx:19-23` |
| 벽 레이스 내 말(파랑)·상대 말(빨강)·목표줄 | `screens/home/WallRaceScreen.tsx:47-48,362-363,526,533,810` |
| 지도 경로선 `#4A5BFF`, 티어 배지 `#D4A017` | `utils/kakaoMapHtml.ts:144,230`, `components/KakaoMap.web.tsx:195` |
| 홈 그라데이션(background rgba 복사) | `screens/home/HomeScreen.tsx:134-146` — 배경 값을 바꿀 때만 |
| 마크(이미 새 색) | `components/DoublyLogo.tsx:35-36` — primary 를 코랄/하늘로 할 경우 기준점 |
| 앱 밖 | `app.json` 스플래시·어댑티브·알림 색·web, `public/manifest.json`, `landing/*.html`(아직 초록), `store/` 그래픽 |

**C. 의미를 다시 정해야 하는 곳 (값이 아니라 토큰 선택이 문제)** — 토큰만 바꾸면 의도와 다르게 변한다
- 캘린더 카테고리 3색이 소유자 토큰(`CoupleCalendarScreen.tsx:70-72`) → 나=빨강이 되면 "생일"이 빨강, 상대=파랑이면 "데이트"가 파랑.
- coral 을 '빨강'으로 기대한 자리 8곳(2-3) → 나 색이 빨강이 되면 우연히 맞아지고, 파랑이 되면 일요일이 파랑이 된다.
- 소유자 의미 없이 별칭을 쓰는 장식: accent 34(배지·별점 별·여행 모드), secondary 12(여행 칩·결제자), 운동 통계 카테고리(`WorkoutStatsScreen.tsx:24-26`), 영양 추세(`DietStatsScreen.tsx:276-277`), 토요일(`DatePickerSheet.tsx:325`).
- primary 가 '나'를 뜻하는 자리(스도쿠 `SudokuScreen.tsx:694`) 등 3절에서 찾은 불일치.
- 기본 채팅의 내 말풍선이 me 가 아니라 primaryFill.

**D. 서버 변경이 필요한 곳**
- "보는 사람 기준"이면 **없다** — 서버는 이미 mine/partner·isMine·senderId 로 보는 사람 기준 데이터를 준다(4-4).
- "사람마다 고정"이면 필요하다 — 4-3 의 user_a/user_b 를 프론트에 노출하는 필드(예: RelationResponse 에 `myPosition` 또는 user 별 color)와,
  색을 사용자가 고르게 한다면 저장 컬럼 + 마이그레이션(V129~) + 상대에게 실시간 반영(`CoupleEventPublisher`).

### 6-2. 두 방식 비교

| | 보는 사람 기준 (내 폰에서 나=빨강, 상대 폰에서도 그 사람 자신이 빨강) | 사람마다 고정 (A 는 어디서나 빨강, B 는 어디서나 파랑) |
| --- | --- | --- |
| 지금 구조와 | **지금이 이 방식이다**(3절 판별이 전부 myId/mine 비교) | 새로 만든다 |
| 프론트 | `theme/colors.ts`(6벌) 값 교체 + 6-1 B·C 정리(스도쿠·질문·벽 레이스·위젯·결제자 칩·캘린더 종류색 등 십여 곳) | 위 전부 + 소유자 색을 고르는 자리 전부가 "mine 인가" 대신 "이 사람이 A 인가 B 인가"로 바뀌어야 함. 소유자 토큰(me·partner 계열·coral·indigo)을 쓰는 tsx **30파일**(grep) + `chatTheme.ts`(하트·강조행) + 위젯 데이터. 실무상 `ownerColor(userId)` 같은 헬퍼 하나로 모으는 리팩터가 선행 |
| 서버 | 없음 | DTO 에 순서/색 노출, (선택형이면) 컬럼 + V129 + 이벤트 발행 + Purger 영향 없음(users 컬럼이면) |
| 데이터 | 없음 | 기존 커플은 user_a/b 로 자동 배정 가능. FAMILY 의 reassignOwner·COUPLE 재연결 시 순서 유지 여부 **미확인** |
| 배포 | EAS Update(JS) — 단 `app.json`·아이콘·스플래시를 바꾸면 빌드(fingerprint 입력) | 서버 배포 + Update. 구버전 앱은 새 필드를 무시하므로 깨지지는 않음 |
| 장점 | 작업이 작다. "내 것"이 늘 같은 색이라 내 화면 해석이 쉽다 | 두 사람이 같은 화면을 보며 "빨강이 너"라고 말할 수 있다. 아이콘의 두 숟가락과 사람을 묶을 수 있다 |
| 단점 | 두 폰에서 같은 사람이 다른 색 — 화면을 같이 볼 때 혼동 | 내 색이 파랑인 사람은 "내 것" 강조가 차가운 색. 셋 이상(패밀리)으로 확장 시 색 배정 규칙 필요 |
| 작업량(상대 비교) | 작음 — 토큰 1파일 + 의미 정리 수십 곳 | 큼 — 위 + 소유자 색 참조 파일 전수 + 서버 |

### 6-3. 위험·이상한 점

1. **primary 와 partner 가 사실상 같은 색이다.** light ΔE(CIE76) primary `#2A7731` vs partner `#2C7D33` = **3.1**, primaryFill vs partnerFill = 5.0.
   mint·peach 변형은 **완전히 같은 hex**(`colors.ts:300,302` / `:318,320`). `colors.ts:113-115` 주석이 이미 "크롬 = 상대 색 → 앱이 상대 것처럼 보인다"를 경고했는데
   현재 값이 그 상태다. verify:theme 에 이 구분 규칙이 없다(`verify-theme-contrast.mjs:153-156` 은 왕관 금색만 본다).
   → 검토 중인 "primary 를 따로" 방향의 직접 근거.
2. **토큰 이름과 값이 어긋나 있다** — `coral`=금색, `indigo`=초록, `violet`=올리브. 다음 교체에서 나=빨강이 되면 coral 이 다시 "맞는 이름"이 되지만
   상대=파랑이면 indigo 도 맞아진다. 이름이 맞아지는 순간 별칭을 지우기 어려워지므로 **교체와 동시에 별칭을 걷을지** 정할 것.
3. **캘린더 카테고리가 소유자 토큰을 공유한다**(2-4) — 같은 화면에 주인 배지도 있어 의미가 겹친다.
4. **벽 레이스만 이미 나=파랑·상대=빨강 하드코딩**(`WallRaceScreen.tsx:47-48`). 새 체계가 나=빨강이면 정반대가 된다.
5. **스도쿠는 나=primary, 상대=accent(함께 Olive)**(`SudokuScreen.tsx:694-695`, 범례 `:423-425`) — 토큰 의미(나=Gold)와 다르다.
6. **기본 채팅의 내 말풍선은 me 가 아니라 primaryFill**(`chatTheme.ts:587`), 안 읽음 하트는 partner(`:591`). primary 를 바꾸면 말풍선도 바뀐다.
7. **럽슐랭 지도 핀이 전부 danger(에러 빨강)**(`PlaceScreen.tsx:230`). 나=빨강이 되면 "내 장소"로 오해될 수 있다.
8. **danger `#E12D33` 와 새 '나' 빨강의 충돌** — 오류·삭제·배지·녹음·일요일이 모두 danger 다. 나 색을 빨강 계열로 하면 hue 를 벌려야 한다(코랄 `#F28472` 쪽).
   success `#1E8652` 도 지금은 primary/partner 와 ΔE 12.7~13.2 로 가깝다 — primary 를 초록에서 떼면 오히려 분리된다.
9. **위젯이 이미 낡은 복사본**(5-4) — 라이트 고정, 액센트 변형 무시, ink·배경이 구 팔레트.
10. **흰 스플래시 → `#FAFAF9`/다크 `#1E201C` 전환**, 다크용 스플래시 없음(5-1). 로컬 android prebuild 의 colorPrimary `#023c69` 는 Expo 기본값이다(커밋 안 됨).
11. **랜딩 사이트는 아직 초록·금색**(`landing/index.html:23-30`), PWA manifest 와 app.json web 의 배경값이 다르다(5-1).
12. **아이콘의 "왼쪽 코랄 / 오른쪽 하늘"이 누구인지 정의된 곳이 없다.** 사람마다 고정 방식이면 이 대응을 먼저 정해야 한다(초대한 사람 = 왼쪽 등).
13. `colors.ts:28-31` 다크모드 주석("다시 시작해야 반영")이 현행 동작(즉시 전환)과 다르다.
14. 액센트·테마는 **기기별** 저장이라 같은 사람도 폰과 PC 웹에서 색이 다를 수 있다. 사람마다 고정 색을 사용자 선택으로 열면 이 설정과 층이 겹친다.
15. **나/상대 표시가 화면마다 다른 수단이다**(3-1) — 캘린더는 텍스트 배지만, 사진첩 그리드는 표시 없음, 채팅은 위치+primary, 홈·무드·럽바디는 위치+색.
    새 색을 정해도 "색으로 구분하는 화면"은 일부뿐이라, 전 화면 일관성을 원하면 색 교체와 별개 작업이다.
16. "내 것" 강조가 me 가 아니라 primary 인 자리(채팅 말풍선·리액션, 피드 리액션, `components/MealCard.tsx:225`)는 primary 를 따로 정하면 **나 색과 갈라진다** — 의도인지 결정 필요.
17. 상대 PR·목표 카드도 Gold(`ChatRoomScreen.tsx:3161,3203`, 주석상 "성취 색") — 나=빨강이 되면 상대 PR 이 "내 색"으로 보인다.
18. `components/Badge.tsx` 는 사용처 0건(죽은 코드)인데 me/partner 토큰을 참조한다 — 교체 시 grep 노이즈.
19. 백드롭 rgba 를 토큰(`colors.backdrop`) 대신 직접 쓴 곳이 ≈20곳 — 색 체계와 무관하지만 다크 분리감 차이(0.42 vs 0.62)가 이 자리들만 안 따라온다.

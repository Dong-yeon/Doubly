# Noto 움직이는 이모티콘 50종 추가 (2026-10-01)

> **같은 날 갱신**: 이 50종은 OTA 전에 **번들에서 빼서 서버 배포로 옮겼다**. 앱 번들 +3.8MB 는 없던 일이 됐다.
> 코드·라벨·순서는 그대로 서버 `ANIM_ALL` 팩의 뒤에 붙는다. 같은 날 키워드 추천 6곳에 끼운 것도 되돌렸다.
> 아래 "바꾼 곳"·"검증"은 번들 시점의 기록이다. 지금 구조는 [SERVER_STICKER_PACKS_2026-10-01](SERVER_STICKER_PACKS_2026-10-01.md).

[STICKER_TRIAL_2026-09-30](STICKER_TRIAL_2026-09-30.md) 의 권장안 1순위다. Fluent·LottieFiles 는 보류하고, 이미 쓰는 Noto 에서 50종을 더 가져왔다.
**110 → 160종.**

## 무엇을 골랐나

"커플 채팅에서 자주 칠 말인데 그림이 없는 것"을 기준으로 골랐다. Noto 881종(피부색 변형을 빼면 611종)에서 뽑았다.
- 사랑 — 🩷 ❤️‍🔥 ❤️‍🩹(화해) 🫂(꼬옥)
- 반응 — 🙂‍↕️ 끄덕 / 🙂‍↔️ 도리도리 / 🙈 부끄 / 🫣 빼꼼 / 🤣 / 🥲
- 컨디션 — 🤒 아파 / 🥶 추워 / 🥵 더워
- 데이트 소재 — 🍗 치킨 / 🍷 와인 / 🍿 팝콘 / ✈️ 여행 / 🎡 관람차 / 📸 찰칵 / 🚗 드라이브 / 🏠 집 / ⏰ 알람

데이트 소재 6종은 **새 분류 "데이트·일상"** 으로 묶었다. 나머지는 기존 8개 분류의 끝에 이어 붙였다 — 기존 110종의 격자 위치가 그대로라 손에 익은 자리가 안 바뀐다.

**중복 제거**: 기존 110종과 Lottie 파일 해시를 대조했다. 🤭 는 기존 `ANIM_OOPS`(앗)와 같은 파일이라 빼고 😁(헤헤)로 바꿨다.

## 출처·형식

- 애니메이션: `https://fonts.gstatic.com/s/e/notoemoji/latest/<codepoint>/lottie.json` — Noto Animated Emoji, CC BY 4.0
  - 기존 110종도 같은 경로다. `two_hearts.json` 해시가 일치하는 것을 확인했다.
- 썸네일: 같은 경로의 `72.png` — Noto Emoji, Apache 2.0
  - 기존 썸네일과 화소 단위로 같다(재인코딩만 다르다).
- 저작자 표시는 이미 `openSourceLicenses.ts` 에 있다. 개수만 160종으로 고쳤다.
- 번들 증가: **+3.8MB**(JSON 50개 평균 76KB, 가장 큰 것은 🦋 244KB). 에셋과 JS 만 바뀌므로 **OTA 로 나간다**.

## 바꾼 곳 (세 카탈로그는 짝이 맞아야 한다)

- `frontend/src/constants/animatedStickers.ts`: 카탈로그 — 순서가 곧 패널 격자 순서다
- `frontend/src/constants/stickerPacks.ts`: `ANIMATED_STICKER_PACKS`(전부 `ANIM_ALL`)
- `backend/.../AnimatedSticker.java`: 서버 enum — 없는 코드는 서버가 유니코드로 통과시켜 상대 화면에 코드 글자가 보인다
- `AnimatedStickerTest`: 110 → 160
- 새 마이그레이션은 없다 — 팩(`ANIM_ALL`)은 이미 시드돼 있고, 개별 코드는 DB 에 없다
- `utils/stickerCodes.ts` 키워드 추천: **기존 묶음 6곳**에 새 그림을 끼웠다.
  - 끼운 곳: 더워 🥵, 추워 🥶, 응/오케이 🙂‍↕️👌, 안아줘 🫂, 헐 🤯, 퇴근 🏠
  - 새 묶음은 만들지 않았다 — 검증이 "묶음 20~30개"와 "묶음마다 캐릭터 스티커 1개"를 요구한다.
  - 치킨·여행·찰칵·부끄·화해처럼 새 그림에만 맞는 말은 **라벨 일치**로 추천된다.

## 검증

- `npm run typecheck` 통과, 바꾼 파일 lint 새 경고 0 — `animatedStickers.ts` 의 import/first 경고는 원래 있던 것이다
- `npm run verify:sticker-codes` 467/467
- `npm run build:web` 성공
- 백엔드 `AnimatedStickerTest`·`StickerPackSyncTest`·`PremiumContentGateTest`·`com.fitto.sticker.*` 25/25
- 50쌍 모두 Lottie 구조(layers·fr)와 72×72 PNG 를 확인했다
- **실기기 미확인** — 두 가지에 막혔다.
  - adb 가 반복해서 멈췄다.
  - 테스트 계정이 약관 재동의 게이트에 걸려 채팅에 못 들어간다.
  - 기존 110종과 같은 출처·같은 형식이라 위험은 낮지만, OTA 뒤 패널 끝부분(데이트·일상)이 뜨는지는 눈으로 봐야 한다.

## 전체 목록

| 분류 | 그림 | 코드 | 라벨 | 코드포인트 | 크기 |
|---|---|---|---|---|---|
| 사랑 | 🩷 | `ANIM_PINK_HEART` | 핑크하트 | `1fa77` | 8KB |
| 사랑 | ❤️‍🔥 | `ANIM_FIRE_HEART` | 불꽃하트 | `2764_fe0f_200d_1f525` | 62KB |
| 사랑 | ❤️‍🩹 | `ANIM_MENDING_HEART` | 화해 | `2764_fe0f_200d_1fa79` | 97KB |
| 사랑 | 🫂 | `ANIM_HUGGING` | 꼬옥 | `1fac2` | 37KB |
| 사랑 | 😚 | `ANIM_KISSING_CLOSED` | 쪽 | `1f61a` | 20KB |
| 웃음 | 🤣 | `ANIM_ROFL` | 데굴데굴 | `1f923` | 76KB |
| 웃음 | 😆 | `ANIM_LAUGHING` | 깔깔 | `1f606` | 57KB |
| 웃음 | 😋 | `ANIM_YUM` | 냠냠 | `1f60b` | 37KB |
| 웃음 | 😉 | `ANIM_WINK` | 찡긋 | `1f609` | 27KB |
| 웃음 | 😜 | `ANIM_TONGUE` | 메롱 | `1f61c` | 72KB |
| 웃음 | 😁 | `ANIM_GRIN` | 헤헤 | `1f601` | 69KB |
| 웃음 | 🫣 | `ANIM_PEEKING` | 빼꼼 | `1fae3` | 114KB |
| 웃음 | 🙂‍↕️ | `ANIM_NOD` | 끄덕끄덕 | `1f642_200d_2195_fe0f` | 17KB |
| 웃음 | 🙂‍↔️ | `ANIM_HEAD_SHAKE` | 도리도리 | `1f642_200d_2194_fe0f` | 37KB |
| 웃음 | 🙈 | `ANIM_SEE_NO_EVIL` | 부끄 | `1f648` | 50KB |
| 속상 | 🥲 | `ANIM_HAPPY_CRY` | 웃프다 | `1f972` | 29KB |
| 속상 | 😿 | `ANIM_CRYING_CAT` | 울보냥 | `1f63f` | 103KB |
| 속상 | 😱 | `ANIM_SCREAM` | 으악 | `1f631` | 88KB |
| 속상 | 🤯 | `ANIM_MIND_BLOWN` | 멘붕 | `1f92f` | 140KB |
| 속상 | 😵‍💫 | `ANIM_DIZZY` | 어질어질 | `1f635_200d_1f4ab` | 37KB |
| 속상 | 🫨 | `ANIM_SHAKING` | 덜덜 | `1fae8` | 61KB |
| 속상 | 😮‍💨 | `ANIM_EXHALE` | 휴 | `1f62e_200d_1f4a8` | 34KB |
| 속상 | 🤒 | `ANIM_SICK` | 아파 | `1f912` | 34KB |
| 속상 | 🥶 | `ANIM_COLD` | 추워 | `1f976` | 51KB |
| 속상 | 🥵 | `ANIM_HOT` | 더워 | `1f975` | 64KB |
| 축하 | 🎆 | `ANIM_FIREWORKS` | 불꽃놀이 | `1f386` | 107KB |
| 축하 | 🪩 | `ANIM_MIRROR_BALL` | 파티 | `1faa9` | 168KB |
| 축하 | 👑 | `ANIM_CROWN` | 왕관 | `1f451` | 157KB |
| 응원 | 👌 | `ANIM_OK` | 오케이 | `1f44c` | 43KB |
| 응원 | ✌️ | `ANIM_VICTORY` | 브이 | `270c_fe0f` | 109KB |
| 응원 | 🤞 | `ANIM_CROSSED_FINGERS` | 행운을 | `1f91e` | 82KB |
| 응원 | 🤙 | `ANIM_CALL_ME` | 연락해 | `1f919` | 77KB |
| 동물 | 🐕 | `ANIM_DOG` | 강아지 | `1f415` | 95KB |
| 동물 | 🐇 | `ANIM_RABBIT` | 토끼 | `1f407` | 79KB |
| 동물 | 🐖 | `ANIM_PIG` | 돼지 | `1f416` | 140KB |
| 동물 | 🦦 | `ANIM_OTTER` | 수달 | `1f9a6` | 91KB |
| 동물 | 🦋 | `ANIM_BUTTERFLY` | 나비 | `1f98b` | 244KB |
| 먹을 것 | 🍗 | `ANIM_CHICKEN` | 치킨 | `1f357` | 81KB |
| 먹을 것 | 🍝 | `ANIM_SPAGHETTI` | 파스타 | `1f35d` | 160KB |
| 먹을 것 | 🍩 | `ANIM_DOUGHNUT` | 도넛 | `1f369` | 150KB |
| 먹을 것 | 🍿 | `ANIM_POPCORN` | 팝콘 | `1f37f` | 132KB |
| 먹을 것 | 🍷 | `ANIM_WINE` | 와인 | `1f377` | 59KB |
| 날씨 | ☁️ | `ANIM_CLOUD` | 구름 | `2601_fe0f` | 29KB |
| 날씨 | ☂️ | `ANIM_UMBRELLA` | 우산 | `2602_fe0f` | 26KB |
| 데이트·일상 | ✈️ | `ANIM_AIRPLANE` | 여행 | `2708_fe0f` | 70KB |
| 데이트·일상 | 🎡 | `ANIM_FERRIS_WHEEL` | 관람차 | `1f3a1` | 59KB |
| 데이트·일상 | 🏠 | `ANIM_HOUSE` | 집 | `1f3e0` | 65KB |
| 데이트·일상 | ⏰ | `ANIM_ALARM` | 알람 | `23f0` | 35KB |
| 데이트·일상 | 🚗 | `ANIM_CAR` | 드라이브 | `1f697` | 36KB |
| 데이트·일상 | 📸 | `ANIM_CAMERA` | 찰칵 | `1f4f8` | 39KB |

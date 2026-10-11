# 스티커 참여 장치 3종 — 문구 스티커 · 앱 맥락 스티커 · 입력 중 추천 (2026-09-28)

> Claude Code 에 넘길 **작업 프롬프트 3개**와 그 근거. 프롬프트는 서로 독립이라 순서대로 한 세션씩 돌리면 된다.
> **권장 순서: ③ 추천(버그 수정 포함, 가장 싸고 효과 큼) → ① 문구 스티커 → ② 맥락 스티커.**
> 관련: `GROWTH_ROADMAP_2026-09-28.md` §5, `COUPLE_EMOJI_ANIMATION_SPEC_2026-09-28.md`, `COUPLE_EMOJI_DUO_SPEC_2026-09-28.md`.

---

## 0. 사전 조사에서 확인한 것 (2026-09-28, `main` 16bbb0a1)

| # | 내용 | 근거 |
| --- | --- | --- |
| S1 | 🔴 **키워드 추천이 사실상 죽어 있다.** `utils/stickerCodes.ts` 의 `KEYWORDS` 표가 가리키는 코드가 전부 **내린 스티커**(`LOVE_BEAR`, `BLI_*`, `DUBI_*`, `BEAR_*`)인데, 앱의 인덱스는 `STICKER_CHARACTERS`(달걀이 `EGG_*` · 구운이♥달걀이 `DUO_*`)로만 만든다(`stickerImages.ts:204`). `byCode()` 가 전부 undefined 라 "사랑해"·"ㅠㅠ" 같은 키워드로는 아무것도 안 뜨고, **라벨이 정확히 같을 때만** 뜬다 | `stickerCodes.ts` KEYWORDS, `stickerImages.ts:204` |
| S2 | `verify-sticker-codes.mjs` 도 내린 코드(`LOVE_BEAR` 등)로 검증하고 있어 이 고장을 잡지 못한다 | `scripts/verify-sticker-codes.mjs:34,72-73,89` |
| S3 | 추천은 **입력 전체가 키워드로 시작/일치**할 때만 뜬다. "나도 사랑해", "오늘 너무 피곤해ㅠㅠ" 처럼 **끝에 오는 키워드**는 못 잡는다. 입력 길이 12자 초과면 아예 끈다 | `suggestStickers()` |
| S4 | 추천 대상이 캐릭터 스티커뿐 — 움직이는 이모티콘(110종 무료)·우리 이모지는 추천되지 않는다 | 같은 함수 |
| S5 | 추천 UI 는 `components/StickerSuggestBar` 가 입력창 위에 뜬다(맞춤법 제안과 같은 자리) | `ChatRoomScreen.tsx:429, 1793` |
| S6 | 스티커 메시지 `content` = 로컬 번들 코드. 서버는 `StickerPacks.ofStickerContent()` 로 팩 사용권만 본다 | `ChatService.java:306-322` |
| S7 | 구버전 호환 패턴이 이미 있다 — `STREAK_CARD`·`GAME_CARD` 는 content 에 **그대로 읽히는 문장**을 담아 모르는 앱에서도 말풍선으로 보인다 | `MessageType.java` |
| S8 | 받침 조사 유틸 `withJosa(word, withBatchim, withoutBatchim)` 가 이미 있다 | `utils/format.ts:52` |
| S9 | 기념일은 `Relation.anniversaryDate`, 무드는 `moodApi.current()`(내/상대) | `api/relation.ts`, `HomeScreen` |

---

## 프롬프트 ③ — 입력 중 스티커 추천 되살리기 + 정확도·범위 개선

```
Dubly 저장소에서 채팅 입력 중 스티커 추천을 고친다. 먼저 CLAUDE.md 와 docs/STICKER_ENGAGEMENT_PROMPTS_2026-09-28.md §0 을 읽어라.
브랜치 feat/sticker-suggest-revive 에서 작업하고, 끝나면 CLAUDE.md 1절대로 main 에 --no-ff 병합 → push → 브랜치 삭제한다. PR 은 만들지 않는다.

[배경]
- frontend/src/utils/stickerCodes.ts 의 KEYWORDS 표가 내린 스티커 코드(LOVE_BEAR, BLI_*, DUBI_*, BEAR_*)만 가리키고,
  인덱스는 STICKER_CHARACTERS(EGG_*, DUO_*)로만 만들어져 키워드 추천이 전부 죽어 있다. 라벨 정확 일치만 동작한다.
- scripts/verify-sticker-codes.mjs 도 내린 코드로 검증해서 이 고장을 못 잡는다.

[할 일]
1. KEYWORDS 를 현재 피커에 있는 코드(stickerImages.ts 의 STICKER_CHARACTERS: 달걀이 23종, 구운이♥달걀이 20종)로 다시 짠다.
   실제 라벨을 전부 읽고, 한국 커플 채팅 빈출어 기준으로 키워드 20~30묶음을 만든다
   (사랑/뽀뽀/보고싶어/잘자/굿모닝/배고파/미안/고마워/화나/삐짐/ㅋㅋ/ㅠㅠ/피곤/퇴근/출근/축하/헐/응·넵/더워/추워 등).
   한 묶음당 추천 코드는 최대 4개, 솔로(EGG)와 짝(DUO)을 섞어 넣는다. 매핑할 그림이 없는 키워드는 넣지 않는다.
2. 매칭 규칙 개선 (suggestStickers):
   - 기존: 입력 전체가 키워드와 일치/시작할 때만. → 추가: 입력의 **마지막 어절**(공백 기준, normalizeKey 후)이 키워드와 일치하거나
     키워드로 끝날 때도 추천. 예: "나도 사랑해" → 사랑해, "오늘 피곤해ㅠㅠ" → ㅠㅠ/피곤.
   - 입력 전체 길이 상한(MAX_TRIGGER_LENGTH+2)은 마지막 어절 매칭에는 적용하지 않는다. 대신 전체 입력이 40자를 넘으면 끈다.
   - 반복 자모 정규화: "ㅋㅋㅋㅋㅋ"→"ㅋㅋ", "ㅠㅠㅠ"→"ㅠㅠ", "사랑해~~"→"사랑해".
   - 순위: 라벨 정확 일치 > 키워드 정확 일치 > 마지막 어절 일치 > 부분 일치. 같은 순위면 최근 내가 보낸 스티커를 앞으로(3번).
3. 개인화: 최근 보낸 스티커 30개를 AsyncStorage 에 기록(키 'doubly.recentStickers', try/catch 로 실패 무시)하고 동순위 정렬에 쓴다.
   서버 변경 없음.
4. 추천 범위 확장: 움직이는 이모티콘(constants/animatedStickers.ts)도 같은 키워드 표로 추천한다.
   KEYWORDS 값에 ANIM_* 코드를 섞되, 막대에는 캐릭터 스티커를 먼저, 움직이는 이모티콘을 뒤에 둔다. 최대 6개(MAX_SUGGESTIONS) 유지.
   StickerSuggestBar 가 두 종류를 그릴 수 있게 항목 타입을 { kind: 'image' | 'animated', code, label } 로 일반화한다.
   움직이는 이모티콘은 막대에서는 정적 썸네일, 보낼 때는 기존 STICKER 전송 경로 그대로.
   잠긴 팩(서버 packOf 기준)의 스티커는 추천에서 뺀다 — 눌렀는데 결제창이 뜨면 추천이 광고가 된다.
5. 노출:
   - 입력 멈춤 250ms 뒤에 뜨게 디바운스(타이핑 중 깜빡임 방지).
   - 맞춤법 제안과 같은 자리를 쓴다. 둘 다 있으면 맞춤법이 우선이고 스티커 막대는 숨긴다(지금 동작 확인 후 유지/수정).
   - 추천을 눌러 보내면 입력창의 해당 키워드 텍스트는 그대로 둔다(카톡처럼 바꿔치지 않는다 — 현재 설계 유지).
   - 사용자가 막대를 X 로 닫으면 같은 입력 동안 다시 띄우지 않는다.
6. 계측: 추천 노출·선택을 기존 클라이언트 이벤트 경로로 남긴다(STICKER_SUGGEST_SHOWN, STICKER_SUGGEST_PICKED — 코드/키워드 포함, 입력 원문은 넣지 않는다).
   기존에 클라이언트 이벤트를 보내는 모듈(PURCHASE_STARTED 를 보내는 곳)을 찾아 같은 방식으로.
7. scripts/verify-sticker-codes.mjs 를 현재 카탈로그 기준으로 다시 쓴다:
   - KEYWORDS 의 모든 코드가 STICKER_CHARACTERS 또는 animatedStickers 에 실제로 존재하는지(없으면 실패) — S1 재발 방지선.
   - "사랑해", "나도 사랑해", "ㅋㅋㅋㅋ", "오늘 피곤해ㅠㅠ", "(달걀이_", 40자 초과 입력 등 정탐/오탐 케이스.
   - 내린 코드(RETIRED_STICKER_IMAGES)가 추천에 나오지 않는지.

[지키는 것]
- STICKER_CODE_INDEX 는 STICKER_CHARACTERS 로만 만든다(내린 스티커는 고를 수 없어야 한다). 텍스트 코드 "(달걀이_사랑해)" 파싱 동작은 바꾸지 않는다.
- stickerImages.ts 의 항목 구조({ code, label, source })는 백엔드 StickerImageSyncTest 가 정규식으로 읽으므로 바꾸지 않는다.

[검증]
npm run typecheck, npm run lint(새 경고 0), npm run verify:sticker-codes, npm run verify:nested-buttons, npm run build:web.
stickerImages.ts 를 건드렸다면 backend 에서 ./gradlew test 도 돌린다.

[커밋 예]
- fix(sticker): 키워드 추천이 내린 스티커를 가리키던 것을 현재 카탈로그로 다시 짠다
- feat(sticker): 문장 끝 키워드와 반복 자모도 추천한다
- feat(sticker): 움직이는 이모티콘도 추천하고 최근 보낸 것을 앞에 둔다
- test(sticker): 추천 키워드가 실제 카탈로그를 가리키는지 검증한다

끝나면 docs/STICKER_SUGGEST_REVIVE_2026-09-XX.md 에 무엇을 바꿨고 무엇을 실기기로 확인해야 하는지 남긴다.
```

---

## 프롬프트 ① — 문구 스티커 (달걀이 + 짧은 문구)

```
Dubly 저장소에 "문구 스티커"를 추가한다. 먼저 CLAUDE.md 와 docs/STICKER_ENGAGEMENT_PROMPTS_2026-09-28.md §0 을 읽어라.
브랜치 feat/text-sticker. 끝나면 main 에 --no-ff 병합 → push → 브랜치 삭제. PR 금지.

[기능]
캐릭터 스티커(달걀이·구운이♥달걀이) 위에 사용자가 쓴 짧은 문구(최대 12자)를 얹어 보낸다. 예: "지민아 사랑해", "퇴근했어!".
그림은 앱이 합성해서 그린다 — 서버 이미지 생성·업로드 없음, 원가 0.

[메시지 형식 — 구버전 호환이 핵심]
- 새 MessageType TEXT_STICKER 를 추가한다.
- content 에는 **사용자가 쓴 문구 그대로**를 담는다(STREAK_CARD·GAME_CARD 와 같은 규칙: 이 타입을 모르는 스토어의 옛 앱에서도 평범한 말풍선으로 읽혀야 한다).
  → 먼저 프론트에서 모르는 messageType 이 어떻게 그려지는지 확인하고, 텍스트 말풍선으로 떨어지지 않으면 이 방식의 전제가 깨지니 멈추고 보고하라.
- 스티커 코드는 chat_messages 에 새 nullable 컬럼 sticker_code VARCHAR(40) 으로 담는다.
  마이그레이션 번호는 CLAUDE.md 7절 절차(원격 최대 번호 → 미병합 브랜치 선점 → 중복 검사)로 정한다. H2/PostgreSQL 공통 문법만.
  컬럼 추가이므로 Purger 순서 변경은 없지만, chat_messages 를 복사·복원하는 경로(RelationRecordRestorer 등)가 있으면 새 컬럼을 함께 옮기는지 확인한다.
- 서버 검증(ChatService, STICKER 분기 옆):
  - sticker_code 가 StickerImage 의 **피커에 있는(내리지 않은)** 코드인지, StickerPacks.ofStickerContent 로 팩 사용권이 있는지(기존 requireUsable 재사용).
  - content 는 trim 후 1~12자(코드포인트 기준, 이모지 1개 = 1자), 줄바꿈 금지. 어기면 INVALID_INPUT.
  - 알림 미리보기: "[스티커] {문구}". 검색 대상에는 문구를 포함한다(TEXT 와 같게).
  - 예약 전송·답장·삭제·반응 등 STICKER 가 지원하는 경로에서 TEXT_STICKER 도 동작하는지 확인한다(STICKER 를 switch 로 분기하는 곳을 전수 검색).
- 프론트 types/index.ts 의 MessageType 과 ChatMessage 에 반영. (이 파일은 백엔드 동기화 테스트가 읽는다 — ./gradlew test 필수)

[UI]
- 스티커 패널에서 캐릭터 스티커를 **길게 누르면** "문구 넣기" 시트가 뜬다(짧게 누르기 = 기존 즉시 전송 유지).
- 시트: 미리보기(132px 스티커 + 문구), 입력창(12자 카운터), 빠른 문구 칩 6개:
  "{상대이름}{아/야} 사랑해", "보고 싶어", "잘 자", "좋은 아침", "고마워", "미안해".
  이름 조사는 utils/format.ts 의 withJosa 를 쓴다(받침 있으면 "아", 없으면 "야"). 상대 이름이 없으면 그 칩은 뺀다.
- 말풍선 렌더(컴포넌트 components/chat/TextSticker.tsx 신설):
  - 스티커 이미지 위/아래 중 캐릭터 얼굴을 가리지 않는 쪽 — 기본은 **아래 띠**, 이미지 하단 25% 영역에 겹친다.
  - 글자: Pretendard SemiBold(theme/fonts.ts), 크기는 문구 길이에 따라 18→13 로 자동 축소, 두 줄까지.
    가독성을 위해 흰 외곽선(textShadow 4방향 또는 stroke 대체) + 진한 글자. 라이트/다크 모두 흰 배경 스티커 위라 색 고정 가능.
  - 알림·채팅 목록 미리보기는 문구 텍스트만.
- 입력 중 추천 막대(StickerSuggestBar)에서 캐릭터 스티커를 길게 누르면 **지금 입력 중인 문장을 문구로** 넣은 시트를 연다(12자 초과면 잘라서 제안).

[과금]
- 무료. 스티커 자체가 잠긴 팩이면 기존 규칙대로 잠김(서버 requireUsable).

[테스트]
- 백엔드: 정상 전송 / 내린 코드 거절 / 잠긴 팩 거절 / 13자 거절 / 줄바꿈 거절 / 이모지 포함 12자 통과 / 알림 미리보기 문구.
  기존 채팅 테스트 클래스에 추가하고 새 @SpringBootTest 컨텍스트 조합은 만들지 않는다(CLAUDE.md 6절).
- 쿼리/스키마를 건드렸으니 PostgreSQL 로 1회(docs/RUNNING.md).
- 프론트: typecheck, lint(새 경고 0), verify:nested-buttons, build:web.

[커밋 예]
- feat(chat): 문구 스티커 메시지 타입과 sticker_code 컬럼 (V{n})
- feat(chat): 문구 스티커 서버 검증·알림 미리보기
- feat(sticker): 스티커를 길게 눌러 문구를 넣어 보낸다

끝나면 docs/TEXT_STICKER_2026-09-XX.md 에 결정(왜 content 에 문구를 담았는지, 왜 서버 합성이 아닌지)과 실기기 확인 항목을 남긴다.
```

---

## 프롬프트 ② — 앱 맥락 스티커 (기념일 한정 · 무드 연동)

```
Dubly 저장소에 "앱 맥락 스티커"를 추가한다. 먼저 CLAUDE.md, docs/STICKER_ENGAGEMENT_PROMPTS_2026-09-28.md §0,
docs/STICKER_PACK_MONETIZATION_2026-09-21.md(팩 구조) 를 읽어라. 프롬프트 ③(추천)이 main 에 병합된 뒤에 진행한다.
브랜치 feat/context-stickers. 끝나면 main 에 --no-ff 병합 → push → 브랜치 삭제. PR 금지.

[목표]
채팅 밖 상태(기념일, 무드)에 맞는 스티커를 **그 순간 맨 앞에** 보여줘서 "이 앱에서만 쓰는 이유"를 만든다.
새 그림 에셋이 없으면 기존 스티커·움직이는 이모티콘을 재배치하는 것만으로 1차를 낸다(원가 0, EAS Update).

[A. 기념일 한정 칸]
- 조건: 오늘(KST)이 커플 기념일 D+100 단위(100·200·300…), 1주년 단위, 또는 anniversaryDate 의 월·일과 같은 날.
  날짜 계산은 프론트 utils/date.ts 의 기존 daysSince 를 쓰고, KST 기준인지 확인한다(백엔드는 KstClock 규칙).
- 스티커 패널 맨 앞에 "오늘의 스티커" 칸을 띄운다: 제목 "D+{n} 축하해요" / "{n}주년".
  내용은 기존 자산에서 고른 6~8장 — 움직이는 이모티콘 ANIM_PARTY_POPPER, ANIM_CONFETTI, ANIM_BIRTHDAY_CAKE, ANIM_BOUQUET,
  ANIM_RING, ANIM_TWO_HEARTS + 달걀이/구운이♥달걀이 중 축하·사랑 라벨. 실제 코드 존재 여부를 확인하고 목록을 상수로 둔다
  (constants/contextStickers.ts).
- 기념일 당일 채팅방 첫 진입 시 입력창 위 막대(StickerSuggestBar)에 한 번 자동으로 이 칸의 스티커를 추천한다(하루 1회, AsyncStorage 로 기록, 실패 무시).
- "한정"의 의미: 1차는 **노출 한정**(그날 맨 앞에 뜬다)만 한다. 보내기 잠금(그날만 보낼 수 있음)은 하지 않는다 — 서버 검증·구버전 처리 비용 대비 이득이 없다.
  나중에 전용 그림(예: 달걀이 100일 케이크)이 들어오면 같은 칸에 붙인다. 그 경우 코드·팩 추가 절차는 STICKER_PACK_MONETIZATION §13 을 따른다.

[B. 무드 연동]
- 상대의 현재 무드(moodApi 로 이미 받는 값)가 있으면, 스티커 패널을 열 때 "지금 {상대이름}의 기분: {무드}" 줄과 함께 그 무드에
  **답하는** 스티커 4~6장을 맨 앞에 둔다. 매핑은 constants/contextStickers.ts 의 MOOD_REPLY 표:
  슬픔/우울 → 토닥·안아줘 계열, 화남/짜증 → 미안·달래기, 피곤/졸림 → 수고했어·잘자, 신남/행복 → 축하·같이 신나기, 사랑 → 사랑 계열.
  무드 코드 목록은 constants/moodEmojis.ts(와 우리 이모지 무드)를 전부 읽고 빠짐없이 매핑한다. 매핑 없는 무드는 줄을 띄우지 않는다.
- 상대가 **무드를 바꾼 직후**(CoupleEvent 로 이미 오는 갱신) 채팅방에 있으면, 입력창 위 막대에 한 번 MOOD_REPLY 추천을 띄운다(같은 무드에 대해 1회).
- 내 무드는 쓰지 않는다 — 답장 맥락이 상대 무드라서.

[C. 공통]
- 패널의 맥락 칸은 최대 1개만 보인다. 우선순위: 기념일 > 상대 무드.
- 잠긴 팩 스티커는 맥락 칸에서 뺀다(추천이 결제 유도가 되지 않게).
- 계측: CONTEXT_STICKER_SHOWN / CONTEXT_STICKER_PICKED (context=ANNIVERSARY|MOOD, code) — 프롬프트 ③ 에서 쓴 이벤트 경로 재사용.
- 서버 변경 없음이 목표다. 필요해 보이면 멈추고 이유를 보고하라.

[검증]
- 날짜 경계: 기념일 계산 로직을 순수 함수로 빼고 scripts/verify-context-stickers.mjs 를 만들어
  D+99/100/101, 윤년 2/29 기념일, 1주년, KST 자정 직전/직후 케이스를 검증한다. package.json 에 verify:context-stickers 추가.
- contextStickers.ts 의 모든 코드가 실제 카탈로그(STICKER_CHARACTERS, animatedStickers)에 있는지 같은 스크립트에서 검사.
- npm run typecheck, lint(새 경고 0), verify:nested-buttons, build:web.

[커밋 예]
- feat(sticker): 기념일 당일 스티커 패널 맨 앞에 축하 칸을 띄운다
- feat(sticker): 상대 무드에 답하는 스티커를 패널 맨 앞에 둔다
- test(sticker): 기념일 날짜 경계와 맥락 스티커 코드 존재를 검증한다

끝나면 docs/CONTEXT_STICKERS_2026-09-XX.md 에 결정(노출 한정만 한 이유, 우선순위)과 실기기 확인 항목을 남긴다.
```

---

## 부록 — 세 기능의 관계

- ③ 추천이 **입구**다. ①(추천 막대에서 길게 눌러 문구 넣기)과 ②(기념일·무드 때 막대 자동 추천)가 모두 ③의 막대를 재사용한다 — 그래서 ③을 먼저 한다.
- 우리 이모지(애니메이션·우리 둘 명세)와도 이어진다: 추천·맥락 칸에 우리 이모지를 섞는 것은 우리 둘 D2 이후 별도 단계로 둔다
  (우리 이모지는 커플마다 달라 키워드 표로 매핑할 수 없고 `emotion`/`scene` 으로 매핑해야 한다).

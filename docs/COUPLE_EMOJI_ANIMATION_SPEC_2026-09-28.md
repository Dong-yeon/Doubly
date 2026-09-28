# 우리 이모지 — 현행 분석 + 움직이는 이모지 · 원가 절감 구현 명세 (2026-09-28)

> **용도**: 이 문서는 Claude Code 에서 그대로 구현하기 위한 명세다. §1~§2 는 현재 코드 분석(근거 파일·줄),
> §3 이후가 구현 단계다. 각 단계는 **독립 브랜치 → `main` 병합 → push** 로 끝낸다(CLAUDE.md 1절).
>
> 선행 문서: `COUPLE_EMOJI_AI_DESIGN_2026-09-08.md`(설계·§13 움직이는 방식 결정),
> `AI_COST_ANALYSIS_2026-09-14.md`(원가), `BILLING_STATUS_2026-09-25.md` §7(세트 크레딧),
> `GROWTH_ROADMAP_2026-09-28.md` §5(이모티콘 전략).

---

## 1. 현재 구조 (2026-09-28, `main` 16bbb0a1)

### 1-1. 흐름

```
[앱] CoupleEmojiCreateScreen
  ① 대상 선택(상대 기본/나) → ② 감정 1~5개 선택(없는 감정 우선 기본값)
  ③ 사진 선택·크롭 → POST /couple-emojis/upload-signature (PHOTO_UPLOAD 1 차감)
  ④ Cloudinary emoji-source/ 에 원본 업로드
  ⑤ POST /couple-emojis/generate {sourceImageUrl, subjectUserId, emotions}
        └ prepare(): 폴더 검증 → 관계·대상 검증 → 감정 검증(1~5) → 한도 차감(플랜 → 없으면 크레딧)
        └ 202 + jobId (AiJobService, 큐 포화 시 abandon(): 환불 + 원본 삭제)
  ⑥ 4초마다 GET /couple-emojis 재조회로 칸 채우기 + awaitAiJob(jobId) (2분 포기, 서버는 계속)

[서버] CoupleEmojiService.generate (트랜잭션 밖, NOT_SUPPORTED)
  원본 다운로드 → describe(): 텍스트 모델 JSON 스키마로 외형 사실 11개 추출
  → 감정마다 generateOne() 을 4개 동시(IMAGE_CONCURRENCY=4)
       이미지 모델(gemini-3.1-flash-image, 512px, temp 0.4)에 [원본 사진 + ANCHOR v4 + FACTS + 감정 프롬프트]
       → Cloudinary couple-emoji/ 업로드 → 장마다 REQUIRES_NEW 커밋
  → 한 장도 못 살리면 환불 / 한 장이라도 살리면 과금 유지
  → CoupleEvent.COUPLE_EMOJI 발행 + 상대 푸시
  → finally: 원본 사진 삭제(§9 "저장하지 않아요")
```

### 1-2. 노출 지점

| 곳 | 파일 | 렌더 |
| --- | --- | --- |
| 채팅 말풍선 | `ChatRoomScreen.tsx:1166, 1304-1314` | `CachedImage` 132×132, `borderRadius: 66`(원형 마스크 — 생성물에 알파가 없어 흰 배경이 딸려 옴), `contentFit="cover"` |
| 스티커 패널 | `components/chat/StickerPanel.tsx:226-256, 294` | "나"/"상대" 두 팩으로 나눠 격자 |
| 무드 | `components/MoodPicker.tsx:65, 152, 173` | 내 얼굴 + `moodVisible` 만, 기본 무드 칸을 덮음 |
| 메시지 저장 | `MessageType.COUPLE_EMOJI`, `content` = emojiId, 응답의 `imageUrl` 로 그림 | |

### 1-3. 과금 · 원가

| 항목 | 값 | 근거 |
| --- | --- | --- |
| 한도 | FREE 차단, PRO **월 4회**(요청 단위), **관계 단위**(둘이 합산) | `Feature.java:78`, `isCoupleScoped` 목록 |
| 요청당 장 수 | 최대 5 | `MAX_EMOTIONS_PER_REQUEST` |
| 추가 구매 | `emoji_set_1` = 요청 1회 크레딧 | `CreditProduct.java:18` |
| 장당 원가 | 512px $0.045 (1K $0.067, Flash-Lite-Image 1K $0.0336) | `AI_COST_ANALYSIS` §1 |
| 요청당 원가 | 이미지 5 × $0.045 = **$0.225** + describe 텍스트 호출 1회 | |
| 커플당 월 최대(PRO) | 4 × $0.225 = **$0.90** + 크레딧 구매분 | |

---

## 2. 발견 사항

심각도: 🔴 버그 / 🟠 구조 문제(원가·품질) / 🟡 개선

| # | 심각도 | 내용 | 근거 |
| --- | --- | --- | --- |
| F1 | 🔴 | **진행 격자의 칸과 라벨이 어긋난다.** `slots` 는 이번에 그리는 감정(`drawing`, ≤5개) 순서인데, 격자는 `COUPLE_EMOJI_EMOTIONS`(17개)를 돌며 `slots[i]` 와 `emotion.label` 을 짝짓는다. 예: 씻고왔다·꽃다발을 그리면 "화남" 칸에 씻고왔다 그림이 뜨고, 17칸 중 12칸은 빈 칸으로 남는다 | `CoupleEmojiCreateScreen.tsx` 격자 `COUPLE_EMOJI_EMOTIONS.map((emotion, i) => { const emoji = slots[i]` |
| F2 | 🔴(문구) | 잠금 카드가 "감정 이모지 **6종**" — 17종이 된 뒤로 낡은 문구 | 같은 파일 `LockedCard description` |
| F3 | 🟠 | **17종 한 벌 = 월 한도 전부.** 5+5+5+2 = 4요청이라 PRO 한 달 한도(4회)를 한 얼굴에 다 쓴다. 두 사람 얼굴을 다 만들려면 두 달 또는 크레딧 구매 | §1-3 |
| F4 | 🟠 | **배치마다 얼굴이 흔들린다.** 이어서 만들 때마다 ① 사진을 새로 올려야 하고(원본은 매번 삭제) ② describe 를 다시 돌려 FACTS 가 달라지고 ③ temperature 0.4 로 독립 생성된다. 같은 사람의 17종이 4번의 서로 다른 입력으로 만들어진다. `identity_facts` 를 행마다 저장하지만 **재사용하지 않는다** | `CoupleEmoji.identityFacts`, `generateFrom()` |
| F5 | 🟠 | 사진을 매번 다시 올리므로 `PHOTO_UPLOAD` 한도도 요청마다 1씩 깎인다 | `sourceUploadSignature()` |
| F6 | 🟠 | 감정 프롬프트 안에 효과(김·색종이·zzz·하트·눈물 구름)가 그려져 있다. 앱이 효과를 얹으면 겹친다 — §13 에서 "움직이는 버전 때 뺀다"고 미뤄 둔 항목 | `CoupleEmojiEmotion.java` expressionPrompt |
| F7 | 🟠 | 전체 안전망(`daily-limit-total`)이 요청을 1회로 센다 — 실제로는 최대 5장이 나간다(장 기준 방어선 없음) | `AI_COST_ANALYSIS` §2-③ |
| F8 | 🟡 | 흰 배경(알파 없음)이라 원형 마스크로만 그린다 — 움직임을 줘도 "동그란 사진이 흔들리는" 느낌에 그친다 | `ChatRoomScreen.tsx:1305-1308` 주석 |
| F9 | 🟡 | 응답 DTO 에 `promptVersion` 이 없어 앱이 옛 세트(효과가 그려진 v4 이하)를 구분할 수 없다 | `CoupleEmojiResponse.java` |

**잘 된 것(유지)**: 요청 시점 차감 + 실패 경로 환불, 원본 삭제 finally, 장마다 커밋으로 칸 채우기, 폴더 게이트(`..`·쿼리 거절),
관계 소유 + 상대 삭제권 + 상대 푸시(동의 설계), 없는 감정 우선 기본값, 2단계(describe → 생성) 일관성 기법.

---

## 3. 구현 단계 개요

| 단계 | 내용 | 배포 | 백엔드 | 원가 영향 |
| --- | --- | --- | --- | --- |
| **P0** | F1·F2 버그 수정 | 업데이트 | — | — |
| **P1** | 움직이는 우리 이모지(앱 모션 + 효과 레이어) | 업데이트 | DTO 필드 1개(F9) | **0** |
| **P2** | 프롬프트 v5(효과 제거) + 이어 만들기 앵커 재사용(F4·F5·F6) | 서버 배포 + 업데이트 | 있음, 마이그레이션 없음 | 사진 업로드·describe 절감 |
| **P3** | 시트 생성 실험(스크립트만) → 판정 | — | 실험 스크립트 | 판정 후 결정 |
| **P4** | (선택) 서버 배경 제거 → 알파 PNG(F8) | 서버 배포 + 업데이트 | 있음 | 0 |
| **P5** | 안전망을 장 단위로(F7) | 서버 배포 | 있음 | 방어 |

P0·P1 은 서로 독립이라 먼저 한다. P2 는 P1 이 끝난 뒤(P1 의 "옛 세트는 효과 끔" 규칙이 v5 를 전제로 한다).

---

## 4. P0 — 버그 수정

**브랜치**: `fix/couple-emoji-grid`

1. `CoupleEmojiCreateScreen.tsx` 진행 격자를 `COUPLE_EMOJI_EMOTIONS.map` 이 아니라 **`drawing.map((emotion, i) => …slots[i]…)`** 으로 돈다.
   라벨·플레이스홀더도 `emotion`(= drawing 항목)에서 읽는다. 결과: 그리는 장 수만큼만 칸이 생기고 칸-라벨이 일치.
2. `LockedCard description` → `"애인 얼굴로 감정 이모지를 만들어 채팅에서 써요."`(숫자를 빼서 다시 낡지 않게).

**검증**: `npm run typecheck`, `npm run lint`(새 경고 0), `npm run verify:nested-buttons`, `npm run build:web`.
**커밋**: `fix(couple-emoji): 진행 격자를 그리는 감정 순서로 돌려 칸과 라벨을 맞춘다`

---

## 5. P1 — 움직이는 우리 이모지 (AI 원가 0)

**브랜치**: `feat/couple-emoji-motion`

### 5-1. 원칙

- 그림은 그대로, **움직임은 앱이 입힌다**(설계 §13 결정). 캐릭터 모션 = `react-native-reanimated`,
  효과 레이어 = 이미 번들된 **Noto Animated Emoji Lottie**(`constants/animatedStickers.ts`) 또는 유니코드 글자 1개를 Reanimated 로 띄우는 **절차형 효과**.
- 새 네이티브 의존성 없음 → **EAS Update 로 배포**. 새 Lottie 파일을 추가하는 경우에도 에셋이라 업데이트.
- 기존 세트도 즉시 움직인다. 단 **v4 이하(효과가 그림에 그려진 세트)는 모션만, 효과 레이어는 끈다**(§5-4).

### 5-2. 감정별 프리셋

`frontend/src/constants/coupleEmojiMotion.ts` 신설. 17종 전부 정의(누락 시 `HAPPY` 폴백이 아니라 **모션 없음** 폴백 — 이상한 모션보다 정지가 낫다).

| 감정 | 캐릭터 모션 | 효과 | 효과 소스 |
| --- | --- | --- | --- |
| ANGRY 화남 | 좌우 떨림 translateX ±4px, 60ms × 6 | 💢 머리 위 두 번 펄스 | 절차형(글자) |
| HAPPY 기쁨 | 좌우 기울기 rotate ±5°, 400ms × 2 | 반짝 | `ANIM_SPARKLES` |
| EXCITED 신남 | 통통 translateY 0→-12→0, 3회 | 폭죽 | `ANIM_PARTY_POPPER` |
| SAD 슬픔 | 처짐 translateY +4 · scale 0.97, 느리게 | 💧 볼 옆으로 떨어짐 | 절차형 |
| SLEEPY 졸림 | 느린 흔들림 rotate ±3°, 1.2s × 2 | 💤 위로 떠오르며 사라짐 | 절차형 |
| LOVE 사랑 | 두근 scale 1→1.08→1, 2회 | 두근 하트 | `ANIM_TWO_HEARTS` |
| FRESHLY_WASHED 씻고왔다 | 살랑 rotate ±3° | 🫧 떠오름 | 절차형 |
| BOUQUET 꽃다발 | 팝 scale 0.9→1.05→1 | 꽃잎 | `ANIM_CHERRY_BLOSSOM` |
| KISS 뽀뽀 | 앞으로 scale 1.06 + rotate -4° | 💗 입에서 날아감 | 절차형 |
| HARD_AT_WORK 열일 | 빠른 미세 떨림 ±2px | 불꽃 | `ANIM_FIRE` |
| COMMUTING 출근 | 걷기 bob translateY ±3px, 4회 | 💨 뒤쪽 | 절차형 |
| OFF_WORK 퇴근 | 기지개 scaleY 1→1.06→1 | 반짝 | `ANIM_SPARKLES` |
| DRAINED 방전 | 가라앉기 translateY +6, opacity 1→0.85 | 🪫 깜빡 | 절차형 |
| SHOWING_OFF 멋진척 | 고개 rotate -6° 유지 후 복귀 | 반짝별 | `ANIM_GLOWING_STAR` |
| DRESSED_UP 꽃단장 | 팝 scale | 반짝 | `ANIM_SPARKLES` |
| FACE_MASK 마스크팩 | 숨쉬기 scale 1→1.03, 느리게 | ✨ | 절차형 |
| DOING_MAKEUP 화장 | 기울기 rotate ±3° | 반짝 | `ANIM_SPARKLES` |

타입 예시(구현 시 그대로 써도 됨):

```ts
export type MotionKind = 'shake' | 'tilt' | 'bounce' | 'droop' | 'sway' | 'beat' | 'pop' | 'lean' | 'jitter' | 'bob' | 'stretch' | 'sink' | 'breathe';
export type EffectSpec =
  | { kind: 'lottie'; code: string }            // animatedStickers.ts 의 code
  | { kind: 'glyph'; glyph: string; path: 'rise' | 'fall' | 'pulse' | 'drift' | 'blink' };
export interface CoupleEmojiMotion { motion: MotionKind; effect: EffectSpec | null; }
export const COUPLE_EMOJI_MOTION: Record<CoupleEmojiEmotion, CoupleEmojiMotion> = { /* 17종 */ };
```

`kind: 'lottie'` 의 `code` 는 `animatedStickers.ts` 에 실제로 있는 코드여야 한다 — **모듈 로드 시 조회해 없으면 개발 모드에서 console.warn, 운영에서는 효과 없음**.

### 5-3. 컴포넌트

`frontend/src/components/chat/AnimatedCoupleEmoji.tsx` 신설.

```ts
interface Props {
  uri: string;
  emotion: CoupleEmojiEmotion | null;   // null 이면 정지 이미지(삭제된 이모지 등)
  promptVersion?: string | null;         // v4 이하면 효과 끔
  size: number;                          // 말풍선 132
  play: boolean;                         // true 가 되는 순간 1회 재생
  onPress?: () => void;                  // 기본: 다시 재생
  accessibilityLabel?: string;
}
```

- 구조: 바깥 `Animated.View`(모션) 안에 기존과 같은 원형 `CachedImage` + 그 위 `pointerEvents="none"` 효과 레이어.
  효과는 **원 밖으로 나가도 되게** 바깥 View 에 `overflow: 'visible'`, 효과 크기 ≈ `size × 0.45`, 우상단 기준.
- **재생 규칙**(성능·피로도):
  - 1회 재생(총 0.8~1.6초) 후 정지. 루프 금지.
  - 채팅: **이번 세션에 보내거나 받은 메시지**만 자동 재생. 스크롤로 과거 메시지가 보일 때는 재생하지 않는다.
    탭하면 다시 재생.
  - 패널 격자·무드 피커: 자동 재생 없음. 패널에서 **길게 누르기 미리보기**가 있다면 거기서만 재생.
  - 홈 아바타 무드 배지: 무드가 **바뀐 순간** 1회만.
- **동작 줄이기**: Reanimated `useReducedMotion()` 이 true 면 모션·효과 모두 끄고 정지 이미지.
- 애니메이션은 transform/opacity 만(레이아웃 속성 금지) — UI 스레드에서만 돈다.
- 웹: Reanimated·lottie-react-native 웹 동작을 `npm run build:web` 으로 확인. 웹에서 Lottie 가 문제면 웹은 모션만.

### 5-4. 옛 세트 구분 — `promptVersion` 을 응답에 싣는다 (F9)

- 백엔드 `CoupleEmojiResponse` 에 `String promptVersion` 추가(`e.getPromptVersion()`). 컬럼은 이미 있다 → **마이그레이션 없음**.
- 프론트 `types/index.ts` 의 `CoupleEmoji` 에 `promptVersion?: string | null`.
- 규칙: `v5` 이상만 효과 레이어. 그 외(v1~v4, null)는 모션만.
  **주의**: `types/index.ts` 는 `PlanFeatureSyncTest` 등이 읽는 파일이다 — 추가 후 백엔드 테스트도 돌린다.

### 5-5. 연결 지점

| 곳 | 변경 |
| --- | --- |
| `ChatRoomScreen.tsx:1304-1314` | `CachedImage` → `AnimatedCoupleEmoji`. `emotion`·`promptVersion` 은 `useCoupleEmojiStore` 에서 `Number(item.content)` 로 조회(없으면 null → 정지). `play` = 이 메시지 id 가 "세션 중 도착/전송" 집합에 있을 때 |
| 세션 중 도착 집합 | `ChatRoomScreen` 에 `useRef<Set<number>>` — 소켓 수신·내 전송 성공 시 id 추가. 초기 로드·페이지네이션 메시지는 넣지 않는다 |
| `MoodPicker` / 홈 무드 배지 | 선택 사항. 넣는다면 "바뀐 순간" 1회 |

### 5-6. 완료 조건

- 17종 전부 프리셋 존재, 없는 Lottie 코드 0건(개발 모드 경고 없음).
- 받은 우리 이모지가 1회 움직이고 멈춘다. 과거 메시지 스크롤 시 움직이지 않는다. 탭 → 재생.
- 동작 줄이기 켜면 정지.
- 옛 세트(v4)는 효과 레이어 없음.
- `npm run typecheck` · `lint` · `verify:nested-buttons` · `build:web` 통과, `./gradlew test` 통과.
- **실기기 확인 항목**(문서에 결과 기록): 긴 대화방 스크롤 프레임 드랍, 다크 모드에서 효과 가시성, 저사양 Android.

**커밋 분리 예**:
1. `feat(couple-emoji): 응답에 promptVersion 을 싣는다`
2. `feat(couple-emoji): 감정별 모션·효과 프리셋 17종`
3. `feat(chat): 우리 이모지를 받은 순간 한 번 움직인다`

---

## 6. P2 — 프롬프트 v5 + 이어 만들기 앵커 재사용

**브랜치**: `feat/couple-emoji-v5-anchor`

### 6-1. 프롬프트 v5 (F6)

- `CoupleEmojiEmotion` 의 `expressionPrompt` 에서 **효과 묘사만** 뺀다(표정·자세·소품은 유지).
  - 예: ANGRY `"... steam clouds rising from the head ..."` → 삭제. EXCITED `"confetti and stars flying around"` → 삭제.
    SLEEPY `"\"zzz\" letters floating above"` → 삭제. LOVE `"small hearts floating around"` → 삭제.
    SAD `"small rain cloud above the head"` → 삭제(눈물 한 방울은 표정이라 유지).
    BOUQUET·KISS·SHOWING_OFF·DRESSED_UP·FACE_MASK 의 `sparkles/petals/heart floating` 류 → 삭제.
  - DRAINED 의 `empty battery symbol above the head` → 삭제(앱 효과 🪫).
- ANCHOR 에 한 줄 추가: `"No floating effects, symbols or particles around the character; expression and pose only."`
- `CoupleEmojiPrompts.VERSION = "v5"`.
- 트레이드오프: **정지 상태에서 감정이 덜 읽힐 수 있다** → P1 효과 레이어가 그 역할. 알림 미리보기 등 정지로만 보이는 곳은 라벨로 보완.
- 검증: 실험 스크립트(`scripts/couple-emoji-experiment/generate.mjs`)로 합성 얼굴 1인 × 17종을 v4/v5 비교 — 비용 약 $1.5.
  결과를 `COUPLE_EMOJI_AI_DESIGN_2026-09-08.md` 에 §23 으로 기록.

### 6-2. 이어 만들기 — 사진 대신 이미 만든 이모지를 앵커로 (F4·F5)

**문제**: 같은 얼굴의 두 번째 배치부터 사진을 다시 올리고 describe 를 다시 돌린다 → 얼굴이 배치마다 흔들리고, 사진 한도·describe 호출이 매번 든다.

**변경**:

- `GenerateCoupleEmojiRequest` 에 `Long anchorEmojiId` 추가. **`sourceImageUrl` 과 둘 중 하나만** 허용(둘 다/둘 다 없음 → 400).
- `prepare()`:
  - `anchorEmojiId` 경로: 이모지가 **같은 관계·삭제 안 됨·`subjectUserId` 일치**인지 검증. 원본 폴더 검증·원본 삭제 로직은 타지 않는다(앵커는 지우면 안 된다 — `finally` 삭제를 `sourceImageUrl` 이 있을 때만).
  - `GenerationTicket` 에 `anchorImageUrl`, `identityFacts`(앵커 행의 값) 추가.
- `generateFrom()`:
  - 앵커 경로면 앵커 이미지를 fetch(Cloudinary 결과 폴더), **describe 생략**하고 저장된 `identityFacts` 재사용.
  - 프롬프트: 앵커 경로 전용 첫 문장 — `"This image is an existing chibi emoticon character. Draw the SAME character (same face, hair, outfit, line style and colors) with a new expression."`
    나머지 FRAMING/STYLE/FACTS/Expression 은 동일. 이미지 모델에 사진이 아니라 캐릭터를 주므로 그림체 일관성이 올라가는 것이 기대 효과 — **P2 실험으로 확인**.
- 개인정보: 앵커는 이미 생성된 캐릭터 이미지라 "사진을 저장하지 않는다"(§9) 약속과 충돌하지 않는다.
- 앱(`CoupleEmojiCreateScreen`):
  - 선택한 얼굴에 이미 이모지가 있으면 사진 단계 대신 **"이어서 만들기"**(기본) / "새 사진으로" 선택.
  - 앵커는 해당 얼굴의 가장 최근 `HAPPY`, 없으면 최근 1장. 앵커를 화면에 작게 보여 준다.
  - 이어서 만들기 경로에서는 `upload-signature` 를 부르지 않는다 → `PHOTO_UPLOAD` 미차감.
- 한도: 그대로 **요청 1회 차감**(정책 변경 없음).
- 테스트(백엔드): 앵커 경로 성공 / 다른 관계의 앵커 거절 / 대상 불일치 거절 / 둘 다 보냄 거절 / 앵커 경로에서 앵커 이미지가 삭제되지 않음 / describe 미호출(목 검증).
  **새 `@SpringBootTest` 컨텍스트 조합을 만들지 말 것**(CLAUDE.md 6절 — 기존 테스트 클래스에 추가).

### 6-3. 완료 조건

- v5 로 만든 행의 `prompt_version = 'v5'`, 효과가 그림에 없다.
- 이어서 만들기 요청에서 Cloudinary 업로드·describe 호출이 없다(`ai_usage_logs` 에 텍스트 호출 행 없음).
- `./gradlew test` + PostgreSQL 1회(`docs/RUNNING.md`), 프론트 검증 4종.

---

## 7. P3 — 시트 생성 실험 (원가 절감 판정용, 코드 반영 전)

**목표**: 한 번 호출로 여러 감정을 그려 장당 원가를 낮출 수 있는지 **숫자로** 판정.

- 스크립트: `scripts/couple-emoji-experiment/sheet.mjs`(신설, 기존 `generate.mjs` 의 호출부 재사용).
  - 조건 A(현행): 512px 장별 × 4감정 = $0.18
  - 조건 B: 1K 한 장에 2×2 격자로 4감정 = $0.067 → 칸당 512px로 분할 (분할은 기존 `sheet.py` 의 칸 경계 클리핑 방식)
  - 조건 C: Flash-Lite-Image 1K 2×2 = $0.0336
  - 합성 얼굴 2명(남/여) × 각 조건 3회.
- 판정 기준(전부 충족 시 채택):
  1. 칸 간 번짐(옆 칸 조각 묻음) 0건 — 분할 후 칸 가장자리 5px 내 비배경 픽셀 비율로 자동 판정
  2. 4칸 모두 지정 감정 표현(수동 확인)
  3. 닮음이 A 대비 떨어지지 않음(수동, 3단계 척도)
  4. 안전필터 거절률 A 대비 증가 없음
- 결과는 `docs/COUPLE_EMOJI_SHEET_EXPERIMENT_<날짜>.md` 로. **채택 시에만** 서비스 반영을 별도 단계로 설계
  (한 장 실패 = 4감정 실패가 되므로 환불 규칙·칸 채우기 UI 가 바뀐다).
- 예상: B 채택 시 5장 요청 원가 $0.225 → 약 $0.13(2시트), 17종 한 벌 $0.77 → 약 $0.34.

---

## 8. P4 — (선택) 서버 배경 제거 → 알파 PNG (F8)

- 생성 직후 업로드 전에 **가장자리에서 흰색(#FFFFFF 근사, 임계 ≥ 245) 플러드 필**로 배경을 투명화. `java.awt.image` 만으로 가능(의존성 없음).
- 흰 스티커 외곽선이 배경과 붙어 같이 지워지므로, 알파 마스크를 **3~4px 팽창해 흰 외곽선을 다시 그린다**
  (`scripts/couple-emoji-experiment/normalize-stickers.mjs` 가 같은 문제를 푼 전례).
- 실패(외곽선이 끊겨 캐릭터 내부까지 지워짐 — 투명 픽셀 비율 > 70%)면 원본 그대로 업로드(원형 마스크 경로 유지).
- 앱: v5 이상 + 알파 여부 플래그가 있으면 원형 마스크 없이 `contain` 으로. 플래그는 `promptVersion` 대신 별도 컬럼이 필요 → **마이그레이션 필요**(번호는 CLAUDE.md 7절 절차로 확인).
- P1 모션이 "동그란 사진"이 아니라 "스티커"로 보이게 되는 효과. 필수는 아니다.

---

## 9. P5 — 안전망을 장 단위로 (F7)

- `daily-limit-total` 계측이 이미지 호출을 요청 1회가 아니라 **이미지 1장 = 1**로 세게 한다(`GeminiClient` 의 이미지 경로 카운터).
- 원가 폭주 방어 목적. 사용자 노출 한도(월 4회)는 그대로.

---

## 10. 하지 않는 것

- 영상 생성 모델(Veo 등)·키프레임 다장 생성으로 "진짜로" 움직이게 하기 — 원가가 세트 전체보다 크고 프레임 간 흔들림(설계 §13).
- 요청당 5장 상한 상향 — 대기 시간·실패 손실 폭 때문에 둔 상한(서비스 주석). 시트 채택 후 재검토.
- 한도 단위를 장으로 바꾸기 — 계측 복잡도 대비 이득 없음(요청 DTO 주석).

## 11. 실행 순서 요약

1. P0 → 병합·push → `npm run update:production`
2. P1 → 병합·push → 백엔드 배포(DTO) 후 업데이트
3. P2(v5 비교 실험 → 코드) → 병합·push
4. P3 실험 → 문서 → 채택 여부 결정
5. P4·P5 는 여유 있을 때

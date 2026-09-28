# 우리 둘 이모지 — 두 사람이 한 장면에 나오는 우리 이모지 구현 명세 (2026-09-28)

> **용도**: Claude Code 에서 그대로 구현하기 위한 명세. **선행 조건은
> `COUPLE_EMOJI_ANIMATION_SPEC_2026-09-28.md` 의 P2(앵커 재사용)** — 이 기능은 그 "기존 이모지를 기준
> 그림으로 넣는" 경로를 두 명으로 넓힌 것이다. P2 가 먼저 병합돼 있어야 한다.
>
> 단계마다 **독립 브랜치 → `main` 병합(`--no-ff`) → push → 브랜치 삭제**(CLAUDE.md 1절). PR 금지.

---

## 0. 한 줄 정의와 결정

**두 사람이 이미 가진 솔로 우리 이모지 한 장씩을 기준 그림으로, 둘이 함께 있는 장면(안아주기·손잡기 등)을
AI 가 그린다.** 새 사진 없음, describe 없음, 장면 1장 = 이미지 1장.

| 결정 | 내용 | 이유 |
| --- | --- | --- |
| 입력 | 두 사람의 기존 이모지 이미지 2장 + 각자의 `identity_facts` + 장면 프롬프트 | 사진을 다시 받지 않는다 — §9 "사진은 저장하지 않아요"와 충돌 없음. 캐릭터→캐릭터라 그림체 일관성 |
| 열림 조건 | **두 사람 모두** 솔로 이모지가 1장 이상 있어야 한다 | 앵커가 없으면 그릴 수 없다. "상대 얼굴도 만들면 열려요"가 두 번째 세트의 동기가 된다 |
| 한도 | 기존 `Feature.AI_COUPLE_EMOJI` **요청 1회 차감**, 요청당 장면 최대 5 | 새 Feature·상품을 만들지 않는다(PlanFeatureSyncTest·스토어 상품 추가 회피). 크레딧(`emoji_set_1`)도 그대로 쓰인다 |
| 원가 | 장면당 약 $0.045(512px) — 솔로와 같음 | 사진 업로드·describe 호출이 없어 요청당으로는 솔로보다 싸다 |
| 저장 | **같은 `couple_emojis` 테이블**에 `kind = 'DUO'` 로 | 테이블을 늘리면 Purger 순서·채팅 조회·트레이가 전부 늘어난다(V80 주석과 같은 이유) |
| 장면 목록 | 감정 enum 과 **별도 enum `CoupleEmojiScene`** | 감정 enum 은 `moodEmoji`·`defaultMoodVisible` 을 들고 있어 무드와 엮여 있다. 장면은 무드가 아니다 |
| 무드 | DUO 는 무드에 **올릴 수 없다**(서버에서 거절) | 무드는 "내 기분". 둘이 나오는 그림은 의미가 맞지 않는다 |

---

## 1. 단계

| 단계 | 내용 | 산출 | 배포 |
| --- | --- | --- | --- |
| **D0** | 실험 — 합성 얼굴 커플 1쌍 × 장면 10종, 판정 | `docs/COUPLE_EMOJI_DUO_EXPERIMENT_<날짜>.md` | — |
| **D1** | 백엔드 — 마이그레이션, 장면 enum, 생성 API, 하위 호환 | 서버 | Railway |
| **D2** | 앱 — 만들기 화면 "우리 둘" 탭, 패널 "우리 둘" 팩, 말풍선 | 앱 | EAS Update |
| **D3** | 움직임 — 장면별 모션 프리셋(애니메이션 명세 P1 확장) | 앱 | EAS Update |

**D0 판정에 실패하면 D1 이후는 착수하지 않는다.**

---

## 2. D0 — 실험 (코드 반영 전)

### 2-1. 스크립트

`scripts/couple-emoji-experiment/duo.mjs` 신설. 기존 `generate.mjs` 의 Gemini 호출·저장 코드를 재사용한다.

- 입력: `--a <이모지A.png> --b <이모지B.png> --facts-a "<…>" --facts-b "<…>" --scene <SCENE> [--n 3]`
- 앵커 준비: 합성 얼굴(`make-face.mjs`)로 남·여 솔로 이모지를 v5(애니메이션 명세 P2) 프롬프트로 먼저 1장씩 만든다.
  v5 가 아직 없으면 v4 로 해도 된다(효과 묘사 유무만 다르다).
- 모델·설정: 서비스와 동일 — `gemini-3.1-flash-image`, `imageSize: 512px`, `temperature: 0.4`.
  **이미지 파트 순서가 곧 좌/우 지정**이다(프롬프트 §2-2 와 맞춘다).

### 2-2. 프롬프트 (초안 — 실험에서 조정)

```
Draw ONE square chibi emoticon sticker showing TWO characters together.
CHARACTER A = the character in the FIRST image. CHARACTER B = the character in the SECOND image.
Both images are existing emoticon characters — keep each one EXACTLY the same:
same face, hairstyle, hair length and color, glasses, outfit and colors, same line style.
Do NOT mix features between A and B. Do NOT swap their outfits.
POSITION: A stands on the LEFT, B stands on the RIGHT.
A FACTS: {factsA}
B FACTS: {factsB}
FRAMING: both upper bodies fully inside the frame, heads about the same size, no cropping of heads.
STYLE: same strongly exaggerated chibi style as the input images, thick white sticker outline around the pair,
clean bold dark lines, soft pastel shading, plain solid pure white (#FFFFFF) background.
No text, no letters, no watermark, no speech bubbles. No floating effects or particles.
Wholesome and cute, suitable for all ages.
SCENE: {scene.prompt}
```

### 2-3. 장면 10종 (초안)

| enum | 라벨 | scene.prompt |
| --- | --- | --- |
| `HUG` | 꼭 안아줘 | A and B hugging each other warmly, eyes closed, happy smiles |
| `HOLD_HANDS` | 손잡기 | A and B holding hands side by side, looking at each other and smiling |
| `CHEEK_KISS` | 볼뽀뽀 | A gives B a quick peck on the cheek, B blushes in surprise |
| `LEAN` | 기대기 | B leans their head on A's shoulder, both relaxed and content |
| `HIGH_FIVE` | 하이파이브 | A and B giving each other an excited high five |
| `SULK` | 삐짐 | A and B standing back to back with arms crossed, pouting, looking away from each other |
| `MAKE_UP` | 화해 | A offers a pinky promise to B, B shyly accepts, small relieved smiles |
| `EAT_TOGETHER` | 같이 먹자 | A and B sharing a bowl of food with chopsticks, happy and hungry expressions |
| `GOOD_NIGHT` | 잘자 | A and B tucked under one blanket, sleepy peaceful faces |
| `PICK_UP` | 데리러 왔어 | A waves hello arriving, B runs toward A happily |

**넣지 않는 장면**: 입맞춤(입술), 누워 있는 두 사람의 밀착, 침대 — 안전 필터 거절률과 스토어 심사(연령 등급) 리스크.
`GOOD_NIGHT` 도 D0 에서 거절률이 높으면 뺀다.

### 2-4. 실험 규모·비용

커플 1쌍 × 10장면 × 3회 = 30장 ≈ **$1.4**. (좌우를 뒤집은 입력 순서로 `HUG`·`SULK` 만 3회 추가 → +$0.3)

### 2-5. 판정 기준 (전부 충족 시 D1 착수)

| # | 기준 | 방법 | 합격선 |
| --- | --- | --- | --- |
| 1 | **닮음** — 각 캐릭터가 입력 앵커와 같은 인물로 보인다 | 수동 3단계(같다/비슷/다르다) | "다르다" ≤ 10% |
| 2 | **섞임 없음** — 머리·안경·옷이 서로 바뀌거나 섞이지 않음 | 수동 | 섞임 ≤ 10% |
| 3 | **좌우 지정** — A 가 왼쪽 | 수동 | ≥ 90% (실패 시 좌우는 포기하고 섞임만 본다) |
| 4 | **장면 표현** — 지정 장면으로 읽힌다 | 수동 | ≥ 90% |
| 5 | **거절률** — 안전 필터로 이미지 없음 | 자동(응답 `finishReason`) | 장면별 ≤ 1/3, 전체 ≤ 10% |
| 6 | **프레이밍** — 머리 잘림 없음, 흰 배경 | 수동 | ≥ 90% |

- 불합격 장면은 목록에서 빼고 합격 장면만으로 진행 가능(최소 6장면).
- 1·2 가 전반적으로 불합격이면 **대안**: 두 사람을 따로 그려 앱에서 나란히 합성(오프라인 합성)하는 방식 — 원가 2배이고 상호작용 장면(안아주기)이 불가능하므로 이 문서 범위 밖. 결과 문서에 기록만 한다.

### 2-6. 기록

`docs/COUPLE_EMOJI_DUO_EXPERIMENT_<날짜>.md` — 조건, 장면별 합격 여부 표, 대표 이미지 경로(`scripts/couple-emoji-experiment/out/duo/`, 커밋하지 않음), 최종 장면 목록, 프롬프트 최종본.

---

## 3. D1 — 백엔드

**브랜치**: `feat/couple-emoji-duo-backend`

### 3-1. 마이그레이션

번호는 **CLAUDE.md 7절 절차(① 원격 최대 번호 ② 미병합 브랜치 선점 ③ 중복 검사)로 확인 후** 붙인다.
파일: `V{n}__couple_emoji_duo.sql`. H2/PostgreSQL 공통 문법만.

```sql
-- 우리 둘 이모지 — 두 사람이 한 장면에 나오는 행. 같은 테이블에 kind 로 구분한다(테이블을 늘리면
-- Purger 순서·채팅 조회가 같이 늘어난다, V80 주석). (H2 호환 구문만 사용)
ALTER TABLE couple_emojis ADD COLUMN kind VARCHAR(10) NOT NULL DEFAULT 'SOLO';  -- SOLO / DUO
ALTER TABLE couple_emojis ADD COLUMN scene VARCHAR(30);                          -- DUO 일 때만
ALTER TABLE couple_emojis ALTER COLUMN emotion DROP NOT NULL;                    -- DUO 는 감정이 없다
```

- `ALTER COLUMN … DROP NOT NULL` 은 PostgreSQL·H2(2.x) 모두 지원 — **H2 버전 확인 후** 실패하면 H2 대체 구문을 쓰지 말고
  대신 DUO 행의 `emotion` 에 `'HAPPY'` 같은 더미를 넣는 방식으로 바꾼다(스키마 호환이 우선).
- `subject_user_id` 는 NOT NULL 그대로 두고 DUO 행에는 **만든 사람(`created_by`)** 을 넣는다. 의미는 코드 주석으로 남긴다.
- **Purger**: 테이블이 늘지 않으므로 `UserDataPurger`·`RelationRecordPurger` 순서 변경 없음. 단 두 파일에서
  `couple_emojis` 삭제 조건이 `subject_user_id` 기준인 곳이 있으면, DUO 행은 **두 사람 모두의 얼굴**이라는 점을 반영해
  **탈퇴 시 관계의 DUO 행도 함께 지우는지** 확인한다(한쪽이 탈퇴하면 그 사람 얼굴이 들어간 DUO 가 남으면 안 된다).
  STICKER_PACK_MONETIZATION §8 "한쪽만 지운다"와 충돌하는지 먼저 읽고 결정 → 결정을 커밋 메시지·주석에 남긴다.

### 3-2. 도메인

- `coupleemoji/domain/CoupleEmojiKind.java` — `SOLO`, `DUO`.
- `coupleemoji/domain/CoupleEmojiScene.java` — D0 에서 확정한 장면. 필드: `label`, `scenePrompt`. (무드 관련 필드 없음)
- `CoupleEmoji` 엔티티: `kind`(`@Enumerated(STRING)`, 기본 SOLO), `scene`(nullable), `emotion` nullable.
  빌더에 DUO 전용 팩토리 `CoupleEmoji.duo(relationId, createdBy, batchId, scene, imageUrl, promptVersion)` —
  `moodVisible = false` 고정.
- `CoupleEmojiResponse`: `kind`, `scene`, `label` 추가/조정. **`e.getEmotion().label()` 이 DUO 에서 NPE** 가 나므로
  `label = kind == DUO ? scene.label() : emotion.label()`, `moodEmoji = DUO ? null : emotion.moodEmoji()`.

### 3-3. 프롬프트

`CoupleEmojiPrompts` 에 `DUO_VERSION = "duo-v1"`, `duoPrompt(factsA, factsB, scene)` — D0 최종본 그대로.
행의 `prompt_version` 에 `duo-v1` 저장(애니메이션 명세 P1 의 "v5 이상만 효과 레이어" 판정에서 `duo-` 접두는 효과 허용으로 취급).

### 3-4. API

`POST /api/v1/couple-emojis/generate-duo` → 202 + jobId (기존 generate 와 같은 AiJobService 규칙)

```java
public record GenerateCoupleEmojiDuoRequest(
        @NotEmpty List<CoupleEmojiScene> scenes   // 1~5, 중복 제거 후 enum 순서
) {}
```

`CoupleEmojiService.prepareDuo(userId, request)`:
1. 활성 커플 조회.
2. 장면 검증(1~`MAX_EMOTIONS_PER_REQUEST`, 중복 제거) — **차감보다 먼저**.
3. 앵커 선택(서버가 고른다 — 앱이 임의 이미지를 넣지 못하게):
   각 사람(`me`, `partner`)에 대해 `kind = SOLO`, 삭제 안 됨, `subject_user_id = 그 사람` 중
   `emotion = HAPPY` 최신 1장, 없으면 최신 1장. **둘 중 하나라도 없으면 400** —
   `ErrorCode` 에 `COUPLE_EMOJI_DUO_NEEDS_BOTH("둘 다 우리 이모지가 있어야 만들 수 있어요.")` 추가.
4. 한도 차감 `geminiClient.requireImageConfiguredAndCharge(userId, FEATURE)`.
5. 티켓: `relationId, userId, anchorA(url, facts), anchorB(url, facts), scenes, charge`.
   A = 요청자의 **상대**, B = 요청자 본인(좌우 규칙은 D0 결과에 맞춘다 — 고정만 하면 된다).

`generateDuo(ticket)` (`@Transactional(NOT_SUPPORTED)`):
- 앵커 2장 fetch(결과 폴더 URL — `imageFetcher` 가 결과 폴더도 받는지 확인. 원본 폴더 게이트와 별개).
- 장면마다 `generateOne` 과 같은 패턴(동시 `IMAGE_CONCURRENCY`, 장마다 REQUIRES_NEW 커밋).
  이미지 파트 순서: `[anchorA, anchorB, text]`.
- 환불 규칙 동일(한 장도 못 살리면 환불).
- **앵커는 절대 삭제하지 않는다**(원본 삭제 `finally` 를 타지 않음 — 솔로 경로와 코드 공유 시 주의).
- 완료 시 `CoupleEvent.COUPLE_EMOJI` 발행 + 상대 푸시 `"{이름}님이 우리 둘 이모지를 만들었어요 💞"`.

### 3-5. 하위 호환 — 스토어의 옛 앱

스토어에 있는 옛 버전은 `GET /couple-emojis` 응답에 DUO 가 섞이면 `emotion: null` 행을 "나"/"상대" 팩에 넣어 버린다.

- `GET /couple-emojis` 기본값은 **SOLO 만** 반환. 새 앱은 `?includeDuo=true` 를 보낸다.
- 채팅 메시지(`COUPLE_EMOJI`, content = emojiId)는 응답의 `imageUrl` 로 그리므로 옛 앱에서도 **그림은 보인다** — 변경 없음.

### 3-6. 무드

`MoodService`(현재 `:100-108`)에서 `coupleEmojiId` 로 고른 행이 `kind == DUO` 면
`INVALID_INPUT("우리 둘 이모지는 무드로 걸 수 없어요.")`. `setMoodVisible` 도 DUO 면 거절.

### 3-7. 테스트 (`CoupleEmojiFlowTest` 에 추가 — 새 `@SpringBootTest` 컨텍스트 조합 금지, CLAUDE.md 6절)

1. 둘 다 솔로가 있으면 DUO 생성 성공, 행 `kind=DUO`·`scene`·`mood_visible=false`·`prompt_version=duo-v1`.
2. 한쪽만 있으면 400 `COUPLE_EMOJI_DUO_NEEDS_BOTH`, **한도 차감 없음**.
3. 장면 0개·6개 → 400, 차감 없음.
4. 이미지 호출에 앵커 2장이 A,B 순서로 들어간다(GeminiClient 목 인자 검증), describe 호출 없음.
5. 모든 장 실패 → 환불.
6. 앵커 이미지 삭제 호출 없음.
7. `GET /couple-emojis` 기본은 DUO 제외, `includeDuo=true` 면 포함.
8. DUO 를 무드로 걸면 400.
9. DUO 응답 직렬화에 NPE 없음(`label` = 장면 라벨).
10. 탈퇴·지난 기록 삭제 경로에서 DUO 행 처리(3-1 결정대로).

**검증**: `./gradlew test` + 쿼리를 건드렸으므로 **PostgreSQL 1회**(`docs/RUNNING.md`).

**커밋 분리 예**:
1. `feat(couple-emoji): 우리 둘 이모지 스키마 — kind·scene, emotion nullable (V{n})`
2. `feat(couple-emoji): 장면 enum 과 우리 둘 생성 API`
3. `feat(couple-emoji): 목록은 기본 솔로만, 새 앱은 includeDuo 로 받는다`
4. `feat(mood): 우리 둘 이모지는 무드로 걸 수 없게 막는다`

---

## 4. D2 — 앱

**브랜치**: `feat/couple-emoji-duo-app`

### 4-1. 타입·상수·API

- `types/index.ts`: `CoupleEmoji` 에 `kind: 'SOLO' | 'DUO'`, `scene?: CoupleEmojiScene | null`, `emotion` 을 nullable 로.
  `CoupleEmojiScene` 유니온 추가. **이 파일은 백엔드 동기화 테스트가 읽는다** — 수정 후 `./gradlew test` 도 돌린다.
- `constants/coupleEmojiScenes.ts` 신설 — `{ key, label, placeholder }` (placeholder 예: HUG 🫂, HOLD_HANDS 🤝, CHEEK_KISS 😚, SULK 😤 …).
- `api/coupleEmoji.ts`: `list()` 에 `includeDuo=true`, `startDuoGeneration(scenes)` 추가(`api/client.ts` 경유).
- `store/coupleEmojiStore.ts`: 그대로 두되 셀렉터 `solo`/`duo` 분리.
- 기존 코드에서 `emotion` 을 non-null 로 가정한 곳 전수 점검: `MoodPicker`, `StickerPanel`, `CoupleEmojiCreateScreen`
  (`existingEmotions`), `messagePreview.ts`. 전부 **SOLO 만 대상으로 필터**.

### 4-2. 만들기 화면 `CoupleEmojiCreateScreen`

- 상단 세그먼트: **"한 사람" / "우리 둘"**.
- "우리 둘":
  - 두 사람의 앵커 미리보기(서버와 같은 규칙: 각자 HAPPY 최신 → 없으면 최신). 앱은 **보여주기만**, 선택은 서버가 한다.
  - 한쪽이 없으면 장면 선택 대신 안내 카드: "`{상대}` 얼굴 이모지를 먼저 만들면 우리 둘 이모지가 열려요" + "만들러 가기"(세그먼트를 "한 사람"으로, 대상 = 없는 사람).
  - 장면 칩 1~5개 선택(이미 가진 장면에 점 — 솔로와 같은 문법). 사진 단계 없음.
  - 진행 격자는 **그리는 장면 순서로**(애니메이션 명세 P0 에서 고친 방식과 동일하게 `drawing.map`).
- 한도·크레딧 UI 는 솔로와 공유(같은 `AI_COUPLE_EMOJI`).

### 4-3. 스티커 패널 `StickerPanel`

- 우리 이모지 팩을 **"우리 둘" / "나" / "상대"** 순으로(현재 `couplePack` 두 개 → 세 개). DUO 가 0장이면 "우리 둘" 팩은 숨긴다.
- DUO 도 길게 눌러 관리(삭제). 무드 토글 메뉴는 DUO 에서 숨긴다.

### 4-4. 말풍선

- `ChatRoomScreen` 의 `COUPLE_EMOJI` 렌더는 `imageUrl` 기반이라 그대로 동작. 원형 마스크 안에서 두 사람이 잘리는지 **실기기 확인** —
  잘리면 DUO 만 `borderRadius` 를 줄인 둥근 사각(예: 24)으로. (애니메이션 명세 P4 알파 PNG 가 들어오면 마스크 제거)
- 알림 미리보기(`messagePreview.ts`): DUO 는 `[우리 둘 이모지]`.

### 4-5. 검증

`npm run typecheck` · `npm run lint`(새 경고 0) · `npm run verify:nested-buttons` · `npm run build:web` · `./gradlew test`.

**실기기 확인**(결과를 실험 문서 하단에 기록): 한쪽만 있을 때 안내 흐름, 원형 마스크 잘림, 다크 모드, 옛 앱(스토어 버전)에서 DUO 메시지가 그림으로 보이는지.

**커밋 분리 예**:
1. `feat(couple-emoji): 우리 둘 이모지 타입·API·장면 상수`
2. `feat(couple-emoji): 만들기 화면에 우리 둘 탭 — 한쪽이 없으면 먼저 만들러 보낸다`
3. `feat(sticker): 패널에 우리 둘 팩을 맨 앞에 둔다`

---

## 5. D3 — 장면별 움직임

애니메이션 명세 P1 의 `constants/coupleEmojiMotion.ts` 에 장면 프리셋을 추가한다.
`AnimatedCoupleEmoji` 는 `emotion` 대신 `motionKey: CoupleEmojiEmotion | CoupleEmojiScene` 를 받도록 일반화.

| 장면 | 모션 | 효과 |
| --- | --- | --- |
| HUG | 좌우 살랑 rotate ±3°, 2회 | `ANIM_TWO_HEARTS` |
| HOLD_HANDS | bob translateY ±2px | 💕 절차형 rise |
| CHEEK_KISS | pop scale 1→1.06 | 💗 절차형 drift |
| LEAN | 느린 기울기 rotate -3° 유지 후 복귀 | ✨ 절차형 |
| HIGH_FIVE | bounce -10px 1회 | `ANIM_ZAP` |
| SULK | shake ±3px | 💢 절차형 pulse |
| MAKE_UP | pop | `ANIM_SPARKLING_HEART` |
| EAT_TOGETHER | bob | 없음 |
| GOOD_NIGHT | breathe scale 1→1.02 느리게 | 💤 절차형 rise |
| PICK_UP | 좌→우 slide 6px | 💨 절차형 |

재생 규칙·동작 줄이기·옛 세트 규칙은 P1 과 동일.

---

## 6. 하지 않는 것

- 사진 두 장을 받아 한 번에 그리기 — 사진을 다시 받게 되고(§9), describe 2회·업로드 2회가 붙는다. 앵커 방식이 싸고 일관적이다.
- 사용자가 장면 문구를 직접 쓰기(자유 프롬프트) — 안전 필터 거절·부적절 생성 리스크, 원가 예측 불가.
- DUO 전용 과금 상품 — 기존 한도·크레딧으로 충분. 사용량 데이터를 본 뒤 재검토.
- 입맞춤·침대 등 밀착 장면.

## 7. 열린 질문 (구현 전 결정)

1. 탈퇴 시 DUO 처리(3-1) — 한쪽 탈퇴면 관계의 DUO 전부 삭제가 기본안.
2. 좌우 배치 규칙 — "요청자 = 오른쪽" 고정 vs 성별 무관 무작위. D0 결과로 정한다.
3. D0 합격 장면이 6개 미만이면 출시를 미룰지, 있는 만큼 낼지.

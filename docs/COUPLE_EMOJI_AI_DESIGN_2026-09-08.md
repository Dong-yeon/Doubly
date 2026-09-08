# 우리 이모지 — 애인 얼굴로 감정 이모지 만들기 (설계 메모, 2026-09-08)

사용자 제안: "자기 애인으로 이모지 만들기 — 화남·기쁨·신남 이런 이모지에 사진 넣어서 만드는 기능".
두 갈래(A. 사진 오려서 템플릿 합성 / B. AI로 캐릭터화 생성)를 놓고 **B안으로 진행하기로 결정**했다.
§1~§11 은 착수 전 설계 결론이다. 이후 진행: 0단계 실험(§12), 움직이는 이모지 방향(§13),
**1단계 백엔드 구현 완료(§14, 2026-09-08)**. 2단계 프론트는 미착수.

관련 문서: [CHAT_EMOTICON_EXPANSION_ANALYSIS_2026-09-07.md](CHAT_EMOTICON_EXPANSION_ANALYSIS_2026-09-07.md)
(이모티콘 재고·PRO 스티커 구조), [IMAGE_UPLOAD.md](IMAGE_UPLOAD.md)(이미지 토폴로지 원칙),
[PRO_PLAN_DESIGN.md](PRO_PLAN_DESIGN.md)(게이팅), [STABILITY_ANALYSIS_2026-09-01.md](STABILITY_ANALYSIS_2026-09-01.md)(Gemini 503 이력).

---

## 1. 한 줄 정의

**상대(또는 나)의 사진 한 장으로 감정별 캐릭터 이모지 세트를 AI가 그려주고, 그 세트를 커플이 함께
채팅 이모티콘·무드 상태로 쓴다.** 범용 스티커팩과 달리 "둘만 웃을 수 있는" 콘텐츠이고, 원가가
0이 아닌 첫 PRO 상품이다.

## 2. 왜 B안인가 (A안을 접은 이유)

| | A. 크롭 + 템플릿 합성 | **B. AI 캐릭터화 (채택)** |
|---|---|---|
| 결과물 | 얼굴 원형 사진 + 감정 프레임 | 만화풍으로 그려진 "그 사람 같은" 이모지 |
| 원가 | 0 | 세트당 실비(§8) |
| 와우 | 낮음 — 배경 제거 없으면 "동그란 사진" | 높음 — 카톡 이모티콘과 같은 결 |
| PRO 상품성 | 약함 (`PREMIUM_STICKER` 가 이미 "원가 0을 판다"는 약점을 안고 있다) | 강함 — 키보드에도, 다른 앱에도 없는 것 |

A안의 성패는 얼굴 세그멘테이션 품질인데 웹은 온디바이스 ML 이 없어 원형 크롭에 그친다.
B안은 플랫폼 차이가 없고(서버가 만든다), 이미 있는 AI 인프라(`GeminiClient`·`AiJobService`·
`PlanGuard`) 위에 올라간다. **A안은 B안의 폴백으로도 두지 않는다** — 두 결과물의 결이 달라
한 트레이에 섞이면 싸구려로 보인다.

## 3. 범위 (MVP)

- **감정 6종 고정**: 화남 · 기쁨 · 신남 · 슬픔 · 졸림 · 사랑. 기존 무드 12종과 겹치는 결로 골랐다
  (`moodEmojis.ts` 의 빡침·행복·신남·슬픔·졸림 + 사랑). 사용자가 감정을 고르지 않는다 — 사진 한 장 →
  세트 한 벌. 고르게 하면 선택 마비와 "한 장씩 과금" 계산이 생긴다.
- **대상은 커플 중 한 사람**: 만드는 사람이 "누구 얼굴인지"(`subject_user_id`)를 고른다. 애인 얼굴이
  기본, 내 얼굴도 가능.
- **소유는 커플 공용**: 만든 사람이 아니라 `relation_id` 에 속한다. 둘 다 보고, 둘 다 쓰고, 둘 다 지운다.
  상대 얼굴을 쓰는 기능이라 **상대가 지울 수 있어야** 동의 문제가 풀린다(§9).
- **노출 지점 두 곳**: ① 채팅 트레이 "우리 이모지" 탭 → 말풍선 없이 크게 그림(기존 STICKER 렌더와 동일)
  ② 무드 상태 — 유니코드 대신 우리 이모지로 상태 설정(2단계, §7).

### Non-goals (이번엔 안 한다)
- 메시지 **리액션**에 우리 이모지 쓰기 — `chat_message_reactions.emoji` 가 `VARCHAR(10)` 이라 스키마부터
  갈라야 하고, 범위가 두 배가 된다. 반응 보고 결정.
- 감정 개별 재생성·프롬프트 편집·스타일 선택 — 과금 단위가 흐려진다.
- 한 세트에 두 사람 얼굴을 같이 넣기(커플 이모지) — 얼굴 두 개 일관성은 모델 리스크가 훨씬 크다.
- 홈 위젯·잠금화면 노출.

## 4. 흐름

```
[앱] 사진 선택(상대 얼굴) → 크롭 → Cloudinary 업로드(기존 서명 경로, PHOTO_UPLOAD 소비)
  → POST /api/v1/couple-emojis/generate { sourceImageUrl, subjectUserId }
[서버] PlanGuard.consume(AI_COUPLE_EMOJI) → AiJobService.submit → jobId 즉시 반환
  (작업 안) 원본 다운로드(w_1024,c_limit — FoodAnalysisService 와 같은 변환)
          → 감정 6종 × Gemini 이미지 생성 → 서버가 Cloudinary 에 결과 업로드(§5-3)
          → couple_emojis 6행 insert → 원본 삭제(§9) → CoupleEvent 발행 → 상대에게 푸시
[앱] awaitAiJob(jobId) → 세트 미리보기 → 마음에 안 드는 장은 개별 삭제
```

- **결과는 자동 저장한다.** "저장할까요?" 를 묻지 않는다 — 이미 돈이 나갔고, 버리는 건 개별 삭제로
  충분하다. 실패한 감정이 있으면 나머지만 저장하고 응답에 `failedEmotions` 를 담는다(6장 중 1장
  안전필터에 걸렸다고 세트 전체를 버리지 않는다).
- **작업 하나가 60초 안팎**이다(감정당 5~15초 × 6, 순차). `aiJob.ts` 의 사용자 대기 한계 2분 안에
  들어오지만 여유가 없다. 작업 안에서 감정 6개를 **동시에** 부를지는 착수 시 실측으로 정한다 —
  `AiJobService` 풀이 4스레드라 작업 안에서 또 병렬화하면 Gemini 분당 한도를 한 사용자가 다 쓴다.
- 앱이 2분 뒤 포기해도 서버는 계속 만들고 저장한다(여행 일정과 같은 패턴). 트레이를 다시 열면 있다.

## 5. 서버 설계

### 5-1. Gemini 이미지 생성 — `GeminiClient` 에 메서드 추가

지금 `GeminiClient` 는 **텍스트/JSON 출력만** 있다(`generateJson*`). 이미지 입력(`imagePart`)은
있지만 이미지 **출력** 경로가 없다. 추가할 것:

```java
/** 이미지 생성 — 응답 parts[].inlineData 의 base64 를 바이트로 돌려준다. */
public GeneratedImage generateImageInBackground(Long userId, Feature feature,
                                                List<Map<String, Object>> parts)
```

- 요청 본문: `generationConfig.responseModalities = ["IMAGE"]` (모델에 따라 `["TEXT","IMAGE"]` 요구).
  JSON 모드(`responseMimeType`)와 **같이 쓸 수 없다** — 기존 `generateJsonOrThrow` 를 재사용하지 말고
  본문을 따로 만든다.
- **모델은 별도 프로퍼티**(`fitto.gemini.image-model`)로 둔다. 텍스트 모델(`gemini-2.5-flash-lite`)로는
  이미지가 안 나온다. 착수 시점의 이미지 생성 모델 ID·단가를 **반드시 다시 확인**한다(2026-09 기준
  `gemini-2.5-flash-image` 계열이지만 이름이 자주 바뀐다).
- **재시도·폴백은 `callWithRetry` 를 그대로 탄다.** 다만 텍스트 폴백 모델로 떨어지면 이미지가 안 나오므로
  `fallbackModelFor` 에 이미지 모델 짝을 따로 두거나, 이미지 모델은 폴백 없이 재시도만 한다. 후자가 단순하다.
- **실패 시 한도 환불**(`refundUsage`)은 기존 패턴대로 — 단 세트 단위 소비이므로 6장 중 일부 성공이면
  환불하지 않는다.
- 안전 필터 거절(`finishReason = SAFETY / IMAGE_SAFETY` 또는 parts 에 이미지 없음)은 재시도 대상이 아니다.
  새 `ErrorCode.AI_IMAGE_REJECTED`("이 사진으로는 만들 수 없어요. 얼굴이 잘 보이는 다른 사진을 골라주세요.")로
  구분한다. 기존 `AI_ANALYSIS_FAILED` 문구("AI 분석에 실패했어요")는 여기 맞지 않는다.

### 5-2. 프롬프트 — 일관성이 전부다

세트 6장이 "같은 캐릭터"로 보여야 한다. 시드 고정이 안 되므로 **프롬프트로 스타일을 못 박는다**:

- 공통 앵커(6장 동일): "이 사진 속 인물을 귀여운 2D 벡터 스티커 캐릭터로. 큰 머리·작은 몸, 두꺼운 흰 테두리,
  단색 배경, 얼굴 특징(머리 모양·안경·점 등) 유지. 텍스트·워터마크 없음."
- 감정별 변주(한 줄): 화남 = "붉어진 얼굴, 머리 위 김", 신남 = "두 팔 번쩍, 색종이", 졸림 = "zzz, 감은 눈" …
- **참조 사진을 6번 다 넣는다.** 앞 결과를 다음 입력으로 넘기는 체인 방식은 오차가 누적되고 실패가
  전파된다.
- **투명 배경은 기대하지 않는다.** 모델 출력에 알파가 없다. "단색(흰) 배경 + 흰 테두리 스티커 컷"으로
  요청하고, 앱은 정사각 이미지를 그대로 그린다. 말풍선 없이 크게 그리는 STICKER 렌더에서는 흰 배경이
  거슬릴 수 있어 **원형 마스크**로 감싼다(`stickerImage` 스타일 옆에 `coupleEmoji` 스타일 추가).
- 프롬프트는 `resources/prompts/` 나 상수로 두고 **버전 문자열**을 행에 남긴다(`prompt_version`). 나중에
  스타일을 바꿔도 옛 세트를 왜 다르게 생겼는지 알 수 있다.

### 5-3. 결과 저장 — 서버가 Cloudinary 에 올린다 (원칙의 예외, 명시)

`IMAGE_UPLOAD.md` 원칙은 "이미지는 서버를 지나가지 않는다(클라가 직접 업로드, 서버는 서명만)"이다.
**이 기능은 그 원칙의 의도적 예외다.** 생성물은 Gemini 에서 서버로 도착하므로 어차피 서버를 지난다.
선택지는 둘:

| | 서버가 업로드 (채택) | base64 를 앱에 돌려주고 앱이 업로드 |
|---|---|---|
| Redis 작업 결과 크기 | URL 6개 (수백 B) | 6장 base64 ≈ 1~2MB — `AiJob` 페이로드로 부적합 |
| 앱 실패 시 | 이미 저장됨 | 업로드 도중 앱이 죽으면 돈만 나가고 세트가 없다 |
| 서버 부담 | 세트당 6회 업로드 egress ≈ 1MB, CPU 0 (리사이즈 안 함) | 0 |

원칙이 막으려던 건 **모든 사용자 사진마다 Railway CPU 를 쓰는 리사이즈**였다. 여기는 PRO 게이팅된
드문 작업이고 리사이즈가 없다. `CloudinaryProperties` 에 `apiSecret` 이 이미 있어(`CloudinaryImageDeleter`
가 서명 삭제에 쓴다) 서명 업로드는 같은 재료로 된다. `CloudinaryImageDeleter` 옆에 `CloudinaryImageUploader`
를 둔다. 폴더는 `fitto/couple-emoji/` — 나중에 R2 로 갈 때 이 폴더만 따로 옮길 수 있게.

### 5-4. DB — `V{n}__couple_emojis.sql` (번호는 착수 시 **반드시** 다시 확인)

이 문서를 쓰는 동안에도 다른 세션이 `V79__feed_post_photos.sql` 을 만들었다(2026-09-08, 미커밋 상태로
주 워크트리에 있었다). 문서에 번호를 박아두면 이렇게 바로 낡는다 — CLAUDE.md 7절의 명령으로 확인하고 붙인다.

```sql
-- 우리 이모지 — 커플 소유. 한 번의 생성(batch)이 감정별로 여러 행을 남긴다.
CREATE TABLE couple_emojis (
    id              BIGINT       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    relation_id     BIGINT       NOT NULL REFERENCES relations (id),
    created_by      BIGINT       NOT NULL REFERENCES users (id),
    subject_user_id BIGINT       NOT NULL REFERENCES users (id),  -- 누구 얼굴인가
    batch_id        VARCHAR(36)  NOT NULL,                        -- 같은 생성에서 나온 묶음
    emotion         VARCHAR(20)  NOT NULL,                        -- ANGRY/HAPPY/EXCITED/SAD/SLEEPY/LOVE
    image_url       VARCHAR(500) NOT NULL,
    prompt_version  VARCHAR(20)  NOT NULL,
    deleted_at      TIMESTAMP,                                    -- 트레이에서만 숨김(§5-6)
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_couple_emojis_relation ON couple_emojis (relation_id, deleted_at);
```

- 세트 테이블을 따로 두지 않는다(`batch_id` 로 충분). 테이블이 하나 늘 때마다 Purger 순서가 늘어난다.
- H2·PostgreSQL 양립: `JSONB`·`ON CONFLICT` 없음. 위 구문은 V78 과 같은 형태다.
- `users` FK 두 개는 **탈퇴 시 `UserDataPurger` 가 먼저 지워야** 한다(§5-5). `RelationRecordPurger` 가
  관계 삭제 전에 지우므로 실제로는 거기서 다 빠진다.

### 5-5. Purger — 반드시 (CLAUDE.md 4절)

- `RelationRecordPurger.purge`: `chat_messages` 삭제 **앞에** `delete from couple_emojis where relation_id = :rid`.
  (메시지가 이모지 id 를 참조하지만 FK 는 걸지 않는다 — §5-6.)
- `RelationRecordPurger.collectImageUrls`: `select image_url from couple_emojis where relation_id = :rid` 추가.
  `deleted_at` 이 찍힌 것도 포함한다 — 숨김이지 삭제가 아니었으므로 Cloudinary 에 아직 있다.
- `UserDataPurger`: 관계가 없는 사용자에게는 행이 없으므로 추가 삭제문은 불필요하지만, 관계 purge 가
  먼저 도는 순서(현재 41~45행)가 유지돼야 한다. 주석으로 못 박는다.
- 이미지 삭제는 트랜잭션 밖(`deleteAllAfterCommit`) — 기존 패턴.

### 5-6. 채팅 — 새 `MessageType.COUPLE_EMOJI`

기존 `STICKER` 에 얹지 않고 타입을 나눈다. `STICKER` 의 content 는 로컬 번들 코드이고 서버가
`StickerPack`/`AnimatedSticker` 로 프리미엄 판정을 하는데, 여기에 원격 URL 을 섞으면 그 판정과
알림 미리보기·검색 제외·예약 전송 검증이 전부 분기해야 한다.

- `content` = `couple_emojis.id`, `image_url` = 그 행의 URL 을 **복사**해 둔다(비정규화). 이모지를 트레이에서
  지워도(`deleted_at`) 지난 메시지는 그대로 보여야 하고, URL 을 메시지에 두면 조인 없이 그린다.
- 서버 검증: `ChatService.send` 에서 그 id 가 **이 relation 소유이고 `deleted_at is null`** 인지 확인.
  PRO 판정은 **하지 않는다** — 만들 때 이미 게이팅했고, 커플 공용이라 상대(무료일 수도)도 쓴다.
  `PREMIUM_STICKER` 와 같은 "내가 결제하면 둘 다 쓴다" 프레임.
- 알림 미리보기: "우리 이모지를 보냈어요". 검색 제외(`ChatMessageRepository` 47행 주석과 같은 이유).
- 예약 전송(`ScheduleMessageRequest`)은 TEXT/STICKER/IMAGE 만 받는다 — 이번엔 늘리지 않는다.
- 구버전 앱 호환: 모르는 타입은 지금도 어떻게 그리는지 착수 시 확인. 최소한 빈 말풍선이 아니라
  "이모티콘" 한 줄은 나와야 한다.

### 5-7. API (`/api/v1/couple-emojis`)

| | | |
|---|---|---|
| `POST /generate` | `{ sourceImageUrl, subjectUserId }` → `{ jobId }` | PRO 게이트 + AI 큐 |
| `GET /ai/jobs/{id}` | 기존 | 결과 `{ batchId, emojis: [{id, emotion, imageUrl}], failedEmotions: [] }` |
| `GET /` | 트레이용 목록(`deleted_at is null`, 최신 batch 먼저) | 둘 다 조회 |
| `DELETE /{id}` | `deleted_at` 세팅 | **둘 다 가능** (§9) |
| `DELETE /batches/{batchId}` | 세트 통째로 | 둘 다 가능 |

`CoupleEvent.COUPLE_EMOJI_CHANGED` 를 생성 완료·삭제 시 발행해 상대 트레이를 갱신한다(다른 이벤트처럼
페이로드 없이, 수신측이 `GET /` 재조회). 생성 완료 시 상대에게 푸시: "OO님이 우리 이모지를 만들었어요 👀".

## 6. 게이팅 — `Feature.AI_COUPLE_EMOJI`

```java
/** 우리 이모지 생성 — 세트(6장) 단위로 1회 소비. 원가가 0이 아닌 첫 AI 이미지 기능(§8). */
AI_COUPLE_EMOJI("우리 이모지 만들기", Quota.blocked(), Quota.perMonth(5)),
```

- **FREE 는 막는다.** 다른 AI 기능은 "맛보기 → 부족 → 업셀" 패턴(`AI_DATE_COURSE` 월 1회)이지만 그건
  텍스트라 원가가 사실상 0이다. 이건 세트당 실비가 나간다(§8). 원가를 실측한 뒤 맛보기 1세트를 줄지 정한다.
- **PRO 월 5세트**는 임시값 — Feature 파일 주석대로 분포 보고 조정.
- `AI_TOTAL`(일 10회)에도 같이 세인다(기존 AI 기능과 동일). 세트 = 1회.
- 판정 위치: `POST /generate` 진입 시 `consume`. `AiJobService` 작업 안이 아니다 — 원본 다운로드 같은
  비싼 준비 전에 막아야 한다(`GeminiClient` 주석과 같은 이유).
- 원본 사진 업로드는 기존 `PHOTO_UPLOAD` 를 한 번 쓴다. 별도 예외를 두지 않는다.

## 7. 프론트

| 단계 | 파일 | 할 일 |
|---|---|---|
| 1 | `api/coupleEmoji.ts` (신규) | `generate`(내부에서 `awaitAiJob`) · `list` · `remove` |
| 1 | `store/coupleEmojiStore.ts` (신규) | 목록 캐시, `COUPLE_EMOJI_CHANGED` 수신 시 재조회 |
| 1 | `screens/chat/CoupleEmojiCreateScreen.tsx` (신규) | 사진 선택 → 크롭(정사각, 얼굴 중심) → 대상 선택(상대/나) → 생성 대기 → 미리보기·개별 삭제 |
| 1 | `ChatRoomScreen.tsx` | 트레이 패널에 "우리 이모지" 탭(비어 있으면 "만들기" 카드 하나) · `COUPLE_EMOJI` 말풍선 렌더(원형 마스크, 132px — 움직이는 이모티콘과 같은 크기) · 답장 인용 미리보기 |
| 1 | `types/index.ts` | `MessageType` 유니온 · `Feature` 유니온에 `AI_COUPLE_EMOJI` |
| 2 | `MoodPicker.tsx` · `CoupleHero.tsx` · `api/mood.ts` | 무드 선택지에 우리 이모지 행 추가, 홈 배지에 이미지 렌더 |

- 생성 대기 화면은 **진행률이 아니라 "감정 6칸이 하나씩 채워지는"** 형태가 맞다 — 순차 생성이라
  중간 결과를 보여줄 수 있고, 60초를 견디게 하는 건 이것뿐이다. 그러려면 작업이 감정 하나 끝날 때마다
  중간 상태를 남겨야 한다 → `AiJob` 에 `partial` 필드를 두거나, 감정별로 행을 즉시 insert 하고 앱이
  `GET /` 을 폴링한다. **후자가 단순하다**(`AiJob` 구조를 안 건드린다).
- 웹도 그대로 된다(서버 생성). 사진 크롭만 `expo-image-manipulator` 로 플랫폼 공통.

### 2단계 — 무드 연동

`mood_statuses.emoji` 가 `VARCHAR(10)` 이라 URL 이 안 들어간다. `couple_emoji_id BIGINT NULL` 컬럼을
추가하고(별도 마이그레이션), 있으면 이미지·없으면 유니코드로 그린다. 무드 히스토리(무드 캘린더)도
같은 분기. **여기가 이 기능의 본 무대일 수 있다** — 채팅에서 보내는 건 순간이지만 무드는 홈에 하루
종일 떠 있다. 1단계 반응을 보고 순서를 당길 수 있다.

## 8. 원가·한도 — 착수 시 실측할 것

- 이미지 생성 모델은 **출력 토큰으로 과금**되며 이미지 1장 ≈ 1,290토큰(2026-09 기준 문서값)이다.
  세트 6장이면 대략 **0.2~0.3 USD** 선. PRO 월 5세트 = 사용자당 월 1.5 USD 상한 — PRO 가격 대비
  감당 범위지만 **텍스트 AI 와 자릿수가 다르다.** 숫자는 착수 시 요금표로 다시 확인.
- 무료 티어 존재 여부도 확인 — 이미지 모델은 무료 쿼터가 없거나 매우 작을 수 있어 개발 중 테스트에도
  과금이 붙는다. **테스트는 감정 1종만 생성하는 플래그**를 두고 돌린다.
- Micrometer 태그는 기존 `record(model, outcome, elapsed)` 를 그대로 타므로 모델별로 갈린다. 세트 단위
  성공률(6/6 · 5/6 · 실패)을 별도 카운터로 남긴다 — 안전필터 거절률이 프롬프트 튜닝의 근거가 된다.
- Gemini 503 이력(`STABILITY_ANALYSIS_2026-09-01.md`): 이미지 모델은 더 자주 과부하된다고 가정하고
  `BACKGROUND` 정책(분 단위 재시도)으로만 부른다.

## 9. 동의·프라이버시 — 설계로 푼다

상대의 얼굴 사진을 생성 모델에 보내는 기능이다. 별도 동의 화면 대신 **구조**로 푼다:

1. **원본 사진은 저장하지 않는다.** 작업이 끝나면(성공·실패 무관) 서버가 `CloudinaryImageDeleter` 로
   원본을 지운다. 재생성하려면 다시 고른다. `couple_emojis` 에 원본 URL 컬럼을 두지 않는 이유다.
2. **상대가 언제든 지울 수 있다.** 삭제 권한은 `created_by` 가 아니라 `relation_id` 멤버 전원.
3. **만들어지면 상대가 바로 안다.** 푸시 + 채팅 트레이. 몰래 만들 수 없다.
4. **관계가 끝나면 전부 사라진다.** `RelationRecordPurger`(§5-5) — "지난 기록 삭제"와 탈퇴 둘 다.
5. 생성 화면 첫 진입에 한 줄 안내: "사진은 이모지를 만드는 데만 쓰고 저장하지 않아요."
6. 미성년자로 보이는 얼굴은 모델이 거절할 수 있다 — `AI_IMAGE_REJECTED` 문구로 흡수, 우회하지 않는다.

## 10. 리스크

| 리스크 | 대응 |
|---|---|
| **닮지 않는다** (가장 큰 리스크) | 프롬프트에 "특징 유지" 앵커 + 참조 사진 매 호출 첨부. 그래도 안 되면 기능 자체가 성립 안 함 → **착수 첫 반나절은 프롬프트 실험만** 한다. 코드 전에 결과물 6장부터 본다. |
| 세트 안 스타일 불일치 | 공통 앵커 고정, 온도 낮게. 실측으로 앵커 문구 조정 |
| 안전필터 거절 | 부분 성공 저장 + `failedEmotions` + 한도 미환불 규칙 |
| 60초 대기 이탈 | 감정별 즉시 insert + 칸이 채워지는 UI(§7) |
| 원가 폭주 | PRO 전용 + 월 5세트 + `AI_TOTAL` 이중 상한. 데일리 총량(`dailyLimitTotal`)에도 잡힌다 |
| 모델 ID 변경/폐기 | 프로퍼티로 분리, 착수·배포 시 재확인 |
| 이미지가 서버를 지나는 첫 기능 | §5-3 에 예외 사유를 남겼다. 리사이즈는 절대 붙이지 않는다 |

## 11. 착수 순서 (한 번에 다 하지 말 것)

0. **프롬프트 실험** — 코드 없이 Gemini 콘솔/스크립트로 실제 사진 2~3장 × 감정 6종. 닮음·일관성이
   안 나오면 여기서 멈추고 A안 재검토. **이 단계 결론을 이 문서 §12 에 추가한다.**
1. 백엔드: `GeminiClient.generateImage*` + 프로퍼티 → `CloudinaryImageUploader` → 마이그레이션(번호
   재확인) → 엔티티·리포지토리·서비스·컨트롤러 → `Feature`·`ErrorCode`·`CoupleEvent` → **Purger 두 곳**
   → `MessageType.COUPLE_EMOJI` + `ChatService.send` 검증. 커밋은 "인프라 / 도메인 / 채팅 연결" 셋으로.
2. 프론트 1단계(§7) → `npm run typecheck`.
3. PostgreSQL 로 테스트 1회(CLAUDE.md 6절 — 쿼리 추가 시 필수).
4. 실기기: 생성 → 트레이 → 전송 → 상대 화면 갱신 → 삭제 → 관계 삭제 후 Cloudinary 잔존 확인.
5. 2단계 무드 연동은 1단계 배포 후 반응 보고.

## 12. 실험 결과

### 12-1. 2026-09-08 — 착수, 결제 벽에서 멈춤

스크립트: `scripts/couple-emoji-experiment/generate.mjs`(사진 1장 → 감정 6종, 스타일 앵커 3종 비교) ·
`make-face.mjs`(실물 사진이 없을 때 쓰는 합성 얼굴 대역). 키는 로컬에 두지 않고 `railway run` 으로
운영 변수를 주입해 돌린다(키가 셸 이력·파일에 남지 않는다). 산출물 폴더는 `.gitignore` 처리 — 실제
얼굴 사진이 섞이므로 커밋하지 않는다.

**확인된 것**

| 항목 | 결과 |
|---|---|
| 운영 키로 보이는 이미지 모델 | `gemini-2.5-flash-image`(Nano Banana), `gemini-3.1-flash-image` / `-lite-image`(Nano Banana 2), `gemini-3-pro-image`(Pro) |
| 같은 키로 텍스트 모델(`gemini-2.5-flash-lite`) 호출 | 200 — 키 자체는 정상 |
| 이미지 모델 호출(2.5-flash-image · 3.1-flash-image · 3.1-flash-lite-image 전부) | **429** `generate_content_free_tier_input_token_count, limit: 0` |

**결론: 무료 티어에는 이미지 생성 쿼터가 0이다** (§8 의 "무료 쿼터가 없거나 매우 작을 수 있다"가
"없다"로 확정). 지금 운영 키는 무료 티어이므로 **실험도, 운영도 결제 활성화 없이는 한 장도 못 만든다.**
이건 프롬프트 이전의 전제 조건이라, 0단계는 여기서 멈췄다.

**다음에 할 것 (사용자 결정 필요)**

1. Google AI Studio / Cloud 프로젝트에 결제를 붙인다. 운영 키와 실험 키를 나눌지도 이때 정한다 —
   실험은 로컬에서 `GEMINI_API_KEY` 를 환경변수로 넘기면 되고, 운영 키는 그대로 둔다.
2. 실제 얼굴 사진 1~3장을 `scripts/couple-emoji-experiment/photos/` 에 넣는다(폴더째 gitignore).
3. 감정 1종(`--emotions ANGRY`)으로 먼저 파이프라인 확인 → 스타일 3종(`vector`·`kakao`·`threeD`) 각각
   6종 세트 → 닮음·일관성 판정을 12-2 에 적는다.

이 전제가 게이팅 설계(§6)에 미치는 영향: FREE 맛보기 세트는 더 어렵다. 텍스트 AI 와 달리 무료 쿼터로
흡수할 원가가 아예 없다.

### 12-2. 2026-09-08 — 결제 연결 후, 합성 얼굴로 파이프라인·일관성 확인

**키 분리 결정**: 이미지 전용 AI Studio 프로젝트를 따로 만들어 거기에만 결제를 붙였다. 기존 `Fitto AI`
프로젝트(텍스트, 무료 등급)는 그대로. Railway 변수 `GEMINI_IMAGE_API_KEY` 로 추가했고 `GEMINI_API_KEY` 는
건드리지 않았다. 백엔드는 아직 이 변수를 읽지 않는다 — 구현 시 `fitto.gemini.image-api-key` 로 연결한다.

실물 사진이 아직 없어 `make-face.mjs` 로 만든 합성 얼굴(안경·앞머리·둥근 얼굴·눈 밑 점·베이지 니트)로
돌렸다. **닮음 판정은 여기서 못 한다** — 원본이 가짜라 기준이 없다. 본 것은 파이프라인·스타일·세트 일관성.

| 항목 | 실측 (`gemini-2.5-flash-image`) |
|---|---|
| 성공률 | 12/12, 전부 `finishReason=STOP`, 안전필터 거절 0 |
| 장당 소요 | 10.6~17.2초 (평균 약 13초) → 6종 순차 약 80초. **§4 의 "60초 안팎" 가정보다 길다** |
| 장당 크기 | 640KB~990KB PNG, 1024×1024 |
| 출력 형식 | 흰 배경 + 흰 스티커 테두리. 투명 배경 없음(§5-2 가정대로) |
| 토큰 | 출력 **정확히 1,290 토큰/장**(12장 전부 동일), 입력 380~450. §8 의 장당 약 0.04 USD 가정이 맞다 → 세트 6장 ≈ 0.23 USD |

**v1 앵커(`vector`)** — 얼굴 특징(둥근 안경·앞머리·얼굴형)·선 굵기·치비 비율은 6장이 일치했다. 그러나
**옷이 장마다 바뀌고**(파랑 니트→노랑 티→크림 긴팔→…), **머리 길이가 단발↔장발**로 흔들리고, **구도가
전신↔흉상**으로 오갔다. 눈 밑 점은 6장 모두 빠졌다.

**v2 앵커(`vector2`)** — IDENTITY / OUTFIT / FRAMING / STYLE 네 블록으로 나누고 "사진과 같은 옷", "상반신만,
같은 크기" 를 명시했다. 결과: **옷 6/6 일치**(베이지 니트), **구도 6/6 상반신**, 머리 길이 편차 감소(완전
고정은 아님). 점은 여전히 빠짐 — 합성 원본에서도 점이 작아 약한 테스트였다. 실물로 다시 본다.
**v2 를 기본 앵커로 채택**하고 실물 사진 실험은 v2 부터 시작한다.

비교표: `scripts/couple-emoji-experiment/out/synthetic-compare-sheet.png` (gitignore, 로컬에만 있음).
`sheet.py` 가 실행 폴더들을 행으로 묶어 한 장으로 만든다.

**설계에 반영할 것**
- §4 대기 시간: 순차 80초는 `aiJob.ts` 2분 한계에 너무 가깝다. 감정별 즉시 insert + 칸 채워지는 UI(§7)를
  선택이 아니라 **필수**로 올린다. 작업 안 병렬화(2~3개 동시)도 실측 후보.
- §5-2 프롬프트: 앵커를 v2 구조(IDENTITY/OUTFIT/FRAMING/STYLE 블록)로 확정. "사진과 같은 옷" 규칙은
  사용자가 고른 사진의 옷이 그대로 캐릭터 옷이 된다는 뜻 — 생성 화면 안내 문구에 넣는다("이 옷차림으로
  그려져요").
- 남은 확인(실물 사진 필요): 닮음, 점·흉터 같은 작은 특징 보존, 남성/짧은 머리/안경 없음 케이스,
  `kakao`·`threeD` 앵커 비교, `gemini-3.1-flash-image`(Nano Banana 2) 품질·속도 비교.

### 12-3. 2026-09-08 — 실물 사진(남성·짧은 가르마 머리·흰 셔츠·한쪽 눈 찡긋·가장자리에 두 번째 인물)

사용자가 넣어준 실물 1장으로 7세트(42장)를 돌렸다. 전부 `finishReason=STOP`, 거절 0.
비교표는 `out/real1-compare-sheet.png` · `out/real1-round2-sheet.png` · `out/real1-final-sheet.png`(로컬).

| # | 조건 | 머리 길이 일치 | 비고 |
|---|---|---|---|
| 1 | 원본 · v2 · 2.5-flash-image | **4/6** | angry·sleepy 가 어깨 길이 긴 머리로. 옷 6/6, 구도 6/6, 얼굴 닮음은 좋음 |
| 2 | 크롭 · v2 · 2.5 | **4/6** | happy·love 가 긴 머리. **크롭해도 같다 → 가장자리 인물 탓이 아니라 모델의 흔들림** |
| 3 | 크롭 · v3(주인공 지정·머리 길이 고정) · 2.5 | **5/6** | love 만 흘렀다. 프롬프트만으로는 여기가 한계 |
| 4 | 크롭 · v3 + **특징 문장 주입**(2단계) · 2.5 | **6/6** | 흔들림 0. 다만 얼굴이 좀 더 어리고 일반적으로 그려짐 |
| 5 | 크롭 · v3 · **Nano Banana 2**(`gemini-3.1-flash-image`) | 6/6 | 닮음이 가장 좋다(둥근 볼·가르마). 그러나 excited 에 **없는 주근깨**가 생김 |
| 6 | 크롭 · v3 + 특징 주입 · **Nano Banana 2** | **6/6** | 주근깨 없음, 닮음 유지, 세트 일관성 최고. **채택 후보** (excited 배경이 살짝 회색) |

**2단계(describe → generate)가 결정적이었다.** 텍스트 모델(`gemini-2.5-flash-lite`, 무료 키)이 사진을 보고
`Male, short hair, dark brown, straight, round face, almond eyes, thin eyebrows, no glasses, no facial hair,
white collared shirt` 를 뽑았고, 이걸 `IDENTITY FACTS (copy these exactly):` 로 앵커에 붙이자 "머리 길이를
유지하라"(상대 지시)가 "짧은 머리"(절대 지시)가 되어 두 모델 모두 6/6이 됐다. 원가는 사실상 0(텍스트 한 번).

**모델**: Nano Banana 2 가 닮음·속도(장당 8~11초 vs 10~17초)·크기(장당 약 330KB vs 800KB) 모두 앞선다.
크기 차이는 해상도가 아니라 **포맷**이다 — 둘 다 1024×1024 인데 NB2 는 `inlineData.mimeType` 이 `image/jpeg` 로 온다(스크립트는 `.png` 로 저장했지만 실제 JPEG). 서버 업로드 시 확장자를 박지 말고 응답 mimeType 을 따른다.
출력 토큰은 약 1,250~1,280 으로 2.5 와 비슷하지만 **단가는 아직 확인하지 않았다** — AI Studio 요금표에서
`gemini-3.1-flash-image` 를 확인한 뒤 확정. 단가가 2.5 의 2배를 넘으면 2.5 + 특징 주입(#4)으로 간다.

**설계에 반영할 것**
- §4 흐름에 **describe 단계 추가**: 원본 다운로드 → `GeminiClient.generateJson`(기존 메서드, JSON 스키마
  `{gender, hairLength, hairStyle, hairColor, faceShape, eyes, eyebrows, glasses, facialHair, marks, outfit}`)
  → 사실 문장으로 조립 → 6장 생성. 텍스트 키·이미지 키가 다르므로 `GeminiClient` 가 Feature 별로 키를
  고를 수 있어야 한다(`fitto.gemini.image-api-key`).
- §5-2 프롬프트: `vector3` 앵커 + IDENTITY FACTS 를 `prompt_version = "v4"` 로 확정. describe 결과도
  행에 남긴다(`identity_facts VARCHAR(500)`) — 재생성·디버깅 때 같은 사실을 다시 쓴다.
- §3 Non-goal 이던 **감정 개별 재생성**은 그대로 제외해도 된다 — #4·#6 이 6/6 이라 세트 통째로 다시
  만드는 경로만으로 충분. 실사용에서 흔들림이 보이면 그때 "이 장만 다시" 를 재생성 상한과 함께 넣는다.
- 앱 크롭 단계는 유지(정사각·얼굴 중심). 흔들림 원인은 아니었지만 주인공을 명확히 하고 업로드 크기를 줄인다.
- 남은 확인: 여성·긴 머리·안경 케이스 1명 더(특징 주입이 "긴 머리"도 고정하는지), 아기·미성년자 거절
  여부(§9), NB2 단가.

### 12-4. 2026-09-08 — 스타일 피드백 반영(v4) + 두 번째 실물(여성·긴 머리)

사용자 피드백: "눈이 좀 더 크면 좋겠다. 지금은 너무 정직하다. 좀 더 대두여도 된다. 더 캐릭터화하자."

**v4 앵커** — v3 의 IDENTITY/OUTFIT/FRAMING 은 그대로 두고 STYLE 만 바꿨다: "머리가 전체 높이의 절반",
"실제의 두 배쯤 큰 눈 + 큰 하이라이트", "아주 작은 코·작은 입·둥근 볼", "카카오 이모티콘 같은 단순화된
장난스러운 만화, 사실적 초상 아님". 닮음은 특징 주입이 붙잡으므로 과장을 세게 걸어도 된다.

| 조건 | 결과 |
|---|---|
| 첫 사진(남성) · v4 + 특징 주입 · NB2 | 머리 6/6 고정 유지. 눈이 크고 하이라이트가 들어감(angry·excited·love 에서 뚜렷), 머리 비율 커짐. happy·sleepy 는 눈을 감는 표정이라 큰 눈이 드러나지 않는다 — 감정 변주 문구 문제이지 앵커 문제가 아님 |
| **두 번째 사진(여성·긴 생머리·중간 가르마·핑크 하이넥·안경 없음) · v4 + 특징 주입 · NB2 · 크롭 없음** | **6/6 긴 머리 고정, 옷 6/6, 큰 눈·대두 일관**. describe 결과: `Female, long hair, straight dark hair, middle part, oval face, almond eyes, thin eyebrows, no glasses, no facial hair, no moles/freckles, light pink turtleneck shirt` |

두 사람(짧은 머리 남성 / 긴 머리 여성) 모두 6/6 이므로 **특징 주입이 "짧다"만이 아니라 "길다"도 고정한다**는
게 확인됐다. 두 번째 사진은 크롭 없이도 됐다 — 인물이 중앙에 크게 있으면 크롭은 필수가 아니지만 앱에서는
유지한다(§12-3).

**확정**: `prompt_version = "v4"` = `vector4` 앵커 + IDENTITY FACTS 주입 + `gemini-3.1-flash-image`(단가 확인 조건부).
스크립트의 `vector4` 블록이 곧 운영 프롬프트 초안이다.

**남은 다듬기(구현 단계에서)**
- happy 변주: "closed-eye smile" → 눈을 뜬 웃음으로 바꿔 큰 눈이 보이게 할지. 감은 눈 웃음이 더 "행복"
  같기도 하다 — 둘 다 뽑아 보고 고른다.
- excited 배경이 가끔 연회색(NB2, 2회 중 1회). 앱이 원형 마스크로 감싸면 안 보이지만, 프롬프트에
  "pure white (#FFFFFF) background" 를 명시해 본다.
- 실험 총 비용: 오늘 생성 약 90장. NB2 단가 확인 후 정산.

## 13. 움직이는 이모지 — 지금은 안 하고, 방식은 정해 둔다

사용자 질문(2026-09-08): "이 이모티콘을 움직이는 이모지로 만드는 건 무리인가?"

**무리는 아니지만, 캐릭터를 움직이게 하는 게 아니라 효과를 움직이게 하는 방식이어야 한다.**

| 방식 | 판단 |
|---|---|
| 영상 생성 모델(Veo 등)로 짧은 클립 | ❌ 초당 과금이라 이모지 하나가 세트 전체보다 비싸고, 결과가 스티커 형태(흰 테두리·정사각)로 안 나오며, 서버에서 WebP/GIF 변환(ffmpeg)이 필요해 `IMAGE_UPLOAD.md` 토폴로지를 또 깬다 |
| 이미지 모델로 키프레임 2~3장 생성 후 크로스페이드 | ❌ 원가 2~3배인데, 이번 실험에서 본 대로 **같은 프롬프트로도 장마다 흔들린다**. 프레임 사이가 튄다 |
| **정지 캐릭터 + 앱 쪽 모션** | ✅ 캐릭터 PNG 는 그대로 두고, 감정별 모션을 앱이 입힌다: 화남 = 좌우 떨림 + 김 구름, 신남 = 통통 튀기 + 색종이, 슬픔 = 살짝 처짐 + 눈물, 졸림 = 느린 흔들림 + zzz, 사랑 = 두근거림 + 하트, 기쁨 = 반짝임. 원가 0, 플랫폼 공통 |

세 번째가 맞는 이유는 이미 재료가 있어서다 — `react-native-reanimated` 가 있고, 움직이는 이모티콘용
`lottie-react-native` 가 들어와 있다(`CHAT_EMOTICON_EXPANSION_ANALYSIS_2026-09-07.md` §7). 감정 6종의 효과
레이어(김·색종이·눈물·zzz·하트·반짝임)를 Lottie 로 한 벌 만들어 캐릭터 위에 얹으면, 세트를 새로 만들
때마다 자동으로 움직이는 이모지가 된다. 카톡 이모티콘의 체감 핵심이 "움직인다"는 점(같은 문서 §3)과도 맞는다.

단, **생성 프롬프트에서 효과를 빼야 한다.** 지금 v3 변주는 "steam clouds", "confetti", "zzz letters" 를
그림에 그려 넣는데, 앱이 효과를 얹을 거면 그림에는 표정·자세만 남기고 효과는 비운다. 이건 1단계 출시 뒤
2단계(무드 연동)와 같은 시기에 결정하면 된다 — 지금 그림에 넣어둔 효과는 정지 상태에서도 감정을 읽게
해주므로 1단계에서는 그대로 둔다.

## 14. 구현 기록 — 1단계 백엔드 (2026-09-08)

11절 1단계를 세 커밋으로 끝냈다(`4ea9892` 인프라 → `5b3900b` 도메인 → `ffbc593` 채팅). 설계에서 달라진 것만 적는다.

| 설계(§) | 구현에서 바뀐 것 | 이유 |
|---|---|---|
| §4 원본 사진 업로드 = 기존 서명 경로 | **전용 서명 엔드포인트** `POST /couple-emojis/upload-signature` → 폴더 `fitto/emoji-source/`. `generate` 는 이 폴더의 URL 만 받는다 | 생성 뒤 서버가 원본을 지우는데(§9), 아무 URL 이나 받으면 상대 피드 사진 URL 을 넣어 지워버리는 경로가 된다. "이 폴더의 것만 지운다"는 경계가 필요했다 |
| §6 판정 위치 "진입 시 consume" | `prepare`(요청 스레드: 검증+차감) / `generate`(백그라운드) 로 서비스를 둘로 쪼갬 | 기존 AI 기능(MealController)은 작업 안에서 차감해 402 가 폴링 한 바퀴 뒤에 온다. 이 기능은 즉시 돌려준다 — 컨트롤러가 `prepare` 의 티켓을 `AiJobService` 에 넘긴다 |
| §5-1 환불 | `GeminiClient.generateImageInBackground` 는 환불하지 않고 `refund()` 를 공개. 서비스가 "한 장도 못 살렸을 때만" 환불 | 클라이언트 안에서 장마다 환불하면 세트당 여러 번 환불된다 |
| §7 "감정별 즉시 insert" | 장마다 `TransactionTemplate` 로 개별 커밋 | 앱이 폴링 사이에 `GET /` 을 다시 부르면 칸이 하나씩 채워진다. 한 트랜잭션이면 1분간 아무것도 안 보이고 커넥션을 붙잡는다 |
| §5-2 프롬프트 | `CoupleEmojiPrompts` = 실험 스크립트의 `vector4` + `--describe` 그대로, `prompt_version="v4"`. describe 는 기존 `generateJsonInBackground` + JSON 스키마(자유 형식이 아니라 필드별) | 스키마로 받으면 빈 값·문장형이 안 생긴다. 사실 문장은 `factsOf` 가 실험 때와 같은 콤마 형태로 조립 |
| §5-4 DB | 설계 그대로 + `identity_facts VARCHAR(500)`. 번호는 **V80** | V79 를 다른 세션이 썼다(§5-4 주석대로 착수 시 재확인) |
| 원본 다운로드 | `FoodAnalysisService` 의 다운로드·SSRF 방지·매직바이트 판별을 `CloudinaryImageFetcher` 로 추출해 공유 | 같은 코드를 두 번 두지 않는다. `FoodAnalysisService` 생성자 시그니처는 기존 테스트 때문에 유지 |
| 키 | `GEMINI_IMAGE_API_KEY` / `GEMINI_IMAGE_MODEL`(기본 `gemini-3.1-flash-image`). 이미지 키가 비면 텍스트 키로 폴백 | Railway 에 이미 넣어둔 변수 이름과 맞춤(§12-2) |

**검증**: H2 전체 584건 통과(`CoupleEmojiFlowTest` 7건 포함 — 검증·한도 시점, 6종 저장, 부분 실패, 전부 실패
환불, 커플 공용 숨김, 채팅 전송·URL 복사, Purger). 프론트 `typecheck` 통과(FeatureKey·MessageType 동기화).
**PostgreSQL 검증(같은 날, 이후)** — CLAUDE.md 6절이 말한 "H2 에서 통과한 게 운영에서만 터지는" 사례를 정확히
하나 잡았다. `CoupleEmojiService` 가 클래스 단위 `@Transactional(readOnly = true)` 인데 백그라운드 `generate` 에
어노테이션이 없어 읽기 전용 트랜잭션을 물려받았고, 그 안에서 장마다 여는 `TransactionTemplate` 가 바깥에
합류해 INSERT 가 `cannot execute INSERT in a read-only transaction` 으로 거절됐다. H2 는 읽기 전용을 강제하지
않아 584건이 다 통과했었다. 수정: `generate` 를 `NOT_SUPPORTED`(트랜잭션 밖, 1분간 커넥션 안 잡음) +
템플릿 `REQUIRES_NEW`. 수정 후 PostgreSQL 전체 스위트 통과.

PostgreSQL 로 돌릴 때 두 가지를 더 알아냈다(RUNNING.md 의 명령 그대로면 안 된다):
- 컨테이너 기본 `max_connections=100` 으로는 테스트 컨텍스트가 여럿 떠서 `too many clients` 로 33건이
  컨텍스트 로드부터 실패한다 → `postgres:16 -c max_connections=400` + `-Dspring.datasource.hikari.maximum-pool-size=3`.
- 컨테이너를 재사용하면 테스트가 고정 이메일로 가입하므로 "이미 가입된 이메일" 로 전부 실패한다 → 매 실행마다 새 컨테이너.

**2단계(프론트)에서 붙일 것**: `api/coupleEmoji.ts`(`upload-signature` → 크롭 업로드 → `generate` → `awaitAiJob`,
폴링 중 `GET /` 재조회) · 트레이 탭 · `COUPLE_EMOJI` 말풍선(원형 마스크 132px) · `COUPLE_EMOJI` CoupleEvent 수신 ·
`AI_COUPLE_EMOJI` 잠금 배지. 알림 미리보기는 서버가 `[우리 이모지]` 로 내려준다.

## 15. 부수 실험 — 손그림 "비개구리" → 기본 이모티콘 (2026-09-08)

사용자가 그린 비개구리(하트형 머리·짧은 다리) 스케치 4장(첫 장에 7종이 겹쳐 있어 낱장으로 잘라 총 10장)을
같은 이미지 모델로 스티커화했다. `scripts/couple-emoji-experiment/sketch.mjs`(프롬프트: "스케치의 캐릭터
디자인을 그대로, 종이·줄·낙서 제거, 흰 테두리 스티커") + `crop_frog.py`.

**결과: 10/10 성공, 디자인 보존·그림체 일관성 모두 좋음.** 하트형 머리·눈 모양·막대 다리·소품(편지·이불·
잎사귀)이 그대로 살았고, 연두색·흰 테두리로 10장이 한 세트처럼 나왔다. 장당 약 10초.
`CHAT_EMOTICON_EXPANSION_ANALYSIS_2026-09-07.md` §7 (B) "자체 캐릭터 PNG 제공 → 두 곳에 추가" 경로에
바로 태울 수 있는 재료다 — 우리 이모지와 달리 **런타임 생성이 아니라 번들 에셋**이므로 원가 0, 게이팅은
기존 `PREMIUM_STICKER`/무료 분배만 정하면 된다.

사용자 아이디어(같은 날): 감정 외에 **커플 상호작용** — 꽃단장, 안기, 이뻐해주기. 두 마리가 등장하는
장면은 기존 가상 터치(손잡기·토닥임·포옹·뽀뽀)의 결과 화면과 짝을 이룰 수 있다. 다음 스케치 때 두 마리
구도로 그리면 같은 스크립트로 바로 뽑아볼 수 있다.

남은 결정: 세트 구성(감정 7 + 상호작용 N), 무료/PRO 배분, 스케치 → 최종본 사이의 손질(배경 순백 통일,
크기 정규화)은 PNG 를 `frontend/assets/stickers/` 에 넣기 전에 한 번.

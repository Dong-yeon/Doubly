# 우리 이모지 — 애인 얼굴로 감정 이모지 만들기 (설계 메모, 2026-09-08)

사용자 제안: "자기 애인으로 이모지 만들기 — 화남·기쁨·신남 이런 이모지에 사진 넣어서 만드는 기능".
두 갈래(A. 사진 오려서 템플릿 합성 / B. AI로 캐릭터화 생성)를 놓고 **B안으로 진행하기로 결정**했다.
**아직 구현하지 않았다.** 이 문서는 착수 전 설계 결론이다.

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

### 5-4. DB — `V{n}__couple_emojis.sql` (번호는 착수 시 다시 확인, 2026-09-08 기준 다음은 V79)

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

## 12. 실험 결과 (착수 시 채운다)

_(0단계 프롬프트 실험 결과 — 사용 모델, 닮음 판정, 최종 앵커 문구, 감정별 변주 문구, 거절 사례)_

# 2026-09-08 커밋 전수 점검 (리뷰만, 수정 없음)

사용자 지시: "오늘 커밋된 내용들에 대해서 다시 한번 점검해줄수 있어?"
범위: `277f6a1..ffa20e7` — 커밋 약 50개, 병합 브랜치 8개, 114 파일(+5,321 / −409).
방법: 영역 4개(백엔드 우리 이모지 / 백엔드 피드·무드·푸시 / 프론트 우리 이모지 / 프론트 피드·테마·브랜드)로 나눠
병렬 검토 → **P1 은 전부 코드로 재확인**했다. 아래는 재확인을 통과한 것만이다.

## 0. 검증 게이트 상태

| 게이트 | 결과 |
|---|---|
| CI (`f18130e`, 오늘 코드 변경 전부 포함) | ✅ 백엔드 H2 테스트 + 프론트 typecheck 통과 |
| 로컬 `npm run typecheck` (병합 직전 `db9e02a`) | ✅ |
| 로컬 `./gradlew test` | ❌ **못 돌림** — 이 머신에 JDK 21 이 없다(`.jdks/openjdk-25`, IntelliJ JBR 도 25). Gradle 8.14 는 JDK 25 로 못 뜬다. CI 가 대신 검증 |
| CLAUDE.md 4절 (Flyway H2/PG · Purger) | ✅ V79·V80·V81 모두 H2 호환 구문. `feed_post_photos` 는 `ON DELETE CASCADE` + URL 수집, `couple_emojis`/`mood_statuses` 순서 명시 |

## 1. 고칠 것 — 우선순위순

| # | 심각도 | 위치 | 결함 | 시나리오 | 제안 |
|---|---|---|---|---|---|
| 1 | **P1** | `RelationRecordRestorer.java:33-58` | "지난 기록 불러오기"가 `couple_emojis`·`mood_statuses` 를 새 관계로 옮기지 않고 옛 관계 행을 `delete` 한다. 두 테이블 다 `relations` FK 가 있다 | 무드를 한 번이라도 남겼거나 우리 이모지를 만든 커플이 관계 종료 → 재연결 → 복원 → **FK 위반으로 500, 기록이 안 돌아온다.** `mood_statuses` 는 V44 부터 있던 구멍이고 V80 이 하나 더 얹었다. `RestoreRecordsFlowTest` 는 places·anniversary 만 심어 못 잡는다 | `move("mood_statuses","couple_id")`, `move("couple_emojis","relation_id")` 추가 + 테스트에 무드·이모지 심기 |
| 2 | **P1** | `CoupleEmojiService.java:165-202` | 원본 사진 삭제가 감정 루프 **뒤**에만 있다. `fetch` 가 파일 있는 채로 거절(`PHOTO_TOO_LARGE` 등)·`describe` 실패·루프 밖으로 새는 예외(`IllegalArgumentException`/`DataAccessException`) 경로에서는 안 지운다 | §9 "성공·실패 무관하게 지운다" 약속이 깨진다. 상대 얼굴 사진이 `fitto/emoji-source/` 에 남고 그 폴더를 치우는 코드는 없다 | 삭제를 `finally` 로. 루프 catch 를 `RuntimeException` 으로 넓히고 실패로 분류 |
| 3 | **P1** | `CoupleEmojiController.java` + `coupleEmoji.ts:51-53` | 사진 업로드 → `generate` 순서라 `prepare` 가 402/429 로 거절해도 원본이 이미 `emoji-source/` 에 올라가 있다(삭제는 백그라운드 작업 끝에만) | PRO 월 5세트 소진 상태에서 만들기 → 사진은 저장되고 화면은 "저장하지 않아요" | 컨트롤러에서 `prepare` 실패 시 (폴더 게이트 통과한 URL 이면) `deleteAll(source)`. 또는 업로드 전 `requireCapacity` 프리체크 |
| 4 | **P1** | `FeedComposeScreen.tsx:83` + `UploadController.java:47` | 사진 5장을 `Promise.all` 로 동시 업로드. 서명 발급마다 `PHOTO_UPLOAD` 가 선차감(환불 없음) | FREE(월 30장) 잔여 3장에 5장 선택 → 3장 업로드·차감, 2장 402, 글은 안 만들어짐. **한도 3 소모 + Cloudinary 고아 3장.** 네트워크 불안정에서도 같은 모양 | 순차 업로드(fail-fast) 또는 업로드 전 `requireCapacity(n)` 프리체크 |
| 5 | **P1** | `utils/error.ts:14-24` + `api/aiJob.ts:90` | `awaitAiJob` 의 2분 포기는 `ApiError(0, undefined, '아직 만들고 있어요…')` 인데 `getErrorMessage` 는 `data.message`·`timedOut` 만 보고 **호출자 fallback 을 돌려준다** | 우리 이모지(80초 안팎)가 2분을 넘기면 "만들지 못했어요"라고 뜨는데 세트는 트레이에 들어온다. **기존 버그** — `runAiJob` 을 쓰는 식단·데이트코스·주간 레터 전부 같은 증상 | `getErrorMessage` 에서 `status===0 && data===undefined && message` 이면 그 message 를 돌려주기(단, client 가 fetch 원문을 message 로 넣는지 먼저 확인) |
| 6 | P1(운영) | `GeminiClient.java:102` + `AiJobService.java:55` | 이미지 호출도 `BACKGROUND`(6회, 예산 240초) 정책. 6감정 전부 지속 실패면 최대 24분 > 작업 보존 15분 | `GEMINI_IMAGE_API_KEY` 비어 텍스트 무료 키로 폴백 → 429(limit 0) → 감정마다 4분 재시도 → 앱은 `AI_JOB_NOT_FOUND`, `ai-job` 4스레드 중 1개를 20분 점유 | 이미지 전용 정책(2~3회, 예산 60초) 또는 세트 전체 데드라인 |
| 7 | P2 | `FeedService.java:265-274` | 포스트 삭제 시 `feed_post_photos` 는 CASCADE 로 지워지지만 URL 을 Cloudinary 삭제에 넘기지 않는다 | 5장 글 삭제 → 자산 5개 영구 고아(행이 사라져 탈퇴 때도 못 거둔다). 전엔 1장이던 게 5장으로 | 삭제 전 URL 수집 → `deleteAllAfterCommit` |
| 8 | P2 | `CoupleEmojiService.java:178-200` | 루프가 `BusinessException` 만 잡는다 | base64 디코드·DB 예외가 새면 업로드된 장은 고아, 이벤트·푸시 없이 반쪽 세트, 환불도 없음 | #2 와 함께 |
| 9 | P2 | `CoupleEmojiController.java:53-56` | `prepare` 차감 뒤 `submit` 이 큐 포화로 거절되면 환불 없음 | 월 5세트 중 1개를 Gemini 호출 없이 잃음 | submit 실패 시 `refund` |
| 10 | P2 | `CoupleEmojiCreateScreen.tsx:82-84` | `before` 스냅샷이 스토어 현재값 — 진입 시 `load` 가 실패했으면 기존 세트 전부가 "새로 만든 것"으로 분류 | 오프라인 진입 → 온라인 생성 → 6칸이 이전 세트 얼굴로 즉시 채워짐 | 생성 직전 `load(true)` 성공 후 스냅샷 |
| 11 | P2 | `CoupleEmojiCreateScreen.tsx:260-287` | 부분 성공 후 "다른 사진으로 다시 만들면 채워져요" 라고 쓰지만 그 버튼은 실패 경로에만 있다 | 4/6 성공 → 화면에 재시도 진입점 없음 | done 상태에도 버튼 노출 |
| 12 | P2 | `ChatRoomScreen.tsx:824, 1029` | `COUPLE_EMOJI` 인데 `imageUrl` 이 null 이면 텍스트 말풍선으로 떨어져 숫자 id 가 보인다 | 레거시/실패 행 | 이미지 없으면 "[우리 이모지]" 플레이스홀더 |
| 13 | P2 | `MoodPicker.tsx:43-45` | `loadCoupleEmojis()` 에 `.catch` 없음 | 오프라인에서 무드 시트 열 때마다 unhandled rejection | `.catch(() => undefined)` |
| 14 | P2 | `HomeScreen.tsx:307-311` | 홈의 커플 채널 핸들러가 `COUPLE_EMOJI` 를 `coupleEmojiStore` 에 반영하지 않는다 | 상대가 내 세트를 지우는 동안 홈에 있으면 무드 피커가 낡은 세트 표시 | 이벤트 시 `load(true)` |
| 15 | P2 | `FeedComposeScreen.tsx:60-61` (웹) | `selectionLimit` 은 웹에서 무시된다 | 8장 선택 → 8장 업로드(한도 8 소모) → 서버가 "최대 5장" 거절 | `.slice(0, remaining)` |
| 16 | P2 | `V81__mood_couple_emoji.sql` | `couple_emoji_id` FK 컬럼에 인덱스 없음 | `couple_emojis` 삭제 때 `mood_statuses`(전 커플 누적 원장) 순차 스캔 | 인덱스 추가 마이그레이션 |
| 17 | P2 | `CoupleEmojiService.java:274-277` | `isSourceUrl` 이 정규화 안 된 public_id 접두사 검사 | `emoji-source/../../…` 가 게이트를 지날 수 있음(악용 가치 낮음 — public_id 가 난수) | `..`·`?` 포함 URL 거절 |

## 2. 확인했고 문제 없던 것

- **우리 이모지 보안 경계**: `subjectUserId` 가 관계 멤버인지, DELETE 가 호출자 관계로 스코프되는지, 채팅 전송이
  `(id, relationId, deleted_at is null)` 로 조회하고 URL 을 행에서 복사하는지 — 전부 됨. SSRF 방어는 `FoodAnalysisService` 에서
  옮긴 그대로(호스트 검사·리다이렉트 금지·크기 상한·매직바이트).
- **트랜잭션**: `generate` NOT_SUPPORTED + 장마다 REQUIRES_NEW, 행 커밋 뒤 AiJob 결과 기록. 환불 경로 3갈래에 이중 환불 없음.
- **Purger**: `mood_statuses → couple_emojis → chat_messages` 순서, 숨긴 행 URL 도 수집, `UserDataPurger` 는 관계 먼저.
- **피드 다장**: 타임라인 페이지당 배치 조회 1회(N+1 없음), 서버 5장 상한 + 테스트, 레거시 글 `[imageUrl]` 폴백 3곳.
- **무드 연동**: FREE 상대 402 없음, 남의 관계 이모지 404, 숨김 시 유니코드 폴백 — `MoodFlowTest` 9건.
- **푸시**: 알 수 없는 필드 무시, 파싱 예외 catch, `DeviceNotRegistered` 만 토큰 삭제(인덱스 짝 맞음).
- **프론트 구독**: 채팅방의 커플 채널 구독이 포커스 범위이고 블러 시 해제 → 홈 구독을 영구히 덮지 않음. 폴링은 언마운트 시 정지.
- **웹 번들**: `lottie-react-native` 는 타입 import 만 웹에 닿음. 썸네일 30/30 존재.
- **테마**: `fontSize` 키 삭제 없음, 바닥값(11·12·14) 유지, 최대 변화 1.06배.
- **브랜드/아이콘**: `app.json` 자산 9개 존재, 크기 규격 맞음, `DoublyLogo` 는 주석만 변경, 오늘 쓰인 아이콘 26종 전부 서브셋 폰트에 있음(cmap 직접 파싱).
- **callingx 제외**: `src/` 에 import 없음, Stream SDK 가 try/catch + optional 접근.
- **알림 정리**: AppState 리스너 단일 effect, cleanup 있음.

## 3. 권고

**배포 전에 #1~#5.** → **같은 날 #1~#5 수정 완료**(브랜치 `fix/daily-review-p1`). 무엇을 어떻게 고쳤는지는 §4. #1 은 "재연결 후 복원"이 이미 깨져 있는 상태라 가장 급하고, #2·#3 은 얼굴 사진 관련 약속(§9)이라
기능 출시 전에 닫아야 한다. #4 는 FREE 티어가 켜지면 바로 체감된다. #5 는 한 줄 수정으로 AI 기능 전체의 오안내가 사라진다.
#6~#17 은 반응 보고 묶어서.

## 4. 수정 기록 — P1 5건 (2026-09-08, 사용자 지시)

| # | 수정 | 테스트 |
|---|---|---|
| 1 | `RelationRecordRestorer` 에 `mood_statuses`(couple_id)·`couple_emojis`(relation_id) 이동 추가. 무드가 이모지를 참조(V81)하므로 둘을 같이 옮긴다 | `RestoreRecordsFlowTest.무드와_우리_이모지도_복원된다` — 옛 관계에 이모지 1 + 그것을 참조하는 무드 1을 심고 복원 → 새 관계로 옮겨지고 옛 관계 행이 사라지는지 |
| 2 | `CoupleEmojiService.generate` 를 `try { generateFrom } finally { 원본 삭제 }` 로. 루프 catch 를 `RuntimeException` 으로 넓혀 base64·DB 예외도 "이 장 실패"로 분류(사용자에게는 BusinessException 문구만) | `원본_다운로드가_거절돼도_환불하고_원본을_지운다`, `비즈니스_예외가_아닌_실패도_한_장_실패로_흡수한다`, 기존 전부 실패 테스트에 삭제 검증 추가 |
| 3 | `prepare` 에서 폴더 검사를 맨 앞으로 옮기고, 그 뒤 실패(관계 없음·대상 오류·402/429)는 원본을 지우고 다시 던진다. 남의 폴더 URL 은 건드리지 않는다 | `한도에_막히면_올라간_원본을_지운다` + 준비 테스트에 `times(2)`/`never` 검증. `CloudinaryImageDeleter` 를 `@MockitoSpyBean` 으로(폴더 게이트는 진짜 `extractPublicId` 가 필요) |
| 4 | `FeedComposeScreen`: 업로드 전 `planStore.load()` → `remainingOf('PHOTO_UPLOAD')` 프리체크(부족하면 한 장도 안 올림, 0이면 업그레이드 시트·그 외 토스트). 업로드는 순차(fail-fast)로 바꾸고 올라간 URL 을 `uri → url` 캐시에 남겨 재시도 때 재업로드하지 않는다. PRO 는 remaining null 이라 그대로 통과 | 프론트는 테스트 러너가 없다 — `typecheck` 통과. 실기기: FREE 잔여 < 선택 장수에서 저장 → 업로드 0건인지 |
| 5 | `api/aiJob.ts` 2분 포기 예외를 `ApiError(0, {success:false, message}, message)` 로 — `getErrorMessage` 가 `data.message` 를 꺼내 쓰는 FAILED 분기와 같은 모양. 화면 fallback 으로 뭉개지지 않는다. **AI 기능 전체에 적용**(식단·데이트코스·주간 레터·우리 이모지) | `typecheck` 통과. 실기기: 우리 이모지 생성을 2분 넘기면 "아직 만들고 있어요" 가 뜨는지 |

**로컬 백엔드 테스트 실행 요령**: PATH·`.jdks`·IntelliJ JBR 은 전부 JDK 25 라 Gradle 8.14 가 뜨지 않지만(§0),
**DataGrip·Rider 의 JBR 이 JDK 21** 이다. 아래처럼 지정하면 돈다(Gradle 데몬이 25 로 이미 떠 있으면 `--stop` 먼저).

```bash
JAVA_HOME="D:/DataGrip 2025.3.5/jbr" ./gradlew --stop && JAVA_HOME="D:/DataGrip 2025.3.5/jbr" ./gradlew test
```

## 5. 수정 기록 — P2 11건 (2026-09-08, 사용자 지시)

| # | 수정 | 테스트 |
|---|---|---|
| 7 | `FeedService.deletePost` 가 행을 지우기 전에 대표 URL + `feed_post_photos` URL 을 모아 `deleteAllAfterCommit` 에 넘긴다 | `FeedFlowTest.포스트를_지우면_사진_URL_전부를_이미지_삭제에_넘긴다` (deleter 스파이) |
| 8 | #2 에서 함께 처리(루프 catch 를 `RuntimeException` 으로) | §4 |
| 9 | `AiJobService.submit` 에 `onRejected` 콜백 오버로드. `CoupleEmojiService.abandon(ticket)` = 환불 + 원본 삭제, 컨트롤러가 거절 콜백으로 넘긴다 | `AiJobServiceTest.큐가_가득_차면_…`(104건 채운 뒤 105번째 거절·콜백 1회), `CoupleEmojiFlowTest.접수가_거절되면_…` |
| 10 | 생성 직전 `load(true)` 를 **성공시킨 뒤** 기준선 스냅샷. 못 읽으면 시작하지 않는다 | typecheck |
| 11 | 결과 화면에서 `failedEmotions` 가 있으면 "다른 사진으로 다시 만들기"(secondary) 를 "채팅에서 쓰기" 옆에 둔다 | typecheck |
| 12 | `COUPLE_EMOJI` 인데 `imageUrl` 이 없으면 텍스트 말풍선에 숫자 id 대신 `[우리 이모지]` | typecheck |
| 13 | `MoodPicker` 의 `loadCoupleEmojis()` 에 `.catch` | typecheck |
| 14 | 홈의 커플 채널 핸들러가 `COUPLE_EMOJI` 를 받으면 `coupleEmojiStore.load(true)` | typecheck |
| 15 | `pickImagesAssets` 가 결과를 `selectionLimit` 으로 자른다(웹은 피커가 무시) — 호출자 전부에 적용 | typecheck |
| 16 | **V82** `idx_mood_statuses_couple_emoji` | H2 마이그레이션 적용(전체 스위트) |
| 17 | `isSourceUrl` 이 `..`·`?`·`#` 포함 URL 을 거절 | 준비 테스트에 traversal·쿼리 2건 추가, 그 URL 은 삭제도 안 함 |

남은 것: **#6(운영성 P1, 이미지 재시도 예산 vs 작업 보존 15분)** 만 미수정 — 재시도 정책을 바꾸는 일이라
Gemini 503 이력(STABILITY_ANALYSIS)과 같이 봐야 해서 별도로 둔다.

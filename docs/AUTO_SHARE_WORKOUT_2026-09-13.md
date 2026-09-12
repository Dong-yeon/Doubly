# "공유하기"를 없앤다 — 기록이 곧 공유 (2026-09-13)

운동 기록을 저장하면 커플 채팅에 카드가 **자동으로** 남는다. 저장 뒤 "채팅에 공유할까요?"를
묻던 확인창은 없앴다. 이 문서는 그 결정의 근거, 실제로 바뀐 것, 일부러 미룬 것, 그리고
2주 뒤 무엇을 보고 다음 단계를 정할지를 남긴다.

## 1. 왜

- 식단·운동 탭까지 들어와 기록하는 사용자는 이미 가장 적극적인 소수다. 거기서 "공유할까?"를
  한 번 더 판단하게 하면 그 지점에서 다시 절반이 빠진다 — 안 쓰는 기능에 단계를 하나 더 붙이는 셈.
- 자동 공유만으로는 루프가 안 닫힌다. 재방문을 만드는 건 **반응이 원작성자에게 돌아오는 경로**다.

  ```
  내가 운동 기록 → 상대 채팅에 카드 → 상대가 이모지 한 탭 → 나에게 푸시 → 내가 앱 열음
  ```

  이 마지막 화살표는 코드에 **이미 있었다**: `ChatService.toggleReaction` 이 원작성자에게
  "메시지에 반응이 달렸어요" 푸시를 보낸다. 안 돌던 이유는 카드가 채팅에 들어가는 입구가
  `Alert.alert(... '공유하기')` 로 막혀 있어서였다.
- 새 피드·소켓·푸시 파이프라인을 세우지 않는다. `MessageType.WORKOUT_CARD` + `ChatMessage.workoutId`,
  리액션, 읽음, 브로드캐스트가 전부 채팅에 있고, `CallService` 가 `CALL_CARD` 를 서버에서
  남기는 선례가 있다.

## 2. 바뀐 것

| 층 | 변경 | 커밋 |
| --- | --- | --- |
| 백엔드 | `WorkoutService.save` 가 저장 트랜잭션 안에서 `ChatService.postSystemCard(…, workoutId)` 로 `WORKOUT_CARD` 를 남기고 `/sub/rooms/{relationId}` 에 브로드캐스트. 문구 조립(`workoutCardContent`)은 프론트 `workoutShare.ts` 의 규칙을 그대로 이관 — PR 접두어 `🔥 PR 갱신!` 은 채팅 렌더러가 배지 판정에 쓰므로 **양쪽이 같아야 한다** | `9877b0f` |
| 백엔드 | 상대에게 가는 "함께 운동해요!" 푸시의 딥링크를 운동 탭 → **채팅방**으로. 카드에 한 탭 반응하는 게 루프의 입구인데 운동 탭에는 그 카드가 없다 | 〃 |
| 프론트 | `WorkoutRecordScreen` 의 확인창 + `publishEnsuringConnection` 제거. 토스트 "운동 기록 완료! 채팅에 공유했어요"(커플 없으면 "운동 기록 완료!") | `36d4273` |
| 계측 | `WORKOUT_VIEWED` 클라이언트 이벤트 (운동 탭 포커스마다) — `HOME_VIEWED` 와 같은 화이트리스트 경로 | `56e084f` |
| 백엔드 | 기록 삭제 시 카드의 `workout_id` FK 를 끊고 삭제 표시(`ChatService.detachWorkoutCards`). 수동 공유 시절부터 있던 잠재 버그가 자동 공유로 항상 재현되게 된 것 | `30a2263` |

**왜 서버에서 남기나**: 예전 클라이언트 발행은 STOMP 소켓이 붙어 있어야 했다 — 안 붙어 있으면
카드가 조용히 사라졌고, 웹·다른 경로로 기록하면 카드가 아예 안 생겼다. 서버가 남기면 어디서
기록하든 보장된다. 카드 INSERT 는 운동 저장과 같은 트랜잭션(운동 없는 카드가 남지 않게)이며,
같은 트랜잭션에 참여한 호출의 예외를 삼키면 커밋 시점에 `UnexpectedRollbackException` 이
나므로 잡지 않는다. 브로드캐스트만 감싼다.

**"공유하기" 문자열이 남아 있는 곳은 성격이 다르다** — 손대지 않았다:
즐겨찾기 선물(`DietRecordScreen.giftFavorite`, 상대에게 데이터를 넘기는 행위), 럽슐랭·초대코드·
이미지의 OS 공유 시트(앱 밖으로 내보내기), 대화 내보내기.

## 2-1. 식단도 같은 날 붙였다 (같은 날 오후)

운동만 먼저 2주 보자던 계획을 접고 식단도 바로 붙였다(사용자 결정). 지표 오염은 "식단 탭 진입"이
별도 이벤트라 크지 않지만, 채팅 볼륨 변화는 두 기능이 섞인다는 점을 판정 때 감안한다.

| 층 | 변경 | 커밋 |
| --- | --- | --- |
| 백엔드 | `MealService.save` 가 `ChatService.postMealCard(내용, 사진, mealId)` 로 `MEAL_CARD` 자동 insert. **카드에 수치가 없다** — 사진·끼니·음식명만("점심 · 파스타, 샐러드"). 단백질 목표 달성은 `🎯 단백질 목표 달성!` 배지 문구만, g 은 뺀다. 데이트 식단은 두 기록이 생겨도 카드는 기록한 쪽 명의 한 장("점심 (데이트) · 피자"). `copyFrom`(어제 복사)·`update` 는 카드 없음 | `c0b81c7` |
| 백엔드 | **V90** `chat_messages.meal_id` (FK → meals) — 운동의 `workout_id` 와 같은 역할. 기록 삭제 시 `detachMealCards` 로 FK 를 끊고 삭제 표시(데이트 짝은 어느 쪽이 지워도 함께) | 〃 |
| 프론트 | `DietRecordScreen` 확인창 + 소켓 발행 제거, 토스트에 "채팅에 공유했어요" | `3e7ce40` |
| 계측 | `DIET_VIEWED` | `6da94ed` |

볼륨(하루 3끼 × 2명)은 **끼니마다 한 장**으로 시작한다. 하루 요약 카드로 묶는 건 채팅 순서·읽음
의미를 흔드는 별도 설계라, 2주 뒤 실제로 대화가 카드에 밀리는지 보고 정한다.

## 3. 일부러 미룬 것

| 항목 | 이유 |
| --- | --- |
| 럽슐랭 자동 공유 | 자랑 성격이라 무리 없음. 운동 결과를 본 뒤 |
| 하루 요약 카드로 묶기 | 운동은 주 3~4회라 볼륨 문제가 없다. 카드를 제자리에서 갱신하면 채팅의 순서·읽음 의미가 흔들린다(갱신된 카드가 옛 위치에 남음). 식단(하루 3회 × 2명 = 6장)을 붙일 때 실제로 대화가 카드에 밀리면 그때 설계 |
| 개별 항목 숨기기 | 자동 카드는 채팅 메시지이므로 작성자가 **삭제**하면 그게 숨기기다(soft delete 이미 있음). 별도 UI 없음. 기본값 자동 ON — 옵트인으로 만들면 아무도 안 켠다 |

## 4. 판정 — 2주 뒤

볼 숫자는 하나: **운동 탭 2회 이상 진입 유저 비율**이 도입 전후로 움직이는가. 식단은 같은 쿼리에서
`WORKOUT_VIEWED` 를 `DIET_VIEWED` 로, `WORKOUT_CARD` 를 `MEAL_CARD` 로 바꿔 본다.

배포 시점(`WORKOUT_VIEWED` 가 쌓이기 시작한 날)을 `D` 라 하면, 도입 전 비교군은 없다 —
`HOME_VIEWED` 대비 `WORKOUT_VIEWED` 비율을 주 단위로 보고 2주차가 1주차보다 오르는지 본다.
(도입 직후 1주는 신기함 효과가 섞이므로 3주차까지 보면 더 낫다.)

```sql
-- 주별: 홈에 들어온 유저 중 운동 탭에 2회 이상 들어온 유저 비율
WITH weekly AS (
  SELECT date_trunc('week', created_at) AS wk, user_id, event_type, COUNT(*) AS n
  FROM event_logs
  WHERE event_type IN ('HOME_VIEWED', 'WORKOUT_VIEWED')
    AND created_at >= DATE '2026-09-13'
  GROUP BY 1, 2, 3
)
SELECT wk,
       COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'HOME_VIEWED')                    AS home_users,
       COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'WORKOUT_VIEWED' AND n >= 2)      AS workout_2plus,
       ROUND(100.0 * COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'WORKOUT_VIEWED' AND n >= 2)
             / NULLIF(COUNT(DISTINCT user_id) FILTER (WHERE event_type = 'HOME_VIEWED'), 0), 1) AS pct
FROM weekly
GROUP BY wk ORDER BY wk;

-- 루프가 실제로 도는지: 자동 카드에 반응이 달린 비율
SELECT COUNT(*)                                            AS cards,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM chat_message_reactions r WHERE r.message_id = m.id)) AS reacted
FROM chat_messages m
WHERE m.message_type = 'WORKOUT_CARD' AND m.created_at >= DATE '2026-09-13';
```

- 움직이면 → 식단(수치 제외)·럽슐랭에 같은 작업을 반복한다.
- 안 움직이면 → 반복할 이유가 없다는 뜻이고, 그건 그것대로 값진 결론이다. 카드 자체는 해롭지
  않으므로 되돌릴 필요는 없다.

## 5. 되돌리려면

프론트 커밋 `36d4273` 을 revert 하면 확인창이 돌아오지만, 서버가 이미 카드를 남기므로 **둘 다**
되돌려야 한다(`9877b0f`). 서버만 두고 프론트만 되돌리면 카드가 두 장 생긴다.
식단도 같은 쌍(`3e7ce40` + `c0b81c7`)이며, V90 은 그대로 둬도 무해하다(nullable 컬럼).

# 사진 틀린그림찾기 설계 (2026-10-14)

커플의 공유 사진 한 장으로 서버가 "원본(A) / 다섯 군데 바꾼 사진(B)"을 만들고, 두 사람이 **각자 따로** 푼다.
**승부는 없다**(사용자 결정) — 둘 다 끝나면 두 사람의 기록을 나란히 보여 줄 뿐 이긴 사람을 가리지 않는다.

표시명은 임시값 **"틀린그림찾기"** — 서버 `SpotDiffRules.DISPLAY_NAME`, 앱 `F/constants/spotDiff.ts` 두 곳.
내부 키는 `SPOT_DIFF`, 웹·딥링크 경로는 `game/spot-diff`.

## 1. 0단계 조사에서 바꾼 것 (사용자 확인: A~F 권장안)

| # | 요청 | 레포 사정 | 결정 |
|---|---|---|---|
| A | SHARED 사진만 | 사진 테이블에 SHARED/PERSONAL/PRIVATE enum 이 없다(캘린더 일정에만 있다) | **사진첩(`FeedService.photos`)에 나오는 사진 = SHARED**: 일상(대표+여러 장 전부)·럽슐랭 방문(식단에서 온 것 제외 — 같은 사진)·식단(상대 몫 복제 행 제외)·공유한 운동(`image_shared`). 채팅 사진(스크린샷이 많다)·하루 기록(비공개)은 쓰지 않는다 |
| B | `photo_id` | 사진이 4개 테이블에 흩어져 있다 | `source_type`(POST/MEAL/WORKOUT/PLACE_VISIT) + `source_id` + `source_url` |
| C | PRIVATE 전환 시 만료 | 공개 범위를 바꾸는 경로가 없다(운동 `image_shared` 도 저장 뒤 못 바꾼다) | 만료 계기 = **원본 사진이 사라지거나 더는 공유 상태가 아닐 때**. 삭제 경로마다 걸지 않고 ① 퍼즐을 열거나 탭할 때 ② 매시 정리에서 원본을 다시 확인한다 — 삭제기를 부르지 않는 경로(`PlaceService.deleteVisit`)도 이렇게 잡힌다 |
| D | 결과 이미지 Cloudinary | Cloudinary 는 월 25크레딧(전송이 주범), R2 전환 중 | **R2** `{루트폴더}/spot-diff/{초}-{무작위}.jpg`. 지우는 쪽은 기존 삭제기(R2 주소를 이미 처리) |
| E | 상주 Python worker | Railway 비용 98% 가 메모리, 상한 $15 | **Railway Cron 서비스** — 5분마다 떠서 대기 작업을 처리하고 종료. 대기열은 `spot_puzzle_jobs` 에서 `FOR UPDATE SKIP LOCKED`(실행이 겹쳐도 안전) |
| F | 테이블 `puzzles`… | 연쇄 퍼즐(`puzzle`)과 이름이 겹친다 | `spot_puzzles`·`spot_puzzle_plays`·`spot_puzzle_taps`·`spot_puzzle_jobs` + 크기 캐시 `spot_photo_sizes`. `couple_games` 에 넣지 않는다(미리 만드는 판이라 "판 열기" 모양이 아니다) |

추가로 정한 것(물어본 뒤 답이 없어 추천안으로 둠 — 상수 하나로 바꿀 수 있다):
- **만료 = 생성 후 48시간**(`SpotDiffRules.LIFETIME`). 하루 1판이라 어제 판과 오늘 판이 같이 열려 있을 수 있다.
- **게임 스트릭에 넣는다** — 둘 다 끝낸 퍼즐의 `completed_at` 날짜를 "같이 한 날"로 센다.

## 2. 흐름

```
KST 00:00  Spring @Scheduled ─ 활성 커플마다 오늘 퍼즐 행(PENDING) + 작업 행(QUEUED), 후보 사진 목록을 작업에 싣는다
                               후보 5장 미만이면 작업 없이 바로 NOT_ENOUGH_PHOTOS
5분마다    worker(cron) ─ SKIP LOCKED 로 작업 하나씩 → 후보 크기 확인(캐시) → 생성 → R2 업로드 → 퍼즐 READY + layout 저장
앱         GET 목록 → 퍼즐 화면 열기(POST open = started_at) → 탭/힌트 → 다 찾으면 finished_at
둘 다 끝   completed_at, 결과 카드(채팅), 정답 전체·상대 기록 공개
48시간     매시 정리가 EXPIRED(TIME) — 한 명이라도 했으면 결과 카드. 원본이 사라졌으면 EXPIRED(PHOTO_REMOVED) + A/B 삭제
```

- 낮에 처음 연결한 커플, 0시 작업이 빠진 커플은 목록 GET 때 그 자리에서 작업을 넣는다(최대 5분 대기, 화면은 "만드는 중").
- **무제한 모드**(`SpotDiffRules.MODE = UNLIMITED`): 날짜에 묶지 않고, 아무도 시작하지 않은 READY/PENDING 퍼즐이 없으면 하나를 미리 만들어 둔다 — 5분 지연을 사용자가 보지 않게.

## 3. 사진 고르기

- **Spring**(SQL, H2/PG 공통): 위 A 의 네 출처를 모아 최근 300장까지, 최근 30일 안에 퍼즐로 쓴 URL 은 뺀다. 5장 미만 → NOT_ENOUGH_PHOTOS.
- **worker**: 시드로 섞은 순서대로 크기를 본다 — `spot_photo_sizes` 캐시가 없으면 앞 128KB 만 Range 로 받아 헤더에서 크기와 EXIF 방향을 읽는다. **짧은 변 1000px 이상**이 5장 모이지 않으면 NOT_ENOUGH_PHOTOS.
- 생성 시도: 사진 하나에 시드 3개, 안 되면 다른 사진으로 최대 3장 → 그래도 실패면 FAILED + 사유.

## 4. 생성기 (worker, `diff_d.py` 기준)

- 전처리: EXIF 방향 적용 → 긴 변 1600px → 결과 JPEG 는 **메타데이터 없이** 다시 인코딩(GPS 포함 EXIF 전부 제거).
- 변형 4종 color/remove/clone/flip, `objectness ≥ 2.0` 에서만 color, 차이 영역 최소 거리(짧은 변 14%), 보이는 차이 검사(`min_diff`).
- **얼굴 보호**: OpenCV Haar(frontal) 로 얼굴을 찾고 bbox 를 1.3배 넓힌 영역과 겹치는 후보는 버린다. 실제로 바뀐 픽셀(차이 > 12)이 그 영역에 닿아도 버린다(clone 이 번지는 경우).
- 재현성: `photo source`, `seed`, `level`, `generator_version`, layout(정규화한 cx, cy, r, kind) 저장. **r 은 긴 변 기준 정규화**(시제품과 같다).
- 시제품과 달라진 두 가지(구현 중 발견): ① 최소 거리를 superpixel 중심이 아니라 **저장되는 중심**(바뀐 픽셀 평균)으로 잰다 ② r 을 bbox 절반이
  아니라 **중심에서 가장 먼 바뀐 픽셀까지**로 잡는다 — bbox 절반이면 모양이 치우친 변형의 일부가 원 밖에 남아 "바뀐 데를 눌렀는데 오답"이 된다.
  얼굴 보호는 바뀐 정도가 1 이라도 보호 영역에 닿으면 버린다.
- 원본 주소는 https + 허용 호스트(`res.cloudinary.com`, `media.dubly.co.kr`)만 받는다 — 식단·운동·방문 URL 은 저장 때 검사하지 않으므로,
  사설망 안의 worker 가 아무 주소나 받으면 내부 서비스를 두드리는 통로가 된다.

## 5. 판정 (서버)

- 탭 좌표 `(x, y)` 는 이미지 기준 0~1. 픽셀 거리 `√(((x−cx)·W)² + ((y−cy)·H)²) ≤ r·max(W,H) + 0.02·min(W,H)` 면 맞음(`SpotDiffRules.TOLERANCE_RATIO`).
- 결과는 셋: `HIT`(새로 찾음) / `REPEAT`(이미 찾은 곳 — 오답으로 세지 않음) / `MISS`(wrong_taps +1).
- 같은 `clientTapId` 는 저장된 결과를 그대로 돌려준다(끝난 뒤의 재전송도 409 가 아니라 원래 결과). 다 찾은 뒤의 **새** 탭은 409.
- 동시성: 탭·힌트·열기는 모두 **퍼즐 행을 잠그고**(PESSIMISTIC_WRITE, 기존 게임과 같은 방식) 처리한다 → 같은 차이가 두 번 인정되지 않는다. `client_tap_id` UNIQUE 가 마지막 안전장치.
- 시간 = 서버의 `started_at` → `finished_at`. 앱이 보낸 시간은 받지 않는다.
- 힌트: 아직 못 찾았고 힌트를 안 받은 차이 하나에, **정답 원을 품는 3배 원**을 준다. 중심은 정답에서 (3r−r) 안쪽으로 비켜 둔다(가운데를 누르면 끝나지 않게). 같은 사람·같은 차이면 같은 원. 받은 힌트는 다시 열어도 보인다.

## 6. 블라인드

- 상대 정보는 **찾은 개수**만. 정답 전체·상대 기록(시간·오답·힌트)·상대가 찾은 위치는 **둘 다 끝났거나 만료된 뒤**에만 응답에 실린다.
- 정답 layout 은 응답 DTO 어디에도 없다 — 내가 찾은 차이와 내 힌트 원만 내 응답에 실린다.

## 7. 데이터 (V143)

- `spot_puzzles`: couple_id → relations, puzzle_date(일일 모드), source_type/source_id/source_url, image_a_url, image_b_url, width, height, layout_json(서버 전용), seed, level, generator_version, status, expire_reason, fail_reason, completed_at, created_at, expires_at. UNIQUE(couple_id, puzzle_date).
- `spot_puzzle_plays`: puzzle_id, user_id, started_at, finished_at, found_ids, hinted_ids, wrong_taps, hints_used. UNIQUE(puzzle_id, user_id).
- `spot_puzzle_taps`: play_id, client_tap_id UNIQUE, x, y, result, hit_id, created_at.
- `spot_puzzle_jobs`: puzzle_id, status(QUEUED/RUNNING/DONE/FAILED), candidates(TEXT, JSON 문자열 — JSONB 금지 규칙), attempts, locked_at, error, created_at, updated_at.
- `spot_photo_sizes`: url UNIQUE, width, height, checked_at — worker 가 채우는 크기 캐시.
- Purger: 관계 삭제 때 taps → plays → jobs → puzzles 순서, A/B 이미지는 URL 을 모아 커밋 뒤 삭제. 탈퇴 때 plays(user_id) 를 한 번 더. 복원(Restorer)은 puzzles 를 새 관계로 옮긴다.

## 8. 배포 순서

서버(V143) → worker(Railway Cron 서비스 신설) → 앱(OTA). worker 실행 방법·환경 변수는 `worker/spot-diff/README.md`.

## 9. 첫 실사용 피드백 (2026-10-15)

### 9-1. 사진 우선순위 — 반영(b70a9239·3645667d)
"음식 사진도 있는 게 맞나?" → 사용자 결정: **일상 → 럽슐랭 방문·공유 운동 → 식단**. 식단은 하루 2~3장씩 쌓여 그냥 섞으면 퍼즐 대부분이
접시 클로즈업이 된다. 서버는 후보 300장을 이 순서로 채우고, worker 는 같은 순위 안에서만 섞는다. 식단은 앞 순위에서 조건을 채운 사진이
5장이 안 될 때만 쓴다(빼지는 않는다 — 식단만 올리는 커플이 막히지 않게).

### 9-2. "너무 조금 바뀌어 못 찾는다" — 생성기 한계, 방향 결정 대기
사용자 평가: "계란 위 상추 모양이 다르다 같은 건 못 찾는다". 샘플 3장(음식·인물 2)으로 확인한 사실:

- d1(시제품 그대로)의 변화는 대부분 `remove`(inpaint) 와 `flip` 이고, 질감 영역에선 **번진 얼룩·미세한 모양 차이**가 된다.
- 손본 시험판(d2 — 채택 안 함, 커밋 안 함): 큰 색 회전·사물 붙이기·면적/세기 하한을 넣었더니
  ① 느슨하면 그림자를 사물로 보고 **보라색으로 칠하거나**, superpixel 조각을 붙여 **찢긴 종이 조각**이 생겼고
  ② 색(a·b) 대비·채도·꽉 참(solidity) 조건으로 조이면 음식 사진에서 **쓸 자리가 1곳**뿐이라 생성 실패.
- 근본 원인: **SLIC superpixel 은 "사물"이 아니라 "비슷한 색 조각"**이다. 사물 하나를 통째로 바꾸거나 지우거나 하나 더 두는
  틀린그림찾기다운 차이를 만들 수 없다. 조건을 손보는 것으로는 안 풀린다. 잘 된 경우는 "채도 높은 사물의 색 바꾸기"(김치 → 초록) 하나였다.

선택지(사용자 결정 필요):

| 안 | 내용 | 품질 | 비용·부담 |
|---|---|---|---|
| A. 사물 분할 모델 | worker 에 경량 분할 모델(예: SAM 계열 소형·U²-Net)로 **진짜 사물 마스크**를 얻어 색 바꾸기·지우기·하나 더 두기 | 중~상 | 호출 비용 0. 이미지·메모리 증가(모델 100~200MB, 실행 시 1~1.5GB), 퍼즐당 CPU 수십 초 |
| B. AI 이미지 편집 | 이미 결제 중인 Gemini 이미지 키로 "작은 차이 다섯 개" 편집 → 원본과 정렬한 뒤 **바뀐 덩어리만 원본에 되붙여** 나머지 픽셀은 원본 그대로 유지 | 상(자연스러움) | 퍼즐당 약 1회 호출(이미지 편집 단가 기준 수십 원), 커플·일 단위로 누적. 정렬 실패·얼굴 변형 검사 필요 |
| C. 지금 방식 유지 + 색 바꾸기만 | 채도 높은 사물 색 바꾸기만 남기고 나머지는 기본 퍼즐(스톡)로 | 하~중 | 가장 싸지만 사진 상당수가 실패 → 스톡 의존 |

**결정 (2026-10-15): B.** 구현 `3731dcd2`(worker d3)·`96417cb1`(V144) — 스위치 `SPOT_AI_ENABLED` 꺼진 채 배포.

- 방식: Gemini 이미지 편집(결제 키, 1K)으로 "굵은 차이 7개" → ECC 정렬 → ΔE 덩어리 → 크기(0.12~10%)·길이(짧은 변 40% 이하)·세기(평균 ΔE 22)·
  얼굴(보호 영역과 35% 넘게 겹치면 버림, 적게 겹치면 겹친 부분을 잘라 냄)로 걸러 → **정답 원끼리 겹치지 않게** 5개 → 그 구역만 섞는다.
  정답 원 밖은 원본 픽셀 그대로(테스트로 고정).
- 시험에서 배운 것: ① 모델은 그림 전체를 약하게 다시 그린다(중앙값 ΔE 1.6~2.2) — 그대로 쓰면 안 되고 덩어리만 되붙여야 한다
  ② 같은 지시를 반복하면 같은 사물(가장 눈에 띄는 그릇)을 또 바꾼다 → 호출마다 지시를 돌린다(빈 자리에 추가 / 작은 사물)
  ③ 모델은 추가 사물을 가장자리에 자주 둔다 → d1 의 가장자리 금지는 뺐다 ④ 벽과 비슷한 색의 추가(선인장·코끼리)는 ΔE 가 약해 탈락 — 사람 눈에도 어렵다.
- 샘플 3장(음식·인물 2): 음식 2회·인물(여) 1회 성공, 인물(남)은 3회 해도 4/5 — 배경이 좁은 사진은 다음 사진으로 넘어간다.
- 비용: 사진당 최대 3회·작업당 4회, 최근 24시간 합계 상한(기본 200회 ≈ $13/일) 넘으면 작업을 미룬다(V144 `ai_calls`). 보통 1~2회(≈ 90~180원/퍼즐).
- **켜기 전 조건**: 개인정보처리방침 5절(처리 위탁) Google(Gemini) 목적이 "음식 사진·운동 데이터 AI 분석"뿐이다 — 이용자가 공유한 일상 사진(얼굴 포함 가능)을
  보내려면 목적 추가 + 방침 버전 개정이 먼저다.

판단 근거는 이 절, 시험 산출물은 남기지 않았다(얼굴 샘플이라 지웠다). 기본 퍼즐(스톡) 제안(§9-3 예정)도 이 결정과 묶인다 — 스톡은
한 번만 만들면 되므로 B(또는 손으로 다듬기)로 고품질을 만들 수 있다.

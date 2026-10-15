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

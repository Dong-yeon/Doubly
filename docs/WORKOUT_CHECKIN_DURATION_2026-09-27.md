# 운동 체크인 시간 칩 + 운동 홈 가리기 (2026-09-27)

## 1. 질문과 사실

"운동 완료를 누르면 1시간 운동한 걸로 보나?" — **아니었다.** 원탭 체크인은
`save({ workoutDate, sets: [] })` 로 **시간 없이** 저장했고, `EnergyBalanceService` 는
`totalDurationMin == null → 0분 → 0kcal` 로 계산한다. 스트릭·캘린더에는 잡히지만
럽바디의 "운동한 만큼 더 먹어도 되는 칼로리"에는 한 번도 반영되지 않았다.

## 2. 결정 — 탭 뒤에 시간 칩(선택지 1)

"운동 완료" → 같은 자리에 **"얼마나 했나요?" `30분 · 1시간 · 1시간 반 · 건너뛰기`**.
고르는 순간 `totalDurationMin` 과 함께 저장. 건너뛰기는 예전과 똑같이 시간 없이 저장.
완료 줄은 시간이 있으면 `챙겼어요 · 1시간` 으로 보인다.

| 폐기한 대안 | 이유 |
| --- | --- |
| 기본값 60분 자동 저장 | 10분 산책에도 +수백 kcal. 식단 앱에서 **과대 추정은 과소 추정보다 해롭다** |
| 저장 후 토스트로 시간 묻기 | 토스트는 흘러가 버려 대부분 무시됨 → 사실상 0분 유지 |
| 자유 입력(분 숫자) | 원탭의 "느슨하게"(9/9 결정)를 깬다 — 정확히 적을 사람은 기록 화면이 있다 |

백엔드 변경 없음 — `SaveWorkoutRequest.totalDurationMin` 은 이미 있었다(`WorkoutService.save`).

## 3. 운동 홈(`WorkoutMain`) 가리기 — 일시적

`constants/config.ts` 의 `WORKOUT_HOME_ENABLED = false`. **화면과 코드는 그대로, 들어가는 길만** 닫는다.

| 입구 | 가린 동안 |
| --- | --- |
| 체크인 카드 "운동 홈 ›" 링크 | 안 그린다(prop 미전달) |
| 홈 운동 칩(오늘 이미 운동함) | 럽바디 메인(`DietMain`)으로 |
| 푸시 딥링크 `workout`(스트릭 마일스톤·재참여 알림) | `DietMain` 의 alias 로 받는다 |

자기 경로가 따로 있는 하위 화면은 그대로 열린다 — 기록(오운완 사진·홈 칩 미완료 시),
하던 운동 이어하기, 트레이너 루틴 푸시(`workout/routines`), 챌린지 등. **가려지는 것**:
자유 운동 세션 시작, 루틴 목록 진입, 통계, 맞춤 추천, 운동 캘린더(하위 URL 로만 도달).

되돌리기: 플래그를 `true` 로 → 세 입구가 원래대로.

## 4. 검증

- `npm run typecheck` 통과, 수정 파일 eslint 신규 오류 없음(DietScreen:192 `impure function` 은 main 에도 있는 기존 오류),
  `verify:nested-buttons` 통과, 웹 export 성공.
- `getStateFromPath('workout')` → `DietMain`, `workout/record` → `WorkoutRecord` (core 파서로 확인).
- **미검증**: 실기기에서 칩 탭 → 저장 → 럽바디 칼로리 반영, 푸시 탭 착지.
- JS 만 바뀌었으므로 EAS **Update** 로 배포 가능(빌드 불필요).

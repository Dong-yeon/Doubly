/**
 * 목표 횟수로 휴식 시간을 추천 — 저항 운동의 일반 원칙(ACSM/NSCA 가이드라인)을 단순화한 규칙.
 * 반복이 적을수록(고중량·근력 위주) 다음 세트 전 완전 회복이 필요해 더 길게 쉬고,
 * 반복이 많을수록(근지구력) 짧게 쉬어도 된다. AI 호출 없이 즉시 계산하는 순수 함수다.
 *
 * <p>구간은 REST_PRESETS(60/90/120/180s, WorkoutRoutineFormScreen과 동일)에 항상 정확히
 * 맞아떨어지게 잡았다 — 추천값이 프리셋 칩 중 하나를 그대로 가리켜야 "이 칩이 추천이에요"
 * 라고 표시할 수 있다.
 */
export interface RestRecommendation {
  seconds: number;
  reason: string;
}

export function recommendRestSeconds(reps: number | undefined | null): RestRecommendation | null {
  if (reps == null || !Number.isFinite(reps) || reps <= 0) return null;
  if (reps <= 5) return { seconds: 180, reason: '고중량·저반복 — 근력 위주, 완전 회복' };
  if (reps <= 8) return { seconds: 120, reason: '무거운 근비대 구간' };
  if (reps <= 15) return { seconds: 90, reason: '근비대 구간' };
  return { seconds: 60, reason: '고반복 — 근지구력 위주' };
}

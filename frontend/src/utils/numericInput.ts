/**
 * 숫자 입력 필드 sanitize — 타이핑 시점에 걸러 `Number()` 가 NaN 이 되는 값 자체를
 * 없앤다. `decimal-pad`/`number-pad` 키보드도 붙여넣기·일부 기기 IME로는 걸러지지
 * 않은 문자열이 그대로 들어올 수 있다(QA_CHECKLIST.md 패턴 2, P0-1/P0-2 확정 버그).
 *
 * BodyMetricScreen·NumberStepper·WorkoutSessionScreen 세 곳에 같은 로직이
 * 따로 있던 걸 여기로 모았다.
 */

/** 숫자와 소수점 하나만 허용한다(두 번째부터의 점은 버림). 무게·체중·RPE 등에 쓴다. */
export function sanitizeDecimalInput(v: string): string {
  const digitsAndDots = v.replace(/[^0-9.]/g, '');
  const firstDot = digitsAndDots.indexOf('.');
  if (firstDot === -1) return digitsAndDots;
  return digitsAndDots.slice(0, firstDot + 1) + digitsAndDots.slice(firstDot + 1).replace(/\./g, '');
}

/** 숫자만 허용한다(소수점 불가). 횟수·세트 수 등에 쓴다. */
export function sanitizeIntegerInput(v: string): string {
  return v.replace(/[^0-9]/g, '');
}

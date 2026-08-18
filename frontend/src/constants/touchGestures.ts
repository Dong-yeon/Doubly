/**
 * 가상 터치 제스처 카탈로그 — Obimy 벤치마킹(PLAN.md "가상 터치" 참고).
 *
 * 백엔드 TouchGesture 와 코드·프리미엄 여부가 정확히 짝을 맞춰야 한다. 여기서 바꾸면
 * backend/src/main/java/com/fitto/chat/domain/TouchGesture.java 도 같이 바꿀 것.
 */
import type { TouchGestureCode } from '../types';

export interface TouchGestureDef {
  code: TouchGestureCode;
  label: string;
  emoji: string;
  /** true 면 TOUCH_GESTURE_PREMIUM(PRO) 게이팅 대상 */
  premium: boolean;
}

export const TOUCH_GESTURES: TouchGestureDef[] = [
  { code: 'HAND_HOLD', label: '손잡기', emoji: '🤝', premium: false },
  { code: 'PAT', label: '토닥임', emoji: '🫶', premium: false },
  { code: 'POKE', label: '콕 찌르기', emoji: '👉', premium: false },
  { code: 'HUG', label: '포옹', emoji: '🤗', premium: true },
  { code: 'KISS', label: '뽀뽀', emoji: '😘', premium: true },
];

export function touchGestureOf(code: string | null | undefined): TouchGestureDef | undefined {
  return TOUCH_GESTURES.find((g) => g.code === code);
}

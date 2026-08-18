/** 햅틱 피드백 — 네이티브에서만 동작(웹은 무시). */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { TouchGestureCode } from '../types';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptics = {
  light: () => {
    if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  medium: () => {
    if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  },
  success: () => {
    if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
};

/**
 * 가상 터치 제스처별 진동 패턴 — PLAN.md "가상 터치" 참고.
 *
 * expo-haptics 는 Light/Medium/Heavy/Success 밖에 없어 표현할 수 있는 촉감의 폭이 좁다.
 * 완전히 다른 느낌을 주기보다, 횟수·간격으로 최소한의 차이를 준다 — 라벨·이모지·애니메이션이
 * 실제 구분의 대부분을 담당해야 한다(진동만으로 완전히 구분하려 하지 말 것).
 */
type Beat = { style: Haptics.ImpactFeedbackStyle; delayMs: number } | { success: true; delayMs: number };

const TOUCH_PATTERNS: Record<TouchGestureCode, Beat[]> = {
  HAND_HOLD: [{ style: Haptics.ImpactFeedbackStyle.Light, delayMs: 0 }],
  PAT: [
    { style: Haptics.ImpactFeedbackStyle.Medium, delayMs: 0 },
    { style: Haptics.ImpactFeedbackStyle.Medium, delayMs: 150 },
  ],
  POKE: [{ style: Haptics.ImpactFeedbackStyle.Light, delayMs: 0 }],
  HUG: [
    { style: Haptics.ImpactFeedbackStyle.Heavy, delayMs: 0 },
    { style: Haptics.ImpactFeedbackStyle.Heavy, delayMs: 200 },
    { style: Haptics.ImpactFeedbackStyle.Heavy, delayMs: 400 },
  ],
  KISS: [{ success: true, delayMs: 0 }],
};

/** 제스처 진동 패턴 재생 — 알 수 없는 코드는 조용히 무시(방어적). */
export function playTouchGesture(code: string | null | undefined): void {
  if (!enabled || !code) return;
  const pattern = TOUCH_PATTERNS[code as TouchGestureCode];
  if (!pattern) return;
  for (const beat of pattern) {
    setTimeout(() => {
      if ('success' in beat) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      } else {
        Haptics.impactAsync(beat.style).catch(() => undefined);
      }
    }, beat.delayMs);
  }
}

/**
 * 주 입력기가 손가락인가(coarse) 마우스인가(fine).
 *
 * <p>PC 웹에서 스와이프 제스처를 그대로 두면 마우스 드래그가 화면 전환으로 먹힌다
 * (텍스트를 긁으려다 뒤로 가기). 반대로 <b>모바일 웹</b>은 같은 웹이라도 스와이프가
 * 맞으므로 `Platform.OS === 'web'` 한 가지로 가를 수 없다 — 입력기를 직접 묻는다.
 *
 * <p>docs/PC_APP_ANALYSIS_2026-09-14.md 4절 1단계 "SwipeBackView".
 */
import { Platform } from 'react-native';

export function isCoarsePointer(): boolean {
  if (Platform.OS !== 'web') return true;
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(pointer: coarse)').matches;
}

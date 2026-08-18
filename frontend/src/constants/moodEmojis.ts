/**
 * 무드 상태 프리셋 — Obimy 벤치마킹(PLAN.md "무드 상태" 참고).
 *
 * Obimy 원본(60여 종)이 아니라 12종으로 시작한다 — 처음부터 다 만들면 선택 마비만 생긴다.
 * 반응을 보고 늘린다. 서버는 길이만 검증하고 이 목록을 강제하지 않는다(신뢰 경계 밖).
 */
export interface MoodEmojiDef {
  emoji: string;
  label: string;
}

export const MOOD_EMOJIS: MoodEmojiDef[] = [
  { emoji: '😊', label: '좋음' },
  { emoji: '🥰', label: '행복' },
  { emoji: '🥳', label: '신남' },
  { emoji: '😎', label: '여유' },
  { emoji: '🤔', label: '고민' },
  { emoji: '😮‍💨', label: '한숨' },
  { emoji: '😴', label: '졸림' },
  { emoji: '🫠', label: '녹음' },
  { emoji: '😤', label: '빡침' },
  { emoji: '😔', label: '시무룩' },
  { emoji: '😢', label: '슬픔' },
  { emoji: '🤒', label: '아픔' },
];

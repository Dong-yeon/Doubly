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

/**
 * 확장 무드팩 (PRO — `Feature.PREMIUM_STICKER`).
 *
 * 백엔드 `com.fitto.chat.domain.MoodPack.PREMIUM` 과 목록이 짝을 맞춰야 한다.
 * 기본 12종으로는 표현이 안 되던 결들만 담는다 — 무료 목록을 옮겨오는 게 아니라
 * 위에 얹는 것이라, 기존 사용자가 쓰던 무드가 갑자기 잠기지 않는다.
 */
export const PREMIUM_MOOD_EMOJIS: MoodEmojiDef[] = [
  { emoji: '🤩', label: '설렘' },
  { emoji: '🥲', label: '뭉클' },
  { emoji: '😌', label: '평온' },
  { emoji: '🫶', label: '고마움' },
  { emoji: '🙃', label: '멘붕' },
  { emoji: '😳', label: '당황' },
  { emoji: '🥶', label: '추움' },
  { emoji: '🥵', label: '더움' },
  { emoji: '🤯', label: '폭발' },
  { emoji: '😇', label: '뿌듯' },
  { emoji: '🫥', label: '무기력' },
  { emoji: '🤠', label: '의욕' },
];

export function isPremiumMood(emoji: string): boolean {
  return PREMIUM_MOOD_EMOJIS.some((m) => m.emoji === emoji);
}

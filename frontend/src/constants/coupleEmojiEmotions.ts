/**
 * 우리 이모지 감정 6종 — 백엔드 {@code CoupleEmojiEmotion} 과 <b>순서까지</b> 짝을 맞춘다.
 * 서버가 이 순서대로 한 장씩 만들어 저장하므로, 생성 대기 화면의 6칸이 이 순서로 채워진다
 * (docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §7 "칸이 채워지는 UI").
 *
 * <p>라벨은 서버도 응답에 실어 준다({@code CoupleEmojiResponse.label}). 여기 라벨은
 * <b>아직 안 만들어진 빈 칸</b>에 쓰는 것이다 — 그 칸에는 서버 응답이 아직 없다.
 * 바꾸려면 backend/src/main/java/com/fitto/coupleemoji/domain/CoupleEmojiEmotion.java 도 같이.
 */
import type { CoupleEmojiEmotion } from '../types';

export interface CoupleEmojiEmotionDef {
  key: CoupleEmojiEmotion;
  label: string;
  /** 빈 칸 자리표시 — 생성 전에도 무슨 표정이 올지 알 수 있게 */
  placeholder: string;
}

export const COUPLE_EMOJI_EMOTIONS: CoupleEmojiEmotionDef[] = [
  { key: 'ANGRY', label: '화남', placeholder: '😠' },
  { key: 'HAPPY', label: '기쁨', placeholder: '😊' },
  { key: 'EXCITED', label: '신남', placeholder: '🎉' },
  { key: 'SAD', label: '슬픔', placeholder: '😢' },
  { key: 'SLEEPY', label: '졸림', placeholder: '😴' },
  { key: 'LOVE', label: '사랑', placeholder: '🥰' },
];

export function coupleEmojiEmotionOf(
  key: string | null | undefined,
): CoupleEmojiEmotionDef | undefined {
  return COUPLE_EMOJI_EMOTIONS.find((e) => e.key === key);
}

/**
 * 우리 이모지 감정 17종(표정 6 + 상황 11) — 백엔드 {@code CoupleEmojiEmotion} 과 <b>순서까지</b>
 * 짝을 맞춘다. 서버가 이 순서대로 한 장씩 만들어 저장하므로, 생성 대기 화면의 17칸이 이 순서로 채워진다
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

/**
 * 한 번에 만들 수 있는 장 수 — 백엔드 {@code CoupleEmojiService.MAX_EMOTIONS_PER_REQUEST} 와 같아야 한다.
 *
 * <p>17종을 한 요청에 담으면 실비(장당 약 0.04 USD)·대기 시간·실패 시 손실이 한꺼번에 커진다.
 * 2026-09-11 크레딧이 떨어졌을 때 한 요청이 30분을 돌고 아무것도 남기지 못했다. 나눠 만들면
 * 한 번이 15~20초에 끝나고, 마음에 든 장은 트레이에 그대로 남는다.
 *
 * <p>여기서 막는 건 사용자 경험용이다 — 진짜 상한은 서버가 본다(넘겨 보내면 400).
 */
export const MAX_EMOJI_PER_REQUEST = 5;

export const COUPLE_EMOJI_EMOTIONS: CoupleEmojiEmotionDef[] = [
  { key: 'ANGRY', label: '화남', placeholder: '😠' },
  { key: 'HAPPY', label: '기쁨', placeholder: '😊' },
  { key: 'EXCITED', label: '신남', placeholder: '🎉' },
  { key: 'SAD', label: '슬픔', placeholder: '😢' },
  { key: 'SLEEPY', label: '졸림', placeholder: '😴' },
  { key: 'LOVE', label: '사랑', placeholder: '🥰' },
  /*
   * 상황 11종(2026-09-10 추가) — 위 6종이 순수한 표정이라면 이쪽은 소품이 있는 상황이다.
   * placeholder 는 아직 안 만들어진 칸에만 쓰이므로, 무드용 유니코드(백엔드 moodEmoji)와
   * 달라도 된다 — 여기서는 "무엇이 올지" 알아보기 쉬운 쪽을 골랐다.
   */
  { key: 'FRESHLY_WASHED', label: '씻고왔다', placeholder: '🧖' },
  { key: 'BOUQUET', label: '꽃다발', placeholder: '💐' },
  { key: 'KISS', label: '뽀뽀', placeholder: '😘' },
  { key: 'HARD_AT_WORK', label: '열일', placeholder: '💪' },
  { key: 'COMMUTING', label: '출근', placeholder: '🏃' },
  { key: 'OFF_WORK', label: '퇴근', placeholder: '🙌' },
  { key: 'DRAINED', label: '방전', placeholder: '🪫' },
  { key: 'SHOWING_OFF', label: '멋진척', placeholder: '😎' },
  { key: 'DRESSED_UP', label: '꽃단장', placeholder: '💄' },
  { key: 'FACE_MASK', label: '마스크팩', placeholder: '🧴' },
  { key: 'DOING_MAKEUP', label: '화장', placeholder: '🖌️' },
];

export function coupleEmojiEmotionOf(
  key: string | null | undefined,
): CoupleEmojiEmotionDef | undefined {
  return COUPLE_EMOJI_EMOTIONS.find((e) => e.key === key);
}

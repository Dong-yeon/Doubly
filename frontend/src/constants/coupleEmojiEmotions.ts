/**
 * 우리 이모지 감정 23종(표정 6 + 자주 하는 말 6 + 상황 11) — 백엔드 {@code CoupleEmojiEmotion} 과 <b>순서까지</b>
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
  /** 표정(얼굴만) / 자주 하는 말 / 상황(소품이 있는 장면) — 고르기 시트가 묶음으로 나눠 보여 준다 */
  group: 'face' | 'words' | 'scene';
}

/** 고르기 시트의 묶음 이름 */
export const COUPLE_EMOJI_GROUP_LABEL: Record<CoupleEmojiEmotionDef['group'], string> = {
  face: '표정',
  words: '자주 하는 말',
  scene: '상황',
};

/**
 * 한 번에 만들 수 있는 장 수 — 백엔드 {@code CoupleEmojiService.MAX_EMOTIONS_PER_REQUEST} 와 같아야 한다.
 *
 * <p>17종을 한 요청에 담으면 실비(장당 약 0.04 USD)·대기 시간·실패 시 손실이 한꺼번에 커진다.
 * 2026-09-11 크레딧이 떨어졌을 때 한 요청이 30분을 돌고 아무것도 남기지 못했다. 나눠 만들면
 * 한 번이 15~20초에 끝나고, 마음에 든 장은 트레이에 그대로 남는다.
 *
 * <p>여기서 막는 건 사용자 경험용이다 — 진짜 상한은 서버가 본다(넘겨 보내면 400).
 *
 * <p>2026-09-29: 5 → 6. 표정이 6종인데 한 번에 5장이라 첫 세트로 기본 표정조차 다 못 채웠다
 * (docs/COUPLE_EMOJI_CREATE_UX_2026-09-29.md §2). 이제 첫 세트 기본값이 "표정 한 벌"이다.
 */
export const MAX_EMOJI_PER_REQUEST = 6;

export const COUPLE_EMOJI_EMOTIONS: CoupleEmojiEmotionDef[] = [
  { key: 'ANGRY', label: '화남', placeholder: '😠', group: 'face' },
  { key: 'HAPPY', label: '기쁨', placeholder: '😊', group: 'face' },
  { key: 'EXCITED', label: '신남', placeholder: '🎉', group: 'face' },
  { key: 'SAD', label: '슬픔', placeholder: '😢', group: 'face' },
  { key: 'SLEEPY', label: '졸림', placeholder: '😴', group: 'face' },
  { key: 'LOVE', label: '사랑', placeholder: '🥰', group: 'face' },
  /*
   * 자주 하는 말 6종(2026-09-29 추가) — 표정 바로 뒤라 "아직 없는 것부터" 기본값으로 두 번째 세트가 정확히 이 여섯이다.
   * placeholder 는 오래된 이모지만(Emoji 14 는 구형 안드로이드에서 네모로 뜬다).
   */
  { key: 'SORRY', label: '미안해', placeholder: '🙇', group: 'words' },
  { key: 'THANKS', label: '고마워', placeholder: '🙏', group: 'words' },
  { key: 'MISS_YOU', label: '보고싶어', placeholder: '🥺', group: 'words' },
  { key: 'GOOD_NIGHT', label: '잘자', placeholder: '🌙', group: 'words' },
  { key: 'HUNGRY', label: '배고파', placeholder: '🍚', group: 'words' },
  { key: 'CHEER', label: '화이팅', placeholder: '📣', group: 'words' },
  /*
   * 상황 11종(2026-09-10 추가) — 위 6종이 순수한 표정이라면 이쪽은 소품이 있는 상황이다.
   * placeholder 는 아직 안 만들어진 칸에만 쓰이므로, 무드용 유니코드(백엔드 moodEmoji)와
   * 달라도 된다 — 여기서는 "무엇이 올지" 알아보기 쉬운 쪽을 골랐다.
   */
  { key: 'FRESHLY_WASHED', label: '씻고왔다', placeholder: '🧖', group: 'scene' },
  { key: 'BOUQUET', label: '꽃다발', placeholder: '💐', group: 'scene' },
  { key: 'KISS', label: '뽀뽀', placeholder: '😘', group: 'scene' },
  { key: 'HARD_AT_WORK', label: '열일', placeholder: '💪', group: 'scene' },
  { key: 'COMMUTING', label: '출근', placeholder: '🏃', group: 'scene' },
  { key: 'OFF_WORK', label: '퇴근', placeholder: '🙌', group: 'scene' },
  { key: 'DRAINED', label: '방전', placeholder: '😩', group: 'scene' },
  { key: 'SHOWING_OFF', label: '멋진척', placeholder: '😎', group: 'scene' },
  { key: 'DRESSED_UP', label: '꽃단장', placeholder: '💄', group: 'scene' },
  { key: 'FACE_MASK', label: '마스크팩', placeholder: '🧴', group: 'scene' },
  { key: 'DOING_MAKEUP', label: '화장', placeholder: '🖌️', group: 'scene' },
];

export function coupleEmojiEmotionOf(
  key: string | null | undefined,
): CoupleEmojiEmotionDef | undefined {
  return COUPLE_EMOJI_EMOTIONS.find((e) => e.key === key);
}

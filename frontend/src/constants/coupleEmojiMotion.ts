/**
 * 움직이는 우리 이모지 — 감정별 캐릭터 모션과 효과 레이어 프리셋.
 *
 * <p><b>그림은 그대로, 움직임은 앱이 입힌다</b>(docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §13,
 * docs/COUPLE_EMOJI_ANIMATION_SPEC_2026-09-28.md §5). AI 를 한 번 더 부르지 않으므로 원가가 0 이고,
 * 이미 만든 세트도 그대로 움직인다.
 *
 * <p>모션은 <b>키프레임 값 목록</b>이다. 진행도 0→1 을 값 개수만큼 등분해 보간한다
 * (AnimatedCoupleEmoji). 모든 트랙은 정지 자세(이동 0·회전 0·배율 1·불투명 1)로 끝나야
 * 한 번 재생하고 멈췄을 때 원래 그림과 같다.
 *
 * <p>효과 글리프는 오래된 이모지만 쓴다 — 🫧·🪫(Emoji 14)는 Android 12 이전 시스템 폰트에
 * 없어 네모(tofu)로 뜬다. 씻고왔다는 💦, 방전은 💫 로 바꿨다.
 */
import type { CoupleEmojiEmotion } from '../types';
import { animatedStickerOf } from './animatedStickers';

export type MotionKind =
  | 'shake' | 'tilt' | 'bounce' | 'droop' | 'sway' | 'beat' | 'pop' | 'lean'
  | 'jitter' | 'bob' | 'stretch' | 'sink' | 'breathe' | 'hold' | 'squash';

export type MotionTrack = 'translateX' | 'translateY' | 'rotate' | 'scale' | 'scaleY' | 'opacity';

export interface MotionSpec {
  /** 한 번 재생 길이(ms) — 루프하지 않는다 */
  duration: number;
  /** 트랙별 키프레임. rotate 는 도(deg), 이동은 px */
  tracks: Partial<Record<MotionTrack, number[]>>;
}

export type EffectSpec =
  /** animatedStickers.ts 의 Noto Lottie — 웹에서는 그리지 않는다(AnimatedSticker.web 과 같은 이유) */
  | { kind: 'lottie'; code: string }
  /** 이모지 글자 하나를 경로를 따라 띄운다 */
  | { kind: 'glyph'; glyph: string; path: 'rise' | 'fall' | 'pulse' | 'drift' | 'blink' };

export interface CoupleEmojiMotion {
  motion: MotionKind;
  effect: EffectSpec | null;
}

export const MOTIONS: Record<MotionKind, MotionSpec> = {
  // 60ms × 6 좌우 떨림
  shake: { duration: 420, tracks: { translateX: [0, -4, 4, -4, 4, -4, 4, 0] } },
  tilt: { duration: 800, tracks: { rotate: [0, 5, -5, 5, -5, 0] } },
  bounce: { duration: 900, tracks: { translateY: [0, -12, 0, -12, 0, -12, 0] } },
  droop: { duration: 1400, tracks: { translateY: [0, 4, 4, 0], scale: [1, 0.97, 0.97, 1] } },
  sway: { duration: 2400, tracks: { rotate: [0, 3, -3, 3, -3, 0] } },
  beat: { duration: 800, tracks: { scale: [1, 1.08, 1, 1.08, 1] } },
  pop: { duration: 600, tracks: { scale: [1, 0.9, 1.05, 1] } },
  lean: { duration: 900, tracks: { scale: [1, 1.06, 1.06, 1], rotate: [0, -4, -4, 0] } },
  jitter: { duration: 600, tracks: { translateX: [0, -2, 2, -2, 2, -2, 2, -2, 2, 0] } },
  bob: { duration: 1200, tracks: { translateY: [0, -3, 0, -3, 0, -3, 0, -3, 0] } },
  stretch: { duration: 900, tracks: { scaleY: [1, 1.06, 1] } },
  sink: { duration: 1400, tracks: { translateY: [0, 6, 6, 0], opacity: [1, 0.85, 0.85, 1] } },
  breathe: { duration: 1600, tracks: { scale: [1, 1.03, 1] } },
  // 고개를 젖힌 채 잠깐 버티다 돌아온다 — 멋진척
  hold: { duration: 1200, tracks: { rotate: [0, -6, -6, -6, 0] } },
  // 위아래로 눌렸다 돌아온다 — 녹는 달걀이처럼 바닥에 붙은 그림은 내려가면 바닥째 떠 보인다
  squash: { duration: 1200, tracks: { scaleY: [1, 0.93, 0.96, 0.93, 1] } },
};

export const COUPLE_EMOJI_MOTION: Record<CoupleEmojiEmotion, CoupleEmojiMotion> = {
  ANGRY: { motion: 'shake', effect: { kind: 'glyph', glyph: '💢', path: 'pulse' } },
  HAPPY: { motion: 'tilt', effect: { kind: 'lottie', code: 'ANIM_SPARKLES' } },
  EXCITED: { motion: 'bounce', effect: { kind: 'lottie', code: 'ANIM_PARTY_POPPER' } },
  SAD: { motion: 'droop', effect: { kind: 'glyph', glyph: '💧', path: 'fall' } },
  SLEEPY: { motion: 'sway', effect: { kind: 'glyph', glyph: '💤', path: 'rise' } },
  LOVE: { motion: 'beat', effect: { kind: 'lottie', code: 'ANIM_TWO_HEARTS' } },
  FRESHLY_WASHED: { motion: 'sway', effect: { kind: 'glyph', glyph: '💦', path: 'rise' } },
  BOUQUET: { motion: 'pop', effect: { kind: 'lottie', code: 'ANIM_CHERRY_BLOSSOM' } },
  KISS: { motion: 'lean', effect: { kind: 'glyph', glyph: '💗', path: 'drift' } },
  HARD_AT_WORK: { motion: 'jitter', effect: { kind: 'lottie', code: 'ANIM_FIRE' } },
  COMMUTING: { motion: 'bob', effect: { kind: 'glyph', glyph: '💨', path: 'drift' } },
  OFF_WORK: { motion: 'stretch', effect: { kind: 'lottie', code: 'ANIM_SPARKLES' } },
  DRAINED: { motion: 'sink', effect: { kind: 'glyph', glyph: '💫', path: 'blink' } },
  SHOWING_OFF: { motion: 'hold', effect: { kind: 'lottie', code: 'ANIM_GLOWING_STAR' } },
  DRESSED_UP: { motion: 'pop', effect: { kind: 'lottie', code: 'ANIM_SPARKLES' } },
  FACE_MASK: { motion: 'breathe', effect: { kind: 'glyph', glyph: '✨', path: 'pulse' } },
  DOING_MAKEUP: { motion: 'tilt', effect: { kind: 'lottie', code: 'ANIM_SPARKLES' } },
};

// 없는 Lottie 코드는 조용히 효과 없음이 된다 — 개발 중에는 바로 알 수 있게 한 번 훑는다
if (__DEV__) {
  for (const [emotion, preset] of Object.entries(COUPLE_EMOJI_MOTION)) {
    if (preset.effect?.kind === 'lottie' && !animatedStickerOf(preset.effect.code)) {
      console.warn(`[coupleEmojiMotion] ${emotion}: 없는 Lottie 코드 ${preset.effect.code}`);
    }
  }
}

/**
 * 감정의 모션 프리셋 — 모르는 감정(서버가 먼저 늘린 경우)은 null 이라 정지 이미지로 그린다.
 * HAPPY 로 대신하지 않는다: 엉뚱한 모션보다 정지가 낫다.
 */
export function coupleEmojiMotionOf(emotion: string | null | undefined): CoupleEmojiMotion | null {
  if (!emotion) return null;
  return (COUPLE_EMOJI_MOTION as Record<string, CoupleEmojiMotion | undefined>)[emotion] ?? null;
}

/**
 * 효과 레이어를 얹어도 되는 세트인가. v4 이하는 김·색종이·zzz 가 그림 안에 그려져 있어
 * 효과가 겹친다 — 모션만 준다. `duo-` 접두(우리 둘 이모지)는 처음부터 효과 없이 그린다
 * (docs/COUPLE_EMOJI_DUO_SPEC_2026-09-28.md §3-3). 버전을 모르면(옛 서버) 끈다.
 */
export function coupleEmojiEffectsAllowed(promptVersion: string | null | undefined): boolean {
  if (!promptVersion) return false;
  if (promptVersion.startsWith('duo-')) return true;
  const m = /^v(\d+)$/.exec(promptVersion);
  return m ? Number(m[1]) >= 5 : false;
}

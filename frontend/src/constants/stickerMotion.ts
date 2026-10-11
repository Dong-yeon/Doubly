/**
 * 캐릭터 스티커(달걀이·구운이♥달걀이)의 모션 — 말풍선에서 받은 순간 한 번 움직인다.
 *
 * <p>우리 이모지와 같은 방식이다(constants/coupleEmojiMotion.ts, hooks/useOneShotMotion.ts): 그림은 그대로 두고
 * 앱이 통째로 흔들거나 통통 튀게 한다. 원가 0, EAS Update 로 나간다. 검토는 docs/TEXT_STICKER_2026-09-28.md 부록.
 *
 * <p><b>효과 레이어는 없다.</b> 43장 전부 zzz·불·김·하트·땀방울이 그림 안에 이미 그려져 있다 — 앱이 효과를
 * 또 얹으면 겹친다(우리 이모지 v4 세트와 같은 이유, ANIMATION_SPEC F6).
 *
 * <p>PNG 가 투명 배경이라 캐릭터만 떼어져 움직인다(우리 이모지는 흰 배경이라 원형 마스크째 흔들린다).
 *
 * <p>피커에 있는 모든 코드가 여기 있어야 한다 — `npm run verify:sticker-codes` 가 확인한다. 없으면 정지 그림이다
 * (엉뚱한 모션보다 정지가 낫다). 내린 스티커는 넣지 않는다 — 지난 메시지는 예전처럼 정지 그림이다.
 */
import { MOTIONS, type MotionKind, type MotionSpec } from './coupleEmojiMotion';

export const STICKER_MOTION: Record<string, MotionKind> = {
  // ── 달걀이 ──
  EGG_AWKWARD: 'jitter',
  EGG_GLOOMY: 'droop',
  EGG_IDEA: 'pop',
  EGG_SLEEPY: 'sway',
  EGG_FURIOUS: 'shake',
  EGG_ANGRY: 'shake',
  EGG_SULKY: 'hold',
  EGG_GRUMPY: 'hold',
  EGG_KISS: 'lean',
  EGG_EYE_ROLL: 'droop',
  EGG_UNAMUSED: 'breathe',
  EGG_SWEAT: 'jitter',
  EGG_HAPPY: 'tilt',
  EGG_RELAXED: 'breathe',
  EGG_DROOL: 'bob',
  EGG_PROUD: 'stretch',
  EGG_ANGEL: 'bob',
  EGG_SHOCKED: 'pop',
  EGG_MELTING: 'squash',
  EGG_FROZEN: 'jitter',
  EGG_HOT: 'droop',
  EGG_SALUTE: 'pop',
  EGG_LOVE: 'beat',
  // ── 구운이♥달걀이 ──
  DUO_SAD: 'droop',
  DUO_GLOOMY: 'droop',
  DUO_IDEA: 'pop',
  DUO_SLEEP: 'breathe',
  DUO_FIGHT: 'shake',
  DUO_GLARE: 'hold',
  DUO_FURIOUS: 'shake',
  DUO_KISS: 'lean',
  DUO_DIZZY: 'sway',
  DUO_SULKY: 'hold',
  DUO_HAPPY: 'bounce',
  DUO_RELAXED: 'breathe',
  DUO_DROOL: 'bob',
  DUO_WINK: 'tilt',
  DUO_HEART_EYES: 'beat',
  DUO_CRY: 'jitter',
  DUO_FROZEN: 'jitter',
  DUO_LOVE: 'beat',
  DUO_SHOCKED: 'pop',
  DUO_HEATED: 'shake',
};

/** 캐릭터 스티커의 모션 — 없으면 null(정지 그림) */
export function stickerMotionOf(code: string | null | undefined): MotionSpec | null {
  const kind = code ? STICKER_MOTION[code] : undefined;
  return kind ? MOTIONS[kind] : null;
}

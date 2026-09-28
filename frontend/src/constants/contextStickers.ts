/**
 * 맥락 스티커 — 채팅 밖 상태(기념일·상대 무드)에 맞는 스티커를 그 순간 패널 맨 앞과 추천 막대에 둔다.
 * 결정·우선순위는 docs/CONTEXT_STICKERS_2026-09-28.md.
 *
 * <p><b>1차는 기존 그림의 재배치뿐이다</b>(원가 0, EAS Update). "한정"은 <b>노출 한정</b>이다 — 그날 맨 앞에 뜰 뿐,
 * 보내기를 그날로 막지 않는다. 나중에 전용 그림(예: 달걀이 100일 케이크)이 들어오면 같은 칸에 붙인다
 * (코드·팩 추가 절차는 docs/STICKER_PACK_MONETIZATION_2026-09-21.md §13).
 *
 * <p>모든 코드는 피커의 캐릭터 스티커(`STICKER_CHARACTERS`) 또는 움직이는 이모티콘(`animatedStickers.ts`)에
 * 실제로 있어야 한다 — `npm run verify:context-stickers` 가 확인한다. 한 칸에는 캐릭터 스티커를 앞에 둔다
 * (추천 막대와 같은 순서 규칙). 잠긴 팩의 스티커는 화면이 걸러 낸다.
 */
import { animatedStickerOf } from './animatedStickers';
import { stickerImageOf } from './stickerImages';
import type { StickerSuggestion } from '../utils/stickerCodes';

export type StickerContext = 'ANNIVERSARY' | 'MOOD';

/** 기념일 당일 — 축하·사랑 */
export const ANNIVERSARY_STICKERS: string[] = [
  'DUO_LOVE',
  'EGG_LOVE',
  'ANIM_PARTY_POPPER',
  'ANIM_CONFETTI',
  'ANIM_BIRTHDAY_CAKE',
  'ANIM_BOUQUET',
  'ANIM_RING',
  'ANIM_TWO_HEARTS',
];

/**
 * 상대 무드 → 그 무드에 <b>답하는</b> 스티커(4~6장). 같은 기분을 따라 하는 게 아니라 답장이다 —
 * 슬프면 안아 주고, 화났으면 달래고, 피곤하면 수고했다·잘 자라고, 신나면 같이 신난다.
 *
 * <p>키는 무드 유니코드다. 기본 12종 + 확장 12종(constants/moodEmojis.ts)을 <b>빠짐없이</b> 적는다.
 * 우리 이모지를 무드로 걸어도 서버가 감정 대역 유니코드를 함께 내려주므로(MoodEntry.emoji) 이 표로 충분하다.
 * 표에 없는 무드는 줄을 띄우지 않는다.
 */
export const MOOD_REPLY: Record<string, string[]> = {
  // ── 기본 ──
  '😊': ['DUO_HAPPY', 'EGG_HAPPY', 'ANIM_SMILE', 'ANIM_TWO_HEARTS'], // 좋음 → 같이 좋아
  '🥰': ['EGG_LOVE', 'DUO_LOVE', 'DUO_HEART_EYES', 'ANIM_TWO_HEARTS', 'ANIM_LOVE_FACE'], // 행복 → 사랑
  '🥳': ['DUO_HAPPY', 'ANIM_PARTY_POPPER', 'ANIM_PARTY_FACE', 'ANIM_CLAP'], // 신남 → 같이 신나기
  '😎': ['EGG_RELAXED', 'DUO_RELAXED', 'ANIM_COOL', 'ANIM_THUMBS_UP'], // 여유
  '🤔': ['EGG_IDEA', 'DUO_IDEA', 'ANIM_THINKING', 'ANIM_HUG'], // 고민 → 같이 생각
  '😮‍💨': ['DUO_LOVE', 'EGG_ANGEL', 'ANIM_HUG', 'ANIM_HAND_HEART'], // 한숨 → 토닥
  '😴': ['DUO_SLEEP', 'EGG_SLEEPY', 'ANIM_SLEEPING', 'ANIM_HUG'], // 졸림 → 잘 자
  '🫠': ['EGG_ANGEL', 'DUO_LOVE', 'ANIM_HUG', 'ANIM_MUSCLE'], // 녹음 → 수고했어
  '😤': ['EGG_SWEAT', 'EGG_AWKWARD', 'ANIM_PLEADING', 'ANIM_PRAY'], // 빡침 → 미안·달래기
  '😔': ['DUO_LOVE', 'EGG_ANGEL', 'ANIM_HUG', 'ANIM_PLEADING'], // 시무룩 → 토닥
  '😢': ['DUO_LOVE', 'EGG_ANGEL', 'ANIM_HUG', 'ANIM_HAND_HEART'], // 슬픔 → 안아 줄게
  '🤒': ['EGG_ANGEL', 'DUO_LOVE', 'ANIM_HUG', 'ANIM_PRAY'], // 아픔 → 걱정·얼른 나아
  // ── 확장 ──
  '🤩': ['DUO_HEART_EYES', 'EGG_LOVE', 'ANIM_HEART_EYES', 'ANIM_SPARKLING_HEART'], // 설렘
  '🥲': ['DUO_LOVE', 'EGG_ANGEL', 'ANIM_HUG', 'ANIM_HAND_HEART'], // 뭉클 → 토닥
  '😌': ['EGG_RELAXED', 'DUO_RELAXED', 'ANIM_SMILE', 'ANIM_TWO_HEARTS'], // 평온
  '🫶': ['EGG_LOVE', 'DUO_LOVE', 'ANIM_HAND_HEART', 'ANIM_FINGER_HEART'], // 고마움 → 나도
  '🙃': ['EGG_AWKWARD', 'DUO_LOVE', 'ANIM_HUG', 'ANIM_PRAY'], // 멘붕 → 토닥
  '😳': ['EGG_AWKWARD', 'EGG_SWEAT', 'ANIM_FLUSHED', 'ANIM_HUG'], // 당황
  '🥶': ['EGG_FROZEN', 'DUO_FROZEN', 'ANIM_HUG', 'ANIM_COFFEE'], // 추움 → 따뜻하게
  '🥵': ['EGG_HOT', 'EGG_MELTING', 'ANIM_ICE_CREAM', 'ANIM_WATERMELON'], // 더움 → 시원하게
  '🤯': ['EGG_SWEAT', 'ANIM_PLEADING', 'ANIM_HUG', 'ANIM_PRAY'], // 폭발 → 달래기
  '😇': ['EGG_PROUD', 'ANIM_CLAP', 'ANIM_TROPHY', 'ANIM_THUMBS_UP'], // 뿌듯 → 칭찬
  '🫥': ['EGG_ANGEL', 'DUO_LOVE', 'ANIM_HUG', 'ANIM_MUSCLE'], // 무기력 → 힘내
  '🤠': ['EGG_PROUD', 'ANIM_MUSCLE', 'ANIM_FIRE', 'ANIM_CLAP'], // 의욕 → 응원
};

/**
 * 코드 목록 → 막대·패널 항목. 카탈로그에 없는 코드는 조용히 빠진다(검증 스크립트가 미리 잡는다).
 * {@code matched} 는 계측 detail 의 앞머리다 — `ctx:ANNIVERSARY` 처럼 키워드 추천과 구분된다.
 */
export function contextSuggestions(
  context: StickerContext,
  codes: string[],
  isAllowed: (kind: StickerSuggestion['kind'], code: string) => boolean,
): StickerSuggestion[] {
  const out: StickerSuggestion[] = [];
  for (const code of codes) {
    const image = stickerImageOf(code);
    const anim = image ? undefined : animatedStickerOf(code);
    const kind = image ? 'image' : anim ? 'animated' : null;
    if (!kind || !isAllowed(kind, code)) continue;
    out.push({ kind, code, label: (image ?? anim)!.label, matched: `ctx:${context}` });
  }
  // 캐릭터 스티커가 앞 — 표에 섞여 적혀 있어도 막대 순서 규칙은 같다
  return [...out.filter((s) => s.kind === 'image'), ...out.filter((s) => s.kind === 'animated')];
}

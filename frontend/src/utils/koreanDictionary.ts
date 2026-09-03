/**
 * 맞춤법 검사 2층 — Hunspell 사전(네이티브)으로 사전에 없는 어절을 잡는다.
 *
 * <p>1층({@link ./koreanSpellRules})은 손으로 고른 규칙이라 정확하지만 적어둔 것만
 * 잡는다. 여기서는 사전을 얹어 일반화한다 — 규칙표에 없는 '제작년→재작년' 같은
 * 것도 걸린다.
 *
 * <p>사전 하나만 쓰면 오탐이 쏟아지므로 걸러내는 규칙(3층)을 앞뒤로 세운다 —
 * {@link ./koreanDictionaryRules} 에 모여 있다.
 *
 * <p>사전 로딩은 실기기에서 1.5초, 메모리 54MB다 — 반드시 미리, 화면을 막지 않는
 * 자리에서 {@link preloadDictionary} 를 부른다.
 */
import KoreanSpell from '../../modules/korean-spell';

import {
  DICTIONARY_REASON,
  collectTokens,
  pickSafeSuggestion,
  stripNasalEnding,
} from './koreanDictionaryRules';

import type { SpellSuggestion } from './koreanSpellCheck';

let loadPromise: Promise<boolean> | null = null;

/**
 * 사전을 미리 준비한다. 여러 번 불러도 실제 로딩은 한 번만 일어난다.
 *
 * <p>실패해도 던지지 않는다 — 사전이 없으면 1층 규칙 엔진만으로 계속 동작하면 되고,
 * 맞춤법 검사가 안 된다고 채팅을 못 쓰게 만들 이유가 없다.
 */
export function preloadDictionary(): Promise<boolean> {
  if (!loadPromise) {
    loadPromise = KoreanSpell.load().catch(() => false);
  }
  return loadPromise;
}

/** 사전이 준비됐는가 — 준비 전에는 2층을 통째로 건너뛴다 */
export function isDictionaryReady(): boolean {
  try {
    return KoreanSpell.isLoaded();
  } catch {
    return false;
  }
}

/** 사전에 있는 말인지 한 번에 물어본다. 네이티브가 없으면 전부 '있음'으로 본다 */
function lookup(words: string[]): boolean[] {
  try {
    return KoreanSpell.spellMany(words);
  } catch {
    return words.map(() => true);
  }
}

/**
 * 사전으로 걸러낸 제안 목록. 1층 결과와는 호출한 쪽에서 합친다
 * ({@link ./koreanSpellCheck}.dedupeOverlapping).
 *
 * <p>사전이 준비되지 않았으면 빈 목록을 돌려준다 — 로딩 중이라는 이유로 멀쩡한 말에
 * 밑줄이 그어지면 안 된다.
 */
export async function checkWithDictionary(text: string): Promise<SpellSuggestion[]> {
  if (!text || !isDictionaryReady()) return [];

  const tokens = collectTokens(text);
  if (tokens.length === 0) return [];

  const known = lookup(tokens.map((t) => t.text));

  // 애교체로 보이는 것들은 받침을 벗겨 한 번에 다시 물어본다(왕복 한 번 더로 끝낸다)
  const retry = tokens
    .map((t, i) => (known[i] ? null : stripNasalEnding(t.text)))
    .map((stripped, i) => ({ index: i, stripped }))
    .filter((entry): entry is { index: number; stripped: string } => entry.stripped !== null);
  const retryKnown = retry.length > 0 ? lookup(retry.map((r) => r.stripped)) : [];
  const excusedByNasal = new Set(
    retry.filter((_, i) => retryKnown[i]).map((entry) => entry.index),
  );

  const found: SpellSuggestion[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (known[i] || excusedByNasal.has(i)) continue;
    const token = tokens[i];

    let candidates: string[];
    try {
      candidates = await KoreanSpell.suggest(token.text);
    } catch {
      continue;
    }

    const best = pickSafeSuggestion(token.text, candidates);
    if (best === null) continue;

    found.push({
      index: token.index,
      wrong: token.text,
      right: best,
      reason: DICTIONARY_REASON,
    });
  }
  return found;
}

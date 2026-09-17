/**
 * 맞춤법 검사 3층 — 사전 검사의 오탐 안전장치.
 *
 * <p>사전 검사(2층)는 그냥 쓰면 오탐 기계다: 애교체("뭐했어용"), 사람 이름, 신조어,
 * 줄임말이 전부 "사전에 없음"으로 걸린다(실기기 확인 결과 애교체 5개가 전부 오탐).
 * 여기 모인 규칙들이 그걸 눌러 <b>오탐 제로 원칙</b>을 지킨다.
 *
 * <p>네이티브에 손대지 않는 순수 함수만 둔다 — 그래야 scripts/verify-spellcheck.mjs 가
 * 기기 없이 검증할 수 있다. 사전을 실제로 부르는 쪽은 {@link ./koreanDictionary} 다.
 */

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 종성 목록에서 'ㅇ'의 위치 */
const JONGSEONG_IEUNG = 21;
const JONGSEONG_COUNT = 28;
const JUNGSEONG_COUNT = 21;
/** 첫 초성(ᄀ)·중성(ᅡ)·종성(ᆨ)의 코드포인트 — 음절을 자모로 풀 때 쓴다 */
const CHOSEONG_BASE = 0x1100;
const JUNGSEONG_BASE = 0x1161;
const JONGSEONG_BASE = 0x11a7;

/** 사전 검사로 잡은 것들에 공통으로 붙는 설명 — 규칙표처럼 개별 사유를 알 수 없다 */
export const DICTIONARY_REASON = '사전에 없는 말이에요';

/** 한글 음절(가~힣)인가 — 자모('ㅋ')나 옛한글은 아니다 */
export function isHangulSyllable(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code >= HANGUL_BASE && code <= HANGUL_LAST;
}

/**
 * 마지막 글자의 'ㅇ' 받침을 벗긴 형태. 받침이 'ㅇ'이 아니면 null.
 *
 * <p>애교체 콧소리는 마지막 글자에 'ㅇ'을 붙이는 규칙적인 변형이라(요→용, 해→행,
 * 파→팡) 단어를 하나씩 등록하지 않고 규칙 하나로 처리된다. 단어 등록 방식은 끝이 없다.
 */
export function stripNasalEnding(word: string): string | null {
  const last = word[word.length - 1];
  if (last === undefined || !isHangulSyllable(last)) return null;
  const offset = last.charCodeAt(0) - HANGUL_BASE;
  if (offset % JONGSEONG_COUNT !== JONGSEONG_IEUNG) return null;
  const stripped = String.fromCharCode(last.charCodeAt(0) - JONGSEONG_IEUNG);
  return word.slice(0, -1) + stripped;
}

/**
 * 글자 단위 편집 거리. {@code limit} 을 넘으면 곧바로 포기한다
 * — 우리는 "1인가 아닌가"만 알면 되므로 끝까지 셀 이유가 없다.
 */
export function editDistanceWithin(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr.push(value);
      if (value < rowMin) rowMin = value;
    }
    // 이 행의 최솟값이 이미 한계를 넘었으면 최종 거리도 넘는다
    if (rowMin > limit) return limit + 1;
    prev = curr;
  }
  return prev[b.length];
}

/** 어절 하나와 그 원문 위치 */
export interface Token {
  text: string;
  index: number;
}

/**
 * 검사할 만한 어절만 골라낸다.
 *
 * <p>영문·숫자·자모·이모지가 섞인 어절은 애초에 사전이 판단할 대상이 아니다.
 * 한 글자 어절도 뺀다 — 조사 하나만 남은 조각이 많아 후보가 엉뚱하게 붙는다.
 */
export function collectTokens(text: string): Token[] {
  const tokens: Token[] = [];
  // 공백·문장부호로 끊는다. 한글 음절이 아닌 게 하나라도 섞이면 통째로 버린다.
  const re = /[^\s.,!?~…"'`()[\]{}<>:;/\\|@#$%^&*+=\-_\n]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const word = m[0];
    if (word.length < 2) continue;
    if (![...word].every(isHangulSyllable)) continue;
    // '좋아아아'처럼 늘여 쓴 강조는 사전에 없는 게 당연하다
    if (/(.)\1{2,}/.test(word)) continue;
    // '동연아'처럼 이름 뒤에 호격 조사가 붙은 꼴은 사전에 없기 쉬운데,
    // 후보로는 엉뚱한 이름이 붙는다 — 아예 보지 않는다.
    if (/[아야]$/.test(word)) continue;
    tokens.push({ text: word, index: m.index });
  }
  return tokens;
}

/**
 * 음절을 초성·중성·종성으로 푼 문자열. 한글 음절이 아닌 글자는 그대로 둔다.
 *
 * <p>글자 단위 거리로는 순서를 못 가리는 후보들을 갈라내려고 쓴다 — {@link
 * pickSafeSuggestion} 참고.
 */
export function toJamo(word: string): string {
  let out = '';
  for (const ch of word) {
    if (!isHangulSyllable(ch)) {
      out += ch;
      continue;
    }
    const offset = ch.charCodeAt(0) - HANGUL_BASE;
    const jong = offset % JONGSEONG_COUNT;
    out += String.fromCharCode(
      CHOSEONG_BASE + Math.floor(offset / (JUNGSEONG_COUNT * JONGSEONG_COUNT)),
      JUNGSEONG_BASE + (Math.floor(offset / JONGSEONG_COUNT) % JUNGSEONG_COUNT),
    );
    if (jong > 0) out += String.fromCharCode(JONGSEONG_BASE + jong);
  }
  return out;
}

/** 자모 거리를 비교할 때의 상한 — 순위만 알면 되므로 넉넉히 두고 끊는다 */
const JAMO_DISTANCE_LIMIT = 8;

/** 띄어쓰기만 다른 후보인가 — 공백을 지우면 원래 말이 되는 것 */
function isSpacingVariant(word: string, candidate: string): boolean {
  return candidate.includes(' ') && candidate.replace(/ /g, '') === word;
}

/**
 * 고침 후보들 중 지적해도 되는 것 하나. 없으면 null.
 *
 * <p><b>딱 한 글자만 다른 후보</b>만 통과시킨다. 이름·신조어는 대개 가까운 후보가
 * 없어서 여기서 조용히 걸러진다 — 오탐 제로를 지키는 마지막이자 가장 중요한 장치다.
 *
 * <p><b>남은 후보가 여럿이면 자모로 내려가 고른다.</b> 예전엔 먼저 걸리는 것을 그냥
 * 집었는데(Hunspell 이 주는 순서는 그럴듯한 순이 아니다) '귀찬아'가 '귀찮아' 대신
 * '귀잖아'로 고쳐졌다. 글자 단위로는 둘 다 거리 1 이지만, 자모로 보면 '귀찮아'는
 * 종성 하나(ᆫ→ᆭ)고 '귀잖아'는 초성까지 바뀐다.
 *
 * <p><b>띄어쓰기 변형이 후보에 있는데 나머지가 여럿이면 포기한다.</b> 사전이
 * 쪼개서도 읽힌다고 말하는 마당에 후보까지 갈리면 확신이 없는 것이다. '이번거'가
 * 그 경우로, 정답 '이번 거'는 공백 때문에 아래에서 걸러지고 '이번과'·'이번서'만
 * 남아 엉뚱한 낱말이 나갔다. 채팅에서 띄어쓰기는 어차피 지적하지 않으므로
 * (utils/koreanSpacing 참고) 아무 말도 안 하는 게 맞다. 후보가 하나뿐이면
 * ('제작년' → '재작년') 그건 확신이라 그대로 쓴다.
 */
export function pickSafeSuggestion(word: string, candidates: string[]): string | null {
  const safe = candidates.filter(
    (candidate) =>
      // 띄어쓰기만 다른 후보('제작 년')는 사전 검사로 판단하기 위험해 뺀다
      !candidate.includes(' ') &&
      candidate !== word &&
      editDistanceWithin(word, candidate, 1) === 1,
  );
  if (safe.length === 0) return null;
  if (safe.length > 1 && candidates.some((c) => isSpacingVariant(word, c))) return null;

  const wordJamo = toJamo(word);
  let best = safe[0];
  let bestScore = editDistanceWithin(wordJamo, toJamo(best), JAMO_DISTANCE_LIMIT);
  for (let i = 1; i < safe.length; i++) {
    // 동점이면 앞엣것을 남긴다 — 사전이 준 순서가 그나마의 근거다
    const score = editDistanceWithin(wordJamo, toJamo(safe[i]), JAMO_DISTANCE_LIMIT);
    if (score < bestScore) {
      best = safe[i];
      bestScore = score;
    }
  }
  return best;
}

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
    // (이 필터가 괜찬아·조아·-잔아 같은 진짜 오타도 삼킨다는 것을 2026-09-20 감사에서 확인했다.
    //  완화하면 이름 오탐이 생기므로 필터는 두고, 그 오타들은 1층 규칙이 맡는다 —
    //  docs/SPELLCHECK_AUDIT_2026-09-20.md §2-3 F1.)
    if (/[아야]$/.test(word)) continue;
    // '보고싶어·먹고싶다'처럼 '-고 싶-'을 붙여 쓴 채팅체 — 사전엔 없지만 띄어쓰기는
    // 지적하지 않는 것이 원칙이고, 후보로는 '보고시어'가 나갔다(감사 H3).
    if (/고싶/.test(word)) continue;
    // '웅웅·응응'처럼 두 음절이 같은 감탄사 — 사전에 없고 후보는 '영웅'이 됐다(감사 H12).
    // 3연속 필터의 2음절 확장이다.
    if (word.length === 2 && word[0] === word[1]) continue;
    // 1층이 '어떻하-'를 '어떡하-'로 고친 뒤 사전이 '어떠하-'를 다시 제안하던 핑퐁 차단
    // ('어떡하면·어떡할까'가 ko.dic 에 없다).
    if (word.startsWith('어떡하')) continue;
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
 * <p>여기는 <b>오탐 제로</b>를 지키는 마지막 장치다. 2026-09-20 전수 감사
 * (docs/SPELLCHECK_AUDIT_2026-09-20.md §2-3·§3)에서 일상 어휘 1,056개 중 117개가 오탐으로
 * 화면에 떴고, 그 대부분이 아래 조건 몇 개로 사라졌다(→53). 각 조건 옆 숫자는 그 감사의
 * 실측(오탐 제거 / 정탐 손실)이다. 조건은 전부 "확신이 없으면 침묵"이다 — 틀린 고침을
 * 보여주는 것이 아무 말도 안 하는 것보다 훨씬 나쁘다.
 *
 * <ul>
 *   <li><b>2음절은 제안하지 않는다</b>(66 / 0). 거리 1 이웃이 수백 개라 어떤 어절이든 후보가
 *       하나쯤 있다 — 카톡→톡톡, 남친→남진, 죄송→죄소, 시러→시어. 2음절의 진짜 오타
 *       (됬어·갯수·궂이·뵈요)는 1층 규칙이 맡는다.
 *   <li><b>띄어쓰기 변형 후보가 하나라도 있으면 침묵</b>(53 / 14). 사전이 'X Y'로 쪼개 읽는다는
 *       건 붙여 쓴 채팅체라는 뜻이고, 채팅 띄어쓰기는 지적하지 않는다. 예전엔 나머지 후보가
 *       여럿일 때만 포기했는데, 그래서 후보가 하나뿐인 보고싶어→보고시어·잘먹었어→자먹었어·
 *       그런거→그런가가 그대로 나갔다. 잃는 14건(뭐라구·몰라써·이따바…)은 전부 채팅체 오타다.
 *       유일한 정당한 반례였던 '제작년→재작년'은 1층이 잡는다.
 *   <li><b>딱 한 글자만 다른 후보</b>만 통과시킨다. 이름·신조어는 대개 가까운 후보가 없어서
 *       여기서 조용히 걸러진다. 거리 2 허용은 정탐 9를 얻고 오탐 22를 만들어 기각했다(H5).
 *   <li><b>안전 후보가 전부 '한 음절 뺀 꼴'이면 침묵</b>(20 / 0) — 요거트→요거, 닭가슴살→가슴살,
 *       유튜브→튜브, 이따봐→이따. 사전이 미수록 어휘의 꼬리를 잘라 읽는 신호다. 반대로 전부
 *       '한 음절 덧붙인 꼴'(새콤달콤→새콤달콤함)이어도 같다(1 / 0).
 *   <li><b>4음절 이상인데 안전 후보 셋 이상이 전부 마지막 음절만 다르면 침묵</b>(2 / 0) —
 *       아메리카노→아메리카로/오/나/니…. 사전이 어간을 모르고 어미만 맞추는 신호는 긴
 *       외래어에서만 믿을 만하다(3음절까지 넓히면 갔따→갔다 같은 어미 오타 정탐 15를 잃는다).
 *   <li><b>고침이 2음절 반복어인데 원어절은 아니면 침묵</b>(5 / 0) — 카톡→톡톡, 쿠팡→팡팡,
 *       티빙→빙빙, 땡큐→땡땡. 브랜드 약칭을 의성어로 바꾸는 오답 패턴.
 *   <li><b>자모 거리 최소가 유일할 때만 반환, 동점이면 침묵.</b> 글자 단위로는 둘 다 거리 1인
 *       '귀찬아'→귀찮아/귀잖아를 자모로 내려가 가르는 건 그대로다(귀찮아는 종성 하나, 귀잖아는
 *       초성까지). 예전엔 동점이면 앞엣것을 집었는데 Hunspell 순서는 그럴듯한 순이 아니라
 *       진짜루→진짜라, 별루→벼루, 죠금→자금이 나갔다.
 * </ul>
 *
 * <p>여기서 못 잡는 것 둘은 이 함수의 한계로 문서에 남겼다: 연음(힘드러→힘들어는 자모 거리 2)과
 * 되/돼 혼동(됫어→됐어도 2) — 거리 함수에 혼동쌍 가중치를 넣는 건 별도 설계가 필요하고,
 * 그 오타들은 1층 규칙으로 앞에서 잡는 쪽을 택했다.
 */
export function pickSafeSuggestion(word: string, candidates: string[]): string | null {
  if ([...word].length <= 2) return null;
  if (candidates.some((c) => isSpacingVariant(word, c))) return null;

  const safe = candidates.filter(
    (candidate) =>
      !candidate.includes(' ') &&
      candidate !== word &&
      editDistanceWithin(word, candidate, 1) === 1,
  );
  if (safe.length === 0) return null;
  if (safe.every((c) => c.length === word.length - 1)) return null;
  if (safe.every((c) => c.length === word.length + 1 && c.startsWith(word))) return null;
  if (
    word.length >= 4 &&
    safe.length >= 3 &&
    safe.every((c) => c.length === word.length && c.slice(0, -1) === word.slice(0, -1))
  ) {
    return null;
  }

  const wordJamo = toJamo(word);
  let best = safe[0];
  let bestScore = editDistanceWithin(wordJamo, toJamo(best), JAMO_DISTANCE_LIMIT);
  let tie = false;
  for (let i = 1; i < safe.length; i++) {
    const score = editDistanceWithin(wordJamo, toJamo(safe[i]), JAMO_DISTANCE_LIMIT);
    if (score < bestScore) {
      best = safe[i];
      bestScore = score;
      tie = false;
    } else if (score === bestScore) {
      tie = true;
    }
  }
  if (tie) return null;
  if (best.length === 2 && best[0] === best[1] && word[0] !== word[1]) return null;
  return best;
}

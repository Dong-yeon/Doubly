/**
 * 한국어 맞춤법 검사 — 기기 안에서만 도는 규칙 기반 검사기.
 *
 * <p><b>왜 AI 를 안 썼나</b>: 채팅은 둘만 보는 사적인 대화다. 맞춤법을 보자고
 * 모든 문장을 외부 모델로 보내는 건 대가가 너무 크다(전송 동의도 따로 받아야 한다).
 * 게다가 입력할 때마다 왕복이 생겨 느려지고, 무료 할당량도 금방 닳는다.
 * 실제로 헷갈리는 건 되/돼, 왠/웬처럼 <b>손에 꼽는 패턴</b>이라 규칙으로 충분하다.
 *
 * <p><b>정확도 우선</b>: 애매하면 규칙을 넣지 않는다. 틀린 걸 놓치는 것보다
 * 맞는 말을 틀렸다고 하는 쪽이 훨씬 성가시다. 그래서 문맥이 있어야 판단되는
 * 것들(틀리다/다르다, -데/-대, -로서/-로써, 바래/바라)은 일부러 뺐다.
 *
 * <p>규칙표는 {@link ./koreanSpellRules} 에 있다. 이 파일은 엔진만 담당한다 —
 * 규칙을 추가할 때는 그 파일과 scripts/verify-spellcheck.mjs 를 함께 고친다.
 *
 * <p>검사 결과는 <b>제안일 뿐</b>이다. 자동으로 글을 고치지 않는다 —
 * 사용자가 눌러야 바뀐다({@link applySuggestion}).
 */
import { RULES } from './koreanSpellRules';

export interface SpellSuggestion {
  /** 원문에서의 시작 위치 */
  index: number;
  /** 잘못 쓴 부분 */
  wrong: string;
  /** 고친 말 */
  right: string;
  /** 왜 틀렸는지 한 줄 설명 */
  reason: string;
}

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 종성 목록에서 'ㄹ'의 위치 */
const JONGSEONG_RIEUL = 8;

/** 이 글자가 받침 'ㄹ'로 끝나는 한글인가 */
function endsWithRieul(ch: string): boolean {
  const code = ch.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_LAST) return false;
  return (code - HANGUL_BASE) % 28 === JONGSEONG_RIEUL;
}

/**
 * 받침 'ㄹ' 뒤에서 된소리로 적기 쉬운 어미들.
 *
 * <p>'-ㄹ게(할게)'·'-ㄹ걸(할걸)'은 된소리로 나지만 예사소리로 적고,
 * '할 거야·갈 건데'의 '거(것)'는 의존명사라 띄고 예사소리로 적는다.
 *
 * <p>겹치는 다른 뜻이 많아 하나씩 가려낸다:
 * '께'는 높임 조사(부모님들께), '꺼'는 '끄다·꺼내다'(불 꺼, 지갑 꺼내)로도 쓰인다.
 */

/** '들께' 중 '들'이 동사 어간인 경우 — 이 글자 뒤의 '들께'만 지적한다 (만들께, 거들께) */
const DEUL_VERB_HEADS = ['만', '거', '떠', '흔'];

/** '꺼' 뒤에 이 글자가 와야 '-ㄹ 거야'류로 본다 — '꺼내(다)'·'불 꺼!'와 구분 */
const KKEO_TAILS = ['야', '얌', '니', '냐', '면', '라', '지', '고', '든', '예', '에', '잖', '래'];

function findRieulSuggestions(text: string): SpellSuggestion[] {
  const found: SpellSuggestion[] = [];
  for (let i = 1; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '께' && ch !== '껄' && ch !== '꺼' && ch !== '껀') continue;
    const prev = text[i - 1];
    if (!endsWithRieul(prev)) continue;

    if (ch === '께') {
      // '딸께'는 높임 조사, '들께'는 앞이 동사 어간(만들-)일 때만 어미다
      if (prev === '딸') continue;
      if (prev === '들' && !(i >= 2 && DEUL_VERB_HEADS.includes(text[i - 2]))) continue;
      found.push({
        index: i,
        wrong: '께',
        right: '게',
        reason: "약속을 나타내는 어미는 '-ㄹ게'로 적어요 (할게, 갈게)",
      });
    } else if (ch === '껄') {
      found.push({
        index: i,
        wrong: '껄',
        right: '걸',
        reason: "아쉬움·추측을 나타내는 어미는 '-ㄹ걸'로 적어요 (할걸, 그럴걸)",
      });
    } else {
      // '꺼'/'껀' — 의존명사 '거(것)'를 소리 나는 대로 붙여 쓴 형태
      if (prev === '불') continue; // '불꺼야지'는 '불 꺼야지(끄다)'일 수 있다
      if (ch === '꺼' && !(i + 1 < text.length && KKEO_TAILS.includes(text[i + 1]))) continue;
      // 앞 글자까지 묶어 보여준다 — '꺼 →  거'처럼 앞 공백만 남으면 어색하다
      found.push({
        index: i - 1,
        wrong: prev + ch,
        right: prev + (ch === '꺼' ? ' 거' : ' 건'),
        reason: "'거(것)'는 앞말과 띄어 적어요 (할 거야, 갈 건데)",
      });
    }
  }
  return found;
}

/**
 * 위치가 겹치면 앞엣것만 남긴다 — 같은 자리를 두 번 고치라고 하면 적용 결과가 어긋난다.
 *
 * <p>규칙 엔진(1층)과 사전 검사(2층)가 같은 자리를 함께 짚을 수 있어서, 두 결과를
 * 합칠 때도 같은 규칙을 써야 한다({@link ./koreanDictionary} 참고).
 */
export function dedupeOverlapping(found: SpellSuggestion[]): SpellSuggestion[] {
  const sorted = [...found].sort((a, b) => a.index - b.index);
  const result: SpellSuggestion[] = [];
  let usedUntil = -1;
  for (const s of sorted) {
    if (s.index < usedUntil) continue;
    result.push(s);
    usedUntil = s.index + s.wrong.length;
  }
  return result;
}

/**
 * 맞춤법 제안 목록. 위치가 겹치면 앞엣것만 남긴다
 * — 같은 자리를 두 번 고치라고 하면 적용 결과가 어긋난다.
 */
export function checkKoreanSpelling(text: string): SpellSuggestion[] {
  if (!text) return [];

  const found: SpellSuggestion[] = [];
  for (const rule of RULES) {
    // 규칙 객체를 재사용하므로 g 플래그의 lastIndex 를 매번 초기화한다
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text)) !== null) {
      // m[0]에 규칙을 다시 돌리면 lookahead 가 문맥을 잃고 실패한다 —
      // 이미 얻은 캡처 그룹으로 치환문($1…)을 직접 채운다
      const groups = m;
      found.push({
        index: m.index,
        wrong: m[0],
        right: rule.to.replace(/\$(\d+)/g, (_, n) => groups[Number(n)] ?? ''),
        reason: rule.reason,
      });
      // 길이 0 매치로 무한 루프에 빠지지 않도록
      if (m.index === rule.re.lastIndex) rule.re.lastIndex++;
    }
  }
  found.push(...findRieulSuggestions(text));

  return dedupeOverlapping(found);
}

/** 제안 하나를 원문에 적용한 새 문자열 */
export function applySuggestion(text: string, suggestion: SpellSuggestion): string {
  return (
    text.slice(0, suggestion.index) +
    suggestion.right +
    text.slice(suggestion.index + suggestion.wrong.length)
  );
}

/**
 * 제안을 전부 적용한다. 앞에서부터 고치면 뒤 제안의 위치가 밀리므로
 * <b>뒤에서부터</b> 적용한다.
 */
export function applyAllSuggestions(text: string, suggestions: SpellSuggestion[]): string {
  return [...suggestions]
    .sort((a, b) => b.index - a.index)
    .reduce((acc, s) => applySuggestion(acc, s), text);
}

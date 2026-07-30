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
 * <p>검사 결과는 <b>제안일 뿐</b>이다. 자동으로 글을 고치지 않는다 —
 * 사용자가 눌러야 바뀐다({@link applySuggestion}).
 */

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

interface Rule {
  re: RegExp;
  /** 치환문 ($1 등 사용 가능) */
  to: string;
  reason: string;
}

/**
 * 되 / 돼.
 *
 * <p>'돼'는 '되어'의 준말이다. 그래서 '되어'로 바꿔 말이 되면 '돼', 안 되면 '되'다.
 * 아래는 그 규칙상 <b>항상</b> 한쪽만 맞는 형태들만 모았다.
 * '돼서·돼야·돼도'(되어서·되어야·되어도)는 맞는 말이라 건드리지 않는다.
 */
const DOEN_RULES: Rule[] = [
  { re: /않되/g, to: '안 되', reason: "'않'은 '~하지 않다'에 쓰고, 부정은 '안'이에요" },
  { re: /않돼/g, to: '안 돼', reason: "'않'은 '~하지 않다'에 쓰고, 부정은 '안'이에요" },
  { re: /됬/g, to: '됐', reason: "'됐'(되었)이 맞아요. '됬'은 없는 말이에요" },
  { re: /됀/g, to: '된', reason: "'된'이 맞아요" },
  // '안되요/안되서'는 띄어쓰기까지 함께 고쳐야 해서 아래 '되요' 규칙보다 앞에 둔다
  // (겹치는 제안은 앞에서 시작한 것만 남는다)
  { re: /안되(요|서)/g, to: '안 돼$1', reason: "'안 되어요'의 준말이라 '안 돼요'예요" },
  { re: /되요/g, to: '돼요', reason: "'되어요'의 준말이라 '돼요'예요" },
  { re: /되서/g, to: '돼서', reason: "'되어서'의 준말이라 '돼서'예요" },
  { re: /되었어/g, to: '됐어', reason: "'됐어'로 줄여 쓰는 게 자연스러워요" },
  { re: /돼고/g, to: '되고', reason: "'되어고'는 말이 안 되니 '되고'예요" },
  { re: /돼는/g, to: '되는', reason: "'되어는'은 말이 안 되니 '되는'이에요" },
  { re: /돼면/g, to: '되면', reason: "'되어면'은 말이 안 되니 '되면'이에요" },
  { re: /돼기/g, to: '되기', reason: "'되어기'는 말이 안 되니 '되기'예요" },
  { re: /돼겠/g, to: '되겠', reason: "'되어겠'은 말이 안 되니 '되겠'이에요" },
  { re: /돼다/g, to: '되다', reason: "'되어다'는 말이 안 되니 '되다'예요" },
  // 문장 끝의 '안되' — 뒤에 아무것도 없거나 문장부호로 끝나면 '안 돼'다
  { re: /안되(?=[.!?~…\s]*$)/g, to: '안 돼', reason: "'안 되어'의 준말이라 '안 돼'예요" },
];

/** 왠 / 웬 — '왠'은 '왠지' 하나뿐이고 나머지는 전부 '웬'이다 */
const WEN_RULES: Rule[] = [
  { re: /웬지/g, to: '왠지', reason: "'왜인지'의 준말이라 '왠지'예요" },
  { re: /왠일/g, to: '웬일', reason: "'왠'은 '왠지'에만 써요" },
  { re: /왠만/g, to: '웬만', reason: "'왠'은 '왠지'에만 써요" },
  { re: /왠 /g, to: '웬 ', reason: "'왠'은 '왠지'에만 써요" },
];

/** 어떻게 / 어떡해 — '어떡해'는 '어떻게 해'의 준말이라 서술어로만 쓴다 */
const EOTTEOK_RULES: Rule[] = [
  { re: /어떻해/g, to: '어떡해', reason: "'어떻게 해'의 준말이라 '어떡해'예요" },
  { re: /어떡게/g, to: '어떻게', reason: "부사로 쓸 때는 '어떻게'예요" },
];

/** 자주 틀리는 낱말 — 한쪽이 아예 없는 말인 것만 */
const WORD_RULES: Rule[] = [
  { re: /몇일/g, to: '며칠', reason: "'몇일'은 없는 말이에요" },
  { re: /오랫만/g, to: '오랜만', reason: "'오래간만'의 준말이라 '오랜만'이에요" },
  { re: /금새/g, to: '금세', reason: "'금시에'의 준말이라 '금세'예요" },
  { re: /역활/g, to: '역할', reason: "'역할(役割)'이 맞아요" },
  { re: /설겆이/g, to: '설거지', reason: "'설거지'가 맞아요" },
  { re: /희안/g, to: '희한', reason: "'희한(稀罕)하다'가 맞아요" },
  { re: /구지/g, to: '굳이', reason: "'굳이'가 맞아요" },
  { re: /어의없/g, to: '어이없', reason: "'어이없다'가 맞아요" },
  { re: /제작년/g, to: '재작년', reason: "'재작년(再昨年)'이 맞아요" },
  { re: /내노라/g, to: '내로라', reason: "'내로라하다'가 맞아요" },
  { re: /읍니다/g, to: '습니다', reason: "'-읍니다'는 1988년에 '-습니다'로 바뀌었어요" },
  { re: /깨끗히/g, to: '깨끗이', reason: "'깨끗이'가 맞아요" },
  { re: /틈틈히/g, to: '틈틈이', reason: "'틈틈이'가 맞아요" },
  { re: /번번히/g, to: '번번이', reason: "'번번이'가 맞아요" },
  { re: /곰곰히/g, to: '곰곰이', reason: "'곰곰이'가 맞아요" },
  { re: /일일히/g, to: '일일이', reason: "'일일이'가 맞아요" },
];

const RULES: Rule[] = [...DOEN_RULES, ...WEN_RULES, ...EOTTEOK_RULES, ...WORD_RULES];

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
 * 'ㄹ께' → 'ㄹ게'.
 *
 * <p>약속·의지를 나타내는 어미는 소리와 달리 '-ㄹ게'로 적는다(할게, 갈게, 볼게).
 * 다만 '께'는 높임 조사이기도 해서(선생님께) 앞 글자가 받침 'ㄹ'일 때만 본다.
 * 그마저도 '아들께·딸께'처럼 사람을 가리키는 말은 제외한다.
 */
const KKE_EXCEPTIONS = ['아들', '딸', '그들', '이들', '저들', '사람들', '분들'];

function findKkeSuggestions(text: string): SpellSuggestion[] {
  const found: SpellSuggestion[] = [];
  for (let i = 1; i < text.length; i++) {
    if (text[i] !== '께') continue;
    if (!endsWithRieul(text[i - 1])) continue;
    // 높임 조사로 쓰인 경우는 건너뛴다
    const before = text.slice(Math.max(0, i - 3), i);
    if (KKE_EXCEPTIONS.some((word) => before.endsWith(word))) continue;
    found.push({
      index: i,
      wrong: '께',
      right: '게',
      reason: "약속을 나타내는 어미는 '-ㄹ게'로 적어요 (할게, 갈게)",
    });
  }
  return found;
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
      found.push({
        index: m.index,
        wrong: m[0],
        right: m[0].replace(new RegExp(rule.re.source), rule.to),
        reason: rule.reason,
      });
      // 길이 0 매치로 무한 루프에 빠지지 않도록
      if (m.index === rule.re.lastIndex) rule.re.lastIndex++;
    }
  }
  found.push(...findKkeSuggestions(text));

  found.sort((a, b) => a.index - b.index);
  const result: SpellSuggestion[] = [];
  let usedUntil = -1;
  for (const s of found) {
    if (s.index < usedUntil) continue;
    result.push(s);
    usedUntil = s.index + s.wrong.length;
  }
  return result;
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

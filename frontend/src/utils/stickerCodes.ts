/**
 * 스티커 텍스트 코드·키워드 추천 — 순수 함수. 카탈로그를 <b>주입</b>받는다
 * (`constants/stickerImages.ts` 는 `require()` 가 있어 Node 검증 스크립트가 못 읽는다).
 *
 * <p>두 가지를 한다.
 * <ol>
 *   <li><b>코드 → 스티커</b>: 입력 전체가 {@code (캐릭터_라벨)} 이면(예: {@code (더비_좋아)},
 *       {@code (곰돌이_사랑해)}) 그 스티커로 보낸다. 카톡 옛 텍스티콘 관습이라 괄호를 요구한다 —
 *       괄호 없이 "좋아"를 스티커로 바꾸면 그냥 말한 "좋아"가 그림이 된다.</li>
 *   <li><b>키워드 → 추천</b>: 짧은 입력("사랑해", "ㅠㅠ", "잘자")에 맞는 스티커를 입력창 위에
 *       띄운다. 카톡의 "키워드 이모티콘"과 같은 방식 — 카톡도 글자를 그림으로 <b>바꾸지는
 *       않고</b> 추천을 띄워 탭하게 한다. 자동 치환은 일부러 그렇게 쓴 말까지 건드린다
 *       (SpellCheckBar 가 고쳐주지 않고 물어보는 것과 같은 이유).</li>
 * </ol>
 */

export interface StickerCodeEntry {
  /** 서버 enum 이름 — STICKER 메시지의 content */
  code: string;
  label: string;
  character: string;
  /** 사용자가 치는 코드: (캐릭터_라벨). 공백·문장부호는 뺀다 */
  text: string;
}

export interface StickerCodeIndex {
  entries: StickerCodeEntry[];
}

interface CatalogCharacter {
  label: string;
  stickers: { code: string; label: string }[];
}

/** 비교용 정규화 — 공백·문장부호를 빼고 소문자로. "흥, 간다" → "흥간다", "어질~" → "어질" */
export function normalizeKey(s: string): string {
  return s.replace(/[\s,.?!~·・'"“”‘’]/g, '').toLowerCase();
}

export function buildStickerCodeIndex(characters: CatalogCharacter[]): StickerCodeIndex {
  const entries: StickerCodeEntry[] = [];
  for (const c of characters) {
    for (const s of c.stickers) {
      entries.push({
        code: s.code,
        label: s.label,
        character: c.label,
        text: `(${normalizeKey(c.label)}_${normalizeKey(s.label)})`,
      });
    }
  }
  return { entries };
}

/** 입력 전체가 코드인가 — 앞뒤 공백과 전각 괄호는 봐준다 */
export function parseStickerCode(index: StickerCodeIndex, text: string): StickerCodeEntry | null {
  const t = text.trim().replace(/^（/, '(').replace(/）$/, ')');
  if (!t.startsWith('(') || !t.endsWith(')') || !t.includes('_')) return null;
  const key = normalizeKey(t);
  return index.entries.find((e) => e.text === key) ?? null;
}

/**
 * 키워드 → 스티커 코드. 라벨과 다른 말로 치는 것들만 적는다(라벨 자체는 아래 포함 검색이 잡는다).
 * 카톡처럼 "ㅋㅋ"·"ㅠㅠ" 도 받는다.
 *
 * <p><b>가리키는 코드는 피커에 있는 것이어야 한다</b>(`STICKER_CHARACTERS` — 달걀이 `EGG_*`,
 * 구운이♥달걀이 `DUO_*`). 2026-09-21 에 곰돌이·더비·블리를 내린 뒤에도 이 표가 내린 코드만
 * 가리키고 있어서 키워드 추천이 일주일 넘게 통째로 죽어 있었다 — 크래시가 아니라 조용히 안
 * 뜨는 고장이다. `npm run verify:sticker-codes` 가 모든 코드의 존재를 확인한다.
 *
 * <p>한 묶음에 최대 4개, 솔로(EGG)와 짝(DUO)을 섞는다. 움직이는 이모티콘(`ANIM_*`,
 * animatedStickers.ts)도 같은 표에 섞는다 — 막대에서는 캐릭터 스티커 뒤에 선다. 맞는 그림이 없는
 * 말은 넣지 않는다 — 엉뚱한 그림을 권하면 추천 막대 전체를 안 믿게 된다.
 */
export const STICKER_KEYWORDS: [string[], string[]][] = [
  [['사랑', '사랑해', '사랑해요', '럽', '러브', '하트', '♥', '❤', '❤️', '좋아해'], ['EGG_LOVE', 'DUO_LOVE', 'DUO_HEART_EYES', 'ANIM_TWO_HEARTS']],
  [['뽀뽀', '쪽', '쪽쪽', '키스', '츄', '뽀뽀해줘'], ['EGG_KISS', 'DUO_KISS', 'ANIM_KISS', 'ANIM_LIPS']],
  [['보고싶어', '보고싶다', '보고파', '보고싶당', '그리워'], ['DUO_LOVE', 'EGG_GLOOMY', 'ANIM_PLEADING', 'ANIM_HUG']],
  [['예뻐', '이뻐', '예쁘다', '귀여워', '멋져', '잘생겼어', '반했어', '설레'], ['DUO_HEART_EYES', 'EGG_ANGEL', 'ANIM_HEART_EYES', 'ANIM_STAR_STRUCK']],
  [['잘자', '잘자요', '굿나잇', '굿밤', '자자', '잘게', '잘께', '꿀잠', '졸려', '졸리다', '졸림', '하품', '잠와'], ['DUO_SLEEP', 'EGG_SLEEPY', 'ANIM_SLEEPING', 'ANIM_YAWN']],
  [['굿모닝', '좋은아침', '일어났어', '기상', '모닝'], ['EGG_HAPPY', 'ANIM_SUN', 'ANIM_COFFEE']],
  [['배고파', '배고프다', '배고픔', '먹고싶어', '맛있겠다', '맛있어', '존맛', '냠냠'], ['EGG_DROOL', 'DUO_DROOL', 'ANIM_DROOL', 'ANIM_RAMEN']],
  [['미안', '미안해', '미안해요', '죄송', '쏘리', '잘못했어'], ['EGG_SWEAT', 'EGG_AWKWARD', 'ANIM_PLEADING', 'ANIM_PRAY']],
  [['고마워', '고마워요', '고맙다', '감사', '감사해', '땡큐'], ['EGG_ANGEL', 'ANIM_PRAY', 'ANIM_HAND_HEART']],
  [['화나', '화났어', '화남', '빡쳐', '빡', '열받아', '열받네'], ['EGG_ANGRY', 'DUO_HEATED', 'EGG_FURIOUS', 'ANIM_RAGE']],
  [['짜증', '짜증나', '에휴', '한숨'], ['EGG_EYE_ROLL', 'EGG_GRUMPY', 'DUO_GLARE', 'ANIM_EYE_ROLL']],
  [['싸우자', '싸움', '싸웠어', '덤벼'], ['DUO_FIGHT', 'DUO_GLARE', 'ANIM_HUFF']],
  [['삐짐', '삐졌어', '흥', '칫', '몰라'], ['EGG_SULKY', 'DUO_SULKY', 'EGG_GRUMPY', 'ANIM_HUFF']],
  [['ㅋㅋ', 'ㅎㅎ', '하하', '웃겨', '개웃겨'], ['DUO_HAPPY', 'EGG_HAPPY', 'ANIM_JOY', 'ANIM_ZANY']],
  [['ㅠㅠ', 'ㅜㅜ', '슬퍼', '슬프다', '울어', '흑흑', '엉엉', '속상해', '속상하다'], ['DUO_CRY', 'DUO_SAD', 'EGG_GLOOMY', 'ANIM_SOB']],
  [['우울', '우울해', '시무룩', '꿀꿀', '기분별로'], ['EGG_GLOOMY', 'DUO_GLOOMY', 'ANIM_PENSIVE']],
  [['피곤', '피곤해', '피곤하다', '지쳤어', '지침', '힘들어', '힘들다', '방전', '어지러', '어지러워', '어질', '멀미'], ['EGG_MELTING', 'DUO_DIZZY', 'ANIM_TIRED', 'ANIM_WEARY']],
  [['퇴근', '퇴근했어', '칼퇴', '집가자', '집가는중'], ['EGG_RELAXED', 'DUO_HAPPY', 'ANIM_RAISED_HANDS']],
  [['출근', '출근했어', '출근중', '일하는중'], ['EGG_EYE_ROLL', 'EGG_SALUTE', 'ANIM_WEARY']],
  [['축하', '축하해', '축하해요', '생일축하', 'ㅊㅋ', 'ㅊㅋㅊㅋ', '짝짝'], ['DUO_HAPPY', 'EGG_PROUD', 'ANIM_PARTY_POPPER', 'ANIM_BIRTHDAY_CAKE']],
  [['신나', '신난다', '야호', '오예', '개좋아', '최고'], ['DUO_HAPPY', 'EGG_HAPPY', 'ANIM_PARTY_FACE']],
  [['좋아', '조아', '굿', '좋다', '행복해', '편하다'], ['EGG_HAPPY', 'EGG_RELAXED', 'DUO_RELAXED', 'ANIM_SMILE']],
  [['헐', '대박', '미쳤다', '뭐야', '깜짝'], ['EGG_SHOCKED', 'DUO_SHOCKED', 'ANIM_OOPS']],
  [['응', '웅', '네', '넹', '알겠어', '오케이', 'ㅇㅋ', 'ㅇㅇ', '콜'], ['EGG_SALUTE', 'ANIM_SALUTE', 'ANIM_THUMBS_UP']],
  [['더워', '덥다', '더워요', '덥네', '폭염', '녹겠다'], ['EGG_HOT', 'EGG_MELTING', 'ANIM_SUN', 'ANIM_MELTING']],
  [['추워', '춥다', '추워요', '춥네', '얼겠다', '꽁꽁'], ['EGG_FROZEN', 'DUO_FROZEN', 'ANIM_SNOWFLAKE']],
  [['그렇구나', '알았다', '오호', '생각났다'], ['EGG_IDEA', 'DUO_IDEA']],
  [['난감해', '어떡해', '어떡하지', '곤란', '당황'], ['EGG_AWKWARD', 'EGG_SWEAT', 'ANIM_SWEAT', 'ANIM_ANXIOUS']],
  [['뿌듯해', '해냈다', '잘했지', '칭찬해줘'], ['EGG_PROUD', 'ANIM_TROPHY', 'ANIM_MUSCLE']],
  [['안아줘', '안아주세요', '허그', '포옹'], ['DUO_LOVE', 'ANIM_HUG']],
];

/** 이보다 길면 문장이다 — 입력 <b>전체</b>로 맞추는 추천(라벨·키워드·부분 일치)은 여기까지 */
const MAX_TRIGGER_LENGTH = 10;
/** 이보다 길면 문단이다 — 마지막 어절 추천도 끈다 */
const MAX_INPUT_LENGTH = 40;
export const MAX_SUGGESTIONS = 6;
/** 캐릭터 스티커와 움직이는 이모티콘이 둘 다 있을 때 캐릭터 스티커가 차지하는 최대 칸 */
const MAX_IMAGE_SLOTS_WHEN_MIXED = 4;

/** 추천 막대의 한 칸 — 캐릭터 스티커(이미지)와 움직이는 이모티콘이 같은 막대에 선다 */
export interface StickerSuggestion {
  kind: 'image' | 'animated';
  code: string;
  label: string;
  /** 무엇이 이 추천을 불렀나(라벨·키워드·코드 접두) — 계측용. 사용자 입력 원문은 담지 않는다 */
  matched: string;
}

export interface SuggestOptions {
  /** 움직이는 이모티콘 카탈로그 — 없으면 캐릭터 스티커만 */
  animated?: { code: string; label: string }[];
  /** 최근 내가 보낸 스티커 코드(최신이 앞) — 같은 순위 안에서 앞으로 당긴다 */
  recent?: string[];
  /** false 면 뺀다 — 잠긴 팩. 눌렀는데 결제창이 뜨면 추천이 광고가 된다 */
  isAllowed?: (kind: StickerSuggestion['kind'], code: string) => boolean;
  limit?: number;
}

/**
 * 반복 자모·물결을 줄인다 — "ㅋㅋㅋㅋㅋ" → "ㅋㅋ", "ㅠㅠㅠ" → "ㅠㅠ", "사랑해~~" → "사랑해".
 * 같은 자모가 셋 이상 이어지면 둘로 줄인다(하나로 줄이면 "ㅋ" 한 글자가 되어 키워드와 안 맞는다).
 */
export function collapseRepeats(s: string): string {
  return s.replace(/([ㄱ-ㅎㅏ-ㅣ])\1{2,}/g, '$1$1');
}

/** 비교 키 — 반복 자모를 줄이고 공백·문장부호를 뺀다 */
function keyOf(s: string): string {
  return normalizeKey(collapseRepeats(s));
}

/** 끝에 붙은 자모 덩어리를 뗀다 — "피곤해ㅠㅠ" → "피곤해" */
function stripTrailingJamo(s: string): string {
  return s.replace(/[ㄱ-ㅎㅏ-ㅣ]+$/, '');
}

/*
 * 순위 — 작을수록 앞. 같은 순위 안에서는 최근 보낸 것이 앞이고, 그다음은 표에 적힌 순서다.
 * 캐릭터 스티커가 움직이는 이모티콘보다 늘 앞이다(순위보다 종류가 먼저).
 */
const RANK_LABEL_EXACT = 0;
const RANK_KEYWORD_EXACT = 1;
const RANK_LAST_WORD_LABEL = 2;
const RANK_LAST_WORD_KEYWORD = 3;
const RANK_PARTIAL = 4;

interface Candidate extends StickerSuggestion {
  rank: number;
  order: number;
}

/**
 * 입력에 맞는 스티커 — 없으면 빈 배열.
 *
 * <ol>
 *   <li>코드를 치는 중("(달걀이" · "(달걀이_사")이면 그 캐릭터의 캐릭터 스티커만.</li>
 *   <li>입력 전체가 짧으면(≤ {@link MAX_TRIGGER_LENGTH}) 라벨 정확 → 키워드 정확 → 부분 일치.</li>
 *   <li>입력의 <b>마지막 어절</b>이 라벨·키워드와 같거나 그것으로 끝나면 — "나도 사랑해" → 사랑해,
 *       "오늘 피곤해ㅠㅠ" → ㅠㅠ·피곤. 끝에 붙은 자모를 떼고도 한 번 더 본다. 전체 길이 상한은
 *       적용하지 않고, 대신 {@link MAX_INPUT_LENGTH} 를 넘으면 끈다.</li>
 * </ol>
 *
 * <p>"끝나면" 비교는 두 글자 이상 키워드만 한다 — "응원해"가 "응"으로, "네가"가 "네"로 걸리면 안 된다.
 */
export function suggestStickers(index: StickerCodeIndex, text: string, options: SuggestOptions = {}): StickerSuggestion[] {
  const { animated = [], recent = [], isAllowed = () => true, limit = MAX_SUGGESTIONS } = options;
  const raw = text.trim();
  if (!raw || raw.length > MAX_INPUT_LENGTH) return [];
  const key = keyOf(raw);
  if (!key) return [];

  // "(달걀이" · "(달걀이_" · "(달걀이_사" — 코드를 치는 중이면 그 캐릭터를 보여준다
  if (key.startsWith('(')) {
    if (key.length > MAX_TRIGGER_LENGTH + 2) return [];
    const inner = key.slice(1).replace(/\)$/, '');
    const [character, partial = ''] = inner.split('_');
    if (!character) return [];
    const out: StickerSuggestion[] = [];
    for (const e of index.entries) {
      if (out.length >= limit) break;
      if (!isAllowed('image', e.code)) continue;
      if (normalizeKey(e.character).startsWith(character) && normalizeKey(e.label).startsWith(partial)) {
        out.push({ kind: 'image', code: e.code, label: e.label, matched: `(${normalizeKey(e.character)}` });
      }
    }
    return out;
  }

  const imageByCode = new Map(index.entries.map((e) => [e.code, e]));
  const animatedByCode = new Map(animated.map((a) => [a.code, a]));
  const labelled: { kind: StickerSuggestion['kind']; code: string; label: string }[] = [
    ...index.entries.map((e) => ({ kind: 'image' as const, code: e.code, label: e.label })),
    ...animated.map((a) => ({ kind: 'animated' as const, code: a.code, label: a.label })),
  ];

  const found = new Map<string, Candidate>();
  let order = 0;
  const add = (code: string, rank: number, matched: string) => {
    const image = imageByCode.get(code);
    const anim = image ? undefined : animatedByCode.get(code);
    const kind = image ? 'image' : anim ? 'animated' : null;
    if (!kind || !isAllowed(kind, code)) return;
    const prev = found.get(code);
    if (prev && prev.rank <= rank) return;
    found.set(code, { kind, code, label: (image ?? anim)!.label, matched, rank, order: prev?.order ?? order++ });
  };
  const eachKeyword = (fn: (word: string, codes: string[]) => void) => {
    for (const [words, codes] of STICKER_KEYWORDS) for (const w of words) fn(keyOf(w), codes);
  };

  // 입력 전체가 짧을 때 — 라벨·키워드 정확 일치, 그리고 부분 일치
  if (key.length <= MAX_TRIGGER_LENGTH) {
    for (const l of labelled) if (keyOf(l.label) === key) add(l.code, RANK_LABEL_EXACT, l.label);
    eachKeyword((w, codes) => {
      if (w === key) codes.forEach((c) => add(c, RANK_KEYWORD_EXACT, w));
    });
    // 두 글자부터 — 한 글자("좋")로는 너무 많이 잡힌다
    if (key.length >= 2) {
      for (const l of labelled) if (keyOf(l.label).includes(key)) add(l.code, RANK_PARTIAL, l.label);
      eachKeyword((w, codes) => {
        if (w.startsWith(key) || (w.length >= 2 && key.startsWith(w))) codes.forEach((c) => add(c, RANK_PARTIAL, w));
      });
    }
  }

  // 마지막 어절 — "나도 사랑해", "오늘 피곤해ㅠㅠ"
  const lastWord = keyOf(raw.split(/\s+/).pop() ?? '');
  const lastCore = stripTrailingJamo(lastWord);
  const tails = lastCore && lastCore !== lastWord ? [lastWord, lastCore] : [lastWord];
  const hits = (w: string) => tails.some((t) => t === w || (w.length >= 2 && t.endsWith(w)));
  if (lastWord) {
    for (const l of labelled) {
      const lk = keyOf(l.label);
      if (lk && hits(lk)) add(l.code, RANK_LAST_WORD_LABEL, l.label);
    }
    eachKeyword((w, codes) => {
      if (w && hits(w)) codes.forEach((c) => add(c, RANK_LAST_WORD_KEYWORD, w));
    });
  }

  const recency = (code: string) => {
    const i = recent.indexOf(code);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const sorted = [...found.values()].sort(
    (a, b) => a.rank - b.rank || recency(a.code) - recency(b.code) || a.order - b.order,
  );
  const images = sorted.filter((c) => c.kind === 'image');
  const anims = sorted.filter((c) => c.kind === 'animated');
  // 둘 다 있으면 움직이는 이모티콘에도 자리를 남긴다 — 캐릭터 스티커가 늘 여섯 칸을 다 채우면 안 보인다
  const imageSlots = anims.length > 0 ? Math.min(images.length, MAX_IMAGE_SLOTS_WHEN_MIXED, limit) : Math.min(images.length, limit);
  const picked = [...images.slice(0, imageSlots), ...anims.slice(0, limit - imageSlots)];
  return picked.map(({ kind, code, label, matched }) => ({ kind, code, label, matched }));
}

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
 * <p>한 묶음에 최대 4개, 솔로(EGG)와 짝(DUO)을 섞는다. 맞는 그림이 없는 말은 넣지 않는다 —
 * 엉뚱한 그림을 권하면 추천 막대 전체를 안 믿게 된다.
 */
export const STICKER_KEYWORDS: [string[], string[]][] = [
  [['사랑', '사랑해', '사랑해요', '럽', '러브', '하트', '♥', '❤', '❤️', '좋아해'], ['EGG_LOVE', 'DUO_LOVE', 'DUO_HEART_EYES']],
  [['뽀뽀', '쪽', '쪽쪽', '키스', '츄', '뽀뽀해줘'], ['EGG_KISS', 'DUO_KISS']],
  [['보고싶어', '보고싶다', '보고파', '보고싶당', '그리워'], ['DUO_LOVE', 'EGG_GLOOMY']],
  [['예뻐', '이뻐', '예쁘다', '귀여워', '멋져', '잘생겼어', '반했어', '설레'], ['DUO_HEART_EYES', 'EGG_ANGEL']],
  [['잘자', '잘자요', '굿나잇', '굿밤', '자자', '잘게', '잘께', '꿀잠'], ['DUO_SLEEP', 'EGG_SLEEPY']],
  [['졸려', '졸리다', '졸림', '하품', '잠와'], ['EGG_SLEEPY', 'DUO_SLEEP']],
  [['굿모닝', '좋은아침', '일어났어', '기상', '모닝'], ['EGG_HAPPY']],
  [['배고파', '배고프다', '배고픔', '먹고싶어', '맛있겠다', '맛있어', '존맛', '냠냠'], ['EGG_DROOL', 'DUO_DROOL']],
  [['미안', '미안해', '미안해요', '죄송', '쏘리', '잘못했어'], ['EGG_SWEAT', 'EGG_AWKWARD']],
  [['고마워', '고마워요', '고맙다', '감사', '감사해', '땡큐'], ['EGG_ANGEL']],
  [['화나', '화났어', '화남', '빡쳐', '빡', '열받아', '열받네'], ['EGG_ANGRY', 'DUO_HEATED', 'EGG_FURIOUS']],
  [['짜증', '짜증나', '에휴', '한숨'], ['EGG_EYE_ROLL', 'EGG_GRUMPY', 'DUO_GLARE']],
  [['싸우자', '싸움', '싸웠어', '덤벼'], ['DUO_FIGHT', 'DUO_GLARE']],
  [['삐짐', '삐졌어', '흥', '칫', '몰라'], ['EGG_SULKY', 'DUO_SULKY', 'EGG_GRUMPY']],
  [['ㅋㅋ', 'ㅎㅎ', '하하', '웃겨', '개웃겨'], ['DUO_HAPPY', 'EGG_HAPPY']],
  [['ㅠㅠ', 'ㅜㅜ', '슬퍼', '슬프다', '울어', '흑흑', '엉엉', '속상해', '속상하다'], ['DUO_CRY', 'DUO_SAD', 'EGG_GLOOMY']],
  [['우울', '우울해', '시무룩', '꿀꿀', '기분별로'], ['EGG_GLOOMY', 'DUO_GLOOMY']],
  [['피곤', '피곤해', '피곤하다', '지쳤어', '지침', '힘들어', '힘들다', '방전'], ['EGG_MELTING', 'DUO_DIZZY']],
  [['퇴근', '퇴근했어', '칼퇴', '집가자', '집가는중'], ['EGG_RELAXED', 'DUO_HAPPY']],
  [['출근', '출근했어', '출근중', '일하는중'], ['EGG_EYE_ROLL', 'EGG_SALUTE']],
  [['축하', '축하해', '축하해요', '생일축하', 'ㅊㅋ', 'ㅊㅋㅊㅋ', '짝짝'], ['DUO_HAPPY', 'EGG_PROUD']],
  [['신나', '신난다', '야호', '오예', '개좋아', '최고'], ['DUO_HAPPY', 'EGG_HAPPY']],
  [['좋아', '조아', '굿', '좋다', '행복해', '편하다'], ['EGG_HAPPY', 'EGG_RELAXED', 'DUO_RELAXED']],
  [['헐', '대박', '미쳤다', '뭐야', '깜짝'], ['EGG_SHOCKED', 'DUO_SHOCKED']],
  [['응', '웅', '네', '넹', '알겠어', '오케이', 'ㅇㅋ', 'ㅇㅇ', '콜'], ['EGG_SALUTE']],
  [['더워', '덥다', '더워요', '덥네', '폭염', '녹겠다'], ['EGG_HOT', 'EGG_MELTING']],
  [['추워', '춥다', '추워요', '춥네', '얼겠다', '꽁꽁'], ['EGG_FROZEN', 'DUO_FROZEN']],
  [['그렇구나', '알았다', '오호', '생각났다'], ['EGG_IDEA', 'DUO_IDEA']],
  [['난감해', '어떡해', '어떡하지', '곤란', '당황'], ['EGG_AWKWARD', 'EGG_SWEAT']],
  [['뿌듯해', '해냈다', '잘했지', '칭찬해줘'], ['EGG_PROUD']],
  [['어지러', '어지러워', '어질', '멀미'], ['DUO_DIZZY']],
  [['윙크', '찡긋'], ['DUO_WINK']],
];

/** 이보다 길면 문장이다 — 추천을 띄우지 않는다 */
const MAX_TRIGGER_LENGTH = 10;
export const MAX_SUGGESTIONS = 6;

/**
 * 짧은 입력에 맞는 스티커 — 없으면 빈 배열.
 * 순서: 코드 입력 중("(더비" 처럼)이면 그 캐릭터 전부 → 라벨 정확히 일치 → 키워드 → 라벨 포함.
 */
export function suggestStickers(index: StickerCodeIndex, text: string, limit = MAX_SUGGESTIONS): StickerCodeEntry[] {
  const raw = text.trim();
  if (!raw) return [];
  const key = normalizeKey(raw);
  if (!key || key.length > MAX_TRIGGER_LENGTH + 2) return [];

  const picked: StickerCodeEntry[] = [];
  const push = (e: StickerCodeEntry | undefined) => {
    if (e && !picked.includes(e) && picked.length < limit) picked.push(e);
  };
  const byCode = (code: string) => index.entries.find((e) => e.code === code);

  // "(더비" · "(더비_" · "(더비_좋" — 코드를 치는 중이면 그 캐릭터를 보여준다
  if (key.startsWith('(')) {
    const inner = key.slice(1).replace(/\)$/, '');
    const [character, partial = ''] = inner.split('_');
    if (!character) return [];
    for (const e of index.entries) {
      if (normalizeKey(e.character).startsWith(character) && normalizeKey(e.label).startsWith(partial)) push(e);
    }
    return picked;
  }

  if (key.length > MAX_TRIGGER_LENGTH) return [];
  for (const e of index.entries) if (normalizeKey(e.label) === key) push(e);
  for (const [words, codes] of STICKER_KEYWORDS) {
    if (words.some((w) => normalizeKey(w) === key)) codes.forEach((c) => push(byCode(c)));
  }
  // 두 글자부터 포함 검색 — 한 글자("좋")로는 너무 많이 잡힌다
  if (key.length >= 2) {
    for (const e of index.entries) if (normalizeKey(e.label).includes(key)) push(e);
    for (const [words, codes] of STICKER_KEYWORDS) {
      if (words.some((w) => normalizeKey(w).startsWith(key) || key.startsWith(normalizeKey(w)))) {
        codes.forEach((c) => push(byCode(c)));
      }
    }
  }
  return picked;
}

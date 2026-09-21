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
 * 카톡처럼 "ㅋㅋ"·"ㅠㅠ" 도 받는다 — 짧은 입력에만 뜨므로 문장 중간의 ㅋㅋ 는 건드리지 않는다.
 */
const KEYWORDS: [string[], string[]][] = [
  [['사랑', '사랑해', '럽', '하트', '♥', '❤'], ['LOVE_BEAR', 'BLI_LOVE', 'BLI_KISS']],
  [['뽀뽀', '쪽', '키스', '츄'], ['BLI_KISS', 'LOVE_BEAR']],
  [['좋아', '조아', '굿', '최고'], ['DUBI_LIKE', 'BLI_LOVE', 'BLI_BEAM']],
  [['ㅋㅋ', 'ㅋㅋㅋ', '하하', '웃겨', 'ㅎㅎ'], ['DUBI_LAUGH', 'BEAR_LAUGH', 'DUBI_HEHE']],
  [['ㅠㅠ', 'ㅜㅜ', '슬퍼', '슬프', '울어', '흑흑'], ['BLI_CRYING', 'BEAR_CRYING', 'BLI_GLOOMY']],
  [['잘자', '굿나잇', '자자', '잘게', '졸려', '굿밤'], ['BLI_SLEEPY', 'BEAR_SLEEPY']],
  [['미안', '미안해', '죄송', '쏘리'], ['BEAR_SORRY', 'BLI_SULKY']],
  [['화나', '화났', '화남', '빡'], ['DUBI_ANGRY', 'BEAR_ANGRY', 'DUBI_GRUMPY']],
  [['짜증', '싫어', '흥'], ['DUBI_GRUMPY', 'BLI_GRUMPY', 'DUBI_DASH']],
  [['피곤', '지쳤', '지침', '힘들'], ['BEAR_TIRED', 'DUBI_GLOOMY', 'BLI_GLOOMY']],
  [['퇴근', '집가자', '끝'], ['DUBI_OFFWORK', 'DUBI_DANCE']],
  [['신나', '신났', '야호', '오예'], ['DUBI_EXCITED', 'BEAR_EXCITED', 'DUBI_DANCE']],
  [['선물', '깜짝'], ['DUBI_GIFT']],
  [['예뻐', '이뻐', '예쁘', '꾸몄'], ['BLI_RIBBON', 'BLI_MAKEUP', 'BLI_FLOWER']],
  [['부끄', '부끄러워', '수줍'], ['BEAR_SHY', 'BLI_BEAM']],
  [['어지러', '어질', '멀미', '헉'], ['DUBI_DIZZY', 'BLI_OH']],
  [['시무룩', '우울', '축'], ['DUBI_SULKY', 'BLI_SULKY', 'BEAR_SULKY']],
  [['윙크', '찡긋'], ['DUBI_WINK', 'BLI_WINK']],
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
  for (const [words, codes] of KEYWORDS) {
    if (words.some((w) => normalizeKey(w) === key)) codes.forEach((c) => push(byCode(c)));
  }
  // 두 글자부터 포함 검색 — 한 글자("좋")로는 너무 많이 잡힌다
  if (key.length >= 2) {
    for (const e of index.entries) if (normalizeKey(e.label).includes(key)) push(e);
    for (const [words, codes] of KEYWORDS) {
      if (words.some((w) => normalizeKey(w).startsWith(key) || key.startsWith(normalizeKey(w)))) {
        codes.forEach((c) => push(byCode(c)));
      }
    }
  }
  return picked;
}

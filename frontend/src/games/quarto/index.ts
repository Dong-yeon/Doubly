/**
 * 넷이 같아 — 판정 <b>미리보기</b>. 판정의 주인은 서버다(backend QuartoRules).
 *
 * 앱이 이걸로 하는 일은 둘뿐이다 — 확정 전에 "놓으면 이기는가"를 알아 [놓고 승리] 버튼을 띄우는 것,
 * 끝난 판에서 이긴 줄의 공통 속성을 글로 적는 것. 서버와 같은 케이스를 scripts/verify-quarto.mjs 가 돌린다.
 *
 * 말 하나 = 4비트 정수 0~15. bit0 색(0 첫째 / 1 둘째), bit1 모양(0 둥근 / 1 네모),
 * bit2 크기(0 큰 / 1 작은), bit3 속(0 꽉 찬 / 1 구멍 난). 칸 번호는 row * 4 + col.
 *
 * import 가 없는 순수 모듈로 둔다 — 검증 스크립트가 Node 에서 바로 읽는다.
 */

export const SIZE = 4;
export const CELLS = SIZE * SIZE;
export const PIECES = 16;
export const EMPTY = -1;

/** 이길 수 있는 줄 10개 — 가로 4, 세로 4, 대각선 2. 2×2 정사각형 변형은 넣지 않는다 */
export const LINES: readonly (readonly number[])[] = [
  [0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15],
  [0, 4, 8, 12], [1, 5, 9, 13], [2, 6, 10, 14], [3, 7, 11, 15],
  [0, 5, 10, 15], [3, 6, 9, 12],
];

export const BIT_COLOR = 1;
export const BIT_SHAPE = 2;
export const BIT_SIZE = 4;
export const BIT_HOLLOW = 8;

/** 말 넷이 속성 하나 이상을 같이 갖는가 — 서버와 같은 식 */
export function sharesTrait(a: number, b: number, c: number, d: number): boolean {
  return (a & b & c & d) !== 0 || ((~a & ~b & ~c & ~d) & 0xf) !== 0;
}

/** cell 을 지나는 줄 중 넷이 다 차고 공통 속성이 있는 첫 줄 — 없으면 null. 서버와 같은 순서로 찾는다 */
export function winningLineThrough(board: readonly number[], cell: number): number[] | null {
  for (const line of LINES) {
    if (!line.includes(cell)) continue;
    const [a, b, c, d] = line.map((i) => board[i]);
    if (a === EMPTY || b === EMPTY || c === EMPTY || d === EMPTY) continue;
    if (sharesTrait(a, b, c, d)) return [...line];
  }
  return null;
}

/** 아직 아무도 쓰지 않은 말 — 판에도 없고 받은 말도 아닌 것, 번호 순 */
export function remainingPieces(board: readonly number[], pending: number | null): number[] {
  const used = new Set<number>(board.filter((p) => p !== EMPTY));
  if (pending != null) used.add(pending);
  const out: number[] = [];
  for (let p = 0; p < PIECES; p += 1) if (!used.has(p)) out.push(p);
  return out;
}

export interface PlacePreview {
  board: number[];
  /** 이 수로 이기면 그 줄 — 그때는 줄 말이 없다(give 를 보내면 서버가 거절한다) */
  winLine: number[] | null;
  /** 놓은 뒤 남은 말 — 하나뿐이면 서버가 알아서 준다, 0이면 마지막 수(무승부) */
  remainingAfter: number[];
}

/** 받은 말을 cell 에 놓았을 때 — 확정 전 미리보기 */
export function previewPlace(board: readonly number[], cell: number, piece: number): PlacePreview {
  const next = [...board];
  next[cell] = piece;
  return {
    board: next,
    winLine: winningLineThrough(next, cell),
    remainingAfter: remainingPieces(next, null),
  };
}

const COLOR_WORD = ['잉크색', '호박색'] as const;
const SHAPE_WORD = ['둥근', '네모난'] as const;
const SIZE_WORD = ['큰', '작은'] as const;
const FILL_WORD = ['꽉 찬', '구멍 난'] as const;

export interface PieceTraits {
  /** 0 첫째 색 / 1 둘째 색 */
  color: 0 | 1;
  round: boolean;
  big: boolean;
  solid: boolean;
}

export function pieceTraits(p: number): PieceTraits {
  return {
    color: (p & BIT_COLOR) === 0 ? 0 : 1,
    round: (p & BIT_SHAPE) === 0,
    big: (p & BIT_SIZE) === 0,
    solid: (p & BIT_HOLLOW) === 0,
  };
}

/** 스크린리더·접근성 이름 — "호박색 큰 네모난 구멍 난 말" */
export function describePiece(p: number): string {
  const t = pieceTraits(p);
  return `${COLOR_WORD[t.color]} ${SIZE_WORD[t.big ? 0 : 1]} ${SHAPE_WORD[t.round ? 0 : 1]} ${FILL_WORD[t.solid ? 0 : 1]} 말`;
}

/**
 * 말들의 공통 속성을 글로 — ["모두 큰 말", "모두 꽉 찬 말"]. 공통이 없으면 빈 배열.
 * 끝난 판의 이긴 줄 설명에 쓴다.
 */
export function commonTraitLabels(pieces: readonly number[]): string[] {
  if (pieces.length === 0) return [];
  const all1 = pieces.reduce((acc, p) => acc & p, 0xf);
  const all0 = pieces.reduce((acc, p) => acc & ~p, 0xf) & 0xf;
  const words: [number, readonly [string, string]][] = [
    [BIT_COLOR, COLOR_WORD],
    [BIT_SHAPE, SHAPE_WORD],
    [BIT_SIZE, SIZE_WORD],
    [BIT_HOLLOW, FILL_WORD],
  ];
  const out: string[] = [];
  for (const [bit, [zero, one]] of words) {
    if (all0 & bit) out.push(`모두 ${zero} 말`);
    if (all1 & bit) out.push(`모두 ${one} 말`);
  }
  return out;
}

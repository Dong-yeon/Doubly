/**
 * 아이템 — 연쇄로 얻어 판을 뒤집는 장치. docs/COUPLE_PUZZLE_BATTLE_2026-09-18.md §13.
 *
 * <p>전부 순수 함수다(엔진의 나머지와 같다). 화면은 슬롯을 그리고 탭을 {@link useItem} 로
 * 넘길 뿐이고, 무엇을 언제 얻는지는 여기 규칙이 정한다.
 *
 * <p><b>설계 제약 둘</b>(§13-1). ① <b>고스트와 양립</b>해야 한다 — 상대가 나중에 혼자 붙을 수
 * 있으므로, 아이템도 기보에 한 칸으로 남고 같은 시각에 재생돼야 한다. 그래서 "상대 조작을
 * 실시간으로 방해하는" 종류(화면 흔들기·조작 반전)는 넣지 않는다. ② <b>상쇄를 우회하지
 * 않는다</b> — 방해를 안 거치고 상대 판을 직접 건드리면 §2-3 의 역전 구조가 깨진다.
 * 세 아이템 모두 내 판을 바꾸거나({@link ITEM_BOMB}·{@link ITEM_ERASER}) 전송량에 계수를
 * 곱할 뿐이다({@link ITEM_DOUBLE}).
 */
import { type Board, type Cell, type ItemCode, EMPTY, GARBAGE, HEIGHT, WIDTH } from './types';
import { cellIndex } from './board';

export type { ItemCode };

export const ITEM_NONE = 0;
/** 폭탄 조각 — 축이 폭탄이 되고, 착지 자리 3×3 을 지운다(내 판 정리) */
export const ITEM_BOMB = 1;
/** 방해 2배 — 다음 착지에서 상대에게 나가는 방해가 2배 */
export const ITEM_DOUBLE = 2;
/** 회색 지우개 — 대기 방해를 먼저 깎고, 남으면 판의 방해를 아래부터 지운다 */
export const ITEM_ERASER = 3;

/** 슬롯 상한 — 넘으면 새로 얻은 것은 버린다(쌓아두고 몰아 쓰는 판을 막는다) */
export const MAX_ITEMS = 3;
/** 폭탄을 주는 연쇄 수 */
export const CHAIN_FOR_BOMB = 3;
/** 지우개를 주는 연속 무연쇄 수 — 구제용이라 "막혔다"가 성립하는 길이 */
export const DRY_MOVES_FOR_ERASER = 10;
/** 지우개가 없애는 방해 개수 — 한 줄 분량 */
export const ERASER_AMOUNT = WIDTH;
/** 방해 2배의 계수 */
export const DOUBLE_FACTOR = 2;

export interface ItemDef {
  code: ItemCode;
  label: string;
  /** 슬롯에 그릴 글자 — 에셋을 만들지 않고 이모지로 간다(§13-4) */
  emoji: string;
  /** 어떻게 얻는가 — 화면 안내 문구 */
  howTo: string;
  /** 무엇을 하는가 */
  effect: string;
}

export const ITEMS: ItemDef[] = [
  {
    code: ITEM_BOMB,
    label: '폭탄',
    emoji: '💣',
    howTo: `${CHAIN_FOR_BOMB}연쇄 이상`,
    effect: '다음 조각이 폭탄 — 떨어진 자리 3×3을 지워요',
  },
  {
    code: ITEM_DOUBLE,
    label: '2배',
    emoji: '⚡',
    howTo: '받은 방해를 연쇄로 모두 상쇄',
    effect: '다음에 보내는 방해가 2배',
  },
  {
    code: ITEM_ERASER,
    label: '지우개',
    emoji: '🧹',
    howTo: `${DRY_MOVES_FOR_ERASER}수 동안 연쇄 없음`,
    effect: `방해 ${ERASER_AMOUNT}개를 없애요`,
  },
];

export function itemOf(code: ItemCode): ItemDef | undefined {
  return ITEMS.find((i) => i.code === code);
}

/**
 * 이 수로 얻는 아이템 — 없으면 {@link ITEM_NONE}. 한 수에 하나만 준다.
 *
 * <p>우선순위는 폭탄 &gt; 2배 &gt; 지우개다. 큰 연쇄를 터뜨린 수는 대개 상쇄도 같이
 * 일어나는데, 그때 둘 다 주면 잘 하는 쪽이 계속 벌어진다 — 핸디캡(§2-7)과 반대 방향이다.
 */
export function itemFromMove(
  chain: number,
  garbageOffset: number,
  pendingAfterOffset: number,
  dryMoves: number,
): ItemCode {
  if (chain >= CHAIN_FOR_BOMB) return ITEM_BOMB;
  if (garbageOffset > 0 && pendingAfterOffset === 0) return ITEM_DOUBLE;
  if (dryMoves >= DRY_MOVES_FOR_ERASER) return ITEM_ERASER;
  return ITEM_NONE;
}

/** 슬롯에 넣는다 — 꽉 찼으면 그대로(새 아이템을 버린다) */
export function addItem(items: ItemCode[], item: ItemCode): ItemCode[] {
  if (item === ITEM_NONE || items.length >= MAX_ITEMS) return items;
  return [...items, item];
}

/**
 * 폭탄 — {@code (col,row)} 를 가운데로 3×3 을 지운다. 숨은 줄(row 0)도 지운다:
 * 거기 막혀서 지는 것이 패배 조건이라, 구제 수단이 닿지 않으면 아이템의 뜻이 없다.
 */
export function explode(board: Board, col: number, row: number): { board: Board; cleared: number[] } {
  const next = board.slice() as Board;
  const cleared: number[] = [];
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      if (c < 0 || c >= WIDTH || r < 0 || r >= HEIGHT) continue;
      const i = cellIndex(c, r);
      if (next[i] === EMPTY) continue;
      next[i] = EMPTY;
      cleared.push(i);
    }
  }
  return { board: next, cleared: cleared.sort((a, b) => a - b) };
}

/**
 * 지우개 — 판에 놓인 방해를 <b>아래부터</b> 최대 {@code amount} 개 지운다.
 * 아래부터인 이유: 쌓인 것의 밑을 빼야 위가 내려앉아 판이 실제로 낮아진다.
 */
export function eraseGarbage(board: Board, amount: number): { board: Board; cleared: number[] } {
  const next = board.slice() as Board;
  const cleared: number[] = [];
  for (let row = HEIGHT - 1; row >= 0 && cleared.length < amount; row--) {
    for (let col = 0; col < WIDTH && cleared.length < amount; col++) {
      const i = cellIndex(col, row);
      if (next[i] !== GARBAGE) continue;
      next[i] = EMPTY as Cell;
      cleared.push(i);
    }
  }
  return { board: next, cleared: cleared.sort((a, b) => a - b) };
}

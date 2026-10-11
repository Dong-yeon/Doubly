/**
 * 떨어지는 조각 — 이동·회전(킥)·착지. 판을 바꾸지 않고 새 조각(또는 불가하면 null)을 돌려준다.
 */
import { type Board, type Cell, type Piece, type Rotation, HIDDEN_ROWS } from './types';
import { cellIndex, isFree } from './board';

/** 자식 조각의 상대 위치 — rot 0 위 · 1 오른쪽 · 2 아래 · 3 왼쪽 */
const CHILD_OFFSET: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** 생성 위치 — 가운데 왼쪽 열, 맨 위 보이는 줄. 자식은 숨은 줄에서 시작한다 */
export const SPAWN_COL = 2;
export const SPAWN_ROW = HIDDEN_ROWS;

export function spawnPiece(axis: Cell, child: Cell): Piece {
  return { axis, child, col: SPAWN_COL, row: SPAWN_ROW, rot: 0 };
}

/** [축 (col,row), 자식 (col,row)] */
export function pieceCells(piece: Piece): [[number, number], [number, number]] {
  const [dx, dy] = CHILD_OFFSET[piece.rot];
  return [
    [piece.col, piece.row],
    [piece.col + dx, piece.row + dy],
  ];
}

export function fits(board: Board, piece: Piece): boolean {
  return pieceCells(piece).every(([c, r]) => isFree(board, c, r));
}

/** 좌우 이동. 막히면 null */
export function movePiece(board: Board, piece: Piece, dir: -1 | 1): Piece | null {
  const moved = { ...piece, col: piece.col + dir };
  return fits(board, moved) ? moved : null;
}

/**
 * 회전 + 킥(§4-2 2번). 회전한 자리에 자식이 못 들어가면 축을 <b>반대쪽으로 한 칸 밀어</b>
 * 다시 시도한다 — 벽에 붙어 돌리면 벽에서 떨어지고, 바닥에서 아래로 돌리면 한 칸 떠오른다
 * (뿌요뿌요가 미는 쪽을 택했다). 밀어도 안 되면 회전을 거부한다(null).
 */
export function rotatePiece(board: Board, piece: Piece, dir: -1 | 1): Piece | null {
  const rot = ((((piece.rot + dir) % 4) + 4) % 4) as Rotation;
  const turned = { ...piece, rot };
  if (fits(board, turned)) return turned;
  const [dx, dy] = CHILD_OFFSET[rot];
  const kicked = { ...turned, col: piece.col - dx, row: piece.row - dy };
  return fits(board, kicked) ? kicked : null;
}

export function canFall(board: Board, piece: Piece): boolean {
  return fits(board, { ...piece, row: piece.row + 1 });
}

/** 한 칸 낙하. 바닥이면 null — 호출자가 착지시킨다 */
export function fallOne(board: Board, piece: Piece): Piece | null {
  return canFall(board, piece) ? { ...piece, row: piece.row + 1 } : null;
}

/** 더 못 내려갈 때까지 내린 조각(축 기준). 가로 조각은 착지 후 중력이 각 열을 따로 정리한다 */
export function dropToBottom(board: Board, piece: Piece): Piece {
  let current = piece;
  for (;;) {
    const next = fallOne(board, current);
    if (!next) return current;
    current = next;
  }
}

/** 조각을 판에 쓴다(중력은 적용하지 않는다 — resolveChains 의 첫 중력이 맡는다) */
export function lockPiece(board: Board, piece: Piece): Board {
  const next = board.slice() as Board;
  const [[ac, ar], [cc, cr]] = pieceCells(piece);
  next[cellIndex(ac, ar)] = piece.axis;
  next[cellIndex(cc, cr)] = piece.child;
  return next;
}

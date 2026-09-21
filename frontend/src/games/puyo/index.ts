/** 연쇄 퍼즐 엔진 공개 면 — 화면과 verify 스크립트가 여기만 본다 */
export * from './types';
export { emptyBoard, cellIndex, encodeBoard, decodeBoard, applyGravity, findGroups, clearGroups, resolveChains } from './board';
export { spawnPiece, pieceCells, fits, movePiece, rotatePiece, canFall, fallOne, dropToBottom, lockPiece, SPAWN_COL, SPAWN_ROW } from './piece';
export { chainScore, garbageFromScore, offsetGarbage, TARGET_POINTS, MAX_GARBAGE_PER_DROP } from './scoring';
export { seedRng, nextRandom, nextInt } from './rng';
export {
  encodeTimeline,
  decodeTimeline,
  applyHandicap,
  ghostSchedule,
  ghostItems,
  type TimelineMove,
  type GhostGarbage,
  type GhostItem,
} from './battle';
export {
  createPlayer,
  moveLeft,
  moveRight,
  rotate,
  softDrop,
  hardDrop,
  lock,
  receiveGarbage,
  describeMove,
  dropGarbage,
  applyItem,
  PREVIEW_COUNT,
  type Move,
  type ApplyItemResult,
} from './engine';
export {
  ITEMS,
  ITEM_NONE,
  ITEM_BOMB,
  ITEM_DOUBLE,
  ITEM_ERASER,
  MAX_ITEMS,
  CHAIN_FOR_BOMB,
  DRY_MOVES_FOR_ERASER,
  ERASER_AMOUNT,
  DOUBLE_FACTOR,
  itemOf,
  itemFromMove,
  addItem,
  explode,
  eraseGarbage,
  type ItemDef,
} from './items';

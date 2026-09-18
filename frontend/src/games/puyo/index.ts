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
  type TimelineMove,
  type GhostGarbage,
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
  PREVIEW_COUNT,
  type Move,
} from './engine';

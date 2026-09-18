/**
 * 대전 보조 — 기보 인코딩·핸디캡·고스트 일정. 전부 순수 함수라 verify-puyo.mjs 가 돌린다.
 * docs/COUPLE_PUZZLE_BATTLE_2026-09-18.md §2-6·§2-7·§11-5.
 *
 * <p>엔진은 시간을 모른다. 경과 ms 는 화면이 재고 여기서 기보에 붙인다.
 */
import type { Cell, Rotation } from './types';

/** 기보 한 수 — 서버 Timeline.java 와 같은 7개 값 */
export interface TimelineMove {
  ms: number;
  col: number;
  rot: Rotation;
  axis: Cell;
  child: Cell;
  /** 이 수로 상대에게 나간 방해(상쇄 후) */
  sent: number;
  /** 이 수로 내 판에 들어온 방해 */
  received: number;
}

/** 고스트 재생 항목 — 상대 기보 중 방해가 나간 수만 */
export interface GhostGarbage {
  ms: number;
  amount: number;
}

/** "ms,열,회전,축색,자식색,보낸방해,받은방해;..." — 서버는 형식만 검증한다 */
export function encodeTimeline(moves: TimelineMove[]): string {
  return moves
    .map((m) => [m.ms, m.col, m.rot, m.axis, m.child, m.sent, m.received].map((v) => Math.max(0, Math.round(v))).join(','))
    .join(';');
}

/** 깨진 수는 건너뛴다 — 상대 기보 한 줄 때문에 판이 안 열리면 안 된다 */
export function decodeTimeline(text: string): TimelineMove[] {
  if (!text) return [];
  const moves: TimelineMove[] = [];
  for (const part of text.split(';')) {
    const v = part.split(',').map((s) => Number(s));
    if (v.length !== 7 || v.some((n) => !Number.isInteger(n) || n < 0)) continue;
    moves.push({
      ms: v[0],
      col: v[1],
      rot: (v[2] % 4) as Rotation,
      axis: clampCell(v[3]),
      child: clampCell(v[4]),
      sent: v[5],
      received: v[6],
    });
  }
  return moves;
}

function clampCell(n: number): Cell {
  return Math.min(5, Math.max(0, n)) as Cell;
}

/**
 * 핸디캡(§2-7) — 받는 방해에 백분율을 곱한다. 반올림이라 1개 × 70% 는 그대로 1개다:
 * 연쇄 하나가 통째로 사라지면 "봐주는" 게 아니라 "안 맞는" 것이 된다.
 */
export function applyHandicap(amount: number, percent: number): number {
  if (amount <= 0) return 0;
  const p = Number.isFinite(percent) && percent > 0 ? percent : 100;
  return Math.max(0, Math.round((amount * p) / 100));
}

/** 상대 기보에서 방해가 나간 수만 시간순으로 — 내가 시작한 시점을 0 으로 재생한다 */
export function ghostSchedule(timeline: string): GhostGarbage[] {
  return decodeTimeline(timeline)
    .filter((m) => m.sent > 0)
    .map((m) => ({ ms: m.ms, amount: m.sent }));
}

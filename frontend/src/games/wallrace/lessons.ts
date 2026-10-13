/**
 * 길막기 — 튜토리얼 레슨. 넷이 같아·오목과 같은 틀. 나는 늘 아래에서 위(맨 윗줄)로 가고, 상대(AI)는 위에서 아래로 간다.
 * scripts/verify-wallrace.mjs 가 레슨 데이터를 규칙으로 확인한다 — 목표 칸이 정말 갈 수 있는 칸인지, "느리게 하는 벽"이
 * 실제로 있는지, 마지막 레슨에 정말 "길을 완전히 막아 못 놓는 자리"가 있는지.
 */
import { WALL_SIZE, cellOf, emptyWalls, placeWall, type WallKind } from './index';

export type WallLessonStep =
  | { kind: 'read'; coach: string }
  /** 말 옮기기 — targets 칸만 받는다 */
  | { kind: 'move'; coach: string; targets: number[]; wrong: string; done: string }
  /** 벽 놓기 — 놓을 수 있고 상대 거리를 늘리는 벽이면 받는다 */
  | { kind: 'wall'; coach: string; wrong: string; done: string; hint?: { slot: number; wall: WallKind } };

export interface WallLesson {
  title: string;
  walls: string;
  me: number;
  ai: number;
  steps: WallLessonStep[];
  /** 검증용 — 이 레슨에 "길을 막아 못 놓는 벽"이 있어야 하는가 */
  showsBlockedPath?: { slot: number; wall: WallKind };
}

const slot = (r: number, c: number) => r * WALL_SIZE + c;
const withWalls = (list: [number, number, WallKind][]) =>
  list.reduce((w, [r, c, k]) => placeWall(w, slot(r, c), k), emptyWalls());

export const WALL_LESSONS: WallLesson[] = [
  {
    title: '한 칸씩 움직여요',
    walls: emptyWalls(),
    me: cellOf(8, 4),
    ai: cellOf(0, 4),
    steps: [
      {
        kind: 'read',
        coach: '아래가 내 말, 위가 상대 말이에요. 내 말을 맨 윗줄(옅게 칠한 줄)까지 먼저 보내면 이겨요. 한 차례에 한 칸 가거나 벽 하나를 놓아요.',
      },
      {
        kind: 'move',
        coach: '고리가 보이는 칸이 갈 수 있는 칸이에요. 위로 한 칸 가 보세요.',
        targets: [cellOf(7, 4)],
        wrong: '옆으로도 갈 수 있지만 지금은 목표 줄 쪽(위)이 가까워요.',
        done: '한 칸 올라갔어요! 판 위의 "도착까지" 숫자가 하나 줄었죠. 실전에선 아래 내 카드에 보여요.',
      },
    ],
  },
  {
    title: '마주 보면 뛰어넘어요',
    walls: emptyWalls(),
    me: cellOf(5, 4),
    ai: cellOf(4, 4),
    steps: [
      { kind: 'read', coach: '상대 말이 바로 앞을 막고 있어요. 길막기에선 마주 보는 말을 뛰어넘을 수 있어요.' },
      {
        kind: 'move',
        coach: '상대 말 너머의 칸으로 뛰어 보세요.',
        targets: [cellOf(3, 4)],
        wrong: '상대 말 바로 너머(두 칸 위)에 고리가 있어요.',
        done: '뛰어넘었어요! 넘어갈 자리가 벽이나 판 끝이면 대각선 옆으로 비껴갈 수도 있어요.',
      },
    ],
  },
  {
    title: '벽으로 길을 돌게 해요',
    walls: emptyWalls(),
    me: cellOf(3, 4),
    ai: cellOf(6, 4),
    steps: [
      { kind: 'read', coach: '상대가 아래 끝줄까지 두 칸 남았어요. 나는 세 칸 — 이대로 달리면 져요. 벽으로 상대 길을 돌게 만들어요.' },
      {
        kind: 'wall',
        coach: '아래 가로 벽 조각을 상대 말 바로 아래로 끌어 놓고 [놓기]를 눌러요. 눌러서 고르고 교차점을 콕 찍어도 돼요.',
        wrong: '그 벽은 상대 길을 늘리지 못해요. 상대 말과 끝줄 사이를 막아 보세요.',
        done: '상대가 돌아가야 해요! 벽은 두 칸 길이고 한 사람에 10개뿐이에요.',
        hint: { slot: slot(6, 4), wall: 'H' },
      },
    ],
  },
  {
    // 상대 (7,0) — 아래는 H(7,0), 오른쪽은 V(7,1) 로 막혀 있다. 위(H(6,0))까지 막으면 갇힌다 → 그 자리는 못 놓는다
    title: '완전히 막을 수는 없어요',
    walls: withWalls([[7, 0, 'H'], [7, 1, 'V']]),
    me: cellOf(4, 6),
    ai: cellOf(7, 0),
    showsBlockedPath: { slot: slot(6, 0), wall: 'H' },
    steps: [
      {
        kind: 'read',
        coach: '상대 말 아래와 오른쪽이 이미 막혀 있어요. 위까지 막으면 상대가 갇히는데 — 그런 벽은 놓을 수 없어요. 길은 돌게만 할 수 있어요.',
      },
      {
        kind: 'wall',
        coach: '상대 말 바로 위에 가로 벽을 끌어 보세요. 빨갛게 변하면 놓을 수 없는 자리예요. 다른 자리로 상대를 더 돌게 해 보세요.',
        wrong: '그 벽은 상대 길을 늘리지 못해요. 상대가 빠져나가는 길목을 보세요.',
        done: '좋아요! 막는 건 안 되지만 돌게 만드는 건 얼마든지 돼요. 상대가 멀리 돌수록 내가 유리해요.',
      },
      { kind: 'read', coach: '다 배웠어요. 이제 AI와 한 판 해 볼까요? 실제 판과 똑같고, 기록에는 남지 않아요.' },
    ],
  },
];

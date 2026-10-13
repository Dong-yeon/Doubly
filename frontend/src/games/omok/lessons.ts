/**
 * 오목 — 튜토리얼 레슨. 넷이 같아(games/quarto/lessons.ts)와 같은 틀: 미리 만든 판 + 코치 말 + 받는 칸.
 * 레슨에서 나는 늘 흑이다. scripts/verify-omok.mjs 가 "목표 칸이 정말 그 레슨이 가르치는 칸인가"를 규칙으로 확인한다
 * (다섯이 되는 칸 / 막아야 하는 칸 / 열린 넷을 막는 칸 / 두 줄을 동시에 노려 이기는 칸).
 */
import { boardOf } from './index';

export type OmokLessonStep =
  | { kind: 'read'; coach: string }
  | { kind: 'place'; coach: string; targets: number[]; wrong: string; done: string };

export interface OmokLesson {
  title: string;
  /** 무엇을 가르치나 — 검증 스크립트가 목표 칸을 이 기준으로 다시 계산해 대조한다 */
  check: 'win' | 'blockFive' | 'blockOpenThree' | 'fork';
  board: number[];
  steps: OmokLessonStep[];
}

const at = (r: number, c: number) => r * 15 + c;

export const OMOK_LESSONS: OmokLesson[] = [
  {
    title: '다섯을 이어요',
    check: 'win',
    board: boardOf([[7, 5, 'B'], [7, 6, 'B'], [7, 7, 'B'], [7, 8, 'B'], [6, 6, 'W'], [8, 7, 'W'], [6, 8, 'W'], [8, 5, 'W']]),
    steps: [
      { kind: 'read', coach: '나는 검은 돌이에요. 가로·세로·대각선으로 내 돌 다섯을 먼저 이으면 이겨요. 가운데 줄에 검은 돌이 넷 있어요.' },
      {
        kind: 'place',
        coach: '어디에 두면 다섯이 될까요? 교차점을 눌러 두어 보세요.',
        targets: [at(7, 4), at(7, 9)],
        wrong: '거기도 둘 수는 있지만, 검은 돌 넷의 양 끝을 보세요.',
        done: '다섯! 이겼어요. 넷의 양쪽 끝 어디든 다섯이 돼요.',
      },
    ],
  },
  {
    title: '넷은 꼭 막아요',
    check: 'blockFive',
    board: boardOf([[5, 5, 'W'], [6, 6, 'W'], [7, 7, 'W'], [8, 8, 'W'], [4, 4, 'B'], [6, 5, 'B'], [8, 6, 'B']]),
    steps: [
      { kind: 'read', coach: '흰 돌이 대각선으로 넷이에요. 한쪽 끝은 이미 내가 막았지만, 반대쪽이 비어 있어요.' },
      {
        kind: 'place',
        coach: '지금 막지 않으면 상대가 다음 수에 다섯을 만들어요. 막을 곳을 찾아 두세요.',
        targets: [at(9, 9)],
        wrong: '그러면 상대가 비어 있는 끝에 두고 이겨요. 흰 돌 넷의 끝을 보세요.',
        done: '막았어요! 상대 돌이 넷이면 다른 건 다 미루고 먼저 막아야 해요.',
      },
    ],
  },
  {
    title: '양쪽이 열린 셋도 막아요',
    check: 'blockOpenThree',
    board: boardOf([[7, 6, 'W'], [7, 7, 'W'], [7, 8, 'W'], [6, 7, 'B'], [8, 9, 'B']]),
    steps: [
      {
        kind: 'read',
        coach: '흰 돌 셋이 가로로 있고 양쪽 끝이 다 비어 있어요. 이걸 그냥 두면 상대가 넷을 만들 때 양쪽이 다 열려서 하나밖에 못 막아요.',
      },
      {
        kind: 'place',
        coach: '지금 한쪽 끝을 막아 보세요. 셋 바로 옆이 좋아요.',
        targets: [at(7, 5), at(7, 9)],
        wrong: '그 자리로는 상대의 "양쪽 열린 넷"을 막지 못해요. 셋 바로 옆 칸을 보세요.',
        done: '좋아요! 이제 상대가 넷을 만들어도 한쪽은 이미 막혀 있어서 다른 한쪽만 막으면 돼요.',
      },
    ],
  },
  {
    title: '두 줄을 한 번에 노려요',
    check: 'fork',
    board: boardOf([[7, 5, 'B'], [7, 6, 'B'], [5, 8, 'B'], [6, 8, 'B'], [8, 7, 'W'], [4, 5, 'W'], [9, 10, 'W']]),
    steps: [
      {
        kind: 'read',
        coach: '이번엔 공격이에요. 가로 둘, 세로 둘 — 두 줄이 한 점에서 만나요. 거기 두면 열린 셋이 두 개 생겨요.',
      },
      {
        kind: 'place',
        coach: '두 줄을 동시에 키우는 자리를 찾아 두세요.',
        targets: [at(7, 8)],
        wrong: '한 줄만 자라요. 가로줄과 세로줄이 만나는 칸을 찾아보세요.',
        done: '두 줄이 동시에 셋이 됐어요! 상대는 하나밖에 못 막으니, 남은 줄로 이길 수 있어요.',
      },
      { kind: 'read', coach: '다 배웠어요. 이제 AI와 한 판 해 볼까요? 실제 판과 똑같고, 기록에는 남지 않아요.' },
    ],
  },
];

/**
 * 넷이 같아 — 튜토리얼 레슨. docs/game-practice-tutorial_2026-10-13.md §2 "튜토리얼 = 레슨 목록".
 *
 * 레슨마다 미리 만든 판과 단계(읽기 → 놓기/건네기)가 있다. 기대와 다른 행동은 받아들이지 않고 코치가 이유를 말한다.
 * 데이터가 규칙과 어긋나면 틀린 것을 가르치게 되므로 scripts/verify-quarto.mjs 가 레슨마다
 * "목표 칸에 놓으면 정말 이기는가 / 다른 칸은 정말 안 이기는가 / 안전한 말이 실제로 있는가"를 확인한다.
 *
 * 말 번호: bit0 색(0 잉크/1 호박) · bit1 모양(0 둥근/1 네모) · bit2 크기(0 큰/1 작은) · bit3 속(0 꽉 찬/1 구멍 난).
 */
import { EMPTY } from './index';

export type LessonStep =
  /** 읽기만 — [다음] 으로 넘어간다 */
  | { kind: 'read'; coach: string }
  /** 받은 말 놓기. targets 가 'any' 면 아무 빈 칸, 배열이면 그 칸만 받는다 */
  | { kind: 'place'; coach: string; targets: 'any' | number[]; wrong?: string; done: string }
  /** 건넬 말 고르기. safe 면 상대가 바로 못 이기는 말만 받는다 */
  | { kind: 'give'; coach: string; rule: 'any' | 'safe'; wrong?: string; done: string };

export interface Lesson {
  title: string;
  board: number[];
  /** 레슨 시작 때 손에 든(상대가 준) 말 — 건네기만 하는 레슨은 null */
  pending: number | null;
  steps: LessonStep[];
}

const E = EMPTY;

export const QUARTO_LESSONS: Lesson[] = [
  {
    title: '받고, 놓고, 건네기',
    board: [E, E, E, E, E, E, E, E, E, E, E, E, E, E, E, E],
    pending: 0b0000,
    steps: [
      {
        kind: 'read',
        coach: '말은 16개예요. 색·모양·크기·속이 저마다 달라요. 위 카드에 뜬 말이 상대가 나에게 준 말이에요.',
      },
      {
        kind: 'place',
        coach: '빈 칸 아무 데나 눌러서 이 말을 놓아 보세요.',
        targets: 'any',
        done: '좋아요! 놓을 말은 내가 고르지 못해요. 늘 상대가 골라 줘요.',
      },
      {
        kind: 'give',
        coach: '이제 내 차례의 나머지 반 — 남은 말 중 하나를 골라 상대에게 건네요. 아래에서 아무거나 고르고 [건네기]를 눌러요.',
        rule: 'any',
        done: '이게 한 차례예요. 받은 말을 놓고, 건넬 말을 고르기. 이걸 번갈아 해요.',
      },
    ],
  },
  {
    // 윗줄 0·1·2 = 큰 말 셋(다른 속성은 제각각), 받은 말도 큰 말 → 3번 칸만 이긴다
    title: '공통점 하나면 충분해요',
    board: [0b0000, 0b1011, 0b0011, E, E, 0b0110, E, E, E, E, 0b1101, E, E, E, E, E],
    pending: 0b1000,
    steps: [
      {
        kind: 'read',
        coach: '맨 윗줄을 보세요. 세 말의 색·모양·속은 제각각이지만 모두 "큰 말"이에요. 공통점은 하나만 있어도 돼요.',
      },
      {
        kind: 'place',
        coach: '받은 말도 큰 말이에요. 어디에 놓으면 이길까요?',
        targets: [3],
        wrong: '거기도 놓을 수는 있어요. 그런데 맨 윗줄 빈칸에 놓으면 큰 말 넷이 한 줄이 돼요.',
        done: '넷이 모두 큰 말 — 놓은 사람이 이겨요! 실제 판에선 이런 칸을 누르면 [놓고 승리] 버튼이 떠요.',
      },
    ],
  },
  {
    // 대각선 0·5·10 = 구멍 난 말 셋, 받은 말도 구멍 난 말 → 15번 칸만 이긴다
    title: '대각선도 줄이에요',
    board: [0b1000, E, E, E, E, 0b1111, E, 0b0010, E, E, 0b1011, E, E, 0b0101, E, E],
    pending: 0b1100,
    steps: [
      {
        kind: 'read',
        coach: '줄은 가로·세로만이 아니에요. 왼쪽 위에서 오른쪽 아래로 이어지는 대각선을 보세요. 세 말이 모두 "구멍 난 말"이에요.',
      },
      {
        kind: 'place',
        coach: '받은 말도 구멍 난 말이에요. 이기는 칸을 찾아보세요.',
        targets: [15],
        wrong: '아쉬워요. 대각선의 마지막 빈칸을 찾아보세요 — 오른쪽 아래 끝이에요.',
        done: '대각선 넷이 모두 구멍 난 말 — 이겼어요!',
      },
    ],
  },
  {
    // 둘째 줄 4·5·6 = 둥근 말 셋(다른 속성은 제각각) → 둥근 말을 건네면 상대가 7번 칸에서 이긴다
    title: '건넬 때 조심',
    board: [E, E, E, E, 0b0000, 0b1101, 0b0101, E, E, E, E, E, E, E, E, E],
    pending: null,
    steps: [
      {
        kind: 'read',
        coach: '이번엔 건넬 차례예요. 둘째 줄에 "둥근 말"이 셋 있어요. 둥근 말을 건네면 상대가 남은 칸에 놓고 이겨요.',
      },
      {
        kind: 'give',
        coach: '상대가 바로 이길 수 없는 말을 골라 건네 보세요.',
        rule: 'safe',
        wrong: '그 말이면 상대가 이겨요.',
        done: '좋아요! 상대가 이길 수 없는 말을 고르는 게 이 게임의 핵심이에요. 판이 찰수록 그런 말이 줄어들어요.',
      },
      {
        kind: 'read',
        coach: '다 배웠어요. 이제 AI와 한 판 해 볼까요? 실제 판과 똑같고, 기록에는 남지 않아요.',
      },
    ],
  },
];

/** 커플 게임 — 협동 스도쿠·오목 API. docs/COUPLE_GAMES_DESIGN_2026-09-09.md 3-4·5절 */
import { apiClient, unwrap } from './client';
import type {
  ApiResponse,
  DailySudoku,
  GameReactionOption,
  GameStreak,
  GameTypeKey,
  OmokGame,
  SudokuDifficulty,
  SudokuGame,
} from '../types';

export const sudokuApi = {
  /** 진행 중인 판 — 없으면 null */
  current: () => unwrap(apiClient.get<ApiResponse<SudokuGame | null>>('/games/sudoku/current')),
  /** 새 판 — 진행 중인 판이 있으면 그걸 돌려준다 */
  start: (difficulty: SudokuDifficulty) =>
    unwrap(apiClient.post<ApiResponse<SudokuGame>>('/games/sudoku', { difficulty })),
  /** 칸 입력 — value 0 은 지우기 */
  move: (id: number, index: number, value: number) =>
    unwrap(apiClient.put<ApiResponse<SudokuGame>>(`/games/sudoku/${id}/cells/${index}`, { value })),
  giveUp: (id: number) => unwrap(apiClient.post<ApiResponse<void>>(`/games/sudoku/${id}/give-up`)),
  /** 완성한 판 최근 20개 */
  history: () => unwrap(apiClient.get<ApiResponse<SudokuGame[]>>('/games/sudoku/history')),
  /** 오늘의 판 현황 — 열지 않고 상태만 본다 */
  daily: () => unwrap(apiClient.get<ApiResponse<DailySudoku>>('/games/sudoku/daily')),
  /** 오늘의 판 열기 — 이미 마쳤으면 409(GAME_DAILY_ALREADY_DONE) */
  startDaily: () => unwrap(apiClient.post<ApiResponse<SudokuGame>>('/games/sudoku/daily')),
};

/** 같이 게임한 날의 연속 기록 — 스도쿠·오목을 가리지 않는다 */
export const gameStreakApi = {
  get: () => unwrap(apiClient.get<ApiResponse<GameStreak>>('/games/streak')),
};

export const omokApi = {
  /** 진행 중인 판 — 없으면 null */
  current: () => unwrap(apiClient.get<ApiResponse<OmokGame | null>>('/games/omok/current')),
  /** 새 판 — 판을 연 사람이 백(후공). 진행 중인 판이 있으면 그걸 돌려준다 */
  start: () => unwrap(apiClient.post<ApiResponse<OmokGame>>('/games/omok')),
  /** 착수 — 내 차례가 아니거나 돌이 있으면 409/400 */
  place: (id: number, index: number) =>
    unwrap(apiClient.put<ApiResponse<OmokGame>>(`/games/omok/${id}/cells/${index}`)),
  /** 무르기 요청 — 직전에 둔 사람만. 되돌리는 건 상대가 받아준 뒤 */
  requestUndo: (id: number) =>
    unwrap(apiClient.post<ApiResponse<OmokGame>>(`/games/omok/${id}/undo-request`)),
  /** 무르기 응답 — accept=false 는 "그냥 두자" */
  respondUndo: (id: number, accept: boolean) =>
    unwrap(apiClient.post<ApiResponse<OmokGame>>(`/games/omok/${id}/undo-response`, { accept })),
  giveUp: (id: number) => unwrap(apiClient.post<ApiResponse<void>>(`/games/omok/${id}/give-up`)),
  /** 끝난 판 최근 20개(승패 포함) */
  history: () => unwrap(apiClient.get<ApiResponse<OmokGame[]>>('/games/omok/history')),
};

/**
 * 판 위 즉석 반응 — 저장되지 않고 상대 화면에만 잠깐 뜬다.
 * 목록을 서버에서 받는 이유는 앱마다 이모지가 갈리지 않게 하기 위해서다.
 */
export const gameReactionApi = {
  options: () => unwrap(apiClient.get<ApiResponse<GameReactionOption[]>>('/games/reactions')),
  send: (gameType: GameTypeKey, reaction: string) =>
    unwrap(apiClient.post<ApiResponse<void>>('/games/reactions', { gameType, reaction })),
};

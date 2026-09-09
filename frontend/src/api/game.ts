/** 커플 게임 — 협동 스도쿠 API. docs/COUPLE_GAMES_DESIGN_2026-09-09.md 3-4절 */
import { apiClient, unwrap } from './client';
import type { ApiResponse, SudokuDifficulty, SudokuGame } from '../types';

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
};

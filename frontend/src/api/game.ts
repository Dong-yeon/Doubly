/** 커플 게임 — 협동 스도쿠·오목 API. docs/COUPLE_GAMES_DESIGN_2026-09-09.md 3-4·5절 */
import { apiClient, unwrap } from './client';
import type { UploadSignature } from './upload';
import type {
  ApiResponse,
  CatchMindGame,
  CatchMindGuessResult,
  CatchMindWordCandidate,
  DailySudoku,
  GameReactionOption,
  GameStreak,
  GameTypeKey,
  OmokGame,
  PuzzleBattleGame,
  PuzzleBattleRun,
  SudokuDifficulty,
  SudokuGame,
  WallRaceGame,
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

/**
 * 캐치마인드 — 비동기다. 그리는 동안은 서버에 아무것도 없고, 다 그린 그림을 한 번에 보낸다.
 * docs/CATCH_MIND_2026-09-14.md
 */
export const catchMindApi = {
  /** 진행 중인 판 — 없으면 null */
  current: () => unwrap(apiClient.get<ApiResponse<CatchMindGame | null>>('/games/catch-mind/current')),
  /** 제시어 후보 셋 — 직접 입력해도 된다 */
  words: () =>
    unwrap(
      apiClient.get<ApiResponse<{ candidates: CatchMindWordCandidate[] }>>('/games/catch-mind/words'),
    ).then((r) => r.candidates),
  /**
   * 채팅 공유용 그림 PNG 업로드 서명.
   *
   * <p>사진 업로드 한도({@code PHOTO_UPLOAD})를 소비하지 않는 전용 경로다 — 판당 한 장이고
   * 진행 중인 판은 커플당 하나라 게임 흐름이 이미 상한이다(서버 주석 참고).
   */
  uploadSignature: () =>
    unwrap(apiClient.post<ApiResponse<UploadSignature>>('/games/catch-mind/upload-signature')),
  /**
   * 그림 제출 = 판 시작. 진행 중인 판이 있으면 409.
   *
   * <p>{@code shareImageUrl} 은 채팅에 남길 그림 PNG 의 URL — <b>선택</b>이다. 렌더·업로드가
   * 실패하면 빼고 보낸다. 공유는 곁가지이고 그림 제출이 본 기능이다.
   */
  start: (word: string, strokes: string, shareImageUrl?: string) =>
    unwrap(
      apiClient.post<ApiResponse<CatchMindGame>>('/games/catch-mind', {
        word,
        strokes,
        shareImageUrl,
      }),
    ),
  /** 정답 시도 — 횟수 제한 없음 */
  guess: (id: number, answer: string) =>
    unwrap(apiClient.post<ApiResponse<CatchMindGuessResult>>(`/games/catch-mind/${id}/guess`, { answer })),
  /** 초성 힌트 — 열어도 실패로 치지 않는다 */
  hint: (id: number) =>
    unwrap(apiClient.post<ApiResponse<CatchMindGame>>(`/games/catch-mind/${id}/hint`)),
  giveUp: (id: number) => unwrap(apiClient.post<ApiResponse<void>>(`/games/catch-mind/${id}/give-up`)),
  /** 맞힌 판 최근 20개 */
  history: () => unwrap(apiClient.get<ApiResponse<CatchMindGame[]>>('/games/catch-mind/history')),
};

/** 같이 게임한 날의 연속 기록 — 스도쿠·오목·캐치마인드를 가리지 않는다 */
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
 * 길막기 — 턴제라 <b>서버가 규칙의 주인</b>이다. 놓을 수 없는 벽은 400 으로 돌아오고
 * 화면은 그 메시지를 토스트로 띄운다. docs/PATH_LOCK_ANALYSIS_2026-09-21.md §4-2.
 */
export const wallRaceApi = {
  /** 진행 중인 판 — 없으면 null */
  current: () => unwrap(apiClient.get<ApiResponse<WallRaceGame | null>>('/games/wall-race/current')),
  /** 새 판 — 판을 연 사람이 후공. 진행 중인 판이 있으면 그걸 돌려준다 */
  start: () => unwrap(apiClient.post<ApiResponse<WallRaceGame>>('/games/wall-race')),
  /** 말 이동 — 갈 수 있는 자리는 응답의 legalMoves 가 알려준다 */
  movePawn: (id: number, target: number) =>
    unwrap(apiClient.put<ApiResponse<WallRaceGame>>(`/games/wall-race/${id}/pawn/${target}`)),
  /** 벽 설치 — 겹치거나 길을 완전히 막으면 400 */
  placeWall: (id: number, slot: number, kind: 'H' | 'V') =>
    unwrap(apiClient.post<ApiResponse<WallRaceGame>>(`/games/wall-race/${id}/walls`, { slot, kind })),
  /** 무르기 요청 — 직전에 둔 사람만. 되돌리는 건 상대가 받아준 뒤 */
  requestUndo: (id: number) =>
    unwrap(apiClient.post<ApiResponse<WallRaceGame>>(`/games/wall-race/${id}/undo-request`)),
  /** 무르기 응답 — accept=false 는 "그냥 두자" */
  respondUndo: (id: number, accept: boolean) =>
    unwrap(apiClient.post<ApiResponse<WallRaceGame>>(`/games/wall-race/${id}/undo-response`, { accept })),
  giveUp: (id: number) => unwrap(apiClient.post<ApiResponse<void>>(`/games/wall-race/${id}/give-up`)),
  /** 끝난 판 최근 20개(승패 포함) */
  history: () => unwrap(apiClient.get<ApiResponse<WallRaceGame[]>>('/games/wall-race/history')),
};

/**
 * 연쇄 퍼즐 대전 — 수(手)는 여기로 가지 않는다(chatSocket 의 publishGameEvent). 판을 열고,
 * 내 판이 끝났을 때 결과를 한 번 내고, 접는다. docs/COUPLE_PUZZLE_BATTLE_2026-09-18.md §11.
 */
export const puzzleApi = {
  /** 진행 중인 판 — 없으면 null */
  current: () => unwrap(apiClient.get<ApiResponse<PuzzleBattleGame | null>>('/games/puzzle/current')),
  /** 새 판 — 진행 중인 판이 있으면 그걸 돌려준다. 시드·핸디캡은 서버가 정한다 */
  start: () => unwrap(apiClient.post<ApiResponse<PuzzleBattleGame>>('/games/puzzle')),
  /** 내 결과 제출 — 한 판에 한 번(두 번째는 409) */
  finish: (id: number, run: PuzzleBattleRun) =>
    unwrap(apiClient.post<ApiResponse<PuzzleBattleGame>>(`/games/puzzle/${id}/finish`, run)),
  giveUp: (id: number) => unwrap(apiClient.post<ApiResponse<void>>(`/games/puzzle/${id}/give-up`)),
  /** 끝난 판 최근 20개 */
  history: () => unwrap(apiClient.get<ApiResponse<PuzzleBattleGame[]>>('/games/puzzle/history')),
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

/**
 * 스도쿠 메모(연필 표시) — <b>내 기기에만</b> 남는다.
 *
 * <p>메모는 "이 칸은 3 아니면 7"이라는 <b>내 추론 과정</b>이다. 서버에 올리면 상대 화면에도
 * 뜨는데, 협동 스도쿠에서 상대의 추론까지 보이면 같이 푸는 재미가 아니라 답을 받아쓰는 일이
 * 된다. 그래서 서버를 건드리지 않고 기기에만 둔다 — 기기를 바꾸면 사라지는 것이 맞다.
 *
 * <p>저장소는 {@code AsyncStorage} 다. {@code utils/storage} 는 네이티브에서 SecureStore 를
 * 쓰는데(토큰용) 이런 용도가 아니다 — {@code workout/sessionDraft} 와 같은 판단이다.
 *
 * <p><b>한 판만 보관한다.</b> 판이 바뀌면 이전 메모는 쓸모가 없고, 판 id 를 함께 저장해
 * 다른 판의 메모를 잘못 되살리는 일을 막는다(저절로 청소된다).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'doubly.sudokuMemo';

/** 칸 인덱스(0~80) → 적어둔 숫자들 */
export type SudokuMemos = Record<number, number[]>;

interface Stored {
  gameId: number;
  memos: SudokuMemos;
}

export async function loadMemos(gameId: number): Promise<SudokuMemos> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Stored;
    // 다른 판의 메모는 버린다 — 같은 칸 번호가 전혀 다른 뜻이 된다
    return parsed?.gameId === gameId && parsed.memos ? parsed.memos : {};
  } catch {
    // 읽기 실패는 메모가 없는 것과 같게 다룬다 — 판 자체를 못 풀게 만들 이유가 없다
    return {};
  }
}

export async function saveMemos(gameId: number, memos: SudokuMemos): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ gameId, memos } satisfies Stored));
  } catch {
    // 저장 실패는 조용히 넘긴다 — 화면의 메모는 그대로 살아 있다
  }
}

export async function clearMemos(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // 위와 같은 이유
  }
}

/**
 * 판 상태에 맞게 메모를 정리한다 — 값이 찬 칸의 메모는 버리고, 같은 줄·칸(3×3)에 이미
 * 놓인 숫자는 지운다.
 *
 * <p>내 입력뿐 아니라 <b>상대의 입력</b>에도 똑같이 돌려야 하므로, 입력 시점이 아니라
 * "판이 바뀔 때" 한 번에 처리한다. 같은 판을 두 번 돌려도 결과가 같다(idempotent).
 *
 * @returns 정리된 메모. 바뀐 게 없으면 <b>같은 객체</b>를 돌려준다(불필요한 저장·렌더 방지)
 */
export function pruneMemos(memos: SudokuMemos, board: string): SudokuMemos {
  let changed = false;
  const next: SudokuMemos = {};
  for (const [key, digits] of Object.entries(memos)) {
    const index = Number(key);
    if (board[index] !== '0') {
      changed = true; // 값이 찬 칸 — 메모째로 버린다
      continue;
    }
    const blocked = placedAround(board, index);
    const kept = digits.filter((d) => !blocked.has(d));
    if (kept.length !== digits.length) changed = true;
    if (kept.length > 0) next[index] = kept;
    else if (digits.length > 0) changed = true;
  }
  return changed ? next : memos;
}

/** 같은 행·열·3×3 칸에 이미 놓인 숫자들 */
function placedAround(board: string, index: number): Set<number> {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  const placed = new Set<number>();
  for (let i = 0; i < 9; i++) {
    add(placed, board[row * 9 + i]);
    add(placed, board[i * 9 + col]);
    add(placed, board[(boxRow + Math.floor(i / 3)) * 9 + boxCol + (i % 3)]);
  }
  return placed;
}

function add(set: Set<number>, ch: string) {
  if (ch && ch !== '0') set.add(Number(ch));
}

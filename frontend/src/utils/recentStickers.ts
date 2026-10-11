/**
 * 최근 내가 보낸 스티커 — 추천 막대가 같은 순위 안에서 자주 쓰는 그림을 앞으로 당긴다
 * (utils/stickerCodes.ts `suggestStickers` 의 `recent`).
 *
 * <p>기기에만 둔다. 서버에 보낸 메시지로 셀 수도 있지만, 순서 하나 바꾸자고 조회를 늘릴 일이 아니고
 * 기기를 바꾸면 처음부터 다시 배우는 정도는 괜찮다. 저장이 실패해도 추천은 표 순서로 계속 돈다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'doubly.recentStickers';
const MAX_RECENT = 30;

/** 최신이 앞. 읽기 실패·깨진 값이면 빈 목록 */
export async function loadRecentStickers(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

/** 맨 앞에 올리고(중복은 뺀다) 저장한다. 새 목록을 돌려준다 — 저장이 실패해도 메모리 값은 쓴다 */
export async function recordRecentSticker(prev: string[], code: string): Promise<string[]> {
  const next = [code, ...prev.filter((c) => c !== code)].slice(0, MAX_RECENT);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장소가 가득 찼거나 막혔다 — 순서가 조금 덜 맞을 뿐이다
  }
  return next;
}

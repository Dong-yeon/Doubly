/**
 * 홈 왕관의 "처음 볼 때 한 번만 반짝" — 이미 본 등극(certificationKey)을 기기에 기억한다.
 *
 * <p><b>실패하면 반짝이지 않는다</b>: 저장소를 못 읽으면 "이미 봤다"로 친다. 매번 반짝이는 쪽(못 읽을 때마다 새로
 * 본 것처럼)보다 한 번도 안 반짝이는 쪽이 덜 거슬린다. 쓰기 실패는 무시한다.
 *
 * <p>값이 늘어나는 목록이라 SecureStore(2KB 상한)가 아니라 AsyncStorage 에 둔다. 최근 {@link MAX}개만 남긴다 —
 * 등극은 24시간만 신호가 되므로 오래된 열쇠는 다시 쓰일 일이 없다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'doubly.lovelichelinSeenCerts';
const MAX = 50;

async function read(): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return null;
  }
}

/** 이 등극을 지금 처음 보는가 — 저장소를 못 읽으면 false(반짝이지 않는다) */
export async function isFirstSight(certificationKey: string): Promise<boolean> {
  const seen = await read();
  return seen != null && !seen.includes(certificationKey);
}

/** 봤다고 적는다 — 실패는 무시 */
export async function markSeen(certificationKey: string): Promise<void> {
  const seen = (await read()) ?? [];
  if (seen.includes(certificationKey)) return;
  const next = [...seen, certificationKey].slice(-MAX);
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
}

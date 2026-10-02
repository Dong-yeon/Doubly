/**
 * 홈 왕관의 "처음 볼 때 한 번만" — 이미 본 신호(signalKey: 등극이면 certificationKey 와 같은 값, 오늘 기록이면
 * 마지막 활동 시각까지 담은 값)를 기기에 기억한다. 저장 키는 등극만 기억하던 때(2026-10-02 첫판)와 같다 —
 * 그때 본 등극을 다시 "새것"으로 내려앉히지 않게.
 *
 * <p><b>실패하면 반짝이지 않는다</b>: 저장소를 못 읽으면 "이미 봤다"로 친다. 매번 반짝이는 쪽(못 읽을 때마다 새로
 * 본 것처럼)보다 한 번도 안 반짝이는 쪽이 덜 거슬린다. 쓰기 실패는 무시한다.
 *
 * <p>값이 늘어나는 목록이라 SecureStore(2KB 상한)가 아니라 AsyncStorage 에 둔다. 최근 {@link MAX}개만 남긴다 —
 * 신호는 길어야 하루(등극 24시간·오늘 기록)만 살아 있으므로 오래된 열쇠는 다시 쓰일 일이 없다.
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

/** 이 신호를 지금 처음 보는가 — 저장소를 못 읽으면 false(연출하지 않는다) */
export async function isFirstSight(signalKey: string): Promise<boolean> {
  const seen = await read();
  return seen != null && !seen.includes(signalKey);
}

/** 봤다고 적는다 — 실패는 무시 */
export async function markSeen(signalKey: string): Promise<void> {
  const seen = (await read()) ?? [];
  if (seen.includes(signalKey)) return;
  const next = [...seen, signalKey].slice(-MAX);
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
}

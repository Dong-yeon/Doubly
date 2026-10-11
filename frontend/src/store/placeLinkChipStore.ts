/**
 * 채팅 지도 링크 칩 — 어느 메시지의 칩을 더 띄우지 않을지, 그리고 연달아 몇 번 닫았는지. 기기에만 저장한다.
 *
 * <p><b>왜 기기에만</b>: "이 칩은 그만"은 내 취향이지 상대와 나눌 상태가 아니다. 메시지에 "담았음" 같은
 * 표시를 영구로 남기지 않기로 했다(범위 밖, docs/LOVELICHELIN_CHAT_LINK_2026-10-02.md).
 *
 * <p><b>피로도</b>: 연달아 {@link SUGGEST_OFF_AFTER} 번 닫으면 끄기를 권한다(한 번만). 칩을 눌러 쓰면 연속
 * 횟수는 0으로 돌아간다 — 가끔 쓰는 사람에게 끄라고 하지 않는다.
 *
 * <p>값이 커지는 목록이라 SecureStore(값 2KB 상한)가 아니라 AsyncStorage 에 둔다. 최근 {@link MAX_IDS}개만 남긴다 —
 * 오래된 메시지까지 스크롤해 올라가 다시 보는 일은 드물고, 다시 떠도 해가 없다.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'doubly.placeLinkChip';
const MAX_IDS = 300;
export const SUGGEST_OFF_AFTER = 3;

interface Persisted {
  hidden: number[];
  consecutiveDismissals: number;
  /** 끄기 안내를 이미 했는가 — 계속 닫아도 또 묻지 않는다 */
  offPrompted: boolean;
}

interface PlaceLinkChipState extends Persisted {
  loaded: boolean;
  load: () => Promise<void>;
  /** X 로 닫았다 — 반환값이 true 면 지금 끄기를 권할 차례다 */
  dismiss: (messageId: number) => boolean;
  /** 칩을 눌러 썼다(담았거나 이미 있던 곳을 봤다) — 이 메시지엔 다시 안 띄우고 연속 닫기는 0으로 */
  handled: (messageId: number) => void;
}

function persist(state: Persisted) {
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => undefined);
}

function withId(ids: number[], id: number): number[] {
  if (ids.includes(id)) return ids;
  const next = [...ids, id];
  return next.length > MAX_IDS ? next.slice(next.length - MAX_IDS) : next;
}

export const usePlaceLinkChipStore = create<PlaceLinkChipState>((set, get) => ({
  hidden: [],
  consecutiveDismissals: 0,
  offPrompted: false,
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
      set({
        hidden: Array.isArray(saved.hidden) ? saved.hidden.filter((n) => typeof n === 'number') : [],
        consecutiveDismissals: typeof saved.consecutiveDismissals === 'number' ? saved.consecutiveDismissals : 0,
        offPrompted: saved.offPrompted === true,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  dismiss: (messageId) => {
    const s = get();
    const consecutiveDismissals = s.consecutiveDismissals + 1;
    const promptNow = !s.offPrompted && consecutiveDismissals >= SUGGEST_OFF_AFTER;
    const next: Persisted = {
      hidden: withId(s.hidden, messageId),
      consecutiveDismissals,
      offPrompted: s.offPrompted || promptNow,
    };
    set(next);
    persist(next);
    return promptNow;
  },

  handled: (messageId) => {
    const s = get();
    const next: Persisted = { hidden: withId(s.hidden, messageId), consecutiveDismissals: 0, offPrompted: s.offPrompted };
    set(next);
    persist(next);
  },
}));

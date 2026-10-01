/**
 * 이모티콘 팩 정리 — 순서·숨기기·받기 (Zustand, 기기별). 카카오톡 "이모티콘 설정" 을 따른다(2026-10-01).
 *
 * <p><b>왜 필요한가</b>: 팩이 서버에서 계속 늘어난다(store/remoteStickerStore). 다 패널에 꽂으면 탭 줄이
 * 끝없이 길어진다. 그래서 서버에만 있는 팩은 <b>받은 것만</b> 패널에 서고, 받은 것·앱에 든 것은 숨기거나
 * 순서를 바꿀 수 있다.
 *
 * <p><b>패널에서만 빠진다.</b> 숨기거나 안 받은 팩이라도 상대가 보낸 말풍선은 그대로 그려진다
 * (RemoteAnimatedSticker 가 그 자리에서 받는다). 보내는 쪽 정리이지 받는 쪽 차단이 아니다.
 *
 * <p><b>기기별로 둔다.</b> 서버에 두면 기기를 바꿔도 따라오지만, 그건 계정 단위 설정 API·마이그레이션이
 * 딸려 온다. 정리 상태가 사라져도 잃는 건 순서뿐이라(팩은 다시 받으면 된다) 지금은 기기에 둔다.
 *
 * <p>키는 패널 칸의 키와 같다 — 움직이는 이모티콘은 팩 id(`ANIM_ALL`·`ANIM_FRIENDS`), 캐릭터는 캐릭터 키.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'doubly.stickerPrefs';

interface Persisted {
  /** 사용자가 정한 순서 — 여기 없는 칸은 기본 순서대로 뒤에 선다 */
  order: string[];
  hidden: string[];
  /** 받은 서버 팩 — 서버에만 있는 팩은 여기 있어야 패널에 선다 */
  downloaded: string[];
  /** 설정 화면에서 본 서버 팩 — 못 본 새 팩이 있으면 패널 톱니에 점을 찍는다 */
  seen: string[];
}

interface StickerPrefsState extends Persisted {
  loaded: boolean;
  load: () => Promise<void>;
  setHidden: (key: string, hidden: boolean) => void;
  /** 한 칸 위(-1)·아래(+1)로 — `keys` 는 지금 화면에 보이는 순서 그대로 */
  move: (keys: string[], key: string, delta: -1 | 1) => void;
  markDownloaded: (key: string, downloaded: boolean) => void;
  markSeen: (keys: string[]) => void;
}

function persist(s: Persisted) {
  const { order, hidden, downloaded, seen } = s;
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ order, hidden, downloaded, seen }));
}

export const useStickerPrefsStore = create<StickerPrefsState>((set, get) => ({
  order: [],
  hidden: [],
  downloaded: [],
  seen: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Persisted>;
        set({ order: p.order ?? [], hidden: p.hidden ?? [], downloaded: p.downloaded ?? [], seen: p.seen ?? [] });
      }
    } catch {
      // 깨졌으면 기본값 — 잃는 건 순서·숨김뿐이다
    }
    set({ loaded: true });
  },

  setHidden: (key, hidden) => {
    const next = new Set(get().hidden);
    if (hidden) next.add(key);
    else next.delete(key);
    set({ hidden: [...next] });
    persist(get());
  },

  move: (keys, key, delta) => {
    const i = keys.indexOf(key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= keys.length) return;
    const order = [...keys];
    [order[i], order[j]] = [order[j], order[i]];
    set({ order });
    persist(get());
  },

  markDownloaded: (key, downloaded) => {
    const next = new Set(get().downloaded);
    if (downloaded) next.add(key);
    else next.delete(key);
    // 새로 받은 팩은 맨 뒤로 — 쓰던 순서를 흔들지 않는다
    const order = get().order.filter((k) => k !== key);
    if (downloaded && order.length > 0) order.push(key);
    set({ downloaded: [...next], order });
    persist(get());
  },

  markSeen: (keys) => {
    const next = new Set([...get().seen, ...keys]);
    if (next.size === get().seen.length) return;
    set({ seen: [...next] });
    persist(get());
  },
}));

/** 기본 순서의 칸들을 사용자 순서로 — `order` 에 없는 칸은 기본 순서를 지켜 뒤에 선다 */
export function applyOrder<T extends { key: string }>(items: T[], order: string[]): T[] {
  const rank = new Map(order.map((k, i) => [k, i]));
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => (rank.get(a.item.key) ?? order.length + a.i) - (rank.get(b.item.key) ?? order.length + b.i))
    .map((x) => x.item);
}

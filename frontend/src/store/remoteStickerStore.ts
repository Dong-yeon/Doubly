/**
 * 서버 배포 스티커 카탈로그 (Zustand) — 번들에 없는 움직이는 이모티콘(2026-10-01).
 *
 * <p><b>왜 서버 배포인가</b>: 번들에 넣으면 이모티콘을 늘릴수록 앱이 무거워진다(Noto 110종이 이미
 * 7.8MB). 카카오톡·비트윈처럼 팩은 서버에 두고, 패널을 열면 썸네일만, 말풍선에 처음 그릴 때 애니메이션을
 * 받아 기기에 보관한다(utils/remoteStickerFiles). 팩을 더하는 데 앱 배포가 필요 없다.
 *
 * <p><b>저장해 두는 이유</b>: 받은 말풍선은 카탈로그가 있어야 그림이 된다. 오프라인으로 켜거나 서버가
 * 늦게 답해도 지난 대화가 코드 글자로 보이면 안 되므로, 마지막으로 받은 카탈로그를 AsyncStorage 에 둔다.
 *
 * <p><b>권한은 여기서 판정하지 않는다</b> — 잠금은 stickerStore(서버 /stickers/packs)가, 최종 판정은
 * 메시지 전송 때 서버가 한다. 여기는 "이 코드는 어느 팩의 무슨 그림인가"만 안다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { stickerApi } from '../api/stickers';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/config';
import type { RemoteStickerItem, StickerCatalog } from '../types';

/** 앱이 그리는 한 장 — 경로가 아니라 <b>절대 주소</b>이고, 속한 팩을 안다 */
export interface RemoteSticker extends RemoteStickerItem {
  packId: string;
}

export interface RemotePack {
  id: string;
  items: RemoteSticker[];
}

/** 같은 앱 실행 안에서 다시 묻는 간격 — 팩은 백엔드 배포 때만 바뀐다 */
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
/**
 * `force` 여도 이 안에는 다시 묻지 않는다 — 모르는 코드가 화면에 여럿이면 말풍선마다 force 를 부른다.
 * 새 팩을 상대가 먼저 보낸 경우를 잡는 용도라 30초면 충분하다.
 */
const FORCE_MIN_INTERVAL_MS = 30 * 1000;

/** `https://host/api/v1` → `https://host` — 카탈로그의 경로를 이 오리진에 붙인다 */
const ORIGIN = API_BASE_URL.replace(/\/api\/v\d+\/?$/, '');

function absolutize(path: string): string {
  return /^https?:\/\//.test(path) ? path : `${ORIGIN}${path}`;
}

function index(catalog: StickerCatalog): { packs: RemotePack[]; byCode: Record<string, RemoteSticker> } {
  const byCode: Record<string, RemoteSticker> = {};
  const packs = catalog.packs.map((p) => ({
    id: p.id,
    items: p.items.map((i) => {
      const s = { ...i, url: absolutize(i.url), thumbUrl: absolutize(i.thumbUrl), packId: p.id };
      byCode[s.code] = s;
      return s;
    }),
  }));
  return { packs, byCode };
}

interface RemoteStickerState {
  version: string | null;
  packs: RemotePack[];
  byCode: Record<string, RemoteSticker>;
  /** 저장해 둔 카탈로그를 읽었는가 — 앱 실행당 한 번 */
  hydrated: boolean;
  lastFetchedAt: number;

  /** 저장해 둔 카탈로그를 먼저 펼치고 서버에 새로 묻는다 — 앱 시작 때 */
  init: () => Promise<void>;
  /** 서버에 묻는다. `force` 가 아니면 최근에 물었을 때 건너뛴다 */
  refresh: (force?: boolean) => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const useRemoteStickerStore = create<RemoteStickerState>((set, get) => ({
  version: null,
  packs: [],
  byCode: {},
  hydrated: false,
  lastFetchedAt: 0,

  init: async () => {
    if (!get().hydrated) {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.stickerCatalog);
        // 그 사이 서버 응답이 먼저 왔으면 덮어쓰지 않는다
        if (raw && !get().version) {
          const catalog = JSON.parse(raw) as StickerCatalog;
          set({ version: catalog.version, ...index(catalog) });
        }
      } catch {
        // 저장본이 깨졌으면 서버에서 다시 받으면 된다
      }
      set({ hydrated: true });
    }
    await get().refresh();
  },

  refresh: async (force = false) => {
    const since = Date.now() - get().lastFetchedAt;
    if (since < (force ? FORCE_MIN_INTERVAL_MS : REFRESH_INTERVAL_MS)) return;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const catalog = await stickerApi.catalog();
        set({ lastFetchedAt: Date.now() });
        if (catalog.version === get().version) return;
        set({ version: catalog.version, ...index(catalog) });
        void AsyncStorage.setItem(STORAGE_KEYS.stickerCatalog, JSON.stringify(catalog));
      } catch {
        // 못 받아도 저장본으로 그린다. 다음 패널 열기·모르는 코드에서 다시 묻는다
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
}));

/** 코드로 한 장을 찾는다 — 렌더 밖(미리보기 문구 등)에서 쓰는 경로 */
export function remoteStickerOf(code: string | null | undefined): RemoteSticker | undefined {
  return code ? useRemoteStickerStore.getState().byCode[code] : undefined;
}

/**
 * 스티커 코드처럼 생긴 문자열인가 — 카탈로그가 아직 없을 때 코드 글자를 그대로 보이지 않기 위해.
 * 번들 코드(`ANIM_*`·`EGG_*`)와 서버 코드(`FRIEND_*`) 모두 대문자·밑줄이고, 유니코드 이모지는 걸리지 않는다.
 */
export function looksLikeStickerCode(content: string | null | undefined): boolean {
  return !!content && /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(content);
}

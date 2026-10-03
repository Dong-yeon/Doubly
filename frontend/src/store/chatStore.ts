/** 채팅 상태 스토어 — 설계서 3.4 / 4.5 */
import { create } from 'zustand';
import { chatApi } from '../api/chat';
import {
  connectSocket,
  disconnectSocket,
  OutgoingMessage,
  publishEnsuringConnection,
  socketStatus,
  subscribeRoom,
  subscribeRoomPin,
  subscribeRoomRead,
  subscribeRoomUpdates,
  subscribeSocketStatus,
  unsubscribeRoom,
} from '../api/chatSocket';
import type { ChatMessage, ChatRoom } from '../types';
import { fetchUntilBridged, mergeSynced, newestKnownId } from '../utils/chatSync';

interface ChatState {
  rooms: ChatRoom[];
  /** 방별 메시지 (최신순) */
  messages: Record<number, ChatMessage[]>;
  loadingRooms: boolean;
  connected: boolean;
  /** 방별 과거 페이지 로딩 중 여부 */
  loadingOlder: Record<number, boolean>;
  /** 방별 더 불러올 과거 메시지가 있는지 — 빈 페이지를 받으면 false */
  hasMoreOlder: Record<number, boolean>;
  /** 방별 현재 고정된 공지 — 없으면 null, 아직 안 불러왔으면 키 자체가 없다 */
  pinnedMessages: Record<number, ChatMessage | null>;
  /**
   * 지금 화면에 열려 있는 채팅방 — openRoom/closeRoom 이 관리한다. push.ts 가 이 값을
   * 읽어서, 지금 보고 있는 방으로 온 알림은 배너·소리를 억누른다(메시지는 소켓으로
   * 이미 화면에 실시간으로 뜨는데, 알림까지 겹쳐 오면 "방에 들어와 있는데도 알림이
   * 계속 온다"는 체감이 든다 — 2026-08-31 리포트).
   */
  activeRoomId: number | null;

  loadRooms: () => Promise<void>;
  /**
   * 끊겨 있는 동안 놓친 메시지를 따라잡는다 — 앱이 포그라운드로 돌아올 때, 그리고 소켓이 (다시) 붙을
   * 때마다(아래 subscribeSocketStatus) 부른다. 소켓은 <b>연결된 뒤에 오는</b> 메시지만 주므로, 끊긴 사이의
   * 공백은 REST 로 메운다. 화면의 대화와 이어질 때까지 과거로 페이지를 넘긴다.
   */
  syncMissed: (relationId: number) => Promise<void>;
  openRoom: (relationId: number) => Promise<void>;
  closeRoom: (relationId: number) => void;
  /** 위로 스크롤 시 과거 메시지 한 페이지 추가 로드 (커서 = 가장 오래된 메시지 id) */
  loadOlder: (relationId: number) => Promise<void>;
  /**
   * 전송 — <b>낙관적 말풍선을 먼저 넣고</b> 발행한다.
   *
   * <p>STOMP 발행은 fire-and-forget 이라 서버 저장을 기다리지 않는다. 예전에는 메시지가
   * 화면에 뜨는 유일한 경로가 서버 에코여서, 서버가 밀리면 화면에 아무것도 안 뜨고 사용자는
   * 다시 눌렀다 — 누른 만큼 저장됐다(2026-09-12 리포트). 이제 누르는 즉시 "보내는 중"
   * 말풍선이 서고, 서버 에코가 오면 {@code clientMessageId} 로 짝지어 제자리에서 바뀐다.
   *
   * @returns 발행 성공 여부. false 면 낙관적 말풍선은 이미 걷어냈다(화면이 글을 되돌린다)
   */
  send: (relationId: number, payload: OutgoingMessage, optimistic?: ChatMessage) => Promise<boolean>;
  markRead: (messageId: number) => Promise<void>;
  /** REST 응답으로 받은 메시지를 목록에서 제자리 교체 (리액션·수정·삭제) */
  replaceMessage: (relationId: number, updated: ChatMessage) => void;
  /** 공지 고정 토글 — 서버 응답(REST)으로 즉시 반영하고, 상대 쪽은 STOMP 구독이 반영한다 */
  togglePin: (relationId: number, messageId: number) => Promise<void>;
  /** 명시적 고정 해제(배너 X) */
  unpin: (relationId: number) => Promise<void>;
  teardown: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  messages: {},
  loadingRooms: false,
  connected: false,
  loadingOlder: {},
  hasMoreOlder: {},
  pinnedMessages: {},
  activeRoomId: null,

  loadRooms: async () => {
    set({ loadingRooms: true });
    try {
      const rooms = await chatApi.rooms();
      set({ rooms });
    } finally {
      set({ loadingRooms: false });
    }
  },

  // 방 진입: 히스토리 로드 + 소켓 구독 등록 + 연결
  openRoom: async (relationId) => {
    set({ activeRoomId: relationId });
    const history = await chatApi.messages(relationId);
    set((s) => ({
      messages: { ...s.messages, [relationId]: history },
      // 재진입 시 과거 로드 상태 초기화 — 첫 페이지가 꽉 찼다면 더 있을 수 있다
      hasMoreOlder: { ...s.hasMoreOlder, [relationId]: history.length > 0 },
    }));

    /*
     * 구독을 <b>연결보다 먼저</b> 등록한다. chatSocket 의 구독은 "지금 거는 것"이 아니라
     * "걸려 있어야 하는 것"이라, 지금 연결이 안 돼 있어도 등록은 남고 연결되는 순간
     * (그리고 이후 모든 재연결마다) 자동으로 걸린다. 예전엔 connectSocket 이 성공한
     * 경우에만 구독했기 때문에, 첫 연결이 실패하면 이후 재연결이 되어도 영영 구독이 없었다.
     */
    subscribeRoom(relationId, (msg) => {
      set((s) => {
        const existing = s.messages[relationId] ?? [];
        if (existing.some((m) => m.id === msg.id)) return s;
        /*
         * 내 낙관적 말풍선의 에코라면 새로 쌓지 않고 그 자리에서 바꾼다 — 짝짓는 열쇠는
         * clientMessageId 다. 내용으로 짝지으면 같은 말을 두 번 보낼 때 엉뚱한 말풍선이
         * 사라진다. 서버가 같은 키로 두 번 브로드캐스트해도(동시 도착 경합) 두 번째는
         * 위의 id 검사에서 걸린다.
         */
        const key = msg.clientMessageId;
        if (key) {
          const at = existing.findIndex((m) => m.pending && m.clientMessageId === key);
          if (at >= 0) {
            const next = [...existing];
            next[at] = msg;
            return { messages: { ...s.messages, [relationId]: next } };
          }
        }
        return { messages: { ...s.messages, [relationId]: [msg, ...existing] } };
      });
    });
    // 리액션·수정·삭제로 바뀐 메시지를 제자리에서 교체한다
    subscribeRoomUpdates(relationId, (updated) => {
      set((s) => ({
        messages: {
          ...s.messages,
          [relationId]: (s.messages[relationId] ?? []).map((m) =>
            m.id === updated.id ? updated : m,
          ),
        },
      }));
    });
    // 공지 고정 상태 — 내가 고정하든 상대가 고정하든 방 전체에 브로드캐스트된다
    subscribeRoomPin(relationId, ({ pinned }) => {
      set((s) => ({ pinnedMessages: { ...s.pinnedMessages, [relationId]: pinned } }));
    });
    // 방금 등록한 구독보다 먼저 요청해도 무방하다 — 초기값일 뿐, 이후 변경은 위 구독이 반영한다
    chatApi
      .getPinned(relationId)
      .then((pinned) => set((s) => ({ pinnedMessages: { ...s.pinnedMessages, [relationId]: pinned } })))
      .catch(() => undefined);
    // 상대가 읽으면 내가 보낸 메시지에 "읽음"을 붙인다
    subscribeRoomRead(relationId, ({ lastReadMessageId }) => {
      set((s) => {
        const existing = s.messages[relationId] ?? [];
        // pending 은 임시 음수 id 라 어떤 lastReadMessageId 보다도 작다 — 빼지 않으면 "읽음"이 붙는다
        if (!existing.some((m) => !m.isRead && !m.pending && m.id <= lastReadMessageId)) return s;
        return {
          messages: {
            ...s.messages,
            [relationId]: existing.map((m) =>
              m.isRead || m.pending || m.id > lastReadMessageId ? m : { ...m, isRead: true },
            ),
          },
        };
      });
    });

    /*
     * 연결은 <b>기다리지 않는다</b>. 구독은 이미 등록됐으니 붙는 순간 적용되고, 히스토리는
     * 위에서 REST 로 이미 받았다. 여기서 기다리면 오프라인일 때 대화가 다 있는데도 화면이
     * 로딩 스피너에 묶인다(호출부가 openRoom 의 완료로 로딩을 푼다).
     *
     * <p>이미 붙어 있던 소켓이면 상태가 바뀌지 않아 재연결 따라잡기가 돌지 않는다. 그런데 위에서 히스토리를
     * 받은 뒤 구독이 걸리기 전까지 온 메시지는 어디에도 없다 — 그 틈을 한 번 메운다(보통 받을 게 없어 상태가 그대로다).
     */
    if (socketStatus() === 'connected') void get().syncMissed(relationId).catch(() => undefined);
    void connectSocket().catch(() => undefined);
  },

  closeRoom: (relationId) => {
    unsubscribeRoom(relationId);
    // 빠르게 방을 옮기면(A 진입→B 진입→A 의 언마운트 cleanup 순으로) A 의 closeRoom 이
    // B 가 이미 activeRoomId 로 세워둔 값을 지울 수 있다 — 지금 값이 정말 이 방일 때만 비운다.
    if (get().activeRoomId === relationId) set({ activeRoomId: null });
  },

  /*
   * 과거 메시지 페이징 — 서버는 처음부터 cursor 를 지원했지만 화면이 첫 페이지만
   * 받고 있었다(그 이전 대화를 앱에서 볼 방법이 없었음). 목록이 최신순이므로
   * 배열 마지막 항목이 가장 오래된 메시지 = 다음 커서다.
   */
  loadOlder: async (relationId) => {
    const { messages, loadingOlder, hasMoreOlder } = get();
    if (loadingOlder[relationId] || hasMoreOlder[relationId] === false) return;
    const existing = messages[relationId] ?? [];
    const oldest = existing[existing.length - 1];
    if (!oldest) return;

    set((s) => ({ loadingOlder: { ...s.loadingOlder, [relationId]: true } }));
    try {
      const older = await chatApi.messages(relationId, oldest.id);
      set((s) => {
        const cur = s.messages[relationId] ?? [];
        // 소켓 수신·재조회와 겹칠 수 있어 id 기준으로 중복을 거른다
        const seen = new Set(cur.map((m) => m.id));
        const fresh = older.filter((m) => !seen.has(m.id));
        return {
          messages: { ...s.messages, [relationId]: [...cur, ...fresh] },
          hasMoreOlder: { ...s.hasMoreOlder, [relationId]: older.length > 0 },
        };
      });
    } finally {
      set((s) => ({ loadingOlder: { ...s.loadingOlder, [relationId]: false } }));
    }
  },

  /*
   * 발행 전에 연결을 보장한다. 예전엔 publishMessage 로 바로 쏘고 연결이 없으면 실패였는데,
   * 재연결이 3초마다 도는 중이라 "잠시 후 다시"가 아니라 <b>지금 기다렸다 보내면 되는</b>
   * 상황이 대부분이었다 — 사용자에겐 "연결이 끊겼어요"만 반복해서 보였다.
   */
  send: async (relationId, payload, optimistic) => {
    if (optimistic) {
      set((s) => ({
        messages: { ...s.messages, [relationId]: [optimistic, ...(s.messages[relationId] ?? [])] },
      }));
    }
    const ok = await publishEnsuringConnection(relationId, payload);
    if (!ok && optimistic) {
      // 발행 자체가 실패했다 — 서버에 갈 일이 없으므로 말풍선을 걷는다(화면이 글을 되돌린다)
      set((s) => ({
        messages: {
          ...s.messages,
          [relationId]: (s.messages[relationId] ?? []).filter((m) => m.id !== optimistic.id),
        },
      }));
    }
    return ok;
  },

  replaceMessage: (relationId, updated) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [relationId]: (s.messages[relationId] ?? []).map((m) =>
          m.id === updated.id ? updated : m,
        ),
      },
    })),

  togglePin: async (relationId, messageId) => {
    const pinned = await chatApi.togglePin(messageId);
    set((s) => ({ pinnedMessages: { ...s.pinnedMessages, [relationId]: pinned } }));
  },

  unpin: async (relationId) => {
    await chatApi.unpin(relationId);
    set((s) => ({ pinnedMessages: { ...s.pinnedMessages, [relationId]: null } }));
  },

  /*
   * 따라잡기 — 서버의 최신 페이지부터 <b>과거로</b> 받아 내려가다가, 화면에 이미 있는 가장 최근 메시지와
   * 겹치면 멈춘다. 예전엔 최신 30건만 받아 붙였다. 끊긴 사이 30건 넘게 오면 그 아래가 빈 채로 남았고,
   * loadOlder 의 커서는 화면의 가장 오래된 것이라 그 구멍은 방을 다시 열 때까지 메워지지 않았다
   * (docs/chat-current-state.md §8-2 ②).
   *
   * <p>상한(SYNC_MAX_PAGES)까지 내려가도 못 이으면 붙이지 않고 <b>목록을 받은 것으로 갈아끼운다</b> —
   * 위쪽은 loadOlder 가 다시 채운다. 보던 위치는 잃지만 구멍 난 대화를 보여 주는 것보다 낫다.
   */
  syncMissed: async (relationId) => {
    /*
     * 겹친 호출(복귀·재연결이 함께 오는 경우)은 한 번으로 모으되 <b>버리지 않는다</b> — 진행 중인 요청은
     * 새 구독이 걸리기 전의 스냅숏일 수 있다. 끝난 뒤 한 번 더 돌린다(그때는 보통 받을 게 없다).
     */
    if (syncing.has(relationId)) {
      syncAgain.add(relationId);
      return;
    }
    syncing.add(relationId);
    try {
      do {
        syncAgain.delete(relationId);
        await syncMissedNow(relationId);
      } while (syncAgain.has(relationId));
    } finally {
      syncing.delete(relationId);
      syncAgain.delete(relationId);
    }
  },

  markRead: async (messageId) => {
    await chatApi.markRead(messageId);
    // 방 목록의 unreadCount(하단 탭 배지 소스)를 서버 기준으로 다시 맞춘다 —
    // 낙관적 차감 대신 재조회하는 이유는 부재중 통화 카드처럼 서버가 대신 남긴
    // 메시지까지 포함해 정확한 값을 보장하기 위함.
    void get().loadRooms();
  },

  teardown: () => {
    disconnectSocket();
    set({ connected: false });
  },
}));

/** 따라잡기가 진행 중인 방 — 겹친 호출을 하나로 모은다. */
const syncing = new Set<number>();
/** 진행 중에 또 불린 방 — 끝나면 한 번 더 돈다. */
const syncAgain = new Set<number>();

/**
 * 따라잡기 한 번에 받을 최대 페이지 수(서버 페이지 30건 × 10 = 300건). 이보다 많이 놓쳤으면
 * 잇지 않고 갈아끼운다(syncMissed 주석).
 */
const SYNC_MAX_PAGES = 10;

async function syncMissedNow(relationId: number): Promise<void> {
  const newestKnown = newestKnownId(useChatStore.getState().messages[relationId] ?? []);
  const { latest, bridged } = await fetchUntilBridged(
    (cursor) => chatApi.messages(relationId, cursor),
    newestKnown,
    SYNC_MAX_PAGES,
  );
  useChatStore.setState((s) => {
    const merged = mergeSynced(s.messages[relationId] ?? [], latest, bridged);
    if (!merged) return s;
    return {
      messages: { ...s.messages, [relationId]: merged.list },
      ...(merged.resetOlder ? { hasMoreOlder: { ...s.hasMoreOlder, [relationId]: true } } : {}),
    };
  });
}

/*
 * connected 는 소켓의 실제 상태를 따라간다.
 *
 * 예전엔 openRoom 이 성공할 때 한 번 true 로 세우고 끝이라, 그 뒤로 소켓이 끊겨도 계속
 * true 였다 — 화면은 "연결됨"인데 메시지는 안 오는, 가장 헷갈리는 상태였다.
 *
 * <p><b>연결될 때마다 열린 방을 따라잡는다.</b> 소켓은 붙은 뒤의 메시지만 준다. 예전엔 따라잡기를
 * 앱이 포그라운드로 돌아올 때만 해서, 앱을 켠 채 소켓만 끊겼다 붙으면(이동 중 등) 그 사이 메시지가 방을
 * 다시 열 때까지 안 보였다 — 방을 보고 있으니 푸시도 억눌려 있었다(docs/chat-current-state.md §8-2 ①).
 * 첫 연결에도 돈다: 방 진입 시 REST 로 히스토리를 받은 뒤 구독이 걸리기 전까지 온 메시지도 같은 공백이다.
 * 구독은 chatSocket 의 onConnect 가 상태를 'connected' 로 바꾸기 <b>전에</b> 다시 걸어 두므로, 여기서
 * 받는 REST 결과와 이후 소켓 수신 사이에 틈이 없다.
 */
subscribeSocketStatus((next) => {
  useChatStore.setState({ connected: next === 'connected' });
  if (next !== 'connected') return;
  const roomId = useChatStore.getState().activeRoomId;
  if (roomId != null) void useChatStore.getState().syncMissed(roomId).catch(() => undefined);
});
useChatStore.setState({ connected: socketStatus() === 'connected' });

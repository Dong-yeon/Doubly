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
  subscribeRoomRead,
  subscribeRoomUpdates,
  subscribeSocketStatus,
  unsubscribeRoom,
} from '../api/chatSocket';
import type { ChatMessage, ChatRoom } from '../types';

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
  /**
   * 지금 화면에 열려 있는 채팅방 — openRoom/closeRoom 이 관리한다. push.ts 가 이 값을
   * 읽어서, 지금 보고 있는 방으로 온 알림은 배너·소리를 억누른다(메시지는 소켓으로
   * 이미 화면에 실시간으로 뜨는데, 알림까지 겹쳐 오면 "방에 들어와 있는데도 알림이
   * 계속 온다"는 체감이 든다 — 2026-08-31 리포트).
   */
  activeRoomId: number | null;

  loadRooms: () => Promise<void>;
  /**
   * 끊겨 있는 동안 놓친 메시지를 따라잡는다 — 앱이 포그라운드로 돌아올 때 부른다.
   * 소켓은 <b>연결된 뒤에 오는</b> 메시지만 주므로, 끊긴 사이의 공백은 REST 로 메운다.
   */
  syncMissed: (relationId: number) => Promise<void>;
  openRoom: (relationId: number) => Promise<void>;
  closeRoom: (relationId: number) => void;
  /** 위로 스크롤 시 과거 메시지 한 페이지 추가 로드 (커서 = 가장 오래된 메시지 id) */
  loadOlder: (relationId: number) => Promise<void>;
  send: (relationId: number, payload: OutgoingMessage) => Promise<boolean>;
  markRead: (messageId: number) => Promise<void>;
  /** REST 응답으로 받은 메시지를 목록에서 제자리 교체 (리액션·수정·삭제) */
  replaceMessage: (relationId: number, updated: ChatMessage) => void;
  teardown: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  messages: {},
  loadingRooms: false,
  connected: false,
  loadingOlder: {},
  hasMoreOlder: {},
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
    // 상대가 읽으면 내가 보낸 메시지에 "읽음"을 붙인다
    subscribeRoomRead(relationId, ({ lastReadMessageId }) => {
      set((s) => {
        const existing = s.messages[relationId] ?? [];
        if (!existing.some((m) => !m.isRead && m.id <= lastReadMessageId)) return s;
        return {
          messages: {
            ...s.messages,
            [relationId]: existing.map((m) =>
              m.isRead || m.id > lastReadMessageId ? m : { ...m, isRead: true },
            ),
          },
        };
      });
    });

    /*
     * 연결은 <b>기다리지 않는다</b>. 구독은 이미 등록됐으니 붙는 순간 적용되고, 히스토리는
     * 위에서 REST 로 이미 받았다. 여기서 기다리면 오프라인일 때 대화가 다 있는데도 화면이
     * 로딩 스피너에 묶인다(호출부가 openRoom 의 완료로 로딩을 푼다).
     */
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
  send: (relationId, payload) => publishEnsuringConnection(relationId, payload),

  replaceMessage: (relationId, updated) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [relationId]: (s.messages[relationId] ?? []).map((m) =>
          m.id === updated.id ? updated : m,
        ),
      },
    })),

  syncMissed: async (relationId) => {
    const latest = await chatApi.messages(relationId);
    set((s) => {
      const cur = s.messages[relationId] ?? [];
      const seen = new Set(cur.map((m) => m.id));
      const fresh = latest.filter((m) => !seen.has(m.id));
      // 놓친 게 없으면 상태를 그대로 둔다 — 불필요한 리렌더·스크롤 튐 방지.
      // 읽음 표시 갱신도 같이 반영해야 하므로 기존 항목은 최신본으로 덮어쓴다.
      const byId = new Map(latest.map((m) => [m.id, m]));
      if (fresh.length === 0 && cur.every((m) => !byId.has(m.id) || byId.get(m.id)!.isRead === m.isRead)) {
        return s;
      }
      return {
        messages: {
          ...s.messages,
          [relationId]: [...fresh, ...cur.map((m) => byId.get(m.id) ?? m)],
        },
      };
    });
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

/*
 * connected 는 소켓의 실제 상태를 따라간다.
 *
 * 예전엔 openRoom 이 성공할 때 한 번 true 로 세우고 끝이라, 그 뒤로 소켓이 끊겨도 계속
 * true 였다 — 화면은 "연결됨"인데 메시지는 안 오는, 가장 헷갈리는 상태였다.
 */
subscribeSocketStatus((next) => {
  useChatStore.setState({ connected: next === 'connected' });
});
useChatStore.setState({ connected: socketStatus() === 'connected' });

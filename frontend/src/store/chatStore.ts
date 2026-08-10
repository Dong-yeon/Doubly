/** 채팅 상태 스토어 — 설계서 3.4 / 4.5 */
import { create } from 'zustand';
import { chatApi } from '../api/chat';
import {
  connectSocket,
  disconnectSocket,
  OutgoingMessage,
  publishMessage,
  subscribeRoom,
  subscribeRoomRead,
  subscribeRoomUpdates,
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

  loadRooms: () => Promise<void>;
  openRoom: (relationId: number) => Promise<void>;
  closeRoom: (relationId: number) => void;
  /** 위로 스크롤 시 과거 메시지 한 페이지 추가 로드 (커서 = 가장 오래된 메시지 id) */
  loadOlder: (relationId: number) => Promise<void>;
  send: (relationId: number, payload: OutgoingMessage) => boolean;
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

  loadRooms: async () => {
    set({ loadingRooms: true });
    try {
      const rooms = await chatApi.rooms();
      set({ rooms });
    } finally {
      set({ loadingRooms: false });
    }
  },

  // 방 진입: 히스토리 로드 + 소켓 연결/구독
  openRoom: async (relationId) => {
    const history = await chatApi.messages(relationId);
    set((s) => ({
      messages: { ...s.messages, [relationId]: history },
      // 재진입 시 과거 로드 상태 초기화 — 첫 페이지가 꽉 찼다면 더 있을 수 있다
      hasMoreOlder: { ...s.hasMoreOlder, [relationId]: history.length > 0 },
    }));

    try {
      await connectSocket();
      set({ connected: true });
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
    } catch {
      set({ connected: false });
    }
  },

  closeRoom: (relationId) => {
    unsubscribeRoom(relationId);
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

  send: (relationId, payload) => publishMessage(relationId, payload),

  replaceMessage: (relationId, updated) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [relationId]: (s.messages[relationId] ?? []).map((m) =>
          m.id === updated.id ? updated : m,
        ),
      },
    })),

  markRead: async (messageId) => {
    await chatApi.markRead(messageId);
  },

  teardown: () => {
    disconnectSocket();
    set({ connected: false });
  },
}));

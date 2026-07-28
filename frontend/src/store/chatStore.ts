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

  loadRooms: () => Promise<void>;
  openRoom: (relationId: number) => Promise<void>;
  closeRoom: (relationId: number) => void;
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
    set((s) => ({ messages: { ...s.messages, [relationId]: history } }));

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

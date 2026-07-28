/**
 * STOMP over WebSocket 클라이언트 — 설계서 4.5.
 * /pub/chat/{relationId} 로 발행, /sub/rooms/{relationId} 구독.
 */
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import { STORAGE_KEYS, WS_BASE_URL } from '../constants/config';
import { storage } from '../utils/storage';
import type { ChatMessage, MessageType } from '../types';

let client: Client | null = null;
let connecting: Promise<Client> | null = null;
const subscriptions = new Map<number, StompSubscription>();
const readSubscriptions = new Map<number, StompSubscription>();
const updateSubscriptions = new Map<number, StompSubscription>();
const coupleSubscriptions = new Map<number, StompSubscription>();

export interface OutgoingMessage {
  messageType?: MessageType;
  content?: string;
  imageUrl?: string;
  workoutId?: number;
  routineId?: number;
  /** 답장 — 인용할 메시지 id (같은 방이어야 한다) */
  replyToId?: number;
}

/** 소켓 연결 (이미 연결됐거나 연결 중이면 재사용). */
export async function connectSocket(): Promise<Client> {
  if (client?.connected) return client;
  if (connecting) return connecting; // 진행 중인 연결 공유 (중복 Client 생성 방지)

  connecting = (async () => {
    const token = await storage.getItem(STORAGE_KEYS.accessToken);
    const c = new Client({
      brokerURL: WS_BASE_URL,
      connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      reconnectDelay: 3000,
      // React Native WebSocket 호환 플래그
      forceBinaryWSFrames: true,
      appendMissingNULLonIncoming: true,
    });
    client = c;

    return new Promise<Client>((resolve, reject) => {
      c.onConnect = () => resolve(c);
      c.onStompError = (frame) => reject(new Error(frame.headers['message'] ?? 'STOMP 오류'));
      c.onWebSocketError = () => reject(new Error('WebSocket 연결 실패'));
      c.activate();
    });
  })().finally(() => {
    connecting = null;
  });

  return connecting;
}

export function subscribeRoom(relationId: number, onMessage: (msg: ChatMessage) => void) {
  if (!client?.connected) return;
  unsubscribeRoom(relationId);
  const sub = client.subscribe(`/sub/rooms/${relationId}`, (frame: IMessage) => {
    try {
      onMessage(JSON.parse(frame.body) as ChatMessage);
    } catch {
      // ignore malformed frame
    }
  });
  subscriptions.set(relationId, sub);
}

export function unsubscribeRoom(relationId: number) {
  subscriptions.get(relationId)?.unsubscribe();
  subscriptions.delete(relationId);
  readSubscriptions.get(relationId)?.unsubscribe();
  readSubscriptions.delete(relationId);
  updateSubscriptions.get(relationId)?.unsubscribe();
  updateSubscriptions.delete(relationId);
}

/**
 * 메시지 변경 구독 (/sub/rooms/{relationId}/updates).
 * 리액션·수정·삭제로 <b>기존 메시지가 바뀐</b> 경우가 온다. 새 메시지 스트림과
 * 채널을 나눈 이유는 서버 ReadReceipt 주석 참고.
 */
export function subscribeRoomUpdates(relationId: number, onUpdate: (msg: ChatMessage) => void) {
  if (!client?.connected) return;
  updateSubscriptions.get(relationId)?.unsubscribe();
  const sub = client.subscribe(`/sub/rooms/${relationId}/updates`, (frame: IMessage) => {
    try {
      onUpdate(JSON.parse(frame.body) as ChatMessage);
    } catch {
      // ignore malformed frame
    }
  });
  updateSubscriptions.set(relationId, sub);
}

/**
 * 읽음 확인 구독 (/sub/rooms/{relationId}/read).
 * 상대가 내 메시지를 읽으면 lastReadMessageId 가 온다 — 그 이하의 내 메시지에 "읽음"을 붙인다.
 * 메시지 스트림과 채널을 나눈 이유는 서버 ReadReceipt 주석 참고.
 */
export function subscribeRoomRead(
  relationId: number,
  onRead: (receipt: { readerId: number; lastReadMessageId: number }) => void,
) {
  if (!client?.connected) return;
  readSubscriptions.get(relationId)?.unsubscribe();
  const sub = client.subscribe(`/sub/rooms/${relationId}/read`, (frame: IMessage) => {
    try {
      onRead(JSON.parse(frame.body));
    } catch {
      // ignore malformed frame
    }
  });
  readSubscriptions.set(relationId, sub);
}

/** 커플 실시간 이벤트 구독 (/sub/couple/{relationId}) — 배경/기념일/운동 변경 알림 */
export function subscribeCouple(relationId: number, onEvent: (type: string) => void) {
  if (!client?.connected) return;
  unsubscribeCouple(relationId);
  const sub = client.subscribe(`/sub/couple/${relationId}`, (frame: IMessage) => {
    try {
      const data = JSON.parse(frame.body) as { type?: string };
      onEvent(data.type ?? '');
    } catch {
      onEvent('');
    }
  });
  coupleSubscriptions.set(relationId, sub);
}

export function unsubscribeCouple(relationId: number) {
  coupleSubscriptions.get(relationId)?.unsubscribe();
  coupleSubscriptions.delete(relationId);
}

export function publishMessage(relationId: number, payload: OutgoingMessage): boolean {
  if (!client?.connected) return false;
  client.publish({
    destination: `/pub/chat/${relationId}`,
    body: JSON.stringify(payload),
  });
  return true;
}

/** 연결을 보장한 뒤 발행 (채팅방 밖에서 운동 카드 공유 등) */
export async function publishEnsuringConnection(
  relationId: number,
  payload: OutgoingMessage,
): Promise<boolean> {
  try {
    await connectSocket();
  } catch {
    return false;
  }
  return publishMessage(relationId, payload);
}

export function disconnectSocket() {
  subscriptions.forEach((s) => s.unsubscribe());
  subscriptions.clear();
  readSubscriptions.forEach((s) => s.unsubscribe());
  readSubscriptions.clear();
  updateSubscriptions.forEach((s) => s.unsubscribe());
  updateSubscriptions.clear();
  coupleSubscriptions.forEach((s) => s.unsubscribe());
  coupleSubscriptions.clear();
  client?.deactivate();
  client = null;
  connecting = null;
}

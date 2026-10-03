/**
 * STOMP over WebSocket 클라이언트 — 설계서 4.5.
 * /pub/chat/{relationId} 로 발행, /sub/rooms/{relationId} 구독.
 *
 * <p><b>재연결은 구독까지 되살려야 끝난다.</b> stompjs 는 {@code reconnectDelay} 로 소켓만
 * 다시 붙여줄 뿐, 이전 소켓에 걸어둔 구독은 함께 사라진다. 예전엔 구독을 화면에서 한 번만
 * 걸었기 때문에, 백그라운드에 다녀오거나 지하철에서 잠깐 끊기면 <b>소켓은 살아있는데 상대
 * 메시지만 조용히 안 오는</b> 상태가 됐다(화면은 정상으로 보인다 — 더 나쁘다).
 *
 * <p>그래서 구독을 "지금 걸린 것"이 아니라 <b>"걸려 있어야 하는 것"(desired)</b>으로 들고
 * 있다가, 연결될 때마다 통째로 다시 적용한다. 화면은 원하는 구독을 등록만 하면 되고
 * 재연결을 신경 쓰지 않는다.
 */
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import { STORAGE_KEYS, WS_BASE_URL } from '../constants/config';
import { storage } from '../utils/storage';
import { refreshAccessToken } from './client';
import type { ChatMessage, GameReactionEvent, MessageType, PuzzleBattleEvent } from '../types';

/** /sub/rooms/{relationId}/pin 페이로드 — 백엔드 ChatPinResponse 와 짝. */
export interface PinEvent {
  relationId: number;
  pinned: ChatMessage | null;
}

let client: Client | null = null;
let connecting: Promise<Client> | null = null;

/**
 * 걸려 있어야 하는 구독 — destination → 프레임 핸들러.
 * 연결이 끊겨 있어도 남아 있고, 연결될 때마다 {@link applyDesiredSubscriptions} 가 되살린다.
 */
const desired = new Map<string, (frame: IMessage) => void>();
/** 지금 실제로 걸린 구독 — 소켓이 끊기면 통째로 무효라 비운다. */
const active = new Map<string, StompSubscription>();

/**
 * 직전 시도가 서버에 <b>거절</b>당했는가(STOMP ERROR 프레임). 참이면 다음 연결 전에
 * 토큰을 갱신한다 — 아래 {@code beforeConnect} 주석 참고.
 * 단순 네트워크 끊김은 ERROR 프레임 없이 소켓만 닫히므로 여기 걸리지 않는다.
 */
let rejectedByServer = false;
/**
 * 갱신 시도 횟수 — 연결에 성공하면 0 으로 돌아간다. 토큰이 아니라 다른 이유로
 * (예: 종료된 관계를 구독) 거절당하는 경우 3초마다 갱신을 반복하지 않도록 상한을 둔다.
 */
let refreshAttempts = 0;
const MAX_REFRESH_ATTEMPTS = 2;

export type SocketStatus = 'connecting' | 'connected' | 'disconnected';
let status: SocketStatus = 'disconnected';
const statusListeners = new Set<(s: SocketStatus) => void>();

export function socketStatus(): SocketStatus {
  return status;
}

/** 연결 상태 변화 구독 — 화면이 "연결 중…" 배너를 그리는 데 쓴다. 해제 함수를 돌려준다. */
export function subscribeSocketStatus(listener: (s: SocketStatus) => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function setStatus(next: SocketStatus) {
  if (status === next) return;
  status = next;
  statusListeners.forEach((l) => l(next));
}

export interface OutgoingMessage {
  messageType?: MessageType;
  content?: string;
  imageUrl?: string;
  workoutId?: number;
  routineId?: number;
  /** 답장 — 인용할 메시지 id (같은 방이어야 한다) */
  replyToId?: number;
  /**
   * 멱등키 — 서버가 {@code (relation_id, client_message_id)} 로 중복을 거른다(V89).
   *
   * <p>STOMP 발행은 fire-and-forget 이라 이 함수가 true 를 돌려줘도 서버가 저장했다는 뜻이
   * 아니다. 서버가 밀리는 동안 사용자가 다시 누르면 프레임이 쌓이는데, 이 키가 있으면
   * 서버가 두 번째를 저장하지 않고 먼저 저장한 메시지를 다시 브로드캐스트한다.
   */
  clientMessageId?: string;
  /** 문구 스티커(TEXT_STICKER)가 얹힐 캐릭터 스티커 코드 — 다른 타입에서는 서버가 무시한다 */
  stickerCode?: string;
}

/** 연결돼 있으면 즉시 구독하고, 아니면 다음 연결 때 {@link applyDesiredSubscriptions} 가 건다. */
function register(destination: string, handler: (frame: IMessage) => void) {
  desired.set(destination, handler);
  if (client?.connected) {
    active.get(destination)?.unsubscribe();
    active.set(destination, client.subscribe(destination, handler));
  }
}

function unregister(destination: string) {
  desired.delete(destination);
  active.get(destination)?.unsubscribe();
  active.delete(destination);
}

/** 연결 직후 — 이전 소켓의 구독은 이미 죽었으므로 원하는 구독을 전부 새로 건다. */
function applyDesiredSubscriptions(c: Client) {
  active.clear();
  desired.forEach((handler, destination) => {
    active.set(destination, c.subscribe(destination, handler));
  });
}

/** JSON 프레임을 파싱해 넘긴다 — 깨진 프레임 하나가 구독을 죽이지 않게 감싼다. */
function jsonHandler<T>(onValue: (value: T) => void) {
  return (frame: IMessage) => {
    try {
      onValue(JSON.parse(frame.body) as T);
    } catch {
      // ignore malformed frame
    }
  };
}

function createClient(): Client {
  const c = new Client({
    brokerURL: WS_BASE_URL,
    reconnectDelay: 3000,
    // React Native WebSocket 호환 플래그
    forceBinaryWSFrames: true,
    appendMissingNULLonIncoming: true,
  });

  /*
   * 연결 <b>시도마다</b> 토큰을 다시 읽는다.
   *
   * 예전엔 Client 를 만들 때의 access token 을 connectHeaders 에 고정했다. access token 수명이
   * 30분이라, 앱을 켠 지 30분이 지난 뒤의 재연결은 서버 CONNECT 검증에서 거절되고
   * (StompAuthChannelInterceptor) stompjs 는 같은 만료 토큰으로 3초마다 영원히 재시도했다.
   * 앱을 껐다 켜기 전에는 채팅이 돌아오지 않는 상태였다.
   *
   * 서버가 거절한 직후라면(rejectedByServer) 만료가 가장 유력하므로 갱신까지 하고 붙는다.
   * 갱신이 실패해도(네트워크 문제) 있는 토큰으로 그냥 시도한다 — 여기서 로그아웃시키면
   * 잠깐 끊긴 것만으로 로그인 화면으로 튕긴다.
   */
  c.beforeConnect = async () => {
    setStatus('connecting');
    if (rejectedByServer && refreshAttempts < MAX_REFRESH_ATTEMPTS) {
      rejectedByServer = false;
      refreshAttempts += 1;
      try {
        await refreshAccessToken();
      } catch {
        // 갱신 실패 — 아래에서 기존 토큰으로 시도한다
      }
    }
    const token = await storage.getItem(STORAGE_KEYS.accessToken);
    c.connectHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  };

  c.onConnect = () => {
    rejectedByServer = false;
    refreshAttempts = 0;
    applyDesiredSubscriptions(c);
    setStatus('connected');
  };

  // 서버가 CONNECT/SUBSCRIBE 를 거절 — 토큰 만료가 가장 흔한 원인이다
  c.onStompError = () => {
    rejectedByServer = true;
  };

  c.onWebSocketClose = () => {
    active.clear(); // 이 소켓의 구독 객체는 전부 무효 (desired 는 그대로 둔다)
    setStatus('disconnected');
  };

  return c;
}

/**
 * 소켓 연결 (이미 연결됐거나 연결 중이면 재사용).
 *
 * <p>한 번 만든 Client 는 계속 살려 둔다 — stompjs 가 알아서 재연결하고, 위 onConnect 가
 * 구독을 되살린다. 첫 연결이 실패했다고 Client 를 버리고 새로 만들면 <b>소켓이 두 개</b>가
 * 되어 같은 메시지를 두 번 받는다.
 */
export async function connectSocket(): Promise<Client> {
  ensureSendErrorSubscription();
  if (client?.connected) return client;
  if (connecting) return connecting; // 진행 중인 연결 공유 (중복 Client 생성 방지)

  const c = client ?? createClient();
  client = c;

  connecting = new Promise<Client>((resolve, reject) => {
    const previousOnConnect = c.onConnect;
    const previousOnStompError = c.onStompError;
    const previousOnWebSocketError = c.onWebSocketError;
    const restore = () => {
      c.onConnect = previousOnConnect;
      c.onStompError = previousOnStompError;
      c.onWebSocketError = previousOnWebSocketError;
    };
    c.onConnect = (frame) => {
      restore();
      previousOnConnect(frame);
      resolve(c);
    };
    c.onStompError = (frame) => {
      restore();
      previousOnStompError(frame);
      reject(new Error(frame.headers['message'] ?? 'STOMP 오류'));
    };
    c.onWebSocketError = () => {
      restore();
      reject(new Error('WebSocket 연결 실패'));
    };
    // 이미 활성화된 Client 는 재연결 타이머가 돌고 있으므로 activate 를 다시 부르지 않는다
    if (!c.active) c.activate();
  }).finally(() => {
    connecting = null;
  });

  return connecting;
}

/**
 * 전송 거절 알림 — 서버가 STOMP 전송을 거절하면 보낸 사람에게만 온다(백엔드 ChatSendError, /user/queue/chat-errors).
 * 예전엔 이 길이 없어 거절된 말풍선이 "보내는 중"에 멈췄다(docs/chat-current-state.md §8-2 ③).
 */
export interface ChatSendError {
  /** 거절된 프레임의 멱등키 — 어느 말풍선인지 짝짓는다 */
  clientMessageId: string | null;
  /** 서버 ErrorCode 이름 */
  code: string;
  /** 사용자에게 보여 줄 문구 */
  message: string;
}

const SEND_ERRORS_DESTINATION = '/user/queue/chat-errors';
const sendErrorListeners = new Set<(e: ChatSendError) => void>();

/** 전송 거절을 듣는다 — 해제 함수를 돌려준다. 구독 자체는 connectSocket 이 챙긴다. */
export function onSendError(listener: (e: ChatSendError) => void): () => void {
  sendErrorListeners.add(listener);
  return () => sendErrorListeners.delete(listener);
}

/**
 * 거절 큐 구독을 "걸려 있어야 하는 것"에 올린다. 방 구독과 달리 방에 묶이지 않는다 — 식단 카드처럼 채팅방
 * 밖에서 보내는 것도 있다. disconnectSocket(로그아웃)이 desired 를 비우므로 연결할 때마다 다시 확인한다.
 */
function ensureSendErrorSubscription() {
  if (desired.has(SEND_ERRORS_DESTINATION)) return;
  register(
    SEND_ERRORS_DESTINATION,
    jsonHandler<ChatSendError>((e) => sendErrorListeners.forEach((l) => l(e))),
  );
}

export function subscribeRoom(relationId: number, onMessage: (msg: ChatMessage) => void) {
  register(`/sub/rooms/${relationId}`, jsonHandler(onMessage));
}

export function unsubscribeRoom(relationId: number) {
  unregister(`/sub/rooms/${relationId}`);
  unregister(`/sub/rooms/${relationId}/read`);
  unregister(`/sub/rooms/${relationId}/updates`);
  unregister(`/sub/rooms/${relationId}/pin`);
}

/**
 * 메시지 변경 구독 (/sub/rooms/{relationId}/updates).
 * 리액션·수정·삭제로 <b>기존 메시지가 바뀐</b> 경우가 온다. 새 메시지 스트림과
 * 채널을 나눈 이유는 서버 ReadReceipt 주석 참고.
 */
export function subscribeRoomUpdates(relationId: number, onUpdate: (msg: ChatMessage) => void) {
  register(`/sub/rooms/${relationId}/updates`, jsonHandler(onUpdate));
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
  register(`/sub/rooms/${relationId}/read`, jsonHandler(onRead));
}

/**
 * 공지 고정 상태 구독 (/sub/rooms/{relationId}/pin). 내가 고정하든 상대가 고정하든
 * 방 전체에 브로드캐스트되므로 양쪽 화면의 배너가 함께 갱신된다.
 */
export function subscribeRoomPin(relationId: number, onPin: (event: PinEvent) => void) {
  register(`/sub/rooms/${relationId}/pin`, jsonHandler(onPin));
}

/** 커플 채널을 듣는 화면들 — 관계 id 마다 리스너 묶음 */
const coupleListeners = new Map<number, Set<(type: string) => void>>();

/**
 * 커플 실시간 이벤트 구독 (/sub/couple/{relationId}) — 배경/기념일/운동/기록 변경 알림.
 * 돌려받은 함수를 부르면 <b>이 리스너만</b> 빠진다.
 *
 * <p>여러 화면이 같은 채널을 동시에 듣는다(홈·기록 목록·채팅방·게임). 예전엔 목적지 하나에 핸들러
 * 하나라 나중에 구독한 화면이 앞의 것을 덮어썼고, 한 화면이 해제하면 남은 화면의 구독까지 끊겼다.
 * 이제 STOMP 구독은 채널마다 하나만 두고, 들어온 이벤트를 모든 리스너에 나눠 준다.
 */
export function subscribeCouple(relationId: number, onEvent: (type: string) => void): () => void {
  let listeners = coupleListeners.get(relationId);
  if (!listeners) {
    const set = new Set<(type: string) => void>();
    listeners = set;
    coupleListeners.set(relationId, set);
    register(`/sub/couple/${relationId}`, (frame) => {
      let type = '';
      try {
        type = (JSON.parse(frame.body) as { type?: string }).type ?? '';
      } catch {
        // 깨진 프레임 — 타입 없이 "뭔가 바뀌었다"로만 알린다
      }
      // 리스너 하나가 던져도 나머지 화면은 받아야 한다
      [...set].forEach((fn) => {
        try {
          fn(type);
        } catch {
          // 무시
        }
      });
    });
  }
  listeners.add(onEvent);
  return () => {
    const current = coupleListeners.get(relationId);
    if (!current) return;
    current.delete(onEvent);
    if (current.size === 0) {
      coupleListeners.delete(relationId);
      unregister(`/sub/couple/${relationId}`);
    }
  };
}

/**
 * 게임 판 위 즉석 반응 구독 (/sub/couple/{relationId}/game-reaction).
 *
 * <p>커플 공용 채널과 목적지를 나눈 이유는 서버 {@code GameReactionEvent} 주석 참고 —
 * 저장하지 않는 신호라 "타입만 보내고 다시 조회한다"는 공용 채널 규칙을 쓸 수 없다.
 */
export function subscribeGameReaction(relationId: number, onReaction: (e: GameReactionEvent) => void) {
  register(`/sub/couple/${relationId}/game-reaction`, jsonHandler(onReaction));
}

export function unsubscribeGameReaction(relationId: number) {
  unregister(`/sub/couple/${relationId}/game-reaction`);
}

/**
 * 연쇄 퍼즐 대전 수(手) 중계 구독 (/sub/games/{relationId}) — docs/COUPLE_PUZZLE_BATTLE §3-2.
 *
 * <p>커플 공용 채널의 "타입만 보내고 REST 로 재조회" 규칙을 쓰지 않는다 — 수마다 재조회하면
 * 그 왕복이 곧 게임의 지연이다. 채팅처럼 페이로드(결과 판)를 그대로 싣는다. 내가 보낸 것도
 * 되돌아오므로 화면이 senderId 로 거른다.
 */
export function subscribeGames(relationId: number, onEvent: (e: PuzzleBattleEvent) => void) {
  register(`/sub/games/${relationId}`, jsonHandler(onEvent));
}

export function unsubscribeGames(relationId: number) {
  unregister(`/sub/games/${relationId}`);
}

/**
 * 수(手) 하나를 흘린다 — 연결이 없으면 <b>그냥 버린다</b>(false). 채팅과 달리 재연결을
 * 기다리지 않는다: 프레임마다 결과 판 전체가 실리므로 놓친 프레임은 다음 프레임이 덮고,
 * 상대가 아예 없으면(고스트 대전) 어차피 받을 사람이 없다. 기다리면 게임 루프가 멈춘다.
 */
export function publishGameEvent(relationId: number, payload: Omit<PuzzleBattleEvent, 'senderId'>): boolean {
  if (!client?.connected) return false;
  client.publish({
    destination: `/pub/games/${relationId}`,
    body: JSON.stringify(payload),
  });
  return true;
}

/** 저수준 발행 — 연결이 없으면 false. 화면은 아래 publishEnsuringConnection 을 쓴다. */
function publishMessage(relationId: number, payload: OutgoingMessage): boolean {
  if (!client?.connected) return false;
  client.publish({
    destination: `/pub/chat/${relationId}`,
    body: JSON.stringify(payload),
  });
  return true;
}

/**
 * 연결을 보장한 뒤 발행 — <b>전송 경로는 전부 이걸 써야 한다</b>.
 *
 * <p>{@link publishMessage} 만 쓰면 재연결이 끝나기 전에 보낸 메시지가 그냥 실패한다.
 * 사용자 입장에선 앱은 멀쩡한데 "연결이 끊겼어요"만 뜨는 상황이다 — 실제로는 3초 뒤면
 * 붙을 연결이었다.
 */
export async function publishEnsuringConnection(
  relationId: number,
  payload: OutgoingMessage,
): Promise<boolean> {
  /*
   * 멱등키가 없으면 여기서 붙인다 — 전송 경로가 여럿(텍스트·스티커·사진·음성·터치·식단 카드…)이라
   * 호출부마다 챙기게 두면 빠진다. 예전엔 TEXT 만 실어서 나머지는 서버 중복 방어(V89)를 못 받았다
   * (docs/chat-current-state.md §3-3). 낙관적 말풍선과 짝지어야 하는 호출부는 직접 만들어 넣는다.
   */
  const keyed = payload.clientMessageId ? payload : { ...payload, clientMessageId: newClientMessageId() };
  ensureSendErrorSubscription(); // 이미 붙은 소켓으로 바로 보내는 경로도 거절을 들을 수 있게
  if (client?.connected) return publishMessage(relationId, keyed);
  try {
    await withTimeout(connectSocket(), CONNECT_WAIT_MS);
  } catch {
    return false;
  }
  return publishMessage(relationId, keyed);
}

/**
 * 전송 멱등키 — 서버가 {@code (relation_id, client_message_id)} 로 중복을 거른다(V89).
 *
 * <p>UUID 라이브러리를 쓰지 않는 이유: 이 값이 유일해야 하는 범위는 <b>한 관계의 몇 초</b>
 * 뿐이고, 그 안에서 시각(ms)과 난수 8자가 겹칠 일은 없다. 의존성을 하나 더 들이는 대신
 * 필요한 만큼만 만든다. 컬럼 길이는 64 — 이 형식은 20자 안쪽이다.
 */
export function newClientMessageId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 재연결을 기다려 줄 최대 시간. 재연결 주기가 3초라 그 한 번은 충분히 기다려 주되,
 * 정말 오프라인일 때는 버튼이 무한정 먹통이 되지 않고 "연결이 끊겼어요"로 떨어지게 한다.
 */
const CONNECT_WAIT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('연결 대기 시간 초과')), ms);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function disconnectSocket() {
  active.forEach((s) => s.unsubscribe());
  active.clear();
  desired.clear();
  client?.deactivate();
  client = null;
  connecting = null;
  rejectedByServer = false;
  refreshAttempts = 0;
  setStatus('disconnected');
}

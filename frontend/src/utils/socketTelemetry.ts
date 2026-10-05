/**
 * 채팅 소켓 재연결 계측 — 앱이 <b>앞에 있는 동안</b> 소켓이 끊겨 있던 시간을 재고, 길면 원인 단서와 함께 보고한다.
 *
 * <p><b>왜 필요한가</b>(docs/server-stability-current-state.md §11-3): 운영 HTTP 로그에서 사용 중 끊긴 소켓이
 * 11~14초 뒤에야 다시 붙은 사례가 나왔다. 재연결 간격(3초)으로는 설명되지 않는데, 서버 로그만으로는
 * "앱이 끊김을 언제 알아챘는가(하트비트 20초?)·몇 번 시도했나·토큰 갱신이 걸렸나·백그라운드였나"를 가를 수 없다.
 * 그 단서는 앱에만 있다.
 *
 * <p><b>무엇을 재나</b>: "연결 중이에요" 띠가 보는 것과 같은 것 — 포그라운드에서 connected 가 아닌 시간.
 * 백그라운드에 있던 시간은 사용자가 기다린 게 아니므로 뺀다(백그라운드로 가면 그 구간을 닫고, 돌아오면 새로 잰다).
 *
 * <p><b>어디로 보내나</b>: {@link SLOW_MS} 이상이면 ① 서버 이벤트 CHAT_SOCKET_SLOW(요약 50자, 서버 로그에 남아
 * railway logs 로 셀 수 있다) ② Sentry 경고(최근 상태 전이 타임라인). 앱 세션당 {@link MAX_REPORTS} 건까지만 —
 * 무한 재연결 루프가 계측을 폭주시키지 않게 한다.
 *
 * <p>요약 형식: {@code 13.2s close1006 a3 r1/420 ok cell room}
 * = 끊겨 있던 초 · 끊긴 이유 · 연결 시도 수 · 토큰 갱신 횟수/총 ms · 끝난 방식(ok=다시 붙음, bg=붙기 전에 백그라운드) ·
 *   네트워크 종류 · 채팅방을 보고 있었는가(room/out — 띠는 채팅방에서만 보인다).
 */
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { track } from '../api/analytics';
import { addSocketBreadcrumb, reportSlowSocket } from './sentry';

/** 이 이상 끊겨 있으면 보고한다 — 띠는 2.5초 뒤에 뜨므로, 띠가 2.5초 넘게 떠 있던 경우다 */
const SLOW_MS = 5_000;
/** 앱 세션당 보고 상한 */
const MAX_REPORTS = 5;
/** Sentry 에 실을 최근 전이 수 */
const TIMELINE_SIZE = 30;

type Cause = 'init' | 'resume' | 'hb' | 'stomp' | `close${number}`;

let appActive = AppState.currentState === 'active';
let connected = false;
/** 이 앱 세션에서 한 번이라도 붙었는가 — 첫 연결(init)과 다시 붙기(resume)를 가른다 */
let everConnected = false;
/** 소켓이 살아 있어야 하는 상태인가 — 연결을 시도한 뒤부터 로그아웃(deactivate) 전까지. 아니면 끊김을 재지 않는다 */
let socketWanted = false;
let inRoom = false;
let reports = 0;

/** 지금 재고 있는 끊김 구간 — null 이면 재지 않는 중(연결됨 또는 백그라운드) */
let gap: {
  startedAt: number;
  cause: Cause;
  attempts: number;
  refreshes: number;
  refreshMs: number;
} | null = null;

/** 직전 끊김이 하트비트 유실로 시작됐는가 — onWebSocketClose 보다 먼저 온다 */
let heartbeatLost = false;

const timeline: string[] = [];

function mark(event: string, data?: Record<string, unknown>) {
  const entry = `${new Date().toISOString().slice(11, 23)} ${event}${data ? ` ${JSON.stringify(data)}` : ''}`;
  timeline.push(entry);
  if (timeline.length > TIMELINE_SIZE) timeline.shift();
  addSocketBreadcrumb(event, data);
}

function openGap(cause: Cause) {
  if (gap || connected || !appActive || !socketWanted) return;
  gap = { startedAt: Date.now(), cause, attempts: 0, refreshes: 0, refreshMs: 0 };
}

function closeGap(end: 'ok' | 'bg') {
  if (!gap) return;
  const finished = gap;
  gap = null;
  const elapsed = Date.now() - finished.startedAt;
  if (elapsed < SLOW_MS || reports >= MAX_REPORTS) return;
  reports += 1;
  const room = inRoom ? 'room' : 'out';
  const snapshot = [...timeline];
  void NetInfo.fetch()
    .then((s) => s.type)
    .catch(() => 'unknown')
    .then((net) => {
      const netShort = net === 'cellular' ? 'cell' : net;
      const summary = [
        `${(elapsed / 1000).toFixed(1)}s`,
        finished.cause,
        `a${finished.attempts}`,
        `r${finished.refreshes}/${finished.refreshMs}`,
        end,
        netShort,
        room,
      ].join(' ');
      track('CHAT_SOCKET_SLOW', summary);
      reportSlowSocket(summary, { socket_cause: finished.cause, socket_end: end, socket_net: netShort, socket_room: room }, snapshot);
    });
}

/** beforeConnect 가 불릴 때 — 연결 시도 하나 */
export function noteConnectAttempt() {
  mark('attempt');
  socketWanted = true;
  openGap(everConnected ? 'resume' : 'init');
  if (gap) gap.attempts += 1;
}

/** 토큰 갱신을 기다린 시간 — 재연결이 갱신에 묶였는지 본다 */
export function noteTokenRefresh(ms: number, ok: boolean) {
  mark('refresh', { ms, ok });
  if (gap) {
    gap.refreshes += 1;
    gap.refreshMs += ms;
  }
}

export function noteConnected() {
  mark('connected');
  connected = true;
  everConnected = true;
  heartbeatLost = false;
  closeGap('ok');
}

export function noteHeartbeatLost() {
  mark('heartbeat-lost');
  heartbeatLost = true;
}

export function noteStompError(message: string | undefined) {
  // 서버 문구는 고정된 한국어(토큰·구독 거절)라 사용자 입력이 섞이지 않는다
  mark('stomp-error', { message: message?.slice(0, 60) });
}

export function noteClosed(code: number | undefined) {
  mark('closed', { code });
  const wasConnected = connected;
  connected = false;
  const cause: Cause = heartbeatLost ? 'hb' : `close${code ?? 0}`;
  heartbeatLost = false;
  if (wasConnected) openGap(cause);
}

/** 로그아웃 등으로 소켓을 일부러 내린 경우 — 끊김이 아니므로 재던 구간을 버린다 */
export function noteDeactivated() {
  mark('deactivated');
  connected = false;
  socketWanted = false;
  gap = null;
}

/** 채팅방을 보고 있는가 — "연결 중이에요" 띠는 채팅방에서만 보인다 */
export function setSocketTelemetryInRoom(value: boolean) {
  inRoom = value;
}

AppState.addEventListener('change', (next: AppStateStatus) => {
  const active = next === 'active';
  if (active === appActive) return;
  appActive = active;
  mark(active ? 'app-active' : 'app-background');
  if (active) {
    openGap(everConnected ? 'resume' : 'init');
  } else {
    closeGap('bg');
  }
});

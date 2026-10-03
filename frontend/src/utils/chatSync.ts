/**
 * 채팅 따라잡기(syncMissed)의 순수 로직 — 네트워크·스토어 없이 돌아서 scripts/verify-chat-sync.mjs 가 검증한다.
 *
 * <p>소켓은 붙은 뒤의 메시지만 준다. 끊긴 사이의 메시지는 REST 로 받아야 하는데, 서버 API 는 "이 id 보다
 * 오래된 30건"(최신순 커서)뿐이다. 그래서 최신 페이지부터 <b>과거로</b> 내려가다 화면에 이미 있는 가장
 * 최근 메시지와 겹치면 멈춘다(docs/chat-current-state.md §8-2 ②).
 */
import type { ChatMessage } from '../types';

/** 최신 페이지부터 과거로 받아 화면의 대화와 이어질 때까지 내려간다. */
export async function fetchUntilBridged(
  fetchPage: (cursor?: number) => Promise<ChatMessage[]>,
  newestKnown: number,
  maxPages: number,
): Promise<{ latest: ChatMessage[]; bridged: boolean }> {
  const latest: ChatMessage[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < maxPages; page++) {
    const batch = await fetchPage(cursor);
    latest.push(...batch);
    const oldest = batch[batch.length - 1];
    // 빈 페이지 = 대화의 처음까지 왔다. 겹쳤다 = 화면의 대화와 이어졌다.
    if (!oldest || oldest.id <= newestKnown) return { latest, bridged: true };
    // 화면이 비어 있으면 이을 것도 없다 — 첫 페이지면 충분하다
    if (newestKnown === 0) return { latest, bridged: true };
    cursor = oldest.id;
  }
  return { latest, bridged: false };
}

/**
 * 서버에 아직 없는(내 화면에만 있는) 말풍선인가 — 보내는 중(pending)이거나 보내지 못했다(failed).
 * 둘 다 id 가 임시 음수라 읽음·리액션·수정·정렬 같은 경로가 이걸 보고 비켜나야 한다.
 */
export function isUnsent(m: ChatMessage): boolean {
  return !!(m.pending || m.failed);
}

/** 화면에 있는 서버 메시지 중 가장 큰 id — 내 화면에만 있는 말풍선(음수 임시 id)은 뺀다. 없으면 0. */
export function newestKnownId(list: ChatMessage[]): number {
  return list.reduce((max, m) => (isUnsent(m) ? max : Math.max(max, m.id)), 0);
}

/** id 내림차순 — 보내는 중·보내지 못한 말풍선은 아직 서버 순서가 없으니 맨 앞(가장 최근)에 둔다. */
export function newestFirst(list: ChatMessage[]): ChatMessage[] {
  const unsent = list.filter(isUnsent);
  const saved = list.filter((m) => !isUnsent(m)).sort((a, b) => b.id - a.id);
  return [...unsent, ...saved];
}

/**
 * 받아 온 것을 화면 목록에 합친다. 바뀐 게 없으면 {@code null}(상태를 그대로 둬 리렌더·스크롤 튐을 막는다).
 *
 * @param bridged 화면의 대화와 이어졌는가. 아니면(너무 많이 놓쳤다) 잇지 않고 받은 것으로 갈아끼운다 —
 *                구멍 난 대화를 보여 주느니 위쪽을 loadOlder 에 다시 맡긴다({@code resetOlder: true}).
 */
export function mergeSynced(
  all: ChatMessage[],
  latest: ChatMessage[],
  bridged: boolean,
): { list: ChatMessage[]; resetOlder: boolean } | null {
  /*
   * 낙관적 말풍선은 에코로만 사라지는데, 끊긴 사이에 저장된 메시지는 에코 없이 이
   * 재조회로 들어온다. 그대로 두면 같은 말이 화면에 두 번 보이므로(DB 중복이 아니라
   * 화면 중복) 서버가 돌려준 멱등키로 짝을 찾아 걷어낸다. "보내지 못했어요"로 바뀐 말풍선도
   * 같다 — 확인이 늦었을 뿐 사실 저장됐다면 여기서 진짜 메시지로 갈음된다.
   */
  const echoed = new Set(latest.map((m) => m.clientMessageId).filter(Boolean));
  const cur = all.filter((m) => !(isUnsent(m) && m.clientMessageId && echoed.has(m.clientMessageId)));

  if (!bridged) {
    // 아직 안 간 말풍선은 살린다
    return { list: newestFirst([...cur.filter(isUnsent), ...latest]), resetOlder: true };
  }

  const seen = new Set(cur.map((m) => m.id));
  const fresh = latest.filter((m) => !seen.has(m.id));
  // 읽음·리액션 등 갱신도 반영해야 하므로 기존 항목은 최신본으로 덮어쓴다
  const byId = new Map(latest.map((m) => [m.id, m]));
  if (
    fresh.length === 0 &&
    cur.length === all.length &&
    cur.every((m) => !byId.has(m.id) || byId.get(m.id)!.isRead === m.isRead)
  ) {
    return null;
  }
  /*
   * 앞에 붙이기만 하지 않고 id 순으로 다시 세운다. 받은 것 중엔 화면의 가장 최근 것보다 오래된 메시지도
   * 섞일 수 있고(겹치는 페이지), 실시간 수신은 도착 순이라 동시 전송이면 id 순서와 어긋나 있을 수 있다.
   */
  return { list: newestFirst([...fresh, ...cur.map((m) => byId.get(m.id) ?? m)]), resetOlder: false };
}

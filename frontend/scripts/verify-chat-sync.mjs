/**
 * 채팅 따라잡기 검증 — utils/chatSync.ts 를 건드리면 돌린다.
 *
 * 프론트에 테스트 러너가 없어서(CLAUDE.md 6절) 이 스크립트가 그 역할을 한다. 서버의 메시지 API
 * (최신순, "이 id 보다 오래된 30건")를 흉내 내고, 끊긴 사이 몇 건을 놓쳤든 화면 목록에 구멍이 남지
 * 않는지 본다(docs/chat-current-state.md §8-2 ②).
 *
 * 실행: node scripts/verify-chat-sync.mjs
 * (package.json scripts 에 올리지 않았다 — scripts 는 EAS fingerprint 입력이라 고치면 OTA 가 기존 빌드에 안 간다.
 *  다음 네이티브 빌드 때 "verify:chat-sync" 로 함께 올린다.)
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const src = fileURLToPath(new URL('../src/utils/chatSync.ts', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'chat-sync-'));
writeFileSync(join(tmp, 'chatSync.ts'), readFileSync(src, 'utf8'));
const { fetchUntilBridged, mergeSynced, newestFirst, newestKnownId } = await import(
  pathToFileURL(join(tmp, 'chatSync.ts'))
);

let failures = 0;
let passes = 0;
function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passes++;
  else {
    failures++;
    console.error(`  ✗ ${name}\n      expected ${e}\n      got      ${a}`);
  }
}

const PAGE = 30;
const msg = (id, extra = {}) => ({ id, senderId: 1, content: `m${id}`, isRead: false, createdAt: '', ...extra });
/** 서버 — 1..total 이 저장돼 있다. ChatMessageRepository.findMessages 와 같은 모양으로 자른다. */
function server(total) {
  const calls = [];
  const fetchPage = async (cursor) => {
    calls.push(cursor ?? null);
    const out = [];
    for (let id = (cursor ?? total + 1) - 1; id >= 1 && out.length < PAGE; id--) out.push(msg(id));
    return out;
  };
  return { fetchPage, calls };
}
/** 화면 — from..to 를 최신순으로 갖고 있다. */
const screen = (from, to) => newestFirst(Array.from({ length: to - from + 1 }, (_, i) => msg(from + i)));
const ids = (list) => list.map((m) => m.id);
const contiguous = (list) => ids(list).every((id, i, a) => i === 0 || a[i - 1] - id === 1);

async function sync(onScreen, total, maxPages = 10) {
  const s = server(total);
  const { latest, bridged } = await fetchUntilBridged(s.fetchPage, newestKnownId(onScreen), maxPages);
  return { merged: mergeSynced(onScreen, latest, bridged), calls: s.calls, bridged };
}

// ① 조금 놓쳤다 — 한 페이지로 이어진다
{
  const { merged, calls } = await sync(screen(71, 100), 105);
  eq('조금 놓침: 요청 한 번', calls.length, 1);
  eq('조금 놓침: 맨 위가 최신', merged.list[0].id, 105);
  eq('조금 놓침: 구멍 없음', contiguous(merged.list), true);
  eq('조금 놓침: 갈아끼우지 않음', merged.resetOlder, false);
}

// ② 30건 넘게 놓쳤다 — 예전엔 71..100 과 121..150 사이(101..120)가 비었다
{
  const { merged, calls } = await sync(screen(71, 100), 150);
  eq('많이 놓침: 겹칠 때까지 두 페이지', calls, [null, 121]);
  eq('많이 놓침: 150 부터 71 까지 이어짐', [merged.list[0].id, merged.list.at(-1).id, merged.list.length], [150, 71, 80]);
  eq('많이 놓침: 구멍 없음', contiguous(merged.list), true);
}

// ③ 상한(10페이지 = 300건)보다 많이 놓쳤다 — 잇지 않고 갈아끼우고 과거 불러오기를 다시 연다
{
  const { merged, bridged } = await sync(screen(71, 100), 500);
  eq('너무 많이 놓침: 못 이음', bridged, false);
  eq('너무 많이 놓침: 받은 300건으로 갈아끼움', [merged.list[0].id, merged.list.at(-1).id, merged.list.length], [500, 201, 300]);
  eq('너무 많이 놓침: 구멍 없음', contiguous(merged.list), true);
  eq('너무 많이 놓침: 과거 불러오기 다시 열기', merged.resetOlder, true);
}

// ④ 놓친 게 없다 — 상태를 건드리지 않는다
{
  const { merged, calls } = await sync(screen(71, 100), 100);
  eq('놓친 것 없음: null', merged, null);
  eq('놓친 것 없음: 요청 한 번', calls.length, 1);
}

// ⑤ 화면이 비었다 — 첫 페이지만
{
  const { merged, calls } = await sync([], 500);
  eq('빈 화면: 요청 한 번', calls.length, 1);
  eq('빈 화면: 최신 30건', [merged.list[0].id, merged.list.length], [500, 30]);
}

// ⑥ 대화가 짧다 — 한 페이지가 대화의 처음까지 닿는다
{
  const { merged, bridged, calls } = await sync(screen(1, 3), 10);
  eq('짧은 대화: 이어짐', bridged, true);
  eq('짧은 대화: 요청 한 번', calls.length, 1);
  eq('짧은 대화: 전부', ids(merged.list), [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
}

// ⑦-0 빈 페이지 = 대화의 처음 — 이어진 것으로 본다(화면보다 서버가 비어 있는 이상한 경우에도 멈춘다)
{
  const { bridged, calls } = await sync(screen(1, 3), 0);
  eq('빈 페이지: 멈춤', [bridged, calls.length], [true, 1]);
}

// ⑦ 낙관적 말풍선 — 에코가 재조회로 들어온 건 걷고, 아직 안 간 건 맨 위에 남긴다
{
  const onScreen = [
    msg(-2, { pending: true, clientMessageId: 'k-new' }),
    msg(-1, { pending: true, clientMessageId: 'k-saved' }),
    ...screen(71, 100),
  ];
  const s = server(102);
  const { latest, bridged } = await fetchUntilBridged(s.fetchPage, newestKnownId(onScreen), 10);
  latest[0] = { ...latest[0], clientMessageId: 'k-saved' }; // 102 가 끊긴 사이 저장된 내 메시지
  const merged = mergeSynced(onScreen, latest, bridged);
  eq('낙관적: 음수 id 는 기준에서 뺌', newestKnownId(onScreen), 100);
  eq('낙관적: 에코된 것은 걷고 남은 것은 맨 위', ids(merged.list).slice(0, 4), [-2, 102, 101, 100]);
  eq('낙관적: 같은 말 두 번 없음', merged.list.filter((m) => m.clientMessageId === 'k-saved').length, 1);
}

// ⑧ 실시간 수신이 도착 순으로 뒤바뀌어 있었다 — id 순으로 다시 선다
{
  const onScreen = [msg(99), msg(100), ...screen(71, 98)];
  const { merged } = await sync(onScreen, 101);
  eq('순서 바로잡기', ids(merged.list).slice(0, 3), [101, 100, 99]);
}

// ⑨ 읽음만 바뀌었다 — 새 메시지가 없어도 반영한다
{
  const onScreen = screen(71, 100);
  const s = server(100);
  const { latest, bridged } = await fetchUntilBridged(s.fetchPage, 100, 10);
  latest[0] = { ...latest[0], isRead: true };
  const merged = mergeSynced(onScreen, latest, bridged);
  eq('읽음 갱신', merged.list[0].isRead, true);
}

rmSync(tmp, { recursive: true, force: true });
if (failures) {
  console.error(`\n✗ chat-sync: ${failures} failed, ${passes} passed`);
  process.exit(1);
}
console.log(`✓ chat-sync: ${passes} passed`);

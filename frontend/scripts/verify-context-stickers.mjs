/**
 * 맥락 스티커 검증 — utils/anniversary.ts 나 constants/contextStickers.ts 를 건드리면 돌린다.
 *
 * 1. 기념일 날짜 경계 — D+99/100/101, 1·2주년, 2/29 기념일, KST 자정 직전/직후(UTC 로 세면 하루 어긋나는 구간).
 * 2. 맥락 스티커 코드가 실제 카탈로그에 있는지 — 카탈로그는 require() 가 있어 import 할 수 없으므로
 *    verify-sticker-codes.mjs 와 같은 방식으로 `{ code, label, … }` 항목을 정규식으로 읽는다.
 * 3. 무드 답장 표가 무드 목록(기본 + 확장)을 빠짐없이 덮는지.
 *
 * 실행: npm run verify:context-stickers
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const tmp = mkdtempSync(join(tmpdir(), 'context-stickers-'));
writeFileSync(join(tmp, 'anniversary.ts'), read('../src/utils/anniversary.ts'));
const A = await import(pathToFileURL(join(tmp, 'anniversary.ts')));

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
const ok = (name, cond, detail = '') => eq(name + (detail ? ` — ${detail}` : ''), !!cond, true);

/** KST 벽시계 시각 → 순간. "2026-04-10 00:00" KST = 2026-04-09T15:00Z */
const kst = (s) => new Date(`${s.replace(' ', 'T')}:00+09:00`);
const ctx = (start, at) => A.anniversaryContextOf(start, kst(at));
const title = (start, at) => ctx(start, at)?.title ?? null;

console.log('1. D+100 단위 (사귄 날 = 1일)');
eq('D+99', title('2026-01-01', '2026-04-09 12:00'), null);
eq('D+100', title('2026-01-01', '2026-04-10 12:00'), 'D+100 축하해요');
eq('D+101', title('2026-01-01', '2026-04-11 12:00'), null);
eq('D+200', title('2026-01-01', '2026-07-19 12:00'), 'D+200 축하해요');
eq('D+1000', ctx('2024-01-01', '2026-09-26 12:00'), { kind: 'DAYS', days: 1000, title: 'D+1000 축하해요' });
eq('사귄 당일(1일)은 아니다', title('2026-09-28', '2026-09-28 12:00'), null);
eq('미래 날짜', title('2026-12-01', '2026-09-28 12:00'), null);

console.log('2. KST 자정 경계 — 기기 시간대가 아니라 KST 로 센다');
eq('D+100 전날 23:59 KST', title('2026-01-01', '2026-04-09 23:59'), null);
eq('D+100 00:00 KST (UTC 로는 아직 전날 15:00)', title('2026-01-01', '2026-04-10 00:00'), 'D+100 축하해요');
eq('D+100 23:59 KST (UTC 로는 같은 날 14:59)', title('2026-01-01', '2026-04-10 23:59'), 'D+100 축하해요');
eq('D+101 00:00 KST', title('2026-01-01', '2026-04-11 00:00'), null);
eq('kstDateKey 는 KST 날짜', A.kstDateKey(kst('2026-04-10 00:30')), '2026-04-10');
eq('kstDateKey 자정 직전', A.kstDateKey(kst('2026-04-09 23:59')), '2026-04-09');

console.log('3. 주년');
eq('1주년', ctx('2025-09-28', '2026-09-28 09:00'), { kind: 'YEARS', years: 1, title: '1주년' });
eq('2주년', title('2024-09-28', '2026-09-28 09:00'), '2주년');
eq('주년 전날', title('2025-09-28', '2026-09-27 23:59'), null);
eq('주년 00:00 KST', title('2025-09-28', '2026-09-28 00:00'), '1주년');

console.log('4. 2/29 기념일');
eq('윤년 아닌 해는 2/28', title('2024-02-29', '2025-02-28 12:00'), '1주년');
eq('윤년 아닌 해 3/1 은 아니다', title('2024-02-29', '2025-03-01 12:00'), null);
eq('윤년에는 2/29', title('2024-02-29', '2028-02-29 12:00'), '4주년');
eq('윤년의 2/28 은 아니다', title('2024-02-29', '2028-02-28 12:00'), null);
eq('2100 은 윤년이 아니다', title('2096-02-29', '2100-02-28 12:00'), '4주년');

console.log('5. 잘못된 입력');
eq('null', title(null, '2026-09-28 12:00'), null);
eq('빈 문자열', title('', '2026-09-28 12:00'), null);
eq('없는 날짜', title('2026-02-31', '2026-09-28 12:00'), null);
eq('시각이 붙은 값', title('2025-09-28T00:00:00', '2026-09-28 12:00'), '1주년');

/* ── 카탈로그 ─────────────────────────────────────────────── */
const ITEM = /\{\s*code:\s*'([A-Z0-9_]+)',\s*label:\s*'([^']*)'/g;
const imagesSrc = read('../src/constants/stickerImages.ts');
const liveSrc = imagesSrc.slice(
  imagesSrc.indexOf('export const STICKER_CHARACTERS'),
  imagesSrc.indexOf('export const RETIRED_STICKER_IMAGES'),
);
const LIVE = new Set([...liveSrc.matchAll(ITEM)].map((m) => m[1]));
const ANIMATED = new Set([...read('../src/constants/animatedStickers.ts').matchAll(ITEM)].map((m) => m[1]));

const ctxSrc = read('../src/constants/contextStickers.ts');
/** `export const NAME` 부터 닫는 표시(end)까지 */
const block = (name, end) => {
  const i = ctxSrc.indexOf(`export const ${name}`);
  if (i < 0) throw new Error(`contextStickers.ts 에 ${name} 가 없다 — 이 스크립트의 파서를 고칠 것`);
  return ctxSrc.slice(i, ctxSrc.indexOf(end, i));
};
const ANNIV = [...block('ANNIVERSARY_STICKERS', '];').matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]);
const MOOD = new Map(
  [...block('MOOD_REPLY', '\n};').matchAll(/^\s+'([^']+)':\s*\[([^\]]*)\]/gm)].map((m) => [
    m[1],
    [...m[2].matchAll(/'([A-Z0-9_]+)'/g)].map((c) => c[1]),
  ]),
);
const exists = (c) => LIVE.has(c) || ANIMATED.has(c);

console.log('6. 기념일 칸');
ok('카탈로그를 읽었다', LIVE.size === 43 && ANIMATED.size >= 100, `캐릭터 ${LIVE.size} · 움직이는 ${ANIMATED.size}`);
ok('6~8장', ANNIV.length >= 6 && ANNIV.length <= 8, `${ANNIV.length}장`);
for (const c of ANNIV) ok(`기념일 ${c} 가 카탈로그에 있다`, exists(c));
ok('기념일 칸에 캐릭터 스티커가 있다', ANNIV.some((c) => LIVE.has(c)));

console.log('7. 무드 답장 표');
const moodSrc = read('../src/constants/moodEmojis.ts');
const MOODS = [...moodSrc.matchAll(/\{\s*emoji:\s*'([^']+)',\s*label:\s*'([^']+)'/g)].map((m) => ({ emoji: m[1], label: m[2] }));
ok('무드 목록을 읽었다(기본 12 + 확장 12)', MOODS.length === 24, `${MOODS.length}종`);
for (const m of MOODS) {
  const codes = MOOD.get(m.emoji);
  ok(`${m.emoji} ${m.label} 에 답장이 있다`, !!codes);
  if (!codes) continue;
  ok(`${m.emoji} ${m.label} 은 4~6장`, codes.length >= 4 && codes.length <= 6, `${codes.length}장`);
  for (const c of codes) ok(`${m.emoji} → ${c} 가 카탈로그에 있다`, exists(c));
  ok(`${m.emoji} 답장에 캐릭터 스티커가 있다`, codes.some((c) => LIVE.has(c)));
}
const known = new Set(MOODS.map((m) => m.emoji));
for (const k of MOOD.keys()) ok(`표의 ${k} 는 실제 무드다`, known.has(k));

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);

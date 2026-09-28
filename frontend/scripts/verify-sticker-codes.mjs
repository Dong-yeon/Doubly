/**
 * 스티커 텍스트 코드·키워드 추천 검증 — utils/stickerCodes.ts 나 스티커 카탈로그를 건드리면 돌린다.
 *
 * <p><b>카탈로그를 스텁으로 베끼지 않고 실제 파일에서 읽는다.</b> 예전 스크립트는 라벨을 여기에 손으로
 * 적어 두었는데, 2026-09-21 에 곰돌이·더비·블리를 내린 뒤에도 스텁이 옛 카탈로그 그대로라 추천이
 * 통째로 죽은 것을 초록불로 통과시켰다(docs/STICKER_ENGAGEMENT_PROMPTS_2026-09-28.md §0 S1·S2).
 * stickerImages.ts 는 require() 가 있어 import 할 수 없으므로 `{ code, label, source }` 항목을
 * 정규식으로 읽는다 — 백엔드 StickerImageSyncTest 와 같은 방식이다.
 *
 * 실행: npm run verify:sticker-codes
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const tmp = mkdtempSync(join(tmpdir(), 'sticker-codes-'));
writeFileSync(join(tmp, 'stickerCodes.ts'), read('../src/utils/stickerCodes.ts'));
const M = await import(pathToFileURL(join(tmp, 'stickerCodes.ts')));

/* ── 실제 카탈로그 읽기 ─────────────────────────────────────────── */
const imagesSrc = read('../src/constants/stickerImages.ts');
const liveStart = imagesSrc.indexOf('export const STICKER_CHARACTERS');
const retiredStart = imagesSrc.indexOf('export const RETIRED_STICKER_IMAGES');
if (liveStart < 0 || retiredStart < 0) throw new Error('stickerImages.ts 구조가 바뀌었다 — 이 스크립트의 파서를 고칠 것');
const liveSrc = imagesSrc.slice(liveStart, retiredStart);
const retiredSrc = imagesSrc.slice(retiredStart, imagesSrc.indexOf('];', retiredStart));

const ITEM = /\{\s*code:\s*'([A-Z0-9_]+)',\s*label:\s*'([^']*)'/g;
/** 캐릭터 경계 — `label: '달걀이',` 처럼 code 없이 오는 label 이 캐릭터 이름표다 */
const CATALOG = [];
for (const chunk of liveSrc.split(/\n\s*\{\s*\n/).slice(1)) {
  const name = /^\s*(?:\/\*[\s\S]*?\*\/\s*)?key:\s*'[^']+',\s*label:\s*'([^']+)'/m.exec(chunk)
    ?? /\n\s*label:\s*'([^']+)',\s*\n\s*stickers/.exec(chunk);
  const stickers = [...chunk.matchAll(ITEM)].map(([, code, label]) => ({ code, label }));
  if (name && stickers.length) CATALOG.push({ label: name[1], stickers });
}
const RETIRED = new Set([...retiredSrc.matchAll(ITEM)].map((m) => m[1]));
const LIVE = new Set(CATALOG.flatMap((c) => c.stickers.map((s) => s.code)));
const ANIMATED = [...read('../src/constants/animatedStickers.ts').matchAll(ITEM)].map(([, code, label]) => ({ code, label }));
const ANIMATED_CODES = new Set(ANIMATED.map((a) => a.code));

const index = M.buildStickerCodeIndex(CATALOG);
const codeOf = (text) => M.parseStickerCode(index, text)?.code ?? null;
const suggestFull = (text, opts = {}) => M.suggestStickers(index, text, { animated: ANIMATED, ...opts });
const suggest = (text, opts) => suggestFull(text, opts).map((e) => e.code);

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

console.log('0. 카탈로그 읽기');
eq('캐릭터 둘', CATALOG.map((c) => c.label), ['달걀이', '구운이♥달걀이']);
eq('달걀이 23종', CATALOG[0]?.stickers.length, 23);
eq('구운이♥달걀이 20종', CATALOG[1]?.stickers.length, 20);
ok('내린 스티커 목록을 읽었다', RETIRED.size >= 38, `${RETIRED.size}장`);
ok('움직이는 이모티콘을 읽었다', ANIMATED.length >= 100, `${ANIMATED.length}종`);
eq('색인 = 피커에 있는 것만', index.entries.length, 43);
ok('색인에 내린 코드가 없다', index.entries.every((e) => !RETIRED.has(e.code)));

console.log('1. 키워드 표가 실제 카탈로그를 가리킨다 (S1 재발 방지선)');
const bundles = M.STICKER_KEYWORDS;
ok('묶음 20~30', bundles.length >= 20 && bundles.length <= 30, `${bundles.length}묶음`);
for (const [words, codes] of bundles) {
  for (const c of codes) {
    ok(`"${words[0]}" → ${c} 가 있다`, LIVE.has(c) || ANIMATED_CODES.has(c));
    ok(`"${words[0]}" → ${c} 는 내린 스티커가 아니다`, !RETIRED.has(c));
  }
  ok(`"${words[0]}" 묶음은 4개 이하`, codes.length <= 4, `${codes.length}개`);
  ok(`"${words[0]}" 묶음에 캐릭터 스티커가 있다`, codes.some((c) => LIVE.has(c)));
}

console.log('2. 코드 → 스티커 (파싱 동작은 그대로)');
eq('기본', codeOf('(달걀이_사랑해)'), 'EGG_LOVE');
eq('앞뒤 공백', codeOf('  (달걀이_넵) '), 'EGG_SALUTE');
eq('짝 캐릭터 — 라벨의 공백은 없어도 된다', codeOf('(구운이♥달걀이_대판싸움)'), 'DUO_FIGHT');
eq('라벨을 그대로 쳐도 된다', codeOf('(구운이♥달걀이_대판 싸움)'), 'DUO_FIGHT');
eq('전각 괄호', codeOf('（달걀이_뽀뽀）'), 'EGG_KISS');
eq('공용 라벨은 캐릭터로 갈린다', codeOf('(구운이♥달걀이_삐짐)'), 'DUO_SULKY');
eq('공용 라벨 — 달걀이', codeOf('(달걀이_삐짐)'), 'EGG_SULKY');
eq('없는 조합', codeOf('(달걀이_잘자)'), null);
eq('내린 캐릭터는 코드로도 못 보낸다', codeOf('(곰돌이_사랑해)'), null);
eq('괄호 없으면 코드가 아니다', codeOf('달걀이_사랑해'), null);
eq('문장 속 코드는 바꾸지 않는다', codeOf('오늘 (달걀이_사랑해) 기분'), null);
eq('빈 입력', codeOf('   '), null);

console.log('3. 키워드 → 추천 (정탐)');
eq('라벨 정확 일치가 맨 앞', suggest('사랑해').slice(0, 2), ['EGG_LOVE', 'DUO_LOVE']);
ok('사랑해 — 움직이는 이모티콘도 온다', suggest('사랑해').includes('ANIM_TWO_HEARTS'));
ok('나도 사랑해 — 마지막 어절', suggest('나도 사랑해').includes('EGG_LOVE'));
eq('ㅋㅋㅋㅋ = ㅋㅋ', suggest('ㅋㅋㅋㅋ'), suggest('ㅋㅋ'));
ok('ㅋㅋ 는 비어 있지 않다', suggest('ㅋㅋ').length > 0);
eq('ㅠㅠㅠ = ㅠㅠ', suggest('ㅠㅠㅠ'), suggest('ㅠㅠ'));
eq('사랑해~~ = 사랑해', suggest('사랑해~~'), suggest('사랑해'));
ok('오늘 피곤해ㅠㅠ — ㅠㅠ', suggest('오늘 피곤해ㅠㅠ').includes('DUO_CRY'));
ok('오늘 피곤해ㅠㅠ — 피곤', suggest('오늘 피곤해ㅠㅠ').includes('EGG_MELTING'));
ok('진짜 보고싶다 — 마지막 어절 키워드', suggest('진짜 보고싶다').includes('DUO_LOVE'));
ok('나 이제 퇴근 — 퇴근', suggest('나 이제 퇴근').includes('EGG_RELAXED'));
ok('배고파아ㅠ 같은 끝 자모', suggest('배고파ㅠ').includes('EGG_DROOL'));
eq('순위: 라벨 정확(삐짐 둘) > 키워드(흥)', suggest('삐짐').slice(0, 3), ['EGG_SULKY', 'DUO_SULKY', 'EGG_GRUMPY']);
ok('39자 입력도 끝 어절은 본다', suggest(`${'가'.repeat(35)} 사랑해`).includes('EGG_LOVE'));

console.log('4. 오탐 방지');
eq('40자 초과는 끈다', suggest(`${'가'.repeat(37)} 사랑해`), []);
eq('한 글자는 추천하지 않는다', suggest('좋'), []);
eq('ㅋ 하나', suggest('ㅋ'), []);
eq('맞는 게 없으면 빈 배열', suggest('회의'), []);
eq('빈 입력', suggest(''), []);
ok('"응원해" 는 응(넵)이 아니다', !suggest('응원해').includes('EGG_SALUTE'));
ok('"네가 먼저" 는 네(넵)가 아니다', !suggest('네가 먼저').includes('EGG_SALUTE'));
// 짧은 입력(≤10자)은 예전처럼 "키워드로 시작"도 본다 — 문장 중간 키워드는 긴 입력에서만 걸러진다
ok('긴 문장의 앞·중간 키워드는 보지 않는다', !suggest('사랑해 근데 오늘 회의 몇 시에 끝나').includes('EGG_LOVE'));
eq('matched 에 입력 원문이 들어가지 않는다', suggestFull('나도 사랑해')[0]?.matched, '사랑해');

console.log('5. 막대 규칙');
const all = bundles.flatMap(([w]) => w).concat(CATALOG.flatMap((c) => c.stickers.map((s) => s.label)));
ok('모든 키워드·라벨에서 6개 이하', all.every((w) => suggest(w).length <= M.MAX_SUGGESTIONS));
ok('모든 키워드·라벨에서 내린 코드가 안 나온다', all.every((w) => suggest(w).every((c) => !RETIRED.has(c))));
ok('캐릭터 스티커가 움직이는 이모티콘보다 앞', all.every((w) => {
  const kinds = suggestFull(w).map((e) => e.kind);
  return kinds.indexOf('animated') < 0 || kinds.lastIndexOf('image') < kinds.indexOf('animated');
}));
ok('둘 다 있으면 움직이는 이모티콘 자리가 남는다', suggestFull('사랑해').filter((e) => e.kind === 'image').length <= 4);
eq('최근 보낸 것이 같은 순위 안에서 앞', suggest('ㅠㅠ', { recent: ['EGG_GLOOMY'] })[0], 'EGG_GLOOMY');
eq('최근 보낸 것도 순위를 넘지는 못한다', suggest('삐짐', { recent: ['EGG_GRUMPY'] }).slice(0, 2), ['EGG_SULKY', 'DUO_SULKY']);
ok('잠긴 팩은 뺀다', suggest('사랑해', { isAllowed: (_kind, c) => !c.startsWith('DUO_') }).every((c) => !c.startsWith('DUO_')));
eq('움직이는 이모티콘 카탈로그를 안 주면 캐릭터만', M.suggestStickers(index, '사랑해').every((e) => e.kind === 'image'), true);

console.log('6. 코드 치는 중');
eq('"(달걀이_" 는 달걀이 전부(상한)', suggest('(달걀이_').length, 6);
ok('"(달걀이_" 는 캐릭터 스티커만', suggestFull('(달걀이_').every((e) => e.kind === 'image' && e.code.startsWith('EGG_')));
eq('"(달걀이_사" 는 사랑해', suggest('(달걀이_사'), ['EGG_LOVE']);
eq('"(구운" 은 짝', suggest('(구운')[0], 'DUO_SAD');
eq('내린 캐릭터', suggest('(곰돌이'), []);

console.log('7. 캐릭터 스티커 모션 (constants/stickerMotion.ts)');
const motionSrc = read('../src/constants/stickerMotion.ts');
const MOTION_OF = new Map([...motionSrc.matchAll(/^\s+([A-Z0-9_]+): '([a-z]+)',\r?$/gm)].map((m) => [m[1], m[2]]));
const motionsSrc = read('../src/constants/coupleEmojiMotion.ts');
const motionsBody = motionsSrc.slice(motionsSrc.indexOf('export const MOTIONS'), motionsSrc.indexOf('};', motionsSrc.indexOf('export const MOTIONS')));
const KINDS = new Set([...motionsBody.matchAll(/^\s+([a-z]+): \{ duration/gm)].map((m) => m[1]));
ok('모션 종류를 읽었다', KINDS.size >= 14, `${KINDS.size}종`);
for (const code of LIVE) ok(`${code} 에 모션이 있다`, MOTION_OF.has(code));
for (const [code, kind] of MOTION_OF) {
  ok(`${code} 의 모션 ${kind} 이 MOTIONS 에 있다`, KINDS.has(kind));
  ok(`${code} 는 피커에 있는 스티커다`, LIVE.has(code));
}

console.log('8. 코드 텍스트');
eq('코드 표기', index.entries.find((e) => e.code === 'DUO_FIGHT').text, '(구운이♥달걀이_대판싸움)');

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);

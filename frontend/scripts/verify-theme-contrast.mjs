/**
 * 앱 팔레트 WCAG 대비 검증 — 라이트/다크 × 액센트 3종(그린·민트·피치) = 6벌 전부.
 *
 * <p>왜 있나(2026-09-25): 화면 점검(docs/SCREEN_DESIGN_PASS_2026-09-23.md) 8개 절마다 "다크는
 * 미검증"이 쌓였다. 채팅 배경 테마는 verify-chat-theme-contrast.mjs 가 20벌을 자동으로 보는데
 * 정작 앱 전체 팔레트는 아무도 보지 않았다. 여기서 보는 건 <b>토큰 쌍</b>이다 — 어떤 글자색이
 * 어떤 바탕 위에 놓이는지는 컴포넌트가 정하지만, 자주 쓰는 조합은 정해져 있어 그걸 규칙으로 적는다.
 *
 * <p>src/theme/colors.ts 를 <b>텍스트로 읽어</b> 팔레트를 복원한다(TS 를 실행하지 않는다 — 채팅
 * 테마 스크립트와 같은 방식). 객체 리터럴의 `key: '#hex'` 만 줍고, 액센트 오버라이드를 라이트/다크
 * 위에 덮어 6벌을 만든다. colors.ts 의 구조(light / dark / ACCENT_OVERRIDES)가 바뀌면 여기도 본다.
 *
 *   npm run verify:theme
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SOURCE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'theme', 'colors.ts');
const src = readFileSync(SOURCE, 'utf8');

/** `const <name> = {` ~ 짝 `};` 구간에서 key: '#hex' 를 줍는다 */
function objectAt(startMarker) {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error(`colors.ts 에서 찾지 못함: ${startMarker}`);
  let depth = 0;
  let i = src.indexOf('{', start);
  const open = i;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(open, i + 1);
}

function tokensOf(block) {
  const out = {};
  for (const m of block.matchAll(/(\w+):\s*'(#[0-9a-fA-F]{6})'/g)) out[m[1]] = m[2].toUpperCase();
  return out;
}

const light = tokensOf(objectAt('const light = {'));
const dark = tokensOf(objectAt('const dark: typeof light = {'));
const overrides = objectAt('const ACCENT_OVERRIDES');
const variantBlock = (name) => objectAt.call(null, `${name}: {`) && (() => {
  const s = overrides.indexOf(`${name}: {`);
  let depth = 0, i = overrides.indexOf('{', s), open = i;
  for (; i < overrides.length; i++) { if (overrides[i] === '{') depth++; else if (overrides[i] === '}') { depth--; if (depth === 0) break; } }
  return overrides.slice(open, i + 1);
})();
const schemeOf = (block, scheme) => {
  const s = block.indexOf(`${scheme}: {`);
  let depth = 0, i = block.indexOf('{', s), open = i;
  for (; i < block.length; i++) { if (block[i] === '{') depth++; else if (block[i] === '}') { depth--; if (depth === 0) break; } }
  return tokensOf(block.slice(open, i + 1));
};

const palettes = { 'green/light': light, 'green/dark': dark };
for (const v of ['mint', 'peach']) {
  const b = variantBlock(v);
  palettes[`${v}/light`] = { ...light, ...schemeOf(b, 'light') };
  palettes[`${v}/dark`] = { ...dark, ...schemeOf(b, 'dark') };
}

const luminance = (hex) => {
  const ch = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
// theme/onColor.ts 와 같은 규칙 — 바탕 휘도로 ink/white 를 고른다
const ON_LIGHT = '#1A1D1A';
const CROSSOVER = Math.sqrt(1.05 * (luminance(ON_LIGHT) + 0.05)) - 0.05;
const onColor = (bg) => (luminance(bg) > CROSSOVER ? ON_LIGHT : '#FFFFFF');

/*
 * 규칙 — [바탕, 글자] 와 최소 대비. 4.5 는 본문(WCAG AA), 3.0 은 큰 글자·아이콘·UI 경계(AA 대형/비텍스트).
 * "어디"는 실제로 그 조합을 쓰는 대표 자리다 — 규칙을 지우거나 낮출 때 그 자리를 먼저 본다.
 */
const RULES = [
  // 본문
  { name: '본문 글자 / 배경', pick: (p) => [p.background, p.textPrimary], min: 4.5 },
  { name: '본문 글자 / 카드', pick: (p) => [p.surface, p.textPrimary], min: 4.5 },
  { name: '본문 글자 / surfaceAlt(칩·입력)', pick: (p) => [p.surfaceAlt, p.textPrimary], min: 4.5 },
  { name: '보조 글자 / 배경', pick: (p) => [p.background, p.textSecondary], min: 4.5 },
  { name: '보조 글자 / 카드', pick: (p) => [p.surface, p.textSecondary], min: 4.5 },
  { name: '보조 글자 / surfaceAlt', pick: (p) => [p.surfaceAlt, p.textSecondary], min: 4.5 },
  { name: 'muted 글자·아이콘 / 카드 (셰브론·플레이스홀더)', pick: (p) => [p.surface, p.textMuted], min: 3.0 },
  // 소유자 색 — 웰 위 글자 (피드 카드 배지, 채팅 토큰, 럽슐랭 별)
  { name: '나 글자 / 나 웰', pick: (p) => [p.meBg, p.meText], min: 4.5 },
  { name: '상대 글자 / 상대 웰', pick: (p) => [p.partnerBg, p.partnerText], min: 4.5 },
  { name: '함께 글자 / 함께 웰', pick: (p) => [p.togetherBg, p.togetherText], min: 4.5 },
  // 파스텔 웰 위 글자는 소유자 색이 아니라 ink 다 — ChatRoomScreen 2330 주석("couple 원색이면 대비가 안 나와
  // ink 를 쓴다"). 소유자 색을 올리면 4.0 근처라 규칙이 그 결정을 그대로 따른다
  { name: 'ink / 나 파스텔(채팅 배지)', pick: (p) => [p.mePastelBg, p.textPrimary], min: 4.5 },
  { name: 'ink / 함께 파스텔(추억 카드)', pick: (p) => [p.togetherPastelBg, p.textPrimary], min: 4.5 },
  // 소유자 색 — 카드 위 글자 (럽슐랭 "나 ★★★", 방문 ★, pendingHint)
  { name: '나 글자 / 카드', pick: (p) => [p.surface, p.meText], min: 4.5 },
  { name: '상대 글자 / 카드', pick: (p) => [p.surface, p.partnerText], min: 4.5 },
  { name: '함께 글자 / 카드', pick: (p) => [p.surface, p.togetherText], min: 4.5 },
  // 채움 위 onColor (버튼·아바타·완료 칩·요일 칩)
  { name: 'onColor / primaryFill (주 버튼)', pick: (p) => [p.primaryFill, onColor(p.primaryFill)], min: 4.5 },
  { name: 'onColor / meFill', pick: (p) => [p.meFill, onColor(p.meFill)], min: 4.5 },
  { name: 'onColor / partnerFill', pick: (p) => [p.partnerFill, onColor(p.partnerFill)], min: 4.5 },
  { name: 'onColor / togetherFill (요일 칩)', pick: (p) => [p.togetherFill, onColor(p.togetherFill)], min: 4.5 },
  // 크롬 색 글자
  { name: 'primary 글자 / 배경 (링크)', pick: (p) => [p.background, p.primary], min: 4.5 },
  { name: 'primary 글자 / 카드', pick: (p) => [p.surface, p.primary], min: 4.5 },
  { name: 'primary 글자 / primaryBg (선택 칩·soft 버튼)', pick: (p) => [p.primaryBg, p.primary], min: 4.5 },
  { name: 'danger 글자 / 카드 (탈퇴·삭제 행)', pick: (p) => [p.surface, p.danger], min: 4.5 },
  { name: 'dangerText / dangerBg', pick: (p) => [p.dangerBg, p.dangerText], min: 4.5 },
  { name: 'success 글자 / 카드 (배지)', pick: (p) => [p.surface, p.success], min: 4.5 },
  // 비텍스트 경계
  { name: '헤어라인 / 카드', pick: (p) => [p.surface, p.border], min: 1.15 },
  { name: '카드 / 배경', pick: (p) => [p.background, p.surface], min: 1.03 },
  { name: 'surfaceAlt / 카드', pick: (p) => [p.surface, p.surfaceAlt], min: 1.08 },
  // 주 버튼 채움이 카드 위에서 '면'으로 보이는가 — 글자가 버튼을 식별하므로 AA 비텍스트(3.0)까지는 요구하지
  // 않는다. 1.5 아래면 흰 카드에 묻힌다(라이트 그린 2.16, 민트 2.04, 피치 2.62)
  { name: '채움 / 카드 (버튼이 면으로 보이는가)', pick: (p) => [p.surface, p.primaryFill], min: 1.5 },
  // primary 를 채움으로 쓰는 자리가 아직 39곳 남아 있다(2026-09-25 기준, backgroundColor: colors.primary) —
  // 그 위 글자는 onColor 여야 한다. white 를 박은 곳은 다크에서 3.3 이라 여기서 잡는다
  { name: 'onColor / primary (구식 채움)', pick: (p) => [p.primary, onColor(p.primary)], min: 4.5 },
];

let failures = 0;
const rows = [];
for (const [name, p] of Object.entries(palettes)) {
  for (const rule of RULES) {
    const [bg, fg] = rule.pick(p);
    if (!bg || !fg) { rows.push(`  ?   ${name.padEnd(12)} ${rule.name} — 토큰 없음`); failures++; continue; }
    const ratio = contrast(bg, fg);
    const ok = ratio >= rule.min;
    if (!ok) failures++;
    if (!ok || process.argv.includes('--all')) {
      rows.push(`  ${ok ? 'ok ' : 'FAIL'} ${name.padEnd(12)} ${rule.name.padEnd(36)} ${ratio.toFixed(2)} (min ${rule.min})  ${fg} on ${bg}`);
    }
  }
}

console.log(`팔레트 ${Object.keys(palettes).length}벌 × 규칙 ${RULES.length} = ${Object.keys(palettes).length * RULES.length}쌍 검사`);
if (rows.length) console.log(rows.join('\n'));
if (failures) {
  console.error(`\n대비 미달 ${failures}건`);
  process.exit(1);
}
console.log('전부 통과');

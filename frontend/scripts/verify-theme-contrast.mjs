/**
 * 앱 팔레트 WCAG 대비 + 색 구분 검증 — 라이트/다크 2벌(액센트 변형은 2026-10-05 폐지).
 *
 * <p>왜 있나(2026-09-25): 화면 점검(docs/SCREEN_DESIGN_PASS_2026-09-23.md) 8개 절마다 "다크는
 * 미검증"이 쌓였다. 채팅 배경 테마는 verify-chat-theme-contrast.mjs 가 20벌을 자동으로 보는데
 * 정작 앱 전체 팔레트는 아무도 보지 않았다. 여기서 보는 건 <b>토큰 쌍</b>이다 — 어떤 글자색이
 * 어떤 바탕 위에 놓이는지는 컴포넌트가 정하지만, 자주 쓰는 조합은 정해져 있어 그걸 규칙으로 적는다.
 *
 * <p>src/theme/palette.ts 를 <b>텍스트로 읽어</b> 팔레트를 복원한다(TS 를 실행하지 않는다 — 채팅
 * 테마 스크립트와 같은 방식). 객체 리터럴의 `key: '#hex'` 만 줍는다. palette.ts 의 구조
 * (export const light / export const dark)가 바뀌면 여기도 본다.
 *
 *   npm run verify:theme
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SOURCE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'theme', 'palette.ts');
const src = readFileSync(SOURCE, 'utf8');

/** `const <name> = {` ~ 짝 `};` 구간에서 key: '#hex' 를 줍는다 */
function objectAt(startMarker) {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error(`palette.ts 에서 찾지 못함: ${startMarker}`);
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

const light = tokensOf(objectAt('export const light = {'));
const dark = tokensOf(objectAt('export const dark: typeof light = {'));

const palettes = { light, dark };

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
  /*
   * 홈 아바타 링의 럽슐랭 왕관(아이콘 — 비텍스트 3:1). 두 상태 모두 lovelichelinGold(2026-10-02 셋째 판, togetherText 제거).
   * 왕관은 반쯤 '나' 아바타 채움(meFill) 위에 걸리는데 금색끼리라 대비가 1.05~1.7 이다 — 그래서 경계는 왕관 뒤에 깐
   * 배경색 외곽선이 만든다. 실제로 맞닿는 쌍은 "금색 / 외곽선(=background)" 이고, 그 대비를 본다.
   */
  { name: '왕관 금색 / 배경색 외곽선', pick: (p) => [p.background, p.lovelichelinGold], min: 3.0 },
  { name: '왕관 금색 / 카드', pick: (p) => [p.surface, p.lovelichelinGold], min: 3.0 },
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
  { name: 'onPrimary / primary (배지·전송 버튼)', pick: (p) => [p.primary, p.onPrimary], min: 4.5 },
];

/*
 * 구분 규칙 — 대비가 아니라 "다른 색으로 읽히는가". 왕관 금색이 PRO 왕관(primary·primaryDark)·상대 색(partnerFill)이나
 * '나' 색 글자(me)와 붙으면 무엇의 표시인지 갈리지 않는다(docs/HOME_RECORD_AND_CROWN_2026-10-02.md §4).
 * 지각 색차 CIE76 ΔE — 10 이상이면 나란히 놓았을 때 한눈에 다른 색이다. 15 로 여유를 둔다.
 * (셋째 판에서 오늘 왕관의 togetherText 를 걷었다 — 라이트에서 primary 와 ΔE 16.4 로 같은 초록 계열이었다)
 */
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lab = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)));
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};
const deltaE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const DISTINCT = [
  { name: '왕관 금색 ≠ PRO(primary)', pick: (p) => [p.lovelichelinGold, p.primary], min: 15 },
  { name: '왕관 금색 ≠ PRO(primaryDark)', pick: (p) => [p.lovelichelinGold, p.primaryDark], min: 15 },
  { name: '왕관 금색 ≠ 나 색', pick: (p) => [p.lovelichelinGold, p.me], min: 15 },
  { name: '왕관 금색 ≠ 상대 색(partnerFill)', pick: (p) => [p.lovelichelinGold, p.partnerFill], min: 15 },
  /*
   * 크롬 ≠ 소유자 색 (2026-10-05). 이 규칙이 없어서 primary #2A7731 과 상대 #2C7D33 이 ΔE 3.1 —
   * 사실상 같은 색 — 인 채로 몇 달을 지냈다. 버튼·탭이 상대 색이면 앱 전체가 상대 것처럼 보인다.
   */
  { name: 'primary ≠ 나', pick: (p) => [p.primary, p.me], min: 15 },
  { name: 'primary ≠ 상대', pick: (p) => [p.primary, p.partner], min: 15 },
  { name: 'primary ≠ 함께', pick: (p) => [p.primary, p.together], min: 15 },
  { name: 'primaryFill ≠ 나 채움(내 말풍선·버튼)', pick: (p) => [p.primaryFill, p.meFill], min: 15 },
  { name: 'primaryFill ≠ 상대 채움', pick: (p) => [p.primaryFill, p.partnerFill], min: 15 },
  // 소유자 셋끼리 — 나/상대는 한눈에 갈려야 하고, 함께는 둘 중 하나로 읽히면 안 된다
  { name: '나 ≠ 상대', pick: (p) => [p.me, p.partner], min: 40 },
  { name: '나 채움 ≠ 상대 채움', pick: (p) => [p.meFill, p.partnerFill], min: 40 },
  { name: '함께 ≠ 나', pick: (p) => [p.together, p.me], min: 20 },
  { name: '함께 ≠ 상대', pick: (p) => [p.together, p.partner], min: 20 },
  // 나 색이 따뜻한 계열이라 삭제·오류의 빨강과 붙을 수 있다
  { name: '나 ≠ danger', pick: (p) => [p.me, p.danger], min: 15 },
];

let failures = 0;
const rows = [];
for (const [name, p] of Object.entries(palettes)) {
  for (const rule of DISTINCT) {
    const [a, b] = rule.pick(p);
    if (!a || !b) { rows.push(`  ?   ${name.padEnd(12)} ${rule.name} — 토큰 없음`); failures++; continue; }
    const d = deltaE(a, b);
    const ok = d >= rule.min;
    if (!ok) failures++;
    if (!ok || process.argv.includes('--all')) {
      rows.push(`  ${ok ? 'ok ' : 'FAIL'} ${name.padEnd(12)} ${rule.name.padEnd(36)} ΔE ${d.toFixed(1)} (min ${rule.min})  ${a} vs ${b}`);
    }
  }
}
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

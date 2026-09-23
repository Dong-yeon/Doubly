/**
 * 채팅 배경 테마 대비 검증 — src/theme/chatTheme.ts 의 실제 값을 읽어 WCAG 비율을 잰다.
 *
 * 프론트에는 테스트 러너가 없다(CLAUDE.md 6절). 맞춤법 모듈의 verify-spellcheck.mjs 와
 * 같은 자리에서, 이 스크립트가 팔레트의 회귀 방지 역할을 한다.
 *
 *   node scripts/verify-chat-theme-contrast.mjs
 *
 * <b>왜 필요한가</b>: 채팅 배경 위에는 말풍선 없이 놓이는 것들이 있다 — 10px 시간 글자,
 * "보내는 중", 날짜 구분선. 배경만 눈대중으로 바꾸면 이것들이 소리 없이 안 보이게 된다.
 * 값을 직접 적어 두지 않고 chatTheme.ts 를 파싱하는 건, 둘이 어긋나면 검증이 거짓말을
 * 하기 때문이다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SOURCE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'theme', 'chatTheme.ts');

/** 기준 — 본문 텍스트는 AA(4.5), 배경과 면이 갈리는 정도는 눈에 보이는 최소치 */
const RULES = [
  { name: '내 말풍선 위 글자', pick: (p) => [p.bubbleMine, p.bubbleMineText], min: 4.5 },
  { name: '상대 말풍선 글자', pick: (p) => [p.bubbleTheirs, p.bubbleTheirsText], min: 4.5 },
  { name: '배경 위 시간·날짜', pick: (p) => [p.background, p.meta], min: 4.5 },
  { name: '상대 말풍선 vs 배경', pick: (p) => [p.background, p.bubbleTheirs], min: 1.1 },
  { name: '구분선 vs 배경', pick: (p) => [p.background, p.dividerLine], min: 1.18 },
  /*
   * 검색에서 골라 온 메시지를 짚어 주는 행 배경. 2026-09-18 에 추가했다 — 그전까지
   * 검사하지 않아 20벌 중 절반이 미달이었고 기본/다크는 1.02 였다. 구분선(1.18)보다
   * 조금 높게 잡는다: 줄 하나가 아니라 행 전체를 칠하는 색이라 흐리면 "왜 여기가
   * 밝지" 로도 안 읽힌다.
   */
  { name: '강조 행 vs 배경', pick: (p) => [p.background, p.highlight], min: 1.2 },
];

/*
 * <b>면제는 비어 있다.</b> 2026-09-18 까지 한 건(기본/라이트의 "상대 말풍선 vs 배경" 1.08)이
 * 있었는데, 기본 테마라 대부분이 보는 화면이어서 값을 고쳐 없앴다(chatTheme.ts 주석 참고).
 * 비워 두는 것이 기본값이다 — 면제를 넉넉히 잡아 두면 나중에 진짜 회귀가 들어와도 조용히
 * 지나간다. 새로 넣기 전에 "고칠 수 없는 이유"를 여기 적을 수 있는지 먼저 따진다.
 */
const EXEMPT = new Set();

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

/**
 * chatTheme.ts 에서 { id, light, dark } 를 뽑는다. 정식 파서 대신 정규식을 쓰는 건
 * 대상이 평범한 객체 리터럴 배열이고, 빌드 단계를 하나도 늘리고 싶지 않아서다.
 * 형태가 바뀌면 아래 "테마를 하나도 못 찾았다"에서 시끄럽게 실패한다.
 */
function parseThemes(source) {
  const themes = [];
  const blocks = source.matchAll(
    /id:\s*'([a-z]+)',\s*label:\s*'([^']+)',\s*light:\s*\{([\s\S]*?)\},\s*dark:\s*\{([\s\S]*?)\},\s*\},/g,
  );
  for (const [, id, label, lightBody, darkBody] of blocks) {
    const fields = (body) =>
      Object.fromEntries([...body.matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/g)].map((m) => [m[1], m[2]]));
    themes.push({ id, label, light: fields(lightBody), dark: fields(darkBody) });
  }
  return themes;
}

const source = readFileSync(SOURCE, 'utf8');
const themes = parseThemes(source);

if (themes.length === 0) {
  console.error('chatTheme.ts 에서 테마를 하나도 못 찾았다 — 파일 형태가 바뀌었는지 확인할 것.');
  process.exit(1);
}

/*
 * 위 정규식은 id → label → light 를 <b>한 덩어리로</b> 훑는다. 그 사이에 주석 한 줄만
 * 끼워도 해당 테마가 조용히 빠지는데, "전부 통과"는 그대로 나오므로 <b>아무도 모른다</b>.
 * 2026-09-23 에 라벨을 고치다 실제로 10종이 8종이 됐다. 선언된 수와 대조해 시끄럽게 만든다.
 */
const declared = [...source.matchAll(/^\s{4}id:\s*'([a-z]+)',$/gm)].map((m) => m[1]);
const missed = declared.filter((id) => !themes.some((t) => t.id === id));
if (missed.length > 0) {
  console.error(
    `정규식이 테마 ${missed.length}종을 놓쳤다: ${missed.join(', ')}\n` +
      'id 와 label 사이(또는 label 과 light 사이)에 주석이 끼어 있지 않은지 볼 것 — ' +
      '테마에 붙이는 설명은 블록 바깥, { 위에 둔다.',
  );
  process.exit(1);
}

const failures = [];
const rows = [];

for (const theme of themes) {
  for (const scheme of ['light', 'dark']) {
    const palette = theme[scheme];
    const cells = RULES.map((rule) => {
      const [a, b] = rule.pick(palette);
      if (!a || !b) {
        failures.push(`${theme.id}/${scheme} — ${rule.name}: 색 토큰이 비어 있다`);
        return '없음';
      }
      const ratio = contrast(a, b);
      const exempt = EXEMPT.has(`${theme.id}/${scheme}:${rule.name}`);
      const ok = ratio >= rule.min || exempt;
      if (!ok) failures.push(`${theme.id}/${scheme} — ${rule.name}: ${ratio.toFixed(2)} (기준 ${rule.min})`);
      return `${ratio.toFixed(2)}${exempt ? '~' : ok ? '' : ' ✗'}`;
    });
    rows.push([`${theme.label}/${scheme === 'light' ? '라이트' : '다크'}`, ...cells]);
  }
}

const header = ['테마', ...RULES.map((r) => r.name)];
const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)) + 2);
const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('');

console.log(line(header));
rows.forEach((r) => console.log(line(r)));
console.log(`\n테마 ${themes.length}종 × 라이트/다크 = ${themes.length * 2}벌, 검사 ${themes.length * 2 * RULES.length}건`);
if (EXEMPT.size > 0) console.log('~ 는 면제 항목');

if (failures.length > 0) {
  console.error(`\n대비 미달 ${failures.length}건:`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

console.log('\n전부 통과');

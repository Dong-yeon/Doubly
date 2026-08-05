/**
 * MaterialCommunityIcons 서브셋 — 앱이 실제로 쓰는 글리프만 남긴다.
 *
 * <p>산출물이 <b>둘</b>이다. 같은 이름 목록에서 나오므로 서로 어긋나지 않는다.
 * <ul>
 *   <li><b>폰트</b>(.ttf) — 7,448 글리프 1.3MB. <b>렌더를 막는</b> 경로에 있다
 *       (아이콘만 있는 버튼은 폰트가 없으면 보이지 않아 조작이 막힌다).</li>
 *   <li><b>글리프맵</b>(icon-glyphmap.json) — 이름→코드포인트 표. 패키지 기본값은
 *       225KB 이며 JS 번들에 실린다. 앱은 이 생성본으로 아이콘 세트를 만든다
 *       ({@code src/components/Icon.tsx}).</li>
 * </ul>
 *
 * <p><b>어떻게</b>: 소스에서 따옴표로 감싼 문자열을 전부 긁어 글리프맵과 대조한다.
 * 아이콘 이름은 name="x" · icon: 'x' 같은 리터럴로만 쓰이고 템플릿 조합은 없다
 * (있으면 여기서 못 잡으니 추가 시 주의). 이름이 아닌 문자열이 우연히 글리프명과
 * 겹치면 글리프 하나가 더 들어갈 뿐이라 <b>과다 포함 쪽으로 안전</b>하다.
 *
 * <p><b>파일 구성</b>
 * <ul>
 *   <li>{@code MaterialCommunityIcons.full.ttf} — 원본(소스 오브 트루스). 커밋한다.</li>
 *   <li>{@code MaterialCommunityIcons.ttf} — 생성된 서브셋. 앱이 이 파일을 쓴다.
 *       빌드 때마다 다시 만들지만, 커밋해 두어 Python 이 없는 환경(CI 등)에서도
 *       빌드가 통과하게 한다.</li>
 * </ul>
 *
 * <p>fontTools 가 없으면 <b>실패시키지 않고</b> 경고만 남기고 넘어간다 —
 * 이미 커밋된 서브셋으로 빌드가 진행된다. 대신 아이콘을 새로 추가했다면
 * 개발 머신에서 한 번은 이 스크립트가 돌아야 한다.
 * (글리프맵은 순수 JS 라 Python 유무와 무관하게 항상 갱신된다.)
 *
 * <p><b>안전망</b>: 글리프맵이 줄면 {@code IconName} 유니온도 함께 줄어든다.
 * 목록에서 빠진 아이콘 이름은 <b>tsc 에러</b>로 드러나므로 조용히 사라지지 않는다.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ASSET_DIR = path.join(__dirname, '..', 'assets');
const FONT_DIR = path.join(ASSET_DIR, 'fonts');
const SOURCE = path.join(FONT_DIR, 'MaterialCommunityIcons.full.ttf');
const OUTPUT = path.join(FONT_DIR, 'MaterialCommunityIcons.ttf');
const GLYPHMAP = path.join(ASSET_DIR, 'icon-glyphmap.json');

const glyphMap = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function collectIconNames() {
  const root = path.join(__dirname, '..');
  const files = [...walk(path.join(root, 'src')), path.join(root, 'App.tsx')];
  const found = new Set();
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/['"`]([a-z][a-z0-9-]{2,})['"`]/g)) {
      if (glyphMap[m[1]] !== undefined) found.add(m[1]);
    }
  }
  return [...found].sort();
}

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.warn(`[icon-subset] 원본이 없어 건너뜁니다: ${path.basename(SOURCE)}`);
    return;
  }

  const names = collectIconNames();
  if (names.length === 0) {
    console.warn('[icon-subset] 아이콘을 하나도 찾지 못해 건너뜁니다 (서브셋이 비면 위험)');
    return;
  }

  // 글리프맵부터 쓴다 — 폰트 서브셋과 달리 순수 JS 라 Python 유무와 무관하게 항상 갱신된다.
  // 여기서 줄어든 키 집합이 곧 IconName 유니온이 되므로, 빠진 아이콘은 tsc 가 잡아준다.
  const subsetMap = {};
  for (const n of names) subsetMap[n] = glyphMap[n];
  fs.writeFileSync(GLYPHMAP, JSON.stringify(subsetMap, null, 2) + '\n');

  const unicodes = names.map((n) => 'U+' + glyphMap[n].toString(16).toUpperCase()).join(',');

  try {
    execFileSync(
      'python',
      [
        '-m',
        'fontTools.subset',
        SOURCE,
        `--unicodes=${unicodes}`,
        `--output-file=${OUTPUT}`,
        // 아이콘 폰트는 합자·커닝이 필요 없다 — 레이아웃 테이블을 통째로 뺀다
        '--layout-features=',
        '--drop-tables+=DSIG',
        '--name-IDs=*',
        /*
         * ⚠️ --recalc-bounds 를 쓰면 안 된다 — 렌더된 글리프가 왼쪽으로 크게 밀린다.
         *
         * 원인: 이 폰트는 hmtx.lsb 가 0 으로 고정돼 있는데(실제 잉크 시작점과
         * 무관하게), --recalc-bounds 는 glyf 헤더의 xMin 만 실제 점 좌표에 맞게
         * "고친다"(예: plus 글리프 0→107). 그러면 hmtx.lsb(0)와 glyf.xMin(107)이
         * 어긋나고, 래스터라이저(FreeType 등)가 이 불일치를 보정한답시고 그
         * 차이만큼(-107 유닛, 30px 렌더 기준 약 -6px) 글리프를 밀어버린다.
         * 원본 폰트는 lsb 와 xMin 이 둘 다 0 이라 — 둘 다 틀렸지만 서로 일관돼서 —
         * 이 보정이 발동하지 않았을 뿐이다.
         *
         * 실측: 98개 글리프 중 95개가 최대 -43유닛(약 -8.6px)까지 밀렸었다
         * (plus·arrow-left·chevron-left/right 등 거의 전부). 이 플래그를 빼면
         * 전부 원본과 동일하게 렌더된다 — 검증: verify-icon-centering.cjs.
         */
      ],
      { stdio: 'pipe' },
    );
  } catch (e) {
    // Python·fontTools 부재는 빌드를 막지 않는다 — 커밋된 서브셋으로 진행한다
    console.warn(
      '[icon-subset] 폰트 서브셋을 만들지 못했습니다 (python -m pip install fonttools).\n' +
        '             글리프맵은 갱신했고, 폰트는 이미 커밋된 것으로 빌드를 계속합니다.\n' +
        '             아이콘을 새로 추가했다면 개발 머신에서 한 번 돌려 커밋하세요.',
    );
    return;
  }

  const kb = (n) => Math.round(n / 1024);
  const pct = (before, after) => Math.round((1 - after / before) * 100);
  const fontBefore = fs.statSync(SOURCE).size;
  const fontAfter = fs.statSync(OUTPUT).size;
  const mapBefore = JSON.stringify(glyphMap).length;
  const mapAfter = fs.statSync(GLYPHMAP).size;
  console.log(
    `[icon-subset] 아이콘 ${names.length}개 / 전체 ${Object.keys(glyphMap).length}개\n` +
      `              폰트   ${kb(fontBefore)}KB → ${kb(fontAfter)}KB (${pct(fontBefore, fontAfter)}% 감소)\n` +
      `              글리프맵 ${kb(mapBefore)}KB → ${kb(mapAfter)}KB (${pct(mapBefore, mapAfter)}% 감소)`,
  );
}

main();

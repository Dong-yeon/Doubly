/**
 * MaterialCommunityIcons 서브셋 — 앱이 실제로 쓰는 글리프만 남긴다.
 *
 * <p><b>왜</b>: 전체 폰트는 7,448 글리프에 1.3MB 다. 앱이 쓰는 건 100개 남짓인데,
 * 이 파일은 <b>렌더를 막는</b> 경로에 있다(아이콘만 있는 버튼은 폰트가 없으면
 * 보이지 않아 조작이 막히므로 기다릴 수밖에 없다). 서브셋하면 ~98% 줄어든다.
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
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const SOURCE = path.join(FONT_DIR, 'MaterialCommunityIcons.full.ttf');
const OUTPUT = path.join(FONT_DIR, 'MaterialCommunityIcons.ttf');

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
        '--recalc-bounds',
      ],
      { stdio: 'pipe' },
    );
  } catch (e) {
    // Python·fontTools 부재는 빌드를 막지 않는다 — 커밋된 서브셋으로 진행한다
    console.warn(
      '[icon-subset] 서브셋을 만들지 못했습니다 (python -m pip install fonttools).\n' +
        '             이미 커밋된 폰트로 빌드를 계속합니다. 아이콘을 새로 추가했다면\n' +
        '             개발 머신에서 이 스크립트를 한 번 돌려 커밋하세요.',
    );
    return;
  }

  const before = fs.statSync(SOURCE).size;
  const after = fs.statSync(OUTPUT).size;
  const kb = (n) => Math.round(n / 1024);
  console.log(
    `[icon-subset] 아이콘 ${names.length}개 / 전체 ${Object.keys(glyphMap).length}개 · ` +
      `${kb(before)}KB → ${kb(after)}KB (${Math.round((1 - after / before) * 100)}% 감소)`,
  );
}

main();

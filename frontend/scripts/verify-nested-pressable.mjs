/**
 * 버튼 안 버튼 검증 — src 전체의 JSX 를 파싱해 누를 수 있는 요소가 겹친 자리를 찾는다.
 *
 * 프론트에는 테스트 러너가 없다(CLAUDE.md 6절). verify-spellcheck.mjs ·
 * verify-chat-theme-contrast.mjs 와 같은 자리에서, 이 스크립트가 마크업 회귀를 막는다.
 *
 *   node scripts/verify-nested-pressable.mjs
 *
 * <b>왜 필요한가</b>: react-native-web 은 `accessibilityRole="button"` 을 HTML
 * `<button>` 으로 그대로 내린다(propsToAccessibilityComponent). 그래서 카드 전체를
 * 누를 수 있게 만든 뒤 그 안에 작은 버튼을 하나 더 두면 <b>버튼 안의 버튼</b>이 된다 —
 * 유효하지 않은 HTML 이라 React 가 hydration 오류로 경고하고, 스크린리더에도 그렇게
 * 읽힌다. 네이티브에서는 눈에 보이는 증상이 없어서 <b>웹을 열어보지 않으면 모른다</b>.
 * 2026-09-15 에 식단 카드에서 발견해 셋을 고쳤고(MealCard·고정 공지 배너·저장한 대화),
 * 같은 모양은 "행 전체 탭 + 끝에 작은 버튼"이 필요할 때마다 다시 생긴다.
 *
 * <p>고치는 방법은 하나다 — 바깥을 누를 수 없는 View 로 바꿔 <b>형제</b>로 만든다.
 */
import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/** 누를 수 있는 요소로 취급하는 태그 */
const PRESSABLE =
  /^(TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|Pressable|Button|IconButton|Chip)$/;

/** 내부에서 accessibilityRole 을 붙이는 공용 버튼 컴포넌트 — 속성이 안 보여도 버튼이다 */
const ALWAYS_BUTTON = /^(Button|IconButton|Chip)$/;

function tsxFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...tsxFiles(path));
    } else if (path.endsWith('.tsx')) {
      out.push(path);
    }
  }
  return out;
}

const files = tsxFiles(SRC);
const hits = [];

for (const file of files) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const visit = (node, ancestors) => {
    let nested = ancestors;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const name = opening.tagName.getText(source);
      /*
       * HTML <button> 이 되는 조건만 센다. 하단 시트의 "배경 Pressable 안의 내용
       * Pressable" 처럼 role 이 없는 겹침은 div 라 문제가 아니다 — 이것까지 세면
       * 경고가 125건이 되고, 그러면 아무도 보지 않는다.
       */
      const isHtmlButton =
        ALWAYS_BUTTON.test(name) ||
        opening.attributes.properties.some(
          (attr) =>
            ts.isJsxAttribute(attr) &&
            attr.name.getText(source) === 'accessibilityRole' &&
            /button|imagebutton/.test(attr.initializer ? attr.initializer.getText(source) : ''),
        );
      if (PRESSABLE.test(name) && isHtmlButton) {
        if (ancestors.length > 0) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          hits.push(
            `${relative(ROOT, file).replace(/\\/g, '/')}:${line + 1}  ${ancestors.join(' > ')} > ${name}`,
          );
        }
        nested = [...ancestors, name];
      }
    }
    node.forEachChild((child) => visit(child, nested));
  };

  visit(source, []);
}

if (hits.length > 0) {
  console.error(`버튼 안 버튼 ${hits.length}곳:\n${hits.join('\n')}`);
  console.error('\n바깥을 누를 수 없는 View 로 바꿔 형제로 만드세요(MealCard.tsx 주석 참고).');
  process.exit(1);
}
console.log(`버튼 안 버튼 없음 (${files.length}개 파일 검사)`);

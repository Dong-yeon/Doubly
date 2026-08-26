/**
 * QA_CHECKLIST.md 패턴 5(접근성 라벨)를 다시 새는 걸 막기 위한 로컬 규칙.
 *
 * <p>패턴 5는 2026-08-26에 79개 파일을 손으로(정확히는 에이전트가) 훑어 한 번에 해소했다
 * (`dd56d69` 등). 이 규칙은 그 이후로 새로 추가되는 "아이콘/기호만 있는 버튼"이 다시
 * `accessibilityLabel` 없이 들어오는 걸 잡는 재발 방지용이지, 기존 코드를 강제로 전부
 * 통과시키기 위한 규칙이 아니다 — 그래서 severity는 warn이다(코드 리뷰가 없는 1인 개발
 * 워크플로우라 error로 막아봐야 우회만 늘고, 빌드를 끊을 CI도 없다).
 *
 * <p><b>판정 방식</b>: `TouchableOpacity`/`Pressable` JSX 서브트리 전체에서 텍스트를
 * 긁어모아(중첩 삼항·`&&`·`.map()` 콜백까지 따라 들어간다) "완성된 단어"로 볼 수 있는
 * 문자(한글 2자 이상 또는 영문 2자 이상 연속)가 하나라도 있으면 통과시킨다. `★` `✕` `⇄`
 * `⠿` `‹` `›` 같은 낱개 기호나 숫자 하나만 있는 경우는 걸린다 — 실제로 패턴 5 조사에서
 * 스크린리더가 못 읽던 버튼들이 전부 이 모양이었다(WorkoutSessionScreen 드래그 핸들,
 * DietRecordScreen 별점 등).
 *
 * <p>휴리스틱이라 오탐이 날 수 있다 — 단어 강도로 안 잡히는데 실제로는 의미가 명확한
 * 텍스트(예: 이모지 하나가 이미 그 자체로 라벨 역할, 커스텀 아이콘 컴포넌트가 내부적으로
 * label을 처리) 라면 그 줄에서 `// eslint-disable-next-line doubly-a11y/icon-button-label`
 * 로 끄면 된다. warn이라 어차피 빌드를 막지는 않는다.
 *
 * <p><b>알 수 없는 값은 "있다"고 본다</b>: `<Text>{title}</Text>`처럼 변수·prop을 그대로
 * 렌더링하는 경우(정적으로 값을 알 수 없는 `Identifier`/`MemberExpression`/함수 호출 등)는
 * 정적 분석으로 내용물을 알 수 없다. 이런 "불투명한" 표현식을 하나라도 만나면 그 요소는
 * 통과시킨다 — `Button`/`Chip`처럼 `title`/`label` prop을 그대로 찍는 재사용 컴포넌트가
 * 압도적으로 많아서, 여기서 엄격하게 굴면 오탐이 진짜 신호를 덮어버린다. 대신 판정 불가능한
 * 텍스트 없이(prop 없이) 아이콘 컴포넌트만 자식으로 두는 진짜 아이콘 버튼은 여전히 잡힌다.
 */

/**
 * JSX 서브트리(및 흔한 렌더 패턴들: 삼항, `&&`, `.map()` 콜백)에서 텍스트를 전부 모으고,
 * 정적으로 판단 못 하는 표현식을 만났는지도 같이 돌려준다.
 */
function collectText(node) {
  let text = '';
  let hasOpaqueExpression = false;

  function visit(n) {
    if (!n) return;
    switch (n.type) {
      case 'JSXText':
        text += n.value;
        return;
      case 'Literal':
        if (typeof n.value === 'string') text += n.value;
        return;
      case 'TemplateLiteral':
        n.quasis.forEach((q) => {
          text += q.value.raw;
        });
        n.expressions.forEach(visit);
        return;
      case 'JSXElement':
        (n.children || []).forEach(visit);
        return;
      case 'JSXFragment':
        (n.children || []).forEach(visit);
        return;
      case 'JSXExpressionContainer':
        // {}(빈 컨테이너)나 JSXEmptyExpression은 판정 대상이 아니다
        if (n.expression.type !== 'JSXEmptyExpression') visit(n.expression);
        return;
      case 'ConditionalExpression':
        visit(n.consequent);
        visit(n.alternate);
        return;
      case 'LogicalExpression':
        visit(n.left);
        visit(n.right);
        return;
      case 'ArrayExpression':
        (n.elements || []).forEach(visit);
        return;
      case 'CallExpression':
        // item.map((x) => <JSX/>) 같은 흔한 리스트 렌더 패턴 — 콜백 반환값까지 따라 들어간다.
        // 콜백이 아닌 인자·호출 자체의 반환값은 정적으로 알 수 없어 불투명 처리한다.
        if (
          n.arguments.some(
            (arg) => arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression'
          )
        ) {
          n.arguments.forEach((arg) => {
            if (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression') {
              if (arg.body.type === 'BlockStatement') {
                arg.body.body.forEach((stmt) => {
                  if (stmt.type === 'ReturnStatement') visit(stmt.argument);
                });
              } else {
                visit(arg.body);
              }
            }
          });
        } else {
          hasOpaqueExpression = true;
        }
        return;
      default:
        // Identifier(`{title}`), MemberExpression(`{item.name}`) 등 — 정적으로 값을 모른다
        hasOpaqueExpression = true;
        return;
    }
  }

  visit(node);
  return { text, hasOpaqueExpression };
}

/**
 * "읽을 수 있는 텍스트"로 인정하는 기준: 영문은 2자 이상 연속(단일 알파벳은 아이콘 폰트·이니셜일
 * 확률이 높다), 한글은 1자만 있어도 인정한다 — "나"/"너"/"예"처럼 한 음절 자체가 온전한 단어인
 * 경우가 흔해서 영문과 같은 기준을 적용하면 오탐이 난다(TripExpenseScreen의 "나"/"상대" 결제자
 * 토글이 실제로 걸렸었다).
 */
const READABLE_WORD = /[A-Za-z]{2,}|[가-힣]/;

module.exports = {
  rules: {
    'icon-button-label': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            '아이콘/기호만 있는 TouchableOpacity·Pressable에 accessibilityLabel이 있는지 확인 (QA_CHECKLIST.md 패턴 5)',
        },
        schema: [],
      },
      create(context) {
        return {
          JSXOpeningElement(node) {
            const name = node.name.type === 'JSXIdentifier' ? node.name.name : null;
            if (name !== 'TouchableOpacity' && name !== 'Pressable') return;

            const attrs = node.attributes.filter((a) => a.type === 'JSXAttribute');
            const hasLabel = attrs.some((a) => a.name.name === 'accessibilityLabel');
            if (hasLabel) return;

            // accessible={false} — 의도적으로 스크린리더에서 숨긴 장식용 요소는 대상 아님
            const accessibleFalse = attrs.some(
              (a) =>
                a.name.name === 'accessible' &&
                a.value &&
                a.value.type === 'JSXExpressionContainer' &&
                a.value.expression.type === 'Literal' &&
                a.value.expression.value === false
            );
            if (accessibleFalse) return;

            const jsxElement = node.parent;
            if (!jsxElement || jsxElement.type !== 'JSXElement') return;

            const { text, hasOpaqueExpression } = collectText(jsxElement);
            if (hasOpaqueExpression || READABLE_WORD.test(text)) return;

            context.report({
              node,
              message:
                '아이콘/기호만 있는 버튼으로 보입니다 — accessibilityLabel을 추가하세요 (QA_CHECKLIST.md 패턴 5). ' +
                '옆에 이미 읽을 수 있는 텍스트가 있는데 오탐이면 이 줄에 eslint-disable-next-line으로 끄세요.',
            });
          },
        };
      },
    },
  },
};

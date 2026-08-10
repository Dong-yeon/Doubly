/**
 * 색 위에 얹는 글자·아이콘 색을 고른다.
 *
 * <p><b>왜 필요한가</b>: 팔레트는 "white 는 색 위에 얹는 텍스트용"이라는 전제로
 * 아바타 이니셜·배지 아이콘에 {@code colors.white} 를 고정해 두었다. 라이트에서는
 * 소유자 색이 어두워(Gold #8A6817 · Green #2C7D33) 문제가 없었지만,
 * <b>다크에서는 같은 자리의 색이 파스텔</b>(#F1C999 · #A7D2A9)이라 흰 글자가
 * 실측 <b>1.55:1 · 1.69:1</b> 로 사실상 보이지 않았다.
 *
 * <p>테마별 토큰을 하나 더 두는 대신 <b>배경 휘도로 고르게</b> 한다. 호출부가
 * primary·me·partner·together 등 서로 다른 색을 넘기고, 그 색은 테마에 따라
 * 밝기가 뒤집히기 때문이다 — 규칙 하나면 모든 조합이 자동으로 맞는다.
 */
/**
 * 후보는 <b>테마 토큰이 아니라 고정값</b>이다. 판단 기준이 "지금 테마"가 아니라
 * "밑에 깔린 색"이기 때문이다 — 다크의 {@code colors.ink} 는 밝은 색이라
 * 파스텔 위에 얹으면 오히려 더 안 보인다.
 */
const ON_LIGHT = '#1A1D1A'; // = 라이트 팔레트의 ink
const ON_DARK = '#FFFFFF';

/** WCAG 상대 휘도 */
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const toLinear = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = toLinear(parseInt(full.slice(0, 2), 16));
  const g = toLinear(parseInt(full.slice(2, 4), 16));
  const b = toLinear(parseInt(full.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 두 후보(흰색 / 잉크)의 대비가 정확히 같아지는 배경 휘도.
 *
 * <p>WCAG 대비식 {@code (L1+0.05)/(L2+0.05)} 에서 white 쪽과 ink 쪽을 같다고 놓고 풀면
 * {@code Lbg = √(1.05·(Link+0.05)) − 0.05} 다. ink(#1A1D1A, L≈0.0117) 기준으로 계산하면
 * <b>약 0.2046</b> — 예전엔 이 자리에 0.4 를 썼는데, 실제 교차점의 거의 2배였다.
 *
 * <p>그 사이(0.2~0.4)에 놓인 배경(예: success 다크 #3FBF80, L=0.399)은 0.4 임계값에서
 * "흰색"을 골랐지만 실제로는 ink 가 7.27:1 로 압도적으로 나았다(흰색은 2.34:1) —
 * 사각지대에서 항상 <b>틀린 쪽</b>을 고르고 있었다는 뜻이다.
 *
 * <p>기존에 이 함수를 쓰던 색(소유자 색 6가지)은 전부 크로스오버에서 멀리
 * 떨어져 있어(라이트 ≤0.155, 다크 ≥0.57) 임계값을 고쳐도 선택이 바뀌지 않는다
 * (검증: check-oncolor-threshold.cjs).
 */
const CROSSOVER = Math.sqrt(1.05 * (luminance(ON_LIGHT) + 0.05)) - 0.05;

/**
 * {@code background} 위에서 더 잘 읽히는 글자색.
 *
 * <p>hex 가 아닌 값(rgba·PlatformColor 등)이 오면 판단할 수 없으므로 흰색을 준다.
 */
export function onColor(background: string): string {
  if (!/^#[0-9a-fA-F]{3,8}$/.test(background)) return ON_DARK;
  return luminance(background) > CROSSOVER ? ON_LIGHT : ON_DARK;
}

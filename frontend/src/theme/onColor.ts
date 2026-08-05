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
 * {@code background} 위에서 더 잘 읽히는 글자색.
 *
 * <p>경계값 0.4 는 두 후보(흰색 / 잉크)의 대비가 뒤집히는 지점 근처다.
 * hex 가 아닌 값(rgba·PlatformColor 등)이 오면 판단할 수 없으므로 흰색을 준다.
 */
export function onColor(background: string): string {
  if (!/^#[0-9a-fA-F]{3,8}$/.test(background)) return ON_DARK;
  return luminance(background) > 0.4 ? ON_LIGHT : ON_DARK;
}

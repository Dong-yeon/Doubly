/**
 * Sentry — 웹 구현 (아무것도 하지 않는다).
 *
 * <p><b>왜 파일을 나눴나</b>: `@sentry/react-native` 는 Expo Web 을 공식 지원하지 않아
 * 웹에서는 어차피 초기화를 건너뛰고 있었다. 그런데 `import` 문 자체는 남아 있어서
 * <b>실행되지도 않는 코드가 웹 번들에 그대로 실려 왔다</b> — 실측 약 2MB(전체의 32%)로
 * 번들 최대 기여자였다.
 *
 * 런타임 분기(`if (Platform.OS === 'web') return`)로는 이걸 못 줄인다. 번들러가
 * 플랫폼별 파일(.web / .native)을 골라 넣게 해야 아예 포함되지 않는다.
 * 이 프로젝트가 KakaoMap.web.tsx 에서 쓰는 방식과 같다.
 *
 * <p>웹의 에러 수집은 기존대로 {@link ./errorReporter} 의 콘솔 폴백이 맡는다.
 * 웹까지 수집하려면 `@sentry/browser` 를 여기에 붙이면 된다 —
 * 그 경우에도 네이티브 번들은 영향받지 않는다.
 */
export function initSentry(): void {
  // no-op
}

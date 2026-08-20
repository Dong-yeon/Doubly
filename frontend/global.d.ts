/**
 * 앰비언트 타입 보강.
 *
 * <p>`react-native-iap`가 raw TS 소스를 그대로 배포하면서 Node 전역(`global`)을 타입
 * 선언 없이 참조한다(`node_modules/react-native-iap/src/utils/debug.ts`) — 런타임
 * (Metro/Hermes)에는 항상 있는 값이라 문제없지만, 이 프로젝트 tsconfig의
 * `customConditions: ["react-native"]` 가 그 raw 소스를 그대로 타입체크 대상에
 * 포함시키면서 `tsc`만 `global`을 못 찾아 에러를 낸다. 나중에 같은 패턴을 쓰는
 * 다른 라이브러리를 붙여도 다시 겪지 않도록 프로젝트 전역에 한 번만 선언해둔다.
 */
declare var global: typeof globalThis;

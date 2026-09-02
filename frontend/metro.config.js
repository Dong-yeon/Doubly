/**
 * Metro 설정 — Sentry 소스맵 업로드용.
 *
 * getSentryExpoConfig 는 Expo 기본 설정 위에 Sentry 직렬화기를 얹어,
 * 번들과 소스맵에 Debug ID 를 심는다. EAS 빌드 시 Sentry 플러그인(app.json)이
 * 이 Debug ID 로 소스맵을 매칭하므로, 이 파일이 없으면 업로드해도 스택트레이스가
 * 난독화된 채로 남는다.
 *
 * 업로드 자격은 빌드 환경변수(SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN)로
 * 주입한다 — docs/EAS_BUILD.md 참고.
 */
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const path = require('path');

const config = getSentryExpoConfig(__dirname);

/*
 * hunspell-asm(맞춤법 검사 프로토타입, 2026-09-02)가 내부적으로 쓰는 nanoid@2 는
 * "React Native does not have a built-in secure random generator" 를 <b>무조건</b> 던진다
 * (navigator.product === 'ReactNative' 이기만 하면, crypto 폴리필 유무와 무관하게).
 * 이 id 는 WASM 가상 파일시스템의 임시 마운트 경로 이름일 뿐이라 보안 랜덤일 필요가
 * 없다 — nanoid 자신이 안내하는 대로 nanoid/non-secure(순수 Math.random, crypto 불필요)로
 * 우회한다. hunspell-asm 트리 안의 요청만 걸러 리다이렉트해 다른 곳의 nanoid 사용에는
 * 영향이 없게 한다.
 */
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Metro 는 플랫폼과 무관하게 경로를 슬래시(/)로 정규화해 넘긴다 — path.sep(윈도우에선 \)로
  // 비교하면 여기서 절대 안 걸린다(방금 실기기에서 이렇게 안 걸리는 걸 직접 확인했다).
  // hunspell-asm 자신뿐 아니라 그 의존성 emscripten-wasm-loader 도 각자 자기 nanoid(같은
  // 2.1.11)를 갖고 있어 똑같이 던진다 — 실기기에서 하나만 우회했더니 두 번째에서 또
  // 걸리는 걸 직접 봤다(2026-09-02). 이 트리 밖의 nanoid 사용에는 손대지 않는다.
  if (moduleName === 'nanoid') {
    if (context.originModulePath.includes('hunspell-asm')) {
      return {
        type: 'sourceFile',
        filePath: path.resolve(
          __dirname,
          'node_modules/hunspell-asm/node_modules/nanoid/non-secure/index.js',
        ),
      };
    }
    if (context.originModulePath.includes('emscripten-wasm-loader')) {
      return {
        type: 'sourceFile',
        filePath: path.resolve(
          __dirname,
          'node_modules/emscripten-wasm-loader/node_modules/nanoid/non-secure/index.js',
        ),
      };
    }
  }
  return originalResolveRequest
    ? originalResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

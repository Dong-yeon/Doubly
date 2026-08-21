/**
 * 동적 설정 — app.json 은 그대로 두고 <b>빌드 시점 정보만</b> 얹는다.
 *
 * <p>Expo 는 app.config.js 가 있으면 app.json 을 먼저 읽어 {@code config} 로 넘겨준다.
 * 그래서 여기서 하는 일은 {@code extra.build} 추가 하나뿐이고, 설정의 원본은 계속 app.json 이다.
 *
 * <p><b>왜 필요한가</b>: 예전에는 설정 화면 버전이 소스에 박힌 '1.0.0' 이라, 폰에 깔린 앱이
 * 어느 시점 코드인지 앱만 보고는 알 수 없었다. AAB(스토어 빌드)는 EAS 빌드를 돌린 순간의
 * JS 가 그대로 얼어붙는 반면 웹(Netlify)은 배포할 때마다 최신이라, "앱만 안 되는" 증상에서
 * 버전 차이인지 아닌지 판단할 근거가 없었다. 커밋 해시와 빌드 시각이 화면에 있으면
 * 그 판단이 5초로 끝난다.
 */

const { execSync } = require('child_process');

/** 커밋 해시 7자리 — 빌드 환경마다 얻는 방법이 다르다. */
function resolveCommit() {
  // EAS 빌드 서버는 소스를 아카이브로 받아 .git 이 없을 수 있어 환경변수가 정석이다
  const fromCi =
    process.env.EAS_BUILD_GIT_COMMIT_HASH // EAS Build
    || process.env.COMMIT_REF // Netlify
    || process.env.GITHUB_SHA; // GitHub Actions
  if (fromCi) return fromCi.slice(0, 7);

  // 로컬 빌드(개발 PC에서 eas build / npm run build:web) — 체크아웃이 있으니 git 에 직접 묻는다
  try {
    return execSync('git rev-parse --short=7 HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
  } catch {
    return 'unknown';
  }
}

/** 어디서 만든 빌드인가 — 같은 커밋이라도 preview(APK)와 production(AAB)은 다른 산출물이다. */
function resolveProfile() {
  if (process.env.EAS_BUILD_PROFILE) return process.env.EAS_BUILD_PROFILE;
  if (process.env.NETLIFY) return 'netlify';
  return 'local';
}

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    build: {
      commit: resolveCommit(),
      // 설정을 평가하는 시점 = 번들을 만드는 시점
      time: new Date().toISOString(),
      profile: resolveProfile(),
    },
  },
});

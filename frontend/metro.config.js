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

module.exports = getSentryExpoConfig(__dirname);

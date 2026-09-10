/**
 * @expo/fingerprint 설정 — 런타임 버전(fingerprint 정책)이 <b>커밋·시각과 무관하게</b> 나오도록.
 *
 * <p><b>왜 필요한가</b>: app.config.js 가 extra.build 에 커밋 해시와 빌드 시각을 넣는데,
 * fingerprint 는 기본적으로 expo config 의 extra 까지 해시한다. 그래서 같은 코드라도
 * ① 실행할 때마다(시각) ② 커밋할 때마다(해시) 런타임 버전이 달라졌고, 그 결과
 * - EAS Build 가 "Runtime version calculated on local machine not equal to runtime version
 *   calculated during build" 로 Configure expo-updates 단계에서 실패했다(2026-09-10, Android·iOS 둘 다).
 * - 통과했더라도 커밋마다 런타임 버전이 바뀌어 EAS Update 가 어떤 빌드에도 배달되지 않았을 것이다.
 *
 * <p>ExpoConfigExtraSection 은 extra 전체를 해시에서 뺀다. extra 는 네이티브에 영향이 없다
 * (eas.projectId 와 build 정보뿐). PackageJsonAndroidAndIosScriptsIfNotContainRun 은 기본값 유지.
 *
 * <p>ignorePaths: 로컬에서 `expo run:android` 로 생긴 android/ 는 gitignore 라 EAS 서버에는
 * 올라가지 않는다. 로컬 fingerprint 만 그 폴더를 포함하면 또 서버와 어긋나므로 양쪽 다 제외한다
 * (CNG 프로젝트라 네이티브 폴더는 app.json + node_modules 에서 파생되고, 그 둘은 이미 해시된다).
 *
 * <p>검증: `npx expo-updates fingerprint:generate --platform android` 를 두 번 돌려 같은 해시가
 * 나와야 한다. 자세한 경위는 docs/EAS_BUILD.md 8-5.
 */
/** @type {import('@expo/fingerprint').Config} */
const config = {
  sourceSkips: ['PackageJsonAndroidAndIosScriptsIfNotContainRun', 'ExpoConfigExtraSection'],
  ignorePaths: ['android/**/*', 'ios/**/*'],
};

module.exports = config;

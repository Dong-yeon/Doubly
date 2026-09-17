# EAS Build 가이드 (2단계 — 네이티브 앱, 안드로이드부터)

Expo의 클라우드 빌드 서비스(EAS Build)로 실제 `.apk` 파일을 만들어 폰에 직접 설치합니다.
Play 스토어 등록 없이(내부 배포) 바로 테스트할 수 있고, Windows PC에서도 그대로 가능합니다
(빌드는 Expo 클라우드에서 돌아가므로 로컬에 Android Studio가 없어도 됩니다).

> 백엔드(Railway)·Cloudinary 설정은 `frontend/src/constants/config.ts`에 이미 반영돼 있어서
> 네이티브 앱도 별도 설정 없이 바로 배포된 서버에 연결됩니다.

## 1. Expo 계정 준비 (최초 1회)

https://expo.dev 에서 무료 계정 생성 (이미 있으면 생략).

## 2. eas-cli 로그인 (최초 1회)

`frontend` 폴더에서:

```bash
npx eas-cli login
```
Expo 계정으로 로그인합니다. (`npm install -g eas-cli` 로 전역 설치해도 됩니다.)

## 3. 프로젝트 연결 (최초 1회)

```bash
npx eas-cli build:configure
```
- Expo 프로젝트를 생성/연결하고 `app.json` 에 `extra.eas.projectId` 를 자동으로 추가합니다.
- `eas.json` 은 이미 저장소에 포함돼 있으므로(빌드 프로필 `development`/`preview`/`production`),
  덮어쓸지 물어보면 유지해도 됩니다.
- 완료 후 변경된 `app.json` 은 커밋해 두는 것을 권장합니다(다음 빌드부터 재사용).

## 4. 안드로이드 빌드 (APK)

```bash
npx eas-cli build --platform android --profile preview
```
- `preview` 프로필은 `eas.json` 에서 `buildType: apk` 로 설정돼 있어, Play 스토어 없이
  바로 설치 가능한 `.apk` 를 만듭니다(`production` 프로필은 스토어 제출용 `.aab`).
- 빌드는 Expo 클라우드에서 진행되며 보통 몇 분~10여 분 걸립니다. 완료되면 터미널과
  https://expo.dev 대시보드에 다운로드 링크(QR 포함)가 나타납니다.

## 5. 폰에 설치

1. 빌드 완료 후 나온 링크를 폰 브라우저로 열거나, 터미널에 뜬 QR을 폰 카메라로 스캔
2. `.apk` 다운로드 → 설치
   - 안드로이드가 "출처를 알 수 없는 앱" 경고를 띄우면 **허용**(최초 1회, 설치 후 꺼도 무방)
3. 홈 화면에 Doubly 아이콘 생성 → 실행

이후에는 Expo Go 앱이나 QR 스캔 없이, 일반 앱처럼 아이콘을 눌러 실행합니다.

## 6. 앱 업데이트 시

코드를 수정한 뒤 다시 테스트하려면 3단계는 건너뛰고 4~5단계만 반복하면 됩니다:

```bash
npx eas-cli build --platform android --profile preview
```

작은 JS/UI 변경만 있고 네이티브 설정(권한, 아이콘 등) 변경이 없다면, 매번 새로 빌드하는 대신
**EAS Update 로 빌드 없이 배포합니다** — §8 (2026-09-09 도입).

## 6-1. 폰에 깔린 게 어느 빌드인지 확인하기

**설정 화면 맨 아래**에 버전과 함께 빌드 지문이 뜹니다:

```
Doubly v1.0.0
a1b2c3d · 2026-08-21 21:40 · production
```

- `a1b2c3d` — 이 번들을 만든 **커밋 해시**
- 뒤의 시각 — 빌드 시각(기기 로컬 시간)
- `production`/`preview` — eas.json 프로필. 웹 배포본은 `netlify`, 로컬 빌드는 `local`

**길게 누르면 복사**되고, 문의·버그 신고 메일 본문에도 자동으로 들어갑니다.

> 왜 필요한가: AAB/APK 는 EAS 빌드를 돌린 순간의 JS 가 그대로 얼어붙는 반면 웹(Netlify)은
> 배포할 때마다 최신입니다. "앱만 안 되고 웹은 된다" 같은 증상에서 **빌드 차이인지 아닌지**를
> 먼저 갈라야 하는데, 그 근거가 화면에 없으면 확인할 방법이 없습니다.
> (값은 `app.config.js` 가 빌드 시점에 심습니다 — EAS 서버에서는 `EAS_BUILD_GIT_COMMIT_HASH`,
> 로컬에서는 `git rev-parse`.)

## 7. Sentry 소스맵 업로드 (읽을 수 있는 스택트레이스)

Sentry 연동 자체는 코드에 포함돼 있어(`src/utils/sentry.ts`) 빌드만 해도 오류는 수집되지만,
소스맵이 없으면 스택트레이스가 난독화된 채로 보입니다. 아래 환경변수를 **한 번만** 등록해 두면
이후 모든 EAS 빌드에서 소스맵이 자동 업로드됩니다.

> 코드 쪽 배선은 이미 되어 있습니다 — `app.json` 의 `@sentry/react-native` 플러그인이
> 빌드 시 업로드 스크립트를 심고, `metro.config.js`(getSentryExpoConfig)가 번들·소스맵에
> Debug ID 를 넣어 업로드본과 매칭합니다. 환경변수가 없으면 업로드만 조용히 생략됩니다.

### 7-1. Sentry 인증 토큰 생성 (최초 1회)

1. https://sentry.io → Settings → **Auth Tokens** → "Create New Token"
2. 스코프는 `project:releases` (+ `org:read`) 면 충분합니다
3. 생성된 토큰(`sntrys_...`)을 복사 — **저장소에 커밋하지 마세요**

### 7-2. EAS 환경변수 등록 (최초 1회)

조직·프로젝트 슬러그는 `app.json` 의 Sentry 플러그인 설정에 고정돼 있으므로
(`organization: happyeon`, `project: doubly`), 등록할 것은 **인증 토큰 하나**뿐입니다:

```bash
npx eas-cli env:create --scope project --name SENTRY_AUTH_TOKEN --value <토큰> --visibility secret --environment production --environment preview
```

(expo.dev 대시보드 → 프로젝트 → Environment variables 에서 웹으로 등록해도 동일합니다.
플래그가 안 먹으면 `npx eas-cli env:create` 만 입력해 대화형으로 진행하세요.)

> ⚠️ 환경변수는 **EAS 프로젝트 단위**입니다. EAS 프로젝트를 새로 만들면(projectId 변경)
> 새 프로젝트에 다시 등록해야 합니다. 토큰이 없으면 소스맵 업로드 단계에서
> 그레이들 빌드 전체가 실패합니다.

### 7-3. 확인

다음 빌드(`npx eas-cli build ...`)의 로그에 `sentry-cli ... sourcemaps upload` 류 문구가 보이고,
이후 Sentry 이슈의 스택트레이스가 원본 TypeScript 파일·줄 번호로 표시되면 성공입니다.
업로드가 생략되면 빌드 로그에 "SENTRY_AUTH_TOKEN environment variable" 안내가 남습니다.

## 8. EAS Update — 빌드 없이 JS 배포 (2026-09-09 도입)

빌드는 건당 과금이고 15~20분 걸립니다. 그런데 커밋 대부분은 화면·로직·문구처럼 **JS 만 바뀌는
변경**이라 네이티브 빌드가 필요 없습니다. `expo-updates` 를 넣어 그런 변경은 스토어 제출 없이
설치된 앱에 바로 내려보냅니다(앱이 켜질 때 받아 다음 실행부터 적용).

### 8-1. 빌드인가 업데이트인가

| 변경 | 방법 |
| --- | --- |
| 화면·로직·문구·이미지·폰트(JS 번들과 에셋) | `npm run update:production` |
| 의존성 추가·삭제·버전 변경 (`package.json`) | 빌드 |
| `app.json` 의 plugins / permissions / 아이콘 / 스플래시 | 빌드 |
| `modules/` 안 Kotlin·C++·`.so`, 사전·모델 파일 | 빌드 |
| Expo SDK 업그레이드 | 빌드 |

헷갈리면 핑거프린트를 비교하면 됩니다 — `npx @expo/fingerprint .` 의 해시가 마지막 빌드 때와
같으면 업데이트로 충분합니다.

### 8-2. 명령

```bash
npm run update:production     # 스토어 배포본(production 채널)에 배포
npm run update:preview        # preview APK 에 배포
```

`--auto` 라 메시지는 현재 커밋 제목, 브랜치는 현재 git 브랜치에서 가져옵니다. 올리기 전에
`npm run typecheck` 는 꼭 돌립니다 — 업데이트는 심사가 없어서 깨진 번들이 곧바로 사용자에게 갑니다.

되돌리기: `npx eas-cli update:rollback` (이전 업데이트 또는 빌드 내장 번들로).

### 8-3. 어떻게 맞물리나

- **채널** — `eas.json` 의 각 프로필에 `channel` 이 있습니다(development / preview / production).
  그 프로필로 만든 빌드는 같은 이름의 채널만 봅니다.
- **런타임 버전 = fingerprint** — 네이티브에 영향을 주는 파일들의 해시입니다. 업데이트는 같은
  핑거프린트로 만든 빌드에만 배달됩니다. 네이티브가 바뀐 커밋에서 실수로 업데이트를 올려도
  기존 빌드에는 **안 가는 것**이지 깨지는 게 아닙니다. 대신 그 커밋은 빌드해야 사용자가 받습니다.
- **빌드 지문** — 설정 화면 맨 아래의 커밋 해시(§6-1)는 `eas update` 시점에도 새로 찍히므로,
  폰에 깔린 앱이 어느 업데이트를 받았는지 그대로 알 수 있습니다.
- **Sentry 소스맵** — 빌드 때는 §7 로 자동 업로드되지만 업데이트는 별도입니다. 토큰이 로컬에
  있으면 업데이트 뒤에 한 줄 더 실행합니다:

  ```bash
  SENTRY_AUTH_TOKEN=<토큰> npx sentry-expo-upload-sourcemaps dist
  ```

  안 하면 그 업데이트의 스택트레이스만 난독화된 채로 보입니다(오류 수집 자체는 됩니다).

### 8-4. 처음 한 번은 빌드가 필요하다

`expo-updates` 는 네이티브 모듈이라 **이 설정이 들어간 빌드부터** 업데이트를 받습니다.
버전코드 25 이하 빌드는 업데이트를 모릅니다. 도입 커밋 이후 첫 스토어 빌드(버전코드 26)를 한 번
올리고 나면 그 뒤로는 JS 변경마다 빌드하지 않아도 됩니다.

### 8-5. fingerprint 가 매번 달라지던 문제 (2026-09-10) — fingerprint.config.js

EAS Update 도입 뒤 첫 production 빌드(Android 26 · iOS 18)가 둘 다 **Configure expo-updates**
단계에서 `Runtime version calculated on local machine not equal to runtime version calculated
during build` 로 실패했다. 같은 커밋에서 `npx expo-updates fingerprint:generate` 를 두 번 돌리면
해시가 매번 달랐다.

- **원인**: `app.config.js` 가 `extra.build` 에 커밋 해시와 빌드 시각을 넣는데, @expo/fingerprint 는
  기본적으로 expo config 의 `extra` 까지 해시한다(`SourceSkips.ExpoConfigExtraSection` 을 줘야
  뺀다). 시각 때문에 실행마다, 해시 때문에 커밋마다 런타임 버전이 바뀌었다. 빌드 실패가 아니었어도
  **커밋마다 런타임 버전이 달라져 EAS Update 가 어떤 빌드에도 배달되지 않았을** 구조였다.
- **부수 원인(Android 만)**: 로컬에서 `expo run:android` 로 생긴 `frontend/android/` 는 gitignore 라
  서버에는 없는데 로컬 fingerprint 에는 들어간다. 그래서 `eas build` 가 "android directory was
  detected" 를 찍는 PC 에서는 extra 를 고쳐도 Android 만 또 어긋난다.
- **조치**: `frontend/fingerprint.config.js` — `sourceSkips` 에 `ExpoConfigExtraSection`(기본값
  `PackageJsonAndroidAndIosScriptsIfNotContainRun` 유지), `ignorePaths` 에 `android/**/*`·`ios/**/*`.
  EAS 서버도 같은 파일을 읽으므로 로컬·서버·`eas update` 가 같은 값을 낸다.
- **세 번째 원인(둘 다)**: 위를 고친 뒤에도 같은 오류가 났다. 이번엔 로그에 diff 가 찍혔다 —
  EAS 에만 `node_modules/expo-updates`·`expo-eas-client`·`expo-structured-headers` 가 있었다.
  origin 에서 받은 EAS Update 커밋이 package-lock 에 넣은 의존성을 **로컬 node_modules 가 아직
  설치하지 않은** 상태였고(`npx expo-updates …` 는 없으면 그때그때 받아와서 티가 안 난다),
  fingerprint 는 node_modules 의 네이티브 모듈 목록을 해시하므로 로컬과 서버가 달랐다.
  `npm install` 로 lock 과 맞춘 뒤 로컬 해시가 EAS 로그의 "Resolved runtime version" 과
  정확히 일치했다. **pull 뒤에는 빌드 전에 `npm install`** — 이 규칙이 없으면 재발한다.
- **네 번째 원인(Android 만, 더 위험)**: fingerprint 가 맞아 통과한 빌드(26·27·28) 로그에 `PREBUILD:
  skipped` 가 찍혀 있었다. 루트 `.easignore` 가 있으면 EAS CLI 는 **.gitignore 를 보지 않는다**. 그래서
  gitignore 된 `frontend/android/`(로컬 `expo run:android` 산출물, 9/9 생성)가 아카이브에 그대로 올라갔고,
  CLI 는 `android/app/build.gradle` 이 "무시되지 않은 채 존재"하니 프로젝트를 bare 로 판정해 서버가
  prebuild 를 건너뛰었다. 그 빌드는 **app.json 을 읽지 않는다** — blockedPermissions 를 넣고도
  READ_MEDIA_IMAGES 가 든 옛 매니페스트로 빌드될 뻔했다(28 은 취소). 같은 이유로 node_modules 까지
  올라가 아카이브가 1.0 GB 였다. 조치: `.easignore` 에 `frontend/android/`·`frontend/ios/`·
  `frontend/node_modules/` 추가. eas-cli 의 `resolveWorkflowAsync` 를 직접 돌려 android/ 가 있어도
  `managed` 로 나오는 것을 확인했다. 그날의 로컬 android/ 는
  `D:\happyeon\99.Happyeon\_backup\Doubly-frontend-android-2026-09-10` 로 옮겨 뒀다(다음 `npm run android`
  가 새로 만든다). 빌드 로그에서 `PREBUILD:success` 를 확인하는 습관이 이 사고를 막는다.
- **검증**: 두 번 돌려 같은 해시가 나오면 된다. android/ 폴더가 있어도 없어도 같아야 하고,
  실패 로그가 있다면 그 안의 "Resolved runtime version" 과 같아야 한다.

```bash
cd frontend && npx expo-updates fingerprint:generate --platform android
```

### 8-6. 업데이트가 "성공했는데 0명에게 갔다" (2026-09-11)

fingerprint 가 정확해도, **그 fingerprint 로 만든 빌드가 스토어에 없으면** 업데이트는 조용히
아무에게도 안 간다(에러 없음). 실제로 production 업데이트 4건 중 3건이 취소된 빌드·미제출 빌드를
대상으로 올라가 iOS 사용자는 이틀치를 하나도 못 받았다. **업데이트 전에 "지금 출시돼 있는 빌드의
Fingerprint" 를 먼저 확인한다** — 최신 빌드 줄이 아니라 *제출이 `finished` 인* 빌드 줄을 본다.
전말과 확인 명령은 `docs/RELEASE_OTA_MISDELIVERY_2026-09-11.md`.

## 9. Google Play 정책·계정 요구사항

### 9-1. Play 정책: 사진 선택 도구 (2026-09)

버전 코드 25 가 **"사진/동영상에 대체 시스템 선택 도구 사용"** 정책 위반으로 4회 거부됐다
(2026-09-08 ~ 09-10). Play 는 사진을 가끔 한 장씩 고르는 앱(채팅·식단·프로필·피드가 전부
이 경우)에 `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` 를 허용하지 않고 Android **사진 선택
도구(Photo Picker)** 를 쓰라고 요구한다.

- **권한이 어디서 들어왔나**: 우리 코드가 아니라 `expo-media-library` config plugin 의
  기본값(`granularPermissions: ['photo','video','audio']`)이 세 권한을 매니페스트에 넣고
  있었다. 이 라이브러리는 받은 사진을 갤러리에 **저장**할 때만 쓰므로 읽기 권한은
  처음부터 필요 없었다. `READ_EXTERNAL_STORAGE`(maxSdk 32)는 `expo-file-system` /
  `expo-image-picker` 의 라이브러리 매니페스트가 넣는다.
- **조치** (`frontend/app.json`): ① media-library 플러그인에 `granularPermissions: []`,
  ② `android.blockedPermissions` 에 `READ_MEDIA_IMAGES`·`READ_MEDIA_VIDEO`·`READ_MEDIA_AUDIO`·
  `READ_MEDIA_VISUAL_USER_SELECTED`·`READ_EXTERNAL_STORAGE`. blockedPermissions 는 메인
  매니페스트에 `tools:node="remove"` 를 붙이므로 **라이브러리 AAR 이 선언한 것까지** 병합
  시점에 빠진다 — 플러그인 옵션만 바꾸면 라이브러리 매니페스트 쪽은 남는다.
- **동작은 그대로다**: `expo-image-picker` 는 Android 에서 이미 Photo Picker
  (`PickVisualMedia`)를 띄우고(`legacy: true` 를 주지 않는 한), 이건 앱 밖에서 돌아
  저장소 권한이 없어도 된다. 다만 `utils/imageUpload.ts` 의 `ensurePermission` 이
  Android 에서 `requestMediaLibraryPermissionsAsync` 를 부르던 것을 건너뛰게 했다 —
  권한을 매니페스트에서 뺀 뒤에도 요청하면 Android 12 이하에서 자동 거부돼 "권한이
  필요해요" 토스트만 뜨기 때문이다. 갤러리 저장(`ImageViewer`)은 write-only 요청이라
  `WRITE_EXTERNAL_STORAGE`(maxSdk 32)만 쓰며 영향 없다. 카메라(`CAMERA`)는 정책 대상이
  아니라 유지.
- **확인 방법**: 네이티브 폴더 없이도 아래로 병합 결과를 볼 수 있다. `[remove]` 로 표시된
  다섯 권한 외에 `READ_MEDIA_*` 가 없어야 한다.

```bash
cd frontend && npx expo config --type introspect --json > /tmp/i.json
```

### 9-2. Android 개발자 인증 (마감 2026-09-30) — 조치 불필요

Play 가 "Android 개발자 인증 요구사항: 앱과 서명 키 등록" 최종 알림(2026-09-04)을 보냈지만,
**우리는 이미 끝나 있다.** Play Console → Android 개발자 인증 → 패키지 이름 탭에서
`com.doubly.app` 이 "등록됨"(키 3개, 2026-08-05 갱신)으로 확인됐다(2026-09-10). Play 앱은
Play 앱 서명 키로 자동 등록되며, "패키지 이름 등록" 버튼은 Play 밖에서 배포하는 앱이나
Play 밖에서 서명하는 추가 키를 넣을 때만 쓴다. 상태가 "등록됨"이면 아무것도 누르지 않는다.
알림은 계정 전체에 일괄 발송된 것이라 매 분기 다시 올 수 있다 — 그때마다 이 탭만 확인한다.

## 10. Play 스토어 제출 (Android) — 2026-09-10 배선

iOS 는 `submit-ios.yaml` 워크플로로 자동 제출되지만 **안드로이드는 EAS 제출 이력이 0건**이었다
(최근 제출 20건이 전부 iOS). `eas.json` 의 `submit.production` 에 `ios` 블록만 있었기 때문이다.
아래는 그 구멍을 메운 설정과, 한 번만 하면 되는 키 발급 절차다.

### 10-1. Play 서비스 계정 키 발급 (최초 1회, 사람이 직접)

Google 계정 자격증명이라 자동화하지 않는다.

**Play Console 의 "API 액세스" 에서 시작하지 않는다.** 개발자 계정 → 기본설정에는 그런 항목이 없다
(2026-09-10 확인). 현재 Expo 공식 절차는 **Google Cloud 에서 서비스 계정을 먼저 만들고, Play Console
에서는 그 계정을 "사용자 및 권한" 으로 초대**하는 순서다(https://expo.fyi/creating-google-service-account).

Google Cloud Console (console.cloud.google.com):

1. 프로젝트 선택(없으면 새로 만들기)
2. **IAM 및 관리자 → 서비스 계정 → 서비스 계정 만들기**
   (이름 예: `eas-submit`. GCP 역할(Role)은 부여하지 않아도 된다 — 권한은 Play Console 에서 준다)
3. 만든 서비스 계정 클릭 → **키 → 키 추가 → 새 키 만들기 → JSON** → 다운로드
4. **Google Play Android Developer API 사용 설정** — 이걸 빼먹으면 제출이 403 으로 막힌다
   https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com

Play Console:

5. **사용자 및 권한 → 새 사용자 초대**
6. 이메일에 서비스 계정 주소(`eas-submit@<프로젝트>.iam.gserviceaccount.com`)를 붙여넣는다
7. 권한 — 앱 액세스에서 **Dubly(`com.doubly.app`) 만** 선택하고, 계정 전체 권한은 주지 않는다.
   개별 권한을 고른다면 앱 정보 보기(읽기 전용) / 임시 앱 수정·삭제 / 출시(Releases) 섹션의
   출시 관련 권한 3개 / 스토어 등록정보 관리. 앱 단위 **릴리스 관리자** 역할을 주면 한 번에 덮인다
8. **사용자 초대** 로 마무리
9. 받은 JSON 을 **`secrets/play-service-account.json`** 으로 저장한다
   (저장소 루트의 `secrets/` 는 `.gitignore`·`.easignore` 양쪽에서 제외돼 있다. 절대 커밋 금지)

### 10-2. eas.json 배선

```jsonc
"submit": {
  "production": {
    "android": {
      "serviceAccountKeyPath": "../secrets/play-service-account.json",
      "track": "production",            // 실사용자 트랙. 내부 테스트로 먼저 보려면 "internal"
      "releaseStatus": "completed",
      "changesNotSentForReview": false
    }
  }
}
```

**`track` 이 `production` 인 이유**: 이 저장소의 안드로이드 제출은 실사용자 트랙에 올리는 것이
목적이다(2026-09-10 결정). 되돌릴 일이 생기면 Play Console 에서 이전 버전을 다시 출시해야 하므로,
제출 전에 어떤 versionCode 가 올라가는지 확인한다. 내부 테스트로 먼저 보고 싶으면 이 값을
`internal` 로 바꿔 제출한 뒤 콘솔에서 프로덕션으로 승격한다.

**제출 전 현재 트랙 상태 확인**은 `scripts/check-play-track.mjs` 로 한다(서비스 계정 키로
androidpublisher 에 붙어 트랙별 versionCode 를 읽고 흔적 없이 정리한다).

### 10-3. 제출

```bash
npm run submit:android        # 안드로이드만 (npx eas-cli submit --platform android --profile production --latest)
npm run submit:store          # iOS + 안드로이드 한 번에
```

`--latest` 는 가장 최근 성공 빌드를 올린다. 특정 빌드를 지정하려면 `--id <build-id>`.
`eas build --auto-submit` 으로 빌드 직후 제출도 가능하지만, 빌드가 자주 깨지는 동안에는
빌드와 제출을 분리해 두는 편이 낫다.

- **첫 제출 시 앱이 Play Console 에 이미 등록돼 있어야 한다.** 최초 1개 AAB 업로드는 콘솔에서
  수동으로 해야 하며, 그 이후부터 API 제출이 열린다.
- 제출 이력은 `npx eas-cli status` 의 Submissions 항목에서 확인한다.

## 11. 업로드 아카이브 줄이기 — `.easignore` (2026-09-17)

빌드마다 CLI 가 이런 경고를 냈다.

> Your project archive is 1.3 GB. You can reduce its size … in `.easignore` file.

업로드에만 48초가 걸렸고, 이 계정은 이미 포함 크레딧을 44 빌드 초과해 **빌드 건당 과금** 중이라
아카이브를 줄이는 게 실질 이득이었다. 정리 후 **1.3 GB → 108 MB** (원본 2367 MB → 182 MB,
여기에 `.git` 113 MB 제거). 경고 임계값(150 MiB) 아래라 경고 자체가 사라진다.

### 11-1. 아카이브에 실제로 뭐가 들어가는가

eas-cli 24.7.0 의 `vcs/clients/git.js` · `vcs/local.js` 를 읽고 확인한 순서다. 추측하지 말 것 —
문서에 안 적힌 동작이 세 개나 있다.

1. **아카이브 루트는 `git rev-parse --show-toplevel`**, 즉 `frontend/` 가 아니라 **저장소 루트**다.
   모노레포 전체가 올라간다. 따라서 `.easignore` 도 저장소 루트에만 둔다 —
   **`frontend/.easignore` 는 아예 읽히지 않는다.**
2. `git clone --depth 1 --no-checkout file:///<루트>` 로 껍데기를 만든다. 여기서 생긴
   **`.git` 이 113 MB** 이고 그대로 아카이브에 들어간다.
3. 그다음 `git ls-files --exclude-from .easignore --ignored --cached` 로 지울 파일을 고르는데,
   `--no-checkout` 이라 **인덱스가 비어 있어 이 단계는 아무것도 지우지 않는다**
   (`git -C <clone> ls-files --cached | wc -l` → 0). 즉 `.easignore` 가 실제로 일하는 곳은 4번뿐이다.
4. `fs.cp(루트, 클론, { filter })` 로 **워킹 디렉터리를 통째로** 덮어쓴다. 커밋 여부와 무관하게
   지금 디스크에 있는 파일이 올라간다는 뜻이다. 필터는
   기본 규칙(`.git`, `node_modules` — 둘 다 모든 깊이) + `.easignore` 뿐이고,
   **`.gitignore` 도 `.git/info/exclude` 도 읽지 않는다.**
5. `.git` 은 예외적으로 "`.easignore` 에 `.git` 이 적혀 있을 때만" 지운다.
6. tar.gz 로 압축. 150 MiB 초과 시 경고, **2 GiB 초과 시 빌드 실패**.

4번이 이 작업의 핵심이다. `.easignore` 가 생긴 순간 `.gitignore` 의 보호가 전부 사라지므로,
**`.gitignore`·`.git/info/exclude` 로 가려 두었던 것을 `.easignore` 에 다시 적어야 한다.**
안 적으면 아카이브가 오히려 커진다.

### 11-2. 2367 MB 의 내역 (정리 전)

| 크기 | 경로 | 왜 들어갔나 |
| --- | --- | --- |
| 1012 MB | `frontend/modules/korean-spell/android/{build,.cxx}` | `frontend/.gitignore` 가 막고 있었지만 `.easignore` 모드에선 무효 |
| 627 MB | `.claude/worktrees/` | `.git/info/exclude` 로만 가려져 있었다. 다른 세션 워크트리마다 `frontend/android/`·`modules/` 산출물이 통째로 딸려 온다 |
| 385 MB | `frontend/doubly-main.apk`, `doubly-main2.apk` | `*.apk` 는 `.gitignore` 에만 있었다 |
| 185 MB | `frontend/build/` (내려받은 AAB) | 〃 |
| 93 MB | `frontend/dist/` (웹 export) | 〃 |
| 44 MB | `scripts/couple-emoji-experiment/{out,photos}` | 〃 — **실제 얼굴 사진이 외부로 업로드되고 있었다** |
| 113 MB | 얕은 클론의 `.git` | `.easignore` 에 `.git` 이 없으면 항상 포함 |

### 11-3. 앵커(`/`)를 빼먹으면 빌드가 깨진다

`.easignore` 는 gitignore 문법이라 **슬래시가 안 들어간 패턴은 모든 깊이에서 걸린다.**

| 패턴 | `scripts/a.mjs` | `frontend/scripts/build.mjs` |
| --- | --- | --- |
| `scripts/` | 제외 | **제외 (빌드에 필요한데 사라진다)** |
| `/scripts/` | 제외 | 포함 |

`store/` 도 마찬가지로 `frontend/src/store/`(Zustand 스토어 전부)를 지운다. 루트 전용으로 뺄
디렉터리는 반드시 `/store/` 처럼 앵커를 붙인다. 반대로 `.claude/`·`*.apk`·`.git` 은 모든 깊이에서
걸려야 하므로 앵커를 붙이지 않는다.

### 11-4. 런타임 버전(fingerprint)은 바뀌지 않는다

`modules/korean-spell` 은 fingerprint 소스다(8-5, 트러블슈팅의 줄바꿈 항목 참고). 여기서 뭘 빼면
서버 해시가 로컬과 어긋나 `Runtime version calculated on local machine not equal…` 로 빌드가
죽는다. 그런데 `@expo/fingerprint` 의 `DEFAULT_IGNORE_PATHS`(build/Options.js)가
`**/android/build/**/*` · `**/android/.cxx/**/*` · `**/android/.gradle/**/*` 을 이미 무시하므로
이번에 뺀 것들은 애초에 해시에 안 들어간다. 실제로 확인했다 — 제외 후보를 `ignorePaths` 에
추가해도 해시가 `ce811a6e…` 로 동일했다.

**절대 빼면 안 되는 것** (전부 fingerprint 소스이거나 빌드 입력이다):
`frontend/.gitignore`(!), `frontend/eas.json`, `app.json`·`app.config.js`, `google-services.json`,
`frontend/assets/`(폰트·아이콘), `frontend/package-lock.json`,
`modules/korean-spell/` 의 `cpp/`·`dict/`·`kiwi-model/`·`android/src/`(jniLibs 의 `libkiwi.so` 71 MB 포함).
남은 182 MB 중 168 MB 가 이 네이티브 모듈 소스다 — 더 줄이려면 여기를 손대야 하는데,
그건 빌드 입력이라 아카이브 문제가 아니다.

### 11-5. 다시 재는 법 — 빌드를 돌리지 않고

`eas build` 에 `--dry-run` 은 **없다**(`--local`, `--clear-cache` 등만 있다). 확인하려고 빌드를
돌리면 그대로 과금된다. 대신 CLI 와 같은 규칙으로 로컬에서 재현한다.

```bash
# eas-cli 의 ignore/tar 를 그대로 빌려 쓴다 (npx 캐시 경로는 환경마다 다르다)
EAS=$(ls -d "$LOCALAPPDATA"/npm-cache/_npx/*/node_modules/eas-cli | tail -1)
```

```js
// sim.js — 아카이브에 들어갈 파일과 크기를 계산한다. node sim.js <저장소루트> <.easignore 경로>
const fs = require('fs'), path = require('path');
const ignore = require('<EAS>/../ignore');           // eas-cli 옆의 ignore 패키지
const [root, easignore] = process.argv.slice(2);
const rules = [ignore().add('\n.git\nnode_modules\n'), ignore().add(fs.readFileSync(easignore, 'utf-8'))];
const ignores = (rel) => rules.some((r) => r.ignores(rel));
let total = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name), rel = path.relative(root, full);
    if (ignores(rel) || e.isSymbolicLink()) continue;   // fs.cp 필터와 같다 — 디렉터리면 하위까지 통째로
    if (e.isDirectory()) walk(full); else total += fs.statSync(full).size;
  }
})(root);
console.log((total / 1024 / 1024).toFixed(1), 'MB');
```

압축 후 크기까지 보려면 같은 필터로 `fs.cp` 한 뒤 `tar.create({ gzip: true, portable: true, prefix: 'project' })`
를 돌린다 — 이게 CLI 가 "Compressed project files" 로 출력하는 값이다. 이 절차로 잰 값이 108.2 MB 였다.

추적 파일 중 빠지는 게 없는지는 `git ls-files` 결과를 같은 필터에 통과시켜 대조한다.
정리 후 `frontend/` 아래 추적 파일은 **하나도 빠지지 않았다**(빠진 것은 backend·docs·store·scripts·.claude 뿐).

## 트러블슈팅

| 증상 | 원인 / 해결 |
| --- | --- |
| `eas.json` 관련 스키마 오류 | `npx eas-cli --version` 으로 최신 CLI인지 확인 후 재시도 |
| 빌드 실패 (네이티브 모듈 오류) | Expo 대시보드의 빌드 로그 확인 — 대부분 `app.json` plugin 설정 누락이 원인 |
| 설치 후 앱이 흰 화면 | 최신 코드로 다시 빌드했는지 확인 (오래된 APK 캐시일 수 있음) — 설정 화면 하단의 커밋 해시로 판별, 6-1 참고 |
| Configure expo-updates 단계에서 `Runtime version calculated on local machine not equal…` | 로컬·서버 fingerprint 불일치 — 8-5 참고. ① `npm install` 로 node_modules 를 lock 과 맞추고 ② `fingerprint.config.js` 가 있는지, ③ 두 번 돌려 같은 해시가 나오는지 확인. 빌드 로그의 "Difference between local and EAS fingerprints" 가 정확한 범인을 알려준다 |
| `eas update` 가 기존 빌드에 배달되지 않음 / `eas fingerprint:compare --build-id <id>` 가 `modules/korean-spell` 만 다르다고 함 | **줄바꿈 차이**(2026-09-10). EAS 는 git 이 아니라 로컬 파일을 그대로 올리므로 fingerprint 는 워크트리의 CRLF/LF 상태를 따른다. 주 워크트리는 `*.sh eol=lf` 규칙(9/9) 이전에 체크아웃된 파일이 CRLF 로 남아 있고, 새로 만든 워크트리는 LF 라 같은 커밋인데도 iOS 해시가 달랐다(`scripts/check-elf-align.mjs` 한 파일). 업데이트는 **빌드를 올린 워크트리와 같은 줄바꿈 상태**에서 올려야 한다 — `git ls-files --eol frontend/modules/korean-spell` 로 두 워크트리를 비교하면 범인이 나온다. 다음 빌드부터는 어느 쪽이든 그 상태가 기준이 된다 |
| 빌드 로그에 로컬엔 있는 파일이 "없다"고 나옴 / 아카이브가 갑자기 커지거나 작아짐 | 루트 `.easignore` 를 본다. `.easignore` 가 있으면 `.gitignore` 는 전혀 안 읽히고, 슬래시 없는 패턴은 모든 깊이에서 걸린다(`scripts/` 가 `frontend/scripts/` 까지 지운다). 11절 참고 — 크기는 빌드를 돌리지 않고 11-5 로 잰다 |
| "출처를 알 수 없는 앱" 이 계속 막힘 | 설정 → 보안 → 해당 브라우저/파일관리자 앱의 "알 수 없는 앱 설치" 권한 허용 |

## 다음 단계
- iOS는 Apple 개발자 계정($99/년)이 있어야 ad-hoc/TestFlight 배포가 가능합니다. 준비되면
  `npx eas-cli build --platform ios --profile preview` 로 동일하게 진행합니다.
- 정식 출시 시에는 `production` 프로필로 빌드해 `npx eas-cli submit` 으로 스토어에 제출합니다.

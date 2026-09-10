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
[EAS Update](https://docs.expo.dev/eas-update/introduction/)로 앱을 재설치하지 않고 갱신할 수도
있습니다(다음 단계에서 필요 시 별도 가이드 추가).

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

## 8. Google Play 정책·계정 요구사항

### 8-1. Play 정책: 사진 선택 도구 (2026-09)

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

### 8-2. Android 개발자 인증 (마감 2026-09-30)

Play 가 "Android 개발자 인증 요구사항: 앱과 서명 키 등록" 최종 알림을 보냈다. 코드 작업이
아니라 Play Console 에서 계정 소유자가 직접 해야 한다 — **2026-09-30 까지** Play Console →
개발자 인증(Android Developer Verification) 에서 `com.doubly.app` 과 업로드 서명 키를
등록한다. 넘기면 신규 설치·업데이트 배포가 막힌다.

## 트러블슈팅

| 증상 | 원인 / 해결 |
| --- | --- |
| `eas.json` 관련 스키마 오류 | `npx eas-cli --version` 으로 최신 CLI인지 확인 후 재시도 |
| 빌드 실패 (네이티브 모듈 오류) | Expo 대시보드의 빌드 로그 확인 — 대부분 `app.json` plugin 설정 누락이 원인 |
| 설치 후 앱이 흰 화면 | 최신 코드로 다시 빌드했는지 확인 (오래된 APK 캐시일 수 있음) — 설정 화면 하단의 커밋 해시로 판별, 6-1 참고 |
| "출처를 알 수 없는 앱" 이 계속 막힘 | 설정 → 보안 → 해당 브라우저/파일관리자 앱의 "알 수 없는 앱 설치" 권한 허용 |

## 다음 단계
- iOS는 Apple 개발자 계정($99/년)이 있어야 ad-hoc/TestFlight 배포가 가능합니다. 준비되면
  `npx eas-cli build --platform ios --profile preview` 로 동일하게 진행합니다.
- 정식 출시 시에는 `production` 프로필로 빌드해 `npx eas-cli submit` 으로 스토어에 제출합니다.

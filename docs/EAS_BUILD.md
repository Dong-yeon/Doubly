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
3. 홈 화면에 Fitto 아이콘 생성 → 실행

이후에는 Expo Go 앱이나 QR 스캔 없이, 일반 앱처럼 아이콘을 눌러 실행합니다.

## 6. 앱 업데이트 시

코드를 수정한 뒤 다시 테스트하려면 3단계는 건너뛰고 4~5단계만 반복하면 됩니다:

```bash
npx eas-cli build --platform android --profile preview
```

작은 JS/UI 변경만 있고 네이티브 설정(권한, 아이콘 등) 변경이 없다면, 매번 새로 빌드하는 대신
[EAS Update](https://docs.expo.dev/eas-update/introduction/)로 앱을 재설치하지 않고 갱신할 수도
있습니다(다음 단계에서 필요 시 별도 가이드 추가).

## 트러블슈팅

| 증상 | 원인 / 해결 |
| --- | --- |
| `eas.json` 관련 스키마 오류 | `npx eas-cli --version` 으로 최신 CLI인지 확인 후 재시도 |
| 빌드 실패 (네이티브 모듈 오류) | Expo 대시보드의 빌드 로그 확인 — 대부분 `app.json` plugin 설정 누락이 원인 |
| 설치 후 앱이 흰 화면 | 최신 코드로 다시 빌드했는지 확인 (오래된 APK 캐시일 수 있음) |
| "출처를 알 수 없는 앱" 이 계속 막힘 | 설정 → 보안 → 해당 브라우저/파일관리자 앱의 "알 수 없는 앱 설치" 권한 허용 |

## 다음 단계
- iOS는 Apple 개발자 계정($99/년)이 있어야 ad-hoc/TestFlight 배포가 가능합니다. 준비되면
  `npx eas-cli build --platform ios --profile preview` 로 동일하게 진행합니다.
- 정식 출시 시에는 `production` 프로필로 빌드해 `npx eas-cli submit` 으로 스토어에 제출합니다.

# 폰트 (Pretendard)

이 폴더에 **Pretendard OTF 3종**을 넣어야 앱에 프리미엄 폰트가 적용됩니다.
파일이 없으면 시스템 폰트로 자연 폴백되어 앱은 정상 동작합니다.

## 넣어야 할 파일 (파일명 정확히 일치해야 함)

```
assets/fonts/Pretendard-Regular.otf
assets/fonts/Pretendard-Medium.otf
assets/fonts/Pretendard-SemiBold.otf
```

## 복사 방법 (로컬 PC에서)

내려받은 `Pretendard-1.3.9` 안의 `public/static/` (또는 `static/`) 폴더에서
위 3개 파일을 이 폴더로 복사하세요. 예 (Windows PowerShell):

```powershell
copy "C:\Users\happy\Downloads\Pretendard-1.3.9\public\static\Pretendard-Regular.otf" frontend\assets\fonts\
copy "C:\Users\happy\Downloads\Pretendard-1.3.9\public\static\Pretendard-Medium.otf" frontend\assets\fonts\
copy "C:\Users\happy\Downloads\Pretendard-1.3.9\public\static\Pretendard-SemiBold.otf" frontend\assets\fonts\
```

> 파일이 `.ttf` 라면 확장자에 맞춰 `app.json` 의 `expo-font` 플러그인 경로도 `.ttf` 로 바꿔주세요.

## 적용 방식

- `app.json` 의 `expo-font` 플러그인에 등록되어 있어, **네이티브/EAS 빌드 시 자동 임베드**됩니다.
- 폰트 반영을 보려면 파일을 넣은 뒤 EAS 빌드(또는 dev client)를 다시 하세요:
  `npx eas-cli build --platform android --profile preview`
- Expo Go / 웹 개발 모드에서는 임베드가 되지 않아 시스템 폰트로 보일 수 있습니다(정상).

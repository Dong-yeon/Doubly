# 폰트 (Pretendard)

앱 전역에 쓰는 **Pretendard OTF 3종**이 이 폴더에 포함되어 있습니다.

```
assets/fonts/Pretendard-Regular.otf
assets/fonts/Pretendard-Medium.otf
assets/fonts/Pretendard-SemiBold.otf
```

- `app.json` 의 `expo-font` 플러그인에 등록되어 있어 **네이티브/EAS 빌드 시 자동 임베드**됩니다.
  플러그인이 참조하는 파일이라 **삭제하면 EAS prebuild 가 실패**합니다 (파일을 빼려면
  `app.json` 의 `expo-font` 항목도 함께 제거해야 합니다).
- Expo Go / 웹 개발 모드에서는 임베드가 되지 않아 시스템 폰트로 보일 수 있습니다(정상).

## 라이선스

Pretendard 는 [SIL Open Font License 1.1](https://github.com/orioncactus/pretendard/blob/main/LICENSE)
로 배포됩니다 — 앱 임베드·저장소 포함·상업적 사용 모두 허용됩니다.
출처: https://github.com/orioncactus/pretendard (v1.3.x static OTF)

## 버전 올릴 때

새 버전의 `public/static/` 폴더에서 같은 파일명 3종을 이 폴더에 덮어쓰면 됩니다.

# 스토어 이미지 (Google Play · App Store)

> **스크린샷은 실제 앱 화면이어야 한다.** 양 스토어 모두 심사 기준이고, 앱과 다른 목업을 올리면
> 반려 사유다. 그래서 여기 있는 것은 **캡처를 얹을 배경판**이지 화면 그림이 아니다.
> 캡처는 폰에서 직접 찍는다.

`frontend/` 밖에 둔 이유: `frontend/assets/` 아래 파일은 EAS fingerprint 입력에 섞일 수 있고,
그러면 JS 만 바뀐 배포에도 빌드가 한 번 더 강제된다(`docs/OTA_PREFLIGHT_2026-09-14.md` 2절이
아이콘·폰트에서 실제로 겪은 일이다). 스토어 자산은 앱 번들과 무관하므로 저장소 루트에 둔다.

## 무엇이 들어 있나

| 파일 | 설명 |
| --- | --- |
| `feature_graphic.png` | Play 피처 그래픽 **1024×500**. 2026-09-15 에 A 안으로 확정 |
| `plates/<크기>_<번호>.png` | 캡션 배경판 — 캡처 자리가 **투명하게 뚫려** 있다 |
| `make_plates.py` | 배경판·피처 그래픽 생성기 (문구·크기를 여기서 고친다) |
| `compose.py` | 캡처 + 배경판 → 올릴 이미지 |
| `mascot.png` | 앱 아이콘에서 흰 배경을 지운 마스코트 |

크기는 넷이다. iOS 는 `supportsTablet: false` 라 **iPad 규격이 필요 없다**.

| 키 | 크기 | 쓰는 곳 |
| --- | --- | --- |
| `play-phone` | 1080×1920 | Google Play 휴대전화 |
| `play-tablet7` | 1200×1920 | Google Play 7인치 태블릿 |
| `ios-6.7` | 1290×2796 | App Store iPhone 6.7" |
| `ios-6.9` | 1320×2868 | App Store iPhone 6.9" |

문구 5개는 온보딩 4축과 같은 줄기로 맞췄다 — 사진 기록 / 우리 이모지 / 같이 놀기 / 럽슐랭 / 스트릭
(`docs/ONBOARDING_AND_STORE_ASSETS_2026-09-14.md` 4절의 마지막 체크 항목).

## 쓰는 법

1. 폰에서 화면 5장을 찍어 한 폴더에 넣는다. **파일 이름순이 문구 순서(01~05)** 가 된다.
2. 합성한다.

```bash
python3 store/compose.py ~/shots                    # 네 크기 전부
python3 store/compose.py ~/shots --size play-phone  # 하나만
```

결과는 `store/out/<크기>/` 에 떨어진다(이 폴더는 커밋하지 않는다 — 캡처는 사람마다 다르다).

캡처 비율은 달라도 된다 — 자리에 맞춰 가운데를 채우도록 잘라 넣는다. 상태바가 찍혀 있어도
괜찮고, 오히려 실제 화면이라는 근거가 된다.

### 문구·크기를 바꾸려면

`make_plates.py` 의 `CAPTIONS` · `SIZES` 를 고치고 다시 돌린다.

```bash
python3 store/make_plates.py
```

필요한 건 Pillow 하나뿐이다(`pip install pillow`). 브라우저도, 이 작업 환경도 필요 없다.

## 남은 일 (사람이 해야 하는 것)

- [ ] 폰 스크린샷 촬영 — **새 탭바(홈·럽바디·채팅·우리·럽슐랭) 기준**
- [ ] Play Console · App Store Connect 에 올리기 (저장소에는 업로드 이력이 없다)
- [ ] 현재 올라가 있는 스크린샷이 언제 것인지 확인 (아이콘 교체 반영 여부 포함)
- [ ] 스토어 설명 문구도 위 5축과 같게 맞추기
